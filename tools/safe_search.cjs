const fs = require('fs');
const path = require('path');

const query = process.argv[2];
if (!query) {
    console.log('Please provide a search query.');
    process.exit(1);
}

const ignoreDirs = ['node_modules', '.git', 'tmp', 'dist'];

function searchDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (ignoreDirs.includes(file)) continue;
            searchDir(fullPath);
        } else {
            if (file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.json')) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                if (content.includes(query)) {
                    console.log(`Found in: ${fullPath}`);
                    const lines = content.split('\n');
                    lines.forEach((line, index) => {
                        if (line.includes(query)) {
                            console.log(`  Line ${index + 1}: ${line.trim()}`);
                        }
                    });
                }
            }
        }
    }
}

searchDir('.');
