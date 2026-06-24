const { test, expect } = require('@playwright/test');

async function loadGame(page) {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 30000 });
}

test('物流狀態必須透過 Action 層集中更新', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        try {
            const { LogisticsStateActions } = await import('/src/systems/logistics/LogisticsStateActions.js');
            const state = {
                logisticsLines: [],
                selectedLogisticsLineId: 'old_line',
                selectedLogisticsGroupId: 'old_group',
                selectedLogisticsClickX: 1,
                selectedLogisticsClickY: 2,
                logisticsTurnArrowOverrides: []
            };
            const line = { id: 'line_a', groupId: 'group_a', routePoints: [{ x: 0, y: 0 }, { x: 20, y: 0 }] };
            LogisticsStateActions.replaceLogisticsLines(state, [line]);
            line.groupId = 'mutated_group';

            if (state.logisticsLines.length !== 1 || state.logisticsLines[0].groupId !== 'group_a') {
                return { success: false, error: 'replaceLogisticsLines 必須複製輸入資料，避免外部引用污染 state' };
            }

            LogisticsStateActions.setSelectedLogistics(state, {
                lineId: 'line_b',
                groupId: 'group_b',
                clickX: 10,
                clickY: 20
            });
            if (state.selectedLogisticsLineId !== 'line_b' ||
                state.selectedLogisticsGroupId !== 'group_b' ||
                state.selectedLogisticsClickX !== 10 ||
                state.selectedLogisticsClickY !== 20) {
                return { success: false, error: `選取狀態未集中更新：${JSON.stringify(state)}` };
            }

            LogisticsStateActions.upsertTurnArrowOverride(state, {
                overrideKey: 'group_a:0,0',
                groupId: 'group_a',
                cellKey: '0,0',
                dirX: 1,
                dirY: 0
            });
            LogisticsStateActions.upsertTurnArrowOverride(state, {
                overrideKey: 'group_a:0,0',
                groupId: 'group_a',
                cellKey: '0,0',
                dirX: 0,
                dirY: 1
            });
            if (state.logisticsTurnArrowOverrides.length !== 1 || state.logisticsTurnArrowOverrides[0].dirY !== 1) {
                return { success: false, error: 'turnArrowOverride upsert 應以 overrideKey 取代既有項目' };
            }

            LogisticsStateActions.removeTurnArrowOverride(state, item => item?.cellKey === '0,0');
            if (state.logisticsTurnArrowOverrides.length !== 0) {
                return { success: false, error: 'removeTurnArrowOverride 未移除符合條件項目' };
            }

            LogisticsStateActions.setSelectedLogistics(state, {
                lineId: 'line_to_clear',
                groupId: 'group_to_clear',
                clickX: 30,
                clickY: 40
            });
            LogisticsStateActions.clearSelectedLogisticsIfMatches(state, {
                groupId: 'other_group'
            });
            if (state.selectedLogisticsLineId !== 'line_to_clear' || state.selectedLogisticsGroupId !== 'group_to_clear') {
                return { success: false, error: '不符合條件時不應清除選取狀態' };
            }
            LogisticsStateActions.clearSelectedLogisticsIfMatches(state, {
                lineId: 'line_to_clear'
            });
            if (state.selectedLogisticsLineId !== null ||
                state.selectedLogisticsGroupId !== null ||
                state.selectedLogisticsClickX !== null ||
                state.selectedLogisticsClickY !== null) {
                return { success: false, error: '符合 lineId 時應清除選取狀態' };
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('合流 winner 缺少 runtime 時不得使用隨機 fallback', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { LogisticsTransferQueues } = await import('/src/systems/logistics/LogisticsTransferQueues.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const originalRandom = Math.random;
        const node = {
            id: 'merge_without_runtime',
            outputGroupId: 'output',
            inputGroupIds: ['input_a', 'input_b'],
            point: { x: 100, y: 0 }
        };
        const state = {
            logisticsMergeNodes: [node],
            logisticsLines: [],
            activeTransfers: [
                {
                    id: 'item_a',
                    lineId: 'input_a',
                    routePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
                    progress: 1,
                    targetId: 'target'
                },
                {
                    id: 'item_b',
                    lineId: 'input_b',
                    routePoints: [{ x: 0, y: 20 }, { x: 100, y: 20 }],
                    progress: 1,
                    targetId: 'target'
                }
            ]
        };
        const systemWithoutRuntime = {
            isLogisticsMergeInputTransfer: (transfer) => node.inputGroupIds.includes(transfer.lineId),
            getLogisticsMergeNodeForInputTransfer: (transfer) =>
                node.inputGroupIds.includes(transfer.lineId) ? node : null
        };

        try {
            Math.random = () => {
                throw new Error('合流 winner 不得使用 Math.random fallback');
            };

            const queues = new LogisticsTransferQueues(systemWithoutRuntime, () => GameEngine);
            queues.applyBlockedQueues(state);

            const randomWinnerState = state._logisticsMergeAdmissionWinners || null;
            if (randomWinnerState) {
                return {
                    success: false,
                    error: `不應建立隨機 winner 狀態：${JSON.stringify(randomWinnerState)}`
                };
            }

            const allWaiting = state.activeTransfers.every(transfer =>
                transfer.queueBlocked === true
            );
            if (!allWaiting) {
                return {
                    success: false,
                    error: `缺少 runtime winner 時，所有輸入都應被標記為等待：${JSON.stringify(state.activeTransfers)}`
                };
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            Math.random = originalRandom;
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('刪除運輸中物流線時產品必須退回來源建築', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const uiBackup = {
            activeLogisticsLine: window.UIManager?.activeLogisticsLine || null,
            activeLogisticsConnection: window.UIManager?.activeLogisticsConnection || null
        };

        try {
            const source = {
                id: 'source_building',
                type1: 'warehouse',
                x: 0,
                y: 0,
                storage: {},
                outputBuffer: {},
                outputTargets: [{ id: 'target_building', lineId: 'delete_group', filter: 'wood' }]
            };
            const target = {
                id: 'target_building',
                type1: 'factory',
                x: 100,
                y: 0,
                inputBuffer: {}
            };

            state.mapEntities = [source, target];
            state.logisticsMergeNodes = [];
            state.logisticsTurnArrowOverrides = [];
            state.logisticsLines = [{
                id: 'delete_segment',
                groupId: 'delete_group',
                sourceId: 'source_building',
                targetId: 'target_building',
                x: 20,
                y: 0,
                gridX: 20,
                gridY: 0,
                routePoints: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
                routeWidth: 1,
                order: 0,
                efficiency: 1
            }];
            state.activeTransfers = [{
                id: 'live_item_on_deleted_line',
                lineId: 'delete_group',
                sourceId: 'source_building',
                targetId: 'target_building',
                itemType: 'wood',
                routePoints: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
                progress: 0.5,
                efficiency: 1
            }];
            state.selectedLogisticsLineId = conveyorSystem.getLogisticsLineSelectionKey(state.logisticsLines[0]);
            state.selectedLogisticsGroupId = 'delete_group';

            const deleted = conveyorSystem.deleteLogisticsLineById(state.selectedLogisticsLineId);
            if (!deleted) {
                return { success: false, error: '刪除物流線 API 回傳 false' };
            }

            const returnedAmount = Number(source.outputBuffer.wood || 0) + Number(source.storage.wood || 0);
            if (returnedAmount !== 1) {
                return {
                    success: false,
                    error: `產品未退回來源建築，outputBuffer=${JSON.stringify(source.outputBuffer)} storage=${JSON.stringify(source.storage)} activeTransfers=${JSON.stringify(state.activeTransfers)}`
                };
            }

            if (state.activeTransfers.some(item => item.id === 'live_item_on_deleted_line')) {
                return { success: false, error: '已回收產品不應仍留在 activeTransfers' };
            }

            return { success: true };
        } finally {
            GameEngine.state = originalState;
            if (window.UIManager) {
                window.UIManager.activeLogisticsLine = uiBackup.activeLogisticsLine;
                window.UIManager.activeLogisticsConnection = uiBackup.activeLogisticsConnection;
            }
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('刪除群組中段導致重路由失敗時產品必須退回來源建築', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const uiBackup = {
            activeLogisticsLine: window.UIManager?.activeLogisticsLine || null,
            activeLogisticsConnection: window.UIManager?.activeLogisticsConnection || null
        };

        try {
            const source = {
                id: 'reroute_source',
                type1: 'warehouse',
                x: 0,
                y: 0,
                storage: {},
                outputBuffer: {},
                outputTargets: [{ id: 'reroute_target', lineId: 'reroute_group', filter: 'wood' }]
            };
            const target = {
                id: 'reroute_target',
                type1: 'factory',
                x: 80,
                y: 0,
                inputBuffer: {}
            };
            const deletedSegment = {
                id: 'reroute_seg_a',
                groupId: 'reroute_group',
                sourceId: 'reroute_source',
                targetId: 'reroute_target',
                x: 20,
                y: 0,
                gridX: 20,
                gridY: 0,
                routePoints: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
                routeWidth: 1,
                order: 0,
                splitSequenceOrder: 0,
                nextId: 'reroute_seg_b',
                efficiency: 1
            };
            const remainingSegment = {
                id: 'reroute_seg_b',
                groupId: 'reroute_group',
                sourceId: 'reroute_source',
                targetId: 'reroute_target',
                x: 60,
                y: 0,
                gridX: 60,
                gridY: 0,
                routePoints: [{ x: 40, y: 0 }, { x: 80, y: 0 }],
                routeWidth: 1,
                order: 1,
                splitSequenceOrder: 1,
                prevId: 'reroute_seg_a',
                efficiency: 1
            };

            state.mapEntities = [source, target];
            state.logisticsMergeNodes = [];
            state.logisticsTurnArrowOverrides = [];
            state.logisticsLines = [deletedSegment, remainingSegment];
            state.activeTransfers = [{
                id: 'live_item_lost_by_reroute',
                lineId: 'reroute_group',
                sourceId: 'reroute_source',
                targetId: 'reroute_target',
                itemType: 'wood',
                routePoints: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
                progress: 0.5,
                efficiency: 1
            }];

            const deleted = conveyorSystem.deleteLogisticsLineById(
                conveyorSystem.getLogisticsLineSelectionKey(deletedSegment)
            );
            if (!deleted) {
                return { success: false, error: '刪除物流線 API 回傳 false' };
            }

            const returnedAmount = Number(source.outputBuffer.wood || 0) + Number(source.storage.wood || 0);
            if (returnedAmount !== 1) {
                return {
                    success: false,
                    error: `重路由失敗產品未退回來源建築，outputBuffer=${JSON.stringify(source.outputBuffer)} storage=${JSON.stringify(source.storage)} activeTransfers=${JSON.stringify(state.activeTransfers)}`
                };
            }

            if (state.activeTransfers.some(item => item.id === 'live_item_lost_by_reroute')) {
                return { success: false, error: '已回收產品不應仍留在 activeTransfers' };
            }

            return { success: true };
        } finally {
            GameEngine.state = originalState;
            if (window.UIManager) {
                window.UIManager.activeLogisticsLine = uiBackup.activeLogisticsLine;
                window.UIManager.activeLogisticsConnection = uiBackup.activeLogisticsConnection;
            }
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('物流線 routeWidth footprint 必須與 ConveyorRouter 一致', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { ConveyorRouter } = await import('/src/systems/ConveyorRouter.js');
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const previousTileSize = GameEngine.TILE_SIZE;
        try {
            GameEngine.TILE_SIZE = 20;
            const router = new ConveyorRouter([], 20, 20, { alignmentUnit: 1.0 });
            const line = {
                id: 'wide_segment',
                groupId: 'wide_group',
                x: 20,
                y: 20,
                gridX: 2,
                gridY: 2,
                routePoints: [{ x: 20, y: 20 }, { x: 60, y: 20 }],
                routeWidth: 2
            };
            const ghosts = [
                { x: 2, y: 2, dirIn: { x: 1, y: 0 }, dirOut: { x: 1, y: 0 } }
            ];

            const routerKeys = router.getGhostOccupiedCells(ghosts, line.routeWidth)
                .map(cell => `${cell.x},${cell.y}`)
                .sort();
            const systemKeys = conveyorSystem.getLogisticsSegmentOccupiedKeys(line)
                .sort();

            if (JSON.stringify(systemKeys) !== JSON.stringify(routerKeys)) {
                return {
                    success: false,
                    error: `footprint 不一致，Router=${JSON.stringify(routerKeys)} System=${JSON.stringify(systemKeys)}`
                };
            }

            return { success: true };
        } finally {
            GameEngine.TILE_SIZE = previousTileSize;
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('寬物流線 hit-test 必須遵守 Router footprint', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const previousTileSize = GameEngine.TILE_SIZE;

        try {
            GameEngine.TILE_SIZE = 20;
            state.logisticsLines = [{
                id: 'wide_hit_line',
                groupId: 'wide_hit_group',
                x: 20,
                y: 20,
                gridX: 2,
                gridY: 2,
                routePoints: [{ x: 20, y: 20 }, { x: 60, y: 20 }],
                routeWidth: 2,
                order: 0
            }];
            conveyorSystem.rebuildSpatialHashGrid();

            const routerFootprintHit = conveyorSystem.getLogisticsLinesAt(20, 10)
                .some(line => line.id === 'wide_hit_line');
            const nonFootprintHit = conveyorSystem.getLogisticsLinesAt(20, 35)
                .some(line => line.id === 'wide_hit_line');

            if (!routerFootprintHit) {
                return { success: false, error: 'Router footprint 內的上方寬度格應命中物流線' };
            }
            if (nonFootprintHit) {
                return { success: false, error: 'Router footprint 外的下方格不應命中物流線' };
            }

            return { success: true };
        } finally {
            GameEngine.TILE_SIZE = previousTileSize;
            GameEngine.state = originalState;
            conveyorSystem.rebuildSpatialHashGrid();
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('SpatialHashGrid 寬物流線候選必須遵守 Router footprint', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { SpatialHashGrid } = await import('/src/systems/logistics/SpatialHashGrid.js');
        const previousCellSize = 10;
        const grid = new SpatialHashGrid(previousCellSize, () => 20);
        const line = {
            id: 'wide_hash_line',
            groupId: 'wide_hash_group',
            routePoints: [{ x: 20, y: 20 }, { x: 60, y: 20 }],
            routeWidth: 2
        };

        grid.insert(line);
        const upperCandidates = [...grid.getNearby(20, 10)].map(item => item.id);
        const lowerCandidates = [...grid.getNearby(20, 50)].map(item => item.id);

        if (!upperCandidates.includes('wide_hash_line')) {
            return { success: false, error: `Router footprint 上方格應進入 SpatialHash 候選：${JSON.stringify(upperCandidates)}` };
        }
        if (lowerCandidates.includes('wide_hash_line')) {
            return { success: false, error: `Router footprint 下方格不應進入 SpatialHash 候選：${JSON.stringify(lowerCandidates)}` };
        }

        return { success: true };
    });

    expect(result.success, result.error).toBe(true);
});

test('物流延伸跨越其他物流線時不得合併被跨越群組', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const originalRandom = Math.random;

        try {
            Math.random = () => 0.1234;
            const source = {
                id: 'extension_source',
                type1: 'warehouse',
                x: 10,
                y: 10,
                outputTargets: []
            };
            state.mapEntities = [source];
            state.logisticsMergeNodes = [];
            state.logisticsTurnArrowOverrides = [];
            state.activeTransfers = [];
            state.logisticsLines = [
                {
                    id: 'source_seg',
                    groupId: 'source_group',
                    sourceId: 'extension_source',
                    x: 20,
                    y: 10,
                    gridX: 2,
                    gridY: 1,
                    routePoints: [{ x: 10, y: 10 }, { x: 30, y: 10 }],
                    routeWidth: 1,
                    order: 0,
                    efficiency: 1
                },
                {
                    id: 'crossed_seg',
                    groupId: 'crossed_group',
                    sourceId: 'other_source',
                    x: 50,
                    y: 10,
                    gridX: 5,
                    gridY: 1,
                    routePoints: [{ x: 50, y: -10 }, { x: 50, y: 30 }],
                    routeWidth: 1,
                    order: 0,
                    efficiency: 1
                }
            ];

            const created = conveyorSystem.upsertLogisticsLine({
                lineId: 'source_group',
                sourceEnt: source,
                targetPoint: { x: 90, y: 10 },
                points: [{ x: 30, y: 10 }, { x: 90, y: 10 }],
                routeWidth: 1,
                sourcePort: { x: 30, y: 10, dir: 'right', sourceType: 'logistics_line' },
                targetPort: null,
                conn: null,
                lineType: 'transport_line',
                efficiency: 1,
                allowGroupMerge: true
            });

            if (!created) {
                return { success: false, error: '延伸建造未建立任何物流線' };
            }

            const crossedSegments = state.logisticsLines.filter(line => line.id === 'crossed_seg');
            if (crossedSegments.length !== 1 || crossedSegments[0].groupId !== 'crossed_group') {
                return {
                    success: false,
                    error: `被跨越線群組被污染：${JSON.stringify(crossedSegments)}`
                };
            }

            const sourceSegments = state.logisticsLines.filter(line => line.groupId === 'source_group');
            if (sourceSegments.some(line => line.id === 'crossed_seg')) {
                return {
                    success: false,
                    error: `被跨越線被併入來源群組：${JSON.stringify(sourceSegments)}`
                };
            }

            return { success: true };
        } finally {
            Math.random = originalRandom;
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('preview valid 後 submit 不得重新解析成不同 targetPort', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const originalResolveDragTarget = conveyorSystem.resolveDragTarget;
        const originalRandom = Math.random;
        const previousTileSize = GameEngine.TILE_SIZE;
        const originalResolveCurrentPortSlot = window.UIManager?.resolveCurrentPortSlot || null;

        try {
            Math.random = () => 0.4321;
            GameEngine.TILE_SIZE = 20;
            state.pathfinding = {
                grid: Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => 0))
            };
            state.mapOffset = { x: 0, y: 0 };
            const transportConfig = conveyorSystem.getTransportLineConfig();
            state.resources = { wood: 9999, stone: 9999, iron: 9999, copper: 9999 };
            Object.keys(transportConfig?.costs || {}).forEach(resource => {
                state.resources[resource] = 9999;
            });
            state.logisticsLines = [];
            state.logisticsMergeNodes = [];
            state.logisticsTurnArrowOverrides = [];
            state.activeTransfers = [];
            if (window.UIManager) {
                window.UIManager.resolveCurrentPortSlot = () => sourcePort;
            }

            const source = {
                id: 'preview_submit_source',
                type1: 'warehouse',
                x: 20,
                y: 20,
                outputTargets: [],
                storage: {},
                outputBuffer: {}
            };
            const previewTarget = {
                id: 'preview_target',
                type1: 'factory',
                x: 100,
                y: 20,
                inputBuffer: {}
            };
            const wrongSubmitTarget = {
                id: 'wrong_submit_target',
                type1: 'factory',
                x: 100,
                y: 40,
                inputBuffer: {}
            };
            const sourcePort = { x: 20, y: 20, dir: 'right', width: 1 };
            const previewPort = { x: 100, y: 20, dir: 'left', width: 1 };
            const wrongPort = { x: 100, y: 40, dir: 'left', width: 1 };
            state.mapEntities = [source, previewTarget, wrongSubmitTarget];

            let resolveCallCount = 0;
            conveyorSystem.resolveDragTarget = () => {
                resolveCallCount += 1;
                if (resolveCallCount === 1) {
                    conveyorSystem.activeDrag.targetBuilding = previewTarget;
                    conveyorSystem.activeDrag.targetPort = previewPort;
                    return { x: previewPort.x, y: previewPort.y, building: previewTarget, port: previewPort };
                }
                conveyorSystem.activeDrag.targetBuilding = wrongSubmitTarget;
                conveyorSystem.activeDrag.targetPort = wrongPort;
                return { x: wrongPort.x, y: wrongPort.y, building: wrongSubmitTarget, port: wrongPort };
            };

            conveyorSystem.startDrag(sourcePort.x, sourcePort.y, source, sourcePort);
            conveyorSystem.updateDragNow(previewPort.x, previewPort.y);
            if (!GameEngine.state.conveyorValid || !conveyorSystem.activeDrag?.targetPort) {
                return {
                    success: false,
                    error: `preview 應為 valid，valid=${GameEngine.state.conveyorValid} ghosts=${JSON.stringify(GameEngine.state.conveyorGhosts)}`
                };
            }

            conveyorSystem.submitDrag();

            const targetIds = (source.outputTargets || []).map(target => target.id);
            if (!targetIds.includes('preview_target')) {
                return {
                    success: false,
                    error: `submit 未沿用 preview target，targets=${JSON.stringify(source.outputTargets)} resolveCallCount=${resolveCallCount}`
                };
            }
            if (targetIds.includes('wrong_submit_target')) {
                return {
                    success: false,
                    error: `submit 重新解析到錯誤 target，targets=${JSON.stringify(source.outputTargets)} resolveCallCount=${resolveCallCount}`
                };
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            Math.random = originalRandom;
            conveyorSystem.resolveDragTarget = originalResolveDragTarget;
            if (window.UIManager) {
                window.UIManager.resolveCurrentPortSlot = originalResolveCurrentPortSlot;
            }
            conveyorSystem.cancelDrag();
            GameEngine.TILE_SIZE = previousTileSize;
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('preview valid 後 submit 前 footprint 被佔用時必須拒絕建造', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const originalResolveDragTarget = conveyorSystem.resolveDragTarget;
        const originalRandom = Math.random;
        const previousTileSize = GameEngine.TILE_SIZE;
        const originalResolveCurrentPortSlot = window.UIManager?.resolveCurrentPortSlot || null;

        try {
            Math.random = () => 0.5678;
            GameEngine.TILE_SIZE = 20;
            state.pathfinding = {
                grid: Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => 0))
            };
            state.mapOffset = { x: 0, y: 0 };
            const transportConfig = conveyorSystem.getTransportLineConfig();
            state.resources = { wood: 9999, stone: 9999, iron: 9999, copper: 9999 };
            Object.keys(transportConfig?.costs || {}).forEach(resource => {
                state.resources[resource] = 9999;
            });
            state.logisticsLines = [];
            state.logisticsMergeNodes = [];
            state.logisticsTurnArrowOverrides = [];
            state.activeTransfers = [];

            const source = {
                id: 'revalidate_source',
                type1: 'warehouse',
                x: 20,
                y: 20,
                outputTargets: [],
                storage: {},
                outputBuffer: {}
            };
            const target = {
                id: 'revalidate_target',
                type1: 'factory',
                x: 100,
                y: 20,
                inputBuffer: {}
            };
            const sourcePort = { x: 20, y: 20, dir: 'right', width: 1 };
            const targetPort = { x: 100, y: 20, dir: 'left', width: 1 };
            state.mapEntities = [source, target];
            if (window.UIManager) {
                window.UIManager.resolveCurrentPortSlot = () => sourcePort;
            }

            conveyorSystem.resolveDragTarget = () => {
                conveyorSystem.activeDrag.targetBuilding = target;
                conveyorSystem.activeDrag.targetPort = targetPort;
                return { x: targetPort.x, y: targetPort.y, building: target, port: targetPort };
            };

            conveyorSystem.startDrag(sourcePort.x, sourcePort.y, source, sourcePort);
            conveyorSystem.updateDragNow(targetPort.x, targetPort.y);
            const ghosts = GameEngine.state.conveyorGhosts || [];
            if (!GameEngine.state.conveyorValid || ghosts.length < 3) {
                return {
                    success: false,
                    error: `preview 應為 valid 且有足夠 ghost，valid=${GameEngine.state.conveyorValid} ghosts=${JSON.stringify(ghosts)}`
                };
            }

            const scale = conveyorSystem.getRouteScale();
            const gridUnit = GameEngine.TILE_SIZE / scale;
            const offset = GameEngine.state.mapOffset || { x: 0, y: 0 };
            const blockedGhost = ghosts.find(ghost => !ghost.isPortConnector && !ghost.isVirtualEnd) || ghosts[1];
            const blockedPoint = {
                x: (blockedGhost.x + offset.x * scale) * gridUnit,
                y: (blockedGhost.y + offset.y * scale) * gridUnit
            };
            state.logisticsLines = [{
                id: 'submit_revalidation_blocker',
                groupId: 'submit_revalidation_blocker_group',
                x: blockedPoint.x,
                y: blockedPoint.y,
                gridX: blockedPoint.x,
                gridY: blockedPoint.y,
                routePoints: [
                    { x: blockedPoint.x, y: blockedPoint.y },
                    { x: blockedPoint.x + GameEngine.TILE_SIZE, y: blockedPoint.y }
                ],
                routeWidth: 1,
                order: 0,
                efficiency: 1
            }];

            conveyorSystem.submitDrag();

            if ((source.outputTargets || []).length > 0) {
                return {
                    success: false,
                    error: `footprint 已被佔用仍建立連線：${JSON.stringify(source.outputTargets)}`
                };
            }
            const createdLines = (state.logisticsLines || []).filter(line => line.id !== 'submit_revalidation_blocker');
            if (createdLines.length > 0) {
                return {
                    success: false,
                    error: `footprint 已被佔用仍建立物流線：${JSON.stringify(createdLines)}`
                };
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            Math.random = originalRandom;
            conveyorSystem.resolveDragTarget = originalResolveDragTarget;
            if (window.UIManager) {
                window.UIManager.resolveCurrentPortSlot = originalResolveCurrentPortSlot;
            }
            conveyorSystem.cancelDrag();
            GameEngine.TILE_SIZE = previousTileSize;
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
});
