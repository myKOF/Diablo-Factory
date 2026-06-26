const { test, expect } = require('@playwright/test');

// 驗證啟用 Web Worker 後,物流運動學經 worker 推進並正確抵達/入庫(非同步路徑正確性)。
test('啟用 Web Worker:物品經 worker 推進並抵達入庫', async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => !!(window.GAME_STATE && window.GameEngine && window.PhaserScene), { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const state = window.GAME_STATE;
        const engine = window.GameEngine;
        const sys = engine.workerSystem.logisticsSystem;
        state.isPaused = true;
        window.LOGISTICS_WORKER = true;

        // 一條直線,終點為倉庫;物品多數接近終點以便快速抵達
        const A = { x: 600, y: 600 }, B = { x: 760, y: 600 };
        const wh = { id: 'wh1', type1: 'warehouse', x: B.x, y: B.y, storage: {} };
        state.mapEntities = [wh];
        state.logisticsLines = [{ id: 'L0', groupId: 'g0', order: 0, efficiency: 4, lineType: 'transport_line', routePoints: [{ ...A }, { ...B }] }];
        state.logisticsMergeNodes = [];
        const N = 20;
        state.activeTransfers = Array.from({ length: N }, (_, i) => ({
            id: `t_${i}`, lineId: 'g0', targetId: 'wh1', itemType: 'wood', serialNumber: 1 + i,
            progress: 0.80 + 0.01 * (i % 10), routePoints: [{ ...A }, { ...B }]
        }));

        const delay = (ms) => new Promise(r => setTimeout(r, ms));
        const startCount = state.activeTransfers.length;
        const progressSeries = [];
        let workerActive = false;

        for (let tick = 0; tick < 40; tick++) {
            sys.processAutomatedLogistics(state, 0.05);
            await delay(20);
            if (sys._workerBridge) workerActive = true;
            const ps = state.activeTransfers.map(t => t.progress || 0);
            progressSeries.push(ps.length ? +(ps.reduce((a, b) => a + b, 0) / ps.length).toFixed(3) : 1);
        }

        const woodDeposited = Number(wh.storage.wood || 0) + Number((state.resources && state.resources.wood) || 0) > 0 || Number(wh.storage.wood || 0) > 0;
        return {
            workerActive,
            startCount,
            endCount: state.activeTransfers.length,
            whWood: Number(wh.storage.wood || 0),
            progressMovedUp: progressSeries.some((v, i) => i > 0 && v > progressSeries[0] + 0.01) || state.activeTransfers.length < startCount,
            firstProgress: progressSeries[0],
            lastProgress: progressSeries[progressSeries.length - 1]
        };
    });

    console.log('WORKER PATH:', JSON.stringify(result));
    expect(errors, 'worker 路徑不應有錯誤').toEqual([]);
    expect(result.workerActive, 'worker bridge 應啟用').toBe(true);
    // 物品應前進(progress 上升)或已有抵達(數量下降)
    expect(result.progressMovedUp || result.endCount < result.startCount, '物品應經 worker 前進/抵達').toBe(true);
    // 應有物品抵達倉庫並入庫
    expect(result.endCount, '應有物品抵達被移除').toBeLessThan(result.startCount);
    expect(result.whWood, '抵達物品應入庫倉庫').toBeGreaterThan(0);
});
