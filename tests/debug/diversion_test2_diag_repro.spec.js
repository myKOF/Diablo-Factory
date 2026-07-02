// [TEMP-DIAG] 重播使用者錄製的 tests/test_scripts/test_scripts_diversion_test2.spec.js,
// 在動作序列前先開啟 Web Worker + 全線診斷(setLogisticsWorkerLineDiag()),並在結束時把
// 分類 LOGISTICS 的日誌與各線凍結物品統計印到終端機,方便直接分析「拉第三條物流線時堵死」的根因。
// 除錯用,不做斷言;問題定位後可刪除。
const { test } = require('@playwright/test');

const executeLogic = async (page, fn, ...args) => {
    await page.evaluate(({ fnStr, args }) => {
        try {
            const func = new Function('return ' + fnStr)();
            func(...args);
        } catch (e) {
            console.warn('指令忽略:', e);
        }
    }, { fnStr: fn.toString(), args });
    await page.waitForTimeout(200);
};

test('診斷重現:拉第三條物流線堵死', async ({ page }) => {
    page.on('pageerror', (err) => console.log('[PAGEERROR]', err.message));

    await page.setViewportSize({ width: 1920, height: 911 });
    await page.goto('/?seed=1782824588473');
    await page.waitForTimeout(1000);

    // [TEMP-DIAG] 開啟 worker + 監控全部物流線(setLogisticsWorkerLineDiag() 不帶參數 = 全部)。
    // 注意:setLogisticsWorker(true) 只是設旗標,_workerBridge 要等下個 game tick 才會真的建立,
    // 兩次呼叫間必須讓出至少一個 tick,否則 setLogisticsWorkerLineDiag 會因 _workerBridge 還是 null 而失效。
    await page.evaluate(() => window.setLogisticsWorker(true));
    await page.waitForTimeout(300);
    const diagSetupMsg = await page.evaluate(() => window.setLogisticsWorkerLineDiag());
    console.log('[DIAG] diag 設定回應:', diagSetupMsg);

    // --- 以下逐字複製自使用者錄製的 test_scripts_diversion_test2.spec.js 動作序列 ---
    await page.waitForTimeout(3088);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1020, 390, 1171.8611717629578, 749.848504190585, 'core_storehouse', {"dir":"right","width":1,"defIndex":2,"slotIndex":0,"x":1020,"y":390}, null, '', 'x-first', [{"x":502,"y":491,"dirIn":null,"dirOut":{"x":1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":503,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":504,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":0,"y":1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":492,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":493,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":496,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":497,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":498,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":499,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":500,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":501,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":502,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":503,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":504,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":505,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":506,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":507,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":508,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":509,"dirIn":{"x":0,"y":1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}], null));
    await page.waitForTimeout(1120);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1170, 750, 986.9215434303811, 657.378690798708, null, {"dir":"down","width":1,"x":1170,"y":750,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1160_740_mr35pzsp_w1_seg_117_74_50', '', 'x-first', [{"x":510,"y":509,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":509,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}], null));
    await page.waitForTimeout(2308);
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_676', 'undefined', 930, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 950.3243972979704, 341.001083773461));
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_677', 'undefined', 970, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 990.3243972979704, 341.001083773461));
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_678', 'undefined', 1010, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 950.3243972979704, 381.001083773461));
    await page.waitForTimeout(1474);
    await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390); if(e && window.LogisticsUI) window.LogisticsUI.showLogisticsMenu(e, 'core_village', 0, 0, 'logistics_core_storehouse_1160_740_mr35pzsp_w1_seg_102_39_0@102,39'); });
    await page.waitForTimeout(1026);
    await executeLogic(page, () => {
    const src = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390);
    if (src && window.LogisticsUI) {
        window.LogisticsUI.showLogisticsMenu(src, 'core_village', 0, 0, 'logistics_core_storehouse_1160_740_mr35pzsp_w1_seg_102_39_0@102,39');
        window.LogisticsUI.setLogisticsFilter(null, 'wood');
        const menu = document.getElementById('logistics_menu');
        if (menu) menu.style.display = 'none';
    }
});
    await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390); if(e && window.LogisticsUI) window.LogisticsUI.showLogisticsMenu(e, 'core_village', 0, 0, 'logistics_core_storehouse_1160_740_mr35pzsp_w1_seg_102_39_0@102,39'); });
    await page.waitForTimeout(13231);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(991.9547631848217, 742.839433764795, 948.2780628363723, 627.4081552391725, null, {"dir":"up","width":1,"x":991.9547631848217,"y":742.839433764795,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1160_740_mr35pzsp_w1_seg_99_74_18', '', 'x-first', [{"x":501,"y":509,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":499,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}], 'core_village'));
    // [重點] ↑ 這是使用者所稱「第三條物流線」:從既有已連線的線段(seg_99)拉出新分支,明確指定終點 core_village。

    // [TEMP-DIAG] 每 2 秒印一次各線在途/凍結物品數,觀察凍結是否隨時間出現、何時出現
    const snapshot = async (label) => {
        const summary = await page.evaluate(() => {
            const state = window.GameEngine.state;
            const byLine = {};
            for (const t of (state.activeTransfers || [])) {
                if (!t) continue;
                const mp = t.maxAllowedProgress !== undefined ? t.maxAllowedProgress : 1;
                const frozen = Math.abs(mp - (t.progress || 0)) < 1e-6 && (t.progress || 0) > 0.001 && t.queueBlocked !== true;
                if (!byLine[t.lineId]) byLine[t.lineId] = { total: 0, frozen: 0 };
                byLine[t.lineId].total++;
                if (frozen) byLine[t.lineId].frozen++;
            }
            return byLine;
        });
        console.log(`[DIAG] ${label}:`, JSON.stringify(summary));
    };
    for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(2000);
        await snapshot(`t+${(i + 1) * 2}s`);
    }

    const diagLog = await page.evaluate(() => window.GameEngine.state.log.filter(e => e && e.category === 'LOGISTICS'));
    console.log('=== [DIAG] LOGISTICS 日誌(' + diagLog.length + ' 筆) ===');
    console.log(JSON.stringify(diagLog, null, 2));

    const fullLog = await page.evaluate(() => window.GameEngine.state.log);
    console.log('=== [DIAG] 完整日誌不分類(' + fullLog.length + ' 筆) ===');
    console.log(JSON.stringify(fullLog, null, 2));

    const groupSummary = await page.evaluate(() => {
        const lines = window.GameEngine.state.logisticsLines || [];
        const byGroup = {};
        for (const l of lines) {
            const gid = l.groupId || l.id;
            if (!byGroup[gid]) byGroup[gid] = { count: 0, sourceId: l.sourceId, targetId: l.targetId, ids: [] };
            byGroup[gid].count++;
            byGroup[gid].ids.push(l.id);
        }
        return byGroup;
    });
    console.log('=== [DIAG] 目前 logisticsLines 分組摘要 ===');
    console.log(JSON.stringify(groupSummary, null, 2));

    const frozenSummary = await page.evaluate(() => {
        const state = window.GameEngine.state;
        const byLine = {};
        for (const t of (state.activeTransfers || [])) {
            if (!t) continue;
            const mp = t.maxAllowedProgress !== undefined ? t.maxAllowedProgress : 1;
            const frozen = Math.abs(mp - (t.progress || 0)) < 1e-6 && (t.progress || 0) > 0.001 && t.queueBlocked !== true;
            if (!byLine[t.lineId]) byLine[t.lineId] = { total: 0, frozen: 0 };
            byLine[t.lineId].total++;
            if (frozen) byLine[t.lineId].frozen++;
        }
        return byLine;
    });
    console.log('=== [DIAG] 各線在途/凍結物品統計 ===');
    console.log(JSON.stringify(frozenSummary, null, 2));

    const workerDump = await page.evaluate(async () => {
        if (typeof window.dumpLogisticsWorkerDiag !== 'function') return null;
        await window.dumpLogisticsWorkerDiag();
        return window.__logisticsWorkerDiagDump;
    });
    console.log('=== [DIAG] worker 緩衝區完整內容(' + (workerDump ? workerDump.length : 0) + ' 筆) ===');
    console.log(JSON.stringify(workerDump, null, 2));
});
