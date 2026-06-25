export class LogisticsLineStore {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
        // [效能] 群組索引快取：僅在「保證不變更線段拓樸」的同步計算窗口(beginGroupCache/endGroupCache)內生效，
        // 將 getSegmentsByGroupId 由每次 O(總線段數) 的 filter+sort 降為 O(1) 查表。窗口外一律即時計算，零陳舊風險。
        this._segCache = null;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    ensure() {
        const state = this.gameEngine.state;
        if (!Array.isArray(state.logisticsLines)) state.logisticsLines = [];
        return state.logisticsLines;
    }

    getForState(state) {
        return Array.isArray(state?.logisticsLines) ? state.logisticsLines : this.ensure();
    }

    getById(lineId) {
        return this.ensure().find(line =>
            line.id === lineId ||
            line.groupId === lineId ||
            this.system.getLogisticsLineSelectionKey(line) === lineId
        ) || null;
    }

    // [效能] 開啟群組索引快取窗口。呼叫端必須保證在 begin/end 之間不變更 logisticsLines 的
    // 結構或 groupId/id/order/routePoints（例如 processAutomatedLogistics 的同步計算期間）。
    beginGroupCache() { this._segCache = new Map(); }
    endGroupCache() { this._segCache = null; }

    getSegmentsByGroupId(groupId) {
        const cache = this._segCache;
        if (cache && cache.has(groupId)) {
            // 回傳副本，避免呼叫端就地排序/修改污染快取
            return cache.get(groupId).slice();
        }
        const result = this.ensure()
            .filter(line => line.groupId === groupId || line.id === groupId)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        if (cache) cache.set(groupId, result);
        return cache ? result.slice() : result;
    }
}
