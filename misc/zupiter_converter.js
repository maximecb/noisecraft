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

    if (node.type == 'MonoSeq')
    {
        if (!node.curPattern)
            node.curPattern = 0;
    }

    if (node.type == 'Notes')
    {
        node.params.text = node.text? node.text:'';
        //console.log(node.text);
        delete node.text;
    }

    // Add missing parameters
    for (let param of schema.params)
    {
        if (param.name in node.params)
            continue;

        //console.log(node.type, param.name);
        node.params[param.name] = param.default;
    }

    return node;
}

function getFreeId(project)
{
    let maxId = 0;

    for (let nodeId in project.nodes)
    {
        let numId = Number(nodeId);
        assert (!isNaN(numId));
        maxId = Math.max(numId, numId);
    }

    return String(maxId + 1);
}

// Add some notes to the project to explain where it came from
function addNotes(project, projectId, username)
{
    // Compute where to insert the notes
    let maxY = 0;
    for (let nodeId in project.nodes)
    {
        let node = project.nodes[nodeId];
        maxY = Math.max(maxY, node.y);
    }

    let text = (
        "This project was automatically exported from the Zupiter music app (NoiseCraft's predecessor), " +
        "and was originally created by \"" + username + "\". The original project id was #" + projectId + "."
    );

    let notes = {
        type: 'Notes',
        name: 'About',
        x: 10,
        y: maxY + 200,
        ins: [],
        inNames: [],
        outNames: [],
        params: {
            text: text
        }
    }

    let nodeId = getFreeId(project);
    project.nodes[nodeId] = notes;
}

// Note: eventually, we could fix this more tightly with a module
function fixSlide(project, slideNode, slideId)
{
    // Create a node for the constant 1000
    let constId = getFreeId(project);
    let constNode = {
        type: 'Const',
        name: 'Const',
        x: slideNode.x + 10,
        y: slideNode.y + 10,
        ins: [],
        inNames: [],
        outNames: [""],
        params: {
            value: 1000
        }
    }
    project.nodes[constId] = constNode;

    // Create a node for the division
    let divId = getFreeId(project);
    let divNode = {
        type: 'Div',
        name: 'Div',
        x: slideNode.x + 20,
        y: slideNode.y + 20,
        ins: [
            slideNode.ins[1],
            [constId, 0]
        ],
        inNames: ["in", "cst"],
        outNames: ["out"],
        params: {}
    }
    project.nodes[divId] = divNode;

    // Replace the slide rate input by our divided input
    slideNode.ins[1] = [divId, 0];
}

// Fix the scaling of slide node inputs in a project
function fixSlides(project)
{
    // For each node in the project
    for (let nodeId in project.nodes)
    {
        let node = project.nodes[nodeId];

        if (node.type == 'Slide')
        {
            fixSlide(project, node, nodeId);
        }
    }
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
        continue;
    }

    // Fix the scaling of slide nodes
    fixSlides(project);

    // Add a message with the author username
    addNotes(project, projectId, username);

    model.validateProject(project);

    let outData = JSON.stringify(project);

    // Generate the output path
    let idString = projectId.toString().padStart(4, '0');
    let outPath = path.join(outDir, `${idString}.ncft`);
    console.log(outPath);

    // Write to output file
    fs.writeFileSync(outPath, outData, { encoding: "utf8" })
}

db.close();
