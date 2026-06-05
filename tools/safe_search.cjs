const fs = require('fs');
const path = require('path');

const query = process.argv[2];
if (!query) {
    console.error("Please provide a search query.");
    process.exit(1);
}

const ignoreDirs = ['node_modules', '.git', 'tmp', 'dist'];

function searchDir(dir, queryStr) {
    let results = [];
    let files;
    try {
        files = fs.readdirSync(dir);
    } catch (err) {
        return results;
    }

    for (const file of files) {
        const fullPath = path.join(dir, file);
        let stat;
        try {
            stat = fs.statSync(fullPath);
        } catch (err) {
            continue;
        }

        if (stat.isDirectory()) {
            if (ignoreDirs.includes(file)) continue;
            results = results.concat(searchDir(fullPath, queryStr));
        } else if (stat.isFile()) {
            // Only search text files
            if (file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.json') || file.endsWith('.md') || file.endsWith('.html') || file.endsWith('.css')) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    if (content.includes(queryStr)) {
                        const lines = content.split('\n');
                        lines.forEach((line, idx) => {
                            if (line.includes(queryStr)) {
                                results.push({
                                    file: path.relative(process.cwd(), fullPath),
                                    line: idx + 1,
                                    content: line.trim().substring(0, 150)
                                });
                            }
                        });
                    }
                } catch (err) {
                    // Ignore read errors
                }
            }
        }
    }
    return results;
}

const matches = searchDir(process.cwd(), query);
console.log(`Found ${matches.length} matches for "${query}":`);
matches.slice(0, 50).forEach(m => {
    console.log(`${m.file}:${m.line}: ${m.content}`);
});
if (matches.length > 50) {
    console.log(`... and ${matches.length - 50} more matches.`);
}
