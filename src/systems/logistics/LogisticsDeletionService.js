import { GameEngine } from '../game_systems.js';
import { LogisticsStateActions } from './LogisticsStateActions.js';

function cleanupDeletedLinePreviousTurnOverride(deletedLine, originalGroupId) {
    if (!deletedLine || !originalGroupId) return;
    const TS = GameEngine.TILE_SIZE;
    const lines = this.ensureLogisticsLineStore();
    const getSequenceOrder = (line) => Number.isFinite(line?.splitSequenceOrder)
        ? line.splitSequenceOrder
        : (Number.isFinite(line?.order) ? line.order : 0);
    const deletedOrder = getSequenceOrder(deletedLine);
    const previous = lines
        .filter(line => line && (line.groupId === originalGroupId || line.id === originalGroupId))
        .filter(line => getSequenceOrder(line) < deletedOrder)
        .sort((a, b) => getSequenceOrder(b) - getSequenceOrder(a))[0] || null;
    if (!previous?.turnArrowOverride) return;

    const pointsTowardDeletedLine = (override) => {
        if (!Number.isFinite(override?.anchorX) || !Number.isFinite(override?.anchorY)) return false;
        if (!Number.isFinite(override?.extensionDirX) || !Number.isFinite(override?.extensionDirY)) return false;
        const targetX = override.anchorX + override.extensionDirX * TS;
        const targetY = override.anchorY + override.extensionDirY * TS;
        return Math.hypot(targetX - (deletedLine.x || 0), targetY - (deletedLine.y || 0)) <= TS * 0.25;
    };

    if (!pointsTowardDeletedLine(previous.turnArrowOverride)) return;
    const overrideKey = `${previous.turnArrowOverride.groupId || "line"}:${previous.turnArrowOverride.cellKey}`;
    const overrideCellKey = previous.turnArrowOverride.cellKey;
    delete previous.turnArrowOverride;

    LogisticsStateActions.removeTurnArrowOverride(
        GameEngine.state,
        override => override?.overrideKey === overrideKey || override?.cellKey === overrideCellKey
    );
}

function cleanupLogisticsMergeNodesForDeletedLine(deletedLine) {
    const state = GameEngine.state;
    const points = Array.isArray(deletedLine?.routePoints) ? deletedLine.routePoints : [];
    if (points.length === 0) return new Set();
    const TS = GameEngine.TILE_SIZE || 20;
    const tolerance = TS * 0.25; // 緊密判定：只在非常靠近合流點時才移除節點，避免中段拆分誤判
    const nodes = this.ensureLogisticsMergeNodeStore(state);
    const removedNodes = nodes.filter(node => {
        const point = node?.point || (Number.isFinite(node?.x) && Number.isFinite(node?.y) ? { x: node.x, y: node.y } : null);
        if (!point) return false;
        return points.some(routePoint =>
            routePoint &&
            Number.isFinite(routePoint.x) &&
            Number.isFinite(routePoint.y) &&
            Math.hypot(routePoint.x - point.x, routePoint.y - point.y) <= tolerance
        );
    });
    if (removedNodes.length === 0) return new Set();

    const affectedGroupIds = new Set();
    const removedPoints = [];
    removedNodes.forEach(node => {
        if (node.outputGroupId) affectedGroupIds.add(node.outputGroupId);
        (node.inputGroupIds || []).forEach(groupId => {
            if (groupId) affectedGroupIds.add(groupId);
        });
        const point = node.point || { x: node.x, y: node.y };
        if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) removedPoints.push(point);
    });
    state.logisticsMergeNodes = nodes.filter(node => !removedNodes.includes(node));

    this.ensureLogisticsLineStore().forEach(line => {
        const groupId = line?.groupId || line?.id || null;
        if (!groupId || !affectedGroupIds.has(groupId)) return;
        removedPoints.forEach(point => this.markSuppressedLogisticsConnectionCell(line, point));
    });
    return affectedGroupIds;
}

function deleteLogisticsLineById(lineId) {
    this.isProcessingMerge = true;
    try {
        const state = GameEngine.state;
        const getEntityId = (ent) => window.UIManager?.getEntityId?.(ent) || ent?.id || null;
        const line = this.getLogisticsLineById(lineId);
        if (!line) return false;
        const deleteUndoSnapshot = this.captureLogisticsBuildUndoSnapshot(state);
        const lineKey = this.getLogisticsLineSelectionKey(line);
        const groupId = line.groupId || line.id;

        const lineGridX = line.gridX;
        const lineGridY = line.gridY;

        // DLL 指標斷開
        const segments = this.ensureLogisticsLineStore();
        const prevSeg = segments.find(s => s && s.nextId === line.id);
        const nextSeg = segments.find(s => s && s.prevId === line.id);
        if (prevSeg) prevSeg.nextId = null;
        if (nextSeg) nextSeg.prevId = null;

        LogisticsStateActions.replaceLogisticsLines(state, segments.filter(item => {
            const isTarget = this.getLogisticsLineSelectionKey(item) === lineKey;
            const isDuplicate = item && item.gridX === lineGridX && item.gridY === lineGridY;
            return !isTarget && !isDuplicate;
        }));
        this.cleanupDeletedLinePreviousTurnOverride(line, groupId);
        const mergeCleanupAffectedGroupIds = this.cleanupLogisticsMergeNodesForDeletedLine(line);

        // [核心修正 v3] 使用「order 值直接分割」取代不可靠的 BFS 端點連通判定。
        const getSequenceOrder = (seg) =>
            Number.isFinite(seg?.splitSequenceOrder) ? seg.splitSequenceOrder
                : (Number.isFinite(seg?.order) ? seg.order : 0);

        const deletedOrder = getSequenceOrder(line);
        const remainingSegments = this.getLogisticsSegmentsByGroupId(groupId);

        if (remainingSegments.length > 0) {
            // 依 order 值將剩餘線段分為前半段與後半段
            const frontSegments = remainingSegments.filter(seg => getSequenceOrder(seg) < deletedOrder);
            const backSegments = remainingSegments.filter(seg => getSequenceOrder(seg) >= deletedOrder);

            if (frontSegments.length > 0 && backSegments.length > 0) {
                const newGroupId = `log_group_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
                const frontTail = frontSegments
                    .sort((a, b) => getSequenceOrder(b) - getSequenceOrder(a))[0] || null;
                this.markDeletedGapEndpoint(frontTail);
                const detachKey = frontTail?.suppressedOpenEndpointCellKey || null;
                backSegments.forEach(seg => {
                    if (!seg) return;
                    seg.groupId = newGroupId;
                    seg.detachedFromGroupId = groupId;
                    if (detachKey) seg.detachedAtKey = detachKey;
                    seg.detachedByDeletedGap = true;
                });

                // 更新受影響的 MergeNode 的 inputGroupIds 與 inputDirections
                const nodes = this.ensureLogisticsMergeNodeStore(state);
                nodes.forEach(node => {
                    if (node && Array.isArray(node.inputGroupIds)) {
                        const idx = node.inputGroupIds.indexOf(groupId);
                        if (idx >= 0) {
                            node.inputGroupIds[idx] = newGroupId;
                            if (node.inputDirections && node.inputDirections[groupId]) {
                                node.inputDirections[newGroupId] = node.inputDirections[groupId];
                                delete node.inputDirections[groupId];
                            }
                        }
                    }
                });

                // 自動重新計算兩段物流線的端點及與建築物的連接關係
                this.recalculateLogisticsGroupEndpoints(groupId);
                this.recalculateLogisticsGroupEndpoints(newGroupId);
                this.updateActiveTransfersOnLogisticsChange(state, new Set([groupId, newGroupId, ...mergeCleanupAffectedGroupIds]));

                GameEngine.addLog(`[物流] 線段中斷，物流線已拆分為獨立路線。`, 'LOGISTICS');
            } else {
                // 只有前半或只有後半（從端點刪除），只需重新計算該群組即可
                this.recalculateLogisticsGroupEndpoints(groupId);
                this.updateActiveTransfersOnLogisticsChange(state, new Set([groupId, ...mergeCleanupAffectedGroupIds]));
            }
        } else {
            // 如果這個群組已經沒有任何線段，清除 sourceEnt 的輸出紀錄
            if (line.sourceId) {
                const sourceEnt = state.mapEntities.find(ent => getEntityId(ent) === line.sourceId);
                if (sourceEnt && Array.isArray(sourceEnt.outputTargets)) {
                    sourceEnt.outputTargets = sourceEnt.outputTargets.filter(conn => conn.lineId !== groupId);
                }
            }
            this.undoStore.cleanupInvalidActiveTransfers(
                state,
                Array.isArray(state.mapEntities) ? state.mapEntities : [],
                getEntityId,
                new Set([groupId, ...mergeCleanupAffectedGroupIds])
            );
            if (mergeCleanupAffectedGroupIds.size > 0) {
                this.updateActiveTransfersOnLogisticsChange(state, mergeCleanupAffectedGroupIds);
            }
        }

        LogisticsStateActions.clearSelectedLogisticsIfMatches(state, {
            lineId: lineKey,
            groupId: line.groupId || line.id
        });
        if (window.UIManager.activeLogisticsLine && this.getLogisticsLineSelectionKey(window.UIManager.activeLogisticsLine) === lineKey) window.UIManager.activeLogisticsLine = null;
        if (window.UIManager.activeLogisticsConnection?.lineId === lineKey) window.UIManager.activeLogisticsConnection = null;
        this.recordLogisticsBuildUndoSnapshot(deleteUndoSnapshot, state);
        GameEngine.addLog(`[物流] 物流線段已刪除`, 'LOGISTICS');
        return true;
    } finally {
        this.isProcessingMerge = false;
        this.rebuildSpatialHashGrid();
    }
}

function deleteLogisticsLineGroupById(groupId) {
    const state = GameEngine.state;
    const getEntityId = (ent) => window.UIManager?.getEntityId?.(ent) || ent?.id || null;
    const segments = this.getLogisticsSegmentsByGroupId(groupId);
    if (!segments.length) return false;
    const first = segments[0];
    LogisticsStateActions.replaceLogisticsLines(
        state,
        this.ensureLogisticsLineStore().filter(item => item.groupId !== groupId && item.id !== groupId)
    );
    if (first.sourceId) {
        const sourceEnt = state.mapEntities.find(ent => getEntityId(ent) === first.sourceId);
        if (sourceEnt && Array.isArray(sourceEnt.outputTargets)) {
            sourceEnt.outputTargets = sourceEnt.outputTargets.filter(conn => conn.lineId !== groupId);
        }
    }
    this.undoStore.cleanupInvalidActiveTransfers(
        state,
        Array.isArray(state.mapEntities) ? state.mapEntities : [],
        getEntityId,
        new Set([groupId])
    );
    if (segments.some(line => this.isSelectedLogisticsLine(line)) || state.selectedLogisticsGroupId === groupId) {
        LogisticsStateActions.clearSelectedLogisticsIfMatches(state, {
            lineId: state.selectedLogisticsLineId,
            groupId
        });
    }
    if (window.UIManager.activeLogisticsLine && window.UIManager.activeLogisticsLine.groupId === groupId) window.UIManager.activeLogisticsLine = null;
    if (window.UIManager.activeLogisticsConnection?.groupId === groupId) window.UIManager.activeLogisticsConnection = null;
    this.updateActiveTransfersOnLogisticsChange(state, new Set([groupId]));
    GameEngine.addLog(`[物流] 物流線群組已刪除`, 'LOGISTICS');
    this.rebuildSpatialHashGrid();
    return true;
}

export class LogisticsDeletionService {
    constructor(system) {
        this.system = system;
    }

    cleanupDeletedLinePreviousTurnOverride(deletedLine, originalGroupId) {
        return cleanupDeletedLinePreviousTurnOverride.apply(this.system, arguments);
    }

    cleanupLogisticsMergeNodesForDeletedLine(deletedLine) {
        return cleanupLogisticsMergeNodesForDeletedLine.apply(this.system, arguments);
    }

    deleteLogisticsLineById(lineId) {
        return deleteLogisticsLineById.apply(this.system, arguments);
    }

    deleteLogisticsLineGroupById(groupId) {
        return deleteLogisticsLineGroupById.apply(this.system, arguments);
    }

}
