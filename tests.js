import fs from 'fs';
import path from 'path';
import * as model from './public/model.js';

fs.readdirSync('examples').forEach(fileName => {
    let filePath = path.join('examples', fileName);

    console.log(filePath);

    let data = fs.readFileSync(filePath, 'utf8')

    // Test deserialization
    let m = new model.Model();
    m.deserialize(data);

    // Test serialization
    m.serialize();
});

process.exit(0)
