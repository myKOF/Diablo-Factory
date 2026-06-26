const fs = require('fs');
const path = require('path');

function searchFiles(dir, query, results = []) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
        if (file === 'node_modules' || file === '.git' || file === 'tmp' || file === 'dist') continue;
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            searchFiles(filePath, query, results);
        } else if (file.endsWith('.js') || file.endsWith('.md')) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes(query)) {
                        results.push({ file: filePath, line: i + 1, content: lines[i].trim() });
                    }
                }
            } catch (err) {}
        }
    }
    return results;
}

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Please provide a search query.');
    process.exit(1);
}

const query = args[0];
const results = searchFiles(__dirname + '/../', query);
console.log(`Found ${results.length} matches for "${query}":`);
for (let i = 0; i < Math.min(results.length, 50); i++) {
    console.log(`${results[i].file}:${results[i].line}: ${results[i].content}`);
}
if (results.length > 50) {
    console.log(`... and ${results.length - 50} more matches.`);
}
