const cp = require('child_process');
const fs = require('fs');

const diff = cp.execSync('git log -p -- src/systems/ConveyorSystem.js').toString();
const lines = diff.split('\n');
const commits = [];
let curCommit = null;
let curDiff = [];
for (const line of lines) {
    if (line.startsWith('commit ')) {
        if (curCommit) {
            commits.push({ commit: curCommit, diff: curDiff.join('\n') });
        }
        curCommit = line;
        curDiff = [];
    } else {
        curDiff.push(line);
    }
}
if (curCommit) {
    commits.push({ commit: curCommit, diff: curDiff.join('\n') });
}

console.log(`Total commits: ${commits.length}`);
for (const c of commits) {
    if (c.diff.includes('toGrid(worldX')) {
        console.log("================================");
        console.log(c.commit);
        // Find lines with toGrid(worldX
        const diffLines = c.diff.split('\n');
        const idx = diffLines.findIndex(l => l.includes('toGrid(worldX'));
        if (idx !== -1) {
            console.log(diffLines.slice(Math.max(0, idx - 10), idx + 25).join('\n'));
        }
    }
}
