const { test, expect } = require('@playwright/test');
// issue 3:線被切斷使路線止於斷點(終點≠目標端口)時,物品不得被誤判抵達而消失。
test('斷線:路線終點偏離目標端口的物品不入庫不消失', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => !!(window.GAME_STATE && window.GameEngine), { timeout: 15000 });
    const out = await page.evaluate(async () => {
        const { runLogisticsKinematics } = await import('/src/systems/logistics/LogisticsKinematics.js');
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { logisticsTransportArrayState } = await import('/src/systems/logistics/LogisticsTransportArrayState.js');
        const GE = window.GameEngine; const state = window.GAME_STATE;
        const ROUTE = [{ x: 600, y: 600 }, { x: 800, y: 600 }]; // 終點 (800,600)
        state.logisticsLines = [{ id: 'L', groupId: 'g', order: 0, efficiency: 4, lineType: 'transport_line', routePoints: ROUTE }];
        state.logisticsMergeNodes = []; state.mapEntities = [];
        // A:正常 — targetPoint == 路線終點 → 應入庫(移除)
        // B:斷線 — targetPoint 遠離路線終點(原目標在 (2000,600),但路線被切到 (800,600)) → 不應入庫
        state.activeTransfers = [
            { id: 'A', lineId: 'g', targetId: 'wh', itemType: 'wood', progress: 1, transportIndex: 999, transportOffset: 0, routePoints: ROUTE, targetPoint: { x: 800, y: 600 } },
            { id: 'B', lineId: 'g', targetId: 'wh', itemType: 'wood', progress: 1, transportIndex: 999, transportOffset: 0, routePoints: ROUTE, targetPoint: { x: 2000, y: 600 } }
        ];
        const { arrivals } = runLogisticsKinematics({ simSystem: conveyorSystem, engine: GE, transportArrayState: logisticsTransportArrayState }, state, 0.05);
        const arrivedIds = arrivals.map(a => a.id);
        const remainIds = state.activeTransfers.map(t => t.id);
        return { arrivedIds, remainIds };
    });
    console.log('BROKEN LINE:', JSON.stringify(out));
    expect(out.arrivedIds, 'A(終點=目標)應入庫').toContain('A');
    expect(out.arrivedIds, 'B(斷點≠目標)不應入庫').not.toContain('B');
    expect(out.remainIds, 'B 應仍在 activeTransfers(停在斷點,不消失)').toContain('B');
});
