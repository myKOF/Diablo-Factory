const fs = require('fs');
const path = require('path');

globalThis.UI_CONFIG = {};
globalThis.conveyorSystem = {};
globalThis.window = {
    UIManager: {
        updateValues: () => {}
    }
};

const workerCode = fs.readFileSync(path.join(__dirname, '../src/systems/WorkerSystem.js'), 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&')
    .replace(/export class WorkerSystem/, 'globalThis.WorkerSystem = class WorkerSystem');
eval(workerCode);

const state = {
    activeTransfers: [],
    logisticsLines: [],
    resources: { wood: 10 },
    mapEntities: []
};

const source = {
    id: 'warehouse_1',
    type1: 'warehouse',
    lv: 1,
    x: 0,
    y: 0,
    assignedWorkers: ['worker_1'],
    storage: { wood: 10 },
    outputTargets: [
        {
            id: 'target_1',
            filter: 'wood',
            routePoints: [{ x: 0, y: 0 }, { x: 40, y: 0 }]
        }
    ]
};
const target = {
    id: 'target_1',
    type1: 'barn',
    lv: 1,
    x: 40,
    y: 0
};
state.mapEntities.push(source, target);

const engine = {
    TILE_SIZE: 20,
    state,
    addLog: () => {},
    getFootprint: () => ({ uw: 2, uh: 2 }),
    getBuildingConfig: () => ({ size: '{2,2}' }),
    getEntityConfig: () => ({ need_villagers: 1, logistics: { canOutput: true, canInput: true } })
};

const worker = new globalThis.WorkerSystem(state, engine);
worker.engine = engine;

worker.processAutomatedLogistics(state, 1.9);
if (state.activeTransfers.length !== 0) {
    throw new Error(`1 名工人未滿 2 秒不應送出物品，實際送出 ${state.activeTransfers.length} 個。`);
}

worker.processAutomatedLogistics(state, 0.1);
if (state.activeTransfers.length !== 1) {
    throw new Error(`1 名工人累積 2 秒應送出 1 個物品，實際送出 ${state.activeTransfers.length} 個。`);
}

console.log('Logistics spawn interval test passed.');
