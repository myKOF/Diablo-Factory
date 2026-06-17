const { test, expect } = require('@playwright/test');

test('物流端口過濾器與 UI 互動測試', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { LogisticsUI } = await import('/src/ui/LogisticsUI.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));

        const source = {
            id: 'warehouse_1',
            type1: 'warehouse',
            x: 50,
            y: 50,
            outputTargets: [
                { id: 'target_a', lineId: 'gA', filter: null, sourcePort: { x: 50, y: 50, dir: 'right', width: 1 } }
            ]
        };
        const target = { id: 'target_a', type1: 'factory', x: 110, y: 50 };
        state.mapEntities = [source, target];
        state.logisticsLines = [
            {
                id: 'seg_port',
                groupId: 'gA',
                sourceId: 'warehouse_1',
                targetId: 'target_a',
                sourcePort: { x: 50, y: 50, dir: 'right', width: 1 },
                routePoints: [{ x: 50, y: 50 }, { x: 70, y: 50 }],
                routeWidth: 1,
                order: 0,
                filter: null
            },
            {
                id: 'seg_downstream',
                groupId: 'gA',
                sourceId: 'warehouse_1',
                targetId: 'target_a',
                sourcePort: { x: 50, y: 50, dir: 'right', width: 1 },
                routePoints: [{ x: 70, y: 50 }, { x: 90, y: 50 }],
                routeWidth: 1,
                order: 1,
                filter: null
            }
        ];
        conveyorSystem.rebuildSpatialHashGrid();

        const hits = conveyorSystem.getLogisticsLinesAt(50, 50);
        if (hits.length === 0 || hits[0].id !== 'seg_port') {
            return { success: false, error: 'Source-port first cell is not clickable' };
        }

        LogisticsUI.activeLogisticsConnection = {
            source,
            targetId: 'target_a',
            groupId: 'gA',
            lineId: 'seg_port'
        };
        LogisticsUI.activeLogisticsLine = state.logisticsLines[0];
        LogisticsUI.setLogisticsFilter(null, 'wood');

        if (source.outputTargets[0].filter !== 'wood') {
            return { success: false, error: 'Filter is not stored on output targets connection' };
        }

        // 清理測試狀態
        GameEngine.state = originalState;
        return { success: true };
    });

    expect(result.success).toBe(true);
});
