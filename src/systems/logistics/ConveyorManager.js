/**
 * @module ConveyorManager
 * @description 物流輸送帶系統頂層協調器
 *
 * 職責（遵守 .cursorrules 職責絕對分離協議）：
 * - 整合 PathfindingModule、TransportLogic、BuildingConnector 三個子模組
 * - 包裝現有 ConveyorSystem（舊系統）的建造/刪除 API，確保零破壞性
 * - 暴露新的流量控制 API（Merge / Split / Backpressure）
 * - 實作 update(dt) 主循環
 *
 * 架構說明：
 * - ConveyorManager 不直接操作 Phaser 渲染物件
 * - 渲染通訊透過事件總線或回傳資料進行
 * - 舊系統 ConveyorSystem 保持完整，本模組為其上層包裝
 */

import { findManhattanPath, validatePath, buildRoutingGrid, findConnectedComponents } from './PathfindingModule.js';
import { TransportLogic } from './TransportLogic.js';
import { BuildingConnector } from './BuildingConnector.js';

// ─────────────────────────────────────────────
// 1. 型別定義
// ─────────────────────────────────────────────

/**
 * @typedef {Object} ConveyorManagerConfig
 * @property {number} [tileSize=64]          - 格子像素尺寸
 * @property {number} [routeScale=2]         - 路由網格放大倍率
 * @property {number} [snapRadius=0.8]       - Port 吸附半徑（格數倍率）
 * @property {number} [turnPenalty=100]      - A* 轉彎懲罰
 * @property {number} [maxAStarNodes=12000]  - A* 最大搜尋節點
 * @property {number} [updateInterval=0]     - 流量更新間隔（ms，0=每幀更新）
 */

/**
 * @typedef {Object} BuildResult
 * @property {boolean} success
 * @property {string|null} groupId
 * @property {number} segmentCount
 * @property {string} message
 */

/**
 * @typedef {Object} GraphValidationResult
 * @property {boolean} valid
 * @property {number} totalGroups
 * @property {number} isolatedGroups
 * @property {string[]} isolatedGroupIds
 * @property {string} message
 */

// ─────────────────────────────────────────────
// 2. ConveyorManager 核心類別
// ─────────────────────────────────────────────

export class ConveyorManager {
    /**
     * @param {ConveyorManagerConfig} [config]
     */
    constructor(config = {}) {
        const {
            tileSize = 64,
            routeScale = 2,
            snapRadius = 0.8,
            turnPenalty = 100,
            maxAStarNodes = 12000,
            updateInterval = 0
        } = config;

        this.tileSize = tileSize;
        this.routeScale = routeScale;
        this.updateInterval = updateInterval;
        this._lastUpdateTime = 0;

        // 子模組實例
        /** @type {TransportLogic} */
        this.transport = new TransportLogic();

        /** @type {BuildingConnector} */
        this.connector = new BuildingConnector({ tileSize, snapRadius });

        // 路徑規劃選項
        this._pathOptions = { turnPenalty, maxNodes: maxAStarNodes };

        // 事件訂閱轉發（將子模組事件透過統一接口暴露）
        this._eventHandlers = new Map();

        this._setupEventForwarding();

        // 內部狀態
        /** @type {string[]} 上一幀的阻塞群組 ID */
        this._lastBlockedGroups = [];
    }

    // ─────────────────────────────────────────
    // 3. 事件系統
    // ─────────────────────────────────────────

    /**
     * 訂閱 ConveyorManager 事件
     * @param {string} event
     * @param {Function} handler
     */
    on(event, handler) {
        if (!this._eventHandlers.has(event)) this._eventHandlers.set(event, []);
        this._eventHandlers.get(event).push(handler);
    }

    /**
     * 發送事件
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
        for (const handler of (this._eventHandlers.get(event) || [])) {
            try { handler(data); } catch (e) { /* 防止訂閱者崩潰影響整體 */ }
        }
    }

    _setupEventForwarding() {
        // 將 TransportLogic 事件轉發到 ConveyorManager
        this.transport.on('item:arrived',      data => this.emit('item:arrived', data));
        this.transport.on('item:enqueued',     data => this.emit('item:enqueued', data));
        this.transport.on('item:transferred',  data => this.emit('item:transferred', data));
        this.transport.on('backpressure',      data => this.emit('backpressure', data));
        this.transport.on('backpressure:batch',data => this.emit('backpressure:batch', data));
        this.transport.on('merge:primary',     data => this.emit('merge:primary', data));
        this.transport.on('merge:secondary',   data => this.emit('merge:secondary', data));
        this.transport.on('split:dispatched',  data => this.emit('split:dispatched', data));
    }

    // ─────────────────────────────────────────
    // 4. 路徑規劃 API（包裝 PathfindingModule）
    // ─────────────────────────────────────────

    /**
     * 在兩點之間尋找曼哈頓路徑（L形優先，A*備用）
     *
     * @param {{ x: number, y: number }} startGrid  - 起點（網格座標）
     * @param {{ x: number, y: number }} endGrid    - 終點（網格座標）
     * @param {number[][]} baseGrid                 - 基礎地圖網格
     * @param {Object[]} [existingLines]            - 已建立的物流線（標記佔用）
     * @param {Object} [options]
     * @returns {import('./PathfindingModule.js').PathResult}
     */
    findPath(startGrid, endGrid, baseGrid, existingLines = [], options = {}) {
        const routingGrid = buildRoutingGrid(
            baseGrid,
            existingLines,
            this.routeScale,
            options.ignoreLine || null
        );

        return findManhattanPath(startGrid, endGrid, routingGrid, {
            ...this._pathOptions,
            ...options
        });
    }

    /**
     * 驗證路徑連通性
     *
     * @param {{ x: number, y: number }[]} path
     * @param {number[][]} grid
     * @returns {import('./PathfindingModule.js').PathResult}
     */
    validatePath(path, grid) {
        return validatePath(path, grid);
    }

    // ─────────────────────────────────────────
    // 5. 建造 API（包裝舊 ConveyorSystem）
    // ─────────────────────────────────────────

    /**
     * 建造物流線（代理至舊 ConveyorSystem）
     *
     * 自動升級：若新路徑覆蓋舊線段，執行屬性替換，路徑索引不變
     *
     * @param {Object} params
     * @param {Object|null} params.sourceEntity
     * @param {Object|null} params.targetEntity
     * @param {{ x: number, y: number }[]} params.worldPoints  - 世界座標路徑點
     * @param {string|null} params.lineGroupId                 - 指定群組 ID（用於延伸/升級）
     * @param {number} [params.routeWidth]
     * @param {string} [params.lineType]
     * @param {number} [params.efficiency]
     * @param {Object|null} [params.sourcePort]
     * @param {Object|null} [params.targetPort]
     * @returns {BuildResult}
     */
    buildLine(params) {
        const {
            sourceEntity, targetEntity, worldPoints,
            lineGroupId = null, routeWidth = 1,
            lineType = 'transport_line', efficiency = 0,
            sourcePort = null, targetPort = null
        } = params;

        if (!worldPoints || worldPoints.length < 2) {
            return { success: false, groupId: null, segmentCount: 0, message: '路徑點不足（至少需要 2 個點）' };
        }

        // 代理至舊 ConveyorSystem（若可用）
        if (typeof window !== 'undefined' && window.conveyorSystem) {
            const result = window.conveyorSystem.upsertLogisticsLine({
                lineId: lineGroupId,
                sourceEnt: sourceEntity,
                targetEnt: targetEntity,
                targetPoint: targetEntity ? null : worldPoints[worldPoints.length - 1],
                points: worldPoints,
                routeWidth,
                sourcePort,
                targetPort,
                conn: null,
                lineType,
                efficiency
            });

            if (result) {
                // 建造成功後，更新 TransportLogic 的線段快取
                this._syncSegmentCache();

                return {
                    success: true,
                    groupId: result.groupId || result.id,
                    segmentCount: 1,
                    message: '物流線建造完成'
                };
            }
        }

        return { success: false, groupId: null, segmentCount: 0, message: '建造失敗（ConveyorSystem 不可用）' };
    }

    /**
     * 刪除物流線段（含遞迴連通性重建）
     *
     * @param {string} lineId    - 線段 ID 或群組 ID
     * @param {'segment'|'group'} mode - 刪除模式
     * @returns {{ success: boolean, message: string }}
     */
    deleteLine(lineId, mode = 'segment') {
        if (typeof window !== 'undefined' && window.conveyorSystem) {
            const success = mode === 'group'
                ? window.conveyorSystem.deleteLogisticsLineGroupById(lineId)
                : window.conveyorSystem.deleteLogisticsLineById(lineId);

            if (success) {
                this._syncSegmentCache();
                return { success: true, message: `物流線${mode === 'group' ? '群組' : '線段'}已刪除` };
            }
        }

        return { success: false, message: '刪除失敗' };
    }

    // ─────────────────────────────────────────
    // 6. 流量控制 API（新功能）
    // ─────────────────────────────────────────

    /**
     * 注冊合流節點（Priority Merge）
     *
     * @param {string} nodeId
     * @param {string[]} inputGroupIds  - index 0 = 主線（最高優先）
     * @param {string} outputGroupId
     */
    registerMergeNode(nodeId, inputGroupIds, outputGroupId) {
        this.transport.registerMergeNode(nodeId, inputGroupIds, outputGroupId);
    }

    /**
     * 注冊分流節點（Round-Robin / Filter）
     *
     * @param {string} nodeId
     * @param {string} inputGroupId
     * @param {string[]} outputGroupIds
     */
    registerSplitNode(nodeId, inputGroupId, outputGroupIds) {
        this.transport.registerSplitNode(nodeId, inputGroupId, outputGroupIds);
    }

    /**
     * 將物品加入物流線
     *
     * @param {string} itemId
     * @param {string} type       - 物品種類
     * @param {string} lineGroupId
     * @returns {boolean}
     */
    enqueueItem(itemId, type, lineGroupId) {
        return this.transport.enqueueItem(itemId, type, lineGroupId);
    }

    /**
     * 查詢群組是否被回壓阻塞
     * @param {string} groupId
     * @returns {boolean}
     */
    isGroupBlocked(groupId) {
        return this.transport.isGroupBlocked(groupId);
    }

    // ─────────────────────────────────────────
    // 7. 主循環（每幀呼叫）
    // ─────────────────────────────────────────

    /**
     * 主更新循環
     *
     * 執行順序：
     * 1. 物品移動（陣列偏移運輸法）
     * 2. Backpressure 計算
     * 3. Merge / Split 節點處理
     *
     * @param {number} dt            - 幀時間差（秒）
     * @param {Object} [gameState]   - 遊戲狀態（用於 Backpressure 計算）
     * @returns {{ moved: number, blocked: number }}
     */
    update(dt, gameState = null) {
        const now = Date.now();
        if (this.updateInterval > 0 && now - this._lastUpdateTime < this.updateInterval) {
            return { moved: 0, blocked: 0 };
        }
        this._lastUpdateTime = now;

        // Phase 1：物品位移
        const transportResult = this.transport.tickTransport(dt, this.tileSize);

        // Phase 2：Backpressure 計算（需要遊戲狀態）
        if (gameState) {
            this._updateBackpressure(gameState);
        }

        // Phase 3：處理所有 Merge 節點
        for (const [nodeId] of this.transport._mergeNodes) {
            this.transport.processMergeNode(nodeId);
        }

        // Phase 4：處理所有 Split 節點
        for (const [nodeId] of this.transport._splitNodes) {
            this.transport.processSplitNode(nodeId);
        }

        return transportResult;
    }

    /**
     * 根據遊戲狀態計算 Backpressure
     * @param {Object} gameState
     */
    _updateBackpressure(gameState) {
        const entities = gameState.mapEntities || [];
        const segments = gameState.logisticsLines || [];

        // 建構儲量資訊
        const storageInfos = entities
            .filter(ent => ent && Number.isFinite(ent.storageCapacity))
            .map(ent => ({
                entityId: this._getEntityId(ent, gameState),
                currentItems: Array.isArray(ent.items) ? ent.items.length : (ent.itemCount || 0),
                capacity: ent.storageCapacity || 0
            }));

        if (storageInfos.length > 0) {
            this.transport.propagateBackpressure(storageInfos, segments);
        }
    }

    // ─────────────────────────────────────────
    // 8. 連通性驗證 API
    // ─────────────────────────────────────────

    /**
     * 驗證整個物流圖的連通性（升級/刪除後呼叫）
     *
     * 演算法：BFS 連通分量分析
     *
     * @param {Object[]} logisticsLines  - 所有物流線段
     * @returns {GraphValidationResult}
     */
    validateGraph(logisticsLines) {
        if (!Array.isArray(logisticsLines) || logisticsLines.length === 0) {
            return {
                valid: true,
                totalGroups: 0,
                isolatedGroups: 0,
                isolatedGroupIds: [],
                message: '圖為空，連通性有效'
            };
        }

        // 建立鄰接表（以線段端點為節點，精度 1px）
        const snapKey = (x, y) => `${Math.round(x)},${Math.round(y)}`;
        const adjacency = new Map();

        for (const line of logisticsLines) {
            if (!line) continue;
            const pts = Array.isArray(line.routePoints) ? line.routePoints : [];
            if (pts.length < 2) continue;

            for (let i = 0; i < pts.length - 1; i++) {
                const ak = snapKey(pts[i].x, pts[i].y);
                const bk = snapKey(pts[i + 1].x, pts[i + 1].y);

                if (!adjacency.has(ak)) adjacency.set(ak, []);
                if (!adjacency.has(bk)) adjacency.set(bk, []);

                if (!adjacency.get(ak).includes(bk)) adjacency.get(ak).push(bk);
                if (!adjacency.get(bk).includes(ak)) adjacency.get(bk).push(ak);
            }
        }

        const { components, isolatedNodes } = findConnectedComponents(adjacency);

        // 識別孤立群組（只有單個端點節點 = 零長度線段 = 孤立）
        const totalGroups = new Set(logisticsLines.map(l => l.groupId || l.id)).size;
        const isolatedGroupIds = this._findIsolatedGroups(logisticsLines, isolatedNodes);

        return {
            valid: isolatedGroupIds.length === 0,
            totalGroups,
            isolatedGroups: isolatedGroupIds.length,
            isolatedGroupIds,
            message: isolatedGroupIds.length === 0
                ? `連通性驗證通過（${totalGroups} 群組，${components.length} 連通分量）`
                : `發現 ${isolatedGroupIds.length} 個孤立群組: ${isolatedGroupIds.join(', ')}`
        };
    }

    /**
     * 找出孤立群組（端點無法與任何其他群組連接）
     * @param {Object[]} lines
     * @param {string[]} isolatedNodeKeys
     * @returns {string[]}
     */
    _findIsolatedGroups(lines, isolatedNodeKeys) {
        const isolatedSet = new Set(isolatedNodeKeys);
        const isolated = new Set();
        const snapKey = (x, y) => `${Math.round(x)},${Math.round(y)}`;

        for (const line of lines) {
            if (!line) continue;
            const pts = Array.isArray(line.routePoints) ? line.routePoints : [];
            if (pts.length < 2) continue;

            const startKey = snapKey(pts[0].x, pts[0].y);
            const endKey = snapKey(pts[pts.length - 1].x, pts[pts.length - 1].y);

            // 群組的起點和終點都是孤立節點 → 整個群組孤立
            if (isolatedSet.has(startKey) && isolatedSet.has(endKey)) {
                isolated.add(line.groupId || line.id);
            }
        }

        return [...isolated];
    }

    // ─────────────────────────────────────────
    // 9. 狀態同步
    // ─────────────────────────────────────────

    /**
     * 從 GameEngine.state 同步線段快取到 TransportLogic
     */
    _syncSegmentCache() {
        let segments = [];

        if (typeof window !== 'undefined' && window.GameEngine?.state?.logisticsLines) {
            segments = window.GameEngine.state.logisticsLines;
        }

        this.transport.updateSegmentCache(segments);
    }

    /**
     * 取得實體 ID（相容舊 UIManager 介面）
     * @param {Object} entity
     * @param {Object} [gameState]
     * @returns {string|null}
     */
    _getEntityId(entity, gameState = null) {
        if (!entity) return null;
        if (entity.id) return entity.id;
        if (entity.entityId) return entity.entityId;

        // 相容舊系統
        if (typeof window !== 'undefined' && window.UIManager?.getEntityId) {
            return window.UIManager.getEntityId(entity);
        }

        return null;
    }

    // ─────────────────────────────────────────
    // 10. 資料查詢
    // ─────────────────────────────────────────

    /**
     * 取得所有在途物品（用於渲染層）
     * @returns {import('./TransportLogic.js').TransportItem[]}
     */
    getInTransitItems() {
        return this.transport.getItemSnapshot();
    }

    /**
     * 取得被阻塞的群組 ID 列表
     * @returns {string[]}
     */
    getBlockedGroups() {
        return this.transport.getBlockedGroups();
    }

    /**
     * 重置所有流量控制狀態（測試 / 重新開始用）
     */
    reset() {
        this.transport.reset();
    }
}

// ─────────────────────────────────────────────
// 匯出單例（全域可用）
// ─────────────────────────────────────────────

/** @type {ConveyorManager} */
export const conveyorManager = new ConveyorManager();
