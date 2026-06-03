const fs = require('fs');
const path = require('path');

globalThis.UI_CONFIG = { ConveyorBuild: { alignmentUnit: 1 } };
globalThis.GameEngine = {
    TILE_SIZE: 20,
    state: {
        logisticsLines: [],
        logisticsMergeNodes: [],
        logisticsTurnArrowOverrides: [],
        activeTransfers: [],
        mapEntities: [],
        resources: {},
        pathfinding: { grid: [[0]] },
        selectedLogisticsLineId: null,
        selectedLogisticsGroupId: null,
        selectedLogisticsClickX: null,
        selectedLogisticsClickY: null
    },
    addLog: () => {},
    getEntityConfig: () => null
};
globalThis.window = {
    UIManager: {
        activeLogisticsLine: null,
        activeLogisticsConnection: null,
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

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const sys = new globalThis.ConveyorSystem();

GameEngine.state.logisticsLines = [{
    id: 'line_before',
    groupId: 'g_before',
    routePoints: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    routeWidth: 1
}];
GameEngine.state.logisticsMergeNodes = [{ id: 'merge_before', inputGroupIds: ['g_branch'], outputGroupId: 'g_before' }];
GameEngine.state.logisticsTurnArrowOverrides = [{ overrideKey: 'before' }];
GameEngine.state.resources = { wood: 100, stone: 50 };
GameEngine.state.mapEntities = [{
    id: 'source',
    outputTargets: [{ id: 'target_before', lineId: 'g_before', filter: 'WOOD' }]
}];
GameEngine.state.activeTransfers = [{ id: 'item_live', lineId: 'g_after', progress: 0.75 }];
GameEngine.state.selectedLogisticsLineId = 'line_before';
GameEngine.state.selectedLogisticsGroupId = 'g_before';
GameEngine.state.selectedLogisticsClickX = 1;
GameEngine.state.selectedLogisticsClickY = 2;
window.UIManager.activeLogisticsLine = GameEngine.state.logisticsLines[0];
window.UIManager.activeLogisticsConnection = { lineId: 'g_before', groupId: 'g_before' };

assert(typeof sys.recordLogisticsBuildUndoSnapshot === 'function', 'ConveyorSystem should expose build undo snapshot recording');
assert(typeof sys.undoLastLogisticsBuild === 'function', 'ConveyorSystem should expose build undo');

sys.recordLogisticsBuildUndoSnapshot();

GameEngine.state.logisticsLines = [{
    id: 'line_after',
    groupId: 'g_after',
    routePoints: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
    routeWidth: 1
}];
GameEngine.state.logisticsMergeNodes = [{ id: 'merge_after', inputGroupIds: ['g_new'], outputGroupId: 'g_after' }];
GameEngine.state.logisticsTurnArrowOverrides = [{ overrideKey: 'after' }];
GameEngine.state.resources.wood = 87;
GameEngine.state.mapEntities[0].outputTargets = [{ id: 'target_after', lineId: 'g_after', filter: null }];
GameEngine.state.selectedLogisticsLineId = 'line_after';
GameEngine.state.selectedLogisticsGroupId = 'g_after';
GameEngine.state.selectedLogisticsClickX = 9;
GameEngine.state.selectedLogisticsClickY = 10;
window.UIManager.activeLogisticsLine = GameEngine.state.logisticsLines[0];
window.UIManager.activeLogisticsConnection = { lineId: 'g_after', groupId: 'g_after' };
const liveTransfers = GameEngine.state.activeTransfers;

assert(sys.undoLastLogisticsBuild() === true, 'undo should restore the previous logistics build snapshot');
assert(GameEngine.state.logisticsLines.length === 1 && GameEngine.state.logisticsLines[0].id === 'line_before', 'undo restores logistics lines');
assert(GameEngine.state.logisticsMergeNodes[0].id === 'merge_before', 'undo restores merge nodes');
assert(GameEngine.state.logisticsTurnArrowOverrides[0].overrideKey === 'before', 'undo restores turn arrow overrides');
assert(GameEngine.state.resources.wood === 100 && GameEngine.state.resources.stone === 50, 'undo restores build resources');
assert(GameEngine.state.mapEntities[0].outputTargets[0].lineId === 'g_before', 'undo restores building output targets');
assert(GameEngine.state.selectedLogisticsLineId === 'line_before' && GameEngine.state.selectedLogisticsGroupId === 'g_before', 'undo restores logistics selection state');
assert(window.UIManager.activeLogisticsLine?.id === 'line_before', 'undo restores active logistics line reference');
assert(window.UIManager.activeLogisticsConnection?.lineId === 'g_before', 'undo restores active logistics connection');
assert(GameEngine.state.activeTransfers === liveTransfers && GameEngine.state.activeTransfers[0].lineId === 'g_after', 'undo does not restore logistics items on the line');

for (let i = 0; i < 6; i++) {
    GameEngine.state.logisticsLines = [{ id: `state_${i}`, groupId: `g_${i}`, routePoints: [{ x: i, y: 0 }, { x: i + 1, y: 0 }] }];
    sys.recordLogisticsBuildUndoSnapshot();
    GameEngine.state.logisticsLines = [{ id: `after_${i}`, groupId: `ga_${i}`, routePoints: [{ x: i, y: 0 }, { x: i + 2, y: 0 }] }];
}

for (let expected = 5; expected >= 1; expected--) {
    assert(sys.undoLastLogisticsBuild() === true, `undo stack should restore state_${expected}`);
    assert(GameEngine.state.logisticsLines[0].id === `state_${expected}`, `undo restored ${GameEngine.state.logisticsLines[0].id}, expected state_${expected}`);
}
assert(sys.undoLastLogisticsBuild() === false, 'undo stack should keep only the latest five build snapshots');

console.log('logistics build undo tests passed');
