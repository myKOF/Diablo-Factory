const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pattern = process.argv[2];
const limit = Number(process.argv[3] || 80);
const ignoreDirs = new Set(['node_modules', '.git', 'tmp', 'dist']);
const textExts = new Set(['.js', '.cjs', '.mjs', '.json', '.html', '.css', '.md', '.ts']);

if (!pattern) {
  console.error('Usage: node tools/safe_search.cjs <pattern> [limit]');
  process.exit(1);
}

const results = [];
const needle = pattern.toLowerCase();

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= limit) return;
    if (entry.isDirectory() && ignoreDirs.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!textExts.has(path.extname(entry.name).toLowerCase())) continue;

    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].toLowerCase().includes(needle)) {
        results.push({
          file: path.relative(root, full),
          line: i + 1,
          text: lines[i].trim().slice(0, 160),
        });
        if (results.length >= limit) return;
      }
    }
  }
}

walk(root);

for (const result of results) {
  console.log(`${result.file}:${result.line}: ${result.text}`);
}
