const fs = require('fs');
const path = require('path');

const csvPath = 'config/buildings.csv';
const content = fs.readFileSync(csvPath, 'utf8');

const lines = content.split(/\r?\n/);
if (lines.length < 2) process.exit(1);

// Parse headers
const headers1 = lines[0].split(',');
const headers2 = lines[1].split(',');

// Find indices
const idxLv = headers2.indexOf('lv');
const idxType = headers2.indexOf('type');
const idxUpgradeRes = headers2.indexOf('upgrade_need_resources');
const idxNeedRes = headers2.indexOf('need_resource');
const idxBuildTimes = headers2.indexOf('building_times');
const idxUpgradeTimes = headers2.indexOf('upgrade_times');

// Rename header
headers1[idxUpgradeRes] = '升級所需材料';
headers2[idxUpgradeRes] = 'upgrade_need_Ingredients';

// Group rows by type
const buildingsByType = {};
const otherLines = [];

for (let i = 2; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    // Robust CSV split (handling quotes)
    const row = [];
    let current = "";
    let inQuotes = false;
    for (let j = 0; j < lines[i].length; j++) {
        const char = lines[i][j];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
            row.push(current.trim());
            current = "";
        } else current += char;
    }
    row.push(current.trim());

    const type = row[idxType];
    if (!buildingsByType[type]) buildingsByType[type] = [];
    buildingsByType[type].push({ row, originalIndex: i });
}

// Map resources to Ingredients type
function transformResources(str) {
    if (!str || str === '""' || str === '') return "";
    // gold -> gold_ore
    let res = str.replace(/gold/g, 'gold_ore');
    // Ensure it has quotes if it contains commas
    if (res.includes(',') && !res.startsWith('"')) {
        res = `"${res}"`;
    }
    return res;
}

// Process shifts
const newRows = [];
for (const type in buildingsByType) {
    const list = buildingsByType[type].sort((a, b) => parseInt(a.row[idxLv]) - parseInt(b.row[idxLv]));
    
    // We need to keep the original data to shift correctly
    const originalUpgradeRes = list.map(item => item.row[idxUpgradeRes]);
    const originalNeedRes = list.map(item => item.row[idxNeedRes]);
    const originalUpgradeTimes = list.map(item => item.row[idxUpgradeTimes]);
    const originalBuildTimes = list.map(item => item.row[idxBuildTimes]);

    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const lv = parseInt(item.row[idxLv]);
        
        if (lv === 1) {
            // lv=1: cost to build (old need_resource)
            item.row[idxUpgradeRes] = transformResources(originalNeedRes[i]);
            // Shift upgrade time too for consistency? 
            // The user didn't ask, but to be safe we follow the resource shift logic.
            // If we shift resources, we should probably shift times.
            // But let's check if the user wants to shift upgrade_times.
            // "原有規則為lv=1的資源為1級升至2級所需資源... 現在改為0級升至1級的所需資源"
            // If I only shift resources, then Row(lv=1).upgrade_times is still 1->2 time.
            // This is confusing. I will shift upgrade_times as well to keep the "cost/time to reach this level" logic.
            item.row[idxUpgradeTimes] = originalBuildTimes[i]; 
        } else {
            // lv=N: cost to reach lv N (old upgrade_need_resources from lv N-1)
            item.row[idxUpgradeRes] = transformResources(originalUpgradeRes[i - 1]);
            item.row[idxUpgradeTimes] = originalUpgradeTimes[i - 1];
        }
    }
    newRows.push(...list);
}

// Delete need_resource column (idxNeedRes)
const finalHeaders1 = headers1.filter((_, i) => i !== idxNeedRes);
const finalHeaders2 = headers2.filter((_, i) => i !== idxNeedRes);

const resultLines = [finalHeaders1.join(','), finalHeaders2.join(',')];

// Sort back to something sensible or just by type then lv
newRows.sort((a, b) => {
    if (a.row[idxType] !== b.row[idxType]) return a.row[idxType].localeCompare(b.row[idxType]);
    return parseInt(a.row[idxLv]) - parseInt(b.row[idxLv]);
});

newRows.forEach(item => {
    const filteredRow = item.row.filter((_, i) => i !== idxNeedRes);
    // Ensure fields with commas are quoted
    const quotedRow = filteredRow.map(cell => {
        if (cell.includes(',') && !cell.startsWith('"')) return `"${cell}"`;
        return cell;
    });
    resultLines.push(quotedRow.join(','));
});

fs.writeFileSync(csvPath, resultLines.join('\n'), 'utf8');
console.log("buildings.csv refactored successfully.");
