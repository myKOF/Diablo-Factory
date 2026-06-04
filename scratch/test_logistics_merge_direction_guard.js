const fs = require('fs');
const path = require('path');

globalThis.GameEngine = {
    TILE_SIZE: 20,
    state: {
        logisticsLines: [],
        logisticsMergeNodes: []
    }
};

const source = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsMergeNodeStore.js'), 'utf8')
    .replace(/import\s+[\s\S]*?from\s+['"].*?['"];?/g, '')
    .replace(/export class LogisticsMergeNodeStore/, 'globalThis.LogisticsMergeNodeStore = class LogisticsMergeNodeStore');
eval(source);

let passed = true;
function assert(condition, message) {
    if (!condition) {
        console.error(`[fail] ${message}`);
        passed = false;
    } else {
        console.log(`[pass] ${message}`);
    }
}

function createSystem() {
    const state = GameEngine.state;
    return {
        snapPointToGridCenter(point) {
            return { x: Math.round(point.x), y: Math.round(point.y) };
        },
        ensureLogisticsMergeNodeStore() {
            if (!Array.isArray(state.logisticsMergeNodes)) state.logisticsMergeNodes = [];
            return state.logisticsMergeNodes;
        },
        getLogisticsSegmentsByGroupId(groupId) {
            return state.logisticsLines.filter(line => (line.groupId || line.id) === groupId);
        },
        clearSuppressedLogisticsConnectionCell() {},
        reassignDeletedGapContinuationToMergeInput() {
            return false;
        },
        isLogisticsMergeNodeInputConnectionIntact() {
            return true;
        },
        getCardinalDirection(from, to) {
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
            return Math.abs(dx) >= Math.abs(dy)
                ? { x: Math.sign(dx) || 1, y: 0 }
                : { x: 0, y: Math.sign(dy) || 1 };
        },
        isPointOnSegment(point, start, end, tolerance = 1) {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const lengthSq = dx * dx + dy * dy;
            if (lengthSq < 0.001) return Math.hypot(point.x - start.x, point.y - start.y) <= tolerance;
            const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq;
            if (t < -0.001 || t > 1.001) return false;
            const projX = start.x + dx * t;
            const projY = start.y + dy * t;
            return Math.hypot(point.x - projX, point.y - projY) <= tolerance;
        },
        getLogisticsLineDirectionAtPoint(line, point) {
            const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
            for (let i = 0; i < points.length - 1; i++) {
                if (this.isPointOnSegment(point, points[i], points[i + 1], GameEngine.TILE_SIZE * 0.25)) {
                    return this.getCardinalDirection(points[i], points[i + 1]);
                }
            }
            return points.length >= 2 ? this.getCardinalDirection(points[0], points[points.length - 1]) : null;
        }
    };
}

const system = createSystem();
const store = new globalThis.LogisticsMergeNodeStore(system);

GameEngine.state.logisticsLines = [
    {
        id: 'input_down',
        groupId: 'gInputDown',
        routePoints: [{ x: 300, y: 180 }, { x: 300, y: 220 }]
    },
    {
        id: 'output_right',
        groupId: 'gOutputRight',
        routePoints: [{ x: 300, y: 220 }, { x: 340, y: 220 }]
    }
];

const validNode = store.registerLogisticsMergeNode({
    inputGroupId: 'gInputDown',
    outputGroupId: 'gOutputRight',
    point: { x: 300, y: 220 },
    inputLine: GameEngine.state.logisticsLines[0],
    outputLine: GameEngine.state.logisticsLines[1]
});
assert(validNode && validNode.outputGroupId === 'gOutputRight', '方向相容時允許註冊 merge node');

GameEngine.state.logisticsMergeNodes = [];
GameEngine.state.logisticsLines = [
    {
        id: 'upper_to_contact',
        groupId: 'gUpperDown',
        routePoints: [{ x: 300, y: 180 }, { x: 300, y: 220 }]
    },
    {
        id: 'lower_wrong_way',
        groupId: 'gLowerWrongWay',
        routePoints: [{ x: 260, y: 220 }, { x: 300, y: 220 }]
    }
];

const invalidNode = store.registerLogisticsMergeNode({
    inputGroupId: 'gUpperDown',
    outputGroupId: 'gLowerWrongWay',
    point: { x: 300, y: 220 },
    inputLine: GameEngine.state.logisticsLines[0],
    outputLine: GameEngine.state.logisticsLines[1]
});
assert(!invalidNode, '輸出線終點位於交會點時禁止註冊 merge node');
assert(GameEngine.state.logisticsMergeNodes.length === 0, '無效方向不會留下 merge node 狀態');

GameEngine.state.logisticsMergeNodes = [{
    id: 'stale_wrong_direction',
    cellKey: '300,220',
    point: { x: 300, y: 220 },
    inputGroupIds: ['gUpperDown'],
    outputGroupId: 'gLowerWrongWay'
}];
const staleNode = store.getLogisticsMergeNodeForInputTransfer({
    id: 'item_on_stale_node',
    lineId: 'gUpperDown',
    progress: 1,
    routePoints: [{ x: 300, y: 180 }, { x: 300, y: 220 }]
}, GameEngine.state);
assert(!staleNode, '殘留的反向 merge node 不會被 runtime 查詢採用');

if (!passed) process.exit(1);
console.log('logistics merge direction guard tests passed');
