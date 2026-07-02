const { test, expect } = require('@playwright/test');

test('拓樸重接到另一輸入端口後在途物品 targetPoint 必須跟隨新路線尾端', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsTransferRerouter } = await import('/src/systems/logistics/LogisticsTransferRerouter.js?v=' + Date.now());

        const oldPort = { x: 200, y: 100, dir: 'left', width: 1, defIndex: 0, slotIndex: 0 };
        const newPort = { x: 200, y: 200, dir: 'left', width: 1, defIndex: 1, slotIndex: 0 };
        const sourcePort = { x: 100, y: 100, dir: 'right', width: 1, defIndex: 0, slotIndex: 0 };
        const target = {
            id: 'target_building',
            type1: 'target_test',
            x: 220,
            y: 150,
            portSlots: [oldPort, newPort]
        };
        const source = {
            id: 'source_building',
            type1: 'source_test',
            x: 80,
            y: 100,
            portSlots: [sourcePort]
        };
        const state = {
            mapEntities: [source, target],
            logisticsLines: [{
                id: 'line_a',
                groupId: 'group_a',
                sourceId: source.id,
                targetId: target.id,
                sourcePort,
                targetPort: oldPort,
                routePoints: [sourcePort, { x: 160, y: 100 }, { x: 160, y: 200 }, newPort],
                routeWidth: 1,
                efficiency: 4
            }],
            activeTransfers: [{
                id: 'transfer_a',
                lineId: 'group_a',
                sourceId: source.id,
                targetId: target.id,
                itemType: 'wood',
                progress: 0.5,
                routePoints: [sourcePort, oldPort],
                targetPoint: oldPort
            }],
            logisticsMergeNodes: []
        };
        const previous = {
            getBuildingPortSlots: window.UIManager.getBuildingPortSlots,
            getEntityId: window.UIManager.getEntityId
        };
        try {
            window.UIManager.getBuildingPortSlots = (ent) => Array.isArray(ent?.portSlots) ? ent.portSlots : [];
            window.UIManager.getEntityId = (ent) => ent?.id || null;

            const system = {
                snapPointToGridCenter: (p) => ({ x: Math.round(p.x / 20) * 20, y: Math.round(p.y / 20) * 20 }),
                orderLogisticsSegmentsByDirection: (segments) => segments,
                undoStore: { returnTransferToSource: () => false },
                applyLogisticsMergeNodes: () => {},
                applyBlockedTransferQueues: () => {}
            };
            const rerouter = new LogisticsTransferRerouter(system, () => ({ TILE_SIZE: 20 }));
            rerouter.updateOnLogisticsChange(state, new Set(['group_a']));
            const transfer = state.activeTransfers[0];
            const routeEnd = transfer.routePoints[transfer.routePoints.length - 1];
            return {
                routeEnd,
                targetPoint: transfer.targetPoint,
                targetId: transfer.targetId
            };
        } finally {
            window.UIManager.getBuildingPortSlots = previous.getBuildingPortSlots;
            window.UIManager.getEntityId = previous.getEntityId;
        }
    });

    expect(result.targetId).toBe('target_building');
    expect(result.routeEnd).toEqual({ x: 200, y: 200 });
    expect(result.targetPoint).toEqual({ x: 200, y: 200 });
});
