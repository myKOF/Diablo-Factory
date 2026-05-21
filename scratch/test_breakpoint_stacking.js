const fs = require('fs');
const path = require('path');

// ==========================================
// 1. 環境 Mock
// ==========================================
globalThis.UI_CONFIG = {
    ConveyorBuild: {
        alignmentUnit: 1.0,
        directionLockThreshold: 0.5
    }
};

globalThis.GameEngine = {
    TILE_SIZE: 20,
    state: {
        logisticsLines: [],
        activeTransfers: [],
        resources: { wood: 1000 },
        mapEntities: []
    },
    addLog: (msg, type) => console.log(`[GAME LOG][${type}]`, msg),
    getEntityConfig: (type, lv) => {
        if (type === 'timber_factory') {
            return { need_villagers: 1, logistics: { canOutput: true } };
        }
        return { efficiency: 4, logistics: { canOutput: true, canInput: true } };
    }
};

globalThis.ResourceSystem = {
    depositResourceToBuilding: (state, engine, target, itemType, amount, slot) => {
        return false; // 模擬無法存入以觸發 buffer/堆積
    }
};

globalThis.BattleSystem = {
    clearUnitAsTarget: () => {}
};

globalThis.SynthesisSystem = {
    ensureDefaultRecipe: () => {}
};

globalThis.window = {
    UIManager: {
        getEntityId: (ent) => ent ? ent.id : null,
        updateValues: () => {},
        getBuildingPortSlots: (ent) => {
            if (ent && ent.id === 'factory_1') {
                return [{ x: 0, y: 0, dir: 'right', slotIndex: 0, defIndex: 0, width: 1 }];
            }
            return [];
        }
    },
    GAME_STATE: GameEngine.state
};

// ==========================================
// 2. 加載 ES Module 代碼
// ==========================================
const conveyorCode = fs.readFileSync(path.join(__dirname, '../src/systems/ConveyorSystem.js'), 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&')
    .replace(/export class ConveyorSystem/, 'globalThis.ConveyorSystem = class ConveyorSystem')
    .replace(/export const conveyorSystem = new ConveyorSystem\(\);/, 'globalThis.conveyorSystem = new ConveyorSystem();');
eval(conveyorCode);

const workerCode = fs.readFileSync(path.join(__dirname, '../src/systems/WorkerSystem.js'), 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&')
    .replace(/export class WorkerSystem/, 'globalThis.WorkerSystem = class WorkerSystem')
    .replace(/export const workerSystem = new WorkerSystem\(\);/, 'globalThis.workerSystem = new WorkerSystem();');
eval(workerCode);

// ==========================================
// 3. 測試執行
// ==========================================
console.log("=== 開始執行物流斷點持續運輸與堆積單元測試 ===");
let passed = true;

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ [測試失敗] ${message}`);
        passed = false;
    } else {
        console.log(`✅ [測試通過] ${message}`);
    }
}

const sys = new globalThis.ConveyorSystem();
const worker = new globalThis.WorkerSystem();
worker.engine = globalThis.GameEngine;

// 模擬一個起點建築 (木材加工廠)
const sourceEnt = {
    id: 'factory_1',
    type1: 'timber_factory',
    x: 0,
    y: 0,
    lv: 1,
    assignedWorkers: ['worker_1'], // 工人已進駐
    outputBuffer: { WOOD: 10 },
    outputTargets: []
};
GameEngine.state.mapEntities.push(sourceEnt);

// 建立一條無終點的物流線 (斷點)
// 總長度 = 5 格 = 100px (TILE_SIZE = 20)
const routePoints = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 40, y: 0 },
    { x: 60, y: 0 },
    { x: 80, y: 0 },
    { x: 100, y: 0 }
];

const segs = sys.buildLogisticsSegments(
    'group_broken', 'factory_1', null, null,
    routePoints, 1, null, null, null
);
GameEngine.state.logisticsLines.push(...segs);

// 建立連線物件
const myConn = {
    id: null,
    lineId: 'group_broken',
    filter: 'WOOD'
};
sourceEnt.outputTargets.push(myConn);

// 同步連線資訊至起點
sys.upsertLogisticsLine({
    lineId: 'group_broken',
    sourceEnt: sourceEnt,
    targetEnt: null, // 無終點
    points: routePoints,
    routeWidth: 1,
    lineType: 'transport_line',
    efficiency: 4,
    conn: myConn
});

// 驗證 1：起點 outputTargets 是否成功保留連線 (斷點持續運輸)
assert(sourceEnt.outputTargets.length > 0, "起點 outputTargets 應該成功保留未接通終點的物流線連線資訊");
const conn = sourceEnt.outputTargets[0];
assert(conn && conn.lineId === 'group_broken', "連線的 lineId 應為 group_broken");
assert(conn.routePoints.length >= 2, "連線應包含 routePoints 路徑點資訊");

// 驗證 2：物品產出與堆積
// 執行 1 次邏輯更新以產生第一個物品
const testEnt = GameEngine.state.mapEntities[0];
console.log("[DEBUG TEST] entity:", testEnt.id, "type:", testEnt.type1);
console.log("[DEBUG TEST] outputTargets length:", testEnt.outputTargets.length);
if (testEnt.outputTargets.length > 0) {
    const conn = testEnt.outputTargets[0];
    console.log("[DEBUG TEST] conn:", conn);
    const target = GameEngine.state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === conn.id);
    console.log("[DEBUG TEST] conn.id:", conn.id, "target found:", target ? target.id : "null");
}
console.log("[DEBUG TEST] outputBuffer:", testEnt.outputBuffer);

worker.processAutomatedLogistics(GameEngine.state, 0.5); // 工人工作 0.5s，產生第一個物品
console.log("[DEBUG TEST] activeTransfers count after process:", GameEngine.state.activeTransfers.length);
if (GameEngine.state.activeTransfers.length > 0) {
    console.log("[DEBUG TEST] transfer[0]:", GameEngine.state.activeTransfers[0]);
}
assert(GameEngine.state.activeTransfers.length === 1, "應成功產生第 1 個在途物品");

const t1 = GameEngine.state.activeTransfers[0];
// 模擬第 1 個物品運送到最前端
t1.progress = 1.0; 

// 再執行邏輯更新，產生第 2 個物品
worker.processAutomatedLogistics(GameEngine.state, 0.5);
assert(GameEngine.state.activeTransfers.length === 2, "應成功產生第 2 個在途物品");

const t2 = GameEngine.state.activeTransfers[1];
t2.progress = 0.5;

// 推進 10 幀，讓物品有充足時間到達極限位置
for (let step = 0; step < 10; step++) {
    worker.processAutomatedLogistics(GameEngine.state, 0.1);
}

// 驗證 3：堆積位置檢查
// 總長度 = 100px, cellSize = 20px
// 第 1 個物品 (最前端) 應該卡在 100 - 20 = 80px (progress = 0.8)
// 第 2 個物品 應該卡在 80 - 20 = 60px (progress = 0.6)
const t1Dist = t1.progress * 100;
const t2Dist = t2.progress * 100;

assert(Math.abs(t1Dist - 80) < 0.1, `第 1 個物品應堆積在斷點前一格（80px），實際位置：${t1Dist}px`);
assert(Math.abs(t2Dist - 60) < 0.1, `第 2 個物品應在第 1 個物品後方排隊（60px），實際位置：${t2Dist}px`);

console.log("\n===========================================");
if (passed) {
    console.log("🎉 物流斷點與堆積測試全部通過！");
    process.exit(0);
} else {
    console.error("❌ 測試中出現錯誤，請檢查程式碼。");
    process.exit(1);
}
