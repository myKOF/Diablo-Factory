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

test('Recorded Logical E2E Test', async ({ page }) => {
    await page.setViewportSize({ width: 1081, height: 911 });

    // 帶上原本的隨機種子，確保地圖生成與錄製時一模一樣
    await page.goto('/?seed=1783041885896');
    await page.waitForTimeout(1000);

    // --- 邏輯錄製開始 ---
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(3713);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1020, 390, 1183.0577749588238, 786.0883304037503, 'core_storehouse', {"dir":"right","width":1,"defIndex":2,"slotIndex":0,"x":1020,"y":390}, null, '', 'x-first', [{"x":502,"y":491,"dirIn":null,"dirOut":{"x":1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":503,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":504,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":0,"y":1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":492,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":493,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":496,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":497,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":498,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":499,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":500,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":501,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":502,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":503,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":504,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":505,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":506,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":507,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":508,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":509,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":510,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":511,"dirIn":{"x":0,"y":1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}], null));
    // [LOGISTICS] [物流] 傳送帶建造完成，共 28 節。
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(1143);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1190, 790, 997.237679471571, 657.8125225512599, null, {"dir":"down","width":1,"x":1190,"y":790,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1180_780_mr493vtr_50c_seg_119_78_56', '', 'x-first', [{"x":511,"y":511,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":510,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":510,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":509,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}], null));
    // [LOGISTICS] [物流] 傳送帶建造完成，共 17 節。
    // [LOGISTICS] [物流] 已取消物流線建造。
    // 命令單位 unit_683 執行 MOVE
    await page.waitForTimeout(2040);
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_683', 'undefined', 930, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 949.6643748638555, 363.27832785431633));
    // [LOGISTICS] [物流] villagers 正在前往 倉庫 報到。
    // 命令單位 unit_684 執行 MOVE
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_684', 'undefined', 970, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 989.6643748638555, 363.27832785431633));
    // [LOGISTICS] [物流] female villagers 正在前往 倉庫 報到。
    // 命令單位 unit_685 執行 MOVE
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_685', 'undefined', 1010, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 949.6643748638555, 403.27832785431633));
    // [LOGISTICS] [物流] villagers 正在前往 倉庫 報到。
    // 開啟物流線介面: storehouse -> core_village
    await page.waitForTimeout(1199);
    await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390); if(e && window.LogisticsUI) window.LogisticsUI.showLogisticsMenu(e, 'core_village', 0, 0, 'logistics_core_storehouse_1180_780_mr493vtr_50c_seg_104_39_2@104,39'); });
    // [LOGISTICS] [物流] villagers 已進入 倉庫 派駐。
    // [LOGISTICS] [物流] villagers 已進入 倉庫 派駐。
    // [LOGISTICS] [物流] female villagers 已進入 倉庫 派駐。
    // 設定物流線過濾器: wood
    await page.waitForTimeout(1098);
    await executeLogic(page, () => {
    const src = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390);
    if (src && window.LogisticsUI) {
        window.LogisticsUI.showLogisticsMenu(src, 'core_village', 0, 0, 'logistics_core_storehouse_1180_780_mr493vtr_50c_seg_104_39_2@104,39');
        window.LogisticsUI.setLogisticsFilter(null, 'wood');
        const menu = document.getElementById('logistics_menu');
        if (menu) menu.style.display = 'none'; // 模擬設定後隱藏或維持不干擾
    }
});
    // [LOGISTICS] [物流] 路線搬運品項已更新：木頭。
    // 開啟物流線介面: storehouse -> core_village
    await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390); if(e && window.LogisticsUI) window.LogisticsUI.showLogisticsMenu(e, 'core_village', 0, 0, 'logistics_core_storehouse_1180_780_mr493vtr_50c_seg_104_39_2@104,39'); });
    // [LOGISTICS] [DEBUG] Warehouse checking: wood, value: 2500
    // [LOGISTICS] [追蹤] 開始追蹤物品 wood
    // [LOGISTICS] [追蹤] 物品 wood 已送達目的地。
    // [LOGISTICS] [追蹤] 開始追蹤物品 wood
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(16245);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(992.3332306818629, 787.7221026335121, 959.081479608679, 648.2792755524181, null, {"dir":"up","width":1,"x":992.3332306818629,"y":787.7221026335121,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1180_780_mr493vtr_50c_seg_99_78_20', '', 'x-first', [{"x":501,"y":511,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":510,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":509,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":499,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}], 'core_village'));
    // [LOGISTICS] [物流] 傳送帶建造完成，共 8 節。
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(5632);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(955.8635682144998, 786.649465502119, 787.459538585794, 582.8484105374432, null, {"dir":"up","width":1,"x":955.8635682144998,"y":786.649465502119,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1180_780_mr493vtr_50c_seg_95_78_4', '', 'x-first', [{"x":499,"y":511,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":498,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":497,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":496,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":495,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":494,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":493,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":492,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":510,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":509,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":502,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":501,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}], null));
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494gh5_6y7 lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.0339
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494fxl_18m lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.0813
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494fe5_bp lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.1287
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494eun_6d lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.1763
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494ebc_6hf lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.2237
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494drw_1vc lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.2715
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494d8h_7ac lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.3186
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494cp2_ua lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.3660
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494c5l_6st lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px targetId=null progress=0.4080
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494bm5_446 lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px targetId=null progress=0.4595
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494b2l_3vc lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px targetId=null progress=0.5186
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494ahu_4fs lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px targetId=null progress=0.5665
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr4949yd_794 lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px targetId=null progress=0.6181
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr4949ey_39z lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px targetId=null progress=0.6700
    // [LOGISTICS] [物流] 傳送帶建造完成，共 18 節。
    // [LOGISTICS] [WORKER診斷] 主執行緒側落差(每tick掃描) id=transfer_mr4949ey_39z lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px progress=0.8046 routeEnd={"x":790,"y":590} targetPoint={"x":950,"y":640}
    // [LOGISTICS] [WORKER診斷] 主執行緒側落差(每tick掃描) id=transfer_mr4949yd_794 lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px progress=0.7433 routeEnd={"x":790,"y":590} targetPoint={"x":950,"y":640}
    // [LOGISTICS] [WORKER診斷] 主執行緒側落差(每tick掃描) id=transfer_mr494ahu_4fs lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px progress=0.6824 routeEnd={"x":790,"y":590} targetPoint={"x":950,"y":640}
    // [LOGISTICS] [WORKER診斷] 主執行緒側落差(每tick掃描) id=transfer_mr494b2l_3vc lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px progress=0.6259 routeEnd={"x":790,"y":590} targetPoint={"x":950,"y":640}
    // [LOGISTICS] [WORKER診斷] 主執行緒側落差(每tick掃描) id=transfer_mr494bm5_446 lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px progress=0.5563 routeEnd={"x":790,"y":590} targetPoint={"x":950,"y":640}
    // [LOGISTICS] [WORKER診斷] 主執行緒側落差(每tick掃描) id=transfer_mr494c5l_6st lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px progress=0.4955 routeEnd={"x":790,"y":590} targetPoint={"x":950,"y":640}
    // [LOGISTICS] [WORKER診斷] 主執行緒側落差(每tick掃描) id=transfer_mr494cp2_ua lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px progress=0.4448 routeEnd={"x":790,"y":590} targetPoint={"x":950,"y":630}
    // [LOGISTICS] [WORKER診斷] 主執行緒側落差(每tick掃描) id=transfer_mr494d8h_7ac lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px progress=0.3878 routeEnd={"x":790,"y":590} targetPoint={"x":950,"y":630}
    // [LOGISTICS] [WORKER診斷] 主執行緒側落差(每tick掃描) id=transfer_mr494drw_1vc lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px progress=0.3309 routeEnd={"x":790,"y":590} targetPoint={"x":950,"y":630}
    // [LOGISTICS] [WORKER診斷] 主執行緒側落差(每tick掃描) id=transfer_mr494ebc_6hf lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px progress=0.2735 routeEnd={"x":790,"y":590} targetPoint={"x":950,"y":630}
    // [LOGISTICS] [WORKER診斷] 主執行緒側落差(每tick掃描) id=transfer_mr494eun_6d lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px progress=0.2163 routeEnd={"x":790,"y":590} targetPoint={"x":950,"y":630}
    // [LOGISTICS] [WORKER診斷] 主執行緒側落差(每tick掃描) id=transfer_mr494fe5_bp lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px progress=0.1591 routeEnd={"x":790,"y":590} targetPoint={"x":950,"y":630}
    // [LOGISTICS] [WORKER診斷] 主執行緒側落差(每tick掃描) id=transfer_mr494fxl_18m lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px progress=0.1020 routeEnd={"x":790,"y":590} targetPoint={"x":950,"y":630}
    // [LOGISTICS] [WORKER診斷] 主執行緒側落差(每tick掃描) id=transfer_mr494gh5_6y7 lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px progress=0.0449 routeEnd={"x":790,"y":590} targetPoint={"x":950,"y":630}
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494gh5_6y7 lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.0449
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494fxl_18m lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.1020
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494fe5_bp lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.1591
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494eun_6d lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.2163
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494ebc_6hf lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.2735
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494drw_1vc lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.3309
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494d8h_7ac lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.3878
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494cp2_ua lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=165px targetId=null progress=0.4448
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494c5l_6st lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px targetId=null progress=0.4955
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494bm5_446 lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px targetId=null progress=0.5563
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494b2l_3vc lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px targetId=null progress=0.6259
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr494ahu_4fs lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px targetId=null progress=0.6824
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr4949yd_794 lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px targetId=null progress=0.7433
    // [LOGISTICS] [WORKER診斷] rerouter 重算後仍有落差 id=transfer_mr4949ey_39z lineId=logistics_core_storehouse_1180_780_mr493vtr_50c 落差=168px targetId=null progress=0.8046
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(1216);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(790, 590, 906.5222601704206, 588.2115961944083, null, {"dir":"up","width":1,"x":790,"y":590,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1180_780_mr493vtr_50c_seg_79_60_34', '', 'x-first', [{"x":491,"y":501,"dirIn":null,"dirOut":{"x":1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":492,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":493,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":494,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":495,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":496,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":497,"y":501,"dirIn":{"x":1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}], 'core_village'));
    // [LOGISTICS] [物流] 傳送帶建造完成，共 4 節。
    // [LOGISTICS] [追蹤] 物品 wood 已送達目的地。
    // [LOGISTICS] [追蹤] 開始追蹤物品 wood
    await page.waitForTimeout(14080);
    // --- 邏輯錄製結束 ---

    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'tmp/screenshot_' + Date.now() + '.png' });
});
