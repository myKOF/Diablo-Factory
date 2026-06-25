const { test, expect } = require('@playwright/test');

// P1a: 合流輸入間距決策算術抽取為共享純函式 LogisticsMergeSpacing.js。
// 這些案例「位元級」釘住目前 LogisticsTransferQueues / LogisticsTransferSystem 內
// 兩份重複 getMergeInputMaxDistance 的決策邏輯，確保抽取前後行為完全一致。
// 期望值由原始碼算術直接推導（見每案註解）。
test('LogisticsMergeSpacing 純函式必須複刻原始合流間距決策算術', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const mod = await import('/src/systems/logistics/LogisticsMergeSpacing.js?v=' + Date.now());
        const { computeMergeInputMaxDistance, computeMergeInputRequiredWait } = mod;
        if (typeof computeMergeInputMaxDistance !== 'function' || typeof computeMergeInputRequiredWait !== 'function') {
            return { failures: ['模組未匯出 computeMergeInputMaxDistance / computeMergeInputRequiredWait'] };
        }

        const failures = [];
        const near = (got, want, label) => {
            if (!(Math.abs(got - want) < 1e-6)) failures.push(`${label}: 期望 ${want}，得到 ${got}`);
        };

        // 1. 非勝者一律停在合流點前一格：max(0, totalLength - spacing)
        near(computeMergeInputMaxDistance(100, 20, false, {}, []), 80, '非勝者基本');
        // 1b. totalLength < spacing 時夾到 0
        near(computeMergeInputMaxDistance(10, 20, false, {}, []), 0, '非勝者夾零');

        // 2. 勝者、輸出線上無其他車 → 不受限，回傳 totalLength
        near(computeMergeInputMaxDistance(100, 20, true, {}, []), 100, '勝者無他車');

        // 3. 勝者、前方有車已過合流點 (distFromMerge>=0 且 <spacing)：followGap = spacing - distFromMerge
        //    distFromMerge=5 → followGap=15 → 100-15=85
        near(computeMergeInputMaxDistance(100, 20, true, {}, [5]), 85, '勝者跟前車');

        // 4. 勝者、後方有逼近車 (distFromMerge<0 且 abs<spacing)，非 overlap-turn：followGap=spacing
        //    distFromMerge=-5 → followGap=20 → 100-20=80
        near(computeMergeInputMaxDistance(100, 20, true, {}, [-5]), 80, '勝者後車逼近');

        // 5. followingMainMayOverlapTurn 例外：zipperTurn='branch' 且 awaitingMainPass!==true 且 distFromMerge<-0.01
        //    → 第一分支被跳過、第二分支不符 → requiredWait=0 → 回傳 totalLength
        near(computeMergeInputMaxDistance(100, 20, true, { zipperTurn: 'branch', awaitingMainPass: false }, [-5]), 100, 'overlap-turn例外');

        // 6. 防碎片視界分支：awaitingMainPass===true 且 zipperTurn!=='branch'
        //    且 -(spacing+0.1) >= distFromMerge > -spacing*3 → requiredWait=spacing
        //    distFromMerge=-30 → 100-20=80
        near(computeMergeInputMaxDistance(100, 20, true, { awaitingMainPass: true, zipperTurn: 'main' }, [-30]), 80, '防碎片視界命中');

        // 6b. 視界外（distFromMerge <= -spacing*3）→ 不限制
        near(computeMergeInputMaxDistance(100, 20, true, { awaitingMainPass: true, zipperTurn: 'main' }, [-70]), 100, '防碎片視界外');

        // 7. 多台車取最大 requiredWait：others=[5,-5] (node 預設) → max(15,20)=20 → 80
        near(computeMergeInputMaxDistance(100, 20, true, {}, [5, -5]), 80, '多車取最大等待');

        // 8. computeMergeInputRequiredWait 直接驗證（與上面對應）
        near(computeMergeInputRequiredWait({}, 20, []), 0, 'requiredWait 空');
        near(computeMergeInputRequiredWait({}, 20, [5]), 15, 'requiredWait 前車');
        near(computeMergeInputRequiredWait({}, 20, [-5]), 20, 'requiredWait 後車');
        near(computeMergeInputRequiredWait({ awaitingMainPass: true, zipperTurn: 'main' }, 20, [-30]), 20, 'requiredWait 防碎片');

        return { failures };
    });

    expect(result.failures, JSON.stringify(result.failures)).toEqual([]);
});
