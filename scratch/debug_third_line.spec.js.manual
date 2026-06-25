const { test, expect } = require('@playwright/test');

test('偵錯第三條線路接通問題', async ({ page }) => {
    test.setTimeout(60000);

    // 監聽 console.log
    page.on('console', msg => {
        console.log(`[瀏覽器日誌] ${msg.text()}`);
    });

    await page.goto('/');
    await page.waitForSelector('canvas');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined' && window.GAME_STATE.mapEntities !== undefined);

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');
        const { BuildingSystem } = await import('/src/systems/BuildingSystem.js');

        // 1. 重設遊戲狀態
        GameEngine.state.logisticsLines = [];
        GameEngine.state.logisticsMergeNodes = [];
        GameEngine.state.mapEntities = [];

        // 建立一個 Mock 倉庫實體 (3x3 grid)
        // 倉庫大小通常是 width=3, height=3
        const warehouse = {
            id: 'ent_warehouse_1',
            type: 'warehouse',
            x: 500,
            y: 300,
            width: 3,
            height: 3,
            outputTargets: []
        };
        GameEngine.state.mapEntities.push(warehouse);

        // 模擬倉庫的 exports/ports
        window.UIManager = window.UIManager || {};
        window.UIManager.getEntityId = (ent) => ent?.id || ent?.groupId || null;
        window.UIManager.isPointInsideEntity = (ent, x, y) => {
            if (!ent) return false;
            return x >= ent.x && x <= ent.x + ent.width * 20 && y >= ent.y && y <= ent.y + ent.height * 20;
        };

        const TS = 20;
        const scale = conveyorSystem.getRouteScale(); // 2

        // 2. 模擬第一條藍色線路 (從倉庫右側出發，向右，再向下)
        // 倉庫右側出口大概是 x=560, y=330
        const pts1 = [
            { x: 560, y: 330 },
            { x: 620, y: 330 },
            { x: 620, y: 450 }
        ];

        console.log("建造第一條藍色線路...");
        const line1 = conveyorSystem.upsertLogisticsLine({
            sourceEnt: warehouse,
            targetPoint: pts1[pts1.length - 1],
            points: pts1,
            routeWidth: 1
        });
        console.log(`第一條線路建好, groupId: ${line1?.groupId}`);

        // 3. 模擬第二條藍色線路 (在下方，橫向，與第一條向下的縱向段相交)
        // 從倉庫底部出口 x=530, y=360 出來，往下，再向右
        const pts2 = [
            { x: 530, y: 360 },
            { x: 530, y: 400 },
            { x: 680, y: 400 }
        ];
        console.log("建造第二條藍色線路...");
        const line2 = conveyorSystem.upsertLogisticsLine({
            sourceEnt: warehouse,
            targetPoint: pts2[pts2.length - 1],
            points: pts2,
            routeWidth: 1
        });
        console.log(`第二條線路建好, groupId: ${line2?.groupId}`);

        // 4. 模擬第三條灰色線路 (從倉庫頂部出口出來，向右，向下，再向左，接到原本的第二條藍色線路上)
        // 倉庫頂部出口大概是 x=530, y=300
        // 往上 (0, 1, 2) => 530, 260
        // 向右 => 700, 260
        // 向下 => 700, 400
        // 向左 => 接到第二條藍色線路的右端 (680, 400)
        // 途中在 x=620 處與第一條向下藍色線路 (x=620, y=330..450) 相交！
        const pts3 = [
            { x: 530, y: 300 },
            { x: 530, y: 260 },
            { x: 700, y: 260 },
            { x: 700, y: 400 },
            { x: 670, y: 400 } // 接到第二條線路
        ];
        console.log("建造第三條灰色線路...");

        // 開始模擬 Drag
        conveyorSystem.startDrag(530, 300, warehouse);
        // 更新 Drag 點
        conveyorSystem.updateDragNow(680, 400);
        // 提交 Drag
        conveyorSystem.submitDrag();

        const lineGroups = {};
        GameEngine.state.logisticsLines.forEach(l => {
            const gid = l.groupId || l.id;
            if (!lineGroups[gid]) lineGroups[gid] = [];
            lineGroups[gid].push({ id: l.id, pts: l.routePoints });
        });
        console.log("目前所有物流線分組：", JSON.stringify(lineGroups, null, 2));
        console.log("目前所有 MergeNode 詳細：", JSON.stringify(GameEngine.state.logisticsMergeNodes, null, 2));

        return {
            lines: GameEngine.state.logisticsLines.length,
            nodes: GameEngine.state.logisticsMergeNodes
        };
    });

    console.log("測試結果：", result);
});
