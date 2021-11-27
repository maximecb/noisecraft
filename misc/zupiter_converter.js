// This script is used to convert Zupiter projects to the NoiseCraft format
//
// Usage:
// node zupiter_converter.js db_file_path.db

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { assert, treeCopy } from '../public/utils.js';
import * as model from '../public/model.js';

function convertProject(project)
{
    assert (project instanceof Object);

    // TODO: add missing project fields



    for (let nodeId in project.nodes)
    {
        assert (typeof nodeId === 'string');
        let node = project.nodes[nodeId];
        project.nodes[nodeId] = convertNode(node);
    }




    return project;
}

function convertNode(node)
{
    if (!(node.type in model.NODE_SCHEMA))
    {
        throw TypeError('unsupported node type ' + node.type)
    }

    let schema = model.NODE_SCHEMA[node.type];
    assert (schema);






    /*
    if (!node.inNames)
    {
        node.inNames = schema.ins.map(s => s.name);
    }

    if (!node.outNames)
    {
        node.outNames = schema.outs.map(n => n);
    }
    */

    return node;
}

//===========================================================================

// Connect to the database
async function connect(dbPath)
{
    return new Promise((resolve, reject) => {
        let db = new sqlite3.Database(dbPath, (err) =>
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

if (process.argv.length != 4)
{
    throw Error('expected db path argument and output directory')
}

let dbPath = process.argv[2];
console.log(dbPath)

// Output directory to write files into
let outDir = process.argv[3];
console.log(outDir);

if (!fs.existsSync(outDir))
{
    throw Error('output directory does not exist');
}

let db = await connect(dbPath);
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

    let project = JSON.parse(inData);

    // Convert the project
    try
    {
        project = convertProject(project);
    }
    catch (e)
    {
        console.log(e);
    }

    let outData = JSON.stringify(project);





    // TODO: generate output path



    // TODO: write output


}

db.close();
