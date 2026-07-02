const { test, expect } = require('@playwright/test');

test('worker topology signature 必須偵測同點數路線的座標與端口變更', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsWorkerBridge } = await import('/src/systems/logistics/LogisticsWorkerBridge.js?v=' + Date.now());
        const bridge = Object.create(LogisticsWorkerBridge.prototype);
        const baseLine = {
            id: 'line_a',
            groupId: 'group_a',
            sourceId: 'source_a',
            targetId: 'target_a',
            sourcePort: { x: 100, y: 100, dir: 'right', width: 1, slotIndex: 0, defIndex: 0 },
            targetPort: { x: 260, y: 100, dir: 'left', width: 1, slotIndex: 0, defIndex: 0 },
            targetPoint: null,
            routePoints: [{ x: 100, y: 100 }, { x: 180, y: 100 }, { x: 260, y: 100 }]
        };
        const movedLine = {
            ...baseLine,
            targetPort: { x: 260, y: 200, dir: 'left', width: 1, slotIndex: 1, defIndex: 0 },
            routePoints: [{ x: 100, y: 100 }, { x: 180, y: 200 }, { x: 260, y: 200 }]
        };
        const retargetedLine = {
            ...baseLine,
            targetId: 'target_b'
        };
        const sigA = bridge._topologySignature({ logisticsLines: [baseLine], logisticsMergeNodes: [] });
        const sigMoved = bridge._topologySignature({ logisticsLines: [movedLine], logisticsMergeNodes: [] });
        const sigRetargeted = bridge._topologySignature({ logisticsLines: [retargetedLine], logisticsMergeNodes: [] });
        return { sigA, sigMoved, sigRetargeted };
    });

    expect(result.sigMoved, '路線座標/端口變更時簽章必須改變').not.toBe(result.sigA);
    expect(result.sigRetargeted, 'targetId 變更時簽章必須改變').not.toBe(result.sigA);
});
