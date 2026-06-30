const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || parseInt(process.argv[2]) || 8080;
const ROOT_DIR = __dirname;
const WATCH_DIRS = ['src', 'config', 'assets'];
const WATCH_FILES = ['index.html', 'style.css'];
const clients = new Set();
const serverStartTime = Date.now().toString();

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8'
};

const LIVE_RELOAD_SNIPPET = `
<script>
(() => {
    const protocol = location.protocol === 'https:' ? 'https:' : 'http:';
    let currentSessionId = null;
    const source = new EventSource(protocol + '//' + location.host + '/__livereload');
    source.onmessage = (event) => {
        if (event.data === 'reload') {
            location.reload();
        } else if (event.data.startsWith('init:')) {
            const sessionId = event.data.substring(5);
            if (currentSessionId !== null && currentSessionId !== sessionId) {
                location.reload();
            }
            currentSessionId = sessionId;
        }
    };
})();
</script>
`;

function safePathFromUrl(urlPath) {
    const normalized = decodeURIComponent(urlPath.split('?')[0]);
    const rawPath = normalized === '/' ? '/index.html' : normalized;
    const filePath = path.normalize(path.join(ROOT_DIR, rawPath));

    if (!filePath.startsWith(ROOT_DIR)) {
        return null;
    }

    return filePath;
}

function injectLiveReload(content) {
    const html = content.toString('utf8');
    if (html.includes('/__livereload')) {
        return html;
    }

    if (html.includes('</body>')) {
        return html.replace('</body>', `${LIVE_RELOAD_SNIPPET}\n</body>`);
    }

    return `${html}\n${LIVE_RELOAD_SNIPPET}`;
}

const mtimeCache = new Map();
const ALLOWED_EXTENSIONS = new Set([
    '.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.csv'
]);

let reloadTimeout = null;
function broadcastReload(changedPath) {
    if (reloadTimeout) clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(() => {
        console.log(`[dev-server] 偵測到檔案變更，重新整理頁面：${changedPath}`);
        clients.forEach((res) => {
            res.write(`data: reload\n\n`);
        });
    }, 100);
}

function handleFileChange(dirName, filename) {
    if (!filename) return;

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) return;

    const fullPath = path.join(ROOT_DIR, dirName, filename);

    try {
        if (!fs.existsSync(fullPath)) {
            broadcastReload(path.join(dirName, filename));
            return;
        }

        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) return;

        const lastMtime = mtimeCache.get(fullPath);
        const currentMtime = stat.mtimeMs;

        if (lastMtime === undefined || currentMtime > lastMtime) {
            mtimeCache.set(fullPath, currentMtime);
            broadcastReload(path.join(dirName, filename));
        }
    } catch (err) {
        // Ignore read stat failures
    }
}

function watchDirectory(dirName) {
    const fullPath = path.join(ROOT_DIR, dirName);
    if (!fs.existsSync(fullPath)) return;

    fs.watch(fullPath, { recursive: true }, (_, filename) => {
        handleFileChange(dirName, filename);
    });
}

function watchFile(fileName) {
    const fullPath = path.join(ROOT_DIR, fileName);
    if (!fs.existsSync(fullPath)) return;

    fs.watch(fullPath, (_, filename) => {
        handleFileChange('', filename || fileName);
    });
}

const server = http.createServer((req, res) => {
    if (req.url.startsWith('/__livereload')) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
        });
        res.write(`retry: 3000\ndata: init:${serverStartTime}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
    }

    if (req.method === 'POST' && req.url === '/api/save-script') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const filename = data.filename || 'record_test.spec.js';
                const content = data.content || '';
                
                // Security check - 禁止路徑穿越，但允許 test_scripts/ 子目錄
                if (filename.includes('..') || filename.includes('\\\\')) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, error: 'Invalid filename' }));
                    return;
                }
                
                const saveDir = path.join(ROOT_DIR, 'src', 'debug');
                const savePath = path.join(saveDir, filename);
                // 確保最終路徑仍在 src/debug 範圍內（二次防護）
                if (!savePath.startsWith(saveDir)) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, error: 'Path traversal detected' }));
                    return;
                }
                
                const saveSubDir = path.dirname(savePath);
                if (!fs.existsSync(saveSubDir)) {
                    fs.mkdirSync(saveSubDir, { recursive: true });
                }
                
                fs.writeFileSync(savePath, content, 'utf8');
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, path: savePath }));
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    const filePath = safePathFromUrl(req.url);
    if (!filePath) {
        res.writeHead(403);
        res.end('403 Forbidden');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (res.headersSent) return;
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
            return;
        }

        const body = ext === '.html' ? injectLiveReload(content) : content;
        if (!res.headersSent) {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                Pragma: 'no-cache',
                Expires: '0'
            });
            res.end(body, 'utf-8');
        }
    });
});

WATCH_DIRS.forEach(watchDirectory);
WATCH_FILES.forEach(watchFile);

// 每 15 秒發送一次心跳包，防止 TCP 連線逾時導致瀏覽器觸發錯誤
setInterval(() => {
    clients.forEach((res) => {
        res.write(': ping\n\n');
    });
}, 15000);

server.listen(PORT, () => {
    console.log(`[dev-server] Live reload server 已啟動：http://localhost:${PORT}/`);
});
