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

self.onmessage = (e) => {
    const msg = e.data;
    if (!msg) return;
    if (msg.type === 'topology') {
        TILE_SIZE = msg.tileSize || 20;
        fakeEngine.TILE_SIZE = TILE_SIZE;
        state.logisticsLines = Array.isArray(msg.lines) ? msg.lines : [];
        state.logisticsMergeNodes = Array.isArray(msg.nodes) ? msg.nodes : [];
        routeInternBySig.clear(); // 拓樸變更:舊路線簽章可能失效,清空內聯表避免無限增長
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

        const kin = state.activeTransfers.map(t => {
            const entry = {
                id: t.id,
                progress: t.progress,
                transportIndex: t.transportIndex,
                transportOffset: t.transportOffset,
                maxAllowedProgress: t.maxAllowedProgress,
                queueBlocked: t.queueBlocked === true,
                mergeVisualTurn: t._mergeVisualTurn || null
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

        self.postMessage({ type: 'result', seq: msg.seq, kin, arrivals: arrived, appliedSimTime, computeMs: _computeMs });
    }
};
