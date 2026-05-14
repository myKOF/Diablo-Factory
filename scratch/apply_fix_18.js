const fs = require('fs');

const workerSystemPath = 'c:\\Users\\user\\.gemini\\antigravity\\scratch\\Diablo-Factory\\src\\systems\\WorkerSystem.js';

let workerContent = fs.readFileSync(workerSystemPath, 'utf-8');

const target_regex = /const nodeKey = \(point\) => `\${Math\.round\(point\.x\)},\${Math\.round\(point\.y\)}`;\s+const nodes = new Map\(\);\s+const edges = new Map\(\);\s+const addNode = \(point\) => \{\s+if \(!point || !Number\.isFinite\(point\.x\) || !Number\.isFinite\(point\.y\)\) return null;\s+const key = nodeKey\(point\);\s+if \(!nodes\.has\(key\)\) nodes\.set\(key, \{ x: Math\.round\(point\.x\), y: Math\.round\(point\.y\) \}\);\s+if \(!edges\.has\(key\)\) edges\.set\(key, \[\]\);\s+return key;\s+\};\s+const addEdge = \(a, b\) => \{\s+const ak = addNode\(a\);\s+const bk = addNode\(b\);\s+if \(!ak || !bk || ak === bk\) return;\s+const weight = Math\.hypot\(nodes\.get\(bk\)\.x - nodes\.get\(ak\)\.x, nodes\.get\(bk\)\.y - nodes\.get\(ak\)\.y\) \|\| 0\.001;\s+edges\.get\(ak\)\.push\(\{ key: bk, weight \}\);\s+edges\.get\(bk\)\.push\(\{ key: ak, weight \}\);\s+\};\s+segments\.forEach\(seg => \{\s+const points = seg\.routePoints;\s+for \(let i = 0; i < points\.length - 1; i\+\+\) \{\s+const a = points\[i\];\s+const b = points\[i \+ 1\];\s+if \(!a || !b\) continue;\s+const dx = b\.x - a\.x;\s+const dy = b\.y - a\.y;\s+const dist = Math\.hypot\(dx, dy\);\s+if \(dist < 0\.001\) continue;\s+const steps = Math\.max\(1, Math\.round\(dist \/ TS\)\);\s+let prev = null;\s+for \(let step = 0; step <= steps; step\+\+\) \{\s+const point = step === steps\s+\? b\s+: \{ x: a\.x \+ \(dx \/ steps\) \* step, y: a\.y \+ \(dy \/ steps\) \* step \};\s+const key = addNode\(point\);\s+if \(prev && key\) addEdge\(nodes\.get\(prev\), nodes\.get\(key\)\);\s+prev = key;\s+\}\s+\}\s+\}\);/;

const replacement = `const nodes = new Map();
        const edges = new Map();
        
        const findNodeKey = (point) => {
            for (const [key, node] of nodes) {
                if (Math.hypot(node.x - point.x, node.y - point.y) < 5) {
                    return key;
                }
            }
            return null;
        };

        const addNode = (point) => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
            const existingKey = findNodeKey(point);
            if (existingKey) return existingKey;
            
            const key = \`\${Math.round(point.x)},\${Math.round(point.y)}\`;
            nodes.set(key, { x: Math.round(point.x), y: Math.round(point.y) });
            if (!edges.has(key)) edges.set(key, []);
            return key;
        };

        const addEdge = (a, b) => {
            const ak = addNode(a);
            const bk = addNode(b);
            if (!ak || !bk || ak === bk) return;
            const weight = Math.hypot(nodes.get(bk).x - nodes.get(ak).x, nodes.get(bk).y - nodes.get(ak).y) || 0.001;
            edges.get(ak).push({ key: bk, weight });
            edges.get(bk).push({ key: ak, weight });
        };

        segments.forEach(seg => {
            const points = seg.routePoints;
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                if (!a || !b) continue;
                addEdge(a, b);
            }
        });`;

if (target_regex.test(workerContent)) {
    workerContent = workerContent.replace(target_regex, replacement);
    fs.writeFileSync(workerSystemPath, workerContent, 'utf-8');
    console.log("WorkerSystem.js graph building simplified and updated with tolerance");
} else {
    console.log("WorkerSystem.js target regex not found");
}
