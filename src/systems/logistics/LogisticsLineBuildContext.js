import { cloneLogisticsPort, hasLogisticsPortPosition } from './LogisticsPortUtils.js';

export class LogisticsLineBuildContext {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    create(params) {
        const {
            lineId = null,
            sourceEnt,
            targetEnt = null,
            targetPoint = null,
            points = [],
            sourcePort = null,
            targetPort = null,
            conn = null
        } = params;
        const lines = this.system.ensureLogisticsLineStore();
        const sourceId = window.UIManager.getEntityId(sourceEnt);
        const targetId = targetEnt ? window.UIManager.getEntityId(targetEnt) : null;
        const groupId = lineId || conn?.lineId || this.system.makeLogisticsLineId(sourceId, targetId, targetPoint);
        const cleanTargetPoint = (targetId || !targetPoint) ? null : this.system.snapPointToGridCenter(targetPoint);
        const gridPoints = this.system.buildGridRoutePoints(points);
        const previous = lines.find(item => item.groupId === groupId || item.id === groupId);
        const existingGroupSegments = lines.filter(line => line && (line.groupId === groupId || line.id === groupId));
        const existingSourceConnection = this.findExistingSourceConnection(groupId);
        const previousSourceId = previous?.sourceId ||
            existingGroupSegments.find(line => line?.sourceId)?.sourceId ||
            existingSourceConnection?.sourceId ||
            null;
        const canonicalSourceId = sourceId || previousSourceId || null;
        const cleanSourcePort = this.resolveSourcePort({
            sourceEnt,
            targetEnt,
            targetPoint,
            sourcePort,
            conn,
            lines,
            groupId,
            gridPoints,
            previous,
            existingGroupSegments,
            existingSourceConnection
        });
        const cleanTargetPort = cloneLogisticsPort(targetPort);
        const filter = conn ? null : (previous?.filter || null);
        return {
            lines,
            sourceId,
            targetId,
            groupId,
            cleanTargetPoint,
            gridPoints,
            previous,
            existingGroupSegments,
            existingSourceConnection,
            previousSourceId,
            canonicalSourceId,
            cleanSourcePort,
            cleanTargetPort,
            filter
        };
    }

    findExistingSourceConnection(groupId) {
        const entities = this.gameEngine.state?.mapEntities || [];
        for (const ent of entities) {
            const outputTargets = Array.isArray(ent?.outputTargets) ? ent.outputTargets : [];
            const match = outputTargets.find(output => output && output.lineId === groupId);
            if (match) {
                return {
                    sourceId: window.UIManager.getEntityId(ent),
                    sourcePort: match.sourcePort || null
                };
            }
        }
        return null;
    }

    resolveSourcePort(context) {
        const {
            sourceEnt,
            targetEnt,
            targetPoint,
            sourcePort,
            conn,
            lines,
            groupId,
            gridPoints,
            previous,
            existingGroupSegments,
            existingSourceConnection
        } = context;
        const findNearestSourceEntityPort = () => {
            if (!sourceEnt || typeof window.UIManager.getBuildingPortSlots !== 'function') return null;
            const slots = window.UIManager.getBuildingPortSlots(sourceEnt);
            if (!Array.isArray(slots) || slots.length === 0) return null;

            const refs = [];
            lines.forEach(line => {
                if (!line || (line.groupId !== groupId && line.id !== groupId)) return;
                (line.routePoints || []).forEach(point => {
                    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) refs.push(point);
                });
            });
            gridPoints.forEach(point => {
                if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) refs.push(point);
            });
            if (targetEnt) refs.push({ x: targetEnt.x, y: targetEnt.y });
            if (targetPoint) refs.push(targetPoint);
            if (refs.length === 0) return null;

            let best = null;
            let bestScore = Infinity;
            slots.forEach(slot => {
                refs.forEach(ref => {
                    const score = Math.hypot(slot.x - ref.x, slot.y - ref.y);
                    if (score < bestScore) {
                        bestScore = score;
                        best = slot;
                    }
                });
            });
            return cloneLogisticsPort(best);
        };
        const fallbackSourcePort = () => {
            const candidates = [
                conn?.sourcePort,
                existingSourceConnection?.sourcePort,
                previous?.sourcePort,
                ...existingGroupSegments.map(line => line.sourcePort)
            ];
            const stored = candidates.find(hasLogisticsPortPosition);
            return stored ? cloneLogisticsPort(stored) : findNearestSourceEntityPort();
        };
        let cleanSourcePort = sourcePort?.sourceType === "logistics_line" ? null : cloneLogisticsPort(sourcePort);
        if (!hasLogisticsPortPosition(cleanSourcePort)) cleanSourcePort = fallbackSourcePort();
        return cleanSourcePort;
    }
}
