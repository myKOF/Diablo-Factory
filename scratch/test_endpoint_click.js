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

let uiCode = fs.readFileSync(path.join(__dirname, '../src/ui/LogisticsUI.js'), 'utf8');
uiCode = uiCode.replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&');
uiCode = uiCode.replace(/export class LogisticsUI/, 'globalThis.LogisticsUI = class LogisticsUI');
eval(uiCode);

// ==========================================
// 3. 測試套件
// ==========================================
console.log("=== 開始執行 物流線空地端點點擊與選取單元測試 ===");
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

// 模擬一條在空地結尾的物流線（無 targetId）
// 起點 (0, 0)，轉角 (20, 0)，終點 (20, 20) — 向下延伸
const lineOpen = {
    id: 'line_open',
    groupId: 'group_open',
    order: 0,
    routeWidth: 1,
    routePoints: [{x: 0, y: 0}, {x: 20, y: 0}, {x: 20, y: 20}],
    targetId: null
};

// 模擬一條連接建築的物流線（有 targetId）
const lineConnected = {
    id: 'line_connected',
    groupId: 'group_conn',
    order: 0,
    routeWidth: 1,
    routePoints: [{x: 100, y: 100}, {x: 120, y: 100}, {x: 120, y: 120}],
    targetId: 'building_target'
};

globalThis.GameEngine.state.logisticsLines = [lineOpen, lineConnected];
instance.rebuildSpatialHashGrid();

// 1. 測試空地結尾物流線的端點 (20, 20) 點擊檢測
const hitsOpenEnd = instance.getLogisticsLinesAt(20, 20);
assert(hitsOpenEnd.length > 0 && hitsOpenEnd[0].id === 'line_open', "空地結尾的物流線，其最前端的端點格子 (20, 20) 應可被點擊選取");

// 2. 測試連接建築物物流線的端點 (120, 120) 點擊檢測
const hitsConnectedEnd = instance.getLogisticsLinesAt(120, 120);
assert(hitsConnectedEnd.length === 0, "連接至建築物的物流線，其端點格子 (120, 120) 已經直接與建築連接，不應作為物流線獨立格子被點擊");

// 3. 測試點擊位置鄰近端點時，LogisticsUI.getLogisticsLineDragPort 所取得的延伸方向
const dragPortOpenEnd = globalThis.LogisticsUI.getLogisticsLineDragPort(lineOpen, 20, 20);
assert(dragPortOpenEnd.dir === 'down', "點擊空地結尾端點 (20, 20) 時，延伸方向應繼承最後一節的朝向 (向下)");

const dragPortOpenStart = globalThis.LogisticsUI.getLogisticsLineDragPort(lineOpen, 0, 0);
assert(dragPortOpenStart.dir === 'right', "點擊起點 (0, 0) 時，延伸方向應使用第一節的朝向 (向右)");

console.log("\n===========================================");
if (passed) {
    console.log("🎉 所有端點點擊與選取測試皆已成功通過！");
    process.exit(0);
} else {
    console.error("❌ 測試中出現錯誤，請檢查代碼。");
    process.exit(1);
}
