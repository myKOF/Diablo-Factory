const fs = require('fs');
const path = require('path');

globalThis.UI_CONFIG = {
    ConveyorBuild: { alignmentUnit: 1.0 },
    LogisticsSystem: { sourcePortCellColor: '#00ff44ff' }
};
globalThis.GameEngine = {
    TILE_SIZE: 20,
    state: {
        logisticsLines: [],
        mapEntities: [],
        resources: {},
        selectedLogisticsLineId: null,
        selectedLogisticsGroupId: null
    },
    addLog: () => {},
    getBuildingConfig: () => ({ logistics: { canOutput: true }, type2: 'gathering', produce_resource: { wood: 1 } }),
    getEntityConfig: () => ({ logistics: { canOutput: true, canInput: true } })
};
globalThis.BuildingSystem = { spendResources: () => true };
globalThis.SynthesisSystem = { getBuildingRecipes: () => [] };
globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    UIManager: {
        uiLayer: { appendChild: () => {} },
        uiPositions: {},
        hideContextMenu: () => {},
        makeDraggable: () => {},
        escapeHtml: value => String(value),
        getIngredientDisplayName: value => String(value),
        getIngredientIcon: () => '',
        getEntityId: ent => ent?.id,
        getBuildingPortSlots: () => []
    }
};
globalThis.document = {
    getElementById: () => null,
    createElement: () => ({
        id: '',
        className: '',
        style: {},
        dataset: {},
        innerHTML: '',
        offsetWidth: 420,
        offsetHeight: 220
    }),
    body: { appendChild: () => {} }
};

globalThis.ConveyorRouter = class {};
const conveyorCode = fs.readFileSync(path.join(__dirname, '../src/systems/ConveyorSystem.js'), 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&')
    .replace(/export class ConveyorSystem/, 'globalThis.ConveyorSystem = class ConveyorSystem')
    .replace(/export const conveyorSystem = new ConveyorSystem\(\);/, 'globalThis.conveyorSystem = new ConveyorSystem();');
eval(conveyorCode);

globalThis.conveyorSystem = new globalThis.ConveyorSystem();

const uiCode = fs.readFileSync(path.join(__dirname, '../src/ui/LogisticsUI.js'), 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&')
    .replace(/export class LogisticsUI/, 'globalThis.LogisticsUI = class LogisticsUI');
eval(uiCode);

let passed = true;
function assert(condition, message) {
    if (!condition) {
        console.error(`[fail] ${message}`);
        passed = false;
    } else {
        console.log(`[pass] ${message}`);
    }
}

const source = {
    id: 'warehouse_1',
    type1: 'warehouse',
    x: 50,
    y: 50,
    outputTargets: [
        { id: 'target_a', lineId: 'gA', filter: null, sourcePort: { x: 50, y: 50, dir: 'right', width: 1 } }
    ]
};
const target = { id: 'target_a', type1: 'factory', x: 110, y: 50 };
GameEngine.state.mapEntities = [source, target];
GameEngine.state.logisticsLines = [
    {
        id: 'seg_port',
        groupId: 'gA',
        sourceId: 'warehouse_1',
        targetId: 'target_a',
        sourcePort: { x: 50, y: 50, dir: 'right', width: 1 },
        routePoints: [{ x: 50, y: 50 }, { x: 70, y: 50 }],
        routeWidth: 1,
        order: 0,
        filter: null
    },
    {
        id: 'seg_downstream',
        groupId: 'gA',
        sourceId: 'warehouse_1',
        targetId: 'target_a',
        sourcePort: { x: 50, y: 50, dir: 'right', width: 1 },
        routePoints: [{ x: 70, y: 50 }, { x: 90, y: 50 }],
        routeWidth: 1,
        order: 1,
        filter: null
    }
];
conveyorSystem.rebuildSpatialHashGrid();

const hits = conveyorSystem.getLogisticsLinesAt(50, 50);
assert(hits.length > 0 && hits[0].id === 'seg_port', 'source-port first cell is clickable even when it overlaps the building');
assert(conveyorSystem.isLogisticsSourcePortCell(hits[0], 50, 50), 'source-port first cell is identifiable as a port filter target');

LogisticsUI.activeLogisticsConnection = {
    source,
    targetId: 'target_a',
    groupId: 'gA',
    lineId: 'seg_port'
};
LogisticsUI.activeLogisticsLine = GameEngine.state.logisticsLines[0];
LogisticsUI.setLogisticsFilter(null, 'wood');
assert(source.outputTargets[0].filter === 'wood', 'filter is stored on the clicked output port connection');
assert(GameEngine.state.logisticsLines.every(line => !line.filter), 'setting a port filter does not write the filter to every segment in the group');

LogisticsUI.clearLogisticsFilter(null);
assert(source.outputTargets[0].filter === null, 'clearing filter only clears the output port connection');
assert(GameEngine.state.logisticsLines.every(line => !line.filter), 'clearing a port filter leaves segment filters untouched');

LogisticsUI.activeLogisticsConnection = null;
LogisticsUI.activeLogisticsLine = null;
LogisticsUI.showLogisticsLineMenu(GameEngine.state.logisticsLines[1], 100, 100);
assert(LogisticsUI.activeLogisticsConnection === null, 'clicking a normal logistics segment does not open the product filter connection');
assert(LogisticsUI.activeLogisticsLine?.id === 'seg_downstream', 'clicking a normal logistics segment still selects the line');

const multiSource = {
    id: 'warehouse_multi',
    type1: 'warehouse',
    x: 200,
    y: 200,
    outputTargets: []
};
GameEngine.state.mapEntities = [multiSource];
window.UIManager.getBuildingPortSlots = () => [
    { x: 200, y: 200, dir: 'right', width: 1, slotIndex: 0, defIndex: 0 },
    { x: 200, y: 220, dir: 'down', width: 1, slotIndex: 1, defIndex: 1 }
];
GameEngine.state.logisticsLines = [
    {
        id: 'seg_multi_right',
        groupId: 'gRight',
        routePoints: [{ x: 200, y: 200 }, { x: 220, y: 200 }],
        routeWidth: 1,
        order: 0
    },
    {
        id: 'seg_multi_down',
        groupId: 'gDown',
        routePoints: [{ x: 200, y: 240 }, { x: 200, y: 260 }],
        routeWidth: 1,
        order: 0
    }
];
conveyorSystem.recalculateLogisticsGroupEndpoints('gRight');
conveyorSystem.recalculateLogisticsGroupEndpoints('gDown');
conveyorSystem.rebuildSpatialHashGrid();
assert(multiSource.outputTargets.length === 2, 'multiple open output lines from one building keep separate port connections');
assert(conveyorSystem.isLogisticsSourcePortCell(GameEngine.state.logisticsLines[0], 200, 200), 'right output line is identified as a source port cell');
assert(conveyorSystem.isLogisticsSourcePortCell(GameEngine.state.logisticsLines[1], 200, 240), 'bottom output line one tile from the port is identified as a source port cell');

const reversedRightLine = {
    id: 'seg_multi_right_reversed',
    groupId: 'gRight',
    sourceId: 'warehouse_multi',
    sourcePort: { x: 200, y: 200, dir: 'right', width: 1, slotIndex: 0, defIndex: 0 },
    routePoints: [{ x: 220, y: 200 }, { x: 200, y: 200 }],
    routeWidth: 1,
    order: 0
};
GameEngine.state.logisticsLines = [reversedRightLine, GameEngine.state.logisticsLines[1]];
conveyorSystem.rebuildSpatialHashGrid();
assert(conveyorSystem.isLogisticsSourcePortCell(reversedRightLine, 200, 200), 'source port remains identifiable when a segment is reordered away from the building');

if (!passed) process.exit(1);
console.log('logistics port filter tests passed');
