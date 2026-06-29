const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'config', 'buildings.csv');
let content = fs.readFileSync(csvPath, 'utf8');

const lines = content.split(/\r?\n/);
if (lines.length < 2) process.exit(0);

// Add group_index to header
const headers1 = lines[0].split(',');
const headers2 = lines[1].split(',');

headers1.push('群組與順序');
headers2.push('group_index');

lines[0] = headers1.join(',');
lines[1] = headers2.join(',');

// Group assignments
const groupMap = {
    'village': '{core, 1}',
    'farmhouse': '{core, 2}',
    'storehouse': '{core, 3}',
    
    'timber_factory': '{gathering, 1}',
    'stone_factory': '{gathering, 2}',
    'barn': '{gathering, 3}',
    'gold_mining_factory': '{gathering, 4}',
    'tree_plantation': '{gathering, 5}',
    'farmland': '{gathering, 6}',
    
    'timber_processing_plant': '{processing, 1}',
    'stone_processing_plant': '{processing, 2}',
    'smelting_plant': '{processing, 3}',
    'tank_workshop': '{processing, 4}',
    
    'swordsman_place': '{military, 1}',
    'archer_place': '{military, 2}',
    'mage_place': '{military, 3}',
    
    'transport_line': '{logistics, 1}'
};

for (let i = 2; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const parts = lines[i].split(',');
    // model is usually index 2, type1 is index 4
    let type1 = parts[4];
    let groupIndex = '""';
    if (type1 && groupMap[type1]) {
        groupIndex = `"${groupMap[type1]}"`;
    }
    parts.push(groupIndex);
    lines[i] = parts.join(',');
}

fs.writeFileSync(csvPath, lines.join('\n'));
console.log('Updated buildings.csv with group_index');
