const { test, expect } = require('@playwright/test');

test('物流線建造快照與 Undo 復原測試', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsUndoStore } = await import('/src/systems/logistics/LogisticsUndoStore.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');
        
        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));

        // 清空並準備測試狀態
        state.logisticsLines = [];
        state.logisticsMergeNodes = [];
        state.logisticsTurnArrowOverrides = [];
        state.activeTransfers = [];
        state.mapEntities = [];
        state.resources = state.resources || {};
        state.resources.wood = 100;
        state.resources.stone = 50;
        state.selectedLogisticsLineId = null;
        state.selectedLogisticsGroupId = null;

        class TestSystem {
            constructor() {
                this.activeDrag = null;
                this.logisticsBuildUndoStack = [];
                this.maxLogisticsBuildUndoSteps = 5;
                this.undoStore = new LogisticsUndoStore(this, () => GameEngine);
                this.rebuildCount = 0;
            }

            getLogisticsLineSelectionKey(line) {
                if (!line) return null;
                return line.selectionKey || line.id || line.groupId || null;
            }

            getLogisticsLineById(key) {
                return (GameEngine.state.logisticsLines || []).find(line =>
                    line &&
                    (line.id === key ||
                        line.groupId === key ||
                        this.getLogisticsLineSelectionKey(line) === key)
                ) || null;
            }

            rebuildSpatialHashGrid() {
                this.rebuildCount++;
            }
        }

        const sys = new TestSystem();
        const windowUIManagerBackup = {
            activeLogisticsLine: window.UIManager.activeLogisticsLine,
            activeLogisticsConnection: window.UIManager.activeLogisticsConnection
        };

        try {
            state.logisticsLines = [{
                id: 'line_before',
                groupId: 'g_before',
                routePoints: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
                routeWidth: 1
            }];
            state.logisticsMergeNodes = [{ id: 'merge_before', inputGroupIds: ['g_branch'], outputGroupId: 'g_before' }];
            state.logisticsTurnArrowOverrides = [{ overrideKey: 'before' }];
            state.resources = { wood: 100, stone: 50 };
            state.mapEntities = [{
                id: 'source',
                outputTargets: [{ id: 'target_before', lineId: 'g_before', filter: 'WOOD' }],
                outputBuffer: { wood: 1 },
                outputCapacity: 3
            }];
            state.activeTransfers = [
                { id: 'item_live', lineId: 'g_after', type: 'wood', sourceId: 'source', progress: 0.75 },
                { id: 'item_keep', lineId: 'g_before', type: 'stone', sourceId: 'source', progress: 0.25 }
            ];
            state.selectedLogisticsLineId = 'line_before';
            state.selectedLogisticsGroupId = 'g_before';
            state.selectedLogisticsClickX = 1;
            state.selectedLogisticsClickY = 2;
            window.UIManager.activeLogisticsLine = state.logisticsLines[0];
            window.UIManager.activeLogisticsConnection = { lineId: 'g_before', groupId: 'g_before' };

            sys.undoStore.record(null, state);

            state.logisticsLines = [{
                id: 'line_after',
                groupId: 'g_after',
                routePoints: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
                routeWidth: 1
            }];
            state.logisticsMergeNodes = [{ id: 'merge_after', inputGroupIds: ['g_new'], outputGroupId: 'g_after' }];
            state.logisticsTurnArrowOverrides = [{ overrideKey: 'after' }];
            state.resources.wood = 87;
            state.mapEntities[0].outputTargets = [{ id: 'target_after', lineId: 'g_after', filter: null }];
            state.selectedLogisticsLineId = 'line_after';
            state.selectedLogisticsGroupId = 'g_after';
            state.selectedLogisticsClickX = 9;
            state.selectedLogisticsClickY = 10;
            window.UIManager.activeLogisticsLine = state.logisticsLines[0];
            window.UIManager.activeLogisticsConnection = { lineId: 'g_after', groupId: 'g_after' };

            const undoRes = sys.undoStore.undoLast(state);
            if (!undoRes) return { success: false, error: 'Undo operation failed' };

            if (state.logisticsLines.length !== 1 || state.logisticsLines[0].id !== 'line_before') {
                return { success: false, error: 'Failed to restore logistics lines' };
            }
            if (state.logisticsMergeNodes[0].id !== 'merge_before') {
                return { success: false, error: 'Failed to restore merge nodes' };
            }
            if (state.resources.wood !== 100 || state.resources.stone !== 50) {
                return { success: false, error: 'Failed to restore resources' };
            }
            if (state.mapEntities[0].outputTargets[0].lineId !== 'g_before') {
                return { success: false, error: 'Failed to restore map entities output targets' };
            }

            // 限制 5 筆上限測試
            for (let i = 0; i < 6; i++) {
                state.logisticsLines = [{ id: `state_${i}`, groupId: `g_${i}`, routePoints: [{ x: i, y: 0 }, { x: i + 1, y: 0 }] }];
                sys.undoStore.record(null, state);
                state.logisticsLines = [{ id: `after_${i}`, groupId: `ga_${i}`, routePoints: [{ x: i, y: 0 }, { x: i + 2, y: 0 }] }];
            }

            for (let expected = 5; expected >= 1; expected--) {
                const stepRes = sys.undoStore.undoLast(state);
                if (!stepRes || state.logisticsLines[0].id !== `state_${expected}`) {
                    return { success: false, error: `Undo stack restore mismatch at step ${expected}` };
                }
            }
            if (sys.undoStore.undoLast(state) !== false) {
                return { success: false, error: 'Undo stack should only keep 5 items maximum' };
            }

            return { success: true };
        } finally {
            // 還原狀態
            GameEngine.state = originalState;
            window.UIManager.activeLogisticsLine = windowUIManagerBackup.activeLogisticsLine;
            window.UIManager.activeLogisticsConnection = windowUIManagerBackup.activeLogisticsConnection;
        }
    });

    expect(result.success).toBe(true);
});
