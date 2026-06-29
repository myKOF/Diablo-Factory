import { GameEngine } from '../game_systems.js';
import { BuildingSystem } from '../BuildingSystem.js';
import { LogisticsStateActions } from './LogisticsStateActions.js';

function buildSingleSegmentAt(worldX, worldY) {
    return false;
}

function revalidateDragRouteContext(routeContext, drag) {
    if (!routeContext?.isValid || !Array.isArray(routeContext.ghosts) || routeContext.ghosts.length < 1) {
        return false;
    }
    if (!this.router) return false;

    const routeWidth = routeContext.routeWidth || drag.routeWidth || 1;
    const currentLogisticsKeys = this.collectLogisticsOccupiedKeys(drag.sourceLine || null);
    const occupiedCells = this.router.getGhostOccupiedCells(
        routeContext.ghosts.filter(ghost => !ghost.isPortConnector && !ghost.isVirtualEnd),
        routeWidth
    );
    if (!drag.isLineExtension) {
        const blockedCells = occupiedCells.filter(cell => currentLogisticsKeys.has(`${cell.x},${cell.y}`));
        if (blockedCells.length > 0) {
            const ghosts = routeContext.ghosts.filter(ghost => !ghost.isVirtualEnd);
            const terminalGhost = ghosts
                .slice()
                .reverse()
                .find(ghost => !ghost.isPortConnector) || ghosts[ghosts.length - 1] || null;
            const TS = GameEngine.TILE_SIZE;
            const offset = GameEngine.state.mapOffset || { x: 0, y: 0 };
            const scale = this.getRouteScale();
            const gridUnit = TS / scale;
            const terminalPoint = terminalGhost ? {
                x: (terminalGhost.x + offset.x * scale) * gridUnit,
                y: (terminalGhost.y + offset.y * scale) * gridUnit
            } : null;
            const touchedTargetLine = terminalPoint
                ? this.findTouchedLogisticsLineAt(terminalPoint, drag.sourceLine?.groupId || drag.sourceLine?.id || null)
                : null;
            const terminalKeys = terminalGhost
                ? new Set(this.router.getGhostOccupiedCells([terminalGhost], routeWidth).map(cell => `${cell.x},${cell.y}`))
                : new Set();
            if (!touchedTargetLine || blockedCells.some(cell => !terminalKeys.has(`${cell.x},${cell.y}`))) {
                return false;
            }
        }
    }

    const previousGrid = this.router.grid;
    this.router.grid = this.createRoutingGrid(GameEngine.state.pathfinding?.grid || [], drag.sourceLine || null);
    try {
        return this.router.validateRouteFootprint(
            routeContext.ghosts,
            routeWidth,
            () => this.canAffordTransportLine(routeContext.costSegmentCount || Math.max(1, routeContext.ghosts.length - 1))
        );
    } finally {
        this.router.grid = previousGrid;
    }
}

function submitDrag() {
    if (this.activeDrag && this.pendingDragPoint) {
        const point = this.pendingDragPoint;
        this.pendingDragPoint = null;
        this.updateDragNow(point.x, point.y);
    }
    if (!this.activeDrag) {
        return null;
    }
    if (!this.isValid || this.ghosts.length < 2) {
        return { blocked: true };
    }
    const buildGhosts = this.ghosts;
    if (buildGhosts.length < 2) {
        return { blocked: true };
    }

    const buildUndoSnapshot = this.captureLogisticsBuildUndoSnapshot(GameEngine.state);

    const drag = this.activeDrag;
    const routeContext = drag.routeContext || null;
    if (!revalidateDragRouteContext.call(this, routeContext, drag)) {
        GameEngine.addLog(`[物流線] 路徑已被佔用，建造取消。`, 'LOGISTICS');
        return { blocked: true };
    }
    const TS = GameEngine.TILE_SIZE;
    const offset = GameEngine.state.mapOffset || { x: 0, y: 0 };
    const scale = this.getRouteScale();
    const gridUnit = TS / scale;

    const points = buildGhosts.map(g => ({
        ...g,
        x: (g.x + offset.x * scale) * gridUnit,
        y: (g.y + offset.y * scale) * gridUnit
    }));
    if (this.isCrossingMultipleLogisticsGroups(drag, buildGhosts, drag.routeWidth || 1)) {
        GameEngine.addLog(`[物流線] 不可連續跨越 2 條以上物流線。`, 'LOGISTICS');
        return { blocked: true };
    }
    if (this.isReverseLogisticsExtension(drag, points, false)) {
        GameEngine.addLog(`[物流線] 禁止從端點 180 度反向延伸物流線。`, 'LOGISTICS');
        return { blocked: true };
    }
    this.applyExtensionTurnArrowOverride(drag, points);

    const lastPoint = points[points.length - 1];
    const dragTarget = routeContext?.dragTarget || this.resolveDragTarget(lastPoint.x, lastPoint.y);
    const targetPort = routeContext?.targetPort || dragTarget.port || drag.targetPort || null;
    const targetBuilding = targetPort
        ? (routeContext?.targetBuilding || dragTarget.building || drag.targetBuilding)
        : null;
    const sourceGroupId = drag.sourceLine?.groupId || drag.sourceLine?.id || null;
    let touchedTargetLine = this.findTouchedLogisticsLineAt(lastPoint, sourceGroupId);
    let mergePointOverride = null;
    const touchedTargetGroupId = touchedTargetLine ? (touchedTargetLine.groupId || touchedTargetLine.id) : null;

    if (window.UIManager) {
        const sourceEntity = drag.sourceEntity || (
            drag.sourceLine?.sourceId
                ? GameEngine.state.mapEntities.find(ent => window.UIManager.getEntityId(ent) === drag.sourceLine.sourceId)
                : null
        );
        let conn = null;
        if (sourceEntity && targetBuilding) {
            const targetId = window.UIManager.getEntityId(targetBuilding);
            if (!Array.isArray(sourceEntity.outputTargets)) sourceEntity.outputTargets = [];
            conn = sourceEntity.outputTargets.find(item => item.id === targetId || (drag.sourceLine?.groupId && item.lineId === drag.sourceLine.groupId));
            if (!conn) {
                conn = { id: targetId, filter: null };
                sourceEntity.outputTargets.push(conn);
            } else {
                conn.id = targetId;
            }
        }
        const beforeCount = Array.isArray(GameEngine.state.logisticsLines) ? GameEngine.state.logisticsLines.length : 0;
        const segmentCostCount = Math.max(1, this.getLogisticsBuildSegmentCount(buildGhosts));
        const maxCosts = this.getTransportLineCost(segmentCostCount);
        const missing = Object.entries(maxCosts).find(([resource, amount]) => (GameEngine.state.resources[resource] || 0) < amount);
        if (missing) {
            GameEngine.triggerWarning("1", [missing[0].toUpperCase()]);
            this.cancelDrag();
            return null;
        }
        const transportCfg = this.getTransportLineConfig();

        let shouldMergeWithSource = false;
        let middleExtensionSplit = null;
        if (drag.sourceLine && (drag.sourceLine.groupId || drag.sourceLine.id)) {
            const sourceGroupId = drag.sourceLine.groupId || drag.sourceLine.id;
            const lines = (GameEngine.state.logisticsLines || []).filter(l => l && (l.groupId === sourceGroupId || l.id === sourceGroupId));

            // 1. 統計所有點的 grid 出現次數以決定物理端點
            const gridCounts = new Map();
            lines.forEach(l => {
                const pts = Array.isArray(l.routePoints) ? l.routePoints : [{ x: l.x, y: l.y }, { x: l.x, y: l.y }];
                if (pts.length < 2) return;
                const p1 = this.toGrid(pts[0].x, pts[0].y);
                const p2 = this.toGrid(pts[pts.length - 1].x, pts[pts.length - 1].y);

                const k1 = `${p1.x},${p1.y}`;
                const k2 = `${p2.x},${p2.y}`;
                gridCounts.set(k1, (gridCounts.get(k1) || 0) + 1);
                gridCounts.set(k2, (gridCounts.get(k2) || 0) + 1);
            });

            const endpoints = [];
            gridCounts.forEach((count, key) => {
                if (count === 1) {
                    const [gx, gy] = key.split(',').map(Number);
                    endpoints.push({ x: gx, y: gy });
                }
            });

            if (lines.length === 1) {
                const pts = Array.isArray(lines[0].routePoints) ? lines[0].routePoints : [{ x: lines[0].x, y: lines[0].y }];
                if (pts.length >= 2) {
                    const p1 = this.toGrid(pts[0].x, pts[0].y);
                    const p2 = this.toGrid(pts[pts.length - 1].x, pts[pts.length - 1].y);
                    endpoints.push(p1, p2);
                }
            }

            // 2. 檢查 drag.startX, drag.startY 對應 of grid 點是否鄰近（距離在一格 20px 以內）任何端點
            const startGrid = this.toGrid(drag.startX, drag.startY);
            const isNearEndpoint = endpoints.some(ep => {
                const dist = Math.max(Math.abs(ep.x - startGrid.x), Math.abs(ep.y - startGrid.y));
                return dist <= this.getRouteScale(); // 容許虛擬段造成的偏移（一格對應 routeScale 個 grid 單位）
            });

            let isTrueEnd = isNearEndpoint;
            if (isTrueEnd) {
                const sourceLineKey = this.getLogisticsLineSelectionKey(drag.sourceLine);
                const terminalSourceEndpoints = [];
                lines.forEach(line => {
                    if (!line || this.getLogisticsLineSelectionKey(line) !== sourceLineKey) return;
                    const pts = Array.isArray(line.routePoints) ? line.routePoints : [{ x: line.x, y: line.y }, { x: line.x, y: line.y }];
                    if (pts.length < 2) return;
                    const p1 = this.toGrid(pts[0].x, pts[0].y);
                    const p2 = this.toGrid(pts[pts.length - 1].x, pts[pts.length - 1].y);
                    const k1 = `${p1.x},${p1.y}`;
                    const k2 = `${p2.x},${p2.y}`;
                    if (gridCounts.get(k1) === 1 || lines.length === 1) terminalSourceEndpoints.push(p1);
                    if (gridCounts.get(k2) === 1 || lines.length === 1) terminalSourceEndpoints.push(p2);
                });
                isTrueEnd = terminalSourceEndpoints.some(ep => {
                    const dist = Math.max(Math.abs(ep.x - startGrid.x), Math.abs(ep.y - startGrid.y));
                    return dist <= this.getRouteScale();
                });
            }

            if (isTrueEnd) {
                shouldMergeWithSource = true;
                // 檢查是否為完全反向拖曳，反向也不允許合併
                const sourceRoute = Array.isArray(drag.sourceLine.routePoints) ? drag.sourceLine.routePoints : [];
                if (sourceRoute.length >= 2 && points.length >= 2) {
                    const getDir = (a, b) => {
                        if (!a || !b) return null;
                        const dx = b.x - a.x;
                        const dy = b.y - a.y;
                        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
                        return Math.abs(dx) >= Math.abs(dy)
                            ? { x: Math.sign(dx) || 1, y: 0 }
                            : { x: 0, y: Math.sign(dy) || 1 };
                    };
                    const originalDir = getDir(sourceRoute[sourceRoute.length - 2], sourceRoute[sourceRoute.length - 1]);
                    const extensionDir = getDir(points[0], points[1]);
                    if (originalDir && extensionDir && originalDir.x === -extensionDir.x && originalDir.y === -extensionDir.y) {
                        shouldMergeWithSource = false;
                    }
                }
            }

            if (!shouldMergeWithSource) {
                middleExtensionSplit = this.splitSourceGroupForMiddleExtension(drag);
                if (middleExtensionSplit) {
                    shouldMergeWithSource = true;
                    if (middleExtensionSplit.attachPoint && points.length > 0) {
                        points[0] = { ...middleExtensionSplit.attachPoint };
                    }
                }
            }
        }

        const getDir = (a, b) => {
            if (!a || !b) return null;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
            return Math.abs(dx) >= Math.abs(dy)
                ? { x: Math.sign(dx) || 1, y: 0 }
                : { x: 0, y: Math.sign(dy) || 1 };
        };
        const inputDir = points.length >= 2 ? getDir(points[points.length - 2], points[points.length - 1]) : null;
        const outputDir = touchedTargetLine ? this.getLogisticsLineDirectionAtPoint(touchedTargetLine, mergePointOverride || lastPoint) : null;
        const isSameDirection = !!inputDir && !!outputDir && inputDir.x === outputDir.x && inputDir.y === outputDir.y;

        const createdLine = this.upsertLogisticsLine({
            lineId: shouldMergeWithSource ? (middleExtensionSplit?.sourceGroupId || sourceGroupId || drag.sourceLine.groupId || drag.sourceLine.id) : null,
            sourceEnt: sourceEntity,
            targetEnt: targetBuilding,
            targetPoint: targetPort || points[points.length - 1],
            points: points,
            routeWidth: drag.routeWidth || drag.sourcePort?.width || 1,
            sourcePort: drag.sourcePort,
            targetPort: targetPort,
            conn,
            lineType: transportCfg?.model || transportCfg?.type1 || 'transport_line',
            efficiency: Number(transportCfg?.efficiency) || 0,
            allowGroupMerge: !touchedTargetGroupId || isSameDirection,
            splitOnBlockedOverlap: !!drag.isLineExtension && !touchedTargetGroupId
        });
        let finalGroupId = createdLine?.groupId || null;
        const submitAffectedGroupIds = new Set([
            finalGroupId,
            sourceGroupId,
            touchedTargetGroupId,
            middleExtensionSplit?.detachedGroupId
        ].filter(Boolean));
        if (createdLine?.groupId && touchedTargetGroupId) {
            const reconnectedGroupId = this.reconnectDeletedGapContinuationGroups(createdLine.groupId, touchedTargetGroupId, GameEngine.state);
            if (reconnectedGroupId) {
                finalGroupId = reconnectedGroupId;
                submitAffectedGroupIds.add(reconnectedGroupId);
                submitAffectedGroupIds.add(touchedTargetGroupId);
            } else {
                const mergeNode = this.registerLogisticsMergeNode({
                    inputGroupId: createdLine.groupId,
                    outputGroupId: touchedTargetGroupId,
                    point: mergePointOverride || lastPoint,
                    inputLine: createdLine,
                    outputLine: touchedTargetLine
                });
                submitAffectedGroupIds.add(touchedTargetGroupId);
                if (mergeNode?.outputGroupId) submitAffectedGroupIds.add(mergeNode.outputGroupId);
                (mergeNode?.inputGroupIds || []).forEach(groupId => submitAffectedGroupIds.add(groupId));
            }
        }
        const afterCount = Array.isArray(GameEngine.state.logisticsLines) ? GameEngine.state.logisticsLines.length : beforeCount;
        const builtSegments = Math.max(0, afterCount - beforeCount);
        const chargedSegments = Math.max(1, routeContext?.costSegmentCount || segmentCostCount);
        if (!BuildingSystem.spendResources(GameEngine.state, this.getTransportLineCost(chargedSegments))) {
            this.restoreLogisticsBuildUndoSnapshot(buildUndoSnapshot, GameEngine.state);
            this.cancelDrag();
            return null;
        }
        this.recordLogisticsBuildUndoSnapshot(buildUndoSnapshot, GameEngine.state);
        const continuationProbePoint = this.snapPointToGridCenter(points[points.length - 1] || lastPoint);
        let selectedContinuationLine = null;
        if (finalGroupId && GameEngine.state) {
            const finalSegments = this.getLogisticsSegmentsByGroupId(finalGroupId);
            const endpointMatchDistance = Math.max(1, (GameEngine.TILE_SIZE || 20) * 0.2);
            const activeSegment = finalSegments.find(seg => {
                const segPoints = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
                const end = segPoints[segPoints.length - 1] || null;
                return end && continuationProbePoint && Math.hypot(end.x - continuationProbePoint.x, end.y - continuationProbePoint.y) <= endpointMatchDistance;
            }) || finalSegments
                .slice()
                .sort((a, b) =>
                    (Number(a?.createdAt) || 0) - (Number(b?.createdAt) || 0) ||
                    (Number(a?.order) || 0) - (Number(b?.order) || 0)
                )
                .pop() || this.getLogisticsLineById(finalGroupId);
            LogisticsStateActions.setSelectedLogistics(GameEngine.state, {
                groupId: finalGroupId,
                lineId: activeSegment
                    ? this.getLogisticsLineSelectionKey(activeSegment)
                    : null
            });
            if (window.UIManager) {
                window.UIManager.activeLogisticsLine = activeSegment || null;
                window.UIManager.activeLogisticsConnection = null;
            }
            selectedContinuationLine = activeSegment || null;
        }
        GameEngine.addLog(`[物流] 傳送帶建造完成，共 ${chargedSegments} 節。`, 'LOGISTICS');
        const continuationLine = selectedContinuationLine
            || createdLine
            || this.findTouchedLogisticsLineAt(continuationProbePoint, null, (GameEngine.TILE_SIZE || 20) * 0.75)
            || null;
        const continuationRoute = Array.isArray(continuationLine?.routePoints) ? continuationLine.routePoints : [];
        const continuationPoint = continuationRoute[continuationRoute.length - 1] || continuationProbePoint;
        const result = {
            built: builtSegments > 0,
            finalGroupId,
            continuationPoint,
            continuationLine
        };
        this.cancelDrag();
        return result;
    }

    this.cancelDrag();
    return null;
}

export class LogisticsDragSubmission {
    constructor(system) {
        this.system = system;
    }

    buildSingleSegmentAt(worldX, worldY) {
        return buildSingleSegmentAt.apply(this.system, arguments);
    }

    submitDrag() {
        return submitDrag.apply(this.system, arguments);
    }

}
