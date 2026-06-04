const fs = require('fs');
const path = require('path');

const query = process.argv[2];
if (!query) {
    console.error("Please provide a search query");
    process.exit(1);
}

const ignoreDirs = ['node_modules', '.git', 'tmp', 'dist'];

function searchDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (ignoreDirs.includes(file)) continue;
            searchDir(fullPath);
        } else if (stat.isFile()) {
            if (file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.html') || file.endsWith('.css')) {
                const content = fs.readFileSync(fullPath, 'utf8');
                if (content.includes(query)) {
                    let lineNum = 0;
                    const lines = content.split('\n');
                    lines.forEach((line, index) => {
                        if (line.includes(query)) {
                            console.log(`${fullPath}:${index + 1}: ${line.trim()}`);
                        }
                    });
                }
            }
        }
    }
}

const root = path.resolve(__dirname, '..');
searchDir(root);
