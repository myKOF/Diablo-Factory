const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/systems/WorkerSystem.js');
let content = fs.readFileSync(filePath, 'utf8');

const target = `                // 計算最後一個傳送帶網格的中心距離
                const points = t.routePoints;
                const hasTarget = !isBreakpoint;
                let dist_pn = totalLength;
                if (Array.isArray(points) && points.length >= 2) {
                    let tempDist = 0;
                    const limit = hasTarget ? points.length - 2 : points.length - 1;`;

const normalize = str => str.replace(/\r\n/g, '\n').trim();

const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTarget = normalize(target);

const replacement = `                // 計算最後一個傳送帶網格的中心距離
                const points = t.routePoints;
                let dist_pn = totalLength;
                if (Array.isArray(points) && points.length >= 2) {
                    let tempDist = 0;
                    const limit = points.length - 2;`;

if (normalizedContent.includes(normalizedTarget)) {
    const isWindowsLineEnding = content.includes('\r\n');
    const newNormalizedContent = normalizedContent.replace(normalizedTarget, replacement);
    const finalContent = isWindowsLineEnding ? newNormalizedContent.replace(/\n/g, '\r\n') : newNormalizedContent;
    
    fs.writeFileSync(filePath, finalContent, 'utf8');
    console.log("Successfully updated WorkerSystem.js breakpoint limit!");
    process.exit(0);
} else {
    console.error("Target content NOT found in WorkerSystem.js!");
    process.exit(1);
}
