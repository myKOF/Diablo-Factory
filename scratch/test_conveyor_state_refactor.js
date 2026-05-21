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
// 2. 動態加載待測試的 ES Module 代碼
// ==========================================
const routerCode = fs.readFileSync(path.join(__dirname, '../src/systems/ConveyorRouter.js'), 'utf8')
    .replace(/export class ConveyorRouter/, 'globalThis.ConveyorRouter = class ConveyorRouter');
eval(routerCode);

let systemCode = fs.readFileSync(path.join(__dirname, '../src/systems/ConveyorSystem.js'), 'utf8');
// 註解掉 import 語句
systemCode = systemCode.replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&');
// 修改 export 為全域變數導出
systemCode = systemCode.replace(/export class ConveyorSystem/, 'globalThis.ConveyorSystem = class ConveyorSystem');
systemCode = systemCode.replace(/export const conveyorSystem = new ConveyorSystem\(\);/, 'globalThis.conveyorSystem = new ConveyorSystem();');
eval(systemCode);

// ==========================================
// 3. 測試執行
// ==========================================
console.log("=== 開始執行 ConveyorSystem 狀態管理重構測試 ===");

let passed = true;
function assert(condition, message) {
    if (!condition) {
        console.error(`❌ [測試失敗] ${message}`);
        passed = false;
    } else {
        console.log(`✅ [測試通過] ${message}`);
    }
}

// 建立實例
const conveyorSystemInstance = new globalThis.ConveyorSystem();

// Stub 掉測試中無關的系統調用
conveyorSystemInstance.cleanupDeletedLinePreviousTurnOverride = () => {};
conveyorSystemInstance.recalculateLogisticsGroupEndpoints = () => {};
conveyorSystemInstance.updateActiveTransfersOnLogisticsChange = () => {};

// 測試案例 1：驗證 mergeLockTicks 能隨著邏輯更新幀正確遞減與解鎖
console.log("\n--- [測試案例 1] 邏輯幀鎖定 (mergeLockTicks) 測試 ---");

const groupId = 'test_group_123';
const seg1 = { id: 'seg_1', groupId, order: 0, gridX: 2, gridY: 2, x: 40, y: 40, routePoints: [{x: 40, y: 40}, {x: 60, y: 40}] };
const seg2 = { id: 'seg_2', groupId, order: 1, gridX: 3, gridY: 2, x: 60, y: 40, routePoints: [{x: 60, y: 40}, {x: 80, y: 40}] };
const seg3 = { id: 'seg_3', groupId, order: 2, gridX: 4, gridY: 2, x: 80, y: 40, routePoints: [{x: 80, y: 40}, {x: 100, y: 40}] };

globalThis.GameEngine.state.logisticsLines = [seg1, seg2, seg3];

// 執行刪除中間線段，觸發中斷分割
console.log("刪除中間線段 seg_2...");
const deleteSuccess = conveyorSystemInstance.deleteLogisticsLineById('seg_2');
assert(deleteSuccess === true, "應該成功刪除線段 seg_2");

// 驗證 mergeLock 被鎖定
assert(conveyorSystemInstance.mergeLock === groupId, "mergeLock 應該被設定為 test_group_123");
assert(conveyorSystemInstance.mergeLockTicks === 2, "mergeLockTicks 應該被初始化為 2");

// 在此鎖定狀態下，嘗試自動合併此群組，驗證是否被拒絕
const mockMergeResult = conveyorSystemInstance.mergeConnectedLogisticsGroups(groupId);
assert(mockMergeResult === groupId, "因為 mergeLock 存在，mergeConnectedLogisticsGroups 應該拒絕合併並直接返回 groupId");

// 模擬第 1 幀 update
conveyorSystemInstance.update(0.016);
assert(conveyorSystemInstance.mergeLockTicks === 1, "update 1 次後，mergeLockTicks 應該變為 1");
assert(conveyorSystemInstance.mergeLock === groupId, "update 1 次後，mergeLock 應該依然維持鎖定");

// 模擬第 2 幀 update
conveyorSystemInstance.update(0.016);
assert(conveyorSystemInstance.mergeLockTicks === 0, "update 2 次後，mergeLockTicks 應該歸零");
assert(conveyorSystemInstance.mergeLock === null, "update 2 次後，mergeLock 應該自動釋放變為 null");


// 測試案例 2：驗證 updateDrag 的同步執行降級 (無 requestAnimationFrame)
console.log("\n--- [測試案例 2] updateDrag 同步更新測試 ---");

let updateDragNowCalled = false;
conveyorSystemInstance.updateDragNow = (x, y) => {
    updateDragNowCalled = true;
    assert(x === 150 && y === 200, "updateDragNow 接收到的座標應該正確");
};

// 確保環境中沒有 requestAnimationFrame
const originalRAF = globalThis.requestAnimationFrame;
delete globalThis.requestAnimationFrame;

// 模擬拖拽開始
conveyorSystemInstance.activeDrag = {
    startX: 100,
    startY: 100,
    startGrid: { x: 5, y: 5 },
    routeWidth: 1,
    directionLocked: false
};

console.log("執行 updateDrag...");
conveyorSystemInstance.updateDrag(150, 200);

assert(updateDragNowCalled === true, "在無 requestAnimationFrame 時，updateDrag 應該同步且立即執行 updateDragNow");
assert(conveyorSystemInstance.isDragFrameQueued === false, "同步執行完畢後 isDragFrameQueued 應該保持 false");

// 還原環境
if (originalRAF) globalThis.requestAnimationFrame = originalRAF;

console.log("\n===========================================");
if (passed) {
    console.log("🎉 所有重構狀態管理測試皆已成功通過！");
    process.exit(0);
} else {
    console.error("❌ 測試中出現錯誤，請檢查代碼。");
    process.exit(1);
}
