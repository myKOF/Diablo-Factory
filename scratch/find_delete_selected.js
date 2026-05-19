const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../src/ui/ui.js');
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
    if (line.includes('deleteSelectedLogisticsLine(')) {
        console.log(`FOUND: Line ${index + 1}: ${line.trim()}`);
    }
});
