const assert = require('assert');
const fs = require('fs');
const path = require('path');

globalThis.GameEngine = {
    TILE_SIZE: 20,
    state: {
        logisticsLines: [],
        logisticsMergeNodes: [],
        logisticsTurnArrowOverrides: [],
        activeTransfers: [],
        mapEntities: [],
        resources: {},
        pathfinding: { grid: [[0]] },
        selectedLogisticsLineId: null,
        selectedLogisticsGroupId: null,
        selectedLogisticsClickX: null,
        selectedLogisticsClickY: null
    },
    addLog: () => {},
    getEntityConfig: () => null
};

globalThis.window = {
    UIManager: {
        activeLogisticsLine: null,
        activeLogisticsConnection: null,
        getEntityId: ent => ent?.id || null,
        getBuildingPortSlots: () => []
    }
};

const undoStoreCode = fs.readFileSync(path.join(__dirname, '../src/systems/logistics/LogisticsUndoStore.js'), 'utf8')
    .replace(/export class LogisticsUndoStore/, 'globalThis.LogisticsUndoStore = class LogisticsUndoStore');
eval(undoStoreCode);

(async () => {
    class TestSystem {
        constructor() {
            this.activeDrag = null;
            this.logisticsBuildUndoStack = [];
            this.maxLogisticsBuildUndoSteps = 5;
            this.undoStore = new globalThis.LogisticsUndoStore(this, () => GameEngine);
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

    GameEngine.state.logisticsLines = [{
        id: 'line_before',
        groupId: 'g_before',
        routePoints: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
        routeWidth: 1
    }];
    GameEngine.state.logisticsMergeNodes = [{ id: 'merge_before', inputGroupIds: ['g_branch'], outputGroupId: 'g_before' }];
    GameEngine.state.logisticsTurnArrowOverrides = [{ overrideKey: 'before' }];
    GameEngine.state.resources = { wood: 100, stone: 50 };
    GameEngine.state.mapEntities = [{
        id: 'source',
        outputTargets: [{ id: 'target_before', lineId: 'g_before', filter: 'WOOD' }],
        outputBuffer: { wood: 1 },
        outputCapacity: 3
    }];
    GameEngine.state.activeTransfers = [
        { id: 'item_live', lineId: 'g_after', type: 'wood', sourceId: 'source', progress: 0.75 },
        { id: 'item_keep', lineId: 'g_before', type: 'stone', sourceId: 'source', progress: 0.25 }
    ];
    GameEngine.state.selectedLogisticsLineId = 'line_before';
    GameEngine.state.selectedLogisticsGroupId = 'g_before';
    GameEngine.state.selectedLogisticsClickX = 1;
    GameEngine.state.selectedLogisticsClickY = 2;
    window.UIManager.activeLogisticsLine = GameEngine.state.logisticsLines[0];
    window.UIManager.activeLogisticsConnection = { lineId: 'g_before', groupId: 'g_before' };

    assert.strictEqual(sys.undoStore.record(null, GameEngine.state), true, '應能記錄物流線建造快照');

    GameEngine.state.logisticsLines = [{
        id: 'line_after',
        groupId: 'g_after',
        routePoints: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
        routeWidth: 1
    }];
    GameEngine.state.logisticsMergeNodes = [{ id: 'merge_after', inputGroupIds: ['g_new'], outputGroupId: 'g_after' }];
    GameEngine.state.logisticsTurnArrowOverrides = [{ overrideKey: 'after' }];
    GameEngine.state.resources.wood = 87;
    GameEngine.state.mapEntities[0].outputTargets = [{ id: 'target_after', lineId: 'g_after', filter: null }];
    GameEngine.state.selectedLogisticsLineId = 'line_after';
    GameEngine.state.selectedLogisticsGroupId = 'g_after';
    GameEngine.state.selectedLogisticsClickX = 9;
    GameEngine.state.selectedLogisticsClickY = 10;
    window.UIManager.activeLogisticsLine = GameEngine.state.logisticsLines[0];
    window.UIManager.activeLogisticsConnection = { lineId: 'g_after', groupId: 'g_after' };

    assert.strictEqual(sys.undoStore.undoLast(GameEngine.state), true, 'undo 應復原上一筆物流線建造快照');
    assert.strictEqual(GameEngine.state.logisticsLines.length, 1, 'undo 應復原物流線數量');
    assert.strictEqual(GameEngine.state.logisticsLines[0].id, 'line_before', 'undo 應復原物流線');
    assert.strictEqual(GameEngine.state.logisticsMergeNodes[0].id, 'merge_before', 'undo 應復原 merge node');
    assert.strictEqual(GameEngine.state.logisticsTurnArrowOverrides[0].overrideKey, 'before', 'undo 應復原轉角覆寫');
    assert.strictEqual(GameEngine.state.resources.wood, 100, 'undo 應復原建造快照中的全域資源總量');
    assert.strictEqual(GameEngine.state.resources.stone, 50, '不相關資源總量不應變動');
    assert.strictEqual(GameEngine.state.mapEntities[0].outputTargets[0].lineId, 'g_before', 'undo 應復原建築 outputTargets');
    assert.strictEqual(GameEngine.state.mapEntities[0].outputBuffer.wood, 2, '消失物流線上的物品應回收到來源建築 outputBuffer');
    assert.strictEqual(GameEngine.state.activeTransfers.length, 1, 'undo 應移除消失物流線上的在途物品');
    assert.strictEqual(GameEngine.state.activeTransfers[0].id, 'item_keep', 'undo 不應移除仍在有效物流線上的物品');
    assert.strictEqual(GameEngine.state.selectedLogisticsLineId, 'line_before', 'undo 應復原物流線選取狀態');
    assert.strictEqual(GameEngine.state.selectedLogisticsGroupId, 'g_before', 'undo 應復原物流線群組選取狀態');
    assert.strictEqual(window.UIManager.activeLogisticsLine?.id, 'line_before', 'undo 應復原 active logistics line');
    assert.strictEqual(window.UIManager.activeLogisticsConnection?.lineId, 'g_before', 'undo 應復原 active logistics connection');

    for (let i = 0; i < 6; i++) {
        GameEngine.state.logisticsLines = [{ id: `state_${i}`, groupId: `g_${i}`, routePoints: [{ x: i, y: 0 }, { x: i + 1, y: 0 }] }];
        sys.undoStore.record(null, GameEngine.state);
        GameEngine.state.logisticsLines = [{ id: `after_${i}`, groupId: `ga_${i}`, routePoints: [{ x: i, y: 0 }, { x: i + 2, y: 0 }] }];
    }

    for (let expected = 5; expected >= 1; expected--) {
        assert.strictEqual(sys.undoStore.undoLast(GameEngine.state), true, `undo stack 應復原 state_${expected}`);
        assert.strictEqual(GameEngine.state.logisticsLines[0].id, `state_${expected}`, `undo 實際復原 ${GameEngine.state.logisticsLines[0].id}`);
    }
    assert.strictEqual(sys.undoStore.undoLast(GameEngine.state), false, 'undo stack 應只保留最近五筆建造快照');

    GameEngine.state.resources = { wood: 0 };
    GameEngine.state.mapEntities = [{
        id: 'full_source',
        outputBuffer: { wood: 1 },
        outputCapacity: 1
    }];
    GameEngine.state.logisticsLines = [{ id: 'kept', groupId: 'kept_group' }];
    GameEngine.state.activeTransfers = [{ id: 'blocked_return', lineId: 'deleted_group', type: 'wood', sourceId: 'full_source' }];
    assert.strictEqual(sys.undoStore.restore({
        logisticsLines: [{ id: 'kept', groupId: 'kept_group' }],
        logisticsMergeNodes: [],
        logisticsTurnArrowOverrides: [],
        resources: { wood: 0 },
        mapEntityOutputTargets: []
    }, GameEngine.state), true, 'restore 應可直接執行');
    assert.strictEqual(GameEngine.state.activeTransfers.length, 0, '來源建築滿載時，消失物流線上的物品應直接刪除');
    assert.strictEqual(GameEngine.state.mapEntities[0].outputBuffer.wood, 1, '來源建築滿載時不應超量回收');
    assert.strictEqual(GameEngine.state.resources.wood, 0, '來源建築滿載時不應增加全域資源');

    GameEngine.state.resources = { wood: 0 };
    GameEngine.state.mapEntities = [{
        id: 'same_group_source',
        outputBuffer: { wood: 0 },
        outputCapacity: 5
    }];
    GameEngine.state.logisticsLines = [{
        id: 'same_group_a',
        groupId: 'same_group',
        sourceId: 'same_group_source',
        routePoints: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }]
    }];
    GameEngine.state.activeTransfers = [
        {
            id: 'same_group_kept_item',
            lineId: 'same_group',
            itemType: 'wood',
            sourceId: 'same_group_source',
            progress: 0.25,
            routePoints: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }]
        },
        {
            id: 'same_group_removed_item',
            lineId: 'same_group',
            itemType: 'wood',
            sourceId: 'same_group_source',
            progress: 0.75,
            routePoints: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }]
        },
        { id: 'unchanged_item', lineId: 'unchanged_group', itemType: 'wood', sourceId: 'same_group_source', progress: 0.2 }
    ];
    assert.strictEqual(sys.undoStore.restore({
        logisticsLines: [
            {
                id: 'same_group_a',
                groupId: 'same_group',
                sourceId: 'same_group_source',
                routePoints: [{ x: 0, y: 0 }, { x: 80, y: 0 }]
            },
            {
                id: 'unchanged_line',
                groupId: 'unchanged_group',
                sourceId: 'same_group_source',
                routePoints: [{ x: 10, y: 10 }, { x: 30, y: 10 }]
            }
        ],
        logisticsMergeNodes: [],
        logisticsTurnArrowOverrides: [],
        resources: { wood: 0 },
        mapEntityOutputTargets: []
    }, GameEngine.state), true, 'restore 應處理同群組路徑縮短');
    assert.deepStrictEqual(
        GameEngine.state.activeTransfers.map(item => item.id),
        ['same_group_kept_item', 'unchanged_item'],
        '同 group 但路徑被復原改動時，只應清除落在消失線段上的物品'
    );
    assert.strictEqual(GameEngine.state.mapEntities[0].outputBuffer.wood, 1, '消失線段上清除的物品應回收到來源建築');

    console.log('logistics build undo tests passed');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
