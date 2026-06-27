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

function applyAdds(adds) {
    if (!Array.isArray(adds)) return;
    for (const t of adds) {
        if (!t || !t.id) continue;
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
        return;
    }
    if (msg.type === 'step') {
        applyRemoves(msg.removes);
        applyAdds(msg.adds);
        state.activeTransfers = Array.from(byId.values());

        const { arrivals } = runLogisticsKinematics(
            { simSystem: simCtx, engine: fakeEngine, transportArrayState: logisticsTransportArrayState },
            state,
            msg.deltaTime
        );

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

        self.postMessage({ type: 'result', seq: msg.seq, kin, arrivals: arrived });
    }
};
