const { test, expect } = require('@playwright/test');

test('物流隊列回壓與硬斷點不回推測試', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsTransferQueues } = await import('/src/systems/logistics/LogisticsTransferQueues.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const route = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
        const state = {
            activeTransfers: [
                { id: 'front', lineId: 'line_a', routePoints: route.map(point => ({ ...point })), progress: 0.5, targetId: 'warehouse' },
                { id: 'rear', lineId: 'line_a', routePoints: route.map(point => ({ ...point })), progress: 0.45, targetId: 'warehouse' }
            ]
        };

        const rearBefore = state.activeTransfers[1].progress;
        const queues = new LogisticsTransferQueues(
            {
                isLogisticsMergeInputTransfer: () => false
            },
            () => ({ TILE_SIZE: 20 })
        );

        queues.applyBlockedQueues(state);

        const rear = state.activeTransfers.find(transfer => transfer.id === 'rear');
        if (!rear.queueBlocked) {
            return { success: false, error: 'Rear transfer should be blocked when front is too close' };
        }
        if (Math.abs(rear.progress - rearBefore) > 0.0001) {
            return { success: false, error: 'Rear transfer should not be forced backward' };
        }

        return { success: true };
    });

    expect(result.success).toBe(true);
});
