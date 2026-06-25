const { test, expect } = require('@playwright/test');

async function loadGame(page) {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 30000 });
}

// 重現：先接通一條主線並運送物品，再從建築拉出一條「無目標」支線交匯於主線中段，
// 主線上游應持續送達，不得被堵死（deliveries 必須持續增加）。
test('從建築拉出支線交匯主線中段後，主線上游不得被堵死', async ({ page }) => {
    test.setTimeout(60000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { WorkerSystem } = await import('/src/systems/WorkerSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const prevTile = GameEngine.TILE_SIZE;
        const prevGetCfg = GameEngine.getEntityConfig;
        const prevGetFp = GameEngine.getFootprint;
        const prevPortSlots = window.UIManager?.getBuildingPortSlots;

        try {
            GameEngine.TILE_SIZE = 20;
            GameEngine.getFootprint = () => ({ uw: 2, uh: 2, w: 40, h: 40 });
            GameEngine.getEntityConfig = (type1) => type1 === 'town_center'
                ? { logistics: { canInput: true }, type2: 'storage' }
                : { logistics: { canOutput: true, canInput: true }, type2: 'storage', need_villagers: 0 };
            if (window.UIManager) window.UIManager.getBuildingPortSlots = (ent) => Array.isArray(ent?.portSlots) ? ent.portSlots : [];

            const src = { id: 'src', type1: 'warehouse', x: 90, y: 110, storage: { wood: 999999 },
                assignedWorkers: [{}, {}, {}, {}, {}], logisticsTimer: 0,
                portSlots: [{ dir: 'right', width: 1, slotIndex: 0, defIndex: 0, x: 110, y: 110 }] };
            const tgt = { id: 'tgt', type1: 'town_center', x: 330, y: 110, storage: {},
                portSlots: [{ dir: 'left', width: 1, slotIndex: 0, defIndex: 0, x: 310, y: 110 }] };
            const bsrc = { id: 'bsrc', type1: 'warehouse', x: 210, y: 210, storage: { wood: 999999 },
                assignedWorkers: [{}, {}, {}, {}, {}], logisticsTimer: 0,
                portSlots: [{ dir: 'up', width: 1, slotIndex: 0, defIndex: 0, x: 210, y: 190 }] };

            const sourcePort = { x: 110, y: 110, dir: 'right', width: 1, slotIndex: 0, defIndex: 0 };
            const targetPort = { x: 310, y: 110, dir: 'left', width: 1, slotIndex: 0, defIndex: 0 };

            // 主線以 3 段建造，合流點 (210,110) 落在 segB/segC 邊界，切分後上游保留 2 段(含多格長線段)。
            const mainSegA = { id: 'main_segA', groupId: 'main', sourceId: 'src', sourcePort,
                routePoints: [{ x: 110, y: 110 }, { x: 170, y: 110 }], routeWidth: 1, efficiency: 4, order: 0, createdAt: 1 };
            const mainSegB = { id: 'main_segB', groupId: 'main',
                routePoints: [{ x: 170, y: 110 }, { x: 210, y: 110 }], routeWidth: 1, efficiency: 4, order: 1, createdAt: 2 };
            const mainSegC = { id: 'main_segC', groupId: 'main', targetId: 'tgt', targetPort,
                routePoints: [{ x: 210, y: 110 }, { x: 310, y: 110 }], routeWidth: 1, efficiency: 4, order: 2, createdAt: 3 };
            const branchSegA = { id: 'branch_segA', groupId: 'branch', sourceId: 'bsrc',
                routePoints: [{ x: 210, y: 190 }, { x: 210, y: 150 }], routeWidth: 1, efficiency: 4, order: 0, createdAt: 1 };
            const branchSegB = { id: 'branch_segB', groupId: 'branch',
                routePoints: [{ x: 210, y: 150 }, { x: 210, y: 110 }], routeWidth: 1, efficiency: 4, order: 1, createdAt: 2 };

            src.outputTargets = [{ id: 'tgt', lineId: 'main', sourcePort, targetPort, filter: 'wood', efficiency: 4,
                routePoints: [{ x: 110, y: 110 }, { x: 310, y: 110 }] }];
            // 支線為「從建築拉出」的懸空輸出：無目標 id
            bsrc.outputTargets = [{ id: null, lineId: 'branch', filter: 'wood', efficiency: 4,
                routePoints: [{ x: 210, y: 190 }, { x: 210, y: 110 }] }];

            state.mapEntities = [src, tgt, bsrc];
            state.logisticsLines = [mainSegA, mainSegB, mainSegC, branchSegA, branchSegB];
            state.logisticsMergeNodes = [];
            state.activeTransfers = [];
            state._logisticsMergeAdmissionWinners = {};
            state._logisticsMergeWaitQueues = {};
            state.nextTransferSerial = 1;
            state.trackedTransferId = null;

            const worker = new WorkerSystem(state, GameEngine);
            const deliveries = () => Number(tgt.storage.wood || 0);

            // 主線單獨運行：確認暢通
            for (let i = 0; i < 150; i++) worker.processAutomatedLogistics(state, 0.1);

            // 從建築拉出無目標支線，交匯於主線中段 (210,110)
            const node = conveyorSystem.registerLogisticsMergeNode({
                inputGroupId: 'branch', outputGroupId: 'main',
                point: { x: 210, y: 110 }, inputLine: branchSegB, outputLine: mainSegC });

            // 合流後先讓系統穩定，記錄起點 deliveries
            for (let i = 0; i < 60; i++) worker.processAutomatedLogistics(state, 0.1);
            const deliveriesAtStart = deliveries();

            // 再跑一段，deliveries 應該持續增加（未被堵死）
            for (let i = 0; i < 300; i++) worker.processAutomatedLogistics(state, 0.1);
            const deliveriesAtEnd = deliveries();

            return { success: true, nodeRegistered: !!node, deliveriesAtStart, deliveriesAtEnd,
                delivered: deliveriesAtEnd - deliveriesAtStart };
        } catch (error) {
            return { success: false, error: error.message + '\n' + error.stack };
        } finally {
            GameEngine.TILE_SIZE = prevTile;
            GameEngine.getEntityConfig = prevGetCfg;
            GameEngine.getFootprint = prevGetFp;
            if (window.UIManager && prevPortSlots) window.UIManager.getBuildingPortSlots = prevPortSlots;
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
    expect(result.nodeRegistered).toBe(true);
    // 合流後主線若被堵死，deliveries 會凍結；正常應持續送達。
    expect(result.delivered, `合流後主線被堵死：deliveries 從 ${result.deliveriesAtStart} 凍結未增加`).toBeGreaterThan(10);
});
