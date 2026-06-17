const { test, expect } = require('@playwright/test');

test('物流跨合流點回壓Staking與不重疊防護測試', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsTransferQueues } = await import('/src/systems/logistics/LogisticsTransferQueues.js');
        const { WorkerSystem } = await import('/src/systems/WorkerSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const testSystemMock = {
            isLogisticsMergeInputTransfer: (transfer) => {
                return transfer.lineId === 'input_line' || transfer.lineId === 'input_line_b';
            },
            getLogisticsMergeNodeForInputTransfer: (transfer) => {
                if (transfer.lineId === 'input_line' || transfer.lineId === 'input_line_b') {
                    return {
                        outputGroupId: 'output_line',
                        inputGroupIds: ['input_line', 'input_line_b'],
                        point: { x: 100, y: 100 }
                    };
                }
                return null;
            }
        };

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));

        // 模擬
        const queuesInstance = new LogisticsTransferQueues(testSystemMock, () => GameEngine);
        window.conveyorSystem = {
            getLogisticsMergeNodeForInputTransfer: testSystemMock.getLogisticsMergeNodeForInputTransfer,
            isLogisticsMergeInputTransfer: testSystemMock.isLogisticsMergeInputTransfer,
            applyLogisticsMergeNodes: () => false,
            applyBlockedTransferQueues: (st) => {
                queuesInstance.applyBlockedQueues(st);
            }
        };

        const worker = new WorkerSystem();
        worker.engine = GameEngine;

        try {
            const t1 = {
                id: 'transfer_output',
                lineId: 'output_line',
                routePoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }],
                progress: 0.0,
                itemType: 'WOOD',
                efficiency: 4
            };

            const t2 = {
                id: 'transfer_input',
                lineId: 'input_line',
                routePoints: [{ x: 0, y: 100 }, { x: 100, y: 100 }],
                progress: 0.5,
                itemType: 'WOOD',
                efficiency: 4
            };

            state.activeTransfers = [t1, t2];

            worker.processAutomatedLogistics(state, 1.0);
            const t2Dist = t2.progress * 100;

            if (Math.abs(t2Dist - 100) >= 0.1) {
                return { success: false, error: 'Expected input item to advance to merge node' };
            }

            return { success: true };
        } finally {
            GameEngine.state = originalState;
        }
    });

    expect(result.success).toBe(true);
});
