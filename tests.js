import fs from 'fs';
import path from 'path';
import { assert } from './public/utils.js';
import * as model from './public/model.js';
import { compile } from './public/compiler.js';

function assertThrows(fn)
{
    let throws = false;

    try
    {
        fn();
    }
    catch (e)
    {
        throws = true;
    }

    assert (throws);
}

// Test username validation
{
    assert (typeof model.MAX_USERNAME_LENGTH == 'number');

    model.validateUserName('Foo');
    model.validateUserName('el');
    model.validateUserName('Foo_bar2');
    model.validateUserName('Foo Bar 2');
    model.validateUserName('_Long_User_Name_');

    // Invalid usernames
    assertThrows(_ => model.validateUserName(' foo '));
    assertThrows(_ => model.validateUserName('foo)'));
    assertThrows(_ => model.validateUserName(''));
    assertThrows(_ => model.validateUserName('overly long username foobar'));
}

// Test CreateNode
{
    var m = new model.Model();
    m.new();
    m.update(new model.CreateNode('AudioOut', 0, 0));
    assert (m.hasNode('AudioOut'));
    m.serialize();
}

// Test undo/redo and SetParam
{
    var m = new model.Model();
    m.new();
    let knobId = m.update(new model.CreateNode('Knob', 0, 0));
    m.update(new model.DeleteNodes([knobId]));
    m.undo();
    assert (m.hasNode('Knob'));
    m.redo();
    m.undo();
    m.update(new model.SetParam(knobId, "value", 0.5));
    m.serialize();
}

// Test copy/paste
{
    var m = new model.Model();
    m.new();
    let knob0 = m.update(new model.CreateNode('Knob', 0, 0));
    let knob1 = m.update(new model.CreateNode('Knob', 10, 10));
    var data = m.copy([knob0, knob1]);
    m.update(new model.Paste(data, 20, 20));
    assert (m.numNodes == 4);
}

// Test grouping
{
    var m = new model.Model();
    m.new();
    m.update(new model.CreateNode('Add', 0, 0));
    m.update(new model.CreateNode('Add', 10, 10));
    m.update(new model.ConnectNodes("0", 1, "1", 0));
    m.update(new model.GroupNodes(["1"]));
    assert (m.numNodes == 2);
}

// Try loading all of our example projects
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
