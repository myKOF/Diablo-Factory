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
    }

    _onMessage(msg) {
        if (msg && msg.type === 'result') this.latest = msg;
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

    // 把本 tick 的新增/移除送給 worker,並請求推進。
    pushStep(state, deltaTime, tileSize) {
        this._maybeSyncTopology(state, tileSize);
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
        this.worker.postMessage({ type: 'step', seq: ++this.seq, deltaTime, adds, removes });
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
