// Simulate the conveyor segment structure and the orderLogisticsSegmentsByDirection algorithm.

const TILE_SIZE = 64;
const align = 32;

function makeSegment(groupId, id, startGx, startGy, endGx, endGy, order) {
    return {
        id,
        groupId,
        startGx,
        startGy,
        endGx,
        endGy,
        order,
        routePoints: [
            { x: startGx * align, y: startGy * align },
            { x: endGx * align, y: endGy * align }
        ]
    };
}

// Group segments
const groupSegs = [];

// 1. Horizontal top row (0..10)
// Spans x from 1 to 23 (22 units = 11 tiles), y = 1
for (let i = 0; i <= 10; i++) {
    groupSegs.push(makeSegment("g1", `seg_h1_${i}`, 1 + i * 2, 1, 3 + i * 2, 1, i));
}

// 2. Vertical column (11..19)
// Spans y from 3 to 19 (16 units = 8 tiles), x = 23
// NOTE: seg_v_0 starts at (23, 3) because it's the center of the next tile down.
// This leaves a gap of 2 grid units (64px) between seg_h1_10 (ends at 23,1) and seg_v_0 (starts at 23,3).
for (let i = 0; i < 8; i++) {
    groupSegs.push(makeSegment("g1", `seg_v_${i}`, 23, 3 + i * 2, 23, 5 + i * 2, i));
}

// 3. Horizontal bottom row (newly added)
// Spans x from 23 to 1 (going left, 22 units = 11 tiles), y = 19
// NOTE: seg_h2_0 starts at (23, 19) because it's the center of the bottom-right corner.
// There is no gap between seg_v_8 (ends at 23, 21? Wait! Let's check!
// If seg_v_8 starts at 3 + 8 * 2 = 19 and ends at 5 + 8 * 2 = 21.
// And seg_h2_0 starts at 23, 19 and ends at 21, 19.
// So seg_v_8 ends at (23, 21) while seg_h2_0 starts at (23, 19).
// The difference in y is 2 units!
for (let i = 0; i < 11; i++) {
    groupSegs.push(makeSegment("g1", `seg_h2_${i}`, 23 - i * 2, 19, 21 - i * 2, 19, i * 2));
}

// Now run the orderLogisticsSegmentsByDirection algorithm
function orderLogisticsSegmentsByDirection(segments) {
    if (!Array.isArray(segments) || segments.length <= 1) return Array.isArray(segments) ? [...segments] : [];

    const getGCoords = (seg) => {
        if (Number.isFinite(seg?.startGx) && Number.isFinite(seg?.startGy) &&
            Number.isFinite(seg?.endGx)   && Number.isFinite(seg?.endGy)) {
            return { startGx: seg.startGx, startGy: seg.startGy, endGx: seg.endGx, endGy: seg.endGy };
        }
        const s = seg?.routePoints?.[0] || { x: seg?.x || 0, y: seg?.y || 0 };
        const e = seg?.routePoints?.[seg?.routePoints?.length - 1] || s;
        return {
            startGx: Math.round(s.x / align), startGy: Math.round(s.y / align),
            endGx:   Math.round(e.x / align), endGy:   Math.round(e.y / align)
        };
    };
    const gKey = (gx, gy) => `${gx},${gy}`;

    const startMap    = new Map();
    const endKeySet   = new Set();
    
    // We update endKeySet to expand to ±2 to account for corner gaps (which are exactly 2 grid units)
    segments.forEach(seg => {
        const { startGx, startGy, endGx, endGy } = getGCoords(seg);
        startMap.set(gKey(startGx, startGy), seg);
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                const gx = endGx + dx;
                const gy = endGy + dy;
                if (gx === startGx && gy === startGy) continue; // Skip its own start point
                endKeySet.add(gKey(gx, gy));
            }
        }
    });

    console.log("StartMap keys:", Array.from(startMap.keys()));

    // 找真正起點：起點格座標不在任何人的終點泛圍集合裡
    let startSeg = segments.find(seg => {
        const { startGx, startGy } = getGCoords(seg);
        return !endKeySet.has(gKey(startGx, startGy));
    });

    console.log("Found startSeg:", startSeg?.id);

    if (!startSeg) {
        startSeg = [...segments].sort((a, b) =>
            (Number.isFinite(a?.splitSequenceOrder) ? a.splitSequenceOrder : (a.order || 0)) -
            (Number.isFinite(b?.splitSequenceOrder) ? b.splitSequenceOrder : (b.order || 0))
        )[0];
        console.log("Fallback startSeg:", startSeg?.id);
    }

    const ordered   = [];
    const remaining = new Set(segments);
    let current = startSeg;
    while (current && remaining.has(current)) {
        ordered.push(current);
        remaining.delete(current);
        const { endGx, endGy } = getGCoords(current);
        let next = startMap.get(gKey(endGx, endGy));
        if (!next || !remaining.has(next)) {
            // Expand offsets up to ±2 grid units, prioritizing closer ones
            const offsets = [
                // Dist 1
                [-1, 0], [1, 0], [0, -1], [0, 1],
                // Dist 1.41
                [-1, -1], [-1, 1], [1, -1], [1, 1],
                // Dist 2
                [-2, 0], [2, 0], [0, -2], [0, 2],
                // Dist 2.24
                [-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2],
                // Dist 2.83
                [-2, -2], [-2, 2], [2, -2], [2, 2]
            ];
            for (const [dx, dy] of offsets) {
                const candidate = startMap.get(gKey(endGx + dx, endGy + dy));
                if (candidate && remaining.has(candidate)) { next = candidate; break; }
            }
        }
        current = (next && remaining.has(next)) ? next : null;
    }

    console.log("Ordered count in loop:", ordered.length);
    console.log("Remaining size:", remaining.size);

    if (remaining.size > 0) {
        ordered.push(...[...remaining].sort((a, b) =>
            (Number.isFinite(a?.splitSequenceOrder) ? a.splitSequenceOrder : (a.order || 0)) -
            (Number.isFinite(b?.splitSequenceOrder) ? b.splitSequenceOrder : (b.order || 0))
        ));
    }

    return ordered;
}

const result = orderLogisticsSegmentsByDirection(groupSegs);
console.log("Result order:");
result.forEach((seg, idx) => {
    console.log(`${idx}: ${seg.id} (gx: ${seg.startGx} -> ${seg.endGx}, order: ${seg.order})`);
});

