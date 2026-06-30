const { test, expect } = require('@playwright/test');

async function loadGame(page) {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 30000 });
}

// 取自 live 狀態:合流輸出群組 G 是一條線性線,現末端 (970,850);但在途物品 routePoints 仍指向
// 一個「拓樸裡已不存在」的舊末端 (990,630)。rerouter 必須把這種失效路線改回 G 的現末端 (或回收),
// 不得讓物品續走已不存在的舊路。
test('在途物品的失效路線(指向已刪除末端)須被 rerouter 改回現有群組末端', async ({ page }) => {
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
            GameEngine.getEntityConfig = () => ({ logistics: { canOutput: true, canInput: true }, type2: 'storage', need_villagers: 0 });
            if (window.UIManager) {
                window.UIManager.getBuildingPortSlots = (ent) => Array.isArray(ent?.portSlots) ? ent.portSlots : [];
                window.UIManager.getEntityId = (ent) => ent?.id || null;
            }

            const P = (x, y) => ({ x, y });
            const G = 'gOut';
            const I = 'gIn';
            const seg = (id, groupId, a, b, extra = {}) => ({ id, groupId, order: 0, efficiency: 4, routePoints: [a, b], routeWidth: 1, ...extra });

            const lines = [];
            // 輸入線 I -> 合流點 (1210,470)
            lines.push(seg('i0', I, P(1130, 470), P(1210, 470), { sourceId: 'src', sourcePort: { x: 1130, y: 470, dir: 'right', width: 1 } }));
            // 輸出群組 G:現況為線性,(1210,470) 往下到 (1210,850) 再往左到 (970,850)。末端 (970,850)。
            let o = 0;
            for (let y = 470; y < 850; y += 20) lines.push(seg(`g_v_${y}`, G, P(1210, y), P(1210, y + 20), { order: o++, targetPoint: P(970, 850) }));
            for (let x = 1210; x > 970; x -= 20) lines.push(seg(`g_h_${x}`, G, P(x, 850), P(x - 20, 850), { order: o++, targetPoint: P(970, 850) }));

            const src = { id: 'src', type1: 'warehouse', x: 1110, y: 470, storage: { wood: 999999 },
                portSlots: [{ x: 1130, y: 470, dir: 'right', width: 1 }], outputTargets: [] };
            state.mapEntities = [src];
            state.logisticsLines = lines;
            state.logisticsMergeNodes = [];
            conveyorSystem.registerLogisticsMergeNode({ inputGroupId: I, outputGroupId: G, point: P(1210, 470),
                inputLine: lines.find(l => l.groupId === I), outputLine: lines.find(l => l.groupId === G) });

            // 失效的舊路線:沿共享主幹下行,但在 (1210,830) 轉去 (990,830) 再上到已刪除的 (990,630)。
            const staleRoute = [];
            for (let y = 470; y <= 830; y += 20) staleRoute.push(P(1210, y));
            for (let x = 1190; x >= 990; x -= 20) staleRoute.push(P(x, 830));
            for (let y = 810; y >= 630; y -= 20) staleRoute.push(P(990, y));

            // 物品位於「共享主幹」上(progress 小,currentPos 落在現有 G 線上),理應改道到現末端 (970,850)。
            const mk = (id, prog) => ({ id, lineId: G, itemType: 'wood', sourceId: 'src',
                routePoints: staleRoute.map(p => ({ ...p })), targetPoint: P(970, 850), progress: prog });
            state.activeTransfers = [mk('s1', 0.10), mk('s2', 0.20), mk('s3', 0.30)];

            conveyorSystem.updateActiveTransfersOnLogisticsChange(state, new Set([G, I]));

            const fmt = (p) => p ? `${Math.round(p.x)},${Math.round(p.y)}` : 'null';
            const after = state.activeTransfers.map(t => {
                const rp = t.routePoints || []; return { id: t.id, lineId: t.lineId, end: fmt(rp[rp.length - 1]), tp: fmt(t.targetPoint) };
            });
            const stillStale = state.activeTransfers.filter(t => {
                const rp = t.routePoints || []; const e = rp[rp.length - 1];
                return e && Math.hypot(e.x - 990, e.y - 630) < 5;
            }).length;

            return { success: true, activeCount: state.activeTransfers.length, after, stillStale };
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
    // 不得有物品保留指向已刪除末端 (990,630) 的失效路線
    expect(result.stillStale, `失效路線未被修正:${JSON.stringify(result)}`).toBe(0);
});
