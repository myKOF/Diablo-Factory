const fs = require('fs');
const path = require('path');

// Mock 環境
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
        return { efficiency: 4, logistics: { canOutput: true, canInput: true } };
    }
};

globalThis.ResourceSystem = {
    depositResourceToBuilding: (state, engine, target, itemType, amount, slot) => {
        return false;
    }
};

globalThis.BattleSystem = {
    clearUnitAsTarget: () => { }
};

globalThis.SynthesisSystem = {
    ensureDefaultRecipe: () => { }
};

globalThis.window = {
    UIManager: {
        getEntityId: (ent) => ent ? ent.id : null,
        updateValues: () => { },
    },
    GAME_STATE: GameEngine.state
};

// Mock isFinitePoint for path metrics
globalThis.isFinitePoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);

// 加載 LogisticsPathMetrics
const metricsCode = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsPathMetrics.js'), 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&')
    .replace(/export function (\w+)/g, 'globalThis.$1 = function');
eval(metricsCode);

// 加載 LogisticsTransferQueues，直接砍掉前五行的 import
const queuesCode = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsTransferQueues.js'), 'utf8')
    .split('\n').slice(5).join('\n')
    .replace(/export class LogisticsTransferQueues/, 'globalThis.LogisticsTransferQueues = class LogisticsTransferQueues');
eval(queuesCode);

const testSystemMock = {
    isLogisticsMergeInputTransfer: (transfer, state) => {
        return transfer.lineId === 'input_line' || transfer.lineId === 'input_line_b';
    },
    getLogisticsMergeNodeForInputTransfer: (transfer, state) => {
        if (transfer.lineId === 'input_line' || transfer.lineId === 'input_line_b') {
            return {
                outputGroupId: 'output_line',
                inputGroupIds: ['input_line', 'input_line_b'],
                point: { x: 100, y: 100 }
            };
        }
        return null;
    }
};
const queuesInstance = new globalThis.LogisticsTransferQueues(testSystemMock, () => GameEngine);

// Mock conveyorSystem
globalThis.conveyorSystem = {
    getLogisticsMergeNodeForInputTransfer: testSystemMock.getLogisticsMergeNodeForInputTransfer,
    isLogisticsMergeInputTransfer: testSystemMock.isLogisticsMergeInputTransfer,
    applyLogisticsMergeNodes: (state) => {
        return false;
    },
    applyBlockedTransferQueues: (state) => {
        // 呼叫實際的 applyBlockedQueues！
        queuesInstance.applyBlockedQueues(state);
    }
};

// 加載 WorkerSystem
const workerCode = fs.readFileSync(path.join(__dirname, '../src/systems/WorkerSystem.js'), 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&')
    .replace(/export class WorkerSystem/, 'globalThis.WorkerSystem = class WorkerSystem')
    .replace(/export const workerSystem = new WorkerSystem\(\);/, 'globalThis.conveyorSystemInstance = new ConveyorSystem();');
eval(workerCode);

// 執行測試
console.log("=== 開始執行跨 Merge Node 合流 Stacking 重疊限制測試 ===");
let passed = true;

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ [測試失敗] ${message}`);
        passed = false;
    } else {
        console.log(`✅ [測試通過] ${message}`);
    }
}

const worker = new globalThis.WorkerSystem();
worker.engine = globalThis.GameEngine;

const t1 = {
    id: 'transfer_output',
    lineId: 'output_line',
    routePoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }],
    progress: 0.0, // 就在起點
    itemType: 'WOOD',
    efficiency: 4
};

const t2 = {
    id: 'transfer_input',
    lineId: 'input_line',
    routePoints: [{ x: 0, y: 100 }, { x: 100, y: 100 }],
    progress: 0.5,
    itemType: 'WOOD',
    efficiency: 4
};

GameEngine.state.activeTransfers = [t1, t2];

worker.processAutomatedLogistics(GameEngine.state, 1.0);
console.log("[DEBUG 1] t2.progress:", t2.progress, "queueBlocked:", t2.queueBlocked);

const t2Dist = t2.progress * 100;
assert(Math.abs(t2Dist - 80) < 0.1, `t2 距離應被限制在 80px (progress = 0.8)，實際位置：${t2Dist}px (progress = ${t2.progress})`);

// 測試 progress 超過 maxAllowed 截斷
t2.progress = 0.95;
t1.progress = 0.0; // 強制將前車拉回起點，確保 neededSpacing 依然為 20px
console.log("[DEBUG 2] setting t2.progress to 0.95, t1.progress to 0.0");
worker.processAutomatedLogistics(GameEngine.state, 0.001); // 使用極微小時間，防止前車前進
console.log("[DEBUG 2] after tick: t2.progress:", t2.progress, "queueBlocked:", t2.queueBlocked);

assert(t2.progress === 0.95, `只停不退：超出的 progress 不應被倒退覆寫，實際：${t2.progress}`);
assert(t2.queueBlocked === true, `只停不退：超出的 progress 應被標記為 queueBlocked`);

const inputA = {
    id: 'admission_input_a',
    lineId: 'input_line',
    routePoints: [{ x: 0, y: 100 }, { x: 100, y: 100 }],
    progress: 0.8,
    itemType: 'WOOD',
    efficiency: 4
};

const inputB = {
    id: 'admission_input_b',
    lineId: 'input_line_b',
    routePoints: [{ x: 100, y: 0 }, { x: 100, y: 100 }],
    progress: 0.8,
    itemType: 'WOOD',
    efficiency: 4
};

GameEngine.state.activeTransfers = [inputA, inputB];
GameEngine.state._logisticsMergeAdmissionWinners = {};
worker.processAutomatedLogistics(GameEngine.state, 1.0);

const admitted = [inputA, inputB].filter(t => t.progress > 0.8001);
const waiting = [inputA, inputB].filter(t => t.progress <= 0.8001);
assert(admitted.length === 1, `同一合流點空出時只能放行一個 input，實際放行：${admitted.length}`);
assert(waiting.length === 1, `同一合流點空出時另一個 input 應停在前一格，實際等待：${waiting.length}`);

if (passed) {
    console.log("🎉 跨 Merge Node 合流 Stacking 測試全部通過！");
    process.exit(0);
} else {
    console.error("❌ 測試有未通過項目！");
    process.exit(1);
}
