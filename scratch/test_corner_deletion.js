const TILE_SIZE = 64;
const threshold = TILE_SIZE * 0.1;

// Mock segment generator
function makeSegment(id, x1, y1, x2, y2) {
    const start = { x: x1 * TILE_SIZE, y: y1 * TILE_SIZE };
    const end = { x: x2 * TILE_SIZE, y: y2 * TILE_SIZE };
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    return {
        id,
        x: centerX,
        y: centerY,
        routePoints: [start, end]
    };
}

// Generate remaining segments
const remainingSegments = [];
// Horizontal line: seg_1 to seg_17.
// seg_17 ends at (17.5, 1.5)
for (let i = 1; i <= 17; i++) {
    remainingSegments.push(makeSegment(`seg_${i}`, i - 0.5, 1.5, i + 0.5, 1.5));
}

// Vertical line: seg_19 to seg_32.
// seg_19 starts at (17.5, 2.5)
for (let i = 19; i <= 32; i++) {
    remainingSegments.push(makeSegment(`seg_${i}`, 17.5, i - 18 + 1.5, 17.5, i - 18 + 2.5));
}

// Deleted corner segment is seg_18 (vertical, from (17.5, 1.5) to (17.5, 2.5))
const deletedLine = makeSegment("seg_18", 17.5, 1.5, 17.5, 2.5);
deletedLine.x += 7; // Introduce 7px offset to break the threshold

console.log("Remaining segments count:", remainingSegments.length);
console.log("Deleted Line Center (with drift):", deletedLine.x, deletedLine.y);

// Perform Split
const adj = new Map();
remainingSegments.forEach(seg => {
    adj.set(seg.id, []);
});

for (let i = 0; i < remainingSegments.length; i++) {
    for (let j = i + 1; j < remainingSegments.length; j++) {
        const a = remainingSegments[i];
        const b = remainingSegments[j];
        const aPts = Array.isArray(a.routePoints) && a.routePoints.length > 0 ? a.routePoints : [{x:a.x, y:a.y}, {x:a.x, y:a.y}];
        const bPts = Array.isArray(b.routePoints) && b.routePoints.length > 0 ? b.routePoints : [{x:b.x, y:b.y}, {x:b.x, y:b.y}];
        const aStart = aPts[0]; const aEnd = aPts[aPts.length - 1];
        const bStart = bPts[0]; const bEnd = bPts[bPts.length - 1];
        
        const getDir = (pts) => {
            const start = pts[0];
            const end = pts[pts.length - 1];
            const dx = (end?.x || 0) - (start?.x || 0);
            const dy = (end?.y || 0) - (start?.y || 0);
            return Math.abs(dx) >= Math.abs(dy)
                ? { x: Math.sign(dx) || 1, y: 0 }
                : { x: 0, y: Math.sign(dy) || 1 };
        };
        const isDeletedBridge = (p1, p2) => {
            const deletedPoint = { x: deletedLine.x || 0, y: deletedLine.y || 0 };
            const midPoint = { x: ((p1?.x || 0) + (p2?.x || 0)) / 2, y: ((p1?.y || 0) + (p2?.y || 0)) / 2 };
            // Use larger tolerance for deleted bridge matching (e.g. 0.75 * TILE_SIZE) to handle grid coordinate drift robustly
            const nearDeleted = point => Math.hypot((point?.x || 0) - deletedPoint.x, (point?.y || 0) - deletedPoint.y) < TILE_SIZE * 0.75;
            return nearDeleted(p1) || nearDeleted(p2) || nearDeleted(midPoint);
        };
        const isNearTurnEndpoint = (p1, p2) => {
            if (isDeletedBridge(p1, p2)) return false;
            const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            if (dist > TILE_SIZE + threshold) return false;
            const aDir = getDir(aPts);
            const bDir = getDir(bPts);
            return aDir.x !== bDir.x && aDir.y !== bDir.y;
        };
        const connected = 
            (Math.hypot(aStart.x - bStart.x, aStart.y - bStart.y) < threshold) ||
            (Math.hypot(aStart.x - bEnd.x, aStart.y - bEnd.y) < threshold) ||
            (Math.hypot(aEnd.x - bStart.x, aEnd.y - bStart.y) < threshold) ||
            (Math.hypot(aEnd.x - bEnd.x, aEnd.y - bEnd.y) < threshold) ||
            isNearTurnEndpoint(aStart, bStart) ||
            isNearTurnEndpoint(aStart, bEnd) ||
            isNearTurnEndpoint(aEnd, bStart) ||
            isNearTurnEndpoint(aEnd, bEnd);
        if (connected) {
            adj.get(a.id).push(b.id);
            adj.get(b.id).push(a.id);
        }
    }
}

const visited = new Set();
const components = [];
remainingSegments.forEach(seg => {
    if (visited.has(seg.id)) return;
    const comp = [];
    const q = [seg.id];
    visited.add(seg.id);
    while(q.length > 0) {
        const cur = q.shift();
        comp.push(cur);
        adj.get(cur).forEach(next => {
            if (!visited.has(next)) {
                visited.add(next);
                q.push(next);
            }
        });
    }
    components.push(comp);
});

console.log("Components found:", components.length);
if (components.length > 1) {
    console.log("Component 0 segments:", components[0]);
    console.log("Component 1 segments:", components[1]);

    // Simulate merge logic
    const primaryLines = components[0].map(id => remainingSegments.find(s => s.id === id));
    const secondaryLines = components[1].map(id => remainingSegments.find(s => s.id === id));

    function areLogisticsGroupsTouching(primaryLines, secondaryLines) {
        const getEndpointDirs = (line) => {
            const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
            if (points.length < 2) return [];
            const start = points[0];
            const end = points[points.length - 1];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const dir = Math.abs(dx) >= Math.abs(dy)
                ? { x: Math.sign(dx) || 1, y: 0 }
                : { x: 0, y: Math.sign(dy) || 1 };
            return [
                { key: `${Math.round(start.x)},${Math.round(start.y)}`, dirX: dir.x, dirY: dir.y },
                { key: `${Math.round(end.x)},${Math.round(end.y)}`, dirX: dir.x, dirY: dir.y }
            ];
        };

        const secondaryEndpoints = new Map();
        secondaryLines.forEach(line => {
            getEndpointDirs(line).forEach(endpoint => {
                if (!secondaryEndpoints.has(endpoint.key)) secondaryEndpoints.set(endpoint.key, []);
                secondaryEndpoints.get(endpoint.key).push(endpoint);
            });
        });

        for (const line of primaryLines) {
            for (const endpoint of getEndpointDirs(line)) {
                const matches = secondaryEndpoints.get(endpoint.key) || [];
                if (matches.some(other => !(other.dirX === -endpoint.dirX && other.dirY === -endpoint.dirY))) {
                    return true;
                }
            }
        }
        return false;
    }

    console.log("Are logistics groups touching?", areLogisticsGroupsTouching(primaryLines, secondaryLines));
}
