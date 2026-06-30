const { test, expect } = require('@playwright/test');

async function loadGame(page) {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 30000 });
}

// 重現：一條原本送達建築 T 的線，被「延伸」越過 T 繼續往空地延伸後，
// recalculateLogisticsGroupEndpoints 仍把舊目標 T 的端口當成群組終點(因為該端口仍落在線的中段),
// 導致 conn.routePoints 重建到舊端口 T 而非新的物理末端 → 物品走舊路堵在 T。
// 正解:延伸後群組的物理末端已遠離舊目標端口,不得再保留舊目標,路徑須止於新末端。
test('延伸越過舊目標後,群組終點與派貨路徑須止於新物理末端', async ({ page }) => {
    test.setTimeout(60000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const prevTile = GameEngine.TILE_SIZE;
        const prevGetCfg = GameEngine.getEntityConfig;
        const prevGetFp = GameEngine.getFootprint;
        const prevPortSlots = window.UIManager?.getBuildingPortSlots;
        const prevGetId = window.UIManager?.getEntityId;

        try {
            GameEngine.TILE_SIZE = 20;
            GameEngine.getFootprint = () => ({ uw: 2, uh: 2, w: 40, h: 40 });
            GameEngine.getEntityConfig = (type1) => type1 === 'town_center'
                ? { logistics: { canInput: true }, type2: 'storage' }
                : { logistics: { canOutput: true, canInput: true }, type2: 'storage', need_villagers: 0 };
            if (window.UIManager) {
                window.UIManager.getBuildingPortSlots = (ent) => Array.isArray(ent?.portSlots) ? ent.portSlots : [];
                window.UIManager.getEntityId = (ent) => ent?.id || null;
            }

            const sourcePort = { x: 90, y: 110, dir: 'right', width: 1, slotIndex: 0, defIndex: 0 };
            // 舊目標端口:落在線的「中段」(90,110)->(170,110)->(290,110) 的 (170,110)
            const oldTargetPort = { x: 170, y: 110, dir: 'left', width: 1, slotIndex: 0, defIndex: 0 };

            const src = { id: 'S', type1: 'warehouse', x: 70, y: 110, storage: { wood: 999999 },
                portSlots: [sourcePort],
                outputTargets: [{ id: 'T', lineId: 'L', sourcePort, targetPort: oldTargetPort, filter: 'wood', efficiency: 4,
                    routePoints: [{ x: 90, y: 110 }, { x: 170, y: 110 }] }] };
            // T 在中段旁邊;延伸後它已不是物理末端
            const tgt = { id: 'T', type1: 'town_center', x: 170, y: 90, storage: {}, portSlots: [oldTargetPort] };

            // 延伸後的同一群組:舊段 + 越過 T 往空地的新延伸段(末端 (290,110) 為開放線尾)
            const segA = { id: 'L_A', groupId: 'L', sourceId: 'S', sourcePort, targetId: 'T', targetPort: oldTargetPort,
                routePoints: [{ x: 90, y: 110 }, { x: 170, y: 110 }], routeWidth: 1, efficiency: 4, order: 0, createdAt: 1 };
            const segB = { id: 'L_B', groupId: 'L',
                routePoints: [{ x: 170, y: 110 }, { x: 290, y: 110 }], routeWidth: 1, efficiency: 4, order: 1, createdAt: 2 };

            state.mapEntities = [src, tgt];
            state.logisticsLines = [segA, segB];
            state.logisticsMergeNodes = [];
            state.activeTransfers = [];

            conveyorSystem.recalculateLogisticsGroupEndpoints('L');

            const conn = src.outputTargets.find(c => c.lineId === 'L');
            const connRoute = Array.isArray(conn?.routePoints) ? conn.routePoints : [];
            const connEnd = connRoute[connRoute.length - 1] || null;
            const segTargetIds = state.logisticsLines.map(l => l.targetId);

            return {
                success: true,
                connId: conn?.id ?? 'MISSING',
                connEnd,
                segTargetIds
            };
        } catch (error) {
            return { success: false, error: error.message + '\n' + error.stack };
        } finally {
            GameEngine.TILE_SIZE = prevTile;
            GameEngine.getEntityConfig = prevGetCfg;
            GameEngine.getFootprint = prevGetFp;
            if (window.UIManager && prevPortSlots) window.UIManager.getBuildingPortSlots = prevPortSlots;
            if (window.UIManager && prevGetId) window.UIManager.getEntityId = prevGetId;
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
    // 派貨路徑必須止於新的物理末端 (290,110),而非舊目標端口 (170,110)
    expect(result.connEnd, `派貨路徑止於舊目標而非新末端:${JSON.stringify(result)}`).toMatchObject({ x: 290, y: 110 });
});
