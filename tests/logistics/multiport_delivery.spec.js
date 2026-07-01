const { test, expect } = require('@playwright/test');

async function loadGame(page) {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 30000 });
}

// 大型建築有多個 input 端口:物品路線末端停在「另一個合法端口」(route-end 在有效端口卻 ≠ targetPoint,
// 例如改拉線後 targetPoint 殘留指向舊端口)時,必須仍判定抵達入庫,否則堵在終點擋住後車。
// 反面:route-end 落在「非端口的斷點」時不得誤判抵達(保有斷線防護)。
test('多端口建築:route-end 落在任一 input 端口即入庫;落在斷點則不入庫', async ({ page }) => {
    test.setTimeout(60000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { LogisticsTransferSystem } = await import('/src/systems/logistics/LogisticsTransferSystem.js?v=' + Date.now());
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const prevTile = GameEngine.TILE_SIZE;
        const prevPortSlots = window.UIManager?.getBuildingPortSlots;
        const prevGetId = window.UIManager?.getEntityId;

        try {
            GameEngine.TILE_SIZE = 20;
            // village 有兩個 input 端口:(950,640) 與 (990,640)
            const village = { id: 'core_village', type1: 'village', x: 970, y: 620, storage: {},
                portSlots: [{ x: 950, y: 640, dir: 'left', width: 1 }, { x: 990, y: 640, dir: 'down', width: 1 }] };
            if (window.UIManager) {
                window.UIManager.getBuildingPortSlots = (ent) => Array.isArray(ent?.portSlots) ? ent.portSlots : [];
                window.UIManager.getEntityId = (ent) => ent?.id || null;
            }
            state.mapEntities = [village];
            state.logisticsLines = [];
            state.logisticsMergeNodes = [];

            const sys = new LogisticsTransferSystem(state, GameEngine);

            const mk = (id, endPt) => ({
                id, lineId: 'L', itemType: 'wood', sourceId: 'src', targetId: 'core_village',
                progress: 1, routePoints: [{ x: 950, y: 800 }, endPt],
                // targetPoint 殘留指向「另一個」端口 (990,640)
                targetPoint: { x: 990, y: 640 }
            });
            // A:route-end 落在合法端口 (950,640) → 應入庫
            // B:route-end 落在斷點 (950,700)(非任何端口)→ 不應入庫
            state.activeTransfers = [mk('atPort', { x: 950, y: 640 }), mk('atBreak', { x: 950, y: 700 })];

            const arrivals = sys.collectTargetPortArrivals(state, []);
            const arrivedIds = arrivals.map(a => a.id);
            const remainingIds = state.activeTransfers.map(t => t.id);

            return {
                success: true,
                arrivedIds,
                remainingIds,
                villageStorage: village.storage.wood || 0
            };
        } catch (error) {
            return { success: false, error: error.message + '\n' + error.stack };
        } finally {
            GameEngine.TILE_SIZE = prevTile;
            if (window.UIManager && prevPortSlots) window.UIManager.getBuildingPortSlots = prevPortSlots;
            if (window.UIManager && prevGetId) window.UIManager.getEntityId = prevGetId;
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
    // 落在合法端口的 atPort 被判定抵達(移出 activeTransfers)
    expect(result.arrivedIds, `route-end 在合法端口卻未入庫:${JSON.stringify(result)}`).toContain('atPort');
    // 落在斷點的 atBreak 不得被判定抵達(保有斷線防護)
    expect(result.arrivedIds, `route-end 在斷點卻誤判入庫:${JSON.stringify(result)}`).not.toContain('atBreak');
    expect(result.remainingIds).toContain('atBreak');
});
