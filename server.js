// node-sqlite3 API:
// https://github.com/mapbox/node-sqlite3/wiki/API
const express = require('express');
const path = require('path')
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const crc = require('crc');
const crypto = require('crypto');

var app = express();

// Create application/json parser
var jsonParser = bodyParser.json()

// Connect to the database
let db = new sqlite3.Database('./database.db', (err) => {
    if (err)
        throw err;
    console.log('Connected to the database');
});

// Setup tables
db.run(`CREATE table IF NOT EXISTS hits (
    time UNSIGNED BIGINT,
    ip STRING NOT NULL);`
);
db.run(`CREATE table IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    user_id integer,
    title TEXT NOT NULL,
    data BLOB,
    crc32 UNSIGNED INT,
    pinned UNSIGNED INT,
    submit_time BIGINT,
    submit_ip STRING NOT NULL);`
);
db.run(`CREATE table IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT,
    pwd_hash TEXT NOT NULL,
    pwd_salt TEXT NOT NULL,
    reg_time BIGINT,
    reg_ip STRING NOT NULL);`
);
db.run(`CREATE table IF NOT EXISTS sessions (
    user_id INTEGER,
    session_id TEXT NOT NULL,
    login_ip STRING NOT NULL,
    login_time BIGINT);`
);

/// Get the IP address of a client as a string
function getClientIP(req)
{
    var headers = req.headers;

    if ('x-real-ip' in headers)
    {
        return String(headers['x-real-ip']);
    }

    return String(req.connection.remoteAddress);
}

/// Hash a string using SHA512
function cryptoHash(str)
{
    let hash = crypto.createHash('sha512');
    let data = hash.update(str, 'utf-8');
    let hash_str = data.digest('base64');
    return hash_str;
}

/**
Add a new user to the database
Note: this function does not check for duplicates
*/
async function addUser(username, password, email, ip)
{
    // TODO: assert valid characters only, no whitespace at start or end

    let pwd_salt = String(Date.now()) + String(Math.random());
    let pwd_hash = cryptoHash(password + pwd_salt);
    let reg_time = Date.now()

    // Insert the user into the database
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO users ' +
            '(username, email, pwd_hash, pwd_salt, reg_time, reg_ip) ' +
            'VALUES (?, ?, ?, ?, ?, ?);',
            [username, email, pwd_hash, pwd_salt, reg_time, ip],
            function (err)
            {
                if (err)
                {
                    reject(err);
                    return;
                }

                console.log('added new user: "' + username + '"');

                // User id is:
                resolve(this.lastID);
            }
        );
    });
}

/// Check that a session is valid
async function checkSession(userId, sessionId)
{
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT user_id FROM sessions WHERE user_id == ? AND session_id == ?',
            [userId, sessionId],
            function (err, rows)
            {
                if (err)
                    reject();
                else
                    resolve();
            }
        );
    });
}

//============================================================================

// Serve static file requests
app.use('/', express.static('public', {
    // setHeaders is called on success (stat available/file found)
    setHeaders: function(res, path, stat) {
        // count request: full-path, file-stats, client-ip
        updateStats(path, stat, getClientIP(res.req));
    }
}));

// Help page
app.get('/help', function(req, res) {
    res.sendFile(path.join(__dirname, 'public/help.html'));
});

function updateStats(path, stats, clientIP)
{
    if (!path.endsWith('index.html'))
        return;

    db.run(
        'INSERT INTO hits VALUES (?, ?);',
        Date.now(),
        String(clientIP)
    );
}

app.get('/allthestats', function (req, res)
{
    var timestamp = Date.now();
    var oneHourAgo = timestamp - 1000 * 3600;
    var tenMinsAgo = timestamp - 1000 * 10 * 60;

    db.all(
        'SELECT COUNT(*) as count FROM hits ' +
        'UNION ALL ' +
        'SELECT COUNT(*) as count FROM (SELECT * FROM hits WHERE time > ?) ' +
        'UNION ALL ' +
        'SELECT COUNT(*) as count FROM (SELECT * FROM hits WHERE time > ?) ' +
        'UNION ALL ' +
        'SELECT MAX(id) as count from projects ' +
        'UNION ALL ' +
        'SELECT COUNT(*) as count FROM users ' +
        'UNION ALL ' +
        'SELECT COUNT(*) as count FROM (SELECT * FROM users WHERE email != "")',
        [oneHourAgo, tenMinsAgo],
        function (err, rows)
        {
            //console.log(err);
            //console.log(rows);

            var totalCount = rows[0].count;
            var lastHourCount = rows[1].count;
            var tenMinsCount = rows[2].count;
            var trackCount = rows[3].count;
            var userCount = rows[4].count;
            var emailCount = rows[5].count;

            res.send(
                'Last 10 mins: ' + tenMinsCount + '<br>' +
                'Last hour: ' + lastHourCount + '<br>' +
                'Total hit count: ' + totalCount + '<br>' +
                'Projects shared: ' + trackCount + '<br>' +
                'User count: ' + userCount + '<br>' +
                'Email count: ' + emailCount + '<br>'
            );
        }
    );
});

/**
POST /register
Register a new user account
Arguments: username, password, email
*/
app.post('/register', jsonParser, async function (req, res)
{
    /// Check that a username is available
    async function checkAvail(username)
    {
        // Insert the user into the database
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT id FROM users WHERE username == ?',
                [username],
                function (err, rows)
                {
                    if (rows.length == 0)
                        resolve();
                    else
                        reject('username not available "' + username + '"');
                }
            );
        });
    }

    try
    {
        let username = req.body.username;
        let password = req.body.password;
        let email = req.body.email

        if (username == '' || username.trim() !== username || username.length > 16)
            return res.sendStatus(400);
        if (password.length > 64)
            return res.sendStatus(400);
        if (email.length > 64)
            return res.sendStatus(400);

        // Check that the username is available
        await checkAvail(username);

        // Add the new user to the database
        let submitIP = getClientIP(req);
        let userId = await addUser(username, password, email, submitIP);

        return res.send(JSON.stringify({
            userId: userId,
        }));
    }

    catch (e)
    {
        console.log('invalid register request');
        console.log(e);
        return res.sendStatus(400);
    }
})

/**
POST /login
Arguments: username, password
1. Lookup the user by username
2. Check that the password matches
3. Generate a session id and add it to the sessions table
4. Return the user id and session id
*/
app.post('/login', jsonParser, async function (req, res)
{
    async function lookupUser (username)
    {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT id, pwd_hash, pwd_salt FROM users WHERE username == ?;',
                [username],
                function (err, row)
                {
                    // Check that the user exists
                    if (err || !row)
                    {
                        reject('user not found');
                    }
                    else
                    {
                        resolve([row.id, row.pwd_hash, row.pwd_salt]);
                    }
                }
            );
        });
    }

    async function createSession(userId, sessionId, loginTime, loginIP)
    {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO sessions ' +
                '(user_id, session_id, login_ip, login_time) ' +
                'VALUES (?, ?, ?, ?);',
                [userId, sessionId, loginIP, loginTime],
                function (err)
                {
                    if (err)
                        return reject('failed to create session');

                    resolve();
                }
            );
        });
    }

    try
    {
        var username = req.body.username;
        var password = req.body.password;

        let [userId, pwdHash, pwdSalt] = await lookupUser(username);

        // Check the password
        if (cryptoHash(password + pwdSalt) != pwdHash)
        {
            console.log('invalid password');
            return res.sendStatus(400);
        }

        // Generate a session id
        let sessionId = cryptoHash(String(Date.now()) + String(Math.random()));

        var loginTime = Date.now();
        var loginIP = getClientIP(req);

        await createSession(userId, sessionId, loginTime, loginIP);

        return res.send(JSON.stringify({
            userId: userId,
            sessionId: sessionId
        }));
    }

    catch (e)
    {
        console.log('invalid login request');
        console.log(e);
        return res.sendStatus(400);
    }
})

/// POST /share
app.post('/share', jsonParser, async function (req, res)
{
    /// Check for duplicate projects
    async function checkDupes(crc32)
    {
        return new Promise((resolve, reject) => {
            // Check for duplicate CRC32 hash
            db.all(
                'SELECT id FROM projects WHERE crc32 == ?;',
                [crc32],
                function (err, rows)
                {
                    if (err)
                        return reject('duplicate check failed');

                    // Prevent insertion of duplicates
                    if (rows.length > 0)
                        return reject('duplicate project');

                    resolve();
                }
            );
        });
    }

    async function insertProject(userId, title, data, crc32, submitTIme, submitIP)
    {
        return new Promise((resolve, reject) => {
            // Insert the project into the database
            db.run(
                'INSERT INTO projects ' +
                '(user_id, title, data, crc32, pinned, submit_time, submit_ip) ' +
                'VALUES (?, ?, ?, ?, ?, ?, ?);',
                [userId, title, data, crc32, 0, submitTime, submitIP],
                function (err)
                {
                    if (err)
                        return reject();

                    resolve(this.lastID);
                }
            );
        });
    }

    try
    {
        var userId = req.body.userId;
        var sessionId = req.body.sessionId;
        var title = req.body.title;
        var data = req.body.data;

        // Limit the length of the data, max 1MB
        if (data.length > 1000000)
            return res.sendStatus(400);

        // Check that the session is valid
        await checkSession(userId, sessionId);

        // Check for duplicate projects
        var crc32 = crc.crc32(data);
        await checkDupes(crc32);

        var submitTime = Date.now();
        var submitIP = getClientIP(req);

        let projectId = await insertProject(
            userId,
            title,
            data,
            crc32,
            submitTime,
            submitIP
        );

        console.log(
            'submission successful, id: ' + projectId +
            ' (' + data.length + ' bytes)'
        );

        var resData = {
            projectId: projectId
        };

        return res.send(JSON.stringify(resData));
    }

    catch (e)
    {
        console.log('submit request failed');
        console.log(e);
        return res.sendStatus(400);
    }
})

/// GET /browse
app.get('/browse/:from', jsonParser, function (req, res)
{
    var fromIdx = req.params.from;

    db.all(
        'SELECT projects.id, projects.title, projects.user_id, projects.submit_time, users.username from projects ' +
        'LEFT JOIN users ON projects.user_id = users.id ' +
        'ORDER BY submit_time DESC LIMIT ?,30;',
        [fromIdx],
        function (err, rows)
        {
            jsonStr = JSON.stringify(rows);
            res.send(jsonStr);
        }
    );
})

/// GET /get_project
app.get('/get_project/:id', function (req, res)
{
    var projectId = req.params.id;

    db.get(
        'SELECT user_id, title, data FROM projects WHERE id == ?;',
        [projectId],
        function (err, row)
        {
            if (err || !row)
                return res.sendStatus(400);

            res.send(JSON.stringify(row));
        }
    );
})

// GET /del_project
app.get('/del_project', async function (req, res)
{
    try
    {
        var projectId = req.params.id;
        var userId = req.body.userId;
        var sessionId = req.body.sessionId;

        // Check that the session is valid
        await checkSession(userId, sessionId);

        db.run(
            'DELETE FROM projects WHERE id == ?;',
            [projectId]
        );

        return res.send('ok');
    }

    catch (e)
    {
        console.log('delete request failed');
        console.log(e);
        return res.sendStatus(400);
    }
})

//============================================================================

app.listen(7773);
