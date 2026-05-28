const fs = require('fs');
const path = require('path');

const query = process.argv[2];
if (!query) {
    console.error("Please provide a search query.");
    process.exit(1);
}

const ignoreDirs = new Set(['node_modules', '.git', 'tmp', 'dist', 'artifacts']);

function searchDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (!ignoreDirs.has(file)) {
                searchDir(fullPath);
            }
        } else if (file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.ts') || file.endsWith('.html')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes(query)) {
                const lines = content.split('\n');
                lines.forEach((line, idx) => {
                    if (line.includes(query)) {
                        console.log(`${fullPath}:${idx + 1}: ${line.trim()}`);
                    }
                });
            }
        }
    }
}

searchDir(path.join(__dirname, '..'));
