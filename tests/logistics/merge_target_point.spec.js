const { test, expect } = require('@playwright/test');

// [回歸] 合流交接時 targetPoint 必須更新為新輸出線終點。
// 否則斷線防護的抵達判定(終點≈targetPoint)永遠不成立,合流過來的物品在終點端口前堆死,
// 支線新物品因 occupied 無法合流,看似在合流點憑空消失。
test('合流交接後 targetPoint 必須同步為輸出線終點(否則終點端口堵死)', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsMergeNodeRuntime } = await import('/src/systems/logistics/LogisticsMergeNodeRuntime.js?v=' + Date.now());

        // 合流點 (100,100);支線 line_b 止於合流點;輸出線 output_line 由合流點延伸至端口 (100,300)。
        const mergePoint = { x: 100, y: 100 };
        const outputEnd = { x: 100, y: 300 };
        const outputRoute = [{ x: 100, y: 100 }, outputEnd];

        const node = {
            id: 'n', outputGroupId: 'output_line', inputGroupIds: ['line_b'],
            point: mergePoint, currentActiveSlot: 0, roundRobinIndex: 0
        };
        // 支線物品停在合流門口(progress≈1),targetPoint 為「舊輸入線終點」=合流點(刻意製造 stale 值)
        const branch = {
            id: 'item_b', lineId: 'line_b', progress: 0.999,
            routePoints: [{ x: 0, y: 100 }, { x: 100, y: 100 }],
            targetPoint: { x: 100, y: 100 }, targetId: null, sourceId: 's'
        };
        const testState = { logisticsMergeNodes: [node], activeTransfers: [branch] };

        const system = {
            ensureLogisticsMergeNodeStore: () => testState.logisticsMergeNodes,
            getLogisticsMergeNodeForInputTransfer: (t) => node.inputGroupIds.includes(t.lineId) ? node : null,
            getLogisticsMergeNodeOutputRoute: () => outputRoute,
            getLogisticsSegmentsByGroupId: () => [{ sourceId: 'merge_output', targetId: 'port_target', efficiency: 4 }]
        };
        const runtime = new LogisticsMergeNodeRuntime(system, () => ({ TILE_SIZE: 20, state: testState }));

        const changed = runtime.apply(testState);
        const t = testState.activeTransfers[0];
        return {
            changed,
            lineId: t.lineId,
            targetId: t.targetId,
            targetPoint: t.targetPoint,
            routeEnd: t.routePoints[t.routePoints.length - 1]
        };
    });

    // 交接已發生:換到輸出線、目標端口
    expect(result.changed).toBe(true);
    expect(result.lineId).toBe('output_line');
    expect(result.targetId).toBe('port_target');
    // 關鍵斷言:targetPoint 已從 stale 合流點(100,100)更新為輸出線終點(100,300)
    expect(result.targetPoint).toEqual(result.routeEnd);
    expect(result.targetPoint.y).toBe(300);
});
