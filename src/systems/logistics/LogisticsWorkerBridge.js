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
        this.latest = null;          // 最近一次 worker 結果(尚未套用);kin 為絕對位置,新覆蓋舊無損
        this._arrivalQueue = [];     // [抵達不漏] 抵達是「事件」非絕對狀態:跨多個未消費結果累積,不可被覆蓋丟失
        this.seq = 0;
        this.sentIds = new Set();     // 已送交 worker 的 transfer id
        this.topoSig = null;
        // [拓樸紀元] 每次拓樸變更遞增。worker 結果延遲一拍,變更當下仍在算的舊步會以舊拓樸把正在合流的
        // 物品 remap 到舊輸出路線(指向已切離的舊下游)。其結果回報的紀元 < 當前紀元 → 視為過期,
        // 套用時略過 remap(換線/換路),避免把過期舊路蓋回剛重算好的主執行緒路線。
        this.topoEpoch = 0;
        this.ready = true;
        // [流量控制] worker 在高物品數時單步運算可能 > tick 間隔(實測 1000 物品 ~61ms > 50ms)。
        // 若每 tick 無條件送 step,worker queue 會無上限堆積、越落越後,新發物品在 worker ack 前
        // progress 停在 0(卡起點)→ 該線稀疏 + canStartTransfer 擋下後續發料,且隨數量惡化。
        // 解法:最多 1 個 in-flight step;期間累積 deltaTime,下一步一次涵蓋(落後時步長變粗但不失真)。
        this.inFlight = false;
        this._pendingDt = 0;
        this._pendingState = null;
        this._pendingTileSize = 20;
        // [發料防稀疏] 估算主執行緒位置「落後 worker 多少模擬秒數」:已送出但結果尚未套用的 sim 時間。
        // 發料閘據此把落後的位置投影到當下,否則 worker 落後越多、物品被發得越疏(實測間距 22→31)。
        this.sentSimTime = 0;      // 累計送交 worker 的 dt
        this.appliedSimTime = 0;   // 最近套用結果中 worker 回報的累計已推進 dt
        // [防佇列堆積] worker 單步往返的實測壁鐘時間(EMA)。看門狗閾值依此自適應,
        // 避免「step 比固定 500ms 久」時誤判逾時、在前一步未回前又送新步 → worker 訊息佇列無限堆積、
        // 延遲隨時間越積越大(表現為移動越來越頓、停頓從 0.2s 漲到 1s)。
        this._stepTimeEma = 0;
    }

    // 主執行緒位置相對「當下」落後的模擬秒數估計:在途(已送未套)+ 已累積未送 + 本 tick 即將送出的 dt。
    getPositionLagSeconds(extraDt = 0) {
        const inFlight = Math.max(0, this.sentSimTime - this.appliedSimTime);
        return inFlight + (this._pendingDt || 0) + (extraDt || 0);
    }

    _onMessage(msg) {
        if (msg && msg.type === 'result') {
            // [抵達不漏] 高負載下 worker 會背靠背回多個結果(本函式末端的 _flush 會再觸發下一步),
            // 而主執行緒每 tick 才 pullResult 一次。kin 是絕對位置,只留最新即可;但 arrivals 是一次性事件,
            // 若直接 this.latest = msg 覆蓋舊結果,未消費的舊結果其 arrivals 會永遠遺失 →
            // 物品在 worker 已 byId.delete、主執行緒卻仍留在 activeTransfers(凍結、不再更新、永不入庫),
            // 表現為「產率隨負載逐漸降低 + 線上殘留卡死物品」。故 arrivals 必須跨結果累積。
            if (msg.arrivals && msg.arrivals.length) {
                for (const a of msg.arrivals) this._arrivalQueue.push(a);
            }
            this.latest = msg;
            // [診斷] worker 自報的純計算時間(不含序列化/排程往返),用以區分瓶頸在 kinematics 還是訊息傳遞。
            if (typeof msg.computeMs === 'number') {
                this._computeMsEma = this._computeMsEma ? (this._computeMsEma * 0.7 + msg.computeMs * 0.3) : msg.computeMs;
            }
            // [防佇列堆積] 記錄本步往返壁鐘時間,供自適應看門狗用。
            if (this._lastFlushTime) {
                const stepMs = performance.now() - this._lastFlushTime;
                if (stepMs > 0) this._stepTimeEma = this._stepTimeEma ? (this._stepTimeEma * 0.7 + stepMs * 0.3) : stepMs;
            }
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
        this.topoEpoch++;
        this.worker.postMessage({
            type: 'topology',
            tileSize,
            topoEpoch: this.topoEpoch,
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
        // [抵達不漏] 即使本 tick 沒有新的 kin(msg 為 null),仍可能有跨結果累積、尚未消費的 arrivals 待入庫。
        // [發料防稀疏] 更新 worker 已推進的累計時間(取最新結果),供 getPositionLagSeconds 估算落後量。
        if (msg && typeof msg.appliedSimTime === 'number') this.appliedSimTime = msg.appliedSimTime;
        if (!msg && this._arrivalQueue.length === 0) return [];
        const byId = new Map();
        for (const t of state.activeTransfers) if (t && t.id) byId.set(t.id, t);
        // [拓樸紀元] 此結果若在拓樸變更前算出(紀元落後),其合流 remap 帶的是過期舊輸出路線 → 略過 remap,
        // 保留主執行緒重算後的路線;運動學純量(progress 等)仍套用(位置 1 拍內近似有效)。
        const remapStale = Number.isFinite(msg?.topoEpoch) && msg.topoEpoch !== this.topoEpoch;
        for (let k of (msg ? msg.kin : [])) {
            const t = byId.get(k.id);
            if (!t) continue;
            if (k.remap && remapStale) k = { ...k, remap: null };
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
        // [抵達不漏] 消費跨結果累積的 arrivals(而非僅 msg.arrivals),避免高負載下背靠背結果覆蓋丟事件。
        if (this._arrivalQueue.length) {
            const queued = this._arrivalQueue;
            this._arrivalQueue = [];
            const arrivedIds = new Set(queued.map(a => a.id));
            for (const a of queued) {
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
        // [防佇列堆積] 看門狗只該攔截「真正遺失/卡死的訊息」,不該因 step 比固定門檻久而誤判。
        // 閾值自適應:取實測單步往返 EMA 的 4 倍(下限 1s)。否則高負載下 step>500ms 時每 tick 誤判逾時、
        // 在前一步未回前又送新步 → worker 訊息佇列無限堆積、延遲越積越大(停頓從 0.2s 漲到 1s,且不會自癒)。
        // 維持嚴格「最多 1 個 in-flight」:落後時退化為平順慢動作,而非堆積式越來越頓。
        const watchdogMs = Math.max(1000, this._stepTimeEma * 4);
        if (this.inFlight && this._lastFlushTime && (performance.now() - this._lastFlushTime > watchdogMs)) {
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
        this.sentSimTime += dt; // [發料防稀疏] 累計已送出的模擬時間,供落後量估算
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
