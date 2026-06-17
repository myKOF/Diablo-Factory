const { test, expect } = require('@playwright/test');

test('物流合流點死鎖修復驗證測試', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsMergeNodeRuntime } = await import('/src/systems/logistics/LogisticsMergeNodeRuntime.js?v=' + Date.now());
        const { GameEngine } = await import('/src/systems/game_systems.js?v=' + Date.now());

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));

        function makeTransfer(id, lineId, progress, routePoints) {
            return {
                id,
                lineId,
                routePoints: routePoints || [{ x: 100, y: 100 }, { x: 100, y: 200 }],
                progress,
                sourceId: `${lineId}_source`,
                targetId: null
            };
        }

        // 模擬合流死鎖場景：
        // 合流點為 (100, 100)。
        // 輸入支線 A: line_a，支線 B: line_b。
        // 輸出線: output_line，其起點就是合流點。
        const node = {
            id: 'merge_deadlock_node',
            outputGroupId: 'output_line',
            inputGroupIds: ['line_a', 'line_b'],
            point: { x: 100, y: 100 },
            currentActiveSlot: 1, // 輪到支線 B
            roundRobinIndex: 1,
            lastAdmittedTransferId: 'item_a' // 上次放行的是 item_a
        };

        const testState = {
            logisticsMergeNodes: [node],
            activeTransfers: [
                // 物品 a 剛合流到輸出線上，位於合流點（距離極短）
                makeTransfer('item_a', 'output_line', 0.05, [{ x: 100, y: 100 }, { x: 100, y: 200 }]),
                // 物品 b 在支線 B 門口就緒
                makeTransfer('item_b', 'line_b', 0.98, [{ x: 0, y: 100 }, { x: 100, y: 100 }])
            ]
        };

        const system = {
            ensureLogisticsMergeNodeStore: () => testState.logisticsMergeNodes,
            getLogisticsMergeNodeForInputTransfer: (transfer) => {
                return node.inputGroupIds.includes(transfer.lineId) ? node : null;
            },
            getLogisticsMergeNodeOutputRoute: () => [{ x: 100, y: 100 }, { x: 100, y: 200 }],
            getLogisticsSegmentsByGroupId: () => [{ sourceId: 'merge_output', targetId: 'target', efficiency: 4 }]
        };

        const runtime = new LogisticsMergeNodeRuntime(system, () => ({ TILE_SIZE: 20, state: testState }));

        // 測試在 getMergeThroughYieldLimit 中，剛合流過去的 item_a 是否會因為輪到 B 而被限制住。
        // 正常修復後，item_a 作為 lastAdmittedTransferId 且還在合流點附近，應該不被限制 (limit = Infinity)
        const limit = runtime.getMergeThroughYieldLimit(testState.activeTransfers[0], testState, 20);

        if (limit !== Infinity) {
            return { success: false, error: `剛合流過去的物品進度被限速為 ${limit}，未達到期望的 Infinity。這會造成死鎖！` };
        }

        return { success: true };
    });

    expect(result.success).toBe(true);
});
