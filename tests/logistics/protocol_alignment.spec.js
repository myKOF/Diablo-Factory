const { test, expect } = require('@playwright/test');

async function loadGame(page) {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 30000 });
}

test('物流 renderer 必須透過 RenderModel 讀取系統資料', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        try {
            const rendererSource = await fetch('/src/renderers/logistics_renderer.js').then(res => res.text());
            if (rendererSource.includes('ConveyorSystem.js') || rendererSource.includes('conveyorSystem')) {
                return { success: false, error: 'logistics_renderer.js 不得直接 import 或呼叫 conveyorSystem' };
            }
            if (!rendererSource.includes('LogisticsRenderModel.js') || !rendererSource.includes('logisticsRenderModel')) {
                return { success: false, error: 'logistics_renderer.js 應透過 LogisticsRenderModel 取得物流渲染資料' };
            }

            const { logisticsRenderModel } = await import('/src/systems/logistics/LogisticsRenderModel.js');
            const requiredMethods = [
                'getMergeConnectedGroupIds',
                'getDisplayConnectedGroupIds',
                'ensureMergeNodeStore',
                'getSegmentsByGroupId',
                'getLineById',
                'getLineRoute',
                'getConnectionRoute',
                'getConnectionTransferRoute',
                'buildPreviewSegments',
                'getMergeNodeForInputTransfer',
                'getMergeNodeOutputRoute',
                'getGroupRoutePoints'
            ];
            const missingMethods = requiredMethods.filter(name => typeof logisticsRenderModel[name] !== 'function');
            if (missingMethods.length > 0) {
                return { success: false, error: `LogisticsRenderModel 缺少 renderer 所需方法：${missingMethods.join(', ')}` };
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('接通路徑轉彎格不得直接跳過方形底圖', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const rendererSource = await fetch('/src/renderers/logistics_renderer.js').then(res => res.text());
        const unsafeBaseSkip = /const\s+roundedBaseSkipCellKeys\s*=\s*new\s+Set\s*\(\s*turnCellKeys/.test(rendererSource);

        return {
            success: !unsafeBaseSkip,
            error: unsafeBaseSkip
                ? 'connectedCellPaths 的 turnCellKeys 不可直接初始化 roundedBaseSkipCellKeys，否則接通後 180 度迴轉末端會少一格底圖'
                : ''
        };
    });

    expect(result.success, result.error).toBe(true);
});

test('接通路徑轉彎格不得直接跳過普通箭頭', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const rendererSource = await fetch('/src/renderers/logistics_renderer.js').then(res => res.text());
        const unsafeArrowSkip = /turnCellKeys\.forEach\(key\s*=>\s*\{[\s\S]*ordinaryArrowSkipCellKeys\.add\(key\)/.test(rendererSource);

        return {
            success: !unsafeArrowSkip,
            error: unsafeArrowSkip
                ? 'connectedCellPaths 的 turnCellKeys 不可直接加入 ordinaryArrowSkipCellKeys，否則沒有轉角箭頭補位的接通格會少普通箭頭'
                : ''
        };
    });

    expect(result.success, result.error).toBe(true);
});

test('接通路徑轉彎圓角被跳過時必須補畫方形底圖', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const rendererSource = await fetch('/src/renderers/logistics_renderer.js').then(res => res.text());
        const unsafeTurnRectReturn = /if\s*\(\s*rect\.isTurn\s*\)\s*return;/.test(rendererSource);
        const hasSkippedTurnBaseGuard = /shouldDrawSkippedTurnBase/.test(rendererSource);

        return {
            success: !unsafeTurnRectReturn && hasSkippedTurnBaseGuard,
            error: unsafeTurnRectReturn
                ? '轉彎格不能一律因 rect.isTurn 跳過底圖；當圓角被 skip 時必須補畫方形底圖'
                : '缺少 skipped turn base 補畫保護'
        };
    });

    expect(result.success, result.error).toBe(true);
});

test('物流 UI tooltip 與 menu 樣式必須讀取 UI_CONFIG', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        try {
            const uiSource = await fetch('/src/ui/LogisticsUI.js').then(res => res.text());
            if (uiSource.includes('cssText')) {
                return { success: false, error: 'LogisticsUI 不得以 cssText 寫死 tooltip/menu 樣式' };
            }

            const { UI_CONFIG } = await import('/src/ui/ui_config.js');
            const { LogisticsUI } = await import('/src/ui/LogisticsUI.js');
            const cfg = UI_CONFIG.LogisticsUI || {};
            document.getElementById('logistics_tooltip')?.remove();

            const tip = LogisticsUI.getLogisticsTooltipEl();
            if (tip.style.zIndex !== String(cfg.tooltip.zIndex) ||
                tip.style.padding !== cfg.tooltip.padding ||
                tip.style.fontSize !== cfg.tooltip.fontSize) {
                return {
                    success: false,
                    error: `tooltip 樣式未對齊 UI_CONFIG：z=${tip.style.zIndex} padding=${tip.style.padding} font=${tip.style.fontSize}`
                };
            }

            const menu = document.createElement('div');
            LogisticsUI.applyLogisticsMenuStyle(menu);
            if (menu.style.zIndex !== String(cfg.menu.zIndex) ||
                menu.style.padding !== cfg.menu.padding ||
                menu.style.gap !== cfg.menu.gap ||
                menu.style.borderRadius !== cfg.menu.borderRadius) {
                return {
                    success: false,
                    error: `menu 樣式未對齊 UI_CONFIG：z=${menu.style.zIndex} padding=${menu.style.padding} gap=${menu.style.gap} radius=${menu.style.borderRadius}`
                };
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    expect(result.success, result.error).toBe(true);
});

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

test('WorkerSystem 合流 winner 缺少 runtime 時不得使用隨機 fallback', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { WorkerSystem } = await import('/src/systems/WorkerSystem.js');
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const originalRandom = Math.random;
        const originalMethods = {
            getLogisticsMergeAdmissionWinner: conveyorSystem.getLogisticsMergeAdmissionWinner,
            getLogisticsMergeNodeForInputTransfer: conveyorSystem.getLogisticsMergeNodeForInputTransfer,
            isLogisticsMergeInputTransfer: conveyorSystem.isLogisticsMergeInputTransfer,
            getLogisticsMergeThroughYieldLimit: conveyorSystem.getLogisticsMergeThroughYieldLimit,
            applyLogisticsMergeNodes: conveyorSystem.applyLogisticsMergeNodes
        };
        const node = {
            id: 'worker_merge_without_runtime',
            outputGroupId: 'output',
            inputGroupIds: ['input_a', 'input_b'],
            point: { x: 100, y: 0 }
        };
        const state = {
            mapEntities: [],
            logisticsMergeNodes: [node],
            logisticsLines: [
                { id: 'input_a_line', groupId: 'input_a', routePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }], routeWidth: 1, efficiency: 1 },
                { id: 'input_b_line', groupId: 'input_b', routePoints: [{ x: 0, y: 20 }, { x: 100, y: 20 }], routeWidth: 1, efficiency: 1 },
                { id: 'output_line', groupId: 'output', routePoints: [{ x: 100, y: 0 }, { x: 140, y: 0 }], routeWidth: 1, efficiency: 1 }
            ],
            activeTransfers: [
                {
                    id: 'worker_item_a',
                    lineId: 'input_a',
                    routePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
                    progress: 1,
                    targetId: 'target',
                    efficiency: 1
                },
                {
                    id: 'worker_item_b',
                    lineId: 'input_b',
                    routePoints: [{ x: 0, y: 20 }, { x: 100, y: 20 }],
                    progress: 1,
                    targetId: 'target',
                    efficiency: 1
                }
            ]
        };
        const engine = {
            TILE_SIZE: 20,
            state,
            getEntityConfig: () => ({ efficiency: 1 }),
            addLog: () => {}
        };

        try {
            Math.random = () => {
                throw new Error('WorkerSystem 合流 winner 不得使用 Math.random fallback');
            };
            conveyorSystem.getLogisticsMergeAdmissionWinner = undefined;
            conveyorSystem.getLogisticsMergeNodeForInputTransfer = (transfer) =>
                node.inputGroupIds.includes(transfer?.lineId) ? node : null;
            conveyorSystem.isLogisticsMergeInputTransfer = (transfer) =>
                node.inputGroupIds.includes(transfer?.lineId);
            conveyorSystem.getLogisticsMergeThroughYieldLimit = () => Infinity;
            conveyorSystem.applyLogisticsMergeNodes = () => false;

            const workerSystem = new WorkerSystem(state, engine);
            workerSystem.processAutomatedLogistics(state, 0.1);

            const randomWinnerState = state._logisticsMergeAdmissionWinners || null;
            if (randomWinnerState) {
                return {
                    success: false,
                    error: `WorkerSystem 不應建立隨機 winner 狀態：${JSON.stringify(randomWinnerState)}`
                };
            }
            const allWaiting = state.activeTransfers.every(transfer => transfer.queueBlocked === true);
            if (!allWaiting) {
                return {
                    success: false,
                    error: `缺少 runtime winner 時，WorkerSystem 應讓所有輸入等待：${JSON.stringify(state.activeTransfers)}`
                };
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            Math.random = originalRandom;
            conveyorSystem.getLogisticsMergeAdmissionWinner = originalMethods.getLogisticsMergeAdmissionWinner;
            conveyorSystem.getLogisticsMergeNodeForInputTransfer = originalMethods.getLogisticsMergeNodeForInputTransfer;
            conveyorSystem.isLogisticsMergeInputTransfer = originalMethods.isLogisticsMergeInputTransfer;
            conveyorSystem.getLogisticsMergeThroughYieldLimit = originalMethods.getLogisticsMergeThroughYieldLimit;
            conveyorSystem.applyLogisticsMergeNodes = originalMethods.applyLogisticsMergeNodes;
            GameEngine.state._logisticsMergeAdmissionWinners = undefined;
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('合流等待主線但主線無可通過物品時必須放行支線', async ({ page }) => {
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
            const node = {
                id: 'merge_waiting_main_without_car',
                outputGroupId: 'main_group',
                inputGroupIds: ['branch_group'],
                point: { x: 100, y: 100 },
                currentActiveSlot: 1,
                roundRobinIndex: 1,
                zipperTurn: 'main',
                awaitingMainPass: true
            };
            state.logisticsMergeNodes = [node];
            state.logisticsLines = [{
                id: 'main_seg',
                groupId: 'main_group',
                routePoints: [{ x: 100, y: 100 }, { x: 160, y: 100 }],
                routeWidth: 1
            }];
            state.activeTransfers = [{
                id: 'branch_ready_item',
                lineId: 'branch_group',
                routePoints: [{ x: 100, y: 60 }, { x: 100, y: 100 }],
                progress: 1,
                itemType: 'wood'
            }];
            state._logisticsMergeAdmissionWinners = {};
            state._logisticsMergeWaitQueues = {};

            const winnerId = conveyorSystem.getLogisticsMergeAdmissionWinner(node, state, {
                spacing: 20,
                readyDistanceFromEnd: 20
            });
            if (winnerId !== 'branch_ready_item') {
                return {
                    success: false,
                    error: `主線無可通過物品時應放行支線，winner=${winnerId} node=${JSON.stringify(node)} winners=${JSON.stringify(state._logisticsMergeAdmissionWinners)}`
                };
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            GameEngine.TILE_SIZE = previousTileSize;
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('合流過彎中的輸出物品不得永久阻塞下一個支線', async ({ page }) => {
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
            const node = {
                id: 'merge_visual_turn_blocker',
                outputGroupId: 'main_group',
                inputGroupIds: ['branch_group'],
                point: { x: 100, y: 100 },
                currentActiveSlot: 0,
                roundRobinIndex: 0,
                zipperTurn: 'branch',
                awaitingMainPass: false
            };
            state.logisticsMergeNodes = [node];
            state.logisticsLines = [{
                id: 'main_seg',
                groupId: 'main_group',
                routePoints: [{ x: 100, y: 100 }, { x: 160, y: 100 }],
                routeWidth: 1,
                efficiency: 1
            }, {
                id: 'branch_seg',
                groupId: 'branch_group',
                routePoints: [{ x: 100, y: 60 }, { x: 100, y: 100 }],
                routeWidth: 1,
                efficiency: 1
            }];
            state.activeTransfers = [
                {
                    id: 'branch_ready_item',
                    lineId: 'branch_group',
                    routePoints: [{ x: 100, y: 60 }, { x: 100, y: 100 }],
                    progress: 1,
                    itemType: 'wood'
                },
                {
                    id: 'turning_item',
                    lineId: 'main_group',
                    routePoints: [{ x: 100, y: 100 }, { x: 160, y: 100 }],
                    progress: 0.1,
                    itemType: 'wood',
                    _mergeVisualTurn: {
                        x: 100,
                        y: 100,
                        outputGroupId: 'main_group',
                        inDir: { x: 0, y: 1 },
                        outDir: { x: 1, y: 0 }
                    }
                }
            ];
            state._logisticsMergeAdmissionWinners = {};
            state._logisticsMergeWaitQueues = {};

            const changed = conveyorSystem.applyLogisticsMergeNodes(state);
            const branch = state.activeTransfers.find(transfer => transfer.id === 'branch_ready_item');
            if (!changed || branch?.lineId !== 'main_group' || branch?.queueBlocked === true) {
                return {
                    success: false,
                    error: `過彎視覺物品不應永久阻塞下一支線，changed=${changed} branch=${JSON.stringify(branch)} node=${JSON.stringify(node)}`
                };
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            GameEngine.TILE_SIZE = previousTileSize;
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('合流拓樸變更後未穿越匯合點的輸出物品不得堵死支線', async ({ page }) => {
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
            const node = {
                id: 'merge_changed_topology_with_stale_output',
                outputGroupId: 'main_group',
                inputGroupIds: ['branch_group', 'new_port_group'],
                point: { x: 100, y: 100 },
                currentActiveSlot: 2,
                roundRobinIndex: 2,
                zipperTurn: 'main',
                awaitingMainPass: true
            };
            state.logisticsMergeNodes = [node];
            state.logisticsLines = [{
                id: 'main_seg',
                groupId: 'main_group',
                routePoints: [{ x: 100, y: 100 }, { x: 180, y: 100 }],
                routeWidth: 1,
                efficiency: 1
            }, {
                id: 'branch_seg',
                groupId: 'branch_group',
                routePoints: [{ x: 100, y: 60 }, { x: 100, y: 100 }],
                routeWidth: 1,
                efficiency: 1
            }, {
                id: 'new_port_seg',
                groupId: 'new_port_group',
                routePoints: [{ x: 60, y: 140 }, { x: 100, y: 100 }],
                routeWidth: 1,
                efficiency: 1
            }];
            state.activeTransfers = [{
                id: 'branch_ready_item',
                lineId: 'branch_group',
                routePoints: [{ x: 100, y: 60 }, { x: 100, y: 100 }],
                progress: 1,
                itemType: 'wood'
            }, {
                id: 'stale_output_item',
                lineId: 'main_group',
                // 拓樸重算後仍掛在 output group，但其目前 route 已經不穿越匯合點。
                routePoints: [{ x: 140, y: 100 }, { x: 180, y: 100 }],
                progress: 0,
                itemType: 'wood'
            }];
            state._logisticsMergeAdmissionWinners = {};
            state._logisticsMergeWaitQueues = {};

            const changed = conveyorSystem.applyLogisticsMergeNodes(state);
            const branch = state.activeTransfers.find(transfer => transfer.id === 'branch_ready_item');
            if (!changed || branch?.lineId !== 'main_group' || branch?.queueBlocked === true) {
                return {
                    success: false,
                    error: `未穿越匯合點的 output 物品不應堵死支線，changed=${changed} branch=${JSON.stringify(branch)} node=${JSON.stringify(node)} winners=${JSON.stringify(state._logisticsMergeAdmissionWinners)}`
                };
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            GameEngine.TILE_SIZE = previousTileSize;
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('合流拓樸變更後被回壓的主線 through 車不得讓支線永久等待', async ({ page }) => {
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
            const node = {
                id: 'merge_waiting_blocked_through',
                outputGroupId: 'main_group',
                inputGroupIds: ['branch_group', 'new_port_group'],
                point: { x: 100, y: 100 },
                currentActiveSlot: 2,
                roundRobinIndex: 2,
                zipperTurn: 'main',
                awaitingMainPass: true
            };
            state.logisticsMergeNodes = [node];
            state.logisticsLines = [{
                id: 'main_seg',
                groupId: 'main_group',
                routePoints: [{ x: 60, y: 100 }, { x: 100, y: 100 }, { x: 180, y: 100 }],
                routeWidth: 1,
                efficiency: 1
            }, {
                id: 'branch_seg',
                groupId: 'branch_group',
                routePoints: [{ x: 100, y: 60 }, { x: 100, y: 100 }],
                routeWidth: 1,
                efficiency: 1
            }, {
                id: 'new_port_seg',
                groupId: 'new_port_group',
                routePoints: [{ x: 60, y: 140 }, { x: 100, y: 100 }],
                routeWidth: 1,
                efficiency: 1
            }];
            state.activeTransfers = [{
                id: 'branch_ready_item',
                lineId: 'branch_group',
                routePoints: [{ x: 100, y: 60 }, { x: 100, y: 100 }],
                progress: 1,
                itemType: 'wood'
            }, {
                id: 'blocked_through_item',
                lineId: 'main_group',
                routePoints: [{ x: 60, y: 100 }, { x: 100, y: 100 }, { x: 180, y: 100 }],
                progress: 0.25,
                itemType: 'wood',
                queueBlocked: true
            }];
            state._logisticsMergeAdmissionWinners = {};
            state._logisticsMergeWaitQueues = {};

            const winnerId = conveyorSystem.getLogisticsMergeAdmissionWinner(node, state, {
                spacing: 20,
                readyDistanceFromEnd: 20
            });
            if (winnerId !== 'branch_ready_item') {
                return {
                    success: false,
                    error: `被回壓的 through 車不應讓支線永久等待，winner=${winnerId} node=${JSON.stringify(node)} winners=${JSON.stringify(state._logisticsMergeAdmissionWinners)} transfers=${JSON.stringify(state.activeTransfers)}`
                };
            }
            if (node.awaitingMainPass === true || node.zipperTurn !== 'branch') {
                return {
                    success: false,
                    error: `沒有可通過 through 車時，支線 winner 必須清除等待主線狀態，node=${JSON.stringify(node)}`
                };
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            GameEngine.TILE_SIZE = previousTileSize;
            GameEngine.state = originalState;
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

test('來源滿載時刪除運輸中物流線必須銷毀產品', async ({ page }) => {
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
                id: 'full_source_building',
                type1: 'warehouse',
                x: 0,
                y: 0,
                storage: { wood: 1 },
                storageCapacity: 1,
                outputBuffer: {},
                outputTargets: [{ id: 'full_target_building', lineId: 'full_delete_group', filter: 'wood' }]
            };
            const target = {
                id: 'full_target_building',
                type1: 'factory',
                x: 100,
                y: 0,
                inputBuffer: {}
            };

            state.mapEntities = [source, target];
            state.destroyedLogisticsTransfers = [];
            state.logisticsMergeNodes = [];
            state.logisticsTurnArrowOverrides = [];
            state.logisticsLines = [{
                id: 'full_delete_segment',
                groupId: 'full_delete_group',
                sourceId: 'full_source_building',
                targetId: 'full_target_building',
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
                id: 'live_item_destroyed_when_full',
                lineId: 'full_delete_group',
                sourceId: 'full_source_building',
                targetId: 'full_target_building',
                itemType: 'wood',
                routePoints: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
                progress: 0.5,
                efficiency: 1
            }];
            state.selectedLogisticsLineId = conveyorSystem.getLogisticsLineSelectionKey(state.logisticsLines[0]);
            state.selectedLogisticsGroupId = 'full_delete_group';

            const deleted = conveyorSystem.deleteLogisticsLineById(state.selectedLogisticsLineId);
            if (!deleted) {
                return { success: false, error: '刪除物流線 API 回傳 false' };
            }

            if (Number(source.storage.wood || 0) !== 1 || Number(source.outputBuffer.wood || 0) !== 0) {
                return {
                    success: false,
                    error: `來源滿載時不應溢出回填，outputBuffer=${JSON.stringify(source.outputBuffer)} storage=${JSON.stringify(source.storage)}`
                };
            }

            if (state.activeTransfers.some(item => item.id === 'live_item_destroyed_when_full')) {
                return { success: false, error: '已銷毀產品不應仍留在 activeTransfers' };
            }

            const destroyed = Array.isArray(state.destroyedLogisticsTransfers)
                ? state.destroyedLogisticsTransfers.find(item => item.transferId === 'live_item_destroyed_when_full')
                : null;
            if (!destroyed || destroyed.reason !== 'source_full') {
                return {
                    success: false,
                    error: `來源滿載時必須留下銷毀紀錄，destroyed=${JSON.stringify(state.destroyedLogisticsTransfers)}`
                };
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

test('WorkerSystem 運輸推進必須以 index/offset 為位置來源', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { WorkerSystem } = await import('/src/systems/WorkerSystem.js');

        const state = {
            mapEntities: [],
            logisticsLines: [{
                id: 'array_line_a',
                groupId: 'array_group',
                routePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
                routeWidth: 1,
                efficiency: 4
            }],
            logisticsMergeNodes: [],
            activeTransfers: [{
                id: 'array_transfer',
                lineId: 'array_group',
                itemType: 'wood',
                routePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
                progress: 0,
                transportIndex: 1,
                transportOffset: 0,
                targetId: null,
                efficiency: 4
            }]
        };
        const engine = {
            TILE_SIZE: 20,
            state,
            getEntityConfig: () => ({ efficiency: 4 }),
            addLog: () => {}
        };

        const workerSystem = new WorkerSystem(state, engine);
        workerSystem.processAutomatedLogistics(state, 0.25);

        const transfer = state.activeTransfers[0];
        if (!transfer) {
            return { success: false, error: '測試 transfer 不應送達或被移除' };
        }
        if (transfer.transportIndex !== 2 || Math.abs(Number(transfer.transportOffset) || 0) > 0.001) {
            return {
                success: false,
                error: `運輸位置必須從 index=1 offset=0 前進到 index=2 offset=0，actual=${JSON.stringify({
                    transportIndex: transfer.transportIndex,
                    transportOffset: transfer.transportOffset,
                    progress: transfer.progress
                })}`
            };
        }
        if (Math.abs(Number(transfer.progress) - 0.4) > 0.001) {
            return {
                success: false,
                error: `progress 應只作為 index/offset 的相容鏡像，expected=0.4 actual=${transfer.progress}`
            };
        }
        return { success: true };
    });

    expect(result.success, result.error).toBe(true);
});

test('物流渲染進度必須優先讀取 index/offset', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { LogisticsRenderer } = await import('/src/renderers/logistics_renderer.js');
        if (typeof LogisticsRenderer.resolveTransferProgress !== 'function') {
            return { success: false, error: 'LogisticsRenderer 缺少 resolveTransferProgress()' };
        }
        const transfer = {
            progress: 0,
            transportIndex: 2,
            transportOffset: 0.5,
            transportCellSize: 20,
            routePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }]
        };
        const progress = LogisticsRenderer.resolveTransferProgress(transfer, transfer.routePoints, 20);
        if (Math.abs(progress - 0.5) > 0.001) {
            return {
                success: false,
                error: `renderer 應以 index/offset 解析進度，expected=0.5 actual=${progress}`
            };
        }
        return { success: true };
    });

    expect(result.success, result.error).toBe(true);
});

test('物流重路由後必須同步 index/offset 位置來源', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { LogisticsTransferRerouter } = await import('/src/systems/logistics/LogisticsTransferRerouter.js');
        const { logisticsTransportArrayState } = await import('/src/systems/logistics/LogisticsTransportArrayState.js');

        const uiBackup = window.UIManager;
        try {
            window.UIManager = {
                ...(window.UIManager || {}),
                getEntityId: (entity) => entity?.id || null,
                getBuildingPortSlots: () => [],
                resolveCurrentPortSlot: () => null,
                getNearestPortSlot: () => null
            };

            const state = {
                mapEntities: [],
                logisticsLines: [{
                    id: 'reroute_line',
                    groupId: 'reroute_group',
                    routePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
                    routeWidth: 1,
                    efficiency: 4
                }],
                logisticsMergeNodes: [],
                activeTransfers: [{
                    id: 'reroute_transfer',
                    lineId: 'reroute_group',
                    itemType: 'wood',
                    routePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
                    progress: 0.5,
                    transportIndex: 9,
                    transportOffset: 0,
                    transportCellSize: 20,
                    transportRouteKey: '0,0|100,0'
                }]
            };
            const system = {
                snapPointToGridCenter: (point) => ({
                    x: Math.round(point.x / 20) * 20,
                    y: Math.round(point.y / 20) * 20
                }),
                orderLogisticsSegmentsByDirection: (segments) => segments,
                applyLogisticsMergeNodes: () => false,
                applyBlockedTransferQueues: () => {},
                undoStore: { returnTransferToSource: () => false }
            };
            const rerouter = new LogisticsTransferRerouter(system, () => ({ TILE_SIZE: 20 }));

            rerouter.updateOnLogisticsChange(state, new Set(['reroute_group']));

            const transfer = state.activeTransfers[0];
            const expectedRouteKey = logisticsTransportArrayState.getRouteKey(transfer.routePoints);
            if (transfer.transportRouteKey !== expectedRouteKey) {
                return {
                    success: false,
                    error: `重路由後 transportRouteKey 未同步，actual=${transfer.transportRouteKey} expected=${expectedRouteKey}`
                };
            }
            const distance = logisticsTransportArrayState.getTransferDistance(transfer, 200, 20);
            if (Math.abs(distance - 50) > 0.001 || Math.abs(transfer.progress - 0.25) > 0.001) {
                return {
                    success: false,
                    error: `重路由後應保留投影位置 50px，actual=${JSON.stringify({
                        distance,
                        progress: transfer.progress,
                        transportIndex: transfer.transportIndex,
                        transportOffset: transfer.transportOffset
                    })}`
                };
            }

            return { success: true };
        } finally {
            window.UIManager = uiBackup;
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('匯合拓樸變更時不得沿用舊排程等待狀態', async ({ page }) => {
    test.setTimeout(45000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { LogisticsMergeNodeStore } = await import('/src/systems/logistics/LogisticsMergeNodeStore.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const originalState = GameEngine.state;
        try {
            const state = {
                logisticsMergeNodes: [{
                    id: 'merge_100,100_output_group',
                    nodeId: 'merge_100,100_output_group',
                    type: 'logistics_merge',
                    cellKey: '100,100',
                    x: 100,
                    y: 100,
                    point: { x: 100, y: 100 },
                    inputGroupIds: ['old_input'],
                    outputGroupId: 'output_group',
                    currentActiveSlot: 1,
                    roundRobinIndex: 1,
                    zipperTurn: 'main',
                    awaitingMainPass: true,
                    lastAdmittedTransferId: 'stale_transfer',
                    currentOccupant: {
                        transferId: 'stale_transfer',
                        inputGroupId: 'old_input',
                        outputGroupId: 'output_group'
                    },
                    incomingQueues: { old_input: ['stale_transfer'] },
                    inputDirections: {}
                }],
                _logisticsMergeAdmissionWinners: {
                    'output_group:100,100': {
                        signature: 'stale_transfer',
                        winnerId: 'stale_transfer',
                        committed: false
                    }
                },
                _logisticsMergeWaitQueues: {
                    'output_group:100,100': {
                        queue: ['stale_transfer'],
                        incomingQueues: { old_input: ['stale_transfer'] },
                        lastServed: 'old_input',
                        currentOccupant: {
                            transferId: 'stale_transfer',
                            inputGroupId: 'old_input',
                            outputGroupId: 'output_group'
                        }
                    }
                },
                logisticsLines: [
                    { id: 'old_input_line', groupId: 'old_input', routePoints: [{ x: 60, y: 100 }, { x: 100, y: 100 }] },
                    { id: 'new_input_line', groupId: 'new_input', routePoints: [{ x: 100, y: 60 }, { x: 100, y: 100 }] },
                    { id: 'output_line', groupId: 'output_group', routePoints: [{ x: 100, y: 100 }, { x: 160, y: 100 }] }
                ]
            };
            GameEngine.state = state;

            const system = {
                ensureLogisticsMergeNodeStore: () => state.logisticsMergeNodes,
                snapPointToGridCenter: (point) => ({ x: Math.round(point.x / 20) * 20, y: Math.round(point.y / 20) * 20 }),
                getLogisticsLinesForState: () => state.logisticsLines,
                getLogisticsSegmentsByGroupId: (groupId) => state.logisticsLines.filter(line => line.groupId === groupId || line.id === groupId),
                orderLogisticsSegmentsByDirection: (segments) => segments,
                isPointOnSegment: (point, start, end, tolerance = 0.1) => {
                    const dx = end.x - start.x;
                    const dy = end.y - start.y;
                    const lenSq = dx * dx + dy * dy;
                    if (lenSq <= 0) return Math.hypot(point.x - start.x, point.y - start.y) <= tolerance;
                    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq));
                    const proj = { x: start.x + dx * t, y: start.y + dy * t };
                    return Math.hypot(point.x - proj.x, point.y - proj.y) <= tolerance;
                },
                recalculateLogisticsGroupEndpoints: () => {},
                getLogisticsLineDirectionAtPoint: () => ({ x: 1, y: 0 }),
                clearSuppressedLogisticsConnectionCell: () => {},
                reassignDeletedGapContinuationToMergeInput: () => false
            };
            const store = new LogisticsMergeNodeStore(system);

            const node = store.registerLogisticsMergeNode({
                inputGroupId: 'new_input',
                outputGroupId: 'output_group',
                point: { x: 100, y: 100 },
                inputLine: state.logisticsLines[1],
                outputLine: state.logisticsLines[2]
            });

            if (!node) return { success: false, error: '測試 merge node 未建立' };
            const staleAdmission = state._logisticsMergeAdmissionWinners?.['output_group:100,100'];
            const staleQueue = state._logisticsMergeWaitQueues?.['output_group:100,100'];
            if (node.awaitingMainPass === true || node.currentOccupant || node.lastAdmittedTransferId || node.incomingQueues?.old_input || staleAdmission || staleQueue) {
                return {
                    success: false,
                    error: `拓樸變更後不應沿用舊排程等待狀態：${JSON.stringify({
                        inputGroupIds: node.inputGroupIds,
                        currentActiveSlot: node.currentActiveSlot,
                        awaitingMainPass: node.awaitingMainPass,
                        currentOccupant: node.currentOccupant,
                        lastAdmittedTransferId: node.lastAdmittedTransferId,
                        incomingQueues: node.incomingQueues,
                        staleAdmission,
                        staleQueue
                    })}`
                };
            }

            return { success: true };
        } finally {
            GameEngine.state = originalState;
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

test('拖曳延伸跨越其他物流線時應建立斷開線段且不註冊合流', async ({ page }) => {
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
            Math.random = () => 0.2468;
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
            const source = {
                id: 'drag_extension_source',
                type1: 'warehouse',
                x: 10,
                y: 10,
                outputTargets: []
            };
            const sourceLine = {
                id: 'drag_source_seg',
                groupId: 'drag_source_group',
                sourceId: 'drag_extension_source',
                x: 20,
                y: 10,
                gridX: 2,
                gridY: 1,
                routePoints: [{ x: 10, y: 10 }, { x: 30, y: 10 }],
                routeWidth: 1,
                order: 0,
                efficiency: 1
            };
            const crossedLine = {
                id: 'drag_crossed_seg',
                groupId: 'drag_crossed_group',
                sourceId: 'other_source',
                x: 50,
                y: 10,
                gridX: 5,
                gridY: 1,
                routePoints: [{ x: 50, y: -10 }, { x: 50, y: 30 }],
                routeWidth: 1,
                order: 0,
                efficiency: 1
            };
            const sourcePort = { x: 30, y: 10, dir: 'right', width: 1, sourceType: 'logistics_line' };

            state.mapEntities = [source];
            state.logisticsLines = [sourceLine, crossedLine];
            state.logisticsMergeNodes = [];
            state.logisticsTurnArrowOverrides = [];
            state.activeTransfers = [];

            if (window.UIManager) {
                window.UIManager.resolveCurrentPortSlot = () => sourcePort;
            }
            conveyorSystem.resolveDragTarget = (x, y) => {
                conveyorSystem.activeDrag.targetBuilding = null;
                conveyorSystem.activeDrag.targetPort = null;
                return { x, y, building: null, port: null };
            };

            conveyorSystem.startDrag(sourcePort.x, sourcePort.y, source, sourcePort, sourceLine);
            conveyorSystem.updateDragNow(90, 10);
            if (!GameEngine.state.conveyorValid) {
                return {
                    success: false,
                    error: `延伸 preview 應允許跨越後交給 placement 切段，ghosts=${JSON.stringify(GameEngine.state.conveyorGhosts)}`
                };
            }

            conveyorSystem.submitDrag();

            const crossedSegments = state.logisticsLines.filter(line => line.id === 'drag_crossed_seg');
            if (crossedSegments.length !== 1 || crossedSegments[0].groupId !== 'drag_crossed_group') {
                return {
                    success: false,
                    error: `被跨越線不應被合併或改寫：${JSON.stringify(crossedSegments)}`
                };
            }
            const sourceSegments = state.logisticsLines.filter(line => line.groupId === 'drag_source_group');
            const newSegments = sourceSegments.filter(line => line.id !== 'drag_source_seg');
            if (newSegments.length === 0) {
                return {
                    success: false,
                    error: `跨越他線時不應取消整次延伸，lines=${JSON.stringify(state.logisticsLines)}`
                };
            }
            if (newSegments.some(line => (line.routePoints || []).some(point => Math.round(point.x) === 50 && Math.round(point.y) === 10))) {
                return {
                    success: false,
                    error: `新線段不應佔用被跨越線交會格：${JSON.stringify(newSegments)}`
                };
            }
            if ((state.logisticsMergeNodes || []).some(node =>
                node.inputGroupId === 'drag_source_group' || node.outputGroupId === 'drag_crossed_group'
            )) {
                return {
                    success: false,
                    error: `中途跨越不應註冊合流節點：${JSON.stringify(state.logisticsMergeNodes)}`
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

test('拖曳延伸接到同向物流線端點時必須合併群組', async ({ page }) => {
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
            Math.random = () => 0.1357;
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

            const source = {
                id: 'merge_endpoint_source',
                type1: 'warehouse',
                x: 10,
                y: 10,
                outputTargets: []
            };
            const sourceLine = {
                id: 'merge_source_seg',
                groupId: 'merge_source_group',
                sourceId: 'merge_endpoint_source',
                x: 20,
                y: 10,
                routePoints: [{ x: 10, y: 10 }, { x: 30, y: 10 }],
                routeWidth: 1,
                order: 0,
                efficiency: 1
            };
            const targetLine = {
                id: 'merge_target_seg',
                groupId: 'merge_target_group',
                sourceId: 'other_source',
                x: 80,
                y: 10,
                routePoints: [{ x: 70, y: 10 }, { x: 90, y: 10 }],
                routeWidth: 1,
                order: 0,
                efficiency: 1
            };
            const sourcePort = { x: 30, y: 10, dir: 'right', width: 1, sourceType: 'logistics_line' };

            state.mapEntities = [source];
            state.logisticsLines = [sourceLine, targetLine];
            state.logisticsMergeNodes = [];
            state.logisticsTurnArrowOverrides = [];
            state.activeTransfers = [];
            if (window.UIManager) {
                window.UIManager.resolveCurrentPortSlot = () => sourcePort;
            }
            conveyorSystem.resolveDragTarget = (x, y) => {
                conveyorSystem.activeDrag.targetBuilding = null;
                conveyorSystem.activeDrag.targetPort = null;
                return { x, y, building: null, port: null };
            };

            conveyorSystem.startDrag(sourcePort.x, sourcePort.y, source, sourcePort, sourceLine);
            conveyorSystem.updateDragNow(70, 10);
            if (!GameEngine.state.conveyorValid) {
                return {
                    success: false,
                    error: `合法端點合併 preview 應為 valid，ghosts=${JSON.stringify(GameEngine.state.conveyorGhosts)}`
                };
            }

            conveyorSystem.submitDrag();

            const sourceGroups = new Set(state.logisticsLines.map(line => line.groupId || line.id));
            if (sourceGroups.has('merge_target_group')) {
                return {
                    success: false,
                    error: `目標群組未被併入來源群組：groups=${JSON.stringify([...sourceGroups])} lines=${JSON.stringify(state.logisticsLines)}`
                };
            }
            const mergedSegments = state.logisticsLines.filter(line => (line.groupId || line.id) === 'merge_source_group');
            if (mergedSegments.length < 3) {
                return {
                    success: false,
                    error: `合併後來源群組應包含來源、新建、目標段：${JSON.stringify(mergedSegments)}`
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

test('拖曳支線接到主線中段時必須註冊合流節點', async ({ page }) => {
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
            Math.random = () => 0.9753;
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

            const source = {
                id: 'merge_branch_source',
                type1: 'warehouse',
                x: 90,
                y: 50,
                outputTargets: []
            };
            const branchLine = {
                id: 'merge_branch_seg',
                groupId: 'merge_branch_group',
                sourceId: 'merge_branch_source',
                x: 90,
                y: 40,
                routePoints: [{ x: 90, y: 50 }, { x: 90, y: 30 }],
                routeWidth: 1,
                order: 0,
                efficiency: 1
            };
            const mainLine = {
                id: 'merge_main_seg',
                groupId: 'merge_main_group',
                sourceId: 'main_source',
                targetId: 'main_target',
                x: 90,
                y: 10,
                routePoints: [{ x: 70, y: 10 }, { x: 110, y: 10 }],
                routeWidth: 1,
                order: 0,
                efficiency: 1
            };
            const sourcePort = { x: 90, y: 30, dir: 'up', width: 1, sourceType: 'logistics_line' };

            state.mapEntities = [source];
            state.logisticsLines = [branchLine, mainLine];
            state.logisticsMergeNodes = [];
            state.logisticsTurnArrowOverrides = [];
            state.activeTransfers = [];
            if (window.UIManager) {
                window.UIManager.resolveCurrentPortSlot = () => sourcePort;
            }
            conveyorSystem.resolveDragTarget = (x, y) => {
                conveyorSystem.activeDrag.targetBuilding = null;
                conveyorSystem.activeDrag.targetPort = null;
                return { x, y, building: null, port: null };
            };

            conveyorSystem.startDrag(sourcePort.x, sourcePort.y, source, sourcePort, branchLine);
            conveyorSystem.updateDragNow(90, 10);
            if (!GameEngine.state.conveyorValid) {
                return {
                    success: false,
                    error: `支線接主線 preview 應為 valid，ghosts=${JSON.stringify(GameEngine.state.conveyorGhosts)}`
                };
            }

            conveyorSystem.submitDrag();

            const node = (state.logisticsMergeNodes || []).find(item =>
                item.inputGroupIds?.includes('merge_branch_group') &&
                item.outputGroupId === 'merge_main_group'
            );
            if (!node) {
                return {
                    success: false,
                    error: `支線接主線中段應註冊合流節點，nodes=${JSON.stringify(state.logisticsMergeNodes)} lines=${JSON.stringify(state.logisticsLines)}`
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

test('建築端口直接拉到既有物流線時必須建立連接並註冊合流', async ({ page }) => {
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
            Math.random = () => 0.8642;
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

            const source = {
                id: 'port_direct_source',
                type1: 'warehouse',
                x: 90,
                y: 50,
                outputTargets: []
            };
            const mainLine = {
                id: 'port_direct_main_seg',
                groupId: 'port_direct_main_group',
                sourceId: 'main_source',
                targetId: 'main_target',
                x: 90,
                y: 10,
                routePoints: [{ x: 70, y: 10 }, { x: 110, y: 10 }],
                routeWidth: 1,
                order: 0,
                efficiency: 1
            };
            const sourcePort = { x: 90, y: 50, dir: 'up', width: 1 };

            state.mapEntities = [source];
            state.logisticsLines = [mainLine];
            state.logisticsMergeNodes = [];
            state.logisticsTurnArrowOverrides = [];
            state.activeTransfers = [];
            if (window.UIManager) {
                window.UIManager.resolveCurrentPortSlot = () => sourcePort;
            }
            conveyorSystem.resolveDragTarget = (x, y) => {
                conveyorSystem.activeDrag.targetBuilding = null;
                conveyorSystem.activeDrag.targetPort = null;
                return { x, y, building: null, port: null };
            };

            conveyorSystem.startDrag(sourcePort.x, sourcePort.y, source, sourcePort, null);
            conveyorSystem.updateDragNow(90, 10);
            if (!GameEngine.state.conveyorValid) {
                return {
                    success: false,
                    error: `端口直拉接既有線 preview 應為 valid，ghosts=${JSON.stringify(GameEngine.state.conveyorGhosts)}`
                };
            }

            conveyorSystem.submitDrag();

            const newLines = state.logisticsLines.filter(line => (line.groupId || line.id) !== 'port_direct_main_group');
            if (newLines.length === 0) {
                return {
                    success: false,
                    error: `端口直拉接既有線不應取消建造，lines=${JSON.stringify(state.logisticsLines)}`
                };
            }
            const node = (state.logisticsMergeNodes || []).find(item =>
                item.outputGroupId === 'port_direct_main_group'
            );
            if (!node) {
                return {
                    success: false,
                    error: `端口直拉接既有線應註冊合流，nodes=${JSON.stringify(state.logisticsMergeNodes)} lines=${JSON.stringify(state.logisticsLines)}`
                };
            }
            const sourceConn = (source.outputTargets || []).find(item => item && item.lineId === newLines[0]?.groupId);
            if (!sourceConn) {
                return {
                    success: false,
                    error: `端口直拉接既有線後來源建築應建立 outputTargets 連線，source=${JSON.stringify(source)} newLines=${JSON.stringify(newLines)}`
                };
            }
            const connLast = sourceConn.routePoints?.[sourceConn.routePoints.length - 1] || null;
            if (!connLast || Math.hypot(connLast.x - 90, connLast.y - 10) > 0.1) {
                return {
                    success: false,
                    error: `來源 outputTargets 路徑應止於合流點，conn=${JSON.stringify(sourceConn)}`
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
