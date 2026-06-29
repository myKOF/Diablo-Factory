const { test, expect } = require('@playwright/test');

// [回歸] 高負載下 worker 會在主執行緒兩次 pullResult 之間背靠背回多個結果。kin 是絕對位置可被覆蓋,
// 但 arrivals 是一次性事件。若新結果直接覆蓋舊 latest,未消費的舊 arrivals 會遺失 →
// 物品 worker 已刪、主執行緒卻凍結殘留不入庫 → 產率隨負載逐漸降低。本測模擬背靠背結果,驗證不漏。
test('worker bridge:背靠背結果的 arrivals 不得遺失', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => !!(window.GameEngine), { timeout: 15000 });

    const r = await page.evaluate(async () => {
        const { LogisticsWorkerBridge } = await import('/src/systems/logistics/LogisticsWorkerBridge.js?v=' + Date.now());
        const url = new URL('/src/systems/logistics/logistics.worker.js', location.href);
        const bridge = new LogisticsWorkerBridge(url);
        // 立即停掉真實 worker,純測 _onMessage / pullResult 邏輯(避免真 worker 訊息干擾)。
        try { bridge.worker.onmessage = null; bridge.worker.terminate(); } catch (e) {}

        const state = {
            activeTransfers: [
                { id: 'A', lineId: 'g', itemType: 'wood', progress: 1 },
                { id: 'B', lineId: 'g', itemType: 'stone', progress: 1 },
                { id: 'C', lineId: 'g', itemType: 'wood', progress: 0.5 }
            ]
        };
        // 標記 A、B 已送交 worker
        bridge.sentIds.add('A'); bridge.sentIds.add('B'); bridge.sentIds.add('C');

        // 背靠背兩個結果:第一個含 A 抵達,第二個(覆蓋 latest)含 B 抵達。C 仍在途。
        bridge._onMessage({ type: 'result', seq: 1, kin: [{ id: 'B', progress: 1, transportIndex: 0, transportOffset: 0, maxAllowedProgress: 1 }, { id: 'C', progress: 0.5, transportIndex: 0, transportOffset: 0, maxAllowedProgress: 1 }], arrivals: [{ id: 'A', targetId: 'wh', itemType: 'wood' }] });
        bridge._onMessage({ type: 'result', seq: 2, kin: [{ id: 'C', progress: 0.6, transportIndex: 0, transportOffset: 0, maxAllowedProgress: 1 }], arrivals: [{ id: 'B', targetId: 'wh', itemType: 'stone' }] });

        const arrivals = bridge.pullResult(state);
        return {
            arrivedIds: arrivals.map(a => a.id).sort(),
            arrivedTypes: arrivals.map(a => a.itemType).sort(),
            remaining: state.activeTransfers.map(t => t.id),
            sentIdsRemaining: Array.from(bridge.sentIds).sort()
        };
    });

    // 兩個抵達都必須回報(修正前只會回報最後覆蓋的 B,A 遺失)
    expect(r.arrivedIds).toEqual(['A', 'B']);
    expect(r.arrivedTypes).toEqual(['stone', 'wood']);
    // A、B 已從 activeTransfers 與 sentIds 移除,只剩 C
    expect(r.remaining).toEqual(['C']);
    expect(r.sentIdsRemaining).toEqual(['C']);
});
