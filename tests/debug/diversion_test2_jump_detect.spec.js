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

test('跳變偵測:diversion_test2 拉分支瞬間物品位置不得瞬移', async ({ page }) => {
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

    // 逐 50ms 取樣每個在途物品的邏輯位置(routePoints+progress),偵測 300ms 內 >60px 的跳變。
    // 正常移動速度遠低於此;路線改派若保住投影位置也不會觸發;只有「舊路線座標系的純量
    // 蓋到新路線上」這類位置錯亂會被抓到。
    await page.evaluate(async () => {
        const { getPointOnPathProgress } = await import('/src/systems/logistics/LogisticsPathMetrics.js');
        window.__jumpLog = [];
        window.__vanishLog = [];
        // 記錄物流系統實際收到的每 tick dt(含時間戳),用來分辨「模擬真的躍進」vs「偵測器取樣空窗」
        window.__dtLog = [];
        const ls = window.GameEngine && window.GameEngine.workerSystem && window.GameEngine.workerSystem.logisticsSystem;
        if (ls && typeof ls.processAutomatedLogistics === 'function' && !ls.__dtPatched) {
            ls.__dtPatched = true;
            const orig = ls.processAutomatedLogistics.bind(ls);
            ls.processAutomatedLogistics = (state, dt) => {
                window.__dtLog.push({ t: Math.round(performance.now()), dt: +(+dt).toFixed(4) });
                if (window.__dtLog.length > 3000) window.__dtLog.splice(0, 1000);
                return orig(state, dt);
            };
        }
        const lastPos = new Map();
        setInterval(() => {
            const state = window.GameEngine && window.GameEngine.state;
            if (!state) return;
            const now = performance.now();
            const seen = new Set();
            for (const t of (state.activeTransfers || [])) {
                if (!t || !Array.isArray(t.routePoints) || t.routePoints.length < 2) continue;
                const p = getPointOnPathProgress(t.routePoints, t.progress || 0);
                if (!p) continue;
                seen.add(t.id);
                const prev = lastPos.get(t.id);
                if (prev) {
                    const d = Math.hypot(p.x - prev.x, p.y - prev.y);
                    const dt = now - prev.t;
                    if (d > 60 && dt < 300) {
                        window.__jumpLog.push({
                            id: t.id, line: t.lineId, d: Math.round(d), dtMs: Math.round(dt),
                            eff: +(Number(t.efficiency) || 0).toFixed(1),
                            tNow: Math.round(now),
                            routeChanged: prev.route !== t.routePoints,
                            progFrom: +prev.prog.toFixed(4), progTo: +(t.progress || 0).toFixed(4),
                            from: { x: Math.round(prev.x), y: Math.round(prev.y) },
                            to: { x: Math.round(p.x), y: Math.round(p.y) }
                        });
                    }
                }
                const tp = t.targetPort || t.targetPoint;
                const dTarget = tp ? Math.round(Math.hypot(p.x - tp.x, p.y - tp.y)) : -1;
                lastPos.set(t.id, { x: p.x, y: p.y, t: now, prog: t.progress || 0, dTarget, targetId: t.targetId || null, route: t.routePoints });
            }
            // 中途消失偵測:progress<0.9 就從 activeTransfers 消失 = 非正常送達的移除
            // (如 rerouter recoverTransferToSource 退回來源),即使用者看到的「消失/重置」候選。
            for (const id of Array.from(lastPos.keys())) {
                if (!seen.has(id)) {
                    const last = lastPos.get(id);
                    // 距目標端口 2.5 格內消失=合法入庫(多端口/終點閘門提前入庫),不記
                    if (last && last.prog < 0.9 && !(last.dTarget >= 0 && last.dTarget <= 50)) {
                        window.__vanishLog.push({ id, prog: +last.prog.toFixed(3), x: Math.round(last.x), y: Math.round(last.y), dTarget: last.dTarget, targetId: last.targetId });
                    }
                    lastPos.delete(id);
                }
            }
        }, 50);
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
    // --- 驗證:錄製結束後持續觀察,凍結物品必須不存在/不攀升 ---
    const sample = () => page.evaluate(() => {
        const m = {};
        for (const t of (window.GameEngine.state.activeTransfers || [])) {
            if (t) m[t.id] = { p: t.progress || 0, line: t.lineId };
        }
        return { m, total: Object.keys(m).length };
    });

    const s1 = await sample();
    await page.waitForTimeout(8000);
    const s2 = await sample();

    let stuck = 0;
    const stuckSamples = [];
    for (const id of Object.keys(s2.m)) {
        const a = s1.m[id];
        const b = s2.m[id];
        if (a && Math.abs(b.p - a.p) < 1e-4 && b.p < 0.985) {
            stuck++;
            if (stuckSamples.length < 8) stuckSamples.push({ id, p: +b.p.toFixed(4), line: b.line });
        }
    }
    // 已離場數(=期間內送達):s1 存在但 s2 消失的 id
    let departed = 0;
    for (const id of Object.keys(s1.m)) {
        if (!(id in s2.m)) departed++;
    }
    console.log('[VERIFY] 在途物品:', s1.total, '→', s2.total,
        '| 8秒零移動且未達終點:', stuck, JSON.stringify(stuckSamples),
        '| 8秒內離場(送達):', departed);

    expect(stuck).toBeLessThanOrEqual(2); // worker 非同步容許極少 timing 殘留
    expect(departed).toBeGreaterThan(0); // 隊伍必須持續流動送達,不可整條凍結

    const jumps = await page.evaluate(() => window.__jumpLog || []);
    const vanishes = await page.evaluate(() => window.__vanishLog || []);
    const recoverLogs = await page.evaluate(() =>
        (window.GameEngine.state.log || [])
            .map(e => (e && (e.message || e.msg || e.text)) || '')
            .filter(m => typeof m === 'string' && m.includes('移除退回來源'))
    );
    console.log('[JUMP] 偵測到位置跳變:', jumps.length, JSON.stringify(jumps.slice(0, 12)));
    console.log('[VANISH] 中途消失(progress<0.9,離目標端口>50px):', vanishes.length, JSON.stringify(vanishes.slice(0, 12)));
    console.log('[RECOVER] rerouter 退回來源:', recoverLogs.length);
    recoverLogs.slice(0, 12).forEach(m => console.log('  ', m));
    // 每筆 jump 對照其前後 600ms 內物流實收 dt 序列
    if (jumps.length) {
        const dtLog = await page.evaluate(() => window.__dtLog || []);
        for (const j of jumps.slice(0, 6)) {
            const win = dtLog.filter(e => e.t >= j.tNow - 600 && e.t <= j.tNow + 100);
            console.log('[DTWIN]', j.id, 'd=' + j.d, 'eff=' + j.eff, 'dts=', JSON.stringify(win));
        }
    }
    expect(jumps.length).toBe(0); // 拉分支瞬間不得出現物品瞬移
    expect(vanishes.length).toBe(0); // 物品不得中途被移除(退回來源=使用者看到的消失/重置)
});
