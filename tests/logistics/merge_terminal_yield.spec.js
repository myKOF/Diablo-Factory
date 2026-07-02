const { test, expect } = require('@playwright/test');

test('合流節點若落在輸出線終點端口，不可讓主線物品卡在端口前一格', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsMergeNodeRuntime } = await import('/src/systems/logistics/LogisticsMergeNodeRuntime.js?v=' + Date.now());

        const node = {
            id: 'stale_terminal_merge',
            outputGroupId: 'output_line',
            inputGroupIds: ['branch_line'],
            point: { x: 100, y: 0 },
            currentActiveSlot: 0,
            roundRobinIndex: 0
        };
        const outputTransfer = {
            id: 'output_front',
            lineId: 'output_line',
            progress: 0.8,
            routePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
            sourceId: 'source',
            targetId: 'target',
            targetPoint: { x: 100, y: 0 }
        };
        const branchTransfer = {
            id: 'branch_waiting',
            lineId: 'branch_line',
            progress: 1,
            routePoints: [{ x: 100, y: 20 }, { x: 100, y: 0 }],
            sourceId: 'branch_source',
            targetId: null
        };
        const state = {
            logisticsMergeNodes: [node],
            activeTransfers: [outputTransfer, branchTransfer]
        };
        const system = {
            ensureLogisticsMergeNodeStore: () => state.logisticsMergeNodes,
            getLogisticsMergeNodeForInputTransfer: transfer => node.inputGroupIds.includes(transfer.lineId) ? node : null,
            getLogisticsMergeNodeOutputRoute: () => outputTransfer.routePoints,
            getLogisticsSegmentsByGroupId: () => [{ sourceId: 'source', targetId: 'target', efficiency: 4 }]
        };

        const runtime = new LogisticsMergeNodeRuntime(system, () => ({ TILE_SIZE: 20, state }));
        const limit = runtime.getMergeThroughYieldLimit(outputTransfer, state, 20);
        return { limit };
    });

    expect(result.limit).toBe(Infinity);
});
