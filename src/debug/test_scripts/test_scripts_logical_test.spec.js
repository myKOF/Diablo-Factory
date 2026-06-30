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
    await page.goto('/?seed=1782810157780');
    await page.waitForTimeout(1000);

    // --- 邏輯錄製開始 ---
    // [系統日誌] [選取] 建築：倉庫
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(2792);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1020, 390, 1266.410147674575, 758.2442713762052, 'core_storehouse', {"dir":"right","width":1,"defIndex":2,"slotIndex":0,"x":1020,"y":390}, null, '', 'x-first', [{"x":502,"y":491,"dirIn":null,"dirOut":{"x":1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":503,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":504,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":512,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":0,"y":1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":492,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":493,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":496,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":497,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":498,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":499,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":500,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":501,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":502,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":503,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":504,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":505,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":506,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":507,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":508,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":509,"dirIn":{"x":0,"y":1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 30 節。
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(1008);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1270, 750, 990.3460543232325, 639.0165914780403, null, {"dir":"down","width":1,"x":1270,"y":750,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1260_740_mr0f58wq_5z3_seg_127_74_60', '', 'x-first', [{"x":515,"y":509,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":514,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":512,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":509,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":501,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 18 節。
    // [系統日誌] [Input-blvpz] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:123ms, CD:6899ms)
    // [系統日誌] [物流] 已取消物流線建造。
    // [系統日誌] [選取] 框選操作選中了 3 個我方單位。
    // [系統日誌] [狀態轉進] villagers: IDLE -> IDLE (930, 680)
    // [系統日誌] [狀態轉進] female villagers: IDLE -> IDLE (970, 680)
    // [系統日誌] [狀態轉進] villagers: IDLE -> IDLE (1010, 680)
    // [系統日誌] [Input-blvpz] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:112ms, CD:8016ms)
    // 命令單位 unit_685 執行 MOVE
    await page.waitForTimeout(1584);
    await executeLogic(page, () => window.GameEngine.issueCommand(['unit_685'], 'MOVE', 'core_storehouse', 959.1434532037206, 373.35957051438794));
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // 命令單位 unit_686 執行 MOVE
    await executeLogic(page, () => window.GameEngine.issueCommand(['unit_686'], 'MOVE', 'core_storehouse', 999.1434532037206, 373.35957051438794));
    // [系統日誌] [物流] female villagers 正在前往 倉庫 報到。
    // 命令單位 unit_687 執行 MOVE
    await executeLogic(page, () => window.GameEngine.issueCommand(['unit_687'], 'MOVE', 'core_storehouse', 959.1434532037206, 413.35957051438794));
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // [系統日誌] [狀態轉進] villagers: IDLE -> MOVING_TO_FACTORY (930, 680)
    // [系統日誌] [重新尋路] 距離目標: 999
    // [系統日誌] [狀態轉進] female villagers: IDLE -> MOVING_TO_FACTORY (970, 680)
    // [系統日誌] [重新尋路] 距離目標: 999
    // [系統日誌] [狀態轉進] villagers: IDLE -> MOVING_TO_FACTORY (1010, 680)
    // [系統日誌] [重新尋路] 距離目標: 999
    // [系統日誌] [選取] 建築：城鎮中心
    // [系統日誌] [Input-blvpz] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:128ms, CD:8752ms)
    // [系統日誌] 城鎮中心 集結點已鎖定至：倉庫
    // 全局生產 RANDOM
    await page.waitForTimeout(1715);
    await executeLogic(page, () => window.GameEngine.addToProductionQueue(null, 'RANDOM'));
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (1/10)
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // 全局生產 RANDOM
    await executeLogic(page, () => window.GameEngine.addToProductionQueue(null, 'RANDOM'));
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (2/10)
    // 全局生產 RANDOM
    await executeLogic(page, () => window.GameEngine.addToProductionQueue(null, 'RANDOM'));
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (3/10)
    // [系統日誌] [物流] female villagers 已進入 倉庫 派駐。
    // 全局生產 RANDOM
    await executeLogic(page, () => window.GameEngine.addToProductionQueue(null, 'RANDOM'));
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (4/10)
    // 全局生產 RANDOM
    await executeLogic(page, () => window.GameEngine.addToProductionQueue(null, 'RANDOM'));
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (5/10)
    // [系統日誌] [選取] 建築：倉庫
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(2824);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(970, 440, 1265.609961896745, 463.77590760087134, 'core_storehouse', {"dir":"down","width":1,"defIndex":1,"slotIndex":0,"x":970,"y":440}, null, '', 'y-first', [{"x":500,"y":493,"dirIn":null,"dirOut":{"x":0,"y":1},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":1,"y":0},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":512,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":495,"dirIn":{"x":1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 16 節。
    // [系統日誌] [Input-blvpz] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:131ms, CD:13731ms)
    // [系統日誌] [物流] 已取消物流線建造。
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(3048);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(970, 340, 1370.4342987924724, 304.53893914627497, 'core_storehouse', {"dir":"up","width":1,"defIndex":3,"slotIndex":0,"x":970,"y":340}, null, '', 'y-first', [{"x":500,"y":489,"dirIn":null,"dirOut":{"x":0,"y":-1},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":488,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":487,"dirIn":{"x":0,"y":-1},"dirOut":{"x":1,"y":0},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":512,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":516,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":517,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":518,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":519,"y":487,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":520,"y":487,"dirIn":{"x":1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 21 節。
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(1200);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1370, 310, 1268.8107050080648, 470.17739376990033, null, {"dir":"right","width":1,"x":1370,"y":310,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1360_300_mr0f5h9t_30j_seg_136_31_42', '', 'y-first', [{"x":520,"y":487,"dirIn":null,"dirOut":{"x":0,"y":1},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":520,"y":488,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":520,"y":489,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":520,"y":490,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":520,"y":491,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":520,"y":492,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":520,"y":493,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":520,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":520,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":-1,"y":0},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":519,"y":495,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":518,"y":495,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":517,"y":495,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":516,"y":495,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":495,"dirIn":{"x":-1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 13 節。
    // [系統日誌] [Input-blvpz] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:104ms, CD:18008ms)
    // [系統日誌] [物流] 已取消物流線建造。
    // [系統日誌] [Input-blvpz] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:116.7, Time:320ms, CD:0ms)
    // [系統日誌] [Input-blvpz] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:100.8, Time:239ms, CD:0ms)
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // [系統日誌] [物流] 路線搬運品項已更新：木頭。
    // [系統日誌] [DEBUG] Warehouse checking: wood, value: 2500
    // [系統日誌] [追蹤] 開始追蹤物品 wood
    // [系統日誌] [物流] 路線搬運品項已更新：石頭。
    // [系統日誌] [物流] 路線搬運品項已更新：金礦石。
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // [系統日誌] [Input-blvpz] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:180.7, Time:216ms, CD:0ms)
    // [系統日誌] [Input-blvpz] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:54.5, Time:442ms, CD:0ms)
    // [系統日誌] [物流] female villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] female villagers 已進入 倉庫 派駐。
    // [系統日誌] [追蹤] 物品 wood 已送達目的地。
    // [系統日誌] [追蹤] 開始追蹤物品 gold_ore
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(19688);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1270.411076563725, 747.0416705804047, 947.9362080982437, 807.0556034150516, null, {"dir":"left","width":1,"x":1270.411076563725,"y":747.0416705804047,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1260_740_mr0f58wq_5z3_seg_126_75_0', '', 'y-first', [{"x":515,"y":509,"dirIn":null,"dirOut":{"x":0,"y":1},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":515,"y":510,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":511,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":512,"dirIn":{"x":0,"y":1},"dirOut":{"x":-1,"y":0},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":512,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":500,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":512,"dirIn":{"x":-1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 19 節。
    // [系統日誌] [Input-blvpz] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:73ms, CD:9975ms)
    // [系統日誌] [物流] 已取消物流線建造。
    await page.waitForTimeout(8240);
    // --- 邏輯錄製結束 ---

    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'tmp/screenshot_' + Date.now() + '.png' });
});
