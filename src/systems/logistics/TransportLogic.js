/**
 * @module TransportLogic
 * @description 物流流量控制引擎
 *
 * 職責（遵守職責分離協議）：
 * - Priority Merge：主線空閒時優先通行，副線 Round-Robin 等待
 * - Round-Robin / Filter 分流：根據 filter 篩選目標，輪替分配
 * - Backpressure 回壓傳遞：下游滿載→遞迴阻塞上游
 * - 不操作任何渲染物件（Phaser Sprites / UI）
 * - 所有跨系統通訊透過 EventBus 或回傳值進行
 */

// ─────────────────────────────────────────────
// 1. 型別定義
// ─────────────────────────────────────────────

/**
 * @typedef {Object} TransportItem
 * @property {string} id         - 物品唯一 ID
 * @property {string} type       - 物品種類（資源名稱）
 * @property {number} index      - 所在線段索引（陣列偏移運輸法）
 * @property {number} offset     - 在線段內的偏移量（0.0 ~ 1.0）
 * @property {string} lineGroupId - 所屬物流線群組 ID
 * @property {boolean} blocked   - 是否被回壓阻塞
 */

/**
 * @typedef {Object} LogisticsSegment
 * @property {string} id
 * @property {string} groupId
 * @property {string|null} sourceId
 * @property {string|null} targetId
 * @property {number} efficiency  - 格/秒 傳輸速度
 * @property {number} routeWidth
 * @property {string|null} filter - 物品過濾類型（null=全部）
 * @property {number} order       - 線段排列順序
 * @property {{x:number,y:number}[]} routePoints
 * @property {boolean} [isBlocked] - 回壓標記
 */

/**
 * @typedef {Object} MergeNode
 * @property {string} nodeId          - 合流點 ID
 * @property {string[]} inputGroupIds - 輸入線群組 ID 陣列（index 0 = 主線）
 * @property {string} outputGroupId   - 輸出線群組 ID
 * @property {number} roundRobinIndex - 當前輪詢索引（內部狀態）
 */

/**
 * @typedef {Object} SplitNode
 * @property {string} nodeId           - 分流點 ID
 * @property {string} inputGroupId     - 輸入線群組 ID
 * @property {string[]} outputGroupIds - 輸出線群組 ID 陣列
 * @property {number} roundRobinIndex  - 當前輪詢索引（內部狀態）
 */

/**
 * @typedef {Object} StorageInfo
 * @property {string} entityId
 * @property {number} currentItems
 * @property {number} capacity
 */

// ─────────────────────────────────────────────
// 2. TransportLogic 核心類別
// ─────────────────────────────────────────────

export class TransportLogic {
    constructor() {
        /**
         * 正在運輸中的物品（陣列偏移運輸法：僅紀錄 index + offset）
         * @type {Map<string, TransportItem>}
         */
        this._items = new Map();

        /**
         * 合流節點表
         * @type {Map<string, MergeNode>}
         */
        this._mergeNodes = new Map();

        /**
         * 分流節點表
         * @type {Map<string, SplitNode>}
         */
        this._splitNodes = new Map();

        /**
         * 物流線群組的線段快取（避免每幀重複過濾）
         * @type {Map<string, LogisticsSegment[]>}
         */
        this._segmentCache = new Map();

        /**
         * 被回壓阻塞的群組 ID 集合
         * @type {Set<string>}
         */
        this._blockedGroups = new Set();

        /**
         * 線段群組的路徑總長快取（格數）
         * @type {Map<string, number>}
         */
        this._pathLengthCache = new Map();

        /**
         * 內部事件訂閱表（EventBus-like）
         * @type {Map<string, Function[]>}
         */
        this._eventHandlers = new Map();
    }

    // ─────────────────────────────────────────
    // 3. 事件總線（輕量版 EventBus）
    // ─────────────────────────────────────────

    /**
     * 訂閱事件
     * @param {string} event   - 事件名稱
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
            try { handler(data); } catch (e) { /* 防止單一訂閱者崩潰影響整體 */ }
        }
    }

    // ─────────────────────────────────────────
    // 4. 線段快取管理（O(1) 存取）
    // ─────────────────────────────────────────

    /**
     * 更新線段快取（建造/刪除後必須呼叫）
     * @param {LogisticsSegment[]} allSegments - 全部物流線段
     */
    updateSegmentCache(allSegments) {
        this._segmentCache.clear();
        this._pathLengthCache.clear();

        for (const seg of allSegments) {
            if (!seg || !seg.groupId) continue;
            if (!this._segmentCache.has(seg.groupId)) {
                this._segmentCache.set(seg.groupId, []);
            }
            this._segmentCache.get(seg.groupId).push(seg);
        }

        // 排序並計算路徑長（O(n)）
        for (const [groupId, segments] of this._segmentCache) {
            segments.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            let totalLength = 0;
            for (const seg of segments) {
                const pts = seg.routePoints || [];
                for (let i = 0; i < pts.length - 1; i++) {
                    totalLength += Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y);
                }
            }
            this._pathLengthCache.set(groupId, totalLength);
        }
    }

    /**
     * 取得群組的所有線段（已排序）
     * @param {string} groupId
     * @returns {LogisticsSegment[]}
     */
    getSegments(groupId) {
        return this._segmentCache.get(groupId) || [];
    }

    // ─────────────────────────────────────────
    // 5. Priority Merge（優先合流）
    // ─────────────────────────────────────────

    /**
     * 注冊合流節點
     * @param {string} nodeId
     * @param {string[]} inputGroupIds - index 0 為主線（最高優先級）
     * @param {string} outputGroupId
     */
    registerMergeNode(nodeId, inputGroupIds, outputGroupId) {
        this._mergeNodes.set(nodeId, {
            nodeId,
            inputGroupIds: [...inputGroupIds],
            outputGroupId,
            roundRobinIndex: 0
        });
    }

    /**
     * 處理合流節點（Priority Merge 邏輯）
     *
     * 規則：
     * 1. 主線（index 0）有物品且輸出線空閒 → 主線物品優先通過
     * 2. 主線空閒時，副線按 Round-Robin 順序輪替
     * 3. 輸出線被回壓阻塞 → 所有輸入線停止
     *
     * @param {string} nodeId
     * @returns {{ merged: boolean, sourceGroupId: string|null, reason: string }}
     */
    processMergeNode(nodeId) {
        const node = this._mergeNodes.get(nodeId);
        if (!node) return { merged: false, sourceGroupId: null, reason: '節點不存在' };

        // 輸出線被阻塞 → 回壓傳遞給所有輸入線
        if (this._blockedGroups.has(node.outputGroupId)) {
            node.inputGroupIds.forEach(id => this._blockedGroups.add(id));
            return { merged: false, sourceGroupId: null, reason: '輸出線阻塞，回壓已傳遞' };
        }

        // 解除輸入線的阻塞標記（下游已疏通）
        node.inputGroupIds.forEach(id => this._blockedGroups.delete(id));

        const primaryGroupId = node.inputGroupIds[0];
        const primaryItems = this._getItemsAtEnd(primaryGroupId);

        // 規則 1：主線有物品 → 主線優先
        if (primaryItems.length > 0) {
            const item = primaryItems[0];
            this._transferItemToLine(item, node.outputGroupId);
            this.emit('merge:primary', { nodeId, item, sourceGroupId: primaryGroupId });
            return { merged: true, sourceGroupId: primaryGroupId, reason: '主線優先通過' };
        }

        // 規則 2：主線空閒 → 副線 Round-Robin
        const secondaryInputs = node.inputGroupIds.slice(1);
        for (let attempt = 0; attempt < secondaryInputs.length; attempt++) {
            const idx = node.roundRobinIndex % secondaryInputs.length;
            node.roundRobinIndex = (node.roundRobinIndex + 1) % secondaryInputs.length;
            const candidateGroupId = secondaryInputs[idx];
            const candidateItems = this._getItemsAtEnd(candidateGroupId);
            if (candidateItems.length > 0) {
                const item = candidateItems[0];
                this._transferItemToLine(item, node.outputGroupId);
                this.emit('merge:secondary', { nodeId, item, sourceGroupId: candidateGroupId });
                return { merged: true, sourceGroupId: candidateGroupId, reason: `副線 Round-Robin（index=${idx}）` };
            }
        }

        return { merged: false, sourceGroupId: null, reason: '所有輸入線無物品' };
    }

    // ─────────────────────────────────────────
    // 6. Round-Robin / Filter 分流
    // ─────────────────────────────────────────

    /**
     * 注冊分流節點
     * @param {string} nodeId
     * @param {string} inputGroupId
     * @param {string[]} outputGroupIds
     */
    registerSplitNode(nodeId, inputGroupId, outputGroupIds) {
        this._splitNodes.set(nodeId, {
            nodeId,
            inputGroupId,
            outputGroupIds: [...outputGroupIds],
            roundRobinIndex: 0
        });
    }

    /**
     * 處理分流節點（Filter + Round-Robin）
     *
     * 規則：
     * 1. 物品有 filter 標記 → 只能進入符合過濾條件的輸出線
     * 2. 無 filter 或無符合目標 → Round-Robin 輪替所有輸出線
     * 3. 目標輸出線被回壓阻塞 → 嘗試下一條（跳過）
     * 4. 所有輸出線皆阻塞 → Backpressure 傳遞到輸入線
     *
     * @param {string} nodeId
     * @returns {{ split: boolean, targetGroupId: string|null, reason: string }}
     */
    processSplitNode(nodeId) {
        const node = this._splitNodes.get(nodeId);
        if (!node) return { split: false, targetGroupId: null, reason: '節點不存在' };

        const items = this._getItemsAtEnd(node.inputGroupId);
        if (items.length === 0) return { split: false, targetGroupId: null, reason: '輸入線無物品' };

        const item = items[0];

        // Filter-based 分流：物品類型與輸出線 filter 欄位匹配
        const filterMatches = node.outputGroupIds.filter(groupId => {
            const segs = this.getSegments(groupId);
            if (segs.length === 0) return false;
            const lineFilter = segs[0].filter;
            // 無過濾條件 = 接受所有物品
            return !lineFilter || lineFilter === item.type;
        });

        const candidates = filterMatches.length > 0 ? filterMatches : node.outputGroupIds;

        // Round-Robin 選擇目標（跳過阻塞線路）
        for (let attempt = 0; attempt < candidates.length; attempt++) {
            const idx = node.roundRobinIndex % candidates.length;
            node.roundRobinIndex = (node.roundRobinIndex + 1) % candidates.length;
            const targetGroupId = candidates[idx];

            if (this._blockedGroups.has(targetGroupId)) continue;

            this._transferItemToLine(item, targetGroupId);
            this.emit('split:dispatched', { nodeId, item, targetGroupId });
            return { split: true, targetGroupId, reason: `Filter+Round-Robin → ${targetGroupId}` };
        }

        // 所有輸出線皆阻塞 → 回壓傳遞
        this._blockedGroups.add(node.inputGroupId);
        this.emit('backpressure', { nodeId, sourceGroupId: node.inputGroupId });
        return { split: false, targetGroupId: null, reason: '所有輸出線阻塞，回壓已傳遞' };
    }

    // ─────────────────────────────────────────
    // 7. Backpressure 回壓傳遞（O(n) 遞迴）
    // ─────────────────────────────────────────

    /**
     * 根據目標建築的儲量，計算並傳遞回壓阻塞
     *
     * @param {StorageInfo[]} storageInfos  - 所有目標建築的儲量資訊
     * @param {LogisticsSegment[]} segments - 全部線段（用於反向追蹤）
     */
    propagateBackpressure(storageInfos, segments) {
        const newlyBlocked = new Set();

        // Phase 1：識別直接連接到滿載建築的物流線群組
        for (const storage of storageInfos) {
            if (storage.currentItems >= storage.capacity) {
                // 找到所有以此建築為目標的物流線
                for (const seg of segments) {
                    if (seg.targetId === storage.entityId) {
                        newlyBlocked.add(seg.groupId);
                    }
                }
            }
        }

        // Phase 2：BFS 向上游傳遞回壓
        const queue = [...newlyBlocked];
        const visited = new Set(queue);

        while (queue.length > 0) {
            const blockedGroupId = queue.shift();
            this._blockedGroups.add(blockedGroupId);

            // 找到所有以此群組為目標的上游群組（逆向追蹤）
            for (const seg of segments) {
                if (!seg.targetId) continue;
                // 若某線段的 target 是被阻塞群組的 source 建築
                const blockedSegs = this.getSegments(blockedGroupId);
                const blockedSourceId = blockedSegs[0]?.sourceId;
                if (blockedSourceId && seg.targetId === blockedSourceId && !visited.has(seg.groupId)) {
                    visited.add(seg.groupId);
                    queue.push(seg.groupId);
                    newlyBlocked.add(seg.groupId);
                }
            }
        }

        // Phase 3：解除不再滿載的阻塞
        const satEntities = new Set(
            storageInfos
                .filter(s => s.currentItems >= s.capacity)
                .map(s => s.entityId)
        );

        for (const groupId of [...this._blockedGroups]) {
            const segs = this.getSegments(groupId);
            const targetId = segs[0]?.targetId;
            if (targetId && !satEntities.has(targetId)) {
                this._blockedGroups.delete(groupId);
            }
        }

        if (newlyBlocked.size > 0) {
            this.emit('backpressure:batch', { blockedGroupIds: [...newlyBlocked] });
        }

        return { blockedGroupIds: [...this._blockedGroups] };
    }

    /**
     * 查詢特定群組是否被回壓阻塞
     * @param {string} groupId
     * @returns {boolean}
     */
    isGroupBlocked(groupId) {
        return this._blockedGroups.has(groupId);
    }

    /**
     * 手動解除特定群組的阻塞
     * @param {string} groupId
     */
    unblockGroup(groupId) {
        this._blockedGroups.delete(groupId);
    }

    /**
     * 清除所有阻塞狀態（用於測試或重置）
     */
    clearAllBlocks() {
        this._blockedGroups.clear();
    }

    // ─────────────────────────────────────────
    // 8. 物品運輸主循環（陣列偏移運輸法）
    // ─────────────────────────────────────────

    /**
     * 每幀批次更新所有物品位置
     *
     * 設計原則（效能協議）：
     * - 每幀僅更新全域 offset，物品不個別移動（O(n)）
     * - 被阻塞的群組直接跳過（O(1) 查詢）
     *
     * @param {number} dt             - 幀時間差（秒）
     * @param {number} tileSize       - 格子像素尺寸
     * @returns {{ moved: number, blocked: number }}
     */
    tickTransport(dt, tileSize = 64) {
        let moved = 0;
        let blocked = 0;

        for (const [itemId, item] of this._items) {
            // 被回壓阻塞 → 不移動
            if (this._blockedGroups.has(item.lineGroupId)) {
                item.blocked = true;
                blocked++;
                continue;
            }

            item.blocked = false;
            const segs = this.getSegments(item.lineGroupId);
            if (segs.length === 0) {
                this._items.delete(itemId);
                continue;
            }

            const seg = segs[item.index] || segs[segs.length - 1];
            if (!seg) continue;

            // 速度（格/秒）= efficiency，預設 1.0
            const speed = Math.max(0.1, Number(seg.efficiency) || 1.0);
            const moveAmount = speed * dt;

            item.offset += moveAmount;

            // 物品抵達線段終點 → 前進到下一線段
            while (item.offset >= 1.0 && item.index < segs.length - 1) {
                item.offset -= 1.0;
                item.index++;
            }

            // 抵達最終線段終點 → 嘗試進入目標建築
            if (item.offset >= 1.0 && item.index >= segs.length - 1) {
                const targetId = seg.targetId;
                this.emit('item:arrived', { item, targetId });
                this._items.delete(itemId);
                continue;
            }

            moved++;
        }

        return { moved, blocked };
    }

    /**
     * 將新物品加入物流線
     * @param {string} itemId
     * @param {string} type       - 物品種類
     * @param {string} lineGroupId
     */
    enqueueItem(itemId, type, lineGroupId) {
        if (this._blockedGroups.has(lineGroupId)) return false;
        if (this._items.has(itemId)) return false;

        this._items.set(itemId, {
            id: itemId,
            type,
            index: 0,
            offset: 0.0,
            lineGroupId,
            blocked: false
        });

        this.emit('item:enqueued', { itemId, type, lineGroupId });
        return true;
    }

    /**
     * 取得物流線末端等待輸出的物品
     * @param {string} groupId
     * @returns {TransportItem[]}
     */
    _getItemsAtEnd(groupId) {
        const segs = this.getSegments(groupId);
        const lastIndex = segs.length - 1;
        const result = [];
        for (const item of this._items.values()) {
            if (item.lineGroupId === groupId && item.index >= lastIndex && item.offset >= 0.9) {
                result.push(item);
            }
        }
        return result;
    }

    /**
     * 將物品轉移至另一條物流線的起點
     * @param {TransportItem} item
     * @param {string} targetGroupId
     */
    _transferItemToLine(item, targetGroupId) {
        this._items.delete(item.id);
        const newItem = { ...item, lineGroupId: targetGroupId, index: 0, offset: 0.0, blocked: false };
        this._items.set(item.id, newItem);
        this.emit('item:transferred', { item: newItem });
    }

    // ─────────────────────────────────────────
    // 9. 狀態查詢 API
    // ─────────────────────────────────────────

    /**
     * 取得所有物品快照（用於渲染層讀取）
     * @returns {TransportItem[]}
     */
    getItemSnapshot() {
        return [...this._items.values()];
    }

    /**
     * 取得指定物流線的物品
     * @param {string} groupId
     * @returns {TransportItem[]}
     */
    getItemsByGroup(groupId) {
        return [...this._items.values()].filter(item => item.lineGroupId === groupId);
    }

    /**
     * 取得所有阻塞群組 ID
     * @returns {string[]}
     */
    getBlockedGroups() {
        return [...this._blockedGroups];
    }

    /**
     * 取得合流節點快照（用於測試驗證）
     * @returns {MergeNode[]}
     */
    getMergeNodes() {
        return [...this._mergeNodes.values()];
    }

    /**
     * 重置所有狀態（用於測試）
     */
    reset() {
        this._items.clear();
        this._mergeNodes.clear();
        this._splitNodes.clear();
        this._segmentCache.clear();
        this._pathLengthCache.clear();
        this._blockedGroups.clear();
    }
}

// 導出單例（可被 ConveyorManager 引用）
export const transportLogic = new TransportLogic();
