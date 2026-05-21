const fs = require('fs');
const code = fs.readFileSync('src/systems/ConveyorSystem.js', 'utf8');
const lines = code.split('\n');
lines.forEach((line, index) => {
    if (line.includes('Math.hypot')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
