const fs = require('fs');
const path = require('path');

let runtimeCode = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsMergeNodeRuntime.js'), 'utf8');
runtimeCode = runtimeCode.replace(/export class LogisticsMergeNodeRuntime/, 'globalThis.LogisticsMergeNodeRuntime = class LogisticsMergeNodeRuntime');
eval(runtimeCode);

const originalRandom = Math.random;

function createHarness(activeTransfers) {
    const outputRoute = [{ x: 100, y: 100 }, { x: 200, y: 100 }];
    const node = {
        id: 'merge_scheduler',
        outputGroupId: 'output_group',
        inputGroupIds: ['main_input', 'side_a', 'side_b'],
        point: { x: 100, y: 100 }
    };
    const state = {
        logisticsMergeNodes: [node],
        activeTransfers
    };
    const system = {
        ensureLogisticsMergeNodeStore: () => state.logisticsMergeNodes,
        getLogisticsMergeNodeForInputTransfer: (transfer) => {
            if (node.inputGroupIds.includes(transfer.lineId) && transfer.progress >= 0.999) return node;
            return null;
        },
        getLogisticsMergeNodeOutputRoute: () => outputRoute,
        getLogisticsSegmentsByGroupId: () => [{ sourceId: 'merge_output', targetId: 'target', efficiency: 4 }]
    };
    const runtime = new globalThis.LogisticsMergeNodeRuntime(system, () => ({ TILE_SIZE: 20, state }));
    return { node, state, runtime };
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

try {
    Math.random = () => 0;

    const priority = createHarness([
        {
            id: 'a_side_should_wait',
            lineId: 'side_a',
            routePoints: [{ x: 40, y: 100 }, { x: 100, y: 100 }],
            progress: 1,
            sourceId: 'side_source',
            targetId: null
        },
        {
            id: 'z_main_should_enter',
            lineId: 'main_input',
            routePoints: [{ x: 100, y: 40 }, { x: 100, y: 100 }],
            progress: 1,
            sourceId: 'main_source',
            targetId: null
        }
    ]);

    priority.runtime.apply(priority.state);

    const mainTransfer = priority.state.activeTransfers.find(transfer => transfer.id === 'z_main_should_enter');
    const sideTransfer = priority.state.activeTransfers.find(transfer => transfer.id === 'a_side_should_wait');
    assert(mainTransfer.lineId === 'output_group', '主輸入已有物品時必須優先進入 output。');
    assert(sideTransfer.lineId === 'side_a' && sideTransfer.queueBlocked === true, '副輸入在主線優先時必須停在合流點前。');

    const fairness = createHarness([
        {
            id: 'a_side_first',
            lineId: 'side_a',
            routePoints: [{ x: 40, y: 100 }, { x: 100, y: 100 }],
            progress: 1,
            sourceId: 'side_a_source',
            targetId: null
        },
        {
            id: 'b_side_second',
            lineId: 'side_b',
            routePoints: [{ x: 100, y: 40 }, { x: 100, y: 100 }],
            progress: 1,
            sourceId: 'side_b_source',
            targetId: null
        }
    ]);

    fairness.runtime.apply(fairness.state);
    const firstEntered = fairness.state.activeTransfers.find(transfer => transfer.lineId === 'output_group');
    assert(firstEntered.id === 'a_side_first', '主線空時第一個副輸入應依槽位順序進入。');

    fairness.state.activeTransfers = [
        {
            id: 'a_side_replenished',
            lineId: 'side_a',
            routePoints: [{ x: 40, y: 100 }, { x: 100, y: 100 }],
            progress: 1,
            sourceId: 'side_a_source',
            targetId: null
        },
        {
            id: 'b_side_second',
            lineId: 'side_b',
            routePoints: [{ x: 100, y: 40 }, { x: 100, y: 100 }],
            progress: 1,
            sourceId: 'side_b_source',
            targetId: null
        }
    ];
    fairness.state._logisticsMergeAdmissionWinners = {};

    fairness.runtime.apply(fairness.state);
    const secondEntered = fairness.state.activeTransfers.find(transfer => transfer.lineId === 'output_group');
    assert(secondEntered.id === 'b_side_second', '副輸入必須依 currentActiveSlot 輪詢，不能每次固定同一條線。');

    console.log('Logistics merge scheduler test passed.');
} finally {
    Math.random = originalRandom;
}
