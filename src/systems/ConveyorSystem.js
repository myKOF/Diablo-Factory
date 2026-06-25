import { GameEngine } from './game_systems.js';
import { UI_CONFIG } from '../ui/ui_config.js';
import { SpatialHashGrid } from './logistics/SpatialHashGrid.js';
import { LogisticsUndoStore } from './logistics/LogisticsUndoStore.js';
import { LogisticsLineStore } from './logistics/LogisticsLineStore.js';
import { RoutingGridBuilder } from './logistics/RoutingGridBuilder.js';
import { LogisticsSegmentBuilder } from './logistics/LogisticsSegmentBuilder.js';
import { cloneLogisticsPort, hasLogisticsPortPosition } from './logistics/LogisticsPortUtils.js';
import { LogisticsLineBuildContext } from './logistics/LogisticsLineBuildContext.js';
import { LogisticsLinePlacement } from './logistics/LogisticsLinePlacement.js';
import { LogisticsLineMetadata } from './logistics/LogisticsLineMetadata.js';
import { LogisticsLineMergeCoordinator } from './logistics/LogisticsLineMergeCoordinator.js';
import { LogisticsLineFinalizer } from './logistics/LogisticsLineFinalizer.js';
import { LogisticsLineQuery } from './logistics/LogisticsLineQuery.js';
import { LogisticsLineHitTester } from './logistics/LogisticsLineHitTester.js';
import { LogisticsSourcePortQuery } from './logistics/LogisticsSourcePortQuery.js';
import { LogisticsGroupConnectivity } from './logistics/LogisticsGroupConnectivity.js';
import { LogisticsLineOrdering } from './logistics/LogisticsLineOrdering.js';
import { LogisticsTransferQueues } from './logistics/LogisticsTransferQueues.js';
import { LogisticsMergeNodeRuntime } from './logistics/LogisticsMergeNodeRuntime.js';
import { LogisticsTransferRerouter } from './logistics/LogisticsTransferRerouter.js';
import { LogisticsDragSession } from './logistics/LogisticsDragSession.js';
import { LogisticsDragSubmission } from './logistics/LogisticsDragSubmission.js';
import { LogisticsPathAdapters } from './logistics/LogisticsPathAdapters.js';
import { LogisticsExtensionCoordinator } from './logistics/LogisticsExtensionCoordinator.js';
import { LogisticsMergeNodeStore } from './logistics/LogisticsMergeNodeStore.js';
import { LogisticsTopologyQuery } from './logistics/LogisticsTopologyQuery.js';
import { LogisticsDeletionService } from './logistics/LogisticsDeletionService.js';
import { LogisticsEndpointResolver } from './logistics/LogisticsEndpointResolver.js';
import { LogisticsConfigCostAdapter } from './logistics/LogisticsConfigCostAdapter.js';
import { LogisticsRuntimeContext } from './logistics/LogisticsRuntimeContext.js';
import { LogisticsStateActions } from './logistics/LogisticsStateActions.js';

export class ConveyorSystem {
    constructor() {
        this.activeDrag = null;
        this.router = null;
        this.ghosts = [];
        this.isValid = false;
        this.pendingDragPoint = null;
        this.isDragFrameQueued = false;
        this.lastRouteKey = null;
        this.logisticsOccupiedKeys = new Set();
        // [合併鎖定] 防止拆分後立刻被自動合併覆蓋，由 deleteLogisticsLineById 啟用
        this.isProcessingMerge = false;
        this.logisticsBuildUndoStack = [];
        this.maxLogisticsBuildUndoSteps = 5;
        this.runtimeContext = new LogisticsRuntimeContext(() => GameEngine);
        this.lineStore = new LogisticsLineStore(this, () => GameEngine);
        this.undoStore = new LogisticsUndoStore(this, () => GameEngine);
        this.routingGridBuilder = new RoutingGridBuilder(this, () => GameEngine);
        this.segmentBuilder = new LogisticsSegmentBuilder(() => GameEngine);
        this.lineBuildContext = new LogisticsLineBuildContext(this, () => GameEngine);
        this.linePlacement = new LogisticsLinePlacement(this, () => GameEngine);
        this.lineMetadata = new LogisticsLineMetadata();
        this.lineMergeCoordinator = new LogisticsLineMergeCoordinator(this, () => GameEngine);
        this.lineFinalizer = new LogisticsLineFinalizer(this, () => GameEngine);
        this.lineQuery = new LogisticsLineQuery(this, () => GameEngine);
        this.sourcePortQuery = new LogisticsSourcePortQuery(this, () => GameEngine);
        this.lineHitTester = new LogisticsLineHitTester(this, () => GameEngine);
        this.groupConnectivity = new LogisticsGroupConnectivity(this);
        this.lineOrdering = new LogisticsLineOrdering(() => GameEngine);
        this.transferQueues = new LogisticsTransferQueues(this, () => GameEngine);
        this.mergeNodeRuntime = new LogisticsMergeNodeRuntime(this, () => GameEngine);
        this.transferRerouter = new LogisticsTransferRerouter(this, () => GameEngine);
        this.dragSession = new LogisticsDragSession(this);
        this.dragSubmission = new LogisticsDragSubmission(this);
        this.pathAdapters = new LogisticsPathAdapters(this);
        this.extensionCoordinator = new LogisticsExtensionCoordinator(this);
        this.mergeNodeStore = new LogisticsMergeNodeStore(this, () => GameEngine);
        this.topologyQuery = new LogisticsTopologyQuery(this);
        this.deletionService = new LogisticsDeletionService(this);
        this.endpointResolver = new LogisticsEndpointResolver(this);
        this.configCostAdapter = new LogisticsConfigCostAdapter(this, this.runtimeContext);
        this.spatialGrid = new SpatialHashGrid(64, () => GameEngine.TILE_SIZE || 20);
    }

    cloneLogisticsUndoValue(value) {
        return this.undoStore.cloneValue(value);
    }

    captureLogisticsBuildUndoSnapshot(state = GameEngine.state) {
        return this.undoStore.capture(state);
    }

    recordLogisticsBuildUndoSnapshot(snapshot = null, state = GameEngine.state) {
        return this.undoStore.record(snapshot, state);
    }

    restoreLogisticsBuildUndoSnapshot(snapshot, state = GameEngine.state) {
        return this.undoStore.restore(snapshot, state);
    }

    undoLastLogisticsBuild(state = GameEngine.state) {
        return this.undoStore.undoLast(state);
    }

    startDrag(startX, startY, sourceEntity = null, sourcePort = null, sourceLine = null) {
        return this.dragSession.startDrag(...arguments);
    }

    getDirectionBetweenPoints(start, end) {
        if (!start || !end) return null;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
        return Math.abs(dx) >= Math.abs(dy)
            ? { x: Math.sign(dx) || 1, y: 0 }
            : { x: 0, y: Math.sign(dy) || 1 };
    }

    isReverseLogisticsExtension(drag, pathPoints, pointsAreGrid = true) {
        if (!drag?.isLineExtension || !drag.sourceLine || !Array.isArray(pathPoints) || pathPoints.length < 2) return false;
        const sourceGroupId = drag.sourceLine.groupId || drag.sourceLine.id || null;
        const segments = sourceGroupId
            ? this.getLogisticsSegmentsByGroupId(sourceGroupId)
            : [drag.sourceLine];
        const ordered = Array.isArray(segments) && segments.length > 0
            ? this.orderLogisticsSegmentsByDirection(segments)
            : [drag.sourceLine];
        const firstRoute = Array.isArray(ordered[0]?.routePoints) ? ordered[0].routePoints : [];
        const lastSegment = ordered[ordered.length - 1];
        const lastRoute = Array.isArray(lastSegment?.routePoints) ? lastSegment.routePoints : [];
        if (firstRoute.length < 2 || lastRoute.length < 2) return false;

        const toComparablePoint = (point) => pointsAreGrid ? point : this.toGrid(point.x, point.y);
        const startGrid = drag.startGrid || this.toGrid(drag.startX, drag.startY);
        const firstGrid = this.toGrid(firstRoute[0].x, firstRoute[0].y);
        const secondGrid = this.toGrid(firstRoute[1].x, firstRoute[1].y);
        const lastGrid = this.toGrid(lastRoute[lastRoute.length - 1].x, lastRoute[lastRoute.length - 1].y);
        const beforeLastGrid = this.toGrid(lastRoute[lastRoute.length - 2].x, lastRoute[lastRoute.length - 2].y);
        const extensionDir = this.getDirectionBetweenPoints(
            toComparablePoint(pathPoints[0]),
            toComparablePoint(pathPoints[1])
        );
        if (!extensionDir) return false;

        const routeScale = this.getRouteScale();
        const isNear = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= routeScale;
        const blockedDir = isNear(startGrid, lastGrid)
            ? this.getDirectionBetweenPoints(lastGrid, beforeLastGrid)
            : (isNear(startGrid, firstGrid)
                ? this.getDirectionBetweenPoints(firstGrid, secondGrid)
                : null);
        return !!blockedDir && extensionDir.x === blockedDir.x && extensionDir.y === blockedDir.y;
    }

    getAlignmentUnit() {
        return this.configCostAdapter.getAlignmentUnit(...arguments);
    }

    getGridUnitSize() {
        return this.configCostAdapter.getGridUnitSize(...arguments);
    }

    getRouteScale() {
        return this.configCostAdapter.getRouteScale(...arguments);
    }

    getTransportLineConfig() {
        return this.configCostAdapter.getTransportLineConfig(...arguments);
    }

    getTransportLineCost(segmentCount) {
        return this.configCostAdapter.getTransportLineCost(...arguments);
    }

    canAffordTransportLine(segmentCount) {
        return this.configCostAdapter.canAffordTransportLine(...arguments);
    }

    buildSingleSegmentAt(worldX, worldY) {
        return this.dragSubmission.buildSingleSegmentAt(...arguments);
    }

    getPortAnchorGrid(port, portGrid) {
        return this.pathAdapters.getPortAnchorGrid(...arguments);
    }

    buildPortSafePath(routePath, sourcePortGrid, sourceRouteGrid, targetPortGrid, targetRouteGrid) {
        return this.pathAdapters.buildPortSafePath(...arguments);
    }

    dedupeExtensionStart(path) {
        return this.pathAdapters.dedupeExtensionStart(...arguments);
    }

    collectLogisticsOccupiedKeys(ignoreLine = null) {
        return this.routingGridBuilder.collectLogisticsOccupiedKeys(ignoreLine);
    }

    markLineOnGrid(routeGrid, line) {
        return this.routingGridBuilder.markLineOnGrid(routeGrid, line);
    }

    createRoutingGrid(grid, ignoreLine = null) {
        return this.routingGridBuilder.createRoutingGrid(grid, ignoreLine);
    }

    updateDrag(currentX, currentY) {
        return this.dragSession.updateDrag(...arguments);
    }

    updateDragNow(currentX, currentY) {
        return this.dragSession.updateDragNow(...arguments);
    }

    toggleBendMode() {
        return this.dragSession.toggleBendMode(...arguments);
    }

    resolveDragTarget(currentX, currentY) {
        return this.dragSession.resolveDragTarget(...arguments);
    }

    submitDrag() {
        return this.dragSubmission.submitDrag(...arguments);
    }

    applyExtensionTurnArrowOverride(drag, points) {
        return this.extensionCoordinator.applyExtensionTurnArrowOverride(...arguments);
    }

    splitSourceGroupForMiddleExtension(drag) {
        return this.extensionCoordinator.splitSourceGroupForMiddleExtension(...arguments);
    }

    cancelDrag() {
        return this.dragSession.cancelDrag(...arguments);
    }

    rebuildSpatialHashGrid() {
        this.spatialGrid.clear();
        const lines = this.ensureLogisticsLineStore();
        lines.forEach(line => {
            if (line) {
                this.spatialGrid.insert(line);
            }
        });
    }

    toGrid(worldX, worldY, dirBias = null) {
        const TS = GameEngine.TILE_SIZE;
        const scale = this.getRouteScale();
        const gridUnit = TS / scale;
        const offset = GameEngine.state.mapOffset || { x: 0, y: 0 };

        let bx = worldX;
        let by = worldY;
        if (dirBias === 'right') bx -= 1;
        if (dirBias === 'down') by -= 1;

        return {
            x: Math.floor(bx / gridUnit) - offset.x * scale,
            y: Math.floor(by / gridUnit) - offset.y * scale
        };
    }

    validateGhosts(ghosts) {
        if (!this.router) return false;
        const routeWidth = this.activeDrag?.routeWidth || 1;

        // [核心優化] 統一調用 Router 的驗證邏輯，保持 Single Source of Truth
        const isFootprintValid = this.router.validateRouteFootprint(ghosts, routeWidth, (segmentCount) => {
            if (!UI_CONFIG.ConveyorBuild) return true;

            // 道具消耗檢查
            return this.canAffordTransportLine(segmentCount);
        });

        return isFootprintValid;
    }

    buildOrthogonalRoute(startPoint, endPoint, startDir = null, endDir = null, biasPoint = null) {
        return this.pathAdapters.buildOrthogonalRoute(...arguments);
    }

    getLogisticsTargetBuildingAt(worldX, worldY, sourceEnt = null) {
        return this.endpointResolver.getLogisticsTargetBuildingAt(...arguments);
    }

    getConnectionRoute(sourceEnt, targetEnt, conn = null) {
        return this.endpointResolver.getConnectionRoute(...arguments);
    }

    getConnectionTransferRoute(sourceEnt, targetEnt, conn = null) {
        return this.endpointResolver.getConnectionTransferRoute(...arguments);
    }

    getLogisticsGroupRoutePoints(lineId, startRef = null, endRef = null) {
        return this.endpointResolver.getLogisticsGroupRoutePoints(...arguments);
    }

    buildLogisticsGraphRoutePoints(segments, startRef = null, endRef = null) {
        return this.endpointResolver.buildLogisticsGraphRoutePoints(...arguments);
    }

    ensureLogisticsLineStore() {
        return this.lineStore.ensure();
    }

    ensureLogisticsMergeNodeStore(state = GameEngine.state) {
        return this.mergeNodeStore.ensureLogisticsMergeNodeStore(...arguments);
    }

    areLogisticsGroupsLinkedByMergeNode(groupA, groupB, state = GameEngine.state) {
        return this.topologyQuery.areLogisticsGroupsLinkedByMergeNode(...arguments);
    }

    areLogisticsGroupsInSameMergeComponent(groupA, groupB, state = GameEngine.state) {
        return this.topologyQuery.areLogisticsGroupsInSameMergeComponent(...arguments);
    }

    getLogisticsGroupsConnectedThroughMergeNodes(baseConnectedGroupIds, state = GameEngine.state) {
        return this.topologyQuery.getLogisticsGroupsConnectedThroughMergeNodes(...arguments);
    }

    getLogisticsLinesForState(state = GameEngine.state) {
        return this.lineStore.getForState(state);
    }

    getLogisticsConnectionPointKey(point) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
        return `${Math.round(point.x)},${Math.round(point.y)}`;
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

    doesLogisticsGroupContainConnectionPoint(groupId, point, tolerance = 1, state = GameEngine.state, blockedKey = null) {
        if (!groupId || !point) return false;
        return this.getLogisticsLinesForState(state).some(line =>
            (line?.groupId || line?.id || null) === groupId &&
            this.doesLogisticsLineContainConnectionPoint(line, point, tolerance, blockedKey)
        );
    }

    isLogisticsMergeNodeInputConnectionIntact(node, inputGroupId, state = GameEngine.state) {
        if (!node || !inputGroupId || !node.outputGroupId) return false;
        if (!Array.isArray(node.inputGroupIds) || !node.inputGroupIds.includes(inputGroupId)) return false;
        const point = node.point || (Number.isFinite(node.x) && Number.isFinite(node.y) ? { x: node.x, y: node.y } : null);
        if (!point) return false;
        const tolerance = Math.max(1, (GameEngine.TILE_SIZE || 20) * 0.75);
        const key = node.cellKey || this.getLogisticsConnectionPointKey(point);
        return this.doesLogisticsGroupContainConnectionPoint(node.outputGroupId, point, tolerance, state, key) &&
            this.doesLogisticsGroupContainConnectionPoint(inputGroupId, point, tolerance, state, key);
    }

    getLogisticsMergeConnectedGroupIds(groupId, state = GameEngine.state) {
        const connected = new Set();
        if (!groupId) return connected;
        connected.add(groupId);
        const nodes = this.ensureLogisticsMergeNodeStore(state);
        let changed = true;
        while (changed) {
            changed = false;
            nodes.forEach(node => {
                if (!node || !node.outputGroupId || !Array.isArray(node.inputGroupIds)) return;
                const members = [node.outputGroupId, ...node.inputGroupIds].filter(Boolean);
                if (!members.some(id => connected.has(id))) return;
                members.forEach(id => {
                    if (connected.has(id)) return;
                    connected.add(id);
                    changed = true;
                });
            });
        }
        return connected;
    }

    isLogisticsDetachedDisplayConnectionIntact(groupId, detachedFromGroupId, detachedAtKey, state = GameEngine.state) {
        if (!groupId || !detachedFromGroupId || !detachedAtKey) return false;
        const [x, y] = String(detachedAtKey).split(',').map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        const point = { x, y };
        const tolerance = Math.max(1, (GameEngine.TILE_SIZE || 20) * 0.05);
        return this.doesLogisticsGroupContainConnectionPoint(groupId, point, tolerance, state, detachedAtKey) &&
            this.doesLogisticsGroupContainConnectionPoint(detachedFromGroupId, point, tolerance, state, detachedAtKey);
    }

    isDeletedGapContinuationLine(line) {
        return line?.detachedByDeletedGap === true;
    }

    getLogisticsPhysicalGroupGraph(state = GameEngine.state) {
        return this.topologyQuery.getLogisticsPhysicalGroupGraph(...arguments);
    }

    getLogisticsPhysicalGroupComponents(state = GameEngine.state) {
        return this.topologyQuery.getLogisticsPhysicalGroupComponents(...arguments);
    }

    findLogisticsPhysicalGroupPath(startGroupId, endGroupId, state = GameEngine.state) {
        return this.topologyQuery.findLogisticsPhysicalGroupPath(...arguments);
    }

    getLogisticsPortConnectedPhysicalGroupIds(state = GameEngine.state) {
        return this.topologyQuery.getLogisticsPortConnectedPhysicalGroupIds(...arguments);
    }

    getLogisticsDisplayConnectedGroupIds(baseConnectedGroupIds, state = GameEngine.state) {
        return this.topologyQuery.getLogisticsDisplayConnectedGroupIds(...arguments);
    }

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

    getLogisticsLineDirectionAtPoint(line, point) {
        const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
        for (let i = 0; i < points.length - 1; i++) {
            const start = points[i];
            const end = points[i + 1];
            if (this.isPointOnSegment(point, start, end, GameEngine.TILE_SIZE * 0.25)) {
                return this.getCardinalDirection(start, end);
            }
        }
        if (points.length >= 2) return this.getCardinalDirection(points[0], points[points.length - 1]);
        return null;
    }

    findTouchedLogisticsLineAt(point, excludedGroupId = null, tolerance = null) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
        const TS = GameEngine.TILE_SIZE || 20;
        const tol = Number.isFinite(tolerance) ? tolerance : TS * 0.55;
        const groupOf = (line) => line?.groupId || line?.id || null;
        const isCandidate = (line) => {
            const groupId = groupOf(line);
            return !!groupId && groupId !== excludedGroupId;
        };

        const directHits = typeof this.getLogisticsLinesAt === 'function'
            ? this.getLogisticsLinesAt(point.x, point.y).filter(isCandidate)
            : [];
        if (directHits.length > 0) return directHits[0];

        const snapped = this.snapPointToGridCenter(point);
        const probes = [{ x: point.x, y: point.y }];
        if (Math.hypot(snapped.x - point.x, snapped.y - point.y) > 0.1) {
            probes.push(snapped);
        }
        let bestLine = null;
        let bestDist = Infinity;
        this.ensureLogisticsLineStore().forEach(line => {
            if (!isCandidate(line)) return;
            const points = Array.isArray(line.routePoints) ? line.routePoints : [];
            for (let i = 0; i < points.length - 1; i++) {
                const start = points[i];
                const end = points[i + 1];
                probes.forEach(probe => {
                    if (!this.isPointOnSegment(probe, start, end, tol)) return;
                    const dist = Math.min(
                        Math.hypot(probe.x - start.x, probe.y - start.y),
                        Math.hypot(probe.x - end.x, probe.y - end.y)
                    );
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestLine = line;
                    }
                });
            }
        });
        return bestLine;
    }

    registerLogisticsMergeNode({ inputGroupId, outputGroupId, point, inputLine = null, outputLine = null }) {
        return this.mergeNodeStore.registerLogisticsMergeNode(...arguments);
    }

    reassignDeletedGapContinuationToMergeInput(inputGroupId, outputGroupId, point) {
        return this.mergeNodeStore.reassignDeletedGapContinuationToMergeInput(...arguments);
    }

    getLogisticsMergeNodeOutputRoute(node) {
        return this.mergeNodeStore.getLogisticsMergeNodeOutputRoute(...arguments);
    }

    getLogisticsMergeNodeForInputTransfer(transfer, state = GameEngine.state) {
        return this.mergeNodeStore.getLogisticsMergeNodeForInputTransfer(...arguments);
    }

    isLogisticsMergeInputTransfer(transfer, state = GameEngine.state) {
        return this.mergeNodeStore.isLogisticsMergeInputTransfer(...arguments);
    }

    getLogisticsMergeAdmissionWinner(node, state = GameEngine.state, options = {}) {
        return this.mergeNodeRuntime.getLogisticsMergeAdmissionWinner(node, state, options);
    }

    getLogisticsMergeThroughYieldLimit(transfer, state = GameEngine.state, spacing) {
        return this.mergeNodeRuntime.getMergeThroughYieldLimit(transfer, state, spacing);
    }

    applyLogisticsMergeNodes(state = GameEngine.state) {
        return this.mergeNodeRuntime.apply(state);
    }

    // [效能] 開啟/關閉一段「保證不變更線段與合流拓樸」的同步計算窗口。
    // 窗口內 getSegmentsByGroupId 走群組索引快取、合流節點的拓樸有效性檢查走記憶化，
    // 將原本逐 transfer × 逐子步 O(總線段數) 的重複掃描降為查表。呼叫端務必以 try/finally 成對使用。
    beginLogisticsComputeCache() {
        if (this.lineStore && typeof this.lineStore.beginGroupCache === 'function') this.lineStore.beginGroupCache();
        if (this.mergeNodeStore && typeof this.mergeNodeStore.beginTopologyCache === 'function') this.mergeNodeStore.beginTopologyCache();
    }
    endLogisticsComputeCache() {
        if (this.lineStore && typeof this.lineStore.endGroupCache === 'function') this.lineStore.endGroupCache();
        if (this.mergeNodeStore && typeof this.mergeNodeStore.endTopologyCache === 'function') this.mergeNodeStore.endTopologyCache();
        // 安全網:即使子步區間因例外未成對關閉 winner 快取，整個計算窗口結束時一律清除，杜絕陳舊外溢。
        this.endMergeWinnerCache();
    }

    // [效能] 合流 winner 快取窗口：僅在 transfer 位置穩定的堆積計算階段成對使用，
    // 將「同一節點 winner 被每個輸出 transfer 重算 O(n)」收斂為 per node 一次。
    beginMergeWinnerCache() {
        if (this.mergeNodeRuntime && typeof this.mergeNodeRuntime.beginWinnerCache === 'function') this.mergeNodeRuntime.beginWinnerCache();
    }
    endMergeWinnerCache() {
        if (this.mergeNodeRuntime && typeof this.mergeNodeRuntime.endWinnerCache === 'function') this.mergeNodeRuntime.endWinnerCache();
    }

    snapPointToGridCenter(point) {
        return this.segmentBuilder.snapPointToGridCenter(point);
    }

    makeLogisticsLineId(sourceId, targetId = null, targetPoint = null) {
        return this.segmentBuilder.makeLogisticsLineId(sourceId, targetId, targetPoint);
    }

    getLogisticsSegmentOccupyKey(line) {
        if (!line) return null;
        const TS = GameEngine.TILE_SIZE;
        // Logistics segments are stored on half-tile grid (alignUnit: 0.5).
        // Occupancy keys must use the same coordinate system as buildLogisticsSegments.
        const align = TS / 2;
        const gx = line.gridX !== undefined ? line.gridX : Math.round(line.x / align);
        const gy = line.gridY !== undefined ? line.gridY : Math.round(line.y / align);
        return `${gx},${gy}`;
    }

    markDeletedGapEndpoint(segment) {
        if (!segment) return;
        const points = Array.isArray(segment.routePoints) ? segment.routePoints : [];
        const end = points[points.length - 1];
        segment.suppressOpenEndpointCell = true;
        if (end && Number.isFinite(end.x) && Number.isFinite(end.y)) {
            segment.suppressedOpenEndpointCellKey = `${Math.round(end.x)},${Math.round(end.y)}`;
        }
    }

    getLogisticsLineEndpointNearPoint(line, point, tolerance = (GameEngine.TILE_SIZE || 20) * 0.8) {
        if (!line || !point) return null;
        const points = Array.isArray(line.routePoints) ? line.routePoints : [];
        if (points.length < 2) return null;
        const endpoints = [
            { point: points[0], side: 'start' },
            { point: points[points.length - 1], side: 'end' }
        ];
        return endpoints.find(endpoint =>
            endpoint.point &&
            Number.isFinite(endpoint.point.x) &&
            Number.isFinite(endpoint.point.y) &&
            Math.hypot(endpoint.point.x - point.x, endpoint.point.y - point.y) <= tolerance
        ) || null;
    }

    markSuppressedLogisticsConnectionCell(line, point) {
        const endpoint = this.getLogisticsLineEndpointNearPoint(line, point);
        if (!endpoint) return false;
        const key = `${Math.round(endpoint.point.x)},${Math.round(endpoint.point.y)}`;
        const keys = Array.isArray(line.suppressedConnectionCellKeys)
            ? line.suppressedConnectionCellKeys.slice()
            : [];
        if (!keys.includes(key)) keys.push(key);
        line.suppressedConnectionCellKeys = keys;
        if (endpoint.side === 'end') {
            line.suppressOpenEndpointCell = true;
            line.suppressedOpenEndpointCellKey = key;
        }
        return true;
    }

    clearSuppressedLogisticsConnectionCell(line, point) {
        if (!line || !point) return false;
        const endpoint = this.getLogisticsLineEndpointNearPoint(line, point);
        if (!endpoint) return false;
        const key = `${Math.round(endpoint.point.x)},${Math.round(endpoint.point.y)}`;
        let changed = false;
        if (Array.isArray(line.suppressedConnectionCellKeys)) {
            const nextKeys = line.suppressedConnectionCellKeys.filter(item => item !== key);
            changed = nextKeys.length !== line.suppressedConnectionCellKeys.length;
            if (nextKeys.length > 0) line.suppressedConnectionCellKeys = nextKeys;
            else delete line.suppressedConnectionCellKeys;
        }
        if (line.suppressedOpenEndpointCellKey === key) {
            delete line.suppressOpenEndpointCell;
            delete line.suppressedOpenEndpointCellKey;
            changed = true;
        }
        return changed;
    }

    cleanupLogisticsMergeNodesForDeletedLine(deletedLine) {
        return this.deletionService.cleanupLogisticsMergeNodesForDeletedLine(...arguments);
    }

    isLogisticsDetachedSplitCell(line, cellKey) {
        return (!!line?.detachedFromGroupId && !!line?.detachedAtKey && line.detachedAtKey === cellKey) ||
            (Array.isArray(line?.suppressedConnectionCellKeys) && line.suppressedConnectionCellKeys.includes(cellKey));
    }

    getLogisticsSegmentOccupiedKeys(line) {
        const centerKey = this.getLogisticsSegmentOccupyKey(line);
        if (!centerKey) return [];
        const routeWidth = Math.max(1, Math.round(Number(line.routeWidth) || 1));
        const points = Array.isArray(line.routePoints) ? line.routePoints : [];
        const a = points[0] || { x: line.x, y: line.y };
        const b = points[1] || a;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const [gx, gy] = centerKey.split(',').map(Number);
        const dir = Math.abs(dx) >= Math.abs(dy)
            ? { x: Math.sign(dx) || 1, y: 0 }
            : { x: 0, y: Math.sign(dy) || 1 };
        const router = this.routingGridBuilder.getFootprintRouter();
        return router.getGhostOccupiedCells([{
            x: gx,
            y: gy,
            dirIn: dir,
            dirOut: dir
        }], routeWidth).map(cell => `${cell.x},${cell.y}`);
    }

    buildGridRoutePoints(points) {
        return this.segmentBuilder.buildGridRoutePoints(points);
    }

    buildLogisticsSegments(groupId, sourceId, targetId, targetPoint, gridPoints, routeWidth, sourcePort, targetPort, filter, lineType = 'transport_line', efficiency = 0) {
        return this.segmentBuilder.buildLogisticsSegments(groupId, sourceId, targetId, targetPoint, gridPoints, routeWidth, sourcePort, targetPort, filter, lineType, efficiency);
    }

    upsertLogisticsLine({ lineId = null, sourceEnt, targetEnt = null, targetPoint = null, points = [], routeWidth = 1, sourcePort = null, targetPort = null, conn = null, lineType = 'transport_line', efficiency = 0, allowGroupMerge = true, splitOnBlockedOverlap = false }) {
        if (this.isProcessingMerge) return null;
        const {
            lines,
            targetId,
            groupId,
            cleanTargetPoint,
            gridPoints,
            previous,
            existingGroupSegments,
            canonicalSourceId,
            cleanSourcePort,
            cleanTargetPort,
            filter
        } = this.lineBuildContext.create({
            lineId,
            sourceEnt,
            targetEnt,
            targetPoint,
            points,
            sourcePort,
            targetPort,
            conn
        });
        const segments = this.buildLogisticsSegments(groupId, canonicalSourceId, targetId, cleanTargetPoint, gridPoints, routeWidth, cleanSourcePort, cleanTargetPort, filter, lineType, efficiency);
        this.lineMetadata.applySplitSequenceStart(segments, existingGroupSegments);
        const {
            additions,
            occupied,
            mergedLines,
            overlapMergeGroupIds,
            blockedOverlapGroupIds
        } = this.linePlacement.placeSegments({ lines, segments, groupId, splitOnBlockedOverlap });

        // [物流延伸修正] 同一群組在多次延伸後，舊段也必須同步最新端點/連線資訊，
        // 否則渲染端在判定 port-to-port 接通時會讀到過期 metadata，導致誤顯示為未接通。
        this.lineMetadata.syncGroupSegments({
            mergedLines,
            groupId,
            canonicalSourceId,
            targetId,
            cleanTargetPoint,
            routeWidth,
            lineType,
            efficiency,
            cleanSourcePort,
            cleanTargetPort,
            conn,
            filter
        });

        LogisticsStateActions.replaceLogisticsLines(GameEngine.state, mergedLines);
        this.lineMetadata.syncConnection({ conn, groupId, gridPoints, routeWidth, lineType, efficiency, cleanSourcePort, cleanTargetPort });

        const { mergedGroupId, affectedGroupIds } = this.lineMergeCoordinator.mergeOverlaps({
            groupId,
            overlapMergeGroupIds,
            blockedOverlapGroupIds,
            allowGroupMerge
        });

        return this.lineFinalizer.finalizeBuild({
            groupId,
            mergedGroupId,
            affectedGroupIds,
            conn,
            additions,
            segments,
            occupied
        });
    }

    getLogisticsLineRoute(line) {
        return this.lineQuery.getRoute(line);
    }

    getLogisticsLineById(lineId) {
        return this.lineStore.getById(lineId);
    }

    getLogisticsSegmentsByGroupId(groupId) {
        return this.lineStore.getSegmentsByGroupId(groupId);
    }

    setLogisticsGroupFilter(groupId, filterItem) {
        this.getLogisticsSegmentsByGroupId(groupId).forEach(line => {
            line.filter = filterItem || null;
        });
    }

    getLogisticsLineNodePoints(line) {
        return this.lineQuery.getNodePoints(line);
    }

    isPointOnLogisticsLine(point, line) {
        return this.lineQuery.isPointOnLine(point, line);
    }

    getLogisticsLineDirectedCells(line) {
        return this.lineQuery.getDirectedCells(line);
    }

    areLogisticsGroupsTouching(primaryGroupId, secondaryGroupId) {
        return this.groupConnectivity.areTouching(primaryGroupId, secondaryGroupId);
    }

    mergeConnectedLogisticsGroups(groupId) {
        return this.lineMergeCoordinator.mergeConnectedGroups(groupId);
    }

    getDeletedGapContinuationRelation(groupAId, groupBId, state = GameEngine.state) {
        return this.lineMergeCoordinator.getDeletedGapContinuationRelation(groupAId, groupBId, state);
    }

    reconnectDeletedGapContinuationGroups(groupAId, groupBId, state = GameEngine.state) {
        return this.lineMergeCoordinator.reconnectDeletedGapContinuationGroups(groupAId, groupBId, state);
    }

    mergeLogisticsLineGroups(primaryGroupId, secondaryGroupId) {
        return this.lineMergeCoordinator.mergeGroups(primaryGroupId, secondaryGroupId);
    }

    cleanupDeletedLinePreviousTurnOverride(deletedLine, originalGroupId) {
        return this.deletionService.cleanupDeletedLinePreviousTurnOverride(...arguments);
    }

    getLogisticsLineSourceEntity(line) {
        if (!line || !line.sourceId || !GameEngine.state?.mapEntities) return null;
        return GameEngine.state.mapEntities.find(ent => window.UIManager.getEntityId(ent) === line.sourceId) || null;
    }
    getLogisticsLineSelectionKey(line) {
        if (!line) return null;
        const gx = line.gridX !== undefined ? line.gridX : Math.round((line.x || 0) / (GameEngine.TILE_SIZE / 2));
        const gy = line.gridY !== undefined ? line.gridY : Math.round((line.y || 0) / (GameEngine.TILE_SIZE / 2));
        return `${line.id || line.groupId || 'logistics'}@${gx},${gy}`;
    }

    isSelectedLogisticsLine(line) {
        const selectedId = GameEngine.state.selectedLogisticsLineId;
        const selectedGroupId = GameEngine.state.selectedLogisticsGroupId;
        if (!line) return false;
        if (selectedGroupId) {
            const lineGroupId = line.groupId || line.id || null;
            if (lineGroupId && this.getLogisticsMergeConnectedGroupIds(selectedGroupId).has(lineGroupId)) return true;
        }
        if (!selectedId) return false;
        return this.getLogisticsLineSelectionKey(line) === selectedId;
    }

    orderLogisticsSegmentsByDirection(segments) {
        return this.lineOrdering.orderByDirection(segments);
    }

    updateActiveTransfersOnLogisticsChange(state, affectedGroupIds = null) {
        return this.transferRerouter.updateOnLogisticsChange(state, affectedGroupIds);
    }

    applyBlockedTransferQueues(state) {
        return this.transferQueues.applyBlockedQueues(state);
    }

    recalculateLogisticsGroupEndpoints(groupId) {
        return this.endpointResolver.recalculateLogisticsGroupEndpoints(...arguments);
    }

    deleteLogisticsLineById(lineId) {
        return this.deletionService.deleteLogisticsLineById(...arguments);
    }

    deleteLogisticsLineGroupById(groupId) {
        return this.deletionService.deleteLogisticsLineGroupById(...arguments);
    }

    getLogisticsSourcePortConnection(line) {
        return this.sourcePortQuery.getConnection(line);
    }

    getLogisticsSourcePortCellInfo(line) {
        return this.sourcePortQuery.getCellInfo(line);
    }

    isLogisticsSourcePortCell(line, worldX, worldY) {
        return this.sourcePortQuery.isSourcePortCell(line, worldX, worldY);
    }

    getLogisticsSourcePortHitAt(worldX, worldY) {
        return this.sourcePortQuery.getHitAt(worldX, worldY);
    }

    getLogisticsLineAt(worldX, worldY) {
        return this.lineHitTester.getLineAt(worldX, worldY);
    }

    getLogisticsLinesAt(worldX, worldY) {
        return this.lineHitTester.getLinesAt(worldX, worldY);
    }
}

export const conveyorSystem = new ConveyorSystem();
