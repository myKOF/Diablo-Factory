const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../src');
const query = process.argv[2];
if (!query) {
    console.error("Please provide a search query");
    process.exit(1);
}
const results = [];

function searchDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            searchDir(fullPath);
        } else if (stat.isFile() && file.endsWith('.js')) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.includes(query)) {
                let lineNum = 1;
                const lines = content.split('\n');
                for (const line of lines) {
                    if (line.includes(query)) {
                        results.push({
                            file: path.relative(path.resolve(__dirname, '..'), fullPath),
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
console.log(JSON.stringify(results, null, 2));
