const fs = require('fs');
const path = require('path');

globalThis.UI_CONFIG = { ConveyorBuild: { alignmentUnit: 1.0 } };
globalThis.GameEngine = {
    TILE_SIZE: 20,
    state: { logisticsLines: [], activeTransfers: [], resources: {}, mapEntities: [] },
    addLog: () => {}
};
globalThis.BuildingSystem = {};
globalThis.window = { UIManager: {} };
globalThis.ConveyorRouter = class {};

const conveyorCode = fs.readFileSync(path.join(__dirname, '../src/systems/ConveyorSystem.js'), 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&')
    .replace(/export class ConveyorSystem/, 'globalThis.ConveyorSystem = class ConveyorSystem')
    .replace(/export const conveyorSystem = new ConveyorSystem\(\);/, 'globalThis.conveyorSystem = new ConveyorSystem();');
eval(conveyorCode);

let passed = true;
function assert(condition, message) {
    if (!condition) {
        console.error(`❌ [測試失敗] ${message}`);
        passed = false;
    } else {
        console.log(`✅ [測試通過] ${message}`);
    }
}

const align = GameEngine.TILE_SIZE / 2;
function makeSegment(id, startGx, startGy, endGx, endGy, order, prevId = null, nextId = null) {
    return {
        id,
        groupId: 'extension_group',
        startGx,
        startGy,
        endGx,
        endGy,
        order,
        prevId,
        nextId,
        routePoints: [
            { x: startGx * align, y: startGy * align },
            { x: endGx * align, y: endGy * align }
        ]
    };
}

const segments = [];
for (let i = 0; i < 5; i++) {
    segments.push(makeSegment(`h_${i}`, 1 + i * 2, 1, 3 + i * 2, 1, i, i > 0 ? `h_${i - 1}` : null, i < 4 ? `h_${i + 1}` : null));
}
for (let i = 0; i < 5; i++) {
    segments.push(makeSegment(`v_${i}`, 11, 3 + i * 2, 11, 5 + i * 2, i, i > 0 ? `v_${i - 1}` : null, i < 4 ? `v_${i + 1}` : null));
}
for (let i = 0; i < 4; i++) {
    segments.push(makeSegment(`b_${i}`, 11 - i * 2, 13, 9 - i * 2, 13, i, i > 0 ? `b_${i - 1}` : null, i < 3 ? `b_${i + 1}` : null));
}

const system = new globalThis.ConveyorSystem();
const turnSegments = system.buildLogisticsSegments(
    'turn_group',
    'source',
    null,
    null,
    [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 10, y: 20 }
    ],
    1,
    null,
    null,
    null
);
assert(
    turnSegments.every(seg => seg.routePoints.every(point => point.x <= 10)),
    '奇數 half-step 轉角不應沿舊方向補出轉角外的一格'
);

const ordered = system.orderLogisticsSegmentsByDirection(segments);
const ids = ordered.map(seg => seg.id);

assert(ids[0] === 'h_0', `二次延伸排序應從原始輸出端開始，實際為 ${ids[0]}`);
assert(ids[4] === 'h_4' && ids[5] === 'v_0', `上方連接轉角應由 h_4 接到 v_0，實際為 ${ids[4]} -> ${ids[5]}`);
assert(ids[9] === 'v_4' && ids[10] === 'b_0', `下方轉角應由 v_4 接到 b_0，實際為 ${ids[9]} -> ${ids[10]}`);
assert(ordered.every((seg, index) => seg.order === index), '排序後 order 應重新寫成連續順序');
assert(ordered.every((seg, index) => seg.nextId === (ordered[index + 1]?.id || null)), '排序後 nextId 應與實際相鄰段一致');

if (!passed) process.exit(1);
console.log('🎉 二次延伸物流線排序測試通過！');
