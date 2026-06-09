const fs = require('fs');
const path = require('path');

let guardsCode = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsStateGuards.js'), 'utf8');
guardsCode = guardsCode.replace(/export function/g, 'function');
eval(guardsCode);

let metricsCode = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsPathMetrics.js'), 'utf8');
metricsCode = metricsCode
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '')
    .replace(/export function/g, 'function');
eval(metricsCode);

let queuesCode = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsTransferQueues.js'), 'utf8');
queuesCode = queuesCode
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '')
    .replace(/export class LogisticsTransferQueues/, 'globalThis.LogisticsTransferQueues = class LogisticsTransferQueues');
eval(queuesCode);

const route = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
const state = {
    activeTransfers: [
        { id: 'front', lineId: 'line_a', routePoints: route.map(point => ({ ...point })), progress: 0.5, targetId: 'warehouse' },
        { id: 'rear', lineId: 'line_a', routePoints: route.map(point => ({ ...point })), progress: 0.45, targetId: 'warehouse' }
    ]
};
const rearBefore = state.activeTransfers[1].progress;
const queues = new globalThis.LogisticsTransferQueues(
    {
        isLogisticsMergeInputTransfer: () => false
    },
    () => ({ TILE_SIZE: 20 })
);

queues.applyBlockedQueues(state);

const rear = state.activeTransfers.find(transfer => transfer.id === 'rear');
if (!rear.queueBlocked) {
    throw new Error('Rear transfer should be blocked when the front transfer is too close.');
}
const rearDistance = rear.progress * 100;
if (Math.abs(rearDistance - 30) > 0.0001) {
    throw new Error(`Rear transfer should be clamped one ITEM_LENGTH behind the front transfer. Before=${rearBefore}, distance=${rearDistance}`);
}

const brokenRoute = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
const brokenState = {
    logisticsLines: [
        {
            id: 'broken_tail',
            groupId: 'broken_line',
            routePoints: brokenRoute.map(point => ({ ...point })),
            suppressedOpenEndpointCellKey: '100,0',
            suppressOpenEndpointCell: true
        }
    ],
    activeTransfers: [
        {
            id: 'past_deleted_gap',
            lineId: 'broken_line',
            routePoints: brokenRoute.map(point => ({ ...point })),
            progress: 0.95,
            targetId: null
        }
    ]
};

queues.applyBlockedQueues(brokenState);

const brokenTransfer = brokenState.activeTransfers[0];
const brokenDistance = brokenTransfer.progress * 100;
if (Math.abs(brokenDistance - 80) > 0.0001) {
    throw new Error(`Deleted gap transfer should stop one cell before the suppressed endpoint, got ${brokenDistance}px.`);
}
if (brokenTransfer.blockedOnBrokenLine !== true) {
    throw new Error('Deleted gap transfer should be marked blockedOnBrokenLine.');
}

const gapState = {
    logisticsLines: [
        {
            id: 'blocked_line',
            groupId: 'blocked_line',
            routePoints: route.map(point => ({ ...point })),
            suppressedOpenEndpointCellKey: '100,0',
            suppressOpenEndpointCell: true
        }
    ],
    activeTransfers: [
        {
            id: 'blocked_front',
            lineId: 'blocked_line',
            routePoints: route.map(point => ({ ...point })),
            progress: 0.8,
            targetId: null
        },
        {
            id: 'gap_rear',
            lineId: 'blocked_line',
            routePoints: route.map(point => ({ ...point })),
            progress: 0.2,
            targetId: null
        }
    ]
};

queues.applyBlockedQueues(gapState);

const gapRear = gapState.activeTransfers.find(transfer => transfer.id === 'gap_rear');
if (gapRear.queueBlocked === true) {
    throw new Error('Rear transfer with free space ahead should keep moving to close the backpressure gap.');
}

const mergeInputState = {
    activeTransfers: [
        {
            id: 'input_a_start',
            lineId: 'input_a',
            routePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
            progress: 0.1,
            targetId: null
        },
        {
            id: 'input_b_start',
            lineId: 'input_b',
            routePoints: [{ x: 0, y: 20 }, { x: 100, y: 20 }],
            progress: 0.1,
            targetId: null
        }
    ]
};
const mergeInputQueues = new globalThis.LogisticsTransferQueues(
    {
        isLogisticsMergeInputTransfer: transfer => transfer.lineId === 'input_a' || transfer.lineId === 'input_b',
        getLogisticsMergeNodeForInputTransfer: () => ({
            outputGroupId: 'output_group',
            inputGroupIds: ['input_a', 'input_b'],
            point: { x: 100, y: 0 }
        })
    },
    () => ({ TILE_SIZE: 20 })
);
mergeInputQueues.applyBlockedQueues(mergeInputState);
mergeInputState.activeTransfers.forEach(transfer => {
    if (transfer.queueBlocked === true) {
        throw new Error('Merge input items far from the merge point should not block each other at spawn.');
    }
});

console.log('Logistics queue no-pushback test passed.');
