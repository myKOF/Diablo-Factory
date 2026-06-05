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
if (rear.progress < rearBefore - 0.0001) {
    throw new Error(`Backpressure must not push a transfer backward. Before=${rearBefore}, after=${rear.progress}`);
}

console.log('Logistics queue no-pushback test passed.');
