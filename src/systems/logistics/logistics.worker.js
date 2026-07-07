// [Web Worker] 物流運動學工作執行緒。
// 持有「權威」的模擬狀態(線段 / 合流節點 / 移動中物品 + 其路徑),每收到一次 step 就跑共用的
// runLogisticsKinematics,回傳每個物品的運動學(progress/index/offset/maxAllowedProgress/queueBlocked)
// 與抵達事件。入庫/發料留在主執行緒。
//
// 協議:
//   主→worker  { type:'topology', tileSize, lines, nodes }          // 拓樸變更時(含節點排程狀態)
//   主→worker  { type:'step', deltaTime, adds:[transfer], removes:[id] }
//   worker→主  { type:'result', seq, kin:[{id,...}], arrivals:[{id,targetId,itemType}] }

import { LogisticsSimContext } from './LogisticsSimContext.js';
import { runLogisticsKinematics } from './LogisticsKinematics.js';
import { logisticsTransportArrayState } from './LogisticsTransportArrayState.js';
import { routePointsSignature } from './LogisticsRouteCache.js';
import { getPathDistanceToPoint, getPathTotalLength, getPointOnPathProgress } from './LogisticsPathMetrics.js';

let TILE_SIZE = 20;
const state = {
    logisticsLines: [],
    logisticsMergeNodes: [],
    activeTransfers: [],
    mapEntities: [],
    resources: {}
};
const fakeEngine = { TILE_SIZE, state, getEntityConfig: () => null };
const simCtx = new LogisticsSimContext(() => fakeEngine);
const byId = new Map(); // id -> transfer(含 routePoints)
// [合流重映射] 記住「上次回報給主執行緒時」每個物品的 routePoints 參照。worker 內部合流交接會把
// transfer.routePoints 換成輸出線的新陣列(參照改變);偵測到參照變動即把新路線/身分一併回報,
// 否則主執行緒仍以舊輸入線路徑渲染 → 物品在合流點後看似消失/卡住。
const routeRefById = new Map(); // id -> 上次回報的 routePoints 參照
let appliedSimTime = 0; // worker 累計已推進的模擬時間(秒);回報給主執行緒估算位置落後量
let topoEpoch = 0; // [拓樸紀元] 最近套用的拓樸版本;隨結果回報,讓主執行緒辨識「過期拓樸算出的 remap」並略過

// [TEMP-DIAG][worker 內部狀態追查] 純記錄,不改邏輯,問題定位後移除。
// 即時 console.warn 在 20Hz 下會洗版看不清楚,改為錄進固定長度緩衝區,由主執行緒喊話一次性取出。
let DIAG_MODE = null; // null=關閉;'*'=監控全部線;其他字串=只監控該 lineId(降低量用)
const _diagFrozenCountByLine = new Map(); // lineId -> 上次凍結物品數,監控多線時逐線邊緣觸發
const _diagBuffer = [];
const DIAG_BUFFER_MAX = 300;
function pushDiag(entry) {
    const full = { t: Date.now(), ...entry };
    _diagBuffer.push(full);
    if (_diagBuffer.length > DIAG_BUFFER_MAX) _diagBuffer.shift();
    // [TEMP-DIAG] 同步即時轉發(entry 本身已是邊緣觸發,量少),讓主執行緒能把它寫進遊戲內日誌系統
    // (分類 LOGISTICS),藉此被錄製功能一併收進匯出腳本,不必再靠手動 console dump 來回貼log。
    self.postMessage({ type: 'diagEvent', entry: full });
}

// [效能] 路線內聯(interning):主執行緒每個 transfer 各自序列化路線,worker 反序列化後成為「座標相同但
// 參照不同」的獨立陣列。所有以 routePoints 參照為鍵的快取(getManhattanSegments / routePointsSignature /
// getCachedPathMetrics / 路線度量)與 kinematics 的 useCanonical 引用相等捷徑因此全部 miss → 同一條線上
// 數百物品的路線幾何被逐物品重算,單步計算成本隨「路線點數 × 物品數」線性飆升(實測 800點×800物品 ~119ms)。
// 解法:同簽章(座標相同)的路線共用同一陣列實例 → 所有參照快取命中、useCanonical 走 O(1) 捷徑。
// 路線唯讀(kinematics 只讀;合流換線是重新賦值新陣列,非就地改),共用安全。
const routeInternBySig = new Map(); // signature -> 共用 routePoints 陣列
function internRoute(points) {
    if (!Array.isArray(points) || points.length < 2) return points;
    const sig = routePointsSignature(points);
    const existing = routeInternBySig.get(sig);
    if (existing) return existing;
    routeInternBySig.set(sig, points);
    return points;
}

function applyAdds(adds) {
    if (!Array.isArray(adds)) return;
    for (const t of adds) {
        if (!t || !t.id) continue;
        // [TEMP-DIAG] 兩種情況都要抓:(a) 重送(re-add,同 id 覆蓋既有項)有沒有把舊的落差修正掉,
        // (b) 送進來的這筆本身(不論是不是第一次)routeEnd 跟 targetPoint 是否本來就對不上——
        // 只檢查前者會漏掉「送進來的資料本身就在這一刻才產生落差」的情況。只在超出容差時才記。
        const existing = byId.get(t.id);
        if (DIAG_MODE) {
            const newEndRaw = Array.isArray(t.routePoints) && t.routePoints.length ? t.routePoints[t.routePoints.length - 1] : null;
            const newTP = t.targetPoint;
            const newMismatch = (newEndRaw && newTP) ? Math.hypot((newEndRaw.x || 0) - newTP.x, (newEndRaw.y || 0) - newTP.y) : 0;
            let oldMismatch = null;
            let oldEnd = null;
            let oldTP = null;
            if (existing) {
                oldEnd = Array.isArray(existing.routePoints) && existing.routePoints.length ? existing.routePoints[existing.routePoints.length - 1] : null;
                oldTP = existing.targetPoint;
                oldMismatch = (oldEnd && oldTP) ? Math.hypot((oldEnd.x || 0) - oldTP.x, (oldEnd.y || 0) - oldTP.y) : 0;
            }
            if (newMismatch > TILE_SIZE * 1.5 || (oldMismatch !== null && oldMismatch > TILE_SIZE * 1.5)) {
                pushDiag({
                    kind: existing ? 'readdMismatch' : 'freshAddMismatch',
                    id: t.id, lineId: t.lineId,
                    oldMismatch: oldMismatch === null ? null : Math.round(oldMismatch),
                    newMismatch: Math.round(newMismatch),
                    oldEnd, oldTargetPoint: oldTP, newEnd: newEndRaw, newTargetPoint: newTP,
                    newProgress: +((+t.progress) || 0).toFixed(4)
                });
            }
        }
        // 同路線的物品共用一份 routePoints 陣列,讓參照快取命中(見上)。
        if (t.routePoints) t.routePoints = internRoute(t.routePoints);
        byId.set(t.id, t);
        // 新增物品的路線與主執行緒一致,先記下參照;僅 worker 內部之後的變動才需重映射回報。
        routeRefById.set(t.id, t.routePoints);
    }
}
function applyRemoves(removes) {
    if (!Array.isArray(removes)) return;
    for (const id of removes) { byId.delete(id); routeRefById.delete(id); }
}

// [拓樸變更自癒] worker 持有在途物品的權威路線。線段被中段延伸切分/重塑後,「已合流到輸出線」的在途物品
// 其 routePoints 仍指向已切離的舊下游(失效),而 worker 不會自行重算 → 物品續走舊路、到不了新尾段堵死。
// 收到新拓樸時,對每個位於「合流輸出群組」的在途物品,以新的合流輸出路線重建路線並把目前位置投影過去;
// routePoints 參照改變後,下個 result 會經 remap 通道把新路線/targetPoint 回報主執行緒。
function rerouteMergedTransfersOnTopologyChange() {
    const nodes = Array.isArray(state.logisticsMergeNodes) ? state.logisticsMergeNodes : [];
    if (!nodes.length || byId.size === 0) return;
    const outRouteByGroup = new Map();
    const getOutRoute = (groupId) => {
        if (outRouteByGroup.has(groupId)) return outRouteByGroup.get(groupId);
        const node = nodes.find(n => n && n.outputGroupId === groupId && Array.isArray(n.inputGroupIds) && n.inputGroupIds.length > 0);
        let route = null;
        if (node && typeof simCtx.getLogisticsMergeNodeOutputRoute === 'function') {
            const r = simCtx.getLogisticsMergeNodeOutputRoute(node);
            if (Array.isArray(r) && r.length >= 2) route = r;
        }
        outRouteByGroup.set(groupId, route);
        return route;
    };
    for (const t of byId.values()) {
        if (!t || !Array.isArray(t.routePoints) || t.routePoints.length < 2) continue;
        const newRoute = getOutRoute(t.lineId);
        if (!newRoute) continue;
        const oldEnd = t.routePoints[t.routePoints.length - 1];
        const newEnd = newRoute[newRoute.length - 1];
        if (oldEnd && Math.hypot((oldEnd.x || 0) - newEnd.x, (oldEnd.y || 0) - newEnd.y) < 2) continue; // 末端已一致
        const pos = getPointOnPathProgress(t.routePoints, t.progress);
        const newRP = newRoute.map(p => ({ x: p.x, y: p.y }));
        const total = getPathTotalLength(newRP);
        const along = pos ? getPathDistanceToPoint(newRP, pos) : 0;
        t.routePoints = internRoute(newRP);
        t.targetPoint = { x: newEnd.x, y: newEnd.y };
        t.progress = total > 0 ? Math.max(0, Math.min(1, along / total)) : 0;
    }
}

self.onmessage = (e) => {
    const msg = e.data;
    if (!msg) return;
    if (msg.type === 'diag') {
        // [TEMP-DIAG] 主執行緒呼叫 setLogisticsWorkerLineDiag(lineId) 送來此訊息以開關追查目標。
        // lineId 為 '*' 時監控全部線(逐線邊緣觸發,量仍受控);給特定 lineId 時只監控該線。
        DIAG_MODE = msg.lineId || null;
        _diagFrozenCountByLine.clear();
        return;
    }
    if (msg.type === 'diagDump') {
        // [TEMP-DIAG] 主執行緒呼叫 dumpLogisticsWorkerDiag() 送來此訊息,一次性取回緩衝區內容。
        self.postMessage({ type: 'diagDumpResult', entries: _diagBuffer.slice() });
        return;
    }
    if (msg.type === 'remove') {
        applyRemoves(msg.ids);
        state.activeTransfers = Array.from(byId.values());
        return;
    }
    if (msg.type === 'topology') {
        // [TEMP-DIAG] 拓樸變更當下的快照:此時 state.logisticsLines 尚未套用 msg.lines,故先記「變更前」。
        // 逐 groupId 統計線段數,只回報「段數實際有變化」的群組(新建線/分支/合併都會反映在段數上),
        // 監控全部線('*')時也只有真的異動的線才會產生一筆,不會每次拓樸同步都洗版。
        if (DIAG_MODE) {
            const countByGroup = (lines) => {
                const m = new Map();
                for (const l of lines) {
                    if (!l) continue;
                    const gid = l.groupId || l.id;
                    if (!gid) continue;
                    m.set(gid, (m.get(gid) || 0) + 1);
                }
                return m;
            };
            const beforeMap = countByGroup(state.logisticsLines);
            const afterLines = Array.isArray(msg.lines) ? msg.lines : [];
            const afterMap = countByGroup(afterLines);
            const watchIds = DIAG_MODE === '*'
                ? new Set([...beforeMap.keys(), ...afterMap.keys()])
                : new Set([DIAG_MODE]);
            const changed = [];
            for (const gid of watchIds) {
                const before = beforeMap.get(gid) || 0;
                const after = afterMap.get(gid) || 0;
                if (before !== after) changed.push({ lineId: gid, segCountBefore: before, segCountAfter: after });
            }
            if (changed.length) {
                pushDiag({
                    kind: 'topology',
                    topoEpoch: msg.topoEpoch,
                    changed,
                    totalLinesAfter: afterLines.length,
                    mergeNodesAfter: (Array.isArray(msg.nodes) ? msg.nodes : []).length
                });
            }
        }
        TILE_SIZE = msg.tileSize || 20;
        fakeEngine.TILE_SIZE = TILE_SIZE;
        state.logisticsLines = Array.isArray(msg.lines) ? msg.lines : [];
        state.logisticsMergeNodes = Array.isArray(msg.nodes) ? msg.nodes : [];
        if (Number.isFinite(msg.topoEpoch)) topoEpoch = msg.topoEpoch;
        routeInternBySig.clear(); // 拓樸變更:舊路線簽章可能失效,清空內聯表避免無限增長
        rerouteMergedTransfersOnTopologyChange();
        return;
    }
    if (msg.type === 'step') {
        applyRemoves(msg.removes);
        applyAdds(msg.adds);
        state.activeTransfers = Array.from(byId.values());
        // [發料防稀疏] 累計 worker 實際推進的模擬時間,回報主執行緒以估算「位置落後量」。
        // 主執行緒的發料閘 canStartTransfer 用此 lag 把(落後的)位置投影到當下,避免因落後而把物品發得太疏。
        appliedSimTime += Number(msg.deltaTime) || 0;

        const _computeT0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        // [效能] 開「計算快取窗口」——與主執行緒 processAutomatedLogistics 一致。合流節點/線段拓樸查詢
        // (getSegmentsByGroupId / getLogisticsMergeNodeOutputRoute / 拓樸有效性)在窗口內 per-node 記憶化,
        // 否則 worker 直接呼叫 runLogisticsKinematics 不開窗口 → 合流計算退回逐 transfer×逐子步的 O(n²)
        // (實測使用者 800+ 物品含合流時 worker計算ms 達 ~190ms)。窗口內只讀記憶化、同步單執行緒,安全。
        let arrivals;
        if (typeof simCtx.beginLogisticsComputeCache === 'function') simCtx.beginLogisticsComputeCache();
        try {
            ({ arrivals } = runLogisticsKinematics(
                { simSystem: simCtx, engine: fakeEngine, transportArrayState: logisticsTransportArrayState },
                state,
                msg.deltaTime
            ));
        } finally {
            if (typeof simCtx.endLogisticsComputeCache === 'function') simCtx.endLogisticsComputeCache();
        }
        const _computeMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - _computeT0;

        // kinematics 已將抵達者移出 state.activeTransfers;同步從 byId 移除
        const arrived = arrivals.map(a => ({ id: a.id, targetId: a.targetId, itemType: a.itemType }));
        for (const a of arrived) { byId.delete(a.id); routeRefById.delete(a.id); }

        // [TEMP-DIAG] 每步結束後檢查追查目標(單線或全部線)是否進入「凍結」狀態(maxAllowedProgress ==
        // progress 且非正常排隊卡住),逐線邊緣觸發印出前幾筆完整欄位,避免每 tick 洗版。監控全部線時
        // 按 lineId 分組各自比較,只有真的「凍結物品數變化」的那條線才產生一筆。
        if (DIAG_MODE) {
            const groups = new Map(); // lineId -> items[]
            for (const t of state.activeTransfers) {
                if (!t) continue;
                if (DIAG_MODE !== '*' && t.lineId !== DIAG_MODE) continue;
                let arr = groups.get(t.lineId);
                if (!arr) { arr = []; groups.set(t.lineId, arr); }
                arr.push(t);
            }
            const routeTotal = (points) => Array.isArray(points)
                ? points.reduce((s, p, i, arr) => i === 0 ? 0 : s + Math.abs(p.x - arr[i - 1].x) + Math.abs(p.y - arr[i - 1].y), 0)
                : 0;
            const pt = (p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))
                ? { x: Math.round(Number(p.x)), y: Math.round(Number(p.y)) }
                : null;
            for (const [lineId, items] of groups) {
                const frozen = items.filter(t => {
                    const mp = t.maxAllowedProgress !== undefined ? t.maxAllowedProgress : 1;
                    return Math.abs(mp - (t.progress || 0)) < 1e-6 && (t.progress || 0) > 0.001 && t.queueBlocked !== true;
                });
                const prevCount = _diagFrozenCountByLine.has(lineId) ? _diagFrozenCountByLine.get(lineId) : -1;
                if (frozen.length !== prevCount) {
                    pushDiag({
                        kind: 'frozenChange',
                        lineId,
                        seq: msg.seq, itemCount: items.length,
                        frozenCountBefore: prevCount, frozenCountNow: frozen.length,
                        sample: frozen.slice(0, 5).map(t => {
                            const route = Array.isArray(t.routePoints) ? t.routePoints : [];
                            const total = routeTotal(route);
                            const endPt = route.length >= 2 ? route[route.length - 1] : null;
                            const targetPoint = t.targetPoint || null;
                            const targetPort = t.targetPort || null;
                            const currentDistance = total > 0
                                ? logisticsTransportArrayState.getTransferDistance(t, total, TILE_SIZE)
                                : 0;
                            const reachedTargetPoint = !targetPoint || (endPt &&
                                (Math.abs(endPt.x - targetPoint.x) + Math.abs(endPt.y - targetPoint.y)) <= TILE_SIZE * 1.5);
                            const reachedTargetPort = !!targetPort && endPt &&
                                (Math.abs(endPt.x - targetPort.x) + Math.abs(endPt.y - targetPort.y)) <= TILE_SIZE * 1.5;
                            const reachedTarget = reachedTargetPoint || reachedTargetPort;
                            const terminalGateArrival = !!t.targetId && reachedTarget && total > 0 &&
                                currentDistance >= total - TILE_SIZE - 0.1;
                            return {
                                id: t.id, progress: +((+t.progress) || 0).toFixed(4),
                                targetId: t.targetId || null,
                                targetPoint: pt(targetPoint),
                                targetPort: pt(targetPort),
                                routeEnd: pt(endPt),
                                maxAllowedProgress: t.maxAllowedProgress,
                                queuedDistance: t._queuedDistance,
                                routeLen: route.length,
                                routeTotalPixels: total,
                                currentDistance: Math.round(currentDistance),
                                distanceToEnd: Math.round(Math.max(0, total - currentDistance)),
                                queueBlocked: t.queueBlocked === true,
                                transportIndex: t.transportIndex, transportOffset: t.transportOffset,
                                arrivalGate: {
                                    reachedTargetPoint,
                                    reachedTargetPort,
                                    reachedTarget,
                                    terminalGateArrival
                                }
                            };
                        })
                    });
                    _diagFrozenCountByLine.set(lineId, frozen.length);
                }
            }
            // 清掉已消失的線,避免 Map 無限增長,也避免同 lineId 重新出現時被誤判為延續舊狀態
            if (_diagFrozenCountByLine.size > groups.size) {
                for (const lineId of Array.from(_diagFrozenCountByLine.keys())) {
                    if (!groups.has(lineId)) _diagFrozenCountByLine.delete(lineId);
                }
            }
        }

        const kin = state.activeTransfers.map(t => {
            const entry = {
                id: t.id,
                progress: t.progress,
                transportIndex: t.transportIndex,
                transportOffset: t.transportOffset,
                maxAllowedProgress: t.maxAllowedProgress,
                queueBlocked: t.queueBlocked === true,
                mergeVisualTurn: t._mergeVisualTurn || null,
                // [瞬移防護] 純量是在「worker 這份路線」的座標系算出來的;回報路線總長讓主執行緒
                // 能辨識「主執行緒已換路線(重路由)」的過期純量並拒收,否則舊分數×新總長=物品沿線瞬移。
                routeTotalPixels: Array.isArray(t.routePoints) && t.routePoints.length >= 2
                    ? getPathTotalLength(t.routePoints)
                    : 0
            };
            // [合流重映射] routePoints 參照變了(=worker 內部合流交接換線),把新路線與身分回報主執行緒,
            // 讓渲染改用新輸出線路徑,並更新派發/入庫所需的 targetId/targetPort 等欄位。
            if (routeRefById.get(t.id) !== t.routePoints) {
                routeRefById.set(t.id, t.routePoints);
                entry.remap = {
                    lineId: t.lineId,
                    routePoints: Array.isArray(t.routePoints) ? t.routePoints.map(p => ({ x: p.x, y: p.y })) : t.routePoints,
                    targetPoint: t.targetPoint ? { x: t.targetPoint.x, y: t.targetPoint.y } : null,
                    targetId: t.targetId || null,
                    targetPort: t.targetPort || null,
                    sourceId: t.sourceId || null,
                    efficiency: Number(t.efficiency) || 0
                };
            }
            return entry;
        });

        self.postMessage({ type: 'result', seq: msg.seq, kin, arrivals: arrived, appliedSimTime, computeMs: _computeMs, topoEpoch });
    }
};
