const fs = require('fs');
const path = require('path');

function searchDir(dir, query) {
    let results = [];
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git' || file === 'tmp' || file === 'dist') {
            continue;
        }
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            results = results.concat(searchDir(fullPath, query));
        } else if (stat.isFile()) {
            if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.json') || file.endsWith('.css')) {
                const content = fs.readFileSync(fullPath, 'utf8');
                if (content.includes(query)) {
                    const lines = content.split('\n');
                    lines.forEach((line, idx) => {
                        if (line.includes(query)) {
                            results.push(`${fullPath}:${idx + 1}: ${line.trim()}`);
                        }
                    });
                }
            }
        }
    }
    return results;
}

const query = process.argv[2];
if (!query) {
    console.log("Please specify a search query.");
    process.exit(1);
}

console.log(`Searching for "${query}"...`);
const results = searchDir(path.resolve(__dirname, '..'), query);
console.log(`Found ${results.length} matches:`);
results.forEach(res => console.log(res));
