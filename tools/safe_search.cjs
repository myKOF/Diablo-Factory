const fs = require('fs');
const path = require('path');

const root = process.cwd();
const ignoredDirs = new Set(['node_modules', '.git', 'tmp', 'dist']);
const query = process.argv[2] || '';
const maxResults = Number(process.argv[3] || 80);

if (!query) {
  console.error('Usage: node tools/safe_search.cjs <query> [maxResults]');
  process.exit(1);
}

const results = [];

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        walk(path.join(dir, entry.name));
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(dir, entry.name);
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes(query)) {
        const relative = path.relative(root, filePath);
        const compact = line.trim().slice(0, 180);
        results.push(`${relative}:${index + 1}: ${compact}`);
      }
    });

    if (results.length >= maxResults) {
      return;
    }
  }
}

walk(root);
console.log(results.slice(0, maxResults).join('\n'));
