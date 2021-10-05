import fs from 'fs';
import path from 'path';
import * as model from './public/model.js';
import { assert } from './public/utils.js';

fs.readdirSync('examples').forEach(fileName => {
    let filePath = path.join('examples', fileName);

    console.log(filePath);

    let data = fs.readFileSync(filePath, 'utf8')

    // Test deserialization
    let m = new model.Model();
    m.deserialize(data);

    // Test serialization
    let out = m.serialize();
    assert (out.length > 0);
});

let m = new model.Model();
m.new();
m.update(new model.CreateNode('AudioOut', 0, 0));
assert (m.hasNode('AudioOut'));
m.serialize();

// TODO: test undo/redo

// TODO: test SetParam
// May need getNodesOfType(nodeType)