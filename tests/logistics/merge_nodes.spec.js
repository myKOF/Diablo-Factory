const { test, expect } = require('@playwright/test');

test('物流合流點與公平輪詢機制測試', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsMergeNodeRuntime } = await import('/src/systems/logistics/LogisticsMergeNodeRuntime.js');
        const { LogisticsTransferQueues } = await import('/src/systems/logistics/LogisticsTransferQueues.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));

        function makeTransfer(id, lineId, progress) {
            return {
                id,
                lineId,
                routePoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
                progress,
                sourceId: `${lineId}_source`,
                targetId: null
            };
        }

        function createHarness(activeTransfers, nodeOverrides = {}) {
            const node = {
                id: 'three_input_round_robin_merge',
                outputGroupId: 'output_group',
                inputGroupIds: ['line_a', 'line_b', 'line_c'],
                point: { x: 100, y: 0 },
                currentActiveSlot: 0,
                roundRobinIndex: 0,
                ...nodeOverrides
            };
            const testState = {
                logisticsMergeNodes: [node],
                activeTransfers
            };
            const outputRoute = [{ x: 100, y: 0 }, { x: 200, y: 0 }];
            const system = {
                ensureLogisticsMergeNodeStore: () => testState.logisticsMergeNodes,
                getLogisticsMergeNodeForInputTransfer: (transfer) => {
                    return node.inputGroupIds.includes(transfer.lineId) ? node : null;
                },
                getLogisticsMergeNodeOutputRoute: () => outputRoute,
                getLogisticsSegmentsByGroupId: () => [{ sourceId: 'merge_output', targetId: 'target', efficiency: 4 }]
            };
            const runtime = new LogisticsMergeNodeRuntime(system, () => ({ TILE_SIZE: 20, state: testState }));
            const queues = new LogisticsTransferQueues({
                ...system,
                getLogisticsMergeAdmissionWinner: (...args) => runtime.getLogisticsMergeAdmissionWinner(...args),
                isLogisticsMergeInputTransfer: (transfer) => !!system.getLogisticsMergeNodeForInputTransfer(transfer),
                getLogisticsMergeThroughYieldLimit: (...args) => runtime.getMergeThroughYieldLimit(...args)
            }, () => ({ TILE_SIZE: 20, state: testState }));
            return { node, state: testState, runtime, queues };
        }

        // Test 1: Round Robin Inputs
        const strictOrder = createHarness([
            makeTransfer('a_waiting_one_cell_before_merge', 'line_a', 0.82),
            makeTransfer('b_already_at_merge_gate', 'line_b', 1),
            makeTransfer('c_already_at_merge_gate', 'line_c', 1)
        ]);

        let winnerId = strictOrder.runtime.getLogisticsMergeAdmissionWinner(strictOrder.node, strictOrder.state, {
            spacing: 20,
            readyDistanceFromEnd: 20
        });

        if (winnerId !== 'a_waiting_one_cell_before_merge') {
            return { success: false, error: `三入口合流必須依 currentActiveSlot 輪到 A，實際 winner=${winnerId}` };
        }

        // Test 2: Basic Registration
        state.logisticsLines = [
            {
                id: 'a0',
                groupId: 'gA',
                sourceId: 'source_a',
                targetId: null,
                routePoints: [{ x: 30, y: 30 }, { x: 50, y: 30 }],
                routeWidth: 1,
                order: 0,
                efficiency: 1
            },
            {
                id: 'b0',
                groupId: 'gB',
                sourceId: 'source_b',
                targetId: 'target_b',
                routePoints: [{ x: 50, y: 30 }, { x: 70, y: 30 }],
                routeWidth: 1,
                order: 0,
                efficiency: 1
            }
        ];

        const node = conveyorSystem.registerLogisticsMergeNode({
            inputGroupId: 'gA',
            outputGroupId: 'gB',
            point: { x: 50, y: 30 }
        });

        if (!node || !node.inputGroupIds.includes('gA') || node.outputGroupId !== 'gB') {
            return { success: false, error: 'Failed to register valid merge node' };
        }

        // 還原狀態
        GameEngine.state = originalState;
        return { success: true };
    });

    expect(result.success).toBe(true);
});

test('主線中段接入切分後 output 後段必須保留終點 metadata', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { GameEngine } = await import('/src/systems/game_systems.js');
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');

        const originalState = JSON.parse(JSON.stringify(GameEngine.state));
        try {
            GameEngine.TILE_SIZE = 20;
            GameEngine.state.mapEntities = [];
            GameEngine.state.logisticsLines = [
                {
                    id: 'branch_segment',
                    groupId: 'branch_group',
                    sourceId: 'branch_source',
                    targetId: null,
                    sourcePort: { x: 90, y: 50, dir: 'up', width: 1 },
                    routePoints: [{ x: 90, y: 50 }, { x: 90, y: 30 }],
                    routeWidth: 1,
                    order: 0,
                    efficiency: 1
                },
                {
                    id: 'main_segment',
                    groupId: 'main_group',
                    sourceId: 'main_source',
                    targetId: 'main_target',
                    sourcePort: { x: 50, y: 30, dir: 'right', width: 1 },
                    targetPort: { x: 150, y: 30, dir: 'left', width: 1 },
                    routePoints: [{ x: 50, y: 30 }, { x: 90, y: 30 }, { x: 150, y: 30 }],
                    routeWidth: 1,
                    order: 0,
                    efficiency: 1,
                    filter: 'wood'
                }
            ];
            GameEngine.state.logisticsMergeNodes = [];

            const node = conveyorSystem.registerLogisticsMergeNode({
                inputGroupId: 'branch_group',
                outputGroupId: 'main_group',
                point: { x: 90, y: 30 }
            });

            if (!node) {
                return { success: false, error: '應建立中段合流節點' };
            }

            const outputSegments = GameEngine.state.logisticsLines.filter(line =>
                line && (line.groupId === node.outputGroupId || line.id === node.outputGroupId)
            );
            const targetSeg = outputSegments.find(line => line.targetId === 'main_target');
            if (!targetSeg) {
                return {
                    success: false,
                    error: `output 後段缺少原終點 metadata，node=${JSON.stringify(node)} lines=${JSON.stringify(GameEngine.state.logisticsLines)}`
                };
            }
            if (!targetSeg.targetPort || targetSeg.targetPort.x !== 150 || targetSeg.targetPort.y !== 30) {
                return {
                    success: false,
                    error: `output 後段 targetPort 未保留：${JSON.stringify(targetSeg)}`
                };
            }
            if (targetSeg.filter !== 'wood') {
                return {
                    success: false,
                    error: `output 後段 filter 未保留：${JSON.stringify(targetSeg)}`
                };
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('主線下游在途物品於中段接入後必須重路由到新 output group', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { GameEngine } = await import('/src/systems/game_systems.js');
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));

        try {
            GameEngine.TILE_SIZE = 20;
            state.mapEntities = [];
            const branchLine = {
                id: 'branch_segment_live',
                groupId: 'branch_live_group',
                sourceId: 'branch_source',
                targetId: null,
                routePoints: [{ x: 90, y: 50 }, { x: 90, y: 10 }],
                routeWidth: 1,
                order: 0,
                efficiency: 1
            };
            const mainLine = {
                id: 'main_segment_live',
                groupId: 'main_live_group',
                sourceId: 'main_source',
                targetId: 'main_target',
                sourcePort: { x: 50, y: 10, dir: 'right', width: 1 },
                targetPort: { x: 150, y: 10, dir: 'left', width: 1 },
                x: 90,
                y: 10,
                routePoints: [{ x: 50, y: 10 }, { x: 90, y: 10 }, { x: 150, y: 10 }],
                routeWidth: 1,
                order: 0,
                efficiency: 1,
                filter: 'wood'
            };

            state.logisticsLines = [branchLine, mainLine];
            state.logisticsMergeNodes = [];
            state.logisticsTurnArrowOverrides = [];
            state.activeTransfers = [{
                id: 'live_item_downstream',
                lineId: 'main_live_group',
                routePoints: mainLine.routePoints.map(point => ({ ...point })),
                progress: 0.8,
                sourceId: 'main_source',
                targetId: 'main_target',
                targetPort: { x: 150, y: 10, dir: 'left', width: 1 },
                itemType: 'wood',
                efficiency: 1
            }];

            const node = conveyorSystem.registerLogisticsMergeNode({
                inputGroupId: 'branch_live_group',
                outputGroupId: 'main_live_group',
                point: { x: 90, y: 10 },
                inputLine: branchLine,
                outputLine: mainLine
            });

            conveyorSystem.updateActiveTransfersOnLogisticsChange(
                state,
                new Set(['branch_live_group', 'main_live_group', node?.outputGroupId].filter(Boolean))
            );

            const transfer = state.activeTransfers.find(item => item.id === 'live_item_downstream');
            if (!node) {
                return {
                    success: false,
                    error: `應切出新 output group，nodes=${JSON.stringify(state.logisticsMergeNodes)}`
                };
            }
            if (!transfer) {
                return { success: false, error: '下游在途物品不應在重路由時被清除' };
            }
            if (transfer.lineId !== node.outputGroupId) {
                return {
                    success: false,
                    error: `下游物品應重路由到新 output group，transfer=${JSON.stringify(transfer)} node=${JSON.stringify(node)} lines=${JSON.stringify(state.logisticsLines)}`
                };
            }
            if (transfer.targetId !== 'main_target') {
                return {
                    success: false,
                    error: `下游物品應保留 targetId，transfer=${JSON.stringify(transfer)}`
                };
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
});

test('支線物品切入多段 output group 後必須保留下游終點', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { GameEngine } = await import('/src/systems/game_systems.js');
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));

        try {
            GameEngine.TILE_SIZE = 20;
            state.logisticsLines = [{
                id: 'output_head_without_target',
                groupId: 'output_multi',
                sourceId: null,
                targetId: null,
                routePoints: [{ x: 100, y: 100 }, { x: 140, y: 100 }],
                routeWidth: 1,
                order: 0,
                efficiency: 4
            }, {
                id: 'output_tail_with_target',
                groupId: 'output_multi',
                sourceId: null,
                targetId: 'target_building',
                targetPort: { x: 180, y: 100, dir: 'left', width: 1 },
                routePoints: [{ x: 140, y: 100 }, { x: 180, y: 100 }],
                routeWidth: 1,
                order: 1,
                efficiency: 4
            }, {
                id: 'branch_input',
                groupId: 'branch_input',
                sourceId: 'branch_source',
                targetId: null,
                routePoints: [{ x: 100, y: 60 }, { x: 100, y: 100 }],
                routeWidth: 1,
                order: 0,
                efficiency: 4
            }];
            state.logisticsMergeNodes = [{
                id: 'merge_multi_output',
                outputGroupId: 'output_multi',
                inputGroupIds: ['branch_input'],
                point: { x: 100, y: 100 },
                currentActiveSlot: 0,
                roundRobinIndex: 0
            }];
            state.activeTransfers = [{
                id: 'branch_item',
                lineId: 'branch_input',
                routePoints: [{ x: 100, y: 60 }, { x: 100, y: 100 }],
                progress: 1,
                sourceId: 'branch_source',
                targetId: null,
                itemType: 'wood',
                efficiency: 4
            }];

            const changed = conveyorSystem.applyLogisticsMergeNodes(state);
            const transfer = state.activeTransfers[0];
            if (!changed || transfer.lineId !== 'output_multi') {
                return {
                    success: false,
                    error: `支線物品應切入 output group，changed=${changed} transfer=${JSON.stringify(transfer)}`
                };
            }
            if (transfer.targetId !== 'target_building') {
                return {
                    success: false,
                    error: `切入 output 後必須保留下游 targetId，transfer=${JSON.stringify(transfer)} lines=${JSON.stringify(state.logisticsLines)}`
                };
            }
            if (!transfer.targetPort || transfer.targetPort.x !== 180 || transfer.targetPort.y !== 100) {
                return {
                    success: false,
                    error: `切入 output 後必須保留下游 targetPort，transfer=${JSON.stringify(transfer)}`
                };
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
});
