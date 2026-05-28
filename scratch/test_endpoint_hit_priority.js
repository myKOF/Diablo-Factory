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
const endpointOwner = {
    id: 'seg_16',
    groupId: 'g',
    gridX: 1,
    gridY: 0,
    x: 10,
    y: 0,
    routePoints: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    routeWidth: 1,
    createdAt: 1
};
const actualSegment = {
    id: 'seg_17',
    groupId: 'g',
    gridX: 2,
    gridY: 1,
    x: 20,
    y: 10,
    routePoints: [{ x: 20, y: 0 }, { x: 20, y: 20 }],
    routeWidth: 1,
    createdAt: 1
};

GameEngine.state.logisticsLines = [endpointOwner, actualSegment];
sys.rebuildSpatialHashGrid();

const hit = sys.getLogisticsLineAt(20, 0);
if (hit?.id !== 'seg_17') {
    throw new Error(`actual segment should win over artificial endpoint at the same cell, got ${hit?.id}`);
}

console.log('endpoint hit priority passed');
