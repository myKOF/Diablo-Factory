// [Web Worker] 主執行緒橋接:管理物流運動學 worker、雙向狀態同步。
// 預設不啟用(見 LogisticsTransferSystem 的旗標);啟用時把昂貴的運動學移出主執行緒。
//
// 模型:worker 持有權威運動學狀態並推進;主執行緒擁有「派發(spawn)」與「入庫(deliver)」。
//   每 tick:pullResult() 套用上一批 worker 結果(更新位置 + 取得抵達事件,抵達者由呼叫端入庫並移除),
//            pushStep() 把本 tick 新增/移除的物品與 deltaTime 送給 worker 計算(結果於後續 tick 套用)。
// 代價:1-tick(約 50ms@20Hz)非同步延遲;運動學計算與主執行緒並行。
export class LogisticsWorkerBridge {
    constructor(workerUrl) {
        this.worker = new Worker(workerUrl, { type: 'module' });
        this.worker.onmessage = (e) => this._onMessage(e.data);
        this.latest = null;          // 最近一次 worker 結果(尚未套用)
        this.seq = 0;
        this.sentIds = new Set();     // 已送交 worker 的 transfer id
        this.topoSig = null;
        this.ready = true;
        // [流量控制] worker 在高物品數時單步運算可能 > tick 間隔(實測 1000 物品 ~61ms > 50ms)。
        // 若每 tick 無條件送 step,worker queue 會無上限堆積、越落越後,新發物品在 worker ack 前
        // progress 停在 0(卡起點)→ 該線稀疏 + canStartTransfer 擋下後續發料,且隨數量惡化。
        // 解法:最多 1 個 in-flight step;期間累積 deltaTime,下一步一次涵蓋(落後時步長變粗但不失真)。
        this.inFlight = false;
        this._pendingDt = 0;
        this._pendingState = null;
        this._pendingTileSize = 20;
    }

    _onMessage(msg) {
        if (msg && msg.type === 'result') {
            this.latest = msg;
            this.inFlight = false;
            // worker 完成上一步;期間若有累積的時間/新增物品,立即送出下一步,避免空轉。
            if (this._pendingDt > 0 && this._pendingState) this._flush();
        }
    }

    _topologySignature(state) {
        const lines = state.logisticsLines || [];
        const nodes = state.logisticsMergeNodes || [];
        let s = `${lines.length}|${nodes.length}`;
        for (let i = 0; i < lines.length; i++) {
            const rp = lines[i] && lines[i].routePoints;
            s += `;${lines[i] && (lines[i].id || lines[i].groupId) || ''}:${Array.isArray(rp) ? rp.length : 0}`;
        }
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            s += `;${n && n.cellKey || ''}>${n && n.outputGroupId || ''}<${(n && n.inputGroupIds || []).join(',')}`;
        }
        return s;
    }

    // 若拓樸變更,送整份線段 + 節點(含節點當前排程狀態,等同既有「拓樸變更重置」語意)。
    _maybeSyncTopology(state, tileSize) {
        const sig = this._topologySignature(state);
        if (sig === this.topoSig) return;
        this.topoSig = sig;
        this.worker.postMessage({
            type: 'topology',
            tileSize,
            lines: (state.logisticsLines || []).map(l => structuredCloneSafe(l)),
            nodes: (state.logisticsMergeNodes || []).map(n => structuredCloneSafe(n))
        });
        // 拓樸變更:已送物品集合失效,下一個 step 會以 adds 重送仍存在者
        this.sentIds.clear();
    }

    // 套用最近一批 worker 運動學結果到主執行緒的 transfer 物件;回傳抵達事件供呼叫端入庫。
    // 抵達者會從 state.activeTransfers 移除。
    pullResult(state) {
        const msg = this.latest;
        this.latest = null;
        if (!msg) return [];
        const byId = new Map();
        for (const t of state.activeTransfers) if (t && t.id) byId.set(t.id, t);
        for (const k of msg.kin) {
            const t = byId.get(k.id);
            if (!t) continue;
            // [合流重映射] 先套用換線(若有):worker 內部合流交接已把物品移到輸出線,主執行緒必須同步
            // routePoints/lineId/targetPoint 等,否則渲染仍沿舊輸入線路徑 → 物品在合流點後消失/卡住,
            // 且 targetId 未更新會讓入庫判定失準。換陣列參照同時自動失效以參照為鍵的渲染/邏輯幾何快取。
            if (k.remap) {
                t.lineId = k.remap.lineId;
                t.routePoints = k.remap.routePoints;
                t.targetPoint = k.remap.targetPoint;
                t.targetId = k.remap.targetId;
                t.targetPort = k.remap.targetPort;
                t.sourceId = k.remap.sourceId;
                t.efficiency = k.remap.efficiency;
                t._logicRouteMetrics = undefined;
                t._logicRouteMetricsPoints = undefined;
                t._logicRouteMetricsKey = undefined;
            }
            t.progress = k.progress;
            t.transportIndex = k.transportIndex;
            t.transportOffset = k.transportOffset;
            t.maxAllowedProgress = k.maxAllowedProgress;
            if (k.queueBlocked) t.queueBlocked = true; else delete t.queueBlocked;
            if (k.mergeVisualTurn) t._mergeVisualTurn = k.mergeVisualTurn; else delete t._mergeVisualTurn;
        }
        const arrivals = [];
        if (msg.arrivals && msg.arrivals.length) {
            const arrivedIds = new Set(msg.arrivals.map(a => a.id));
            for (const a of msg.arrivals) {
                const t = byId.get(a.id);
                arrivals.push({ id: a.id, targetId: a.targetId, itemType: a.itemType, transfer: t });
                this.sentIds.delete(a.id);
            }
            state.activeTransfers = state.activeTransfers.filter(t => !arrivedIds.has(t.id));
        }
        return arrivals;
    }

    // [流量控制] 累積本 tick 的 deltaTime;worker 閒置時才真正送出 step(否則等它回覆再送)。
    // 累積上限 0.2(與 logicTick 的 deltaTime 上限一致):極端落後時退化為慢動作而非物品瞬移。
    pushStep(state, deltaTime, tileSize) {
        this._pendingDt = Math.min(this._pendingDt + deltaTime, 0.2);
        this._pendingState = state;
        this._pendingTileSize = tileSize;
        // 看門狗:若上一步逾 500ms 仍無回覆(訊息遺失/worker 卡住),解除 in-flight 以免永久凍結。
        if (this.inFlight && this._lastFlushTime && (performance.now() - this._lastFlushTime > 500)) {
            this.inFlight = false;
        }
        if (!this.inFlight) this._flush();
    }

    _flush() {
        const state = this._pendingState;
        if (!state) return;
        this._maybeSyncTopology(state, this._pendingTileSize);
        const adds = [];
        const liveIds = new Set();
        for (const t of state.activeTransfers) {
            if (!t || !t.id) continue;
            liveIds.add(t.id);
            if (!this.sentIds.has(t.id)) {
                adds.push(structuredCloneSafe(t));
                this.sentIds.add(t.id);
            }
        }
        const removes = [];
        for (const id of this.sentIds) {
            if (!liveIds.has(id)) { removes.push(id); this.sentIds.delete(id); }
        }
        const dt = this._pendingDt;
        this._pendingDt = 0;
        this.inFlight = true;
        this._lastFlushTime = performance.now();
        this.worker.postMessage({ type: 'step', seq: ++this.seq, deltaTime: dt, adds, removes });
    }

    dispose() {
        if (this.worker) { this.worker.terminate(); this.worker = null; }
    }
}

// 只複製可序列化的純資料(transfer / line / node 皆為純物件;移除可能的函式/循環)。
function structuredCloneSafe(obj) {
    try {
        return JSON.parse(JSON.stringify(obj, (key, value) => {
            // 跳過渲染層快取等以底線開頭的暫存欄位(_renderXXX / _logicRouteMetrics 等),但保留 _mergeVisualTurn
            if (typeof key === 'string' && key.startsWith('_') && key !== '_mergeVisualTurn') return undefined;
            return value;
        }));
    } catch {
        return obj;
    }
}
