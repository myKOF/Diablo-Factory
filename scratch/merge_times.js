const fs = require('fs');

function parseCSVLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
            cur += char;
        } else if (char === ',' && !inQuotes) {
            result.push(cur);
            cur = '';
        } else {
            cur += char;
        }
    }
    result.push(cur);
    return result;
}

const content = fs.readFileSync('config/buildings.csv', 'utf8');
const lines = content.split('\n');
if (lines.length < 2) process.exit(0);

const headersEng = parseCSVLine(lines[1]);
const hIdx = (key) => headersEng.findIndex(h => h.toLowerCase().trim() === key.toLowerCase());

const idxUpTime = hIdx('upgrade_times');
const idxBuildTime = hIdx('building_times');
const idxLv = hIdx('lv');

const newLines = [];
for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const row = parseCSVLine(line);
    
    if (i > 1) {
        const lv = parseInt(row[idxLv]);
        // Rule: lv 1 row's upgrade_times = its building_times
        if (lv === 1) {
            row[idxUpTime] = row[idxBuildTime];
        }
    }
    
    // Remove building_times column
    row.splice(idxBuildTime, 1);
    newLines.push(row.join(','));
}

fs.writeFileSync('config/buildings.csv', newLines.join('\n'));
console.log('Successfully merged building_times into upgrade_times.');
