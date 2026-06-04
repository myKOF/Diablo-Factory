import { GameEngine } from '../game_systems.js';

function applyExtensionTurnArrowOverride(drag, points) {
    if (!drag?.isLineExtension || !drag.sourceLine || !Array.isArray(points) || points.length < 2) return;
    const sourceLine = drag.sourceLine;
    const route = Array.isArray(sourceLine.routePoints) ? sourceLine.routePoints : [];
    if (route.length < 2) return;

    const getDir = (a, b) => {
        if (!a || !b) return null;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
        return Math.abs(dx) >= Math.abs(dy)
            ? { x: Math.sign(dx) || 1, y: 0 }
            : { x: 0, y: Math.sign(dy) || 1 };
    };
    const originalDir = getDir(route[0], route[1]);
    const extensionDir = getDir(points[0], points[1]);
    if (!originalDir || !extensionDir) return;
    const groupId = sourceLine.groupId || sourceLine.id || null;
    const cellKey = `${Math.round(sourceLine.x)},${Math.round(sourceLine.y)}`;
    const clearStateOverride = () => {
        if (!Array.isArray(GameEngine.state.logisticsTurnArrowOverrides)) return;
        GameEngine.state.logisticsTurnArrowOverrides = GameEngine.state.logisticsTurnArrowOverrides.filter(item =>
            item?.overrideKey !== `${groupId || "line"}:${cellKey}`
        );
    };

    const isSame = originalDir.x === extensionDir.x && originalDir.y === extensionDir.y;
    const isOpposite = originalDir.x === -extensionDir.x && originalDir.y === -extensionDir.y;
    if (isSame || isOpposite) {
        delete sourceLine.turnArrowOverride;
        clearStateOverride();
        return;
    }

    const dx = originalDir.x + extensionDir.x;
    const dy = originalDir.y + extensionDir.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) {
        delete sourceLine.turnArrowOverride;
        clearStateOverride();
        return;
    }

    const turnArrowOverride = {
        groupId,
        cellKey,
        anchorX: sourceLine.x,
        anchorY: sourceLine.y,
        dirX: dx / len,
        dirY: dy / len,
        sourceDirX: originalDir.x,
        sourceDirY: originalDir.y,
        extensionDirX: extensionDir.x,
        extensionDirY: extensionDir.y
    };
    sourceLine.turnArrowOverride = turnArrowOverride;

    if (!Array.isArray(GameEngine.state.logisticsTurnArrowOverrides)) {
        GameEngine.state.logisticsTurnArrowOverrides = [];
    }
    const overrideKey = `${turnArrowOverride.groupId || "line"}:${turnArrowOverride.cellKey}`;
    const stateOverride = { ...turnArrowOverride, overrideKey };
    const existingIndex = GameEngine.state.logisticsTurnArrowOverrides.findIndex(item => item?.overrideKey === overrideKey);
    if (existingIndex >= 0) {
        GameEngine.state.logisticsTurnArrowOverrides[existingIndex] = stateOverride;
    } else {
        GameEngine.state.logisticsTurnArrowOverrides.push(stateOverride);
    }

    (GameEngine.state.logisticsLines || []).forEach((line) => {
        if (!line) return;
        const sameId = sourceLine.id && line.id === sourceLine.id;
        const sameGroupPosition = (sourceLine.groupId || sourceLine.id) &&
            (line.groupId === sourceLine.groupId || line.id === sourceLine.groupId || line.groupId === sourceLine.id) &&
            Math.abs((line.x || 0) - (sourceLine.x || 0)) < 0.001 &&
            Math.abs((line.y || 0) - (sourceLine.y || 0)) < 0.001;
        if (sameId || sameGroupPosition) {
            line.turnArrowOverride = { ...turnArrowOverride };
        }
    });
}

function splitSourceGroupForMiddleExtension(drag) {
    const sourceLine = drag?.sourceLine || null;
    const sourceGroupId = sourceLine?.groupId || sourceLine?.id || null;
    if (!sourceGroupId) return null;

    const groupSegments = this.getLogisticsSegmentsByGroupId(sourceGroupId);
    if (!Array.isArray(groupSegments) || groupSegments.length < 2) return null;

    const TS = GameEngine.TILE_SIZE || 20;
    const startPoint = { x: drag.startX, y: drag.startY };
    const getRoute = (seg) => Array.isArray(seg?.routePoints) ? seg.routePoints : [];
    const getSegmentKey = (seg) => this.getLogisticsLineSelectionKey(seg) || seg?.id || `${seg?.x},${seg?.y}`;
    const getPointKey = (point) => point ? `${Math.round(point.x)},${Math.round(point.y)}` : null;
    const getStartPoint = (seg) => getRoute(seg)[0] || null;
    const getEndPoint = (seg) => {
        const route = getRoute(seg);
        return route[route.length - 1] || null;
    };
    const getSourceLineMatchKey = () => this.getLogisticsLineSelectionKey(sourceLine) || sourceLine?.id || null;
    const ordered = this.orderLogisticsSegmentsByDirection(groupSegments);
    const firstRoute = getRoute(ordered[0]);
    const lastRoute = getRoute(ordered[ordered.length - 1]);
    const groupStart = firstRoute[0] || null;
    const groupEnd = lastRoute[lastRoute.length - 1] || null;
    if (groupStart && Math.hypot(startPoint.x - groupStart.x, startPoint.y - groupStart.y) <= TS * 0.75) return null;
    if (groupEnd && Math.hypot(startPoint.x - groupEnd.x, startPoint.y - groupEnd.y) <= TS * 0.75) return null;

    const distanceToSegment = (point, seg) => {
        const points = getRoute(seg);
        if (points.length < 2) return Infinity;
        let best = Infinity;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const lengthSq = dx * dx + dy * dy;
            if (lengthSq < 0.001) continue;
            const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
            const px = a.x + dx * t;
            const py = a.y + dy * t;
            best = Math.min(best, Math.hypot(point.x - px, point.y - py));
        }
        return best;
    };

    const sourceLineMatchKey = getSourceLineMatchKey();
    let splitSegment = ordered.find(seg =>
        seg === sourceLine ||
        (sourceLine.id && seg.id === sourceLine.id) ||
        this.getLogisticsLineSelectionKey(seg) === sourceLineMatchKey
    ) || null;
    if (!splitSegment) {
        let bestDistance = Infinity;
        ordered.forEach((seg) => {
            const dist = distanceToSegment(startPoint, seg);
            if (dist < bestDistance) {
                bestDistance = dist;
                splitSegment = seg;
            }
        });
        if (bestDistance > TS * 0.75) return null;
    }

    const graph = new Map();
    const edgeToSegments = new Map();
    const addNode = (key) => {
        if (!key) return;
        if (!graph.has(key)) graph.set(key, new Set());
    };
    const getEdgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
    ordered.forEach(seg => {
        const segKey = getSegmentKey(seg);
        const route = getRoute(seg);
        for (let i = 0; i < route.length - 1; i++) {
            const a = route[i];
            const b = route[i + 1];
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.001) continue;
            const dirX = dx / dist;
            const dirY = dy / dist;
            const steps = Math.max(1, Math.round(dist / TS));
            let previousKey = getPointKey(a);
            addNode(previousKey);
            for (let step = 1; step <= steps; step++) {
                const point = step === steps
                    ? b
                    : { x: a.x + dirX * TS * step, y: a.y + dirY * TS * step };
                const key = getPointKey(point);
                addNode(key);
                graph.get(previousKey).add(key);
                graph.get(key).add(previousKey);
                const edgeKey = getEdgeKey(previousKey, key);
                if (!edgeToSegments.has(edgeKey)) edgeToSegments.set(edgeKey, new Set());
                edgeToSegments.get(edgeKey).add(segKey);
                previousKey = key;
            }
        }
    });

    const nearestNodeKey = (point) => {
        if (!point || graph.size === 0) return null;
        let bestKey = null;
        let bestDistance = Infinity;
        graph.forEach((_, key) => {
            const [x, y] = key.split(",").map(Number);
            const dist = Math.hypot(x - point.x, y - point.y);
            if (dist < bestDistance) {
                bestDistance = dist;
                bestKey = key;
            }
        });
        return bestKey;
    };
    const findNodePath = (startKey, endKey) => {
        if (!startKey || !endKey) return null;
        const queue = [startKey];
        const visited = new Set([startKey]);
        const previous = new Map();
        while (queue.length > 0) {
            const current = queue.shift();
            if (current === endKey) break;
            (graph.get(current) || new Set()).forEach(next => {
                if (visited.has(next)) return;
                visited.add(next);
                previous.set(next, current);
                queue.push(next);
            });
        }
        if (!visited.has(endKey)) return null;
        const path = [];
        let current = endKey;
        while (current) {
            path.unshift(current);
            if (current === startKey) break;
            current = previous.get(current);
        }
        return path[0] === startKey ? path : null;
    };

    const sourcePort = ordered.find(seg => seg?.sourcePort)?.sourcePort || null;
    const sequenceStart = getStartPoint(ordered[0]);
    const sourceKey = nearestNodeKey(sourcePort || sequenceStart);
    const splitStartPoint = getStartPoint(splitSegment);
    const branchKey = getPointKey(splitStartPoint) || nearestNodeKey(startPoint);
    const sourceToBranchPath = findNodePath(sourceKey, branchKey);
    const keepSegmentKeys = new Set();
    const sourceSegmentKey = getSegmentKey(splitSegment);
    if (sourceToBranchPath && sourceToBranchPath.length >= 2) {
        for (let i = 0; i < sourceToBranchPath.length - 1; i++) {
            const edgeKey = getEdgeKey(sourceToBranchPath[i], sourceToBranchPath[i + 1]);
            (edgeToSegments.get(edgeKey) || new Set()).forEach(segKey => keepSegmentKeys.add(segKey));
        }
    }
    if (sourceSegmentKey) keepSegmentKeys.delete(sourceSegmentKey);

    let frontSegments = [];
    let backSegments = [];
    if (keepSegmentKeys.size > 0) {
        frontSegments = ordered.filter(seg => keepSegmentKeys.has(getSegmentKey(seg)));
        backSegments = ordered.filter(seg => !keepSegmentKeys.has(getSegmentKey(seg)));
    } else {
        const byStartKey = new Map();
        ordered.forEach(seg => {
            const key = getPointKey(getStartPoint(seg));
            if (!key) return;
            if (!byStartKey.has(key)) byStartKey.set(key, []);
            byStartKey.get(key).push(seg);
        });
        const downstream = new Set();
        const queue = [splitSegment, ...(byStartKey.get(getPointKey(getEndPoint(splitSegment))) || [])];
        while (queue.length > 0) {
            const seg = queue.shift();
            if (!seg) continue;
            const segKey = getSegmentKey(seg);
            if (!segKey || downstream.has(segKey)) continue;
            downstream.add(segKey);
            (byStartKey.get(getPointKey(getEndPoint(seg))) || []).forEach(next => queue.push(next));
        }
        frontSegments = ordered.filter(seg => !downstream.has(getSegmentKey(seg)));
        backSegments = ordered.filter(seg => downstream.has(getSegmentKey(seg)));
    }
    if (frontSegments.length === 0 || backSegments.length === 0) return null;

    const newGroupId = `log_group_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const frontTail = frontSegments[frontSegments.length - 1] || null;
    const backHead = backSegments[0];
    const detachPoint = getStartPoint(splitSegment) || getEndPoint(frontTail) || getStartPoint(backHead) || null;
    const detachKey = detachPoint ? `${Math.round(detachPoint.x)},${Math.round(detachPoint.y)}` : null;

    if (frontTail) frontTail.nextId = null;
    if (backHead) backHead.prevId = null;
    backSegments.forEach(seg => {
        if (!seg) return;
        seg.groupId = newGroupId;
        seg.sourceId = null;
        seg.targetId = null;
        seg.sourcePort = null;
        seg.targetPort = null;
        seg.targetPoint = null;
        seg.detachedFromGroupId = sourceGroupId;
        if (detachKey) seg.detachedAtKey = detachKey;
        delete seg.detachedByDeletedGap;
        delete seg.turnArrowOverride;
    });

    this.orderLogisticsSegmentsByDirection(frontSegments);
    this.orderLogisticsSegmentsByDirection(backSegments);
    return {
        sourceGroupId,
        detachedGroupId: newGroupId,
        attachPoint: detachPoint ? { x: detachPoint.x, y: detachPoint.y } : null
    };
}

export class LogisticsExtensionCoordinator {
    constructor(system) {
        this.system = system;
    }

    applyExtensionTurnArrowOverride(drag, points) {
        return applyExtensionTurnArrowOverride.apply(this.system, arguments);
    }

    splitSourceGroupForMiddleExtension(drag) {
        return splitSourceGroupForMiddleExtension.apply(this.system, arguments);
    }

}
