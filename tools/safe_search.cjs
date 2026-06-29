const fs = require('fs');
const path = require('path');

function searchFiles(dir, pattern) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (['node_modules', '.git', 'tmp', 'dist'].includes(file)) continue;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            results = results.concat(searchFiles(fullPath, pattern));
        } else if (stat.isFile() && (fullPath.endsWith('.js') || fullPath.endsWith('.cjs') || fullPath.endsWith('.json') || fullPath.endsWith('.csv'))) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.includes(pattern)) {
                results.push({ path: fullPath, match: true });
            }
        }
    }
    return results;
}

const pattern = process.argv[2];
if (!pattern) {
    console.error('Please provide a search pattern');
    process.exit(1);
}

const matches = searchFiles(__dirname + '/..', pattern);
console.log('Matches found in:', matches.map(m => m.path).join('\n'));
