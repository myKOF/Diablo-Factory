const fs = require('fs');
const path = require('path');

globalThis.UI_CONFIG = { ConveyorBuild: { alignmentUnit: 1 } };
globalThis.GameEngine = {
    TILE_SIZE: 20,
    state: {
        logisticsLines: [],
        activeTransfers: [],
        mapEntities: [],
        resources: {},
        pathfinding: { grid: [[0]] }
    },
    addLog: () => {},
    getEntityConfig: () => null
};
globalThis.window = {
    UIManager: {
        getEntityId: ent => ent?.id || null,
        getBuildingPortSlots: () => []
    }
};
globalThis.ConveyorRouter = class {};

let systemCode = fs.readFileSync(path.join(__dirname, '../src/systems/ConveyorSystem.js'), 'utf8');
systemCode = systemCode.replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '');
systemCode = systemCode.replace(/export class ConveyorSystem/, 'globalThis.ConveyorSystem = class ConveyorSystem');
systemCode = systemCode.replace(/export const conveyorSystem = new ConveyorSystem\(\);/, 'globalThis.conveyorSystem = new ConveyorSystem();');
eval(systemCode);

const sys = new globalThis.ConveyorSystem();
const routePoints = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
const mk = (id, distance, blocked = false) => ({
    id,
    lineId: 'g',
    targetId: 'target',
    routePoints,
    progress: distance / 200,
    queueBlocked: blocked
});

GameEngine.state.activeTransfers = [
    mk('front', 100),
    mk('rear', 80.5, true)
];

sys.applyBlockedTransferQueues(GameEngine.state);

const rearDistance = GameEngine.state.activeTransfers[1].progress * 200;
if (Math.abs(rearDistance - 80.5) > 0.000001) {
    throw new Error(`hysteresis hold should preserve sub-cell jitter distance, got ${rearDistance}`);
}
if (GameEngine.state.activeTransfers[1].queueBlocked !== true) {
    throw new Error('blocked transfer should remain blocked until release threshold is exceeded');
}

console.log('queue hysteresis hold passed');
