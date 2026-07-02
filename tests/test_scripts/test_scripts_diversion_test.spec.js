// 自動生成的 Playwright 邏輯化 E2E 測試腳本
const { test, expect } = require('@playwright/test');

const executeLogic = async (page, fn, ...args) => {
    page.on('console', msg => {
        const text = msg.text();
        console.log('[BROWSER]', text);
    });
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
    // [系統日誌] [選取] 建築：倉庫
    // [系統日誌] 進入建造模式：初級物流線 (ESC 取消)
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(2223);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1020, 390, 1186.4366180590484, 776.5093304061471, 'core_storehouse', {"dir":"right","width":1,"defIndex":2,"slotIndex":0,"x":1020,"y":390}, null, '', 'x-first', [{"x":502,"y":491,"dirIn":null,"dirOut":{"x":1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":503,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":504,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":0,"y":1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":492,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":493,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":496,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":497,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":498,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":499,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":500,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":501,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":502,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":503,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":504,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":505,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":506,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":507,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":508,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":509,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":510,"dirIn":{"x":0,"y":1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 27 節。
    // [系統日誌] 進入建造模式：初級物流線 (ESC 取消)
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(1032);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1190, 770, 993.1984166602663, 647.2886937431394, null, {"dir":"down","width":1,"x":1190,"y":770,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1180_760_mr30ppid_2kj_seg_119_76_54', '', 'x-first', [{"x":511,"y":510,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":510,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":509,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":501,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 15 節。
    // [系統日誌] 進入建造模式：初級物流線 (ESC 取消)
    // [系統日誌] [Input-aaew0] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:137ms, CD:5441ms)
    // [系統日誌] [選取] 框選操作選中了 3 個我方單位。
    // [系統日誌] [狀態轉進] villagers: IDLE -> IDLE (930, 680)
    // [系統日誌] [狀態轉進] female villagers: IDLE -> IDLE (970, 680)
    // [系統日誌] [狀態轉進] villagers: IDLE -> IDLE (1010, 680)
    // [系統日誌] [Input-aaew0] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:94ms, CD:6992ms)
    // 命令單位 unit_676 執行 MOVE
    await page.waitForTimeout(2040);
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_676', 'undefined', 930, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 955.4157600898263, 365.2908891328211));
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // 命令單位 unit_677 執行 MOVE
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_677', 'undefined', 970, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 995.4157600898263, 365.2908891328211));
    // [系統日誌] [物流] female villagers 正在前往 倉庫 報到。
    // 命令單位 unit_678 執行 MOVE
    await executeLogic(page, () => window.GameEngine.issueCommand([window.GameEngine.resolveDynamicId('unit_678', 'undefined', 1010, 680)], 'MOVE', window.GameEngine.resolveDynamicId('core_storehouse', 'storehouse', 970, 390), 955.4157600898263, 405.2908891328211));
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // [系統日誌] [狀態轉進] villagers: IDLE -> MOVING_TO_FACTORY (930, 680)
    // [系統日誌] [重新尋路] 距離目標: 999
    // [系統日誌] [狀態轉進] female villagers: IDLE -> MOVING_TO_FACTORY (970, 680)
    // [系統日誌] [重新尋路] 距離目標: 999
    // [系統日誌] [狀態轉進] villagers: IDLE -> MOVING_TO_FACTORY (1010, 680)
    // [系統日誌] [重新尋路] 距離目標: 999
    // [系統日誌] [重新尋路] 距離目標: 40
    // [系統日誌] [重新尋路] 距離目標: 56
    // [系統日誌] [重新尋路] 距離目標: 40
    // [系統日誌] [重新尋路] 距離目標: 24
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // [系統日誌] [物流] female villagers 已進入 倉庫 派駐。
    // 開啟物流線介面: storehouse -> core_village
    await page.waitForTimeout(2423);
    await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390); if(e && window.LogisticsUI) window.LogisticsUI.showLogisticsMenu(e, 'core_village', 0, 0, 'logistics_core_storehouse_1180_760_mr30ppid_2kj_seg_104_39_2@104,39'); });
    // 設定物流線過濾器: wood
    await page.waitForTimeout(856);
    await executeLogic(page, () => {
    const src = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390);
    if (src && window.LogisticsUI) {
        window.LogisticsUI.showLogisticsMenu(src, 'core_village', 0, 0, 'logistics_core_storehouse_1180_760_mr30ppid_2kj_seg_104_39_2@104,39');
        window.LogisticsUI.setLogisticsFilter(null, 'wood');
        const menu = document.getElementById('logistics_menu');
        if (menu) menu.style.display = 'none'; // 模擬設定後隱藏或維持不干擾
    }
});
    // [系統日誌] [物流] 路線搬運品項已更新：木頭。
    // 開啟物流線介面: storehouse -> core_village
    await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === 'core_storehouse') || window.GameEngine.state.mapEntities.find(x => x.x === 970 && x.y === 390); if(e && window.LogisticsUI) window.LogisticsUI.showLogisticsMenu(e, 'core_village', 0, 0, 'logistics_core_storehouse_1180_760_mr30ppid_2kj_seg_104_39_2@104,39'); });
    // [系統日誌] [DEBUG] Warehouse checking: wood, value: 2500
    // [系統日誌] [追蹤] 開始追蹤物品 wood
    // [系統日誌] [Input-aaew0] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:80.9, Time:334ms, CD:0ms)
    // [系統日誌] [追蹤] 物品 wood 已送達目的地。
    // [系統日誌] [追蹤] 開始追蹤物品 wood
    // [系統日誌] 進入建造模式：初級物流線 (ESC 取消)
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(13312);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(990.4984426116852, 766.5835508371623, 940.8869243862264, 632.1523412875533, null, {"dir":"up","width":1,"x":990.4984426116852,"y":766.5835508371623,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1180_760_mr30ppid_2kj_seg_99_76_20', '', 'x-first', [{"x":501,"y":510,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":509,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":499,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 7 節。
    // [系統日誌] 進入建造模式：初級物流線 (ESC 取消)
    // [系統日誌] [Input-aaew0] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:103ms, CD:8704ms)
    // [系統日誌] 進入建造模式：初級物流線 (ESC 取消)
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(5240);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(950.4891537201862, 768.9841081505482, 950.4891537201862, 768.9841081505482, null, {"dir":"up","width":1,"x":950.4891537201862,"y":768.9841081505482,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1180_760_mr30ppid_2kj_seg_95_76_4', '', 'y-first', []));
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(1600);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(950.4891537201862, 768.9841081505482, 811.2568283777699, 595.3437958156366, null, {"dir":"up","width":1,"x":950.4891537201862,"y":768.9841081505482,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1180_760_mr30ppid_2kj_seg_95_76_4', '', 'x-first', [{"x":499,"y":510,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":498,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":497,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":496,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":495,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":494,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":493,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":492,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":492,"y":509,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":492,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":492,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":492,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":492,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":492,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":492,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":492,"y":502,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":492,"y":501,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 16 節。
    // [系統日誌] 進入建造模式：初級物流線 (ESC 取消)
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(864);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(810, 590, 912.0802363843472, 585.7415665620931, null, {"dir":"up","width":1,"x":810,"y":590,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1180_760_mr30ppid_2kj_seg_81_60_30', '', 'x-first', [{"x":492,"y":501,"dirIn":null,"dirOut":{"x":1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":493,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":494,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":495,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":496,"y":501,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":497,"y":501,"dirIn":{"x":1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 3 節。
    // [系統日誌] 進入建造模式：初級物流線 (ESC 取消)
    // [系統日誌] [Input-aaew0] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:129ms, CD:16217ms)
    // [系統日誌] [追蹤] 物品 wood 已送達目的地。
    // [系統日誌] [追蹤] 開始追蹤物品 wood
    await page.waitForTimeout(8240);
    // --- 邏輯錄製結束 ---

    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'tmp/screenshot_' + Date.now() + '.png' });
});
