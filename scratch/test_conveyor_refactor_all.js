const fs = require('fs');
const path = require('path');

// ==========================================
// 1. 環境 Mock
// ==========================================
globalThis.UI_CONFIG = {
    ConveyorBuild: {
        alignmentUnit: 0.5,
        directionLockThreshold: 0.5
    }
};

globalThis.GameEngine = {
    TILE_SIZE: 20,
    state: {
        logisticsLines: [],
        conveyorGhosts: [],
        conveyorValid: false,
        conveyorRouteWidth: 1,
        resources: { wood: 1000, stone: 1000 },
        mapEntities: [],
        pathfinding: {
            grid: Array.from({ length: 20 }, () => new Array(20).fill(0))
        }
    },
    addLog: (msg, type) => console.log(`[GAME LOG][${type}]`, msg),
    triggerWarning: (id, args) => console.warn("[GAME WARN]", id, args),
    getEntityConfig: () => ({ logistics: { canInput: true } })
};

globalThis.window = {
    UIManager: {
        resolveCurrentPortSlot: (ent, port, x, y) => port,
        getNearestPortSlot: (building, x, y, preferredDir) => ({ x, y, dir: 'up' }),
        getEntityId: (ent) => ent ? ent.id : null,
        isPointInsideEntity: () => true,
        getBuildingPortSlots: () => [],
        getOppositeDirection: (dir) => 'down',
        getLogisticsLinesAt: () => []
    }
};

// ==========================================
// 2. 加載 ES Module 代碼
// ==========================================
const routerCode = fs.readFileSync(path.join(__dirname, '../src/systems/ConveyorRouter.js'), 'utf8')
    .replace(/export class ConveyorRouter/, 'globalThis.ConveyorRouter = class ConveyorRouter');
eval(routerCode);

let systemCode = fs.readFileSync(path.join(__dirname, '../src/systems/ConveyorSystem.js'), 'utf8');
systemCode = systemCode.replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&');
systemCode = systemCode.replace(/export class ConveyorSystem/, 'globalThis.ConveyorSystem = class ConveyorSystem');
systemCode = systemCode.replace(/export const conveyorSystem = new ConveyorSystem\(\);/, 'globalThis.conveyorSystem = new ConveyorSystem();');
eval(systemCode);

// ==========================================
// 3. 測試套件
// ==========================================
console.log("=== 開始執行 ConveyorSystem 全面重構單元測試 ===");
let passed = true;

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ [測試失敗] ${message}`);
        passed = false;
    } else {
        console.log(`✅ [測試通過] ${message}`);
    }
}

const instance = new globalThis.ConveyorSystem();
instance.cleanupDeletedLinePreviousTurnOverride = () => {};
instance.recalculateLogisticsGroupEndpoints = () => {};
instance.updateActiveTransfersOnLogisticsChange = () => {};

// --- 測試案例 1：消除非確定性邏輯 (第一階段) ---
console.log("\n--- [第一階段：消除非確定性邏輯] 測試 ---");
assert(instance.isProcessingMerge === false, "初始狀態 isProcessingMerge 應該為 false");

// 模擬刪除操作，檢查 merge 阻斷
const testGroupId = 'test_group_dll';
const seg1 = { id: 'seg_1', groupId: testGroupId, order: 0, gridX: 2, gridY: 2, x: 40, y: 40, routePoints: [{x: 40, y: 40}, {x: 60, y: 40}] };
const seg2 = { id: 'seg_2', groupId: testGroupId, order: 1, gridX: 3, gridY: 2, x: 60, y: 40, routePoints: [{x: 60, y: 40}, {x: 80, y: 40}] };
const seg3 = { id: 'seg_3', groupId: testGroupId, order: 2, gridX: 4, gridY: 2, x: 80, y: 40, routePoints: [{x: 80, y: 40}, {x: 100, y: 40}] };

globalThis.GameEngine.state.logisticsLines = [seg1, seg2, seg3];

// 阻斷檢查測試：手動開啟 isProcessingMerge 後，任何 merge 操作應被阻斷
instance.isProcessingMerge = true;
const mergeResult = instance.mergeConnectedLogisticsGroups(testGroupId);
assert(mergeResult === testGroupId, "isProcessingMerge 為 true 時，mergeConnectedLogisticsGroups 應拒絕合併");
instance.isProcessingMerge = false;

// 測試 deleteLogisticsLineById 的 try...finally 包裝，確保執行後 isProcessingMerge 被歸零
const deleteResult = instance.deleteLogisticsLineById('seg_2');
assert(deleteResult === true, "應該成功刪除 seg_2");
assert(instance.isProcessingMerge === false, "deleteLogisticsLineById 執行完後，isProcessingMerge 最終一定為 false");

// --- 測試案例 2：資料結構升級 DLL (第二階段) ---
console.log("\n--- [第二階段：資料結構升級 DLL] 測試 ---");
const segs = instance.buildLogisticsSegments(
    'group_dll', 'source_1', 'target_1', null,
    [{x: 0, y: 0}, {x: 10, y: 0}, {x: 20, y: 0}, {x: 30, y: 0}, {x: 40, y: 0}], 1,
    null, null, null
);
globalThis.GameEngine.state.logisticsLines.push(...segs);

assert(segs.length > 0, "應成功建立物流段");
assert(segs[0].prevId === null, "第一段的 prevId 應為 null");
assert(segs[0].nextId === segs[1].id, "第一段的 nextId 應指向第二段");
assert(segs[1].prevId === segs[0].id, "第二段的 prevId 應指向第一段");
assert(segs[1].nextId === null, "第二段的 nextId 應為 null");

// 測試 orderLogisticsSegmentsByDirection 指標鏈排序
const reversedSegs = [segs[1], segs[0]]; // 故意打亂順序
const orderedSegs = instance.orderLogisticsSegmentsByDirection(reversedSegs);
assert(orderedSegs[0].id === segs[0].id, "經過指標鏈排序後，第一段應為 segs[0]");
assert(orderedSegs[1].id === segs[1].id, "經過指標鏈排序後，第二段應為 segs[1]");
assert(orderedSegs[0].order === 0, "ordered[0] order 應為 0");
assert(orderedSegs[1].order === 1, "ordered[1] order 應為 1");

// --- 測試案例 3：效能優化 Spatial Partitioning (第三階段) ---
console.log("\n--- [第三階段：效能優化 Spatial Partitioning] 測試 ---");
instance.rebuildSpatialHashGrid();
const queryX = 10;
const queryY = 10;
const nearby = instance.spatialGrid.getNearby(queryX, queryY);
assert(nearby.size > 0, "Spatial Grid 應該能成功檢索出該座標周圍的物流線");

const hits = instance.getLogisticsLinesAt(10, 0);
assert(hits.length > 0, "getLogisticsLinesAt 應能透過 Spatial Grid 高效取得該點的物流線");

// --- 測試案例 4：數值精度強制 (第四階段) ---
console.log("\n--- [第四階段：數值精度強制] 測試 ---");
const gridPos1 = instance.toGrid(10, 10);
const gridPos2 = instance.toGrid(19, 19);
const gridPos3 = instance.toGrid(20, 20);

assert(gridPos1.x === 1 && gridPos1.y === 1, "toGrid(10,10) 應對齊為 (1,1)");
assert(gridPos2.x === 1 && gridPos2.y === 1, "toGrid(19,19) 應強制 Math.floor 映射對齊為 (1,1)");
assert(gridPos3.x === 2 && gridPos3.y === 2, "toGrid(20,20) 應強制 Math.floor 映射對齊為 (2,2)");

console.log("\n===========================================");
if (passed) {
    console.log("🎉 所有重構驗證單元測試皆已成功通過！");
    process.exit(0);
} else {
    console.error("❌ 測試中出現錯誤，請檢查代碼。");
    process.exit(1);
}
