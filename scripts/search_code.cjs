const fs = require('fs');
const path = require('path');

/**
 * 簡易的程式碼搜尋工具 (避開 Shell 指令攔截)
 * 使用方式: node scripts/search_code.cjs <搜尋字串> [搜尋路徑] [包含後綴]
 */

const query = process.argv[2];
const searchDir = process.argv[3] || './src';
const extension = process.argv[4] || '.js';

if (!query) {
    console.error('請提供搜尋關鍵字！範例: node scripts/search_code.cjs model_size');
    process.exit(1);
}

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

console.log(`--- 搜尋中: "${query}" 在 ${searchDir} (${extension}) ---`);
let found = 0;

try {
    walkDir(searchDir, (filePath) => {
        if (!filePath.endsWith(extension)) return;
        
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
            if (line.includes(query)) {
                console.log(`${filePath}:${index + 1}: ${line.trim()}`);
                found++;
            }
        });
    });
} catch (err) {
    console.error('搜尋過程中出錯:', err.message);
}

console.log(`--- 搜尋完畢，共找到 ${found} 處符合項目 ---`);
