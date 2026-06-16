const fs = require('fs');
const path = require('path');

globalThis.isFinitePoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);

let metricsCode = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsPathMetrics.js'), 'utf8');
metricsCode = metricsCode
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '')
    .replace(/export function (\w+)/g, 'globalThis.$1 = function');
eval(metricsCode);

let runtimeCode = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsMergeNodeRuntime.js'), 'utf8');
runtimeCode = runtimeCode.replace(/export class LogisticsMergeNodeRuntime/, 'globalThis.LogisticsMergeNodeRuntime = class LogisticsMergeNodeRuntime');
eval(runtimeCode);

let queuesCode = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsTransferQueues.js'), 'utf8');
queuesCode = queuesCode
    .split('\n').slice(5).join('\n')
    .replace(/export class LogisticsTransferQueues/, 'globalThis.LogisticsTransferQueues = class LogisticsTransferQueues');
eval(queuesCode);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function makeTransfer(id, lineId, progress, serialNumber = 1) {
    return {
        id,
        lineId,
        routePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        progress,
        serialNumber,
        sourceId: `${lineId}_source`,
        targetId: null
    };
}

function createHarness(activeTransfers, nodeOverrides = {}) {
    const node = {
        id: 'arrival_first_merge',
        outputGroupId: 'output_group',
        inputGroupIds: ['side_a', 'side_b', 'side_c'],
        point: { x: 100, y: 0 },
        currentActiveSlot: 1,
        roundRobinIndex: 1,
        hasCommittedAdmission: true,
        ...nodeOverrides
    };
    const state = {
        logisticsMergeNodes: [node],
        activeTransfers
    };
    const outputRoute = [{ x: 100, y: 0 }, { x: 200, y: 0 }];
    const system = {
        ensureLogisticsMergeNodeStore: () => state.logisticsMergeNodes,
        getLogisticsMergeNodeForInputTransfer: (transfer) => {
            return node.inputGroupIds.includes(transfer.lineId) ? node : null;
        },
        getLogisticsMergeNodeOutputRoute: () => outputRoute,
        getLogisticsSegmentsByGroupId: () => [{ sourceId: 'merge_output', targetId: 'target', efficiency: 4 }]
    };
    const runtime = new globalThis.LogisticsMergeNodeRuntime(system, () => ({ TILE_SIZE: 20, state }));
    const queues = new globalThis.LogisticsTransferQueues({
        ...system,
        getLogisticsMergeAdmissionWinner: (...args) => runtime.getLogisticsMergeAdmissionWinner(...args),
        isLogisticsMergeInputTransfer: (transfer) => !!system.getLogisticsMergeNodeForInputTransfer(transfer),
        getLogisticsMergeThroughYieldLimit: (...args) => runtime.getMergeThroughYieldLimit(...args)
    }, () => ({ TILE_SIZE: 20, state }));
    return { node, state, runtime, queues };
}

const arrivalOrder = createHarness([
    makeTransfer('arrived_first_should_win', 'side_a', 0.98, 1),
    makeTransfer('slot_priority_must_wait', 'side_b', 0.9, 2),
    makeTransfer('third_waiter', 'side_c', 0.85, 3)
]);

const winnerId = arrivalOrder.runtime.getLogisticsMergeAdmissionWinner(arrivalOrder.node, arrivalOrder.state, {
    spacing: 20,
    readyDistanceFromEnd: 20
});
assert(
    winnerId === 'arrived_first_should_win',
    `合流 winner 必須由實際先抵達者取得，不可由 currentActiveSlot 指定；實際 winner=${winnerId}`
);

const followSlot = createHarness([
    {
        id: 'front_output_half_clear',
        lineId: 'output_group',
        routePoints: [{ x: 100, y: 0 }, { x: 200, y: 0 }],
        progress: 0.1,
        sourceId: 'merge_output',
        targetId: 'target'
    },
    makeTransfer('next_winner_can_follow', 'side_a', 0.85, 1)
], { currentActiveSlot: 0, roundRobinIndex: 0 });

followSlot.queues.applyBlockedQueues(followSlot.state);
const follower = followSlot.state.activeTransfers.find(transfer => transfer.id === 'next_winner_can_follow');
assert(follower.queueBlocked !== true, 'output 已釋出半格時，下一個 winner 應可繼續跟進補滿空間。');

process.stdout.write('Logistics merge arrival-first test passed.\n');
