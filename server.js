// node-sqlite3 API:
// https://github.com/mapbox/node-sqlite3/wiki/API
import express from 'express';
import path from 'path'
import fs from 'fs';
import bodyParser from 'body-parser';
import sqlite3 from 'sqlite3';
import crc from 'crc';
import crypto from 'crypto';
import ejs from 'ejs';

// Load the model so we can validate projects
import * as model from './public/model.js';

// Initializing application configuration parameters
const dbFilePath = process.env.DB_FILE_PATH || './database.db';
const serverHTTPPortNo = process.env.HTTP_PORT_NO  || 7773;

var app = express();

// Create application/json parser
var jsonParser = bodyParser.json({limit: '1mb'});

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
let db = await connectDb(dbFilePath);

// Setup the database tables
db.run(`CREATE table IF NOT EXISTS hits (
    time UNSIGNED BIGINT,
    ip STRING NOT NULL);`
);
db.run(`CREATE table IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    title TEXT NOT NULL,
    data BLOB,
    crc32 UNSIGNED INT,
    featured UNSIGNED INT DEFAULT 0,
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
    reg_ip STRING NOT NULL,
    access STRING NOT NULL DEFAULT 'default');`
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

function recordHit(req) {
    db.run(
        'INSERT INTO hits VALUES (?, ?);',
        Date.now(),
        getClientIP(req)
    );
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

// Lookup a user by username
async function lookupUser(username)
{
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT id, pwd_hash, pwd_salt, access FROM users WHERE username == ?;',
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
                    resolve(row);
                }
            }
        );
    });
}

// Create a new session
async function createSession(userId, sessionId, loginTime, loginIP)
{
    return new Promise((resolve, reject) =>
    {
        // Serialize the commands
        db.serialize(() =>
        {
            // Delete previous sessions for this user id
            db.run(
                'DELETE FROM sessions WHERE user_id == ?;',
                [userId]
            );

            // Insert the new session into the table
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
        })
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

// Get the access level for a given user
async function getAccess(userId)
{
    return new Promise((resolve, reject) =>
    {
        db.get(
            'SELECT access FROM users WHERE id == ?',
            [userId],
            function (err, row)
            {
                if (err || !row)
                {
                    reject('userId not found');
                    return;
                }

                resolve(row.access);
            }
        );
    });
}

// Check that a user has sufficient access
async function checkAccess(userId, sessionId, access)
{
    // Check that the session is valid
    await checkSession(userId, sessionId);

    // Get the access level for this userId
    let userAccess = await getAccess(userId);

    // Verify that the user has sufficient access
    switch (access)
    {
        case 'admin':
        return (userAccess == 'admin');

        default:
        throw TypeError('invalid access level:', access);
    }
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
            '(user_id, title, data, crc32, featured, submit_time, submit_ip) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?);',
            [userId, title, data, crc32, 0, submitTime, submitIP],
            function (err)
            {
                if (err)
                    return reject('failed to insert project');

                resolve(this.lastID);
            }
        );
    });
}

// Run a query that returns a single row with a value,
// and then extract the value
function getQueryValue(sqlQuery, vars)
{
    if (vars === undefined)
        vars = [];

    return new Promise((resolve, reject) =>
    {
        db.get(
            sqlQuery,
            vars,
            function (err, row)
            {
                if (err || !row)
                {
                    console.log(err);
                    reject('db query failed');
                    return;
                }

                let keys = Object.keys(row);

                if (keys.length > 1)
                {
                    reject('more than 1 output column');
                    return;
                }

                resolve(row[keys[0]]);
            }
        );
    });
}

//============================================================================

// Serve static file requests
app.use('/public', express.static('public'));

// Compile the index page EJS template
const indexTemplate = ejs.compile(
    fs.readFileSync(path.resolve('public/index.html'), 'utf8')
);

// Main (index) page
app.get('/', function(req, res)
{
    recordHit(req);

    let html = indexTemplate({ pageTitle: 'NoiseCraft'});
    res.setHeader('content-type', 'text/html');
    res.send(html);
});

// Serve projects with numerical ids
app.get('/:projectId([0-9]+)', async function(req, res)
{
    let projectId = parseInt(req.params.projectId);

    // The projectId must be a positive integer
    if (isNaN(projectId) || projectId < 1)
        return res.sendStatus(400);

    recordHit(req);

    // Set the title tag in the HTML data based on the project title
    // We do this so the project title can show up in webpage previews
    // e.g. links on social media
    let title = await getTitle(projectId)
        .catch(err =>{
            console.error(err);
        });

    let html = indexTemplate({ pageTitle: `${title} - NoiseCraft`});
    res.setHeader('content-type', 'text/html');
    res.send(html);
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

// Compile the stats page EJS template
const statsTemplate = ejs.compile(
    fs.readFileSync(path.resolve('public/stats.html'), 'utf8')
);

app.get('/stats', async function (req, res)
{
    // Find the median value in a list of numbers
    function median(numList)
    {
        function compareFn(a, b)
        {
            if (a < b)
                return -1;
            else if (b > a)
                return 1;
            return 0;
        }

        let sortedNums = [...numList].sort(compareFn);
        return sortedNums[Math.floor(sortedNums.length/2)];
    }

    // Get the current timestamp
    let timeStamp = Date.now();

    // Get the timestamp at the last midnight in the local time zone
    let date = new Date();
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);
    let lastMidnight = date.getTime()

    const DAY_IN_MS = 1000 * 3600 * 24;
    let NUM_DAYS = 40;
    let dayCounts = [];
    let dayStart = lastMidnight;

    console.log('seconds since midnight: ', (timeStamp - lastMidnight) / 1000);

    // For each day
    for (let i = 0; i < NUM_DAYS; ++i)
    {
        let dayEnd = dayStart + DAY_IN_MS;

        let dayCount = await getQueryValue(
            'SELECT COUNT(DISTINCT ip) FROM (SELECT * FROM hits WHERE time >= ? AND time <= ?)',
            [dayStart, dayEnd]
        )

        dayCounts.push(dayCount);

        // Move to the previous day
        dayStart -= DAY_IN_MS;
    }

    dayCounts.reverse();
    let daysExceptLast = dayCounts.slice(0, dayCounts.length - 1);
    let maxDayCount = Math.max(...dayCounts);
    let minDayCount = Math.min(...daysExceptLast);
    let medDayCount = median(dayCounts);
    let lastDayCount = dayCounts[dayCounts.length-1];
    dayCounts = dayCounts.map(count => count / maxDayCount);

    // Compute the number of unique hits in the last hour
    let uniqueHour = await getQueryValue(
        'SELECT COUNT(DISTINCT ip) FROM (SELECT * FROM hits WHERE time >= ?)',
        [timeStamp - 3600 * 1000]
    );

    // Compute the number of days since the first project was uploaded
    let minTime = await getQueryValue('SELECT MIN(time) from hits');
    let numDays = Math.floor((timeStamp - minTime) / (1000 * 3600 * 24));

    // Get various stats
    let totalHits = await getQueryValue('SELECT COUNT(*) FROM hits');
    let projectCount = await getQueryValue('SELECT COUNT(*) FROM projects');
    let userCount = await getQueryValue('SELECT COUNT(*) FROM users');
    let emailCount = await getQueryValue('SELECT COUNT(*) as count FROM (SELECT * FROM users WHERE email != "")');

    let html = statsTemplate({
        dayCounts: dayCounts,
        maxDayCount: maxDayCount,
        minDayCount: minDayCount,
        medDayCount: medDayCount,
        lastDayCount: lastDayCount,
        uniqueHour: uniqueHour,
        numDays: numDays,
        totalHits: totalHits,
        projectCount: projectCount,
        userCount: userCount,
        emailCount: emailCount,
    });

    res.setHeader('content-type', 'text/html');
    res.send(html);
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

        // Validate the username, password and email
        model.validateUserName(username);
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
    try
    {
        var username = req.body.username;
        var password = req.body.password;

        // Lookup the user by username
        let {id, pwd_hash, pwd_salt, access} = await lookupUser(username);

        // Check the password
        if (cryptoHash(password + pwd_salt) != pwd_hash)
        {
            console.log('invalid password');
            return res.sendStatus(400);
        }

        // Generate a session id
        let sessionId = cryptoHash(String(Date.now()) + String(Math.random()));

        var loginTime = Date.now();
        var loginIP = getClientIP(req);

        await createSession(id, sessionId, loginTime, loginIP);

        console.log(`login from user "${username}" with access "${access}"`);

        return res.send(JSON.stringify({
            username: username,
            userId: id,
            sessionId: sessionId,
            access: access
        }));
    }

    catch (e)
    {
        console.log('invalid login request');
        console.log(e);
        return res.sendStatus(400);
    }
})

// POST /projects
app.post('/projects', jsonParser, async function (req, res)
{
    try
    {
        var userId = req.body.userId;
        var sessionId = req.body.sessionId;
        var title = req.body.title;
        var data = req.body.data;

        // Validate the title
        if (typeof title != 'string' || title.length == 0 || title.length > model.MAX_TITLE_LENGTH)
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
    let fromIdx = req.params.from;
    let featured = !!req.query.featured;

    let sqlStr = (
        'SELECT projects.id, projects.title, projects.user_id, projects.submit_time, projects.featured, users.username FROM projects ' +
        'LEFT JOIN users ON projects.user_id = users.id ' +
        (featured? 'WHERE projects.featured == 1 ':'') +
        'ORDER BY submit_time DESC LIMIT ?,40;'
    );

    db.all(
        sqlStr,
        [fromIdx],
        function (err, rows)
        {
            if (err)
            {
                console.log(err);
                return res.sendStatus(400);
            }

            let jsonStr = JSON.stringify(rows);
            res.setHeader('Content-Type', 'application/json');
            res.send(jsonStr);
        }
    );
})

// POST /featured - set the featured flag for a project
app.post('/featured/:id', jsonParser, async function (req, res)
{
    let projectId = req.params.id;
    let userId = req.body.userId;
    let sessionId = req.body.sessionId;
    let featured = req.body.featured;

    // Check that the user has admin access
    await checkAccess(userId, sessionId, 'admin');

    if (isNaN(projectId) || projectId < 1)
        return res.sendStatus(400);

    featured = Boolean(featured)? 1:0;

    db.run(
        `UPDATE projects SET featured = ? WHERE id == ?;`,
        [featured, projectId],
        function (err, rows)
        {
            if (err)
            {
                console.log(err);
                return res.sendStatus(400);
            }

            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(featured));
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

// DELETE /projects
app.delete('/projects', async function (req, res)
{
    try
    {
        var projectId = req.params.id;
        var userId = req.body.userId;
        var sessionId = req.body.sessionId;

        // Check that the user has admin access
        await checkAccess(userId, sessionId, 'admin');

        console.log(`delete projectId=${projectId}`);

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

const server = app.listen(serverHTTPPortNo, () =>
{
    let address = server.address().address;
    let port = server.address().port;
    address = (address == "::")? "localhost":address;
    console.log(`app started at ${address}:${port}`);
});
