const fs = require('fs');
const path = require('path');

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
        resources: {},
        mapEntities: []
    },
    addLog: () => {},
    triggerWarning: () => {},
    getEntityConfig: () => null
};

globalThis.BuildingSystem = {
    spendResources: () => true
};

globalThis.window = {
    UIManager: {
        getEntityId: (ent) => ent?.id || null,
        getBuildingPortSlots: () => [],
        getNearestPortSlot: () => null
    }
};

const routerCode = fs.readFileSync(path.join(__dirname, '../src/systems/ConveyorRouter.js'), 'utf8')
    .replace(/export class ConveyorRouter/, 'globalThis.ConveyorRouter = class ConveyorRouter');
eval(routerCode);

let systemCode = fs.readFileSync(path.join(__dirname, '../src/systems/ConveyorSystem.js'), 'utf8');
systemCode = systemCode
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&')
    .replace(/export class ConveyorSystem/, 'globalThis.ConveyorSystem = class ConveyorSystem')
    .replace(/export const conveyorSystem = new ConveyorSystem\(\);/, 'globalThis.conveyorSystem = new ConveyorSystem();');
eval(systemCode);

const sys = new globalThis.ConveyorSystem();
sys.recalculateLogisticsGroupEndpoints = () => {};
sys.updateActiveTransfersOnLogisticsChange = () => {};

const sourceEnt = { id: 'source_factory', outputTargets: [] };
GameEngine.state.mapEntities = [sourceEnt];
const original = sys.upsertLogisticsLine({
    sourceEnt,
    targetEnt: null,
    targetPoint: { x: 190, y: 10 },
    points: [{ x: 10, y: 10 }, { x: 190, y: 10 }],
    routeWidth: 1,
    sourcePort: { x: 10, y: 10, dir: 'right', width: 1 }
});

const originalGroupId = original.groupId;
const ordered = sys.getLogisticsSegmentsByGroupId(originalGroupId);
const branchAnchor = ordered[Math.floor(ordered.length / 2)];
const gridUnit = GameEngine.TILE_SIZE / sys.getRouteScale();
const toGhost = (point) => ({ x: point.x / gridUnit, y: point.y / gridUnit });

sys.activeDrag = {
    startX: branchAnchor.x,
    startY: branchAnchor.y,
    sourceLine: branchAnchor,
    sourceEntity: null,
    sourcePort: { sourceType: 'logistics_line', x: branchAnchor.x, y: branchAnchor.y, width: 1 },
    targetBuilding: null,
    targetPort: null,
    routeWidth: 1,
    isLineExtension: true
};
sys.ghosts = [
    toGhost({ x: branchAnchor.x, y: branchAnchor.y }),
    toGhost({ x: branchAnchor.x, y: branchAnchor.y + 40 }),
    toGhost({ x: branchAnchor.x, y: branchAnchor.y + 100 })
];
sys.isValid = true;
sys.submitDrag();

const groupIds = new Set(GameEngine.state.logisticsLines.map(line => line.groupId));
const detachedGroupId = [...groupIds].find(groupId => groupId !== originalGroupId);
if (!groupIds.has(originalGroupId) || !detachedGroupId || groupIds.size !== 2) {
    throw new Error(`Expected exactly original and detached groups, got ${JSON.stringify([...groupIds])}`);
}

const originalGroup = sys.getLogisticsSegmentsByGroupId(originalGroupId);
const detachedGroup = sys.getLogisticsSegmentsByGroupId(detachedGroupId);
if (detachedGroup.length === 0) {
    throw new Error('Detached downstream group is empty.');
}
if (detachedGroup.some(seg => seg.sourceId || seg.targetId || seg.sourcePort || seg.targetPort)) {
    throw new Error('Detached downstream group still has source/target connection metadata.');
}
if (detachedGroup.some(seg => seg.detachedFromGroupId !== originalGroupId)) {
    throw new Error('Detached downstream group is missing split merge-block metadata.');
}
if (!originalGroup.some(seg => Array.isArray(seg.routePoints) && seg.routePoints.some(p => p.y > branchAnchor.y))) {
    throw new Error('Original group did not receive the new side extension.');
}
if (sys.areLogisticsGroupsTouching(originalGroupId, detachedGroupId)) {
    throw new Error('Detached downstream group is still auto-touching the redirected source group.');
}

sys.mergeConnectedLogisticsGroups(originalGroupId);
const groupIdsAfterMergeAttempt = new Set(GameEngine.state.logisticsLines.map(line => line.groupId));
if (groupIdsAfterMergeAttempt.size !== 2) {
    throw new Error('Auto merge reconnected the detached downstream group.');
}

console.log('Middle extension split test passed.');
