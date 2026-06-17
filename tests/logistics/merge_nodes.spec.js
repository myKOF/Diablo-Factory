const { test, expect } = require('@playwright/test');

test('物流合流點與公平輪詢機制測試', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsMergeNodeRuntime } = await import('/src/systems/logistics/LogisticsMergeNodeRuntime.js');
        const { LogisticsTransferQueues } = await import('/src/systems/logistics/LogisticsTransferQueues.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));

        function makeTransfer(id, lineId, progress) {
            return {
                id,
                lineId,
                routePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
                progress,
                sourceId: `${lineId}_source`,
                targetId: null
            };
        }

        function createHarness(activeTransfers, nodeOverrides = {}) {
            const node = {
                id: 'three_input_round_robin_merge',
                outputGroupId: 'output_group',
                inputGroupIds: ['line_a', 'line_b', 'line_c'],
                point: { x: 100, y: 0 },
                currentActiveSlot: 0,
                roundRobinIndex: 0,
                ...nodeOverrides
            };
            const testState = {
                logisticsMergeNodes: [node],
                activeTransfers
            };
            const outputRoute = [{ x: 100, y: 0 }, { x: 200, y: 0 }];
            const system = {
                ensureLogisticsMergeNodeStore: () => testState.logisticsMergeNodes,
                getLogisticsMergeNodeForInputTransfer: (transfer) => {
                    return node.inputGroupIds.includes(transfer.lineId) ? node : null;
                },
                getLogisticsMergeNodeOutputRoute: () => outputRoute,
                getLogisticsSegmentsByGroupId: () => [{ sourceId: 'merge_output', targetId: 'target', efficiency: 4 }]
            };
            const runtime = new LogisticsMergeNodeRuntime(system, () => ({ TILE_SIZE: 20, state: testState }));
            const queues = new LogisticsTransferQueues({
                ...system,
                getLogisticsMergeAdmissionWinner: (...args) => runtime.getLogisticsMergeAdmissionWinner(...args),
                isLogisticsMergeInputTransfer: (transfer) => !!system.getLogisticsMergeNodeForInputTransfer(transfer),
                getLogisticsMergeThroughYieldLimit: (...args) => runtime.getMergeThroughYieldLimit(...args)
            }, () => ({ TILE_SIZE: 20, state: testState }));
            return { node, state: testState, runtime, queues };
        }

        // Test 1: Round Robin Inputs
        const strictOrder = createHarness([
            makeTransfer('a_waiting_one_cell_before_merge', 'line_a', 0.82),
            makeTransfer('b_already_at_merge_gate', 'line_b', 1),
            makeTransfer('c_already_at_merge_gate', 'line_c', 1)
        ]);

        let winnerId = strictOrder.runtime.getLogisticsMergeAdmissionWinner(strictOrder.node, strictOrder.state, {
            spacing: 20,
            readyDistanceFromEnd: 20
        });

        if (winnerId !== 'a_waiting_one_cell_before_merge') {
            return { success: false, error: `三入口合流必須依 currentActiveSlot 輪到 A，實際 winner=${winnerId}` };
        }

        // Test 2: Basic Registration
        state.logisticsLines = [
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

        const node = conveyorSystem.registerLogisticsMergeNode({
            inputGroupId: 'gA',
            outputGroupId: 'gB',
            point: { x: 50, y: 30 }
        });

        if (!node || !node.inputGroupIds.includes('gA') || node.outputGroupId !== 'gB') {
            return { success: false, error: 'Failed to register valid merge node' };
        }

        // 還原狀態
        GameEngine.state = originalState;
        return { success: true };
    });

    expect(result.success).toBe(true);
});
