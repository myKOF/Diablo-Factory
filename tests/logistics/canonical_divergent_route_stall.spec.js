const { test, expect } = require('@playwright/test');

// [第七根因回歸] 同群組混雜新舊世代路線(中段拉分支後的常態):舊路線在分岔點後與
// canonical(組內最長路線)幾何分歧。applyBlockedQueues 的 canonical→own 寫回若用
// 最近點反投影,「排隊維持不動」的物品會被每個子步吸回分岔點,progress 精準釘死,
// 並經間距鏈鎖死整條隊伍。本測試驗證舊路線物品能單調走完自己的路線。
test('混雜世代路線:舊路線物品不被 canonical 投影吸回分岔點', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsTransferQueues } = await import('/src/systems/logistics/LogisticsTransferQueues.js');

        // 舊世代路線:於 (100,0) 分岔轉北,總長 160;新世代(canonical,最長):直行到 (200,0) 再轉北,總長 300。
        const oldRoute = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }];
        const newRoute = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }];
        const oldTotal = 160;

        const oldGen = {
            id: 'old_gen', lineId: 'line_a',
            routePoints: oldRoute.map(p => ({ ...p })),
            progress: 110 / oldTotal, // 已越過分岔點(100px),在自己的分支段上
            targetId: 'village_old', targetPoint: { x: 100, y: 60 }
        };
        const newGen = {
            id: 'new_gen', lineId: 'line_a',
            routePoints: newRoute.map(p => ({ ...p })),
            progress: 30 / 300,
            targetId: 'village_new', targetPoint: { x: 200, y: 100 }
        };
        const state = { activeTransfers: [oldGen, newGen] };

        const queues = new LogisticsTransferQueues(
            { isLogisticsMergeInputTransfer: () => false },
            () => ({ TILE_SIZE: 20 })
        );

        // 模擬「kinematics 前進一子步 → applyBlockedQueues 收斂」的循環
        const history = [];
        for (let i = 0; i < 30; i++) {
            oldGen.progress = Math.min(1, oldGen.progress + 4 / oldTotal); // 每子步前進 4px
            queues.applyBlockedQueues(state);
            history.push(oldGen.progress * oldTotal);
        }

        for (let i = 1; i < history.length; i++) {
            if (history[i] < history[i - 1] - 0.01) {
                return { success: false, error: `第 ${i} 步被往回吸:${history[i - 1].toFixed(2)} → ${history[i].toFixed(2)}px`, history };
            }
        }
        const finalDist = history[history.length - 1];
        if (finalDist < oldTotal - 0.5) {
            return { success: false, error: `未走完自己的路線:釘死在 ${finalDist.toFixed(2)}/${oldTotal}px(分岔點=100px)`, history };
        }
        if (newGen.progress < 0 || newGen.progress > 1) {
            return { success: false, error: `後車 progress 異常:${newGen.progress}` };
        }
        return { success: true };
    });

    expect(result.error || '').toBe('');
    expect(result.success).toBe(true);
});
