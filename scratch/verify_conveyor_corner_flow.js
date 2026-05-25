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
        activeTransfers: [],
        resources: { wood: 1000 },
        mapEntities: []
    },
    addLog: (msg, type) => console.log(`[GAME LOG][${type}]`, msg)
};

globalThis.window = {
    UIManager: {
        getEntityId: (ent) => ent ? ent.id : null,
        updateValues: () => {},
        getBuildingPortSlots: (ent) => [],
        getNearestPortSlot: (ent, x, y, preferredDir) => {
            return { x: ent.x, y: ent.y, dir: 'right', slotIndex: 0, defIndex: 0, width: 1 };
        },
        getOppositeDirection: (dir) => {
            if (dir === 'right') return 'left';
            if (dir === 'left') return 'right';
            if (dir === 'up') return 'down';
            if (dir === 'down') return 'up';
            return dir;
        },
        resolveCurrentPortSlot: (ent, portSlot, x, y) => {
            return { x: ent.x, y: ent.y, dir: 'right', slotIndex: 0, defIndex: 0, width: 1 };
        },
        getDirectionVector: (dir) => {
            if (dir === 'right') return { x: 1, y: 0 };
            if (dir === 'left') return { x: -1, y: 0 };
            if (dir === 'down') return { x: 0, y: 1 };
            if (dir === 'up') return { x: 0, y: -1 };
            return { x: 0, y: 0 };
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

// 加載 logistics_renderer 獲取 annotateRoutePoints
const rendererCode = fs.readFileSync(path.join(__dirname, '../src/renderers/logistics_renderer.js'), 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&')
    .replace(/export class LogisticsRenderer/, 'globalThis.LogisticsRenderer = class LogisticsRenderer');
eval(rendererCode);

// ==========================================
// 3. 測試執行
// ==========================================
console.log("=== 開始執行傳送帶轉角流動與堆積容差單元測試 ===");
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

// --- 測試 1：轉角處的 isCorner 旗標標記 ---
// 模擬一個 90 度轉角路徑：從 (0,0) 向右至 (40,0)，再向下至 (40,40)
const routePoints = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 40 }
];

const gridPoints = sys.buildGridRoutePoints(routePoints);
const segments = sys.buildLogisticsSegments(
    'line_corner_test', 'factory_1', 'warehouse_1', null,
    gridPoints, 1, null, null, null
);

assert(segments.length > 0, "應成功建立物流段落");

// 檢查是否每個 Seg 都有 isCorner 屬性，且轉角處鄰近段落的 isCorner 為 true
segments.forEach((seg, idx) => {
    console.log(`Segment ${idx}: id=${seg.id}, dir=${seg.dir}, isCorner=${seg.isCorner}`);
});

// 前兩段朝右（dir=0），後兩段朝下（dir=90），轉折點前後的段落 dir 不同，isCorner 應被標記為 true
const hasCornerSegments = segments.some(seg => seg.isCorner === true);
assert(hasCornerSegments, "物流段落中應包含被標記為 isCorner = true 的轉角段落");

// 驗證 `orderLogisticsSegmentsByDirection` 是否能正確保留/更新 isCorner
const ordered = sys.orderLogisticsSegmentsByDirection(segments);
const hasCornerSegmentsInOrdered = ordered.some(seg => seg.isCorner === true);
assert(hasCornerSegmentsInOrdered, "經過重整排序後，物流段落仍應正確保留 isCorner 旗標");

// --- 測試 2：getConnectionTransferRoute 中點位的 isCorner 標記與貝茲曲線插值驗證 ---
const routeInfo = sys.getConnectionTransferRoute(
    { id: 'factory_1', x: 0, y: 0 },
    { id: 'warehouse_1', x: 40, y: 40 },
    { lineId: 'line_corner_test' }
);

assert(routeInfo && routeInfo.points.length >= 3, "傳輸路徑點應正確建立且包含折點");
const cornerPoints = routeInfo.points.filter(p => p.isCorner === true);
assert(cornerPoints.length > 0, "折點點位上應被標記為 isCorner = true");

// 驗證插值在轉彎處是否工作（不產生 null）
LogisticsRenderer.annotateRoutePoints(routeInfo.points);
const midpointProgress = 0.5; // 正好在中間轉彎處附近
const smoothedPos = LogisticsRenderer.getPointOnTransferPath(routeInfo.points, midpointProgress);
assert(smoothedPos !== null && typeof smoothedPos.x === 'number' && typeof smoothedPos.y === 'number', "線性插值應能正常計算座標");
console.log(`轉折點座標為: (${smoothedPos.x.toFixed(2)}, ${smoothedPos.y.toFixed(2)})`);

// --- 測試 3：applyBlockedTransferQueues 的 Tolerance (任務 B) 驗證 ---
// 建立兩個非常接近的物品（距離差小於 TS * 0.5 = 10）
// 假設 TS = 20, 總長度 = 80
const testTransfers = [
    {
        id: 't_front',
        progress: 0.625, // 50 / 80
        routePoints: routeInfo.points,
        lineId: 'line_corner_test',
        targetId: 'warehouse_1'
    },
    {
        id: 't_rear',
        progress: 0.6, // 48 / 80
        routePoints: routeInfo.points,
        lineId: 'line_corner_test',
        targetId: 'warehouse_1'
    }
];

GameEngine.state.activeTransfers = testTransfers;

// 執行 applyBlockedTransferQueues 阻塞更新
sys.applyBlockedTransferQueues(GameEngine.state);

const frontDist = testTransfers[0].progress * 80;
const rearDist = testTransfers[1].progress * 80;

console.log(`更新後位置：前車=${frontDist}px, 後車=${rearDist}px`);
// 兩車距離差為 2px，小於 TS * 0.5 = 10，不應觸發强制間隔 TS (20px) 導致後車被推回到 30px
assert(Math.abs(frontDist - 50) < 0.01, "前車 progress 不應被非預期修改");
assert(rearDist > 40, `後車不應被強行推回至 30px 以下（即不觸發強制間隔 TS），實際位置為：${rearDist}px`);
assert(Math.abs(frontDist - rearDist) < 10, "後車應容許在容差範圍內與前車保持鄰近");

// --- 測試 4：精確網格對齊（消除偏移）驗證 ---
// 模擬有端口偏差的路徑：(0,0)->(20,0)->(40,0)->(50,0) (最後一格是端口，半格長度 10)
// 總長度 = 50px，最後一個傳送帶網格中心 (40,0) 累積距離為 40px
const alignPoints = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 40, y: 0 },
    { x: 50, y: 0 }
];
const testAlignTransfers = [
    {
        id: 't_align_mid',
        progress: 0.8, // 40 / 50 (對齊最後一個網格中心)
        routePoints: alignPoints,
        lineId: 'line_align_test',
        targetId: 'warehouse_1'
    },
    {
        id: 't_align_rear',
        progress: 0.6, // 30 / 50 (想要前進到 30，但應該被限制在 40 - 20 = 20)
        routePoints: alignPoints,
        lineId: 'line_align_test',
        targetId: 'warehouse_1'
    }
];

GameEngine.state.activeTransfers = testAlignTransfers;
sys.applyBlockedTransferQueues(GameEngine.state);

const alignMidDist = testAlignTransfers[0].progress * 50;
const alignRearDist = testAlignTransfers[1].progress * 50;

console.log(`網格對齊後位置：中車=${alignMidDist}px, 後車=${alignRearDist}px`);
assert(Math.abs(alignMidDist - 40) < 0.01, "中車為傳送帶上第一輛車，應對齊到最後一個傳送帶網格中心 40px");
assert(Math.abs(alignRearDist - 20) < 0.01, "後車應在中車 40px 的基礎上減去 TS (20px) 得到 20px (對齊網格中心)");

// --- 測試 5：轉角安全間距（防止重疊）驗證 ---
// 模擬直角路徑：(0,0)->(40,0)->(40,40)
// 轉角在 40px。前車在 50px (已過轉彎)，後車 desired 為 35px (未過轉彎)
// 由於跨越轉角，間距應為 TS * 1.4 = 28px，後車最大允許位置應限制在 50 - 28 = 22px
const cornerRoutePoints = [
    { x: 0, y: 0 },
    { x: 40, y: 0, isCorner: true },
    { x: 40, y: 40 }
];
const testCornerTransfers = [
    {
        id: 't_corner_front',
        progress: 0.625, // 50 / 80
        routePoints: cornerRoutePoints,
        lineId: 'line_corner_spacing_test',
        targetId: 'warehouse_1'
    },
    {
        id: 't_corner_rear',
        progress: 0.4375, // 35 / 80 (想要前進到 35px，但應被限制在 22px)
        routePoints: cornerRoutePoints,
        lineId: 'line_corner_spacing_test',
        targetId: 'warehouse_1'
    }
];

GameEngine.state.activeTransfers = testCornerTransfers;
sys.applyBlockedTransferQueues(GameEngine.state);

const cornerFrontDist = testCornerTransfers[0].progress * 80;
const cornerRearDist = testCornerTransfers[1].progress * 80;

console.log(`轉角排隊安全間距後位置：前車=${cornerFrontDist}px, 後車=${cornerRearDist}px`);
assert(Math.abs(cornerFrontDist - 50) < 0.01, "前車 progress 不應被非預期修改");
assert(Math.abs(cornerRearDist - 22) < 0.01, `後車應被限制在 22px (安全間距 28px)，實際位置為：${cornerRearDist}px`);

// --- 測試 6：updateActiveTransfersOnLogisticsChange 最短路徑尋路（排除盲端）驗證 ---
// 建立一個包含盲端的 groupSegs
// 正常最短路徑為 (0,0) -> (40,0) -> (40,40)
// 水平段有額外多出來的盲端 (40,0) -> (60,0) (不通往終點)
const testSegs = [
    { id: 'seg_1', dir: 0, startGx: 0, startGy: 0, endGx: 40, endGy: 0, routePoints: [{x:0, y:0}, {x:40, y:0}] },
    { id: 'seg_2_blind', dir: 0, startGx: 40, startGy: 0, endGx: 60, endGy: 0, routePoints: [{x:40, y:0}, {x:60, y:0}] },
    { id: 'seg_3', dir: 90, startGx: 40, startGy: 0, endGx: 40, endGy: 40, routePoints: [{x:40, y:0}, {x:40, y:40}] }
];

// Mock UIManager 方法以解決實體查找與連接
const originalGetEntityId = window.UIManager.getEntityId;
const originalGetNearestPortSlot = window.UIManager.getNearestPortSlot;

window.UIManager.getEntityId = (ent) => ent ? ent.id : null;
window.UIManager.getNearestPortSlot = (ent, x, y) => {
    return { x: ent.x, y: ent.y, dir: 'right', slotIndex: 0, defIndex: 0, width: 1 };
};

GameEngine.state.mapEntities = [
    { id: 'factory_1', x: 0, y: 0, type1: 'factory' },
    { id: 'warehouse_1', x: 40, y: 40, type1: 'warehouse' }
];

GameEngine.state.logisticsLines = testSegs.map(seg => ({
    ...seg,
    groupId: 'line_shortest_test',
    sourceId: 'factory_1',
    targetId: 'warehouse_1',
    x: (seg.routePoints[0].x + seg.routePoints[1].x)/2,
    y: (seg.routePoints[0].y + seg.routePoints[1].y)/2
}));

const testActiveTransfer = {
    id: 't_active_route',
    progress: 0.1,
    routePoints: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
    lineId: 'line_shortest_test',
    sourceId: 'factory_1',
    targetId: 'warehouse_1'
};

GameEngine.state.activeTransfers = [testActiveTransfer];

// 執行物流變動更新
sys.updateActiveTransfersOnLogisticsChange(GameEngine.state);

const updatedPoints = testActiveTransfer.routePoints;
console.log("更新後的路徑點：", updatedPoints);
const containsBlindEnd = updatedPoints.some(p => p.x === 60 && p.y === 0);
assert(!containsBlindEnd, "路徑點中不應包含盲端點 (60, 0)");

// --- 測試 7：在途物品路徑方向相反時的自動對齊修正 (子任務 C-2) ---
// 當重新建立路徑，若最短路徑回傳的反向路徑 (例如終點到起點)
// 對齊邏輯應能辨識並對其進行 reverse()，保證傳輸點順序正確
const reversedActiveTransfer = {
    id: 't_reverse_route',
    progress: 0.1,
    routePoints: [{ x: 40, y: 40 }, { x: 0, y: 0 }], // 故意設為反向
    lineId: 'line_shortest_test',
    sourceId: 'factory_1',
    targetId: 'warehouse_1'
};

GameEngine.state.activeTransfers = [reversedActiveTransfer];

// 執行物流變動更新
sys.updateActiveTransfersOnLogisticsChange(GameEngine.state);

const finalPoints = reversedActiveTransfer.routePoints;
console.log("反向對齊後路徑點：", finalPoints);
// 因為 sourceId 為 factory_1 (0,0)，targetId 為 warehouse_1 (40,40)，
// 修正後的首個點應靠近起點，最後一個點靠近終點。
const isFirstCorrect = Math.hypot(finalPoints[0].x - 0, finalPoints[0].y - 0) < 5;
const isLastCorrect = Math.hypot(finalPoints[finalPoints.length - 1].x - 40, finalPoints[finalPoints.length - 1].y - 40) < 5;
assert(isFirstCorrect && isLastCorrect, "反向路徑應已被成功反轉對齊流向");

// --- 測試 8：轉角標記錯位修正與 fallback 拐向判定 (子任務 C-3) ---
// 當 pathPoints 無 Anchor，退回走 fallback 區塊時，
// 驗證 isCorner 標記沒有錯位 (起點不應是 corner，折點才是)
const fallbackActiveTransfer = {
    id: 't_fallback_route',
    progress: 0.1,
    routePoints: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
    lineId: 'line_fallback_test',
    sourceId: 'non_existent_source', // 故意找不到實體以走 fallback !pathPoints 區塊
    targetId: 'non_existent_target'
};

// 設置對應物流線，路徑為 0,0 -> 40,0 -> 40,40
const fallbackSegs = [
    { id: 'fallback_seg_1', dir: 0, startGx: 0, startGy: 0, endGx: 40, endGy: 0, routePoints: [{x:0, y:0}, {x:40, y:0}] },
    { id: 'fallback_seg_2', dir: 90, startGx: 40, startGy: 0, endGx: 40, endGy: 40, routePoints: [{x:40, y:0}, {x:40, y:40}] }
];

GameEngine.state.logisticsLines = fallbackSegs.map(seg => ({
    ...seg,
    groupId: 'line_fallback_test',
    x: (seg.routePoints[0].x + seg.routePoints[1].x)/2,
    y: (seg.routePoints[0].y + seg.routePoints[1].y)/2
}));

GameEngine.state.activeTransfers = [fallbackActiveTransfer];

sys.updateActiveTransfersOnLogisticsChange(GameEngine.state);

const fallbackPoints = fallbackActiveTransfer.routePoints;
console.log("Fallback 標註後的路徑點：", fallbackPoints);
assert(!fallbackPoints[0].isCorner, "Fallback 起點 (0,0) 不應被標記為 isCorner");
assert(fallbackPoints[1].isCorner === true, "Fallback 轉折點 (40,0) 應被正確標記為 isCorner = true");
assert(!fallbackPoints[2]?.isCorner, "Fallback 終點 (40,40) 不應被標記為 isCorner");

// 還原 Mock
window.UIManager.getEntityId = originalGetEntityId;
window.UIManager.getNearestPortSlot = originalGetNearestPortSlot;

console.log("\n===========================================");
if (passed) {
    console.log("🎉 傳送帶轉角流動與堆積容差單元測試全部通過！");
    process.exit(0);
} else {
    console.error("❌ 測試中出現錯誤，請檢查程式碼。");
    process.exit(1);
}
