const fs = require('fs');
const path = require('path');

const query = process.argv[2];
if (!query) {
    console.error('Please provide a search query.');
    process.exit(1);
}

const ignoreDirs = ['node_modules', '.git', 'tmp', 'dist'];
const results = [];

function searchDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (ignoreDirs.includes(file)) continue;
            searchDir(fullPath);
        } else {
            const ext = path.extname(file);
            if (['.js', '.json', '.html', '.css', '.md'].includes(ext)) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const lines = content.split('\n');
                    lines.forEach((line, idx) => {
                        if (line.includes(query)) {
                            results.push({
                                file: path.relative(process.cwd(), fullPath),
                                line: idx + 1,
                                text: line.trim()
                            });
                        }
                    });
                } catch (e) {
                    // Ignore read errors
                }
            }
        }
    }
}

searchDir(process.cwd());

if (results.length === 0) {
    console.log('No matches found.');
} else {
    console.log(`Found ${results.length} matches for "${query}":`);
    results.slice(0, 100).forEach(r => {
        console.log(`${r.file}:${r.line}: ${r.text}`);
    });
    if (results.length > 100) {
        console.log(`... and ${results.length - 100} more matches.`);
    }
}
