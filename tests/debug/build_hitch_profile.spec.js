// 自動生成的 Playwright 邏輯化 E2E 測試腳本
const { test, expect } = require('@playwright/test');

const executeLogic = async (page, fn, ...args) => {
    await page.evaluate(({fnStr, args}) => {
        try {
            const func = new Function('return ' + fnStr)();
            func(...args);
        } catch (e) {
            console.warn('指令忽略:', e);
        }
    }, { fnStr: fn.toString(), args });
    await page.waitForTimeout(200);
};

test('建造卡頓相位計時:diversion_test2', async ({ page }) => {
    test.setTimeout(240000);
    page.on('pageerror', (err) => console.log('[PAGEERROR]', err.message));
    await page.setViewportSize({ width: 1081, height: 911 });

    // 帶上原本的隨機種子，確保地圖生成與錄製時一模一樣
    await page.goto('/?seed=1783052594041');
    await page.waitForTimeout(1000);

    await page.evaluate(() => window.setLogisticsWorker(true));
    await page.waitForTimeout(300);
    const diagSetupMsg = await page.evaluate(() => window.setLogisticsWorkerLineDiag());
    console.log('[DIAG] diag 設定回應:', diagSetupMsg);

    await page.evaluate(() => {
        'use strict';
        window.__prof = { calls: [], longtasks: [], ticks: [], patched: [], failed: [], frozen: {}, counts: {}, maxMs: {} };
        const cs = window.conveyorSystem;
        window.__profCs = cs;
        window.__prof.frozen = {
            cs: Object.isFrozen(cs),
            dragSubmission: Object.isFrozen(cs.dragSubmission),
            linePlacement: Object.isFrozen(cs.linePlacement)
        };
        // 直接掛在 prototype 上(實例可能被 freeze;嚴格模式下失敗會丟例外被捕捉記錄)
        const mkProto = (obj, name, label) => {
            try {
                if (!obj || typeof obj[name] !== 'function') { window.__prof.failed.push(label + ':missing'); return; }
                const target = Object.getPrototypeOf(obj) && typeof Object.getPrototypeOf(obj)[name] === 'function'
                    ? Object.getPrototypeOf(obj)
                    : obj;
                const orig = target[name];
                target[name] = function (...a) {
                    const t0 = performance.now();
                    const r = orig.apply(this, a);
                    const ms = performance.now() - t0;
                    const p = window.__prof;
                    p.counts[label] = (p.counts[label] || 0) + 1;
                    if (!(p.maxMs[label] >= ms)) p.maxMs[label] = +ms.toFixed(2);
                    if (ms > 0.5) p.calls.push({ label, ms: +ms.toFixed(1), t: Math.round(t0) });
                    return r;
                };
                window.__prof.patched.push(label);
            } catch (e) {
                window.__prof.failed.push(label + ':' + e.message);
            }
        };
        mkProto(cs, 'simulateDragAndSubmit', 'simulateDrag');
        mkProto(cs.dragSubmission, 'submitDrag', 'submitDrag_total');
        mkProto(cs.dragSession, 'startDrag', 'startDrag');
        mkProto(cs.dragSession, 'updateDragNow', 'updateDragNow');
        mkProto(cs, 'createRoutingGrid', 'createRoutingGrid');
        mkProto(cs, 'collectLogisticsOccupiedKeys', 'collectOccupiedKeys');
        mkProto(cs, 'isCrossingMultipleLogisticsGroups', 'crossingCheck');
        mkProto(cs.extensionCoordinator, 'splitSourceGroupForMiddleExtension', 'middleSplit');
        mkProto(cs, 'upsertLogisticsLine', 'upsertLine');
        if (cs.router) mkProto(cs.router, 'validateRouteFootprint', 'validateFootprint');
        mkProto(cs.lineBuildContext, 'create', 'buildContext');
        mkProto(cs, 'buildLogisticsSegments', 'buildSegments');
        mkProto(cs.linePlacement, 'placeSegments', 'placeSegments');
        mkProto(cs.lineMetadata, 'syncGroupSegments', 'metaSync');
        mkProto(cs.lineMergeCoordinator, 'mergeOverlaps', 'mergeOverlaps');
        mkProto(cs.lineFinalizer, 'finalizeBuild', 'finalizeBuild');
        mkProto(cs, 'updateActiveTransfersOnLogisticsChange', 'rerouter');
        mkProto(cs, 'rebuildSpatialHashGrid', 'spatialRebuild');
        const ls = window.GameEngine.workerSystem.logisticsSystem;
        mkProto(ls, 'processAutomatedLogistics', 'logisticsTick');
        // 主執行緒阻塞取樣器:10ms 間隔,實際間隔 >50ms 即記為一次阻塞(headless longtask 後備)
        let lastBeat = performance.now();
        setInterval(() => {
            const now = performance.now();
            const gap = now - lastBeat;
            lastBeat = now;
            if (gap > 50) window.__prof.longtasks.push({ t: Math.round(now - gap), ms: Math.round(gap), kind: 'beatGap' });
        }, 10);
        try {
            new PerformanceObserver((list) => {
                for (const e of list.getEntries()) {
                    window.__prof.longtasks.push({ t: Math.round(e.startTime), ms: Math.round(e.duration), kind: 'longtask' });
                }
            }).observe({ entryTypes: ['longtask'] });
        } catch (e) { window.__prof.failed.push('longtask:' + e.message); }
    });

    // --- 邏輯錄製開始 ---
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(6001);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1020, 390, 1189.677649526628, 792.781094030396, 'core_storehouse', {"dir":"right","width":1,"defIndex":2,"slotIndex":0,"x":1020,"y":390}, null, '', 'x-first', [{"x":502,"y":491,"dirIn":null,"dirOut":{"x":1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":503,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":504,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":0,"y":1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":492,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":493,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":496,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":497,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":498,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":499,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":500,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":501,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":502,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":503,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":504,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":505,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":506,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":507,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":508,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":509,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":510,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":511,"dirIn":{"x":0,"y":1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}], null));
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(1059);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1190, 790, 990.670321456409, 651.3180535949393, null, {"dir":"down","width":1,"x":1190,"y":790,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1180_780_mr4fhroo_7pn_seg_119_78_56', '', 'x-first', [{"x":511,"y":511,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":510,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":510,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":509,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}], null));
    // 命令單位 unit_682 執行 MOVE
    await page.waitForTimeout(2005);
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_682', 'undefined', 930, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 950.2900527955252, 413.12930660837696));
    // 命令單位 unit_683 執行 MOVE
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_683', 'undefined', 970, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 990.2900527955252, 413.12930660837696));
    // 命令單位 unit_684 執行 MOVE
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_684', 'undefined', 1010, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 950.2900527955252, 453.12930660837696));
    // 開啟物流線介面: storehouse -> core_village
    await page.waitForTimeout(1584);
    await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390); if(e && window.LogisticsUI) window.LogisticsUI.showLogisticsMenu(e, 'core_village', 0, 0, 'logistics_core_storehouse_1180_780_mr4fhroo_7pn_seg_104_39_2@104,39'); });
    // 設定物流線過濾器: wood
    await page.waitForTimeout(1116);
    await executeLogic(page, () => {
    const src = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390);
    if (src && window.LogisticsUI) {
        window.LogisticsUI.showLogisticsMenu(src, 'core_village', 0, 0, 'logistics_core_storehouse_1180_780_mr4fhroo_7pn_seg_104_39_2@104,39');
        window.LogisticsUI.setLogisticsFilter(null, 'wood');
        const menu = document.getElementById('logistics_menu');
        if (menu) menu.style.display = 'none'; // 模擬設定後隱藏或維持不干擾
    }
});
    // 開啟物流線介面: storehouse -> core_village
    await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390); if(e && window.LogisticsUI) window.LogisticsUI.showLogisticsMenu(e, 'core_village', 0, 0, 'logistics_core_storehouse_1180_780_mr4fhroo_7pn_seg_104_39_2@104,39'); });
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(16019);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(996.3464511417321, 787.5300375685981, 958.5252658888141, 642.702572087911, null, {"dir":"up","width":1,"x":996.3464511417321,"y":787.5300375685981,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1180_780_mr4fhroo_7pn_seg_99_78_20', '', 'x-first', [{"x":501,"y":511,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":510,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":509,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":499,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}], 'core_village'));
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(9426);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(951.1455224248298, 781.99522997061, 791.5585700161748, 591.9668357730206, null, {"dir":"up","width":1,"x":951.1455224248298,"y":781.99522997061,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1180_780_mr4fhroo_7pn_seg_95_78_4', '', 'x-first', [{"x":499,"y":511,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":498,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":497,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":496,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":495,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":494,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":493,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":492,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":510,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":509,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":502,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":501,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}], null));
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(926);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(790, 590, 893.0300426459555, 596.5791754380107, null, {"dir":"up","width":1,"x":790,"y":590,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1180_780_mr4fhroo_7pn_seg_79_60_34', '', 'x-first', [{"x":491,"y":501,"dirIn":null,"dirOut":{"x":1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":492,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":493,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":494,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":495,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":496,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":497,"y":501,"dirIn":{"x":1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}], 'core_village'));
    await page.waitForTimeout(14089);
    // --- 邏輯錄製結束 ---

    await page.waitForTimeout(5000);
    const sanity = await page.evaluate(() => ({
        sameInstance: window.__profCs === window.conveyorSystem,
        hasProf: !!window.__prof,
        lines: (window.GameEngine.state.logisticsLines || []).length,
        transfers: (window.GameEngine.state.activeTransfers || []).length
    }));
    console.log('[PROF-SANITY]', JSON.stringify(sanity));
    const prof = await page.evaluate(() => window.__prof);
    console.log('[PROF-PATCHED]', JSON.stringify(prof.patched), 'failed:', JSON.stringify(prof.failed), 'frozen:', JSON.stringify(prof.frozen));
    console.log('[PROF-COUNTS]', JSON.stringify(prof.counts));
    console.log('[PROF-MAXMS]', JSON.stringify(prof.maxMs));
    console.log('[PROF-CALLS] 逐次呼叫(>0.5ms):');
    for (const c of prof.calls.filter(x => x.ms >= 2 || x.label === 'submitDrag_total')) console.log('  ', JSON.stringify(c));
    console.log('[PROF-LONGTASK] 主執行緒阻塞(>50ms):');
    for (const lt of prof.longtasks.filter(x => x.ms >= 50)) console.log('  ', JSON.stringify(lt));
});
