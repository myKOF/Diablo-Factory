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

function makeSeg(id, order, start, end) {
    return {
        id,
        groupId: 'g',
        type: 'logistics_segment',
        order,
        splitSequenceOrder: order,
        gridX: Math.round((start.x + end.x) / 20),
        gridY: Math.round((start.y + end.y) / 20),
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
        routePoints: [start, end],
        routeWidth: 1
    };
}

const sys = new globalThis.ConveyorSystem();
GameEngine.state.logisticsLines = [
    makeSeg('seg_0', 0, { x: 0, y: 0 }, { x: 0, y: 20 }),
    makeSeg('seg_1', 1, { x: 0, y: 20 }, { x: 20, y: 20 }),
    makeSeg('seg_2', 2, { x: 20, y: 20 }, { x: 40, y: 20 })
];
sys.rebuildSpatialHashGrid();

if (!sys.deleteLogisticsLineById('seg_1')) {
    throw new Error('deleteLogisticsLineById should delete the selected segment');
}

const frontTail = GameEngine.state.logisticsLines.find(seg => seg.id === 'seg_0');
if (!frontTail?.suppressOpenEndpointCell) {
    throw new Error('front split tail should suppress the artificial open endpoint cell');
}

const downstream = GameEngine.state.logisticsLines.find(seg => seg.id === 'seg_2');
if (!downstream || downstream.groupId === 'g') {
    throw new Error('deleted middle segment should move downstream segments into a new group');
}
if (downstream.detachedFromGroupId !== 'g' || downstream.detachedAtKey !== '0,20') {
    throw new Error('deleted middle segment should tag downstream segments as a continuation of the original group');
}
if (downstream.detachedByDeletedGap !== true) {
    throw new Error('deleted middle segment should distinguish downstream continuation from normal split branches');
}

sys.rebuildSpatialHashGrid();
const endpointHits = sys.getLogisticsLinesAt(0, 20).filter(seg => seg.id === 'seg_0');
if (endpointHits.length > 0) {
    throw new Error('deleted gap endpoint should not be clickable as part of the front segment');
}

GameEngine.state.logisticsLines.push(makeSeg('seg_reconnect', 1.5, { x: 0, y: 20 }, { x: 20, y: 20 }));
if (typeof sys.reconnectDeletedGapContinuationGroups !== 'function') {
    throw new Error('ConveyorSystem should expose deleted-gap continuation reconnect handling');
}
const downstreamGroupId = downstream.groupId;
if (sys.reconnectDeletedGapContinuationGroups('g', downstreamGroupId) !== 'g') {
    throw new Error('reconnecting a deleted main gap should merge the downstream continuation back into the original group');
}
const reconnectedSegments = sys.getLogisticsSegmentsByGroupId('g');
if (reconnectedSegments.length !== 3 || new Set(GameEngine.state.logisticsLines.map(seg => seg.groupId)).size !== 1) {
    throw new Error('reconnected main gap should be a single logistics group');
}
if (reconnectedSegments.some((seg, index) => seg.splitSequenceOrder !== index || seg.order !== index)) {
    throw new Error('reconnected main gap should renumber the main group continuously');
}
if (reconnectedSegments.some(seg => seg.detachedByDeletedGap || seg.detachedFromGroupId || seg.detachedAtKey)) {
    throw new Error('reconnected main gap should clear deleted-gap detached metadata');
}
if (reconnectedSegments.some(seg => seg.suppressOpenEndpointCell || seg.suppressedOpenEndpointCellKey)) {
    throw new Error('reconnected main gap should clear the deleted endpoint suppression');
}

console.log('deleted gap endpoint suppression passed');
