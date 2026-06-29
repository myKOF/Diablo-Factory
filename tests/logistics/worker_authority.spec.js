const { test, expect } = require('@playwright/test');

test('Web Worker 模式下沒有權威結果時主執行緒不得自行推進物品', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsTransferSystem } = await import('/src/systems/logistics/LogisticsTransferSystem.js?v=' + Date.now());

        const state = {
            activeTransfers: [{
                id: 'transfer_worker_authority',
                sourceId: 'source',
                targetId: 'target',
                itemType: 'wood',
                lineId: 'line_a',
                efficiency: 4,
                progress: 0.25,
                transportIndex: 2,
                transportOffset: 0.5,
                maxAllowedProgress: 1,
                routePoints: [{ x: 0, y: 0 }, { x: 200, y: 0 }]
            }],
            logisticsLines: [{
                id: 'line_a',
                groupId: 'line_a',
                efficiency: 4,
                lineType: 'transport_line',
                routePoints: [{ x: 0, y: 0 }, { x: 200, y: 0 }]
            }],
            logisticsMergeNodes: [],
            mapEntities: [],
            resources: {}
        };
        const engine = {
            TILE_SIZE: 20,
            state,
            getEntityConfig: () => ({ efficiency: 4 })
        };
        const system = new LogisticsTransferSystem(state, engine);
        const previousFlag = window.LOGISTICS_WORKER;
        const previousGameState = window.GAME_STATE;
        let pushed = false;

        try {
            window.LOGISTICS_WORKER = true;
            window.GAME_STATE = state;
            system._workerBridge = {
                pullResult: () => [],
                pushStep: () => { pushed = true; },
                dispose: () => {},
                getPositionLagSeconds: () => 0
            };

            system.processAutomatedLogistics(state, 0.5);
            const transfer = state.activeTransfers[0];
            return {
                pushed,
                progress: transfer.progress,
                transportIndex: transfer.transportIndex,
                transportOffset: transfer.transportOffset
            };
        } finally {
            window.LOGISTICS_WORKER = previousFlag;
            window.GAME_STATE = previousGameState;
            system._workerBridge = null;
        }
    });

    expect(result.pushed, '仍需把本 tick 狀態送給 worker 計算下一批權威結果').toBe(true);
    expect(result.progress).toBe(0.25);
    expect(result.transportIndex).toBe(2);
    expect(result.transportOffset).toBe(0.5);
});
