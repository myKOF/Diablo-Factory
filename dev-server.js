const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT_DIR = __dirname;
const WATCH_DIRS = ['src', 'config', 'assets'];
const WATCH_FILES = ['index.html', 'style.css'];
const clients = new Set();

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
    const source = new EventSource(protocol + '//' + location.host + '/__livereload');
    source.onmessage = (event) => {
        if (event.data === 'reload') {
            location.reload();
        }
    };
    source.onerror = () => {
        source.close();
        setTimeout(() => location.reload(), 1000);
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

function broadcastReload(changedPath) {
    console.log(`[dev-server] 偵測到檔案變更，重新整理頁面：${changedPath}`);
    clients.forEach((res) => {
        res.write(`data: reload\n\n`);
    });
}

function watchDirectory(dirName) {
    const fullPath = path.join(ROOT_DIR, dirName);
    if (!fs.existsSync(fullPath)) return;

    fs.watch(fullPath, { recursive: true }, (_, filename) => {
        if (!filename) return;
        broadcastReload(path.join(dirName, filename));
    });
}

function watchFile(fileName) {
    const fullPath = path.join(ROOT_DIR, fileName);
    if (!fs.existsSync(fullPath)) return;

    fs.watch(fullPath, (_, filename) => {
        broadcastReload(filename || fileName);
    });
}

const server = http.createServer((req, res) => {
    if (req.url.startsWith('/__livereload')) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive'
        });
        res.write('\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
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
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0'
        });
        res.end(body);
    });
});

WATCH_DIRS.forEach(watchDirectory);
WATCH_FILES.forEach(watchFile);

server.listen(PORT, () => {
    console.log(`[dev-server] Live reload server 已啟動：http://localhost:${PORT}/`);
});
