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

// Promise wrapper for running database queries
function dbRun(sqlQuery, vars = [])
{
    return new Promise((resolve, reject) => {
        db.run(sqlQuery, vars, function (err)
        {
            if (err)
                return reject(err);
            resolve(this);
        });
    });
}

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

/**
Hash an IP address, keeping only the low 22 bits of the SHA256 digest.
Each hash value is shared by ~1000 IPv4 addresses, so the original address
can't be recovered, but we can still spot many registrations from one address.
*/
function hashIP(ip)
{
    // Normalize IPv4-mapped IPv6 addresses (e.g. ::ffff:1.2.3.4)
    ip = String(ip).replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');

    let digest = crypto.createHash('sha256').update(ip, 'utf-8').digest();
    return digest.readUInt32BE(digest.length - 4) & 0x3FFFFF;
}

// Setup the database tables
await dbRun(`CREATE table IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    title TEXT NOT NULL,
    data BLOB,
    crc32 UNSIGNED INT,
    featured UNSIGNED INT DEFAULT 0,
    submit_time BIGINT);`
);
await dbRun(`CREATE table IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    pwd_hash TEXT NOT NULL,
    pwd_salt TEXT NOT NULL,
    reg_time BIGINT,
    reg_ip_hash STRING NOT NULL,
    access STRING NOT NULL DEFAULT 'default');`
);
await dbRun(`CREATE table IF NOT EXISTS sessions (
    user_id INTEGER,
    session_id TEXT NOT NULL,
    login_time BIGINT);`
);
await dbRun(`CREATE table IF NOT EXISTS plays (
    time UNSIGNED BIGINT NOT NULL,
    project_id INTEGER);`
);

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
async function addUser(username, password, ipHash)
{
    // TODO: assert valid characters only, no whitespace at start or end

    let pwd_salt = String(Date.now()) + String(Math.random());
    let pwd_hash = cryptoHash(password + pwd_salt);
    let reg_time = Date.now()

    // Insert the user into the database
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO users ' +
            '(username, pwd_hash, pwd_salt, reg_time, reg_ip_hash) ' +
            'VALUES (?, ?, ?, ?, ?);',
            [username, pwd_hash, pwd_salt, reg_time, ipHash],
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
async function createSession(userId, sessionId, loginTime)
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
                '(user_id, session_id, login_time) ' +
                'VALUES (?, ?, ?);',
                [userId, sessionId, loginTime],
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

// Check that a user has sufficient access, throws if not
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
        if (userAccess != 'admin')
            throw 'insufficient access';
        return;

        default:
        throw TypeError('invalid access level: ' + access);
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
async function insertProject(userId, title, data, crc32, submitTime)
{
    return new Promise((resolve, reject) => {
        // Insert the project into the database
        db.run(
            'INSERT INTO projects ' +
            '(user_id, title, data, crc32, featured, submit_time) ' +
            'VALUES (?, ?, ?, ?, ?, ?);',
            [userId, title, data, crc32, 0, submitTime],
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

// Time zone used for the stats page, regardless of the server's time zone
const STATS_TIME_ZONE = 'America/New_York';

const DAY_IN_MS = 1000 * 3600 * 24;

// Get the calendar date (year, month, day) of a timestamp in STATS_TIME_ZONE
function getZonedDate(time)
{
    let parts = new Intl.DateTimeFormat('en-US', {
        timeZone: STATS_TIME_ZONE,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }).formatToParts(time);

    let get = type => parseInt(parts.find(p => p.type == type).value);
    return { year: get('year'), month: get('month'), day: get('day') };
}

// Get the offset of STATS_TIME_ZONE from UTC at a given timestamp, in ms
function getZoneOffset(time)
{
    let parts = new Intl.DateTimeFormat('en-US', {
        timeZone: STATS_TIME_ZONE,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
    }).formatToParts(time);

    let get = type => parseInt(parts.find(p => p.type == type).value);
    let asUTC = Date.UTC(
        get('year'), get('month') - 1, get('day'),
        get('hour'), get('minute'), get('second')
    );

    return asUTC - (time - time % 1000);
}

// Get the timestamp of midnight in STATS_TIME_ZONE for a calendar date.
// Out of range days are normalized, e.g. day 0 is the last day of the
// previous month. Accounts for daylight saving time.
function getZonedMidnight(year, month, day)
{
    let utcMidnight = Date.UTC(year, month - 1, day);
    let guess = utcMidnight - getZoneOffset(utcMidnight);
    return utcMidnight - getZoneOffset(guess);
}

app.get('/stats', async function (req, res)
{
    // Find the median value in a list of numbers
    function median(numList)
    {
        function compareFn(a, b)
        {
            if (a < b)
                return -1;
            else if (a > b)
                return 1;
            return 0;
        }

        let sortedNums = [...numList].sort(compareFn);
        return sortedNums[Math.floor(sortedNums.length/2)];
    }

    // Get the current timestamp
    let timeStamp = Date.now();

    // Get the timestamp at the last midnight in eastern time
    let today = getZonedDate(timeStamp);
    let lastMidnight = getZonedMidnight(today.year, today.month, today.day);

    let NUM_DAYS = 40;
    let dayCounts = [];

    console.log('seconds since midnight: ', (timeStamp - lastMidnight) / 1000);

    // For each day, starting from today and moving back.
    // Days can be 23 or 25 hours long because of daylight saving time.
    for (let i = 0; i < NUM_DAYS; ++i)
    {
        let dayStart = getZonedMidnight(today.year, today.month, today.day - i);
        let dayEnd = getZonedMidnight(today.year, today.month, today.day - i + 1);

        let dayCount = await getQueryValue(
            'SELECT COUNT(*) FROM plays WHERE time >= ? AND time < ?',
            [dayStart, dayEnd]
        )

        dayCounts.push(dayCount);
    }

    dayCounts.reverse();
    let daysExceptLast = dayCounts.slice(0, dayCounts.length - 1);
    let maxDayCount = Math.max(...dayCounts);
    let minDayCount = Math.min(...daysExceptLast);
    let medDayCount = median(dayCounts);
    let lastDayCount = dayCounts[dayCounts.length-1];
    // Avoid dividing by zero when there are no plays yet
    dayCounts = dayCounts.map(count => count / Math.max(maxDayCount, 1));

    // Compute the number of plays in the last hour
    let playsHour = await getQueryValue(
        'SELECT COUNT(*) FROM plays WHERE time >= ?',
        [timeStamp - 3600 * 1000]
    );

    // Compute the number of calendar days in eastern time
    // since the first project was uploaded
    let minTime = await getQueryValue('SELECT MIN(submit_time) from projects');
    let firstDay = (minTime === null)? today:getZonedDate(minTime);
    let numDays = Math.round(
        (Date.UTC(today.year, today.month - 1, today.day) -
        Date.UTC(firstDay.year, firstDay.month - 1, firstDay.day)) / DAY_IN_MS
    );

    // Current date and time in eastern time, for display
    let currentTime = new Date(timeStamp).toLocaleString('en-US', {
        timeZone: STATS_TIME_ZONE,
        dateStyle: 'full',
        timeStyle: 'long',
    });

    // Get various stats
    let totalPlays = await getQueryValue('SELECT COUNT(*) FROM plays');
    let projectCount = await getQueryValue('SELECT COUNT(*) FROM projects');
    let userCount = await getQueryValue('SELECT COUNT(*) FROM users');

    let html = statsTemplate({
        dayCounts: dayCounts,
        maxDayCount: maxDayCount,
        minDayCount: minDayCount,
        medDayCount: medDayCount,
        lastDayCount: lastDayCount,
        currentTime: currentTime,
        playsHour: playsHour,
        numDays: numDays,
        totalPlays: totalPlays,
        projectCount: projectCount,
        userCount: userCount,
    });

    res.setHeader('content-type', 'text/html');
    res.send(html);
});

/**
POST /register
Register a new user account
Arguments: username, password
*/
app.post('/register', jsonParser, async function (req, res)
{
    try
    {
        let username = req.body.username;
        let password = req.body.password;

        // Validate the username and password
        model.validateUserName(username);
        if (password.length > 64)
            return res.sendStatus(400);

        // Check that the username is available
        await checkAvail(username);

        // Add the new user to the database
        let ipHash = hashIP(getClientIP(req));
        let userId = await addUser(username, password, ipHash);

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

        await createSession(id, sessionId, loginTime);

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

        // Insert the project in the database
        let projectId = await insertProject(
            userId,
            title,
            data,
            crc32,
            submitTime
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

/**
POST /play/:projectId?
Record that playback was started, sent by the client the first time it
hits play on a loaded project. The projectId is omitted for projects that
weren't loaded from the server. We store only a timestamp and projectId.
*/
app.post(['/play', '/play/:projectId([0-9]+)'], async function (req, res)
{
    let projectId = null;

    if (req.params.projectId !== undefined)
    {
        projectId = parseInt(req.params.projectId);

        if (!Number.isSafeInteger(projectId) || projectId < 1)
            return res.sendStatus(400);
    }

    try
    {
        await dbRun(
            'INSERT INTO plays (time, project_id) VALUES (?, ?);',
            [Date.now(), projectId]
        );

        return res.sendStatus(204);
    }

    catch (e)
    {
        console.log('failed to record play');
        console.log(e);
        return res.sendStatus(500);
    }
})

// GET /list_count
// Get the number of shared projects, so the browse page can size its lists
app.get('/list_count', async function (req, res)
{
    let featured = !!req.query.featured;

    try
    {
        let count = await getQueryValue(
            'SELECT COUNT(*) FROM projects' + (featured? ' WHERE featured == 1':'')
        );

        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(count));
    }
    catch (e)
    {
        console.log(e);
        return res.sendStatus(500);
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
    try
    {
        await checkAccess(userId, sessionId, 'admin');
    }
    catch (e)
    {
        console.log('featured request denied');
        console.log(e);
        return res.sendStatus(403);
    }

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

// Loopback only: traffic must come through the nginx proxy.
// 0.0.0.0 (the default) accepts connections from anywhere; 127.0.0.1 does not.
const server = app.listen(serverHTTPPortNo, '127.0.0.1', () =>
{
    let address = server.address().address;
    let port = server.address().port;
    address = (address == "::")? "localhost":address;
    console.log(`app started at ${address}:${port}`);
});
