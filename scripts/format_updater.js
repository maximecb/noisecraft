// This script is used to convert example projects and the database
// from an old schema to a newer schema format, which is periodically
// needed when refactorings are done.

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { assert } from '../public/utils.js';
import * as model from '../public/model.js';

//===========================================================================

// If the examples directory exists
if (fs.existsSync('examples'))
{
    // For each example project
    fs.readdirSync('examples').forEach(fileName =>
    {
        // Read the example file
        let filePath = path.join('examples', fileName);
        console.log(filePath);
        let inData = fs.readFileSync(filePath, 'utf8')

        // Convert the project
        let project = JSON.parse(inData);
        model.normalizeProject(project);
        model.reposition(project);

        // Check that we pass validation
        model.validateProject(project);

        let outData = JSON.stringify(project);

        fs.writeFileSync(filePath, outData, { encoding: "utf8" });
    });
}

//===========================================================================

// Connect to the database
async function connect()
{
    return new Promise((resolve, reject) => {
        let db = new sqlite3.Database('database.db', (err) =>
        {
            if (err)
                reject();
            else
                resolve(db);
        })
    })
}

// Get the maximum project id
async function getMaxId()
{
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT MAX(id) as maxId FROM projects',
            [],
            function (err, row)
            {
                if (err)
                    reject();
                else
                    resolve(row.maxId);
            }
        );
    });
}

// Get the JSON data blob for a given project
async function getProjectData(projectId)
{
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT data FROM projects WHERE id==?',
            [projectId],
            function (err, row)
            {
                if (err)
                    reject(null);
                else if (row === undefined)
                    resolve(null)
                else
                    resolve(row.data);
            }
        );
    });
}

// Set the JSON data blob for a given project
async function setProjectData(projectId, data)
{
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE projects SET data=? WHERE id==?',
            [data, projectId],
            function (err, rows)
            {
                if (err)
                    return reject();

                resolve(true);
            }
        );
    });
}

let db = await connect();
console.log(db);

let maxProjectId = await getMaxId();
assert (typeof maxProjectId == 'number');
console.log(`maxProjectId=${maxProjectId}`);

// For each project id
for (let projectId = 1; projectId <= maxProjectId; ++projectId)
{
    console.log(`processing projectId=${projectId}`);

    let inData = await getProjectData(projectId);

    if (inData == null)
        continue;

    //console.log('got project data');
    assert (typeof inData == 'string');
    //console.log(inData);

    // Convert the project
    let project = JSON.parse(inData);
    model.normalizeProject(project);
    model.reposition(project);
    let outData = JSON.stringify(project);

    await setProjectData(projectId, outData);
}

db.close();
