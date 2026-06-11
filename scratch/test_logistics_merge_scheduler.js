const fs = require('fs');
const path = require('path');

let runtimeCode = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsMergeNodeRuntime.js'), 'utf8');
runtimeCode = runtimeCode.replace(/export class LogisticsMergeNodeRuntime/, 'globalThis.LogisticsMergeNodeRuntime = class LogisticsMergeNodeRuntime');
eval(runtimeCode);

globalThis.isFinitePoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);
let metricsCode = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsPathMetrics.js'), 'utf8');
metricsCode = metricsCode
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '')
    .replace(/export function (\w+)/g, 'globalThis.$1 = function');
eval(metricsCode);

let queuesCode = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsTransferQueues.js'), 'utf8');
queuesCode = queuesCode
    .split('\n').slice(5).join('\n')
    .replace(/export class LogisticsTransferQueues/, 'globalThis.LogisticsTransferQueues = class LogisticsTransferQueues');
eval(queuesCode);

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

function createQueueHarness(activeTransfers) {
    const outputRoute = [{ x: 100, y: 100 }, { x: 100, y: 260 }];
    const node = {
        id: 'merge_queue',
        outputGroupId: 'output_group',
        inputGroupIds: ['side_a', 'side_b', 'side_c'],
        point: { x: 100, y: 100 }
    };
    const state = {
        logisticsMergeNodes: [node],
        activeTransfers
    };
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
        isLogisticsMergeInputTransfer: (transfer) => !!system.getLogisticsMergeNodeForInputTransfer(transfer)
    }, () => ({ TILE_SIZE: 20, state }));
    return { state, queues };
}

try {
    Math.random = () => 0;

    const firstArrival = createHarness([
        {
            id: 'a_side_should_enter_first',
            lineId: 'side_a',
            routePoints: [{ x: 40, y: 100 }, { x: 100, y: 100 }],
            progress: 1,
            sourceId: 'side_source',
            targetId: null
        },
        {
            id: 'z_main_should_wait',
            lineId: 'main_input',
            routePoints: [{ x: 100, y: 40 }, { x: 100, y: 100 }],
            progress: 0.9,
            sourceId: 'main_source',
            targetId: null
        }
    ]);

    firstArrival.runtime.apply(firstArrival.state);

    const mainTransfer = firstArrival.state.activeTransfers.find(transfer => transfer.id === 'z_main_should_wait');
    const sideTransfer = firstArrival.state.activeTransfers.find(transfer => transfer.id === 'a_side_should_enter_first');
    assert(sideTransfer.lineId === 'output_group', '先到達合流點的輸入線應先進入 output。');
    assert(mainTransfer.lineId === 'main_input', '尚未到達合流點的輸入線不應搶先進入 output。');

    const seededCycle = createHarness([
        {
            id: 'a_side_near',
            lineId: 'side_a',
            routePoints: [{ x: 40, y: 100 }, { x: 100, y: 100 }],
            progress: 0.999,
            serialNumber: 2,
            sourceId: 'side_a_source',
            targetId: null
        },
        {
            id: 'b_side_arrived',
            lineId: 'side_b',
            routePoints: [{ x: 100, y: 40 }, { x: 100, y: 100 }],
            progress: 1,
            serialNumber: 1,
            sourceId: 'side_b_source',
            targetId: null
        }
    ]);

    seededCycle.runtime.apply(seededCycle.state);
    const seededEntered = seededCycle.state.activeTransfers.find(transfer => transfer.lineId === 'output_group');
    assert(seededEntered.id === 'b_side_arrived', '第一次合流可由實際較早抵達者起跑，不強制從槽位 1 開始。');

    const staleWinner = createHarness([
        {
            id: 'old_winner_waiting',
            lineId: 'side_a',
            routePoints: [{ x: 40, y: 100 }, { x: 100, y: 100 }],
            progress: 0.8,
            sourceId: 'side_a_source',
            targetId: null
        },
        {
            id: 'arrived_can_pass',
            lineId: 'side_b',
            routePoints: [{ x: 100, y: 40 }, { x: 100, y: 100 }],
            progress: 1,
            sourceId: 'side_b_source',
            targetId: null
        }
    ]);
    staleWinner.state._logisticsMergeAdmissionWinners = {
        'output_group:100,100': {
            signature: '|old_winner_waiting|',
            winnerId: 'old_winner_waiting',
            winnerSlotIndex: 1,
            committed: false
        }
    };

    staleWinner.runtime.apply(staleWinner.state);
    const staleBypassed = staleWinner.state.activeTransfers.find(transfer => transfer.id === 'arrived_can_pass');
    assert(staleBypassed.lineId === 'output_group', '等待線上的舊 winner 不可永久阻擋已抵達合流點的輸入。');

    const queueWinner = createQueueHarness([
        {
            id: 'winner_at_gate',
            lineId: 'side_a',
            routePoints: [{ x: 20, y: 100 }, { x: 100, y: 100 }],
            progress: 1,
            sourceId: 'side_a_source',
            targetId: null
        },
        {
            id: 'nearby_waiter_b',
            lineId: 'side_b',
            routePoints: [{ x: 100, y: 20 }, { x: 100, y: 100 }],
            progress: 0.85,
            sourceId: 'side_b_source',
            targetId: null
        },
        {
            id: 'nearby_waiter_c',
            lineId: 'side_c',
            routePoints: [{ x: 180, y: 100 }, { x: 100, y: 100 }],
            progress: 0.85,
            sourceId: 'side_c_source',
            targetId: null
        }
    ]);
    queueWinner.queues.applyBlockedQueues(queueWinner.state);
    const admittedWinner = queueWinner.state.activeTransfers.find(transfer => transfer.id === 'winner_at_gate');
    assert(admittedWinner.progress >= 0.999, '合流 winner 不可被其他等待中的 input 反向限速而停在合流點前。');

    const carryEntry = createHarness([
        {
            id: 'front_output',
            lineId: 'output_group',
            routePoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }],
            progress: 0.27,
            sourceId: 'merge_output',
            targetId: 'target'
        },
        {
            id: 'carry_input',
            lineId: 'side_a',
            routePoints: [{ x: 40, y: 100 }, { x: 100, y: 100 }],
            progress: 1,
            sourceId: 'side_a_source',
            targetId: null
        }
    ]);

    carryEntry.runtime.apply(carryEntry.state);
    const carriedInput = carryEntry.state.activeTransfers.find(transfer => transfer.id === 'carry_input');
    assert(carriedInput.lineId === 'output_group', '入口有安全餘量時，input 應進入 output。');
    assert(
        carriedInput.progress === 0,
        `input 進入 output 後必須從合流點連續起步，不可帶進度瞬移，實際 progress=${carriedInput.progress}`
    );

    const queuedWaiter = createHarness([
        {
            id: 'queued_first',
            lineId: 'side_a',
            routePoints: [{ x: 40, y: 100 }, { x: 100, y: 100 }],
            progress: 0.8,
            serialNumber: 1,
            sourceId: 'side_a_source',
            targetId: null
        },
        {
            id: 'arrived_second',
            lineId: 'side_b',
            routePoints: [{ x: 100, y: 40 }, { x: 100, y: 100 }],
            progress: 1,
            serialNumber: 2,
            sourceId: 'side_b_source',
            targetId: null
        }
    ]);
    queuedWaiter.state._logisticsMergeWaitQueues = {
        'output_group:100,100': { queue: ['queued_first'] }
    };

    queuedWaiter.runtime.apply(queuedWaiter.state);
    const stillQueuedFirst = queuedWaiter.state.activeTransfers.find(transfer => transfer.id === 'queued_first');
    const blockedSecond = queuedWaiter.state.activeTransfers.find(transfer => transfer.id === 'arrived_second');
    assert(stillQueuedFirst.lineId === 'side_a', '等待佇列隊首尚未抵達終點時，應保留在 input 線。');
    assert(blockedSecond.lineId === 'side_b' && Math.abs(blockedSecond.progress - (40 / 60)) < 0.001, '後到物品不可插隊，必須停在自身路徑的等待線。');

    stillQueuedFirst.progress = 1;
    queuedWaiter.runtime.apply(queuedWaiter.state);
    assert(stillQueuedFirst.lineId === 'output_group', '等待佇列隊首抵達且 output 可用時應先通過。');
    assert(queuedWaiter.state._logisticsMergeWaitQueues['output_group:100,100'].queue[0] === 'arrived_second', '隊首通過後，下一個等待物品應成為新隊首。');

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
