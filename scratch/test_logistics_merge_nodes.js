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
            routePoints: [{ x: 200, y: 200 }, { x: 260, y: 200 }, { x: 260, y: 260 }, { x: 260, y: 300 }],
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
        },
        {
            id: 'middle_0',
            groupId: 'gMiddle',
            sourceId: 'warehouse_merge_ports',
            routePoints: [{ x: 200, y: 240 }, { x: 260, y: 240 }, { x: 260, y: 260 }],
            sourcePort: { x: 200, y: 240, dir: 'right', width: 1 },
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
    sys.registerLogisticsMergeNode({
        inputGroupId: 'gMiddle',
        outputGroupId: 'gUpper',
        point: { x: 260, y: 260 },
        inputLine: GameEngine.state.logisticsLines[2],
        outputLine: GameEngine.state.logisticsLines[0]
    });
    const groupsAfterPortMerge = [...new Set(GameEngine.state.logisticsLines.map(line => line.groupId))].sort();
    assert(groupsAfterPortMerge.join(',') === 'gLower,gMiddle,gUpper', 'port merge keeps separate input and output group ids');
    assert(sameSource.outputTargets.some(conn => conn.lineId === 'gUpper'), 'upper source port connection remains after merge registration');
    assert(sameSource.outputTargets.some(conn => conn.lineId === 'gLower'), 'lower source port connection remains after merge registration');
    sys.mergeConnectedLogisticsGroups('gUpper');
    const groupsAfterDownstreamExtensionMergeCheck = [...new Set(GameEngine.state.logisticsLines.map(line => line.groupId))].sort();
    assert(groupsAfterDownstreamExtensionMergeCheck.join(',') === 'gLower,gMiddle,gUpper', 'groups linked by a merge node are not auto-merged during later extension recalculation');
    assert(sameSource.outputTargets.some(conn => conn.lineId === 'gUpper'), 'upper source port connection remains after later extension merge check');
    assert(sameSource.outputTargets.some(conn => conn.lineId === 'gLower'), 'lower source port connection remains after later extension merge check');

    GameEngine.state.logisticsMergeNodes = [];
    GameEngine.state.logisticsLines = [
        {
            id: 'same_point_main_0',
            groupId: 'gSameMain',
            sourceId: 'warehouse_merge_ports',
            sourcePort: { x: 200, y: 240, dir: 'right', width: 1 },
            routePoints: [{ x: 200, y: 240 }, { x: 260, y: 240 }, { x: 260, y: 260 }],
            routeWidth: 1,
            order: 0
        },
        {
            id: 'same_point_branch_0',
            groupId: 'gSameBranch',
            sourceId: 'warehouse_merge_ports',
            sourcePort: { x: 200, y: 220, dir: 'right', width: 1 },
            routePoints: [{ x: 200, y: 220 }, { x: 260, y: 220 }, { x: 260, y: 260 }],
            routeWidth: 1,
            order: 0
        },
        {
            id: 'same_point_last_0',
            groupId: 'gSameLast',
            sourceId: 'warehouse_merge_ports',
            sourcePort: { x: 200, y: 200, dir: 'right', width: 1 },
            routePoints: [{ x: 200, y: 200 }, { x: 260, y: 200 }, { x: 260, y: 260 }],
            routeWidth: 1,
            order: 0
        }
    ];
    sameSource.outputTargets = [
        { id: null, lineId: 'gSameMain', sourcePort: { x: 200, y: 240, dir: 'right', width: 1 } },
        { id: null, lineId: 'gSameBranch', sourcePort: { x: 200, y: 220, dir: 'right', width: 1 } },
        { id: null, lineId: 'gSameLast', sourcePort: { x: 200, y: 200, dir: 'right', width: 1 } }
    ];
    sys.registerLogisticsMergeNode({
        inputGroupId: 'gSameLast',
        outputGroupId: 'gSameBranch',
        point: { x: 260, y: 260 },
        inputLine: GameEngine.state.logisticsLines[2],
        outputLine: GameEngine.state.logisticsLines[1]
    });
    sys.registerLogisticsMergeNode({
        inputGroupId: 'gSameBranch',
        outputGroupId: 'gSameMain',
        point: { x: 260, y: 260 },
        inputLine: GameEngine.state.logisticsLines[1],
        outputLine: GameEngine.state.logisticsLines[0]
    });
    sys.upsertLogisticsLine({
        lineId: 'gSameMain',
        sourceEnt: null,
        targetEnt: null,
        targetPoint: { x: 260, y: 320 },
        points: [{ x: 260, y: 260 }, { x: 260, y: 320 }],
        routeWidth: 1
    });
    const samePointGroupsAfterExtension = [...new Set(GameEngine.state.logisticsLines.map(line => line.groupId))].sort();
    assert(samePointGroupsAfterExtension.join(',') === 'gSameBranch,gSameLast,gSameMain', 'same-point merge component stays as separate groups after extending the main line');
    assert(GameEngine.state.logisticsLines.filter(line => line.groupId === 'gSameLast').every(line => line.order === 0), 'same-point branch keeps its original numbering after main extension');

    const samePointTarget = { id: 'same_point_target', type1: 'town', x: 260, y: 340 };
    GameEngine.state.mapEntities = [sameSource, samePointTarget];
    sys.upsertLogisticsLine({
        lineId: 'gSameMain',
        sourceEnt: null,
        targetEnt: samePointTarget,
        targetPoint: { x: 260, y: 340 },
        points: [{ x: 260, y: 320 }, { x: 260, y: 340 }],
        routeWidth: 1,
        targetPort: { x: 260, y: 340, dir: 'up', width: 1 }
    });
    const connectedSamePointGroups = sys.getLogisticsDisplayConnectedGroupIds(sys.getLogisticsPortConnectedPhysicalGroupIds());
    assert(connectedSamePointGroups.has('gSameMain') && connectedSamePointGroups.has('gSameBranch') && connectedSamePointGroups.has('gSameLast'), 'connecting the extended same-point main line marks the whole merge component connected');
    const deletedSamePointLine = sys.getLogisticsLineAt(270, 270);
    assert(!!deletedSamePointLine, 'same-point merge junction can be selected for deletion');
    sys.deleteLogisticsLineById(deletedSamePointLine.id);
    assert(!GameEngine.state.logisticsMergeNodes.some(node => node?.cellKey === '270,270'), 'deleting a same-point merge junction removes stale merge nodes at that cell');
    const samePointHitsAfterDelete = sys.getLogisticsLinesAt(270, 270);
    assert(samePointHitsAfterDelete.length === 0, 'deleting a same-point merge junction removes the visible orphan cell from all remaining branches');
    const samePointSelectionAfterDelete = sys.getLogisticsMergeConnectedGroupIds('gSameMain');
    assert(!samePointSelectionAfterDelete.has('gSameBranch') && !samePointSelectionAfterDelete.has('gSameLast'), 'deleting a same-point merge junction breaks merge selection membership');
    const samePointTailAfterDelete = GameEngine.state.logisticsLines.find(line => line?.detachedByDeletedGap === true);
    sys.upsertLogisticsLine({
        lineId: 'gSameBranch',
        sourceEnt: null,
        targetEnt: null,
        targetPoint: { x: 270, y: 290 },
        points: [{ x: 260, y: 260 }, { x: 270, y: 290 }],
        routeWidth: 1,
        allowGroupMerge: false
    });
    sys.registerLogisticsMergeNode({
        inputGroupId: 'gSameBranch',
        outputGroupId: samePointTailAfterDelete.groupId,
        point: { x: 270, y: 290 },
        inputLine: GameEngine.state.logisticsLines.find(line => line.groupId === 'gSameBranch' && line.id !== 'same_point_branch_0'),
        outputLine: samePointTailAfterDelete
    });
    const connectedAfterMiddleReconnect = sys.getLogisticsDisplayConnectedGroupIds(sys.getLogisticsPortConnectedPhysicalGroupIds());
    assert(connectedAfterMiddleReconnect.has('gSameBranch'), 'reconnecting the middle same-point branch to the downstream target marks that branch connected');
    assert(!connectedAfterMiddleReconnect.has('gSameMain') && !connectedAfterMiddleReconnect.has('gSameLast'), 'reconnecting the middle same-point branch does not reconnect unrelated same-point branches');

    GameEngine.state.mapEntities = [sameSource];
    GameEngine.state.logisticsMergeNodes = [];
    sameSource.outputTargets = [
        { id: null, lineId: 'gUpper', sourcePort: { x: 200, y: 200, dir: 'right', width: 1 } },
        { id: null, lineId: 'gLower', sourcePort: { x: 200, y: 220, dir: 'down', width: 1 } },
        { id: null, lineId: 'gMiddle', sourcePort: { x: 200, y: 240, dir: 'right', width: 1 } }
    ];
    GameEngine.state.logisticsLines = [
        {
            id: 'upper_0',
            groupId: 'gUpper',
            sourceId: 'warehouse_merge_ports',
            routePoints: [{ x: 200, y: 200 }, { x: 260, y: 200 }, { x: 260, y: 260 }, { x: 260, y: 300 }],
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
        },
        {
            id: 'middle_0',
            groupId: 'gMiddle',
            sourceId: 'warehouse_merge_ports',
            routePoints: [{ x: 200, y: 240 }, { x: 260, y: 240 }, { x: 260, y: 260 }],
            sourcePort: { x: 200, y: 240, dir: 'right', width: 1 },
            routeWidth: 1,
            order: 0
        }
    ];
    sys.registerLogisticsMergeNode({
        inputGroupId: 'gLower',
        outputGroupId: 'gUpper',
        point: { x: 260, y: 260 },
        inputLine: GameEngine.state.logisticsLines[1],
        outputLine: GameEngine.state.logisticsLines[0]
    });
    sys.registerLogisticsMergeNode({
        inputGroupId: 'gMiddle',
        outputGroupId: 'gUpper',
        point: { x: 260, y: 260 },
        inputLine: GameEngine.state.logisticsLines[2],
        outputLine: GameEngine.state.logisticsLines[0]
    });

    const propagated = sys.getLogisticsGroupsConnectedThroughMergeNodes(new Set(['gUpper']));
    assert(propagated.has('gUpper') && propagated.has('gLower') && propagated.has('gMiddle'), 'all merge input groups are treated as connected when their output group is connected');
    const inputOnlyDisplay = sys.getLogisticsDisplayConnectedGroupIds(new Set(['gLower']));
    assert(inputOnlyDisplay.has('gLower') && !inputOnlyDisplay.has('gUpper') && !inputOnlyDisplay.has('gMiddle'), 'merge input connected state does not mark the final output path as connected');
    const lowerLine = GameEngine.state.logisticsLines.find(line => line.groupId === 'gLower');
    const lowerRoute = lowerLine.routePoints.map(point => ({ ...point }));
    lowerLine.routePoints = [{ x: 200, y: 220 }, { x: 220, y: 220 }];
    const propagatedAfterBrokenMerge = sys.getLogisticsGroupsConnectedThroughMergeNodes(new Set(['gUpper']));
    assert(!propagatedAfterBrokenMerge.has('gLower') && propagatedAfterBrokenMerge.has('gMiddle'), 'stale merge node stops propagating connected state only for the physically disconnected input');
    const selectionGroupAfterBrokenInput = sys.getLogisticsMergeConnectedGroupIds('gUpper');
    assert(selectionGroupAfterBrokenInput.has('gUpper') && selectionGroupAfterBrokenInput.has('gLower') && selectionGroupAfterBrokenInput.has('gMiddle'), 'merge selection membership remains intact when one input becomes a breakpoint');
    GameEngine.state.logisticsLines.push({
        id: 'lower_reconnect_bridge',
        groupId: 'gLower',
        routePoints: [{ x: 220, y: 220 }, { x: 240, y: 220 }],
        routeWidth: 1,
        order: 1
    });
    GameEngine.state.logisticsLines.push({
        id: 'lower_deleted_gap_tail',
        groupId: 'gLowerTail',
        detachedFromGroupId: 'gLower',
        detachedAtKey: '220,220',
        detachedByDeletedGap: true,
        routePoints: [{ x: 240, y: 220 }, { x: 260, y: 220 }, { x: 260, y: 260 }],
        routeWidth: 1,
        order: 2
    });
    assert(sys.reconnectDeletedGapContinuationGroups('gLower', 'gLowerTail') === 'gLower', 'reconnecting a broken merge branch restores the original branch group');
    const propagatedAfterBranchReconnect = sys.getLogisticsGroupsConnectedThroughMergeNodes(new Set(['gUpper']));
    assert(propagatedAfterBranchReconnect.has('gLower'), 'reconnected merge branch inherits connected state from the main output again');
    GameEngine.state.logisticsLines = GameEngine.state.logisticsLines.filter(line =>
        line.id !== 'lower_reconnect_bridge' && line.id !== 'lower_deleted_gap_tail'
    );
    lowerLine.routePoints = lowerRoute;
    GameEngine.state.logisticsLines.push({
        id: 'detached_blue_path',
        groupId: 'gDetachedBlue',
        detachedFromGroupId: 'gUpper',
        detachedAtKey: '260,300',
        detachedByDeletedGap: true,
        targetId: 'town_center',
        routePoints: [{ x: 260, y: 300 }, { x: 260, y: 320 }],
        routeWidth: 1,
        order: 0
    });
    const displayConnected = sys.getLogisticsDisplayConnectedGroupIds(new Set(['gUpper']));
    assert(displayConnected.has('gDetachedBlue'), 'detached downstream continuation keeps connected display state from its original group');
    const upperLine = GameEngine.state.logisticsLines.find(line => line.groupId === 'gUpper');
    const upperRoute = upperLine.routePoints.map(point => ({ ...point }));
    upperLine.suppressedOpenEndpointCellKey = '260,300';
    const displayConnectedAfterGap = sys.getLogisticsDisplayConnectedGroupIds(new Set(['gUpper']));
    assert(!displayConnectedAfterGap.has('gDetachedBlue'), 'detached downstream continuation stops inheriting connected display state across a deleted gap endpoint');
    delete upperLine.suppressedOpenEndpointCellKey;
    upperLine.routePoints = [{ x: 200, y: 200 }, { x: 260, y: 200 }, { x: 260, y: 260 }];
    const displayConnectedAfterPhysicalBreak = sys.getLogisticsDisplayConnectedGroupIds(new Set(['gUpper']));
    assert(!displayConnectedAfterPhysicalBreak.has('gDetachedBlue'), 'detached downstream continuation stops inheriting connected display state when the split point is no longer physically connected');
    const displayConnectedAfterMainBreak = sys.getLogisticsDisplayConnectedGroupIds(new Set());
    assert(!displayConnectedAfterMainBreak.has('gLower') && !displayConnectedAfterMainBreak.has('gMiddle'), 'merge branches are disconnected when the main output path is broken');
    upperLine.suppressedOpenEndpointCellKey = '260,260';
    lowerLine.routePoints = [{ x: 200, y: 220 }, { x: 220, y: 220 }];
    GameEngine.state.logisticsLines.push({
        id: 'reconnected_gap_bridge',
        groupId: 'gReconnectBridge',
        routePoints: [{ x: 260, y: 260 }, { x: 260, y: 300 }],
        routeWidth: 1,
        order: 0
    });
    GameEngine.state.logisticsLines.push({
        id: 'side_split_spur',
        groupId: 'gSideSplit',
        targetId: 'side_town_port',
        routePoints: [{ x: 260, y: 260 }, { x: 240, y: 260 }],
        routeWidth: 1,
        order: 0
    });
    const displayConnectedAfterBridgeReconnect = sys.getLogisticsDisplayConnectedGroupIds(new Set());
    assert(
        displayConnectedAfterBridgeReconnect.has('gUpper') &&
        displayConnectedAfterBridgeReconnect.has('gReconnectBridge') &&
        displayConnectedAfterBridgeReconnect.has('gDetachedBlue') &&
        !displayConnectedAfterBridgeReconnect.has('gLower') &&
        displayConnectedAfterBridgeReconnect.has('gMiddle'),
        'reconnecting a deleted output gap restores connected display state only for branches still attached to the main line'
    );
    assert(!displayConnectedAfterBridgeReconnect.has('gSideSplit'), 'side split pulled from the main line does not become connected just because the main line is connected');
    GameEngine.state.logisticsLines = GameEngine.state.logisticsLines.filter(line =>
        line.id !== 'reconnected_gap_bridge' && line.id !== 'side_split_spur'
    );
    lowerLine.routePoints = lowerRoute;
    delete upperLine.suppressedOpenEndpointCellKey;
    upperLine.routePoints = upperRoute;
    GameEngine.state.logisticsLines.push({
        id: 'middle_split_target_branch',
        groupId: 'gMiddleSplitTarget',
        detachedFromGroupId: 'gUpper',
        detachedAtKey: '260,260',
        targetId: 'side_target_port',
        routePoints: [{ x: 260, y: 260 }, { x: 240, y: 260 }],
        routeWidth: 1,
        order: 0
    });
    const displayConnectedAfterMiddleSplit = sys.getLogisticsDisplayConnectedGroupIds(new Set(['gUpper']));
    assert(!displayConnectedAfterMiddleSplit.has('gMiddleSplitTarget'), 'middle split target branch does not become main-line connected just because it touches the main line');
    GameEngine.state.logisticsLines = GameEngine.state.logisticsLines.filter(line => line.id !== 'middle_split_target_branch');
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
