// This script is used to convert Zupiter projects to the NoiseCraft format
//
// Usage:
// node zupiter_converter.js db_file_path.db

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { assert, treeCopy } from '../public/utils.js';
import * as model from '../public/model.js';

function convertProject(project, title)
{
    assert (project instanceof Object);

    project.title = title;

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

    delete node.id;
    delete node.outs;

    //console.log(node.ins)
    node.ins = node.ins.map(src => src? [String(src.nodeId), src.portIdx]:null);
    //console.log(node.ins);

    if (!node.inNames)
    {
        node.inNames = schema.ins.map(s => s.name);
    }

    if (!node.outNames)
    {
        node.outNames = schema.outs.map(n => n);
    }

    if ('numOcts' in node)
    {
        node.numOctaves = node.numOcts;
        delete node.numOcts;
    }


    if (node.patterns)
        console.log(node.patterns)



    // Add missing parameters
    for (let param of schema.params)
    {
        if (param.name in node.params)
            continue;

        console.log(node.type, param.name);
        node.params[param.name] = param.default;
    }

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
            'SELECT data, title, user_id FROM projects WHERE id==?',
            [projectId],
            function (err, row)
            {
                if (err)
                    reject(null);
                else if (row === undefined)
                    resolve(null)
                else
                    resolve(row);
            }
        );
    });
}

// Get the name for a given userId
async function getUserName(userId)
{
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT username FROM users WHERE id==?',
            [userId],
            function (err, row)
            {
                if (err)
                    reject(null);
                else if (row === undefined)
                    resolve(null)
                else
                    resolve(row.username);
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
    throw Error('expected db path argument and output directory');
}

let dbPath = process.argv[2];
console.log(dbPath)

// Output directory to write files into
let outDir = process.argv[3];
console.log(outDir);

if (outDir == 'examples')
{
    throw Error('invalid output directory');
}

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

    let row = await getProjectData(projectId);

    if (row === null)
        continue;

    let data = row.data;
    let title = row.title;
    let userId = row.user_id;

    //console.log('got project data');
    assert (typeof data == 'string');
    //console.log(inData);
    //console.log(title);

    let project = JSON.parse(data);

    // Get the author username
    let username = await getUserName(userId);
    assert (username);
    //console.log(username);

    // Convert the project
    try
    {
        project = convertProject(project, title);
    }
    catch (e)
    {
        console.log(e);
    }

    // TODO: add a message with the author username





    let outData = JSON.stringify(project);

    // Generate the output path
    let idString = projectId.toString().padStart(4, '0');
    let outPath = path.join(outDir, `${idString}.ncft`);
    console.log(outPath);

    // Write to output file
    fs.writeFileSync(outPath, outData, { encoding: "utf8" })
}

db.close();