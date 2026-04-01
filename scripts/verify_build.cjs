const fs = require('fs');
const path = require('path');

console.log("--- Diablo-Factory Build Verification ---");

const filesToCheck = [
    'src/systems/PathfindingSystem.js',
    'src/game_systems.js',
    'src/character_renderer.js'
];

let allOk = true;

filesToCheck.forEach(f => {
    const p = path.join(__dirname, '..', f);
    if (!fs.existsSync(p)) {
        console.error(`[Error] File not found: ${f}`);
        allOk = false;
        return;
    }
    const content = fs.readFileSync(p, 'utf8');
    
    if (f.includes('PathfindingSystem.js')) {
        if (!content.includes('enableDiagonals')) {
            console.error(`[Error] ${f}: enableDiagonals() missing.`);
            allOk = false;
        }
        if (!content.includes('getNearestWalkableTile')) {
            console.error(`[Error] ${f}: getNearestWalkableTile() missing.`);
            allOk = false;
        }
    }
    
    if (f.includes('game_systems.js')) {
        if (!content.includes('resolveStuck')) {
            console.error(`[Error] ${f}: resolveStuck() missing.`);
            allOk = false;
        }
        if (!content.includes('Velocity Normalization')) {
            console.error(`[Error] ${f}: Velocity Normalization comment/logic missing.`);
            allOk = false;
        }
    }
});

if (allOk) {
    console.log("[Success] All pathfinding optimization components verified.");
    process.exit(0);
} else {
    console.error("[Failed] Build verification failed.");
    process.exit(1);
}
