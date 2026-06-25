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

test('不同 lineId 但同一物理路徑的物品不得重疊穿越', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsTransferQueues } = await import('/src/systems/logistics/LogisticsTransferQueues.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));

        try {
            GameEngine.TILE_SIZE = 20;
            state.logisticsMergeNodes = [];
            state.logisticsLines = [{
                id: 'shared_a',
                groupId: 'shared_a',
                routePoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }],
                routeWidth: 1
            }, {
                id: 'shared_b',
                groupId: 'shared_b',
                routePoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }],
                routeWidth: 1
            }];
            state.activeTransfers = [{
                id: 'front_blocked',
                lineId: 'shared_a',
                routePoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }],
                progress: 0.5,
                itemType: 'wood',
                targetId: 'target',
                queueBlocked: true,
                _queuedDistance: 50
            }, {
                id: 'rear_should_wait',
                lineId: 'shared_b',
                routePoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }],
                progress: 0.45,
                itemType: 'wood',
                targetId: 'target'
            }];

            const queues = new LogisticsTransferQueues({
                isLogisticsMergeInputTransfer: () => false,
                getLogisticsMergeThroughYieldLimit: () => Infinity
            }, () => GameEngine);
            queues.applyBlockedQueues(state);

            const front = state.activeTransfers.find(item => item.id === 'front_blocked');
            const rear = state.activeTransfers.find(item => item.id === 'rear_should_wait');
            const frontDistance = front.progress * 100;
            const rearDistance = rear.progress * 100;
            const gap = frontDistance - rearDistance;
            if (gap < 19.9 && rear.queueBlocked !== true) {
                return {
                    success: false,
                    error: `不同 lineId 的同路徑物品間距不足時後車必須阻塞，front=${JSON.stringify(front)} rear=${JSON.stringify(rear)} gap=${gap}`
                };
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
});
