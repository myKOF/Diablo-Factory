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
    await page.setViewportSize({ width: 1920, height: 911 });

    // 帶上原本的隨機種子，確保地圖生成與錄製時一模一樣
    await page.goto('/?seed=1782824588473');
    await page.waitForTimeout(1000);

    // --- 邏輯錄製開始 ---
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(3088);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1020, 390, 1171.8611717629578, 749.848504190585, 'core_storehouse', {"dir":"right","width":1,"defIndex":2,"slotIndex":0,"x":1020,"y":390}, null, '', 'x-first', [{"x":502,"y":491,"dirIn":null,"dirOut":{"x":1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":503,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":504,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":0,"y":1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":492,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":493,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":496,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":497,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":498,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":499,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":500,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":501,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":502,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":503,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":504,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":505,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":506,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":507,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":508,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":509,"dirIn":{"x":0,"y":1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}], null));
    // [LOGISTICS] [物流] 傳送帶建造完成，共 25 節。
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(1120);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1170, 750, 986.9215434303811, 657.378690798708, null, {"dir":"down","width":1,"x":1170,"y":750,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1160_740_mr35pzsp_w1_seg_117_74_50', '', 'x-first', [{"x":510,"y":509,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":509,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}], null));
    // [LOGISTICS] [物流] 傳送帶建造完成，共 14 節。
    // [LOGISTICS] [物流] 已取消物流線建造。
    // 命令單位 unit_676 執行 MOVE
    await page.waitForTimeout(2308);
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_676', 'undefined', 930, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 950.3243972979704, 341.001083773461));
    // [LOGISTICS] [物流] villagers 正在前往 倉庫 報到。
    // 命令單位 unit_677 執行 MOVE
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_677', 'undefined', 970, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 990.3243972979704, 341.001083773461));
    // [LOGISTICS] [物流] female villagers 正在前往 倉庫 報到。
    // 命令單位 unit_678 執行 MOVE
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_678', 'undefined', 1010, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 950.3243972979704, 381.001083773461));
    // [LOGISTICS] [物流] villagers 正在前往 倉庫 報到。
    // 開啟物流線介面: storehouse -> core_village
    await page.waitForTimeout(1474);
    await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390); if(e && window.LogisticsUI) window.LogisticsUI.showLogisticsMenu(e, 'core_village', 0, 0, 'logistics_core_storehouse_1160_740_mr35pzsp_w1_seg_102_39_0@102,39'); });
    // [LOGISTICS] [物流] villagers 已進入 倉庫 派駐。
    // [LOGISTICS] [物流] villagers 已進入 倉庫 派駐。
    // [LOGISTICS] [物流] female villagers 已進入 倉庫 派駐。
    // 設定物流線過濾器: wood
    await page.waitForTimeout(1026);
    await executeLogic(page, () => {
    const src = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390);
    if (src && window.LogisticsUI) {
        window.LogisticsUI.showLogisticsMenu(src, 'core_village', 0, 0, 'logistics_core_storehouse_1160_740_mr35pzsp_w1_seg_102_39_0@102,39');
        window.LogisticsUI.setLogisticsFilter(null, 'wood');
        const menu = document.getElementById('logistics_menu');
        if (menu) menu.style.display = 'none'; // 模擬設定後隱藏或維持不干擾
    }
});
    // [LOGISTICS] [物流] 路線搬運品項已更新：木頭。
    // 開啟物流線介面: storehouse -> core_village
    await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390); if(e && window.LogisticsUI) window.LogisticsUI.showLogisticsMenu(e, 'core_village', 0, 0, 'logistics_core_storehouse_1160_740_mr35pzsp_w1_seg_102_39_0@102,39'); });
    // [LOGISTICS] [DEBUG] Warehouse checking: wood, value: 2500
    // [LOGISTICS] [追蹤] 開始追蹤物品 wood
    // [LOGISTICS] [追蹤] 物品 wood 已送達目的地。
    // [LOGISTICS] [追蹤] 開始追蹤物品 wood
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(13231);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(991.9547631848217, 742.839433764795, 948.2780628363723, 627.4081552391725, null, {"dir":"up","width":1,"x":991.9547631848217,"y":742.839433764795,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1160_740_mr35pzsp_w1_seg_99_74_18', '', 'x-first', [{"x":501,"y":509,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":499,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}], 'core_village'));
    // [LOGISTICS] [物流] 傳送帶建造完成，共 6 節。
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(6329);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(946.1982199626366, 744.9192766211125, 946.1982199626366, 744.9192766211125, null, {"dir":"up","width":1,"x":946.1982199626366,"y":744.9192766211125,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1160_740_mr35pzsp_w1_seg_95_74_4', '', 'y-first', [], null));
    // [LOGISTICS] [追蹤] 物品 wood 已送達目的地。
    // [LOGISTICS] [追蹤] 開始追蹤物品 wood
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(3344);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(946.1982199626366, 744.9192766211125, 785.0103972481213, 586.8512195409808, null, {"dir":"up","width":1,"x":946.1982199626366,"y":744.9192766211125,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1160_740_mr35pzsp_w1_seg_95_74_4', '', 'x-first', [{"x":499,"y":509,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":498,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":497,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":496,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":495,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":494,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":493,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":492,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":502,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":491,"y":501,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}], null));
    // [LOGISTICS] [物流] 傳送帶建造完成，共 16 節。
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(1063);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(790, 590, 903.5614410510551, 583.7314552565045, null, {"dir":"up","width":1,"x":790,"y":590,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1160_740_mr35pzsp_w1_seg_79_60_30', '', 'x-first', [{"x":491,"y":501,"dirIn":null,"dirOut":{"x":1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":492,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":493,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":494,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":495,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":496,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":497,"y":501,"dirIn":{"x":1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}], 'core_village'));
    // [LOGISTICS] [物流] 傳送帶建造完成，共 4 節。
    await page.waitForTimeout(17856);
    // --- 邏輯錄製結束 ---

    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'tmp/screenshot_' + Date.now() + '.png' });
});
