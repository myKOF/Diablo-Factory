const { test, expect } = require('@playwright/test');

test('物流線拆分在途物品不誤清且合流點不卡死測試', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined' && Array.isArray(window.GAME_STATE.logisticsLines), null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');
        const state = GameEngine.state;
        const TILE = GameEngine.TILE_SIZE || 20;

        // 清空現有物流線與轉移物品，確保測試環境乾淨
        state.logisticsLines = [];
        state.activeTransfers = [];
        state.logisticsMergeNodes = [];
        state.resources = state.resources || {};
        state.resources['wood'] = 999999;

        const drawLine = (x0, y0, x1, y1) => {
            conveyorSystem.startDrag(x0, y0);
            if (conveyorSystem.updateDragNow) {
                conveyorSystem.updateDragNow(x1, y1);
            } else {
                conveyorSystem.updateDrag(x1, y1);
            }
            conveyorSystem.submitDrag();
        };

        // 畫測試拓樸：
        // 支線 A: 點 (110, 110) -> (310, 110) -> (310, 210) （進入合流點）
        // 支線 B: 點 (110, 210) -> (310, 210)
        // 合流後輸出線 C: 點 (310, 210) -> (310, 310)

        // 畫輸出線 C
        drawLine(310, 210, 310, 310);
        // 畫支線 B
        drawLine(110, 210, 310, 210);
        // 畫支線 A (單次拖曳以建立單一群組)
        conveyorSystem.startDrag(110, 110);
        if (conveyorSystem.updateDragNow) {
            conveyorSystem.updateDragNow(310, 110);
            conveyorSystem.updateDragNow(310, 210);
        } else {
            conveyorSystem.updateDrag(310, 110);
            conveyorSystem.updateDrag(310, 210);
        }
        conveyorSystem.submitDrag();

        // 等待合流點註冊
        for (let i = 0; i < 30; i++) {
            if (state.logisticsMergeNodes && state.logisticsMergeNodes.length > 0) break;
            await new Promise(r => setTimeout(r, 100));
        }

        const initialNodes = state.logisticsMergeNodes || [];
        if (initialNodes.length === 0) {
            return { success: false, error: '合流點未成功建立' };
        }

        const mergeNode = initialNodes[0];
        const initialInputGroups = [...mergeNode.inputGroupIds];

        // 找出支線 A 的 groupId (我們從 (110, 110) 出發的那條線)
        const lineA = state.logisticsLines.find(l => {
            const pts = l.routePoints || [];
            return pts.some(p => Math.abs(p.x - 110) < 5 && Math.abs(p.y - 110) < 5);
        });
        const groupAId = lineA ? lineA.groupId : null;

        // 找出支線 B 的 groupId (我們從 (110, 210) 出發的那條線)
        const lineB = state.logisticsLines.find(l => {
            const pts = l.routePoints || [];
            return pts.some(p => Math.abs(p.x - 110) < 5 && Math.abs(p.y - 210) < 5);
        });
        const groupBId = lineB ? lineB.groupId : null;

        if (!groupAId || !groupBId) {
            return { success: false, error: '找不到支線 A 或支線 B 的群組 ID', groupAId, groupBId };
        }

        // 注入在途物品
        // 物品 A1: 在支線 A 的後半段 (接近 310, 150)
        // 物品 B1: 在支線 B 上 (接近 210, 210)
        const routeA = conveyorSystem.getLogisticsGroupRoutePoints ? conveyorSystem.getLogisticsGroupRoutePoints(groupAId) : lineA.routePoints;
        const routeB = conveyorSystem.getLogisticsGroupRoutePoints ? conveyorSystem.getLogisticsGroupRoutePoints(groupBId) : lineB.routePoints;

        state.activeTransfers.push({
            id: 'item_A1',
            lineId: groupAId,
            routePoints: routeA.map(p => ({ x: p.x, y: p.y })),
            progress: 0.6, // 靠近末端
            itemType: 'wood',
            efficiency: 4
        });

        state.activeTransfers.push({
            id: 'item_B1',
            lineId: groupBId,
            routePoints: routeB.map(p => ({ x: p.x, y: p.y })),
            progress: 0.5,
            itemType: 'wood',
            efficiency: 4
        });

        // 模擬刪除支線 A 中段的一格線段
        // 尋找支線 A 在 (210, 110) 附近的線段進行刪除
        const segToDelete = state.logisticsLines.find(l => {
            if (l.groupId !== groupAId) return false;
            // 寬鬆匹配中段線段
            const dist = Math.hypot((l.x || 0) - 210, (l.y || 0) - 110);
            return dist < 30;
        });

        if (!segToDelete) {
            return { success: false, error: '找不到可刪除的支線 A 中段線段' };
        }

        // 執行刪除
        conveyorSystem.deleteLogisticsLineById(segToDelete.id);

        // 驗證 1: 支線 B 上的物品 B1 是否仍存在，沒有被清除
        const hasB1 = state.activeTransfers.some(t => t.id === 'item_B1');

        // 驗證 2: 支線 A 被拆分後，MergeNode 的 inputGroupIds 是否已更新
        const updatedMergeNode = state.logisticsMergeNodes[0];
        const inputGroupsAfterDelete = updatedMergeNode ? updatedMergeNode.inputGroupIds : [];

        // 支線 A 後半段應該會被重命名為 newGroupId
        const itemA1 = state.activeTransfers.find(t => t.id === 'item_A1');
        const itemA1NewGroupId = itemA1 ? itemA1.lineId : null;

        const isNewGroupInMerge = itemA1NewGroupId ? inputGroupsAfterDelete.includes(itemA1NewGroupId) : false;
        const isOldGroupRemoved = !inputGroupsAfterDelete.includes(groupAId);

        return {
            success: true,
            initialNodes: initialNodes.map(n => ({
                id: n.id,
                inputGroupIds: n.inputGroupIds,
                outputGroupId: n.outputGroupId,
                cellKey: n.cellKey
            })),
            hasB1,
            itemA1NewGroupId,
            groupAId,
            isNewGroupInMerge,
            isOldGroupRemoved,
            inputGroupsAfterDelete
        };
    });

    expect(result.success).toBe(true);
    expect(result.hasB1).toBe(true); // 支線 B 物品沒有被清除
    expect(result.itemA1NewGroupId).not.toBe(result.groupAId); // 支線 A 後半段物品改為新群組 ID
    expect(result.isNewGroupInMerge).toBe(true); // 新群組 ID 被加入了 MergeNode
    expect(result.isOldGroupRemoved).toBe(true); // 舊群組 ID 從 MergeNode 移除
});
