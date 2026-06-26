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

function applyAdds(adds) {
    if (!Array.isArray(adds)) return;
    for (const t of adds) {
        if (!t || !t.id) continue;
        byId.set(t.id, t);
    }
}
function applyRemoves(removes) {
    if (!Array.isArray(removes)) return;
    for (const id of removes) byId.delete(id);
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
        for (const a of arrived) byId.delete(a.id);

        const kin = state.activeTransfers.map(t => ({
            id: t.id,
            progress: t.progress,
            transportIndex: t.transportIndex,
            transportOffset: t.transportOffset,
            maxAllowedProgress: t.maxAllowedProgress,
            queueBlocked: t.queueBlocked === true,
            mergeVisualTurn: t._mergeVisualTurn || null
        }));

        self.postMessage({ type: 'result', seq: msg.seq, kin, arrivals: arrived });
    }
};
