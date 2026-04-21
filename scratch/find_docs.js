const fs = require('fs');
const path = require('path');

function findFiles(dir, targetFiles) {
    const results = [];
    const internalFind = (currentDir) => {
        const files = fs.readdirSync(currentDir);
        for (const file of files) {
            const fullPath = path.join(currentDir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                if (file !== 'node_modules' && file !== '.git') {
                    internalFind(fullPath);
                }
            } else {
                if (targetFiles.includes(file)) {
                    results.push(fullPath);
                }
            }
        }
    };
    internalFind(dir);
    return results;
}

const targets = ['progress.md', 'PLAN.md'];
const found = findFiles('c:/Users/alway/Diablo-Factory', targets);
console.log(JSON.stringify(found, null, 2));
