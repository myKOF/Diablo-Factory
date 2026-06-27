const { test, expect } = require('@playwright/test');

// [回歸] 滿載直線不得隨時間由密變疏。間距限制須以前車「本子步推進後」位置為準,否則後車永遠落後
// 一個子步位移,滿載線會從 cell(20)鬆弛成 cell+一子步(~21.3),沿線累積成「內圈密外圈疏」。
test('滿載直線間距隨時間維持 cell,不變疏', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => !!(window.GameEngine), { timeout: 15000 });

    const r = await page.evaluate(async () => {
        const { runLogisticsKinematics } = await import('/src/systems/logistics/LogisticsKinematics.js?v=' + Date.now());
        const { logisticsTransportArrayState } = await import('/src/systems/logistics/LogisticsTransportArrayState.js?v=' + Date.now());
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js?v=' + Date.now());
        const { GameEngine } = await import('/src/systems/game_systems.js?v=' + Date.now());

        const cell = GameEngine.TILE_SIZE || 20;
        const total = 4000; // 夠長,測試窗口內物品不會抵達終點(避免數量變動干擾)
        const A = { x: 0, y: 0 }, B = { x: total, y: 0 };
        const route = () => [{ ...A }, { ...B }];
        const eff = 4;
        const N = 30;
        const wh = { id: 'wh', type1: 'warehouse', x: B.x, y: B.y, storage: {} };
        const transfers = [];
        for (let i = 0; i < N; i++) {
            const t = { id: `t${i}`, lineId: 'g', targetId: 'wh', itemType: 'wood', efficiency: eff, routePoints: route(), targetPoint: { ...B }, progress: 0 };
            logisticsTransportArrayState.setTransferDistance(t, i * cell, total, cell); // 完美滿載
            transfers.push(t);
        }
        const state = {
            logisticsLines: [{ id: 'L', groupId: 'g', order: 0, efficiency: eff, lineType: 'transport_line', routePoints: route(), targetId: 'wh' }],
            logisticsMergeNodes: [], activeTransfers: transfers, mapEntities: [wh]
        };
        const ctx = { simSystem: conveyorSystem, engine: GameEngine, transportArrayState: logisticsTransportArrayState };

        const maxGap = () => {
            const ds = state.activeTransfers.map(t => logisticsTransportArrayState.getTransferDistance(t, total, cell)).sort((a, b) => a - b);
            let m = 0;
            for (let i = 1; i < ds.length; i++) m = Math.max(m, ds[i] - ds[i - 1]);
            return m;
        };

        const g0 = maxGap();
        for (let tick = 0; tick < 400; tick++) runLogisticsKinematics(ctx, state, 0.05);
        const g1 = maxGap();
        return { cell, count: state.activeTransfers.length, gapStart: +g0.toFixed(3), gapEnd: +g1.toFixed(3) };
    });

    // 數量不變(沒抵達),起始間距=cell
    expect(r.count).toBe(30);
    expect(r.gapStart).toBeCloseTo(r.cell, 3);
    // 關鍵:跑了 400 tick 後最大間距仍貼近 cell(修正前會鬆弛到 ~21.3,即 cell+一子步)。
    // 容許微小浮點餘量,但不得超過 cell + 0.5px(遠小於一個子步 1.33px)。
    expect(r.gapEnd, `滿載間距不得變疏(cell=${r.cell}, 實測=${r.gapEnd})`).toBeLessThanOrEqual(r.cell + 0.5);
});
