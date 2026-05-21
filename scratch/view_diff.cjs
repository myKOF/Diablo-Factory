const cp = require('child_process');
const fs = require('fs');

const diff = cp.execSync('git diff HEAD -- src/systems/ConveyorSystem.js').toString();
fs.writeFileSync('scratch/conveyor_diff.txt', diff);
console.log("Written git diff to scratch/conveyor_diff.txt. Length: " + diff.length);
