const { test, expect } = require('@playwright/test');

// 驗證 worker 流量控制:在 worker 單步運算 > tick 間隔的高負載下(~1000 物品),
// 新加入的物品仍會被推進(不會因訊息塞車卡在 progress 0)。
test('worker 流量控制:高負載下新物品仍前進不卡起點', async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => !!(window.GAME_STATE && window.GameEngine && window.PhaserScene), { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const state = window.GAME_STATE; const sys = window.GameEngine.workerSystem.logisticsSystem;
        state.isPaused = true; window.LOGISTICS_WORKER = true;
        function serpentine(P, x0, y0) { const pts = []; let x = x0, y = y0; for (let i = 0; i < P; i++) { pts.push({ x, y }); if (i % 2 === 0) y += 40; else x += 40; if (i % 8 === 7) y -= 160; } return pts; }
        const MAIN = serpentine(120, 400, 200);
        const LANE = [{ x: 2000, y: 200 }, { x: 2000, y: 1400 }]; // 另一條獨立長線,放 marker
        state.logisticsLines = [];
        for (let i = 0; i < MAIN.length - 1; i++) state.logisticsLines.push({ id: `m_${i}`, groupId: 'g0', order: i, efficiency: 4, lineType: 'transport_line', routePoints: [MAIN[i], MAIN[i + 1]] });
        state.logisticsLines.push({ id: 'L', groupId: 'lane', order: 0, efficiency: 4, lineType: 'transport_line', routePoints: LANE });
        state.logisticsMergeNodes = []; state.mapEntities = [];

        // 背景負載:1000 物品(讓 worker 單步 > 50ms)
        const N = 1000;
        const load = Array.from({ length: N }, (_, i) => ({ id: `bg_${i}`, lineId: 'g0', itemType: 'wood', serialNumber: 1 + i, progress: (i / N) % 1, routePoints: MAIN }));
        state.activeTransfers = load;

        const delay = ms => new Promise(r => setTimeout(r, ms));
        // 暖機讓 worker 啟動 + 接管
        for (let k = 0; k < 6; k++) { sys.processAutomatedLogistics(state, 0.05); await delay(20); }

        // 加入 marker(progress 0,獨立 lane,終點極遠不會抵達)
        const marker = { id: 'MARKER', lineId: 'lane', itemType: 'wood', serialNumber: 99999, progress: 0, routePoints: LANE };
        state.activeTransfers.push(marker);

        const series = [];
        for (let tick = 0; tick < 40; tick++) {
            sys.processAutomatedLogistics(state, 0.05);
            await delay(20);
            const m = state.activeTransfers.find(t => t.id === 'MARKER');
            series.push(m ? +(m.progress || 0).toFixed(4) : -1);
        }
        const bridge = sys._workerBridge;
        return {
            workerOn: !!bridge,
            markerStart: series[0],
            markerEnd: series[series.length - 1],
            advanced: series[series.length - 1] > series[3] + 0.01,
            inFlightBounded: bridge ? (bridge.inFlight === true || bridge.inFlight === false) : false,
            series: series.filter((_, i) => i % 8 === 0)
        };
    });

    console.log('FLOW CONTROL:', JSON.stringify(result));
    expect(errors, 'worker 路徑不應有錯誤').toEqual([]);
    expect(result.workerOn, 'worker 應啟用').toBe(true);
    expect(result.markerEnd, 'marker 不應卡在 progress 0').toBeGreaterThan(0.02);
    expect(result.advanced, '高負載下 marker 仍應持續前進').toBe(true);
});
