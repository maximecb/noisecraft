import fs from 'fs';
import path from 'path';
import { assert } from './public/utils.js';
import * as model from './public/model.js';
import { compile } from './public/compiler.js';

fs.readdirSync('examples').forEach(fileName => 
{
    // Read the example file
    let filePath = path.join('examples', fileName);
    console.log(filePath);
    let data = fs.readFileSync(filePath, 'utf8')

    // Test deserialization
    let m = new model.Model();
    m.deserialize(data);

    // Test serialization
    let out = m.serialize();
    assert (out.length > 0);

    // Test the compiler
    let unit = compile(m.state);
    let genSample = new Function(
        'time',
        'nodes',
        unit.src
    );
});

// Test CreateNode
var m = new model.Model();
m.new();
m.update(new model.CreateNode('AudioOut', 0, 0));
assert (m.hasNode('AudioOut'));
m.serialize();

// Test undo/redo and SetParam
var m = new model.Model();
m.new();
m.update(new model.CreateNode('Knob', 0, 0));
m.update(new model.DeleteNodes(["0"]));
m.undo();
assert (m.hasNode('Knob'));
m.redo();
m.undo();
m.update(new model.SetParam("0", "value", 0.5));
m.serialize();

// TODO: this test should ideally load a more complex model from a file
// Test copy/paste
var m = new model.Model();
m.new();
m.update(new model.CreateNode('Knob', 0, 0));
m.update(new model.CreateNode('Knob', 10, 10));
var data = m.copy(["0", "1"]);
m.update(new model.Paste(data, 20, 20));
assert (m.numNodes == 4);

// Test grouping
var m = new model.Model();
m.new();
m.update(new model.CreateNode('Add', 0, 0));
m.update(new model.CreateNode('Add', 10, 10));
m.update(new model.ConnectNodes("0", 1, "1", 0));
m.update(new model.GroupNodes(["1"]));
assert (m.numNodes == 2);
