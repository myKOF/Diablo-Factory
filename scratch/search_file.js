const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/renderers/logistics_renderer.js');
const query = process.argv[2];

if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');
const results = [];

let lineNum = 1;
for (const line of lines) {
    if (line.toLowerCase().includes(query.toLowerCase())) {
        results.push({ line: lineNum, content: line.trim() });
    }
    lineNum++;
}

console.log(JSON.stringify(results, null, 2));
