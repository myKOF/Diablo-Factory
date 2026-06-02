const fs = require('fs');
const path = require('path');

globalThis.UI_CONFIG = { ConveyorBuild: { alignmentUnit: 1.0 } };
globalThis.GameEngine = {
    TILE_SIZE: 20,
    state: {
        logisticsLines: [],
        logisticsMergeNodes: [],
        activeTransfers: [],
        resources: {},
        mapEntities: []
    },
    addLog: () => {},
    getEntityConfig: () => ({ logistics: { canOutput: true, canInput: true } })
};
globalThis.BuildingSystem = { spendResources: () => true };
globalThis.window = {
    UIManager: {
        getEntityId: ent => ent?.id,
        getBuildingPortSlots: () => [],
        getNearestPortSlot: () => null,
        resolveCurrentPortSlot: (_ent, port) => port || null
    }
};
globalThis.ConveyorRouter = class {};

const conveyorCode = fs.readFileSync(path.join(__dirname, '../src/systems/ConveyorSystem.js'), 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&')
    .replace(/export class ConveyorSystem/, 'globalThis.ConveyorSystem = class ConveyorSystem')
    .replace(/export const conveyorSystem = new ConveyorSystem\(\);/, 'globalThis.conveyorSystem = new ConveyorSystem();');
eval(conveyorCode);

let passed = true;
function assert(condition, message) {
    if (!condition) {
        console.error(`[fail] ${message}`);
        passed = false;
    } else {
        console.log(`[pass] ${message}`);
    }
}

const sys = new globalThis.ConveyorSystem();
GameEngine.state.logisticsLines = [
    {
        id: 'a0',
        groupId: 'gA',
        sourceId: 'source_a',
        targetId: null,
        routePoints: [{ x: 30, y: 30 }, { x: 50, y: 30 }],
        routeWidth: 1,
        order: 0,
        efficiency: 1
    },
    {
        id: 'b0',
        groupId: 'gB',
        sourceId: 'source_b',
        targetId: 'target_b',
        routePoints: [{ x: 50, y: 30 }, { x: 70, y: 30 }],
        routeWidth: 1,
        order: 0,
        efficiency: 1
    }
];

assert(typeof sys.registerLogisticsMergeNode === 'function', 'ConveyorSystem exposes merge-node registration');

if (typeof sys.registerLogisticsMergeNode === 'function') {
    const node = sys.registerLogisticsMergeNode({
        inputGroupId: 'gA',
        outputGroupId: 'gB',
        point: { x: 50, y: 30 }
    });

    const groupIds = [...new Set(GameEngine.state.logisticsLines.map(line => line.groupId))].sort();
    assert(groupIds.join(',') === 'gA,gB', 'merge node keeps both logistics group ids unchanged');
    assert(node && node.inputGroupIds.includes('gA') && node.outputGroupId === 'gB', 'merge node records input and output groups');

    GameEngine.state.activeTransfers = [{
        id: 'item_a',
        itemType: 'wood',
        lineId: 'gA',
        progress: 1,
        routePoints: [{ x: 30, y: 30 }, { x: 50, y: 30 }],
        sourceId: 'source_a',
        targetId: null
    }];

    sys.applyLogisticsMergeNodes(GameEngine.state);
    const transfer = GameEngine.state.activeTransfers[0];
    assert(transfer.lineId === 'gB', 'transfer at input end moves onto output group');
    assert(transfer.progress === 0, 'transferred item restarts at downstream path start');
    assert(Array.isArray(transfer.routePoints) && transfer.routePoints[0]?.x === 50 && transfer.routePoints[1]?.x === 70, 'transferred item receives downstream route');

    GameEngine.state.logisticsMergeNodes = [];
    GameEngine.state.logisticsLines = [
        {
            id: 'branch_mid',
            groupId: 'gC',
            sourceId: 'source_c',
            targetId: null,
            routePoints: [{ x: 50, y: 50 }, { x: 50, y: 70 }],
            routeWidth: 1,
            order: 0,
            efficiency: 1
        },
        {
            id: 'main_mid',
            groupId: 'gD',
            sourceId: 'source_d',
            targetId: 'target_d',
            routePoints: [{ x: 30, y: 70 }, { x: 90, y: 70 }],
            routeWidth: 1,
            order: 0,
            efficiency: 1
        }
    ];
    const midNode = sys.registerLogisticsMergeNode({
        inputGroupId: 'gC',
        outputGroupId: 'gD',
        point: { x: 50, y: 70 },
        inputLine: GameEngine.state.logisticsLines[0],
        outputLine: GameEngine.state.logisticsLines[1]
    });
    const midRoute = sys.getLogisticsMergeNodeOutputRoute(midNode);
    assert(Array.isArray(midRoute) && midRoute.length === 2, 'mid-line merge creates a downstream-only route');
    assert(midRoute?.[0]?.x === 50 && midRoute?.[0]?.y === 70 && midRoute?.[1]?.x === 90 && midRoute?.[1]?.y === 70, 'mid-line merge route follows the target line direction');

    const sameSource = {
        id: 'warehouse_merge_ports',
        outputTargets: [
            { id: null, lineId: 'gUpper', sourcePort: { x: 200, y: 200, dir: 'right', width: 1 } },
            { id: null, lineId: 'gLower', sourcePort: { x: 200, y: 220, dir: 'down', width: 1 } }
        ]
    };
    GameEngine.state.mapEntities = [sameSource];
    GameEngine.state.logisticsLines = [
        {
            id: 'upper_0',
            groupId: 'gUpper',
            sourceId: 'warehouse_merge_ports',
            routePoints: [{ x: 200, y: 200 }, { x: 260, y: 200 }, { x: 260, y: 260 }],
            sourcePort: { x: 200, y: 200, dir: 'right', width: 1 },
            routeWidth: 1,
            order: 0
        },
        {
            id: 'lower_0',
            groupId: 'gLower',
            sourceId: 'warehouse_merge_ports',
            routePoints: [{ x: 200, y: 220 }, { x: 260, y: 220 }, { x: 260, y: 260 }],
            sourcePort: { x: 200, y: 220, dir: 'down', width: 1 },
            routeWidth: 1,
            order: 0
        }
    ];
    const touchedLine = sys.findTouchedLogisticsLineAt({ x: 260, y: 260 }, 'gLower');
    assert(touchedLine?.groupId === 'gUpper', 'geometry touch detection finds the output line at a merge corner');
    sys.registerLogisticsMergeNode({
        inputGroupId: 'gLower',
        outputGroupId: 'gUpper',
        point: { x: 260, y: 260 },
        inputLine: GameEngine.state.logisticsLines[1],
        outputLine: GameEngine.state.logisticsLines[0]
    });
    const groupsAfterPortMerge = [...new Set(GameEngine.state.logisticsLines.map(line => line.groupId))].sort();
    assert(groupsAfterPortMerge.join(',') === 'gLower,gUpper', 'port merge keeps separate input and output group ids');
    assert(sameSource.outputTargets.some(conn => conn.lineId === 'gUpper'), 'upper source port connection remains after merge registration');
    assert(sameSource.outputTargets.some(conn => conn.lineId === 'gLower'), 'lower source port connection remains after merge registration');
    sys.mergeConnectedLogisticsGroups('gUpper');
    const groupsAfterDownstreamExtensionMergeCheck = [...new Set(GameEngine.state.logisticsLines.map(line => line.groupId))].sort();
    assert(groupsAfterDownstreamExtensionMergeCheck.join(',') === 'gLower,gUpper', 'groups linked by a merge node are not auto-merged during later extension recalculation');
    assert(sameSource.outputTargets.some(conn => conn.lineId === 'gUpper'), 'upper source port connection remains after later extension merge check');
    assert(sameSource.outputTargets.some(conn => conn.lineId === 'gLower'), 'lower source port connection remains after later extension merge check');

    const propagated = sys.getLogisticsGroupsConnectedThroughMergeNodes(new Set(['gUpper']));
    assert(propagated.has('gUpper') && propagated.has('gLower'), 'merge input group is treated as connected when its output group is connected');
    const reversePropagated = sys.getLogisticsGroupsConnectedThroughMergeNodes(new Set(['gLower']));
    assert(reversePropagated.has('gUpper') && reversePropagated.has('gLower'), 'connected state propagates across merge groups even if the stored merge direction is reversed');
    const selectionGroup = sys.getLogisticsMergeConnectedGroupIds('gUpper');
    assert(selectionGroup.has('gUpper') && selectionGroup.has('gLower'), 'selecting one merged logistics group includes all merge-connected groups');
    GameEngine.state.selectedLogisticsGroupId = 'gUpper';
    assert(sys.isSelectedLogisticsLine(GameEngine.state.logisticsLines[0]), 'selected output merge group is highlighted');
    assert(sys.isSelectedLogisticsLine(GameEngine.state.logisticsLines[1]), 'selected output merge group highlights input merge group too');
    GameEngine.state.selectedLogisticsGroupId = null;

    GameEngine.state.activeTransfers = [{
        id: 'merge_waiting_item',
        itemType: 'wood',
        lineId: 'gLower',
        progress: 1,
        routePoints: [{ x: 200, y: 220 }, { x: 260, y: 220 }, { x: 260, y: 260 }],
        sourceId: 'warehouse_merge_ports',
        targetId: null,
        queueBlocked: true,
        blockedOnBrokenLine: true
    }];
    sys.applyBlockedTransferQueues(GameEngine.state);
    assert(GameEngine.state.activeTransfers[0].progress === 1, 'merge input transfer is allowed to reach the merge node instead of stopping as a breakpoint');
    assert(GameEngine.state.activeTransfers[0].queueBlocked !== true, 'merge input transfer is not queue-blocked at the merge node');
    assert(GameEngine.state.activeTransfers[0].blockedOnBrokenLine !== true, 'merge input transfer is not marked as blocked on a broken line');
    sys.applyLogisticsMergeNodes(GameEngine.state);
    assert(GameEngine.state.activeTransfers[0].lineId === 'gUpper', 'merge input transfer moves to output group after reaching merge node');
}

if (!passed) process.exit(1);
console.log('logistics merge node tests passed');
