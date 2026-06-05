const fs = require('fs');
const path = require('path');

let runtimeCode = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsMergeNodeRuntime.js'), 'utf8');
runtimeCode = runtimeCode.replace(/export class LogisticsMergeNodeRuntime/, 'globalThis.LogisticsMergeNodeRuntime = class LogisticsMergeNodeRuntime');
eval(runtimeCode);

const outputRoute = [{ x: 100, y: 100 }, { x: 100, y: 200 }];
const node = {
    outputGroupId: 'output_group',
    inputGroupIds: ['input_a', 'input_b'],
    point: { x: 100, y: 100 }
};
const state = {
    logisticsMergeNodes: [node],
    activeTransfers: [
        {
            id: 'output_near_start',
            lineId: 'output_group',
            routePoints: outputRoute.map(point => ({ ...point })),
            progress: 0.1,
            targetId: 'target'
        },
        {
            id: 'input_waiting',
            lineId: 'input_a',
            routePoints: [{ x: 40, y: 100 }, { x: 100, y: 100 }],
            progress: 1,
            sourceId: 'source_a',
            targetId: null
        }
    ]
};
const system = {
    ensureLogisticsMergeNodeStore: () => state.logisticsMergeNodes,
    getLogisticsMergeNodeForInputTransfer: (transfer) => {
        if (transfer.lineId === 'input_a' && transfer.progress >= 0.999) return node;
        return null;
    },
    getLogisticsMergeNodeOutputRoute: () => outputRoute,
    getLogisticsSegmentsByGroupId: () => [{ sourceId: 'merge_output', targetId: 'target', efficiency: 4 }]
};
const runtime = new globalThis.LogisticsMergeNodeRuntime(system, () => ({ TILE_SIZE: 20, state }));
const inputWaitProgress = (60 - 20) / 60;

runtime.apply(state);

const input = state.activeTransfers.find(transfer => transfer.id === 'input_waiting');
if (input.lineId !== 'input_a') {
    throw new Error('Merge input must wait on its input line when the output entry is occupied.');
}
if (Math.abs(input.progress - inputWaitProgress) > 0.0001) {
    throw new Error(`Waiting merge input should stop one cell before the merge point, got progress=${input.progress}`);
}
if (input.queueBlocked !== true) {
    throw new Error('Waiting merge input should be marked queueBlocked.');
}

input.progress = 1;
state.activeTransfers[0].progress = 0.19;
runtime.apply(state);
if (input.lineId !== 'input_a') {
    throw new Error('Merge input must still wait while the output entry is closer than one item width.');
}
if (Math.abs(input.progress - inputWaitProgress) > 0.0001) {
    throw new Error(`Waiting merge input should remain one cell before the merge point, got progress=${input.progress}`);
}

input.progress = 1;
state.activeTransfers[0].progress = 0.2;
runtime.apply(state);

if (input.lineId !== 'output_group') {
    throw new Error('Merge input should enter the output group after the output entry is clear.');
}
if (input.progress !== 0) {
    throw new Error(`Transferred merge input should start at output progress 0, got ${input.progress}`);
}

const simultaneousState = {
    logisticsMergeNodes: [node],
    activeTransfers: [
        {
            id: 'input_first',
            lineId: 'input_a',
            routePoints: [{ x: 40, y: 100 }, { x: 100, y: 100 }],
            progress: 1,
            sourceId: 'source_a',
            targetId: null
        },
        {
            id: 'input_second',
            lineId: 'input_b',
            routePoints: [{ x: 80, y: 80 }, { x: 100, y: 100 }],
            progress: 1,
            sourceId: 'source_b',
            targetId: null
        }
    ]
};
const simultaneousSystem = {
    ...system,
    ensureLogisticsMergeNodeStore: () => simultaneousState.logisticsMergeNodes,
    getLogisticsMergeNodeForInputTransfer: (transfer) => {
        if ((transfer.lineId === 'input_a' || transfer.lineId === 'input_b') && transfer.progress >= 0.999) return node;
        return null;
    }
};
const simultaneousRuntime = new globalThis.LogisticsMergeNodeRuntime(simultaneousSystem, () => ({ TILE_SIZE: 20, state: simultaneousState }));
simultaneousRuntime.apply(simultaneousState);

const entered = simultaneousState.activeTransfers.filter(transfer => transfer.lineId === 'output_group');
const waiting = simultaneousState.activeTransfers.filter(transfer => transfer.lineId === 'input_a' || transfer.lineId === 'input_b');
if (entered.length !== 1 || waiting.length !== 1) {
    throw new Error(`Only one simultaneous merge input may enter output. entered=${entered.length}, waiting=${waiting.length}`);
}
if (waiting[0].queueBlocked !== true) {
    throw new Error('The simultaneous merge input left behind should be queueBlocked.');
}
const waitingRoute = Array.isArray(waiting[0].routePoints) ? waiting[0].routePoints : [];
const waitingLength = waitingRoute.length >= 2
    ? waitingRoute.slice(0, -1).reduce((sum, point, index) => {
        const next = waitingRoute[index + 1];
        return sum + Math.hypot(next.x - point.x, next.y - point.y);
    }, 0)
    : 0;
const simultaneousWaitProgress = Math.max(0, (waitingLength - 20) / waitingLength);
if (Math.abs(waiting[0].progress - simultaneousWaitProgress) > 0.0001) {
    throw new Error(`The simultaneous merge input left behind should wait before the merge point, got progress=${waiting[0].progress}`);
}

console.log('Logistics merge no-overlap test passed.');
