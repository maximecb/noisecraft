// This script is used to convert example projects and the database
// from an old schema to a newer schema format, which is periodically
// needed when refactorings are done.

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { assert } from './public/utils.js';
import * as model from './public/model.js';
import { compile } from './public/compiler.js';

// TODO: take inspiration from validation code
function convert(project)
{
}

function convertNode(node)
{
}

//===========================================================================

// For each example project
fs.readdirSync('examples').forEach(fileName => 
{
    // Read the example file
    let filePath = path.join('examples', fileName);
    console.log(filePath);
    let data = fs.readFileSync(filePath, 'utf8')





});

/*
// Connect to the database
let db = new sqlite3.Database('./database.db', (err) => 
{
    if (err)
        throw err;
    console.log('Connected to the database');
});
*/
