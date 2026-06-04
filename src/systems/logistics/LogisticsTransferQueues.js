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
        const pathMetricsCache = new Map();

        const getPathMetrics = (points) => {
            if (!Array.isArray(points) || points.length < 2) return { total: 0, segments: [] };
            const cached = pathMetricsCache.get(points);
            if (cached) return cached;

            let total = 0;
            const segments = [];
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.hypot(dx, dy);
                segments.push({ a, b, dx, dy, len, start: total });
                total += len;
            }
            const metrics = { total, segments };
            pathMetricsCache.set(points, metrics);
            return metrics;
        };
        const getPathTotalLength = (points) => {
            return getPathMetrics(points).total;
        };
        const getPointOnPathByDistance = (points, distance) => {
            if (!Array.isArray(points) || points.length < 2) return null;
            let remaining = Math.max(0, Number(distance) || 0);
            const segments = getPathMetrics(points).segments;
            for (let i = 0; i < segments.length; i++) {
                const { a, b, dx, dy, len } = segments[i];
                if (len <= 0) continue;
                if (remaining <= len || i === segments.length - 1) {
                    const t = Math.max(0, Math.min(1, remaining / len));
                    return {
                        x: a.x + dx * t,
                        y: a.y + dy * t
                    };
                }
                remaining -= len;
            }
            return points[points.length - 1] || null;
        };
        const getPathDistanceToPoint = (points, point) => {
            if (!Array.isArray(points) || points.length < 2 || !point) return 0;
            let bestDist = Infinity;
            let bestPathDist = 0;
            const segments = getPathMetrics(points).segments;
            for (let i = 0; i < segments.length; i++) {
                const { a, dx, dy, len, start } = segments[i];
                const lenSq = dx * dx + dy * dy;
                if (lenSq <= 0) continue;
                const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
                const proj = { x: a.x + dx * t, y: a.y + dy * t };
                const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestPathDist = start + len * t;
                }
            }
            return bestPathDist;
        };
        const pathKey = (transfer) => {
            if (transfer.lineId) return `line:${transfer.lineId}`;
            const points = transfer.routePoints || [];
            const first = points[0];
            const last = points[points.length - 1];
            return [
                "route",
                first ? `${Math.round(first.x)},${Math.round(first.y)}` : "start",
                last ? `${Math.round(last.x)},${Math.round(last.y)}` : "end"
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
                const len = getPathTotalLength(transfer.routePoints);
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
                const total = getPathTotalLength(transfer.routePoints);
                const distance = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * total;
                const resolved = useCanonical
                    ? getPathDistanceToPoint(canonical.points, getPointOnPathByDistance(transfer.routePoints, distance))
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

            let occupiedProgress = Infinity;
            let queueBlockedBehind = false;
            transfers.forEach(transfer => {
                const sourceLength = getPathTotalLength(transfer.routePoints);
                const totalLength = useCanonical ? canonical.length : sourceLength;
                if (totalLength <= 0) return;

                const sourceDistance = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * sourceLength;
                const desired = useCanonical
                    ? getPathDistanceToPoint(canonical.points, getPointOnPathByDistance(transfer.routePoints, sourceDistance))
                    : sourceDistance;
                let maxAllowed = occupiedProgress - TS;
                let breakpointLimit = totalLength;
                const isMergeInput = this.system.isLogisticsMergeInputTransfer(transfer, state);

                if (!transfer.targetId && !isMergeInput) {
                    breakpointLimit = Math.floor(totalLength / TS) * TS;
                    maxAllowed = Math.min(maxAllowed, breakpointLimit);
                } else {
                    maxAllowed = Math.min(maxAllowed, totalLength);
                }

                let queuedDistance = Math.max(0, Math.min(desired, maxAllowed));
                if (Math.abs(queuedDistance - desired) < 0.1) {
                    queuedDistance = desired;
                }

                const blockedAtBreakpoint = !transfer.targetId && !isMergeInput && queuedDistance >= breakpointLimit - 0.1;
                transfer.queueBlocked = queuedDistance < desired - 0.1 || blockedAtBreakpoint || queueBlockedBehind;
                if (useCanonical) {
                    transfer.routePoints = canonical.points.map(point => ({ ...point }));
                }
                transfer.progress = Math.max(0, Math.min(1, queuedDistance / totalLength));
                if (transfer.targetId || isMergeInput) {
                    delete transfer.blockedOnBrokenLine;
                } else {
                    transfer.blockedOnBrokenLine = true;
                }

                occupiedProgress = queuedDistance;
                queueBlockedBehind = transfer.queueBlocked === true;
            });
        });
    }
}
