const { test, expect } = require('@playwright/test');

// [回歸] conn.id 失效(端點解析失敗→null)時,createActiveTransfer 須由路線終點兜底反查目的地建築,
// 否則 transfer.targetId=null → 被當成斷點停在終點不入庫(產率 0、物品堆滿帶子)。
test('targetId 兜底:conn.id=null 但路線終點在 canInput 建築時必須解析出 targetId', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => !!(window.GameEngine && window.UIManager && window.PhaserScene && window.GameEngine.workerSystem), { timeout: 15000 });

    const r = await page.evaluate(async () => {
        const GameEngine = window.GameEngine;
        const sys = GameEngine.workerSystem.logisticsSystem;
        const state = GameEngine.state;

        // 找一個 canInput 的建築當目的地,取它的一個端口座標作為路線終點。
        const entId = (e) => e.id || `${e.type1}_${e.x}_${e.y}`;
        const target = (state.mapEntities || []).find(e => {
            const cfg = GameEngine.getEntityConfig(e.type1);
            return cfg && cfg.logistics && cfg.logistics.canInput && (window.UIManager.getBuildingPortSlots(e) || []).length > 0;
        });
        if (!target) return { skip: true };
        const port = window.UIManager.getBuildingPortSlots(target)[0];

        // 來源:任意非目的地建築。
        const source = (state.mapEntities || []).find(e => entId(e) !== entId(target)) || { id: 'src', type1: 'town_center', x: 50, y: 50 };

        // 直接呼叫兜底解析:終點在目的地端口 → 應解析出目的地 id。
        const resolved = sys._resolveTargetIdFromRouteEnd(state, { x: port.x, y: port.y }, entId(source));

        // 終點在曠野(遠離任何建築) → 應為 null(真正的斷點,不誤綁)。
        const resolvedEmpty = sys._resolveTargetIdFromRouteEnd(state, { x: -99999, y: -99999 }, entId(source));

        return { skip: false, targetId: entId(target), resolved, resolvedEmpty };
    });

    if (r.skip) { test.skip(true, '初始場景無 canInput 建築'); return; }
    expect(r.resolved, '路線終點在端口 → 應解析出該建築 id').toBe(r.targetId);
    expect(r.resolvedEmpty, '終點在曠野 → 不得誤綁,須為 null').toBeNull();
});
