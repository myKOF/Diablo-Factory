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
    await page.setViewportSize({ width: 1027, height: 610 });

    // 帶上原本的隨機種子，確保地圖生成與錄製時一模一樣
    await page.goto('/?seed=1782790406757');
    await page.waitForTimeout(1000);

    // --- 邏輯錄製開始 ---
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:645.6, Time:401ms, CD:0ms)
    // [系統日誌] [選取] 建築：倉庫
    // 拖曳建造物流線 (GroupId: new)
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1020, 390, 1238.337914996535, 768.2852566890236, 'core_storehouse', {"dir":"right","width":1,"defIndex":2,"slotIndex":0,"x":1020,"y":390}, null, '', 'x-first', [{"x":502,"y":491,"dirIn":null,"dirOut":{"x":1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":503,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":504,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":512,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":0,"y":1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":492,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":493,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":496,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":497,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":498,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":499,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":500,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":501,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":502,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":503,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":504,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":505,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":506,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":507,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":508,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":509,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":510,"dirIn":{"x":0,"y":1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 29 節。
    // 拖曳建造物流線 (GroupId: new)
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1230, 770, 991.4975142576642, 643.2046948796408, null, {"dir":"down","width":1,"x":1230,"y":770,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1220_760_mr045z2w_1ws_seg_123_76_58', '', 'x-first', [{"x":513,"y":510,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":512,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":510,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":509,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":501,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 17 節。
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:85ms, CD:4151ms)
    // [系統日誌] [物流] 已取消物流線建造。
    // [系統日誌] [選取] 框選操作選中了 3 個我方單位。
    // [系統日誌] [狀態轉進] villagers: IDLE -> IDLE (930, 680)
    // [系統日誌] [狀態轉進] female villagers: IDLE -> IDLE (970, 680)
    // [系統日誌] [狀態轉進] villagers: IDLE -> IDLE (1010, 680)
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:96ms, CD:5303ms)
    // 命令單位 unit_676 執行 MOVE
    // 抓前三個村民
    const units = window.GameEngine.state.units?.villagers || [];
    const workers = units.slice(0, 3);
    if (workers.length >= 3) {
        console.log("[DEBUG] 指派村民 ID:", workers[0].id, workers[1].id, workers[2].id);
        const storehouse = window.GameEngine.state.mapEntities.find(e => e.id === 'core_storehouse');
        await executeLogic(page, (w, s) => window.GameEngine.workerSystem.handleWorkerCommand(w, s), workers[0], storehouse);
        await executeLogic(page, (w, s) => window.GameEngine.workerSystem.handleWorkerCommand(w, s), workers[1], storehouse);
        await executeLogic(page, (w, s) => window.GameEngine.workerSystem.handleWorkerCommand(w, s), workers[2], storehouse);
    } else {
        console.error("找不到足夠的村民！目前有:", units.length);
    }
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // [系統日誌] [物流] female villagers 正在前往 倉庫 報到。
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // [系統日誌] [狀態轉進] villagers: IDLE -> MOVING_TO_FACTORY (930, 680)
    // [系統日誌] [重新尋路] 距離目標: 999
    // [系統日誌] [狀態轉進] female villagers: IDLE -> MOVING_TO_FACTORY (970, 680)
    // [系統日誌] [重新尋路] 距離目標: 999
    // [系統日誌] [狀態轉進] villagers: IDLE -> MOVING_TO_FACTORY (1010, 680)
    // [系統日誌] [重新尋路] 距離目標: 999
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:112ms, CD:6063ms)
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // [系統日誌] [選取] 建築：城鎮中心
    // [系統日誌] [物流] female villagers 已進入 倉庫 派駐。
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:113ms, CD:7816ms)
    // [系統日誌] 城鎮中心 集結點已鎖定至：倉庫
    // 全局生產 RANDOM
    await executeLogic(page, () => window.GameEngine.addToProductionQueue(null, 'RANDOM'));
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (1/10)
    // 全局生產 RANDOM
    await executeLogic(page, () => window.GameEngine.addToProductionQueue(null, 'RANDOM'));
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (2/10)
    // 全局生產 RANDOM
    await executeLogic(page, () => window.GameEngine.addToProductionQueue(null, 'RANDOM'));
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (3/10)
    // 全局生產 RANDOM
    await executeLogic(page, () => window.GameEngine.addToProductionQueue(null, 'RANDOM'));
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (4/10)
    // 全局生產 RANDOM
    await executeLogic(page, () => window.GameEngine.addToProductionQueue(null, 'RANDOM'));
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (5/10)
    // 全局生產 RANDOM
    await executeLogic(page, () => window.GameEngine.addToProductionQueue(null, 'RANDOM'));
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (6/10)
    // 全局生產 RANDOM
    await executeLogic(page, () => window.GameEngine.addToProductionQueue(null, 'RANDOM'));
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (7/10)
    // [系統日誌] [選取] 建築：城鎮中心
    // [系統日誌] [選取] 建築：倉庫
    // [系統日誌] [選取] 建築：倉庫
    // 拖曳建造物流線 (GroupId: new)
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(970, 440, 1223.9481158503227, 463.88565936530404, 'core_storehouse', {"dir":"down","width":1,"defIndex":1,"slotIndex":0,"x":970,"y":440}, null, '', 'y-first', [{"x":500,"y":493,"dirIn":null,"dirOut":{"x":0,"y":1},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":1,"y":0},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":512,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":495,"dirIn":{"x":1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 14 節。
    // [系統日誌] [物流] female villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] female villagers 已進入 倉庫 派駐。
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:246.5, Time:327ms, CD:0ms)
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:112ms, CD:344ms)
    // [系統日誌] [物流] 已取消物流線建造。
    // 拖曳建造物流線 (GroupId: new)
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(970, 340, 1309.1800031009643, 270.17682470475523, 'core_storehouse', {"dir":"up","width":1,"defIndex":3,"slotIndex":0,"x":970,"y":340}, null, '', 'y-first', [{"x":500,"y":489,"dirIn":null,"dirOut":{"x":0,"y":-1},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":488,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":487,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":500,"y":486,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":500,"y":485,"dirIn":{"x":0,"y":-1},"dirOut":{"x":1,"y":0},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":512,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":516,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":517,"y":485,"dirIn":{"x":1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 20 節。
    // 拖曳建造物流線 (GroupId: new)
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1310, 270, 1230.589561610113, 470.52710512509435, null, {"dir":"right","width":1,"x":1310,"y":270,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1300_260_mr0469yy_1jf_seg_130_27_40', '', 'y-first', [{"x":517,"y":485,"dirIn":null,"dirOut":{"x":0,"y":1},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":517,"y":486,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":517,"y":487,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":517,"y":488,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":517,"y":489,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":517,"y":490,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":517,"y":491,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":517,"y":492,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":517,"y":493,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":517,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":517,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":-1,"y":0},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":516,"y":495,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":495,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":495,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":495,"dirIn":{"x":-1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 14 節。
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:125ms, CD:3880ms)
    // [系統日誌] [物流] 已取消物流線建造。
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:388.5, Time:360ms, CD:0ms)
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:420.8, Time:240ms, CD:0ms)
    // [系統日誌] [選取] 建築：倉庫
    // [系統日誌] [物流] 路線搬運品項已更新：木頭。
    // [系統日誌] [DEBUG] Warehouse checking: wood, value: 2500
    // [系統日誌] [追蹤] 開始追蹤物品 wood
    // [系統日誌] [選取] 建築：倉庫
    // [系統日誌] [物流] female villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] female villagers 已進入 倉庫 派駐。
    // [系統日誌] [物流] 路線搬運品項已更新：石頭。
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:143.8, Time:239ms, CD:0ms)
    // [系統日誌] [物流] 路線搬運品項已更新：金礦石。
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:261.7, Time:279ms, CD:0ms)
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:347.5, Time:797ms, CD:0ms)
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:270.1, Time:535ms, CD:0ms)
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面沒動 | 判定為點擊 | 不可移動 (Dist:1.9, Time:40ms, CD:64ms)
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:43.0, Time:301ms, CD:0ms)
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:12.5, Time:48ms, CD:0ms)
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面沒動 | 判定為點擊 | 不可移動 (Dist:1.9, Time:76ms, CD:104ms)
    // [系統日誌] [物流] female villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] female villagers 已進入 倉庫 派駐。
    // [系統日誌] [追蹤] 物品 wood 已送達目的地。
    // [系統日誌] [追蹤] 開始追蹤物品 stone
    // 拖曳建造物流線 (GroupId: new)
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1230.5895616101132, 770.4990719422874, 943.9004863125008, 832.4858990336629, null, {"dir":"left","width":1,"x":1230.5895616101132,"y":770.4990719422874,"sourceType":"logistics_line"}, 'logistics_core_storehouse_1220_760_mr045z2w_1ws_seg_122_77_0', '', 'y-first', [{"x":513,"y":510,"dirIn":null,"dirOut":{"x":0,"y":1},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":513,"y":511,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":512,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":513,"dirIn":{"x":0,"y":1},"dirOut":{"x":-1,"y":0},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":512,"y":513,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":513,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":513,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":513,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":513,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":513,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":513,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":513,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":513,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":513,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":513,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":513,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":500,"y":513,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":513,"dirIn":{"x":-1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 17 節。
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:112ms, CD:5080ms)
    // [系統日誌] [物流] 已取消物流線建造。
    // [系統日誌] [物流] female villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] female villagers 已進入 倉庫 派駐。
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:686.7, Time:480ms, CD:0ms)
    // [系統日誌] [Input-shwje] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:137.9, Time:312ms, CD:0ms)
    // [系統日誌] [物流] female villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] female villagers 已進入 倉庫 派駐。
    // --- 邏輯錄製結束 ---

    // 讓遊戲跑 30 秒，給工人時間進入倉庫並開始生產，物流線也會開始運轉！
    console.log("[DEBUG] 等待 30 秒觀察物流運行...");
    await page.waitForTimeout(30000);
    
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'src/debug/TestScreenshots/screenshot_' + Date.now() + '.png' });
});
