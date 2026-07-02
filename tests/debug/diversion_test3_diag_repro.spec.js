// [TEMP-DIAG] 完整重播使用者第二次錄製的 tests/test_scripts/test_scripts_diversion_test3.spec.js
// (含主幹線+第二段延伸+派工+設過濾器+中段拉分支到 core_village)。診斷用,不做斷言。
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

test('診斷重現:拉第二條線堵死(test3 完整版)', async ({ page }) => {
    page.on('pageerror', (err) => console.log('[PAGEERROR]', err.message));

    await page.setViewportSize({ width: 1920, height: 911 });
    await page.goto('/?seed=1782824588473');
    await page.waitForTimeout(1000);

    await page.evaluate(() => window.setLogisticsWorker(true));
    await page.waitForTimeout(300);
    const diagSetupMsg = await page.evaluate(() => window.setLogisticsWorkerLineDiag());
    console.log('[DIAG] diag 設定回應:', diagSetupMsg);

    // --- 逐字複製自 test_scripts_diversion_test3.spec.js(第二次錄製) ---
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1020, 390, 1166.5366640813522, 772.7090432787251, 'core_storehouse', {"dir":"right","width":1,"defIndex":2,"slotIndex":0,"x":1020,"y":390}, null, '', 'x-first', [{"x":502,"y":491,"dirIn":null,"dirOut":{"x":1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":503,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":504,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":0,"y":1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":492,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":493,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":496,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":497,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":498,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":499,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":500,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":501,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":502,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":503,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":504,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":505,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":506,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":507,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":508,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":509,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":510,"dirIn":{"x":0,"y":1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}], null));
    await page.waitForTimeout(500);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1170, 770, 987.5019991776988, 641.5080674714676, null, {"dir":"down","width":1,"x":1170,"y":770,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1160_760_mr37q4f3_33o_seg_117_76_52', '', 'x-first', [{"x":510,"y":510,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":509,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":509,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":501,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}], 'core_village'));
    await page.waitForTimeout(500);
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_676', 'undefined', 930, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 936.0684262022181, 365.939495854227));
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_677', 'undefined', 970, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 976.0684262022181, 365.939495854227));
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_678', 'undefined', 1010, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 936.0684262022181, 405.939495854227));
    await page.waitForTimeout(1202);
    await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390); if(e && window.LogisticsUI) window.LogisticsUI.showLogisticsMenu(e, 'core_village', 0, 0, 'logistics_core_storehouse_1160_760_mr37q4f3_33o_seg_102_39_0@102,39'); });
    await page.waitForTimeout(1190);
    await executeLogic(page, () => {
    const src = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390);
    if (src && window.LogisticsUI) {
        window.LogisticsUI.showLogisticsMenu(src, 'core_village', 0, 0, 'logistics_core_storehouse_1160_760_mr37q4f3_33o_seg_102_39_0@102,39');
        window.LogisticsUI.setLogisticsFilter(null, 'wood');
        const menu = document.getElementById('logistics_menu');
        if (menu) menu.style.display = 'none';
    }
});
    await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390); if(e && window.LogisticsUI) window.LogisticsUI.showLogisticsMenu(e, 'core_village', 0, 0, 'logistics_core_storehouse_1160_760_mr37q4f3_33o_seg_102_39_0@102,39'); });

    // 讓派工+木頭運輸先穩定跑一段時間再拉分支(對齊使用者原錄製的 13.9 秒等待)
    await page.waitForTimeout(13912);

    const beforeDrag3 = await page.evaluate(() => {
        const state = window.GameEngine.state;
        return (state.activeTransfers || []).map(t => ({
            id: t.id, lineId: t.lineId, progress: t.progress,
            targetId: t.targetId, targetPoint: t.targetPoint, targetPort: t.targetPort,
            routeEnd: Array.isArray(t.routePoints) && t.routePoints.length ? t.routePoints[t.routePoints.length - 1] : null
        }));
    });
    console.log('=== [DIAG] drag3 之前的 activeTransfers 快照(' + beforeDrag3.length + ' 筆) ===');
    console.log(JSON.stringify(beforeDrag3, null, 2));

    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(994.9807612169013, 768.3788653033322, 944.5690572136125, 645.150256549524, null, {"dir":"up","width":1,"x":994.9807612169013,"y":768.3788653033322,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1160_760_mr37q4f3_33o_seg_99_76_18', '', 'x-first', [{"x":501,"y":510,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":509,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":499,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}], 'core_village'));

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

    const afterDrag3 = await page.evaluate(() => {
        const state = window.GameEngine.state;
        return (state.activeTransfers || []).map(t => ({
            id: t.id, lineId: t.lineId, progress: t.progress,
            targetId: t.targetId, targetPoint: t.targetPoint, targetPort: t.targetPort,
            routeEnd: Array.isArray(t.routePoints) && t.routePoints.length ? t.routePoints[t.routePoints.length - 1] : null,
            maxAllowedProgress: t.maxAllowedProgress
        }));
    });
    console.log('=== [DIAG] drag3 之後(穩定後)主執行緒 activeTransfers 快照(' + afterDrag3.length + ' 筆) ===');
    console.log(JSON.stringify(afterDrag3, null, 2));

    const groupSummary = await page.evaluate(() => {
        const lines = window.GameEngine.state.logisticsLines || [];
        const byGroup = {};
        for (const l of lines) {
            const gid = l.groupId || l.id;
            if (!byGroup[gid]) byGroup[gid] = { count: 0, sourceId: l.sourceId, targetId: l.targetId };
            byGroup[gid].count++;
        }
        return byGroup;
    });
    console.log('=== [DIAG] 目前 logisticsLines 分組摘要 ===');
    console.log(JSON.stringify(groupSummary, null, 2));

    const workerDump = await page.evaluate(async () => {
        if (typeof window.dumpLogisticsWorkerDiag !== 'function') return null;
        await window.dumpLogisticsWorkerDiag();
        return window.__logisticsWorkerDiagDump;
    });
    console.log('=== [DIAG] worker 緩衝區完整內容(' + (workerDump ? workerDump.length : 0) + ' 筆) ===');
    console.log(JSON.stringify(workerDump, null, 2));
});
