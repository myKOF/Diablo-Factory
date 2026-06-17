const fs = require('fs');
const path = require('path');

// 引入 LogisticsMergeNodeRuntime
const { LogisticsMergeNodeRuntime } = require('../src/systems/logistics/LogisticsMergeNodeRuntime.js');

function getRouteLength(points) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
        total += Math.hypot(points[i+1].x - points[i].x, points[i+1].y - points[i].y);
    }
    return total;
}

function getPointOnPath(points, progress) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const total = getRouteLength(points);
    if (total <= 0) return points[0];
    let dist = progress * total;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i+1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (dist <= len || i === points.length - 2) {
            const t = len > 0 ? dist / len : 0;
            return {
                x: a.x + (b.x - a.x) * t,
                y: a.y + (b.y - a.y) * t
            };
        }
        dist -= len;
    }
    return points[points.length - 1];
}

// 模擬
const cellSize = 20;

const state = {
    logisticsMergeNodes: [
        {
            id: 'merge_100,100_output_line',
            nodeId: 'merge_100,100_output_line',
            cellKey: '100,100',
            x: 100,
            y: 100,
            point: { x: 100, y: 100 },
            inputGroupIds: ['input_line'],
            outputGroupId: 'output_line',
            currentActiveSlot: 0,
            roundRobinIndex: 0,
            inputDirections: { 'input_line': { x: 1, y: 0 } },
            outputDir: { x: 1, y: 0 }
        }
    ],
    activeTransfers: [
        {
            id: 't1_front',
            lineId: 'output_line',
            routePoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }],
            progress: 0.05, // 5px 處
            itemType: 'WOOD'
        },
        {
            id: 't2_rear',
            lineId: 'input_line',
            routePoints: [{ x: 0, y: 100 }, { x: 100, y: 100 }],
            progress: 0.70, // 70px 處
            itemType: 'WOOD'
        }
    ]
};

const mockSystem = {
    ensureLogisticsMergeNodeStore: (st) => st.logisticsMergeNodes,
    getLogisticsMergeNodeForInputTransfer: (transfer, st) => {
        return st.logisticsMergeNodes.find(node => node.inputGroupIds.includes(transfer.lineId));
    },
    getLogisticsMergeNodeOutputRoute: (node) => {
        return [{ x: 100, y: 100 }, { x: 200, y: 100 }];
    },
    getLogisticsSegmentsByGroupId: (groupId) => {
        return [{ sourceId: 'src', targetId: 'tgt', efficiency: 4 }];
    }
};

const runtime = new LogisticsMergeNodeRuntime(mockSystem, () => ({
    TILE_SIZE: cellSize,
    state: state
}));

function getTransferPathKey(t) {
    return `line:${t.lineId}`;
}

// 堆積與移動模擬
function step(dt) {
    const transfersByPath = new Map();
    state.activeTransfers.forEach(t => {
        const key = getTransferPathKey(t);
        if (!transfersByPath.has(key)) transfersByPath.set(key, []);
        transfersByPath.get(key).push(t);
    });

    // Stacking
    transfersByPath.forEach((groupTransfers) => {
        groupTransfers.sort((a, b) => b.progress - a.progress);
        let prevMaxDist = Infinity;
        for (let j = 0; j < groupTransfers.length; j++) {
            const t = groupTransfers[j];
            const totalLength = getRouteLength(t.routePoints);
            const desired = t.progress * totalLength;
            let maxDist = totalLength;

            if (j > 0) {
                const frontItem = groupTransfers[j - 1];
                const frontDist = frontItem.progress * getRouteLength(frontItem.routePoints);
                const physicalLimit = Math.max(0, Math.min(frontDist, prevMaxDist) - cellSize);
                maxDist = physicalLimit;
            }

            // Yield limit for output line
            if (t.lineId === 'output_line') {
                const yieldLimit = runtime.getMergeThroughYieldLimit(t, state, cellSize);
                console.log(`  [Debug Yield] ${t.id}: dist=${desired.toFixed(1)}, limit=${yieldLimit}, lastThrough=${state.logisticsMergeNodes[0].lastThroughTransferId}`);
                if (Number.isFinite(yieldLimit)) {
                    maxDist = Math.min(maxDist, yieldLimit);
                }
            }

            prevMaxDist = maxDist;
            t.maxAllowedProgress = maxDist / totalLength;
        }
    });

    // Move
    state.activeTransfers.forEach(t => {
        const speed = 40; // 40px/s
        const total = getRouteLength(t.routePoints);
        const maxAllowed = t.maxAllowedProgress !== undefined ? t.maxAllowedProgress : 1.0;
        
        if (t.progress < maxAllowed) {
            t.progress += dt * (speed / total);
            if (t.progress > maxAllowed) t.progress = maxAllowed;
        } else if (t.progress > maxAllowed) {
            t.progress = maxAllowed; // 被回壓拉回
        }
    });

    // Apply merge node
    runtime.apply(state);
}

console.log("--- 模擬開始 ---");
for (let i = 0; i < 40; i++) {
    step(0.05); // 50ms per step
    console.log(`Step ${i}:`);
    state.activeTransfers.forEach(t => {
        const pos = getPointOnPath(t.routePoints, t.progress);
        console.log(`  ${t.id}: line=${t.lineId}, progress=${t.progress.toFixed(3)}, pos=(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);
    });
}
