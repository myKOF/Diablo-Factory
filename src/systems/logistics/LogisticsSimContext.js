import { LogisticsLineStore } from './LogisticsLineStore.js';
import { LogisticsLineOrdering } from './LogisticsLineOrdering.js';
import { LogisticsSegmentBuilder } from './LogisticsSegmentBuilder.js';
import { LogisticsTransferQueues } from './LogisticsTransferQueues.js';
import { LogisticsMergeNodeRuntime } from './LogisticsMergeNodeRuntime.js';
import { LogisticsMergeNodeStore } from './LogisticsMergeNodeStore.js';
import { logisticsTransportArrayState } from './LogisticsTransportArrayState.js';

// [Web Worker] 一個「worker 安全」的最小物流模擬系統 facade。
// 它組裝既有的乾淨子模組(line store / 排序 / 合流 runtime / 合流 store / 佇列),
// 並實作這些子模組透過 this.system.X 呼叫的純幾何/查詢介面(從 ConveyorSystem 複製,語意一致)。
// 不 import GameEngine / Phaser / DOM;引擎能力由 getGameEngine 注入(worker 傳假引擎)。
//
// 用途:在 worker(或主執行緒測試)中以 runLogisticsKinematics({ simSystem: ctx, engine, transportArrayState })
// 跑與主執行緒 conveyorSystem 完全等價的運動學模擬。
export class LogisticsSimContext {
    constructor(getGameEngine) {
        this.getGameEngine = getGameEngine;
        this.transportArrayState = logisticsTransportArrayState;
        this.lineStore = new LogisticsLineStore(this, getGameEngine);
        this.lineOrdering = new LogisticsLineOrdering(getGameEngine);
        this.segmentBuilder = new LogisticsSegmentBuilder(getGameEngine);
        this.transferQueues = new LogisticsTransferQueues(this, getGameEngine);
        this.mergeNodeRuntime = new LogisticsMergeNodeRuntime(this, getGameEngine);
        this.mergeNodeStore = new LogisticsMergeNodeStore(this, getGameEngine);
    }

    get gameEngine() { return this.getGameEngine(); }
    get TILE_SIZE() { return this.gameEngine?.TILE_SIZE || 20; }

    // ── 純幾何 / 查詢(與 ConveyorSystem 同實作,語意一致)──
    getCardinalDirection(from, to) {
        if (!from || !to) return null;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
        return Math.abs(dx) >= Math.abs(dy)
            ? { x: Math.sign(dx) || 1, y: 0 }
            : { x: 0, y: Math.sign(dy) || 1 };
    }

    isPointOnSegment(point, start, end, tolerance = 1) {
        if (!point || !start || !end) return false;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq < 0.001) return Math.hypot(point.x - start.x, point.y - start.y) <= tolerance;
        const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq;
        if (t < -0.001 || t > 1.001) return false;
        const projX = start.x + dx * t;
        const projY = start.y + dy * t;
        return Math.hypot(point.x - projX, point.y - projY) <= tolerance;
    }

    getLogisticsConnectionPointKey(point) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
        return `${Math.round(point.x)},${Math.round(point.y)}`;
    }

    getLogisticsLineDirectionAtPoint(line, point) {
        const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
        for (let i = 0; i < points.length - 1; i++) {
            if (this.isPointOnSegment(point, points[i], points[i + 1], this.TILE_SIZE * 0.25)) {
                return this.getCardinalDirection(points[i], points[i + 1]);
            }
        }
        if (points.length >= 2) return this.getCardinalDirection(points[0], points[points.length - 1]);
        return null;
    }

    doesLogisticsLineContainConnectionPoint(line, point, tolerance = 1, blockedKey = null) {
        if (!line || !point) return false;
        const pointKey = blockedKey || this.getLogisticsConnectionPointKey(point);
        if (pointKey && line.suppressedOpenEndpointCellKey === pointKey) return false;
        const points = Array.isArray(line.routePoints) ? line.routePoints : [];
        for (let i = 0; i < points.length - 1; i++) {
            if (this.isPointOnSegment(point, points[i], points[i + 1], tolerance)) return true;
        }
        return points.some(p =>
            Number.isFinite(p?.x) && Number.isFinite(p?.y) &&
            Math.hypot(p.x - point.x, p.y - point.y) <= tolerance
        );
    }

    doesLogisticsGroupContainConnectionPoint(groupId, point, tolerance = 1, state = this.gameEngine.state, blockedKey = null) {
        if (!groupId || !point) return false;
        return this.getLogisticsLinesForState(state).some(line =>
            (line?.groupId || line?.id || null) === groupId &&
            this.doesLogisticsLineContainConnectionPoint(line, point, tolerance, blockedKey)
        );
    }

    isLogisticsMergeNodeInputConnectionIntact(node, inputGroupId, state = this.gameEngine.state) {
        if (!node || !inputGroupId || !node.outputGroupId) return false;
        if (!Array.isArray(node.inputGroupIds) || !node.inputGroupIds.includes(inputGroupId)) return false;
        const point = node.point || (Number.isFinite(node.x) && Number.isFinite(node.y) ? { x: node.x, y: node.y } : null);
        if (!point) return false;
        const tolerance = Math.max(1, (this.TILE_SIZE || 20) * 0.75);
        const key = node.cellKey || this.getLogisticsConnectionPointKey(point);
        return this.doesLogisticsGroupContainConnectionPoint(node.outputGroupId, point, tolerance, state, key) &&
            this.doesLogisticsGroupContainConnectionPoint(inputGroupId, point, tolerance, state, key);
    }

    // ── 委派至子模組 ──
    getLogisticsLinesForState(state = this.gameEngine.state) { return this.lineStore.getForState(state); }
    getLogisticsSegmentsByGroupId(groupId) { return this.lineStore.getSegmentsByGroupId(groupId); }
    orderLogisticsSegmentsByDirection(segments) { return this.lineOrdering.orderByDirection(segments); }
    snapPointToGridCenter(point) { return this.segmentBuilder.snapPointToGridCenter(point); }
    ensureLogisticsMergeNodeStore(state = this.gameEngine.state) { return this.mergeNodeStore.ensureLogisticsMergeNodeStore(state); }
    getLogisticsMergeNodeForInputTransfer(transfer, state = this.gameEngine.state) { return this.mergeNodeStore.getLogisticsMergeNodeForInputTransfer(transfer, state); }
    isLogisticsMergeInputTransfer(transfer, state = this.gameEngine.state) { return this.mergeNodeStore.isLogisticsMergeInputTransfer(transfer, state); }
    getLogisticsMergeNodeOutputRoute(node) { return this.mergeNodeStore.getLogisticsMergeNodeOutputRoute(node); }
    getLogisticsMergeAdmissionWinner(node, state = this.gameEngine.state, options = {}) { return this.mergeNodeRuntime.getLogisticsMergeAdmissionWinner(node, state, options); }
    getLogisticsMergeThroughYieldLimit(transfer, state = this.gameEngine.state, spacing) { return this.mergeNodeRuntime.getMergeThroughYieldLimit(transfer, state, spacing); }
    applyLogisticsMergeNodes(state = this.gameEngine.state) { return this.mergeNodeRuntime.apply(state); }
    applyBlockedTransferQueues(state = this.gameEngine.state) { return this.transferQueues.applyBlockedQueues(state); }

    // ── 計算快取窗口(與 ConveyorSystem 一致)──
    beginLogisticsComputeCache() {
        if (this.lineStore.beginGroupCache) this.lineStore.beginGroupCache();
        if (this.mergeNodeStore.beginTopologyCache) this.mergeNodeStore.beginTopologyCache();
    }
    endLogisticsComputeCache() {
        if (this.lineStore.endGroupCache) this.lineStore.endGroupCache();
        if (this.mergeNodeStore.endTopologyCache) this.mergeNodeStore.endTopologyCache();
        this.endMergeWinnerCache();
    }
    beginMergeWinnerCache() { if (this.mergeNodeRuntime.beginWinnerCache) this.mergeNodeRuntime.beginWinnerCache(); }
    endMergeWinnerCache() { if (this.mergeNodeRuntime.endWinnerCache) this.mergeNodeRuntime.endWinnerCache(); }

    // ── 合流輸出路由 fallback 用(getLogisticsMergeNodeOutputRoute 內;主執行緒走 endpointResolver,
    //    worker 無建築/端口資訊,改以「群組線段依方向排序後串接」近似;此 fallback 罕觸發)──
    getLogisticsGroupRoutePoints(groupId) {
        const segments = this.orderLogisticsSegmentsByDirection(this.getLogisticsSegmentsByGroupId(groupId));
        const pts = [];
        segments.forEach(seg => {
            const sp = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
            sp.forEach(p => {
                const last = pts[pts.length - 1];
                if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.1) pts.push({ x: p.x, y: p.y });
            });
        });
        return pts.length >= 2 ? pts : null;
    }

    // ── 建構期才會用到的拓樸變更方法;per-tick 模擬不會呼叫,worker 端 no-op ──
    recalculateLogisticsGroupEndpoints() {}
    clearSuppressedLogisticsConnectionCell() { return false; }
    reassignDeletedGapContinuationToMergeInput() { return false; }
    updateActiveTransfersOnLogisticsChange() {}
}
