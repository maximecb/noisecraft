// node-sqlite3 API:
// https://github.com/mapbox/node-sqlite3/wiki/API
import express, {application} from 'express';
import path from 'path'
import fs from 'fs';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import crc from 'crc';
import crypto from 'crypto';

// Load the model so we can validate projects
import * as model from './public/model.js';

// Initializing application configuration parameters
const dbFilePathConfigValue = process.env.DB_FILE_PATH || './database.db';
const serverHTTPPortNoConfigValue = process.env.HTTP_PORT_NO  || 7773;

var app = express();

// Create application/json parser
var jsonParser = bodyParser.json()

// Connect to the database
async function connectDb(dbFilePath)
{
    return new Promise((resolve, reject) => {
        let db = new sqlite3.Database(dbFilePath, (err) =>
        {
            if (err)
                return reject();

            console.log('connected to the database');
            return resolve(db);
        })
    })
}

// Wait until we're connected to the database
let db = await connectDb(dbFilePathConfigValue);

// Setup the database tables
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

// Get the IP address of a client as a string
function getClientIP(req)
{
    var headers = req.headers;

    if ('x-real-ip' in headers)
    {
        return String(headers['x-real-ip']);
    }

    return String(req.connection.remoteAddress);
}

// Hash a string using SHA512
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

// Check that a username is available
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

// Check that a session is valid
async function checkSession(userId, sessionId)
{
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT user_id FROM sessions WHERE user_id == ? AND session_id == ?',
            [userId, sessionId],
            function (err, row)
            {
                if (err || !row)
                {
                    return reject('invalid session');
                }

                resolve();
            }
        );
    });
}

// Get the title for a given projectId
async function getTitle(projectId)
{
    return new Promise((resolve, reject) =>
    {
        db.get(
            'SELECT title FROM projects WHERE id == ?',
            [projectId],
            function (err, row)
            {
                if (err || !row)
                {
                    reject('project not found');
                    return;
                }

                resolve(row.title);
            }
        );
    });
}

// Check for duplicate projects
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

// Insert the project into the database
async function insertProject(userId, title, data, crc32, submitTime, submitIP)
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

//============================================================================

// Serve static file requests
app.use('/public', express.static('public'));

// Main (index) page
app.get('/', function(req, res)
{
    // Record this hit
    db.run(
        'INSERT INTO hits VALUES (?, ?);',
        Date.now(),
        getClientIP(res.req)
    );

    res.sendFile(path.resolve('public/index.html'));
});

// Serve projects with numerical ids
app.get('/:projectId([0-9]+)', async function(req, res)
{
    let projectId = parseInt(req.params.projectId);

    // The projectId must be a positive integer
    if (isNaN(projectId) || projectId < 1)
        return res.sendStatus(400);

    // Record this hit
    db.run(
        'INSERT INTO hits VALUES (?, ?);',
        Date.now(),
        getClientIP(res.req)
    );

    // Get the path of the index file
    const indexPath = path.resolve('public/index.html');

    fs.readFile(indexPath, async function(err, fileData)
    {
        if (err)
        {
            res.sendStatus(404);
            return;
        }

        // Set the title tag in the HTML data based on the project title
        // We do this so the project title can show up in webpage previews
        // e.g. links on social media
        let title = await getTitle(projectId)
            .catch(err =>{
                console.error(err);
            });

        fileData = String(fileData);
        fileData = fileData.replace(/<title>.*<\/title>/, `<title>${title} - NoiseCraft</title>`);

        // Send the HTML response back
        res.setHeader('content-type', 'text/html');
        res.send(fileData);
    });
});

// Help page
app.get('/help', function(req, res)
{
    res.sendFile(path.resolve('public/help.html'));
});

// Browse page
app.get('/browse', function(req, res)
{
    res.sendFile(path.resolve('public/browse.html'));
});

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
    try
    {
        let username = req.body.username;
        let password = req.body.password;
        let email = req.body.email

        // Do some basic validation
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
    async function lookupUser(username)
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

// POST /share
app.post('/projects', jsonParser, async function (req, res)
{
    try
    {
        var userId = req.body.userId;
        var sessionId = req.body.sessionId;
        var title = req.body.title;
        var data = req.body.data;

        // Validate the title
        if (typeof title != 'string' || title.length == 0 || title.length > 50)
            return res.sendStatus(400);

        // Limit the length of the data, max 1MB
        if (data.length > 1_000_000)
            return res.sendStatus(400);

        // Check that the session is valid
        await checkSession(userId, sessionId);

        // Parse and validate the project data
        let project = JSON.parse(data);
        model.validateProject(project);

        // Do some extra validation on the project
        if (project.title != title)
            return res.sendStatus(400);
        if (Object.keys(project.nodes).length == 0)
            return res.sendStatus(400);

        // Reposition the nodes
        model.reposition(project);

        // Re-serialize the project data
        data = JSON.stringify(project);

        // Check for duplicate projects
        var crc32 = crc.crc32(data);
        await checkDupes(crc32);

        var submitTime = Date.now();
        var submitIP = getClientIP(req);

        // Insert the project in the database
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

        res.statusCode = 201;
        res.setHeader('Content-Type', 'application/json');
        return res.send(JSON.stringify(resData));
    }

    catch (e)
    {
        console.log('submit request failed');
        console.log(e);
        return res.sendStatus(400);
    }
})

// GET /list
// List shared projects
app.get('/list/:from', jsonParser, function (req, res)
{
    var fromIdx = req.params.from;

    db.all(
        'SELECT projects.id, projects.title, projects.user_id, projects.submit_time, users.username from projects ' +
        'LEFT JOIN users ON projects.user_id = users.id ' +
        'ORDER BY submit_time DESC LIMIT ?,30;',
        [fromIdx],
        function (err, rows)
        {
            let jsonStr = JSON.stringify(rows);
            res.setHeader('Content-Type', 'application/json');
            res.send(jsonStr);
        }
    );
})

// GET /projects - returns project by ID
app.get('/projects/:id', function (req, res)
{
    let projectId = req.params.id;
    if (isNaN(projectId) || projectId < 1)
        return res.sendStatus(400);

    db.get(
        'SELECT user_id, title, data FROM projects WHERE id == ?;',
        [projectId],
        function (err, row)
        {
            if (err || !row)
                return res.sendStatus(404);

            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(row));
        }
    );
})

/*
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
*/

//============================================================================

const server = app.listen(serverHTTPPortNoConfigValue, () =>
{
    let address = server.address().address;
    let port = server.address().port;
    address = (address == "::")? "localhost":address;
    console.log(`app started at ${address}:${port}`);
});
