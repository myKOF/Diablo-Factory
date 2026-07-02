const { test, expect } = require('@playwright/test');

async function loadGame(page) {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 30000 });
}

// 大型建築有多個 input 端口:物品路線末端停在「另一個合法端口」(route-end 在有效端口卻 ≠ targetPoint,
// 例如改拉線後 targetPoint 殘留指向舊端口)時,必須仍判定抵達入庫,否則堵在終點擋住後車。
// 反面:route-end 落在「非端口的斷點」時不得誤判抵達(保有斷線防護)。
test('多端口建築:route-end 落在任一 input 端口即入庫;落在斷點則不入庫', async ({ page }) => {
    test.setTimeout(60000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { LogisticsTransferSystem } = await import('/src/systems/logistics/LogisticsTransferSystem.js?v=' + Date.now());
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const prevTile = GameEngine.TILE_SIZE;
        const prevPortSlots = window.UIManager?.getBuildingPortSlots;
        const prevGetId = window.UIManager?.getEntityId;

        try {
            GameEngine.TILE_SIZE = 20;
            // village 有兩個 input 端口:(950,640) 與 (990,640)
            const village = { id: 'core_village', type1: 'village', x: 970, y: 620, storage: {},
                portSlots: [{ x: 950, y: 640, dir: 'left', width: 1 }, { x: 990, y: 640, dir: 'down', width: 1 }] };
            if (window.UIManager) {
                window.UIManager.getBuildingPortSlots = (ent) => Array.isArray(ent?.portSlots) ? ent.portSlots : [];
                window.UIManager.getEntityId = (ent) => ent?.id || null;
            }
            state.mapEntities = [village];
            state.logisticsLines = [];
            state.logisticsMergeNodes = [];

            const sys = new LogisticsTransferSystem(state, GameEngine);

            const mk = (id, endPt) => ({
                id, lineId: 'L', itemType: 'wood', sourceId: 'src', targetId: 'core_village',
                progress: 1, routePoints: [{ x: 950, y: 800 }, endPt],
                // targetPoint 殘留指向「另一個」端口 (990,640)
                targetPoint: { x: 990, y: 640 }
            });
            // A:route-end 落在合法端口 (950,640) → 應入庫
            // B:route-end 落在斷點 (950,700)(非任何端口)→ 不應入庫
            state.activeTransfers = [mk('atPort', { x: 950, y: 640 }), mk('atBreak', { x: 950, y: 700 })];

            const arrivals = sys.collectTargetPortArrivals(state, []);
            const arrivedIds = arrivals.map(a => a.id);
            const remainingIds = state.activeTransfers.map(t => t.id);

            return {
                success: true,
                arrivedIds,
                remainingIds,
                villageStorage: village.storage.wood || 0
            };
        } catch (error) {
            return { success: false, error: error.message + '\n' + error.stack };
        } finally {
            GameEngine.TILE_SIZE = prevTile;
            if (window.UIManager && prevPortSlots) window.UIManager.getBuildingPortSlots = prevPortSlots;
            if (window.UIManager && prevGetId) window.UIManager.getEntityId = prevGetId;
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
    // 落在合法端口的 atPort 被判定抵達(移出 activeTransfers)
    expect(result.arrivedIds, `route-end 在合法端口卻未入庫:${JSON.stringify(result)}`).toContain('atPort');
    // 落在斷點的 atBreak 不得被判定抵達(保有斷線防護)
    expect(result.arrivedIds, `route-end 在斷點卻誤判入庫:${JSON.stringify(result)}`).not.toContain('atBreak');
    expect(result.remainingIds).toContain('atBreak');
});

test('終點端口前一格被 maxAllowed 卡住時仍應視為抵達入庫', async ({ page }) => {
    test.setTimeout(60000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { LogisticsTransferSystem } = await import('/src/systems/logistics/LogisticsTransferSystem.js?v=' + Date.now());
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const prevTile = GameEngine.TILE_SIZE;
        const prevPortSlots = window.UIManager?.getBuildingPortSlots;
        const prevGetId = window.UIManager?.getEntityId;

        try {
            GameEngine.TILE_SIZE = 20;
            const village = {
                id: 'core_village', type1: 'village', x: 970, y: 620, storage: {},
                portSlots: [{ x: 950, y: 640, dir: 'up', width: 1 }]
            };
            if (window.UIManager) {
                window.UIManager.getBuildingPortSlots = (ent) => Array.isArray(ent?.portSlots) ? ent.portSlots : [];
                window.UIManager.getEntityId = (ent) => ent?.id || null;
            }
            state.mapEntities = [village];
            state.logisticsLines = [];
            state.logisticsMergeNodes = [];

            const sys = new LogisticsTransferSystem(state, GameEngine);
            state.activeTransfers = [
                {
                    id: 'heldBeforePort',
                    lineId: 'L',
                    itemType: 'wood',
                    sourceId: 'core_storehouse',
                    targetId: 'core_village',
                    progress: 0.9772727272727273,
                    maxAllowedProgress: 0.9772727272727273,
                    queueBlocked: false,
                    routePoints: [{ x: 950, y: 1520 }, { x: 950, y: 640 }],
                    targetPoint: { x: 950, y: 640 }
                }
            ];

            const arrivals = sys.collectTargetPortArrivals(state, []);
            return {
                success: true,
                arrivedIds: arrivals.map(a => a.id),
                remainingIds: state.activeTransfers.map(t => t.id)
            };
        } catch (error) {
            return { success: false, error: error.message + '\n' + error.stack };
        } finally {
            GameEngine.TILE_SIZE = prevTile;
            if (window.UIManager && prevPortSlots) window.UIManager.getBuildingPortSlots = prevPortSlots;
            if (window.UIManager && prevGetId) window.UIManager.getEntityId = prevGetId;
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
    expect(result.arrivedIds, `終點前一格卡住未入庫:${JSON.stringify(result)}`).toContain('heldBeforePort');
    expect(result.remainingIds).not.toContain('heldBeforePort');
});

test('worker 模式下主執行緒補判入庫後必須立即通知 worker 移除同一物品', async ({ page }) => {
    test.setTimeout(60000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { LogisticsTransferSystem } = await import('/src/systems/logistics/LogisticsTransferSystem.js?v=' + Date.now());
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const prevTile = GameEngine.TILE_SIZE;
        const prevPortSlots = window.UIManager?.getBuildingPortSlots;
        const prevGetId = window.UIManager?.getEntityId;
        const prevWorkerFlag = window.LOGISTICS_WORKER;

        try {
            GameEngine.TILE_SIZE = 20;
            window.LOGISTICS_WORKER = true;
            const village = {
                id: 'core_village', type1: 'village', x: 970, y: 620, storage: {},
                portSlots: [{ x: 950, y: 640, dir: 'up', width: 1 }]
            };
            if (window.UIManager) {
                window.UIManager.getBuildingPortSlots = (ent) => Array.isArray(ent?.portSlots) ? ent.portSlots : [];
                window.UIManager.getEntityId = (ent) => ent?.id || null;
            }
            state.mapEntities = [village];
            state.logisticsLines = [];
            state.logisticsMergeNodes = [];
            state.resources = {};
            state.activeTransfers = [
                {
                    id: 'heldBeforePort',
                    lineId: 'L',
                    itemType: 'wood',
                    sourceId: 'core_storehouse',
                    targetId: 'core_village',
                    progress: 0.9772727272727273,
                    maxAllowedProgress: 0.9772727272727273,
                    routePoints: [{ x: 950, y: 1520 }, { x: 950, y: 640 }],
                    targetPoint: { x: 950, y: 640 }
                }
            ];

            const removedIds = [];
            const sys = new LogisticsTransferSystem(state, GameEngine);
            sys._workerBridge = {
                pullResult: () => [],
                pushStep: () => {},
                getPositionLagSeconds: () => 0,
                removeTransfers: (ids) => removedIds.push(...ids)
            };

            sys.processAutomatedLogistics(state, 0.05);
            return {
                success: true,
                removedIds,
                remainingIds: state.activeTransfers.map(t => t.id),
                storedWood: village.storage.wood || 0
            };
        } catch (error) {
            return { success: false, error: error.message + '\n' + error.stack };
        } finally {
            GameEngine.TILE_SIZE = prevTile;
            window.LOGISTICS_WORKER = prevWorkerFlag;
            if (window.UIManager && prevPortSlots) window.UIManager.getBuildingPortSlots = prevPortSlots;
            if (window.UIManager && prevGetId) window.UIManager.getEntityId = prevGetId;
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
    expect(result.remainingIds).not.toContain('heldBeforePort');
    expect(result.storedWood).toBeGreaterThan(0);
    expect(result.removedIds, `主執行緒已入庫但未通知 worker 刪除:${JSON.stringify(result)}`).toContain('heldBeforePort');
});

test('worker kinematics 必須以 transfer.targetPort 判定多端口終點抵達', async ({ page }) => {
    test.setTimeout(60000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { runLogisticsKinematics } = await import('/src/systems/logistics/LogisticsKinematics.js?v=' + Date.now());
        const { LogisticsTransportArrayState } = await import('/src/systems/logistics/LogisticsTransportArrayState.js?v=' + Date.now());

        const routeEnd = { x: 950, y: 640 };
        const state = {
            logisticsLines: [{
                id: 'L',
                groupId: 'L',
                efficiency: 4,
                lineType: 'transport_line',
                routePoints: [{ x: 950, y: 1520 }, routeEnd]
            }],
            logisticsMergeNodes: [],
            activeTransfers: [{
                id: 'frontAtActualPort',
                lineId: 'L',
                itemType: 'wood',
                targetId: 'core_village',
                progress: 1,
                transportIndex: 44,
                transportOffset: 0,
                routePoints: [{ x: 950, y: 1520 }, routeEnd],
                targetPort: routeEnd,
                // 模擬改拉線後 targetPoint 殘留到另一個端口；worker 仍應信任 transfer.targetPort。
                targetPoint: { x: 990, y: 640 }
            }],
            mapEntities: [],
            resources: {}
        };
        const transportArrayState = new LogisticsTransportArrayState(() => 20);
        const arrivals = runLogisticsKinematics({
            simSystem: {},
            engine: { TILE_SIZE: 20, getEntityConfig: () => null },
            transportArrayState
        }, state, 0.001).arrivals;

        return {
            arrivedIds: arrivals.map(a => a.id),
            remainingIds: state.activeTransfers.map(t => t.id)
        };
    });

    expect(result.arrivedIds, `worker 未用 targetPort 判定抵達:${JSON.stringify(result)}`).toContain('frontAtActualPort');
    expect(result.remainingIds).not.toContain('frontAtActualPort');
});

test('worker kinematics 終點端口前一格被 maxAllowed 卡住時必須產生抵達事件', async ({ page }) => {
    test.setTimeout(60000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { runLogisticsKinematics } = await import('/src/systems/logistics/LogisticsKinematics.js?v=' + Date.now());
        const { LogisticsTransportArrayState } = await import('/src/systems/logistics/LogisticsTransportArrayState.js?v=' + Date.now());

        const routePoints = [{ x: 950, y: 1520 }, { x: 950, y: 640 }];
        const state = {
            logisticsLines: [{
                id: 'L',
                groupId: 'L',
                efficiency: 4,
                lineType: 'transport_line',
                routePoints
            }],
            logisticsMergeNodes: [],
            activeTransfers: [{
                id: 'heldAtTerminalGate',
                lineId: 'L',
                itemType: 'wood',
                targetId: 'core_village',
                progress: 0.9772727272727273,
                maxAllowedProgress: 0.9772727272727273,
                transportIndex: 43,
                transportOffset: 0,
                routePoints,
                targetPoint: { x: 950, y: 640 },
                targetPort: { x: 950, y: 640 }
            }],
            mapEntities: [],
            resources: {}
        };
        const arrivals = runLogisticsKinematics({
            simSystem: {},
            engine: { TILE_SIZE: 20, getEntityConfig: () => null },
            transportArrayState: new LogisticsTransportArrayState(() => 20)
        }, state, 0.001).arrivals;

        return {
            arrivedIds: arrivals.map(a => a.id),
            remainingIds: state.activeTransfers.map(t => t.id)
        };
    });

    expect(result.arrivedIds, `worker terminal gate 未產生 arrival:${JSON.stringify(result)}`).toContain('heldAtTerminalGate');
    expect(result.remainingIds).not.toContain('heldAtTerminalGate');
});

test('createActiveTransfer 必須把連線 targetPort 帶入 transfer 供 worker 抵達判定使用', async ({ page }) => {
    test.setTimeout(60000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { LogisticsTransferSystem } = await import('/src/systems/logistics/LogisticsTransferSystem.js?v=' + Date.now());
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = {
            mapEntities: [
                { id: 'store', type1: 'warehouse', x: 100, y: 100, storage: { wood: 1 } },
                { id: 'core_village', type1: 'village', x: 970, y: 620, storage: {} }
            ],
            logisticsLines: [],
            logisticsMergeNodes: [],
            activeTransfers: [],
            resources: {}
        };
        const sys = new LogisticsTransferSystem(state, {
            ...GameEngine,
            TILE_SIZE: 20,
            state,
            getEntityConfig: () => ({ efficiency: 4 }),
            getFootprint: () => ({ uw: 1, uh: 1 })
        });
        const conn = {
            id: 'core_village',
            filter: 'wood',
            efficiency: 4,
            routePoints: [{ x: 100, y: 100 }, { x: 950, y: 640 }],
            targetPort: { x: 950, y: 640, dir: 'up', width: 1 }
        };
        const transfer = sys.createActiveTransfer(state, state.mapEntities[0], conn, 'wood');
        return {
            targetPort: transfer && transfer.targetPort,
            targetPoint: transfer && transfer.targetPoint
        };
    });

    expect(result.targetPort, `transfer 缺少 targetPort:${JSON.stringify(result)}`).toMatchObject({ x: 950, y: 640 });
    expect(result.targetPoint, `transfer 仍需保留路線終點:${JSON.stringify(result)}`).toBeTruthy();
});
