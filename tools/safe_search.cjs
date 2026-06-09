const fs = require('fs');
const path = require('path');

const query = process.argv[2];
if (!query) {
    console.error("Please provide a search query");
    process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const results = [];

function searchDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git' || file === 'tmp' || file === 'dist') continue;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            searchDir(fullPath);
        } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.json') || file.endsWith('.html') || file.endsWith('.css'))) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.includes(query)) {
                let lineNum = 1;
                const lines = content.split('\n');
                for (const line of lines) {
                    if (line.includes(query)) {
                        results.push({
                            file: path.relative(rootDir, fullPath),
                            line: lineNum,
                            content: line.trim()
                        });
                    }
                    lineNum++;
                }
            }
        }
    }
}

searchDir(rootDir);
console.log(JSON.stringify(results.slice(0, 50), null, 2));
