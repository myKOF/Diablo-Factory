// 自動生成的 Playwright 邏輯化 E2E 測試腳本
const { test, expect } = require('@playwright/test');

const executeLogic = async (page, fn, ...args) => {
    const result = await page.evaluate(({fnStr, args}) => {
        const func = new Function('return ' + fnStr)();
        return func(...args);
    }, { fnStr: fn.toString(), args });
    await page.waitForTimeout(200);
    return result;
};

const observeActiveTransfers = async (page, durationMs, intervalMs = 500) => {
    const deadline = Date.now() + durationMs;
    let maxActiveTransferCount = 0;
    while (Date.now() < deadline) {
        const activeTransferCount = await page.evaluate(() => (
            Array.isArray(window.GameEngine?.state?.activeTransfers)
                ? window.GameEngine.state.activeTransfers.length
                : 0
        ));
        maxActiveTransferCount = Math.max(maxActiveTransferCount, activeTransferCount);
        await page.waitForTimeout(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
    }
    return maxActiveTransferCount;
};

test('Recorded Logical E2E Test', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 911 });

    // 帶上原本的隨機種子，確保地圖生成與錄製時一模一樣
    await page.goto('/?seed=1782796396128');
    await page.waitForFunction(
        () => window.conveyorSystem &&
              window.GameEngine &&
              window.GameEngine.state &&
              Array.isArray(window.GameEngine.state.mapEntities) &&
              window.GameEngine.state.mapEntities.length > 0,
        { timeout: 30000 }
    );
    await page.waitForTimeout(500);

    await executeLogic(page, () => {
        window.__findSegAtWorld = (worldX, worldY, tolerance = 12) => {
            const lines = window.GameEngine.state.logisticsLines || [];
            const segment = lines.find(line => line && Array.isArray(line.routePoints) &&
                line.routePoints.some(point =>
                    Math.abs(point.x - worldX) <= tolerance &&
                    Math.abs(point.y - worldY) <= tolerance
                ));
            if (!segment) {
                throw new Error(`[TEST] 找不到物流線段: (${worldX}, ${worldY})`);
            }
            return segment.id;
        };

        window.__getStorehouse = () => {
            const storehouse = window.GameEngine.state.mapEntities.find(entity => entity.id === 'core_storehouse');
            if (!storehouse) throw new Error('[TEST] 找不到倉庫 core_storehouse');
            return storehouse;
        };

        window.__getTownCenter = () => {
            const townCenter = window.GameEngine.state.mapEntities.find(entity => entity.type1 === 'village');
            if (!townCenter) throw new Error('[TEST] 找不到城鎮中心');
            return townCenter;
        };

        window.__sendFirstWorkersToStorehouse = (count) => {
            const storehouse = window.__getStorehouse();
            const units = Object.values(window.GameEngine.state.units || {})
                .flatMap(group => Array.isArray(group) ? group : [])
                .filter(unit => unit && unit.id);
            if (units.length < count) {
                throw new Error(`[TEST] 工人數不足: ${units.length}/${count}`);
            }
            units.slice(0, count).forEach(unit => {
                window.GameEngine.workerSystem.handleWorkerCommand(unit, storehouse);
            });
            return units.slice(0, count).map(unit => unit.id);
        };

        window.__setTownCenterRallyToStorehouse = () => {
            const townCenter = window.__getTownCenter();
            const storehouse = window.__getStorehouse();
            townCenter.rallyPoint = {
                x: storehouse.x,
                y: storehouse.y,
                targetId: storehouse.id,
                targetType: 'building',
                name: storehouse.name
            };
        };

        window.__queueTownCenterRandom = () => {
            window.GameEngine.addToProductionQueue(null, 'RANDOM', window.__getTownCenter());
        };
    });

    // --- 邏輯錄製開始 ---
    // [系統日誌] [選取] 建築：倉庫
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(3300);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1020, 390, 1251.6396921506619, 783.622392974753, 'core_storehouse', {"dir":"right","width":1,"defIndex":2,"slotIndex":0,"x":1020,"y":390}, null, '', 'x-first', [{"x":502,"y":491,"dirIn":null,"dirOut":{"x":1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":503,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":504,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":512,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":491,"dirIn":{"x":1,"y":0},"dirOut":{"x":0,"y":1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":492,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":493,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":496,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":497,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":498,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":499,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":500,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":501,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":502,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":503,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":504,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":505,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":506,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":507,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":508,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":509,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":510,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":511,"dirIn":{"x":0,"y":1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    await executeLogic(page, () => {
        window.__segId_Line1End = window.__findSegAtWorld(1250, 790);
    });
    // [系統日誌] [物流] 傳送帶建造完成，共 31 節。
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(1307);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1250, 790, 987.2708644701196, 640.1756311745335, null, {"dir":"down","width":1,"x":1250,"y":790,"sourceType":"logistics_line"}, window.__segId_Line1End, '', 'x-first', [{"x":514,"y":511,"dirIn":null,"dirOut":{"x":-1,"y":0},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":513,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":512,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":511,"dirIn":{"x":-1,"y":0},"dirOut":{"x":0,"y":-1},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":510,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":509,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":508,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":507,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":506,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":505,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":504,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":501,"y":503,"dirIn":{"x":0,"y":-1},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 19 節。
    // [系統日誌] [Input-59a2u] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:69ms, CD:8976ms)
    // [系統日誌] [物流] 已取消物流線建造。
    // [系統日誌] [選取] 框選操作選中了 3 個我方單位。
    // [系統日誌] [狀態轉進] villagers: IDLE -> IDLE (930, 680)
    // [系統日誌] [狀態轉進] female villagers: IDLE -> IDLE (970, 680)
    // [系統日誌] [狀態轉進] villagers: IDLE -> IDLE (1010, 680)
    // [系統日誌] [Input-59a2u] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:44ms, CD:10340ms)
    // 命令單位 unit_678 執行 MOVE
    await page.waitForTimeout(1940);
    await executeLogic(page, () => window.__sendFirstWorkersToStorehouse(3));
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // 命令單位 unit_679 執行 MOVE
    // [系統日誌] [物流] female villagers 正在前往 倉庫 報到。
    // 命令單位 unit_680 執行 MOVE
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // [系統日誌] [狀態轉進] villagers: IDLE -> MOVING_TO_FACTORY (930, 680)
    // [系統日誌] [重新尋路] 距離目標: 999
    // [系統日誌] [狀態轉進] female villagers: IDLE -> MOVING_TO_FACTORY (970, 680)
    // [系統日誌] [重新尋路] 距離目標: 999
    // [系統日誌] [狀態轉進] villagers: IDLE -> MOVING_TO_FACTORY (1010, 680)
    // [系統日誌] [重新尋路] 距離目標: 999
    // [系統日誌] [選取] 建築：城鎮中心
    // [系統日誌] [Input-59a2u] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:76ms, CD:11200ms)
    // [系統日誌] 城鎮中心 集結點已鎖定至：倉庫
    await executeLogic(page, () => window.__setTownCenterRallyToStorehouse());
    // 全局生產 RANDOM
    await page.waitForTimeout(1611);
    await executeLogic(page, () => window.__queueTownCenterRandom());
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (1/10)
    // 全局生產 RANDOM
    await executeLogic(page, () => window.__queueTownCenterRandom());
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (2/10)
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // 全局生產 RANDOM
    await executeLogic(page, () => window.__queueTownCenterRandom());
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (3/10)
    // [系統日誌] [物流] female villagers 已進入 倉庫 派駐。
    // 全局生產 RANDOM
    await executeLogic(page, () => window.__queueTownCenterRandom());
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (4/10)
    // 全局生產 RANDOM
    await executeLogic(page, () => window.__queueTownCenterRandom());
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (5/10)
    // 全局生產 RANDOM
    await executeLogic(page, () => window.__queueTownCenterRandom());
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (6/10)
    // 全局生產 RANDOM
    await executeLogic(page, () => window.__queueTownCenterRandom());
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (7/10)
    // 全局生產 RANDOM
    await executeLogic(page, () => window.__queueTownCenterRandom());
    // [系統日誌] 城鎮中心 加入生產隊列：RANDOM (8/10)
    // [系統日誌] [選取] 建築：倉庫
    // [系統日誌] [物流] female villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] female villagers 已進入 倉庫 派駐。
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(3882);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(970, 440, 1249.2686712746033, 468.27661909989024, 'core_storehouse', {"dir":"down","width":1,"defIndex":1,"slotIndex":0,"x":970,"y":440}, null, '', 'y-first', [{"x":500,"y":493,"dirIn":null,"dirOut":{"x":0,"y":1},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":1,"y":0},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":512,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":495,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":495,"dirIn":{"x":1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 15 節。
    // [系統日誌] [Input-59a2u] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:164.3, Time:352ms, CD:0ms)
    // [系統日誌] [Input-59a2u] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:88ms, CD:304ms)
    // [系統日誌] [物流] 已取消物流線建造。
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(3566);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(970, 340, 1320.3992975563635, 279.78046103183317, 'core_storehouse', {"dir":"up","width":1,"defIndex":3,"slotIndex":0,"x":970,"y":340}, null, '', 'y-first', [{"x":500,"y":489,"dirIn":null,"dirOut":{"x":0,"y":-1},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":488,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":500,"y":487,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":500,"y":486,"dirIn":{"x":0,"y":-1},"dirOut":{"x":0,"y":-1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":500,"y":485,"dirIn":{"x":0,"y":-1},"dirOut":{"x":1,"y":0},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":512,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":516,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":517,"y":485,"dirIn":{"x":1,"y":0},"dirOut":{"x":1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":518,"y":485,"dirIn":{"x":1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    await executeLogic(page, () => {
        window.__segId_Line4End = window.__findSegAtWorld(1330, 270);
    });
    // [系統日誌] [物流] 傳送帶建造完成，共 21 節。
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // 拖曳建造物流線 (GroupId: new)
    await page.waitForTimeout(1960);
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1330, 270, 1255.19622346475, 470.64763995609223, null, {"dir":"right","width":1,"x":1330,"y":270,"sourceType":"logistics_line"}, window.__segId_Line4End, '', 'y-first', [{"x":518,"y":485,"dirIn":null,"dirOut":{"x":0,"y":1},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":518,"y":486,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":518,"y":487,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":518,"y":488,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":518,"y":489,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":518,"y":490,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":518,"y":491,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":518,"y":492,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":518,"y":493,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":518,"y":494,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":518,"y":495,"dirIn":{"x":0,"y":1},"dirOut":{"x":-1,"y":0},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":517,"y":495,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":516,"y":495,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":515,"y":495,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":495,"dirIn":{"x":-1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 14 節。
    // [系統日誌] [Input-59a2u] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:119ms, CD:5704ms)
    // [系統日誌] [物流] 已取消物流線建造。
    // [系統日誌] [Input-59a2u] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:238.5, Time:400ms, CD:0ms)
    // [系統日誌] [選取] 建築：倉庫
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // [系統日誌] [物流] 路線搬運品項已更新：木頭。
    // [系統日誌] [DEBUG] Warehouse checking: wood, value: 2500
    // [系統日誌] [追蹤] 開始追蹤物品 wood
    // [系統日誌] [物流] 路線搬運品項已更新：金礦石。
    // [系統日誌] [物流] 路線搬運品項已更新：石頭。
    await executeLogic(page, () => {
        const storehouse = window.__getStorehouse();
        const outputTargets = Array.isArray(storehouse.outputTargets) ? storehouse.outputTargets : [];
        const filters = ['wood', 'gold_ore', 'stone'];
        if (outputTargets.length < filters.length) {
            throw new Error(`[TEST] 倉庫輸出目標不足: ${outputTargets.length}/${filters.length}`);
        }
        filters.forEach((filter, index) => {
            outputTargets[index].filter = filter;
            const line = window.GameEngine.state.logisticsLines.find(segment => segment.id === outputTargets[index].lineId);
            if (line) line.filter = filter;
        });
    });
    // [系統日誌] [物流] female villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] female villagers 已進入 倉庫 派駐。
    // [系統日誌] [物流] female villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] female villagers 已進入 倉庫 派駐。
    // [系統日誌] [追蹤] 物品 wood 已送達目的地。
    // [系統日誌] [追蹤] 開始追蹤物品 stone
    // [系統日誌] [物流] villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] villagers 已進入 倉庫 派駐。
    // 拖曳建造物流線 (GroupId: new)
    const maxActiveTransferCount = await observeActiveTransfers(page, 23460);
    await executeLogic(page, () => {
        window.__segId_Line1MergedEnd = window.__findSegAtWorld(1250, 790);
    });
    await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(1248.0831608365738, 791.9209659714599, 918.5112590644178, 872.5356750823271, null, {"dir":"left","width":1,"x":1248.0831608365738,"y":791.9209659714599,"sourceType":"logistics_line"}, window.__segId_Line1MergedEnd, '', 'y-first', [{"x":514,"y":511,"dirIn":null,"dirOut":{"x":0,"y":1},"isCurve":null,"isMerger":false,"isPortConnector":true,"isVirtualEnd":false},{"x":514,"y":512,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":513,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":514,"dirIn":{"x":0,"y":1},"dirOut":{"x":0,"y":1},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":514,"y":515,"dirIn":{"x":0,"y":1},"dirOut":{"x":-1,"y":0},"isCurve":true,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":513,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":512,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":511,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":510,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":509,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":508,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":507,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":506,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":505,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":504,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":503,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":502,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":501,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":500,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":499,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":498,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":{"x":-1,"y":0},"isCurve":false,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false},{"x":497,"y":515,"dirIn":{"x":-1,"y":0},"dirOut":null,"isCurve":null,"isMerger":false,"isPortConnector":false,"isVirtualEnd":false}]));
    // [系統日誌] [物流] 傳送帶建造完成，共 21 節。
    // [系統日誌] [Input-59a2u] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:32ms, CD:22232ms)
    // [系統日誌] [物流] 已取消物流線建造。
    // [系統日誌] [物流] female villagers 正在前往 倉庫 報到。
    // [系統日誌] [集結] 已自動派駐至 倉庫。
    // [系統日誌] [物流] female villagers 已進入 倉庫 派駐。
    // [系統日誌] 人口已達上限
    await page.waitForTimeout(6950);
    // --- 邏輯錄製結束 ---

    await page.waitForTimeout(5000);
    const replayState = await page.evaluate(() => {
        const storehouse = window.GameEngine?.state?.mapEntities?.find(entity => entity.id === 'core_storehouse');
        const logisticsLines = window.GameEngine?.state?.logisticsLines || [];
        const groupIds = new Set(logisticsLines.map(line => line?.groupId).filter(Boolean));
        return {
            lineCount: logisticsLines.length,
            groupCount: groupIds.size,
            garrisonCount: Array.isArray(storehouse?.assignedWorkers) ? storehouse.assignedWorkers.length : 0,
            outputTargetCount: Array.isArray(storehouse?.outputTargets) ? storehouse.outputTargets.length : 0,
            activeTransferCount: Array.isArray(window.GameEngine?.state?.activeTransfers)
                ? window.GameEngine.state.activeTransfers.length
                : 0
        };
    });
    expect(replayState.lineCount).toBeGreaterThanOrEqual(6);
    expect(replayState.garrisonCount).toBeGreaterThanOrEqual(3);
    expect(replayState.outputTargetCount).toBeGreaterThanOrEqual(3);
    expect(maxActiveTransferCount).toBeGreaterThan(0);
    await page.screenshot({ path: 'tmp/screenshot_' + Date.now() + '.png' });
});
