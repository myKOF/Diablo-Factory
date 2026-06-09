import {
    getPathDistanceToPoint,
    getPathTotalLength,
    getPointOnPathByDistance
} from './LogisticsPathMetrics.js';

export class LogisticsTransferQueues {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    applyBlockedQueues(state) {
        if (!state || !Array.isArray(state.activeTransfers) || state.activeTransfers.length === 0) return;
        const TS = this.gameEngine.TILE_SIZE || 20;
        const ITEM_LENGTH = TS;
        const minTransferSpacing = ITEM_LENGTH;
        const blockThreshold = ITEM_LENGTH;
        const releaseThreshold = ITEM_LENGTH * 1.05;
        const pathMetricsCache = new Map();
        const pointKey = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y)
            ? `${point.x},${point.y}`
            : null;
        const hasSuppressedTerminalEndpoint = (transfer) => {
            const lineId = transfer?.lineId || null;
            const points = Array.isArray(transfer?.routePoints) ? transfer.routePoints : [];
            const lastKey = pointKey(points[points.length - 1]);
            if (!lineId || !lastKey || !Array.isArray(state.logisticsLines)) return false;
            return state.logisticsLines.some(line => {
                const groupId = line?.groupId || line?.id || null;
                if (groupId !== lineId) return false;
                if (line?.suppressedOpenEndpointCellKey === lastKey) return true;
                return Array.isArray(line?.suppressedConnectionCellKeys) &&
                    line.suppressedConnectionCellKeys.includes(lastKey);
            });
        };
        const getMergeAdmissionWinner = (node) => {
            if (!node || !Array.isArray(node.inputGroupIds)) return null;
            if (this.system && typeof this.system.getLogisticsMergeAdmissionWinner === 'function') {
                return this.system.getLogisticsMergeAdmissionWinner(node, state, {
                    spacing: minTransferSpacing,
                    readyDistanceFromEnd: minTransferSpacing
                });
            }
            const mergePoint = node.point || { x: node.x, y: node.y };
            const key = `${node.outputGroupId || "output"}:${mergePoint.x || 0},${mergePoint.y || 0}`;
            const contendersByLine = new Map();
            state.activeTransfers.forEach(other => {
                if (!other || !node.inputGroupIds.includes(other.lineId)) return;
                if (!Array.isArray(other.routePoints) || other.routePoints.length < 2) return;
                const otherTotal = getPathTotalLength(other.routePoints, pathMetricsCache);
                if (otherTotal <= 0) return;
                const otherDistance = Math.max(0, Math.min(1, Number(other.progress) || 0)) * otherTotal;
                if (otherDistance < otherTotal - minTransferSpacing - 0.1) return;
                const current = contendersByLine.get(other.lineId);
                if (!current || otherDistance > current.distance || (
                    Math.abs(otherDistance - current.distance) <= 0.1 &&
                    String(other.id || "") < String(current.transfer.id || "")
                )) {
                    contendersByLine.set(other.lineId, { transfer: other, distance: otherDistance });
                }
            });
            const contenders = Array.from(contendersByLine.values())
                .map(item => item.transfer)
                .filter(item => item?.id)
                .sort((a, b) => String(a.id).localeCompare(String(b.id)));
            if (contenders.length <= 1) return contenders[0]?.id || null;
            const signature = contenders.map(item => item.id).join("|");
            if (!state._logisticsMergeAdmissionWinners) state._logisticsMergeAdmissionWinners = {};
            const previous = state._logisticsMergeAdmissionWinners[key];
            if (previous && previous.signature === signature && contenders.some(item => item.id === previous.winnerId)) {
                return previous.winnerId;
            }
            const winner = contenders[Math.floor(Math.random() * contenders.length)];
            state._logisticsMergeAdmissionWinners[key] = { signature, winnerId: winner.id };
            return winner.id;
        };
        const getMergeInputMaxDistance = (transfer, totalLength) => {
            if (!this.system || typeof this.system.getLogisticsMergeNodeForInputTransfer !== 'function') {
                return totalLength;
            }
            const node = this.system.getLogisticsMergeNodeForInputTransfer(transfer, state);
            if (!node || !node.outputGroupId) return totalLength;
            const mergePoint = node.point || { x: node.x, y: node.y };
            let requiredWait = 0;
            state.activeTransfers.forEach(other => {
                if (!other || other === transfer || other.lineId !== node.outputGroupId) return;
                if (!Array.isArray(other.routePoints) || other.routePoints.length < 2) return;
                const otherTotal = getPathTotalLength(other.routePoints, pathMetricsCache);
                if (otherTotal <= 0) return;
                const otherDistance = Math.max(0, Math.min(1, Number(other.progress) || 0)) * otherTotal;
                const mergeDistance = getPathDistanceToPoint(other.routePoints, mergePoint, pathMetricsCache);
                const distFromMerge = otherDistance - mergeDistance;
                requiredWait = Math.max(requiredWait, Math.max(0, minTransferSpacing - Math.abs(distFromMerge)));
            });
            if (requiredWait > 0) return Math.max(0, totalLength - requiredWait);
            const desired = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * totalLength;
            if (desired >= totalLength - minTransferSpacing - 0.1) {
                const winnerId = getMergeAdmissionWinner(node);
                if (winnerId && transfer.id && transfer.id !== winnerId) {
                    return Math.max(0, totalLength - minTransferSpacing);
                }
            }
            return totalLength;
        };
        const pathKey = (transfer) => {
            if (transfer.lineId) return `line:${transfer.lineId}`;
            const points = transfer.routePoints || [];
            const first = points[0];
            const last = points[points.length - 1];
            return [
                "route",
                first ? `${first.x},${first.y}` : "start",
                last ? `${last.x},${last.y}` : "end"
            ].join("|");
        };
        const groups = new Map();
        state.activeTransfers.forEach(transfer => {
            if (!transfer) return;
            if (!Array.isArray(transfer.routePoints) || transfer.routePoints.length < 2) return;
            const key = pathKey(transfer);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(transfer);
        });

        groups.forEach(transfers => {
            const canonical = transfers.reduce((best, transfer) => {
                const len = getPathTotalLength(transfer.routePoints, pathMetricsCache);
                return len > best.length ? { points: transfer.routePoints, length: len } : best;
            }, { points: null, length: 0 });
            const useCanonical = transfers.length > 1 && canonical.length > 0 && transfers.some(transfer => {
                const points = transfer.routePoints || [];
                const canonicalPoints = canonical.points || [];
                if (points.length !== canonicalPoints.length) return true;
                return points.some((point, index) => {
                    const other = canonicalPoints[index];
                    return !other || Math.hypot(point.x - other.x, point.y - other.y) > 0.1;
                });
            });

            const distanceCache = new Map();
            const getDistance = (transfer) => {
                if (distanceCache.has(transfer)) return distanceCache.get(transfer);
                const total = getPathTotalLength(transfer.routePoints, pathMetricsCache);
                const distance = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * total;
                const resolved = useCanonical
                    ? getPathDistanceToPoint(canonical.points, getPointOnPathByDistance(transfer.routePoints, distance, pathMetricsCache), pathMetricsCache)
                    : distance;
                distanceCache.set(transfer, resolved);
                return resolved;
            };
            transfers.sort((a, b) => {
                const da = getDistance(a);
                const db = getDistance(b);
                if (db !== da) return db - da;
                return String(a.id || "").localeCompare(String(b.id || ""));
            });

            let prevQueuedDistance = Infinity;
            transfers.forEach(transfer => {
                const sourceLength = getPathTotalLength(transfer.routePoints, pathMetricsCache);
                const totalLength = useCanonical ? canonical.length : sourceLength;
                if (totalLength <= 0) return;

                const sourceDistance = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * sourceLength;
                const desired = useCanonical
                    ? getPathDistanceToPoint(canonical.points, getPointOnPathByDistance(transfer.routePoints, sourceDistance, pathMetricsCache), pathMetricsCache)
                    : sourceDistance;
                const currentDistance = Math.max(0, Math.min(desired, totalLength));
                const previousTransferDistance = Number.isFinite(transfer._queuedDistance)
                    ? Math.max(0, Math.min(transfer._queuedDistance, totalLength))
                    : currentDistance;
                let maxAllowed = Number.isFinite(prevQueuedDistance)
                    ? prevQueuedDistance - ITEM_LENGTH
                    : Infinity;
                let breakpointLimit = totalLength;
                const isMergeInput = this.system.isLogisticsMergeInputTransfer(transfer, state);

                const stopBeforeSuppressedEndpoint = !transfer.targetId && !isMergeInput && hasSuppressedTerminalEndpoint(transfer);

                if (!transfer.targetId && !isMergeInput) {

                    breakpointLimit = Math.floor(totalLength / TS) * TS;
                    if (stopBeforeSuppressedEndpoint) {
                        breakpointLimit = Math.max(0, breakpointLimit - TS);
                    }
                    maxAllowed = Math.min(maxAllowed, breakpointLimit);
                } else {
                    maxAllowed = Math.min(maxAllowed, totalLength);
                    if (isMergeInput && prevQueuedDistance === Infinity) {
                        maxAllowed = Math.min(maxAllowed, getMergeInputMaxDistance(transfer, totalLength));
                    }
                }

                let queuedDistance = Math.max(0, Math.min(desired, maxAllowed));
                if (Number.isFinite(prevQueuedDistance)) {
                    const distToFront = prevQueuedDistance - desired;
                    if (distToFront < blockThreshold) {
                        queuedDistance = Math.max(0, prevQueuedDistance - ITEM_LENGTH);
                    } else if (transfer.queueBlocked === true && distToFront < releaseThreshold) {
                        queuedDistance = Math.min(queuedDistance, previousTransferDistance);
                    }
                    queuedDistance = Math.max(0, Math.min(queuedDistance, maxAllowed));
                }
                if (currentDistance <= maxAllowed + 0.0001 && Math.abs(queuedDistance - currentDistance) < 0.1) {
                    queuedDistance = currentDistance;
                }

                const blockedAtBreakpoint = !transfer.targetId && !isMergeInput && queuedDistance >= breakpointLimit - 0.1;
                transfer.queueBlocked = queuedDistance < desired - 0.1 || blockedAtBreakpoint;
                if (useCanonical) {
                    transfer.routePoints = canonical.points.map(point => ({ ...point }));
                }
                const nextDistance = stopBeforeSuppressedEndpoint && currentDistance > breakpointLimit
                    ? breakpointLimit
                    : queuedDistance;
                transfer.progress = Math.max(0, Math.min(1, nextDistance / totalLength));
                transfer._queuedDistance = nextDistance;
                if (transfer.targetId || isMergeInput) {
                    delete transfer.blockedOnBrokenLine;
                } else {
                    transfer.blockedOnBrokenLine = true;
                }

                prevQueuedDistance = nextDistance;
            });
        });
    }
}
