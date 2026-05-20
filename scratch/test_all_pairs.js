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

const remainingSegments = [];
// Horizontal line: 17 segments.
// Tile 0 to 17.
// seg 0: from (0.5, 1.5) to (1.5, 1.5)
// seg 1: from (1.5, 1.5) to (2.5, 1.5)
// ...
// seg 16: from (16.5, 1.5) to (17.5, 1.5)
for (let i = 0; i <= 16; i++) {
    remainingSegments.push(makeSegment(`h_${i}`, i + 0.5, 1.5, i + 1.5, 1.5));
}

// Vertical line: starts at (17.5, 1.5), goes down.
// Since the first segment (17.5, 1.5) to (17.5, 2.5) is deleted,
// the remaining vertical segments start from (17.5, 2.5).
// v_1: from (17.5, 2.5) to (17.5, 3.5)
// v_2: from (17.5, 3.5) to (17.5, 4.5)
// ...
for (let i = 1; i <= 15; i++) {
    remainingSegments.push(makeSegment(`v_${i}`, 17.5, i + 1.5, 17.5, i + 2.5));
}

// The deleted corner segment is v_0: from (17.5, 1.5) to (17.5, 2.5)
const deletedLine = makeSegment("v_0", 17.5, 1.5, 17.5, 2.5);

console.log("Remaining segments count:", remainingSegments.length);

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
    const nearDeleted = point => Math.hypot((point?.x || 0) - deletedPoint.x, (point?.y || 0) - deletedPoint.y) < threshold;
    return nearDeleted(p1) || nearDeleted(p2) || nearDeleted(midPoint);
};

const isNearTurnEndpoint = (p1, p2, a, b) => {
    const aPts = a.routePoints;
    const bPts = b.routePoints;
    if (isDeletedBridge(p1, p2)) return false;
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    if (dist > TILE_SIZE + threshold) return false;
    const aDir = getDir(aPts);
    const bDir = getDir(bPts);
    return aDir.x !== bDir.x && aDir.y !== bDir.y;
};

let connectedCount = 0;
for (let i = 0; i < remainingSegments.length; i++) {
    for (let j = i + 1; j < remainingSegments.length; j++) {
        const a = remainingSegments[i];
        const b = remainingSegments[j];
        const aPts = a.routePoints;
        const bPts = b.routePoints;
        const aStart = aPts[0]; const aEnd = aPts[aPts.length - 1];
        const bStart = bPts[0]; const bEnd = bPts[bPts.length - 1];

        const connected = 
            (Math.hypot(aStart.x - bStart.x, aStart.y - bStart.y) < threshold) ||
            (Math.hypot(aStart.x - bEnd.x, aStart.y - bEnd.y) < threshold) ||
            (Math.hypot(aEnd.x - bStart.x, aEnd.y - bStart.y) < threshold) ||
            (Math.hypot(aEnd.x - bEnd.x, aEnd.y - bEnd.y) < threshold) ||
            isNearTurnEndpoint(aStart, bStart, a, b) ||
            isNearTurnEndpoint(aStart, bEnd, a, b) ||
            isNearTurnEndpoint(aEnd, bStart, a, b) ||
            isNearTurnEndpoint(aEnd, bEnd, a, b);

        if (connected) {
            // Check if one is horizontal and one is vertical
            if ((a.id.startsWith('h') && b.id.startsWith('v')) || (a.id.startsWith('v') && b.id.startsWith('h'))) {
                console.log(`Connected: ${a.id} and ${b.id}`);
                connectedCount++;
            }
        }
    }
}
console.log("Total cross-line connections:", connectedCount);
