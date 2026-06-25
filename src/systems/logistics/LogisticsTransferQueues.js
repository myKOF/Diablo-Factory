import {
    getPathDistanceToPoint,
    getPathTotalLength,
    getPointOnPathByDistance
} from './LogisticsPathMetrics.js';
import { logisticsTransportArrayState } from './LogisticsTransportArrayState.js';
import { routePointsSignature } from './LogisticsRouteCache.js';
import { computeMergeInputMaxDistance } from './LogisticsMergeSpacing.js';

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
        // [緊密不重疊] 合流間距與一般排隊間距一致，等於完整物品長度，嚴防重疊。
        const mergeGateSpacing = ITEM_LENGTH;
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
        const isMergeOutputTransfer = (transfer) => {
            const lineId = transfer?.lineId || null;
            if (!lineId || !Array.isArray(state.logisticsMergeNodes)) return false;
            return state.logisticsMergeNodes.some(node => node?.outputGroupId === lineId);
        };
        const getMergeAdmissionWinner = (node) => {
            if (!node || !Array.isArray(node.inputGroupIds)) return null;
            if (this.system && typeof this.system.getLogisticsMergeAdmissionWinner === 'function') {
                return this.system.getLogisticsMergeAdmissionWinner(node, state, {
                    spacing: mergeGateSpacing,
                    readyDistanceFromEnd: mergeGateSpacing
                });
            }
            return null;
        };
        const getMergeInputMaxDistance = (transfer, totalLength) => {
            if (!this.system || typeof this.system.getLogisticsMergeNodeForInputTransfer !== 'function') {
                return totalLength;
            }
            const node = this.system.getLogisticsMergeNodeForInputTransfer(transfer, state);
            if (!node || !node.outputGroupId) return totalLength;
            const mergePoint = node.point || { x: node.x, y: node.y };

            const winnerId = getMergeAdmissionWinner(node);
            const isWinner = !!(winnerId && transfer.id && transfer.id === winnerId);
            // [非勝者等待線] 決策算術已抽至 LogisticsMergeSpacing（與 LogisticsTransferSystem 共用同一份），
            // 杜絕兩 pass 各自一份而 drift。本 pass 刻意以「原始 progress」計算 other 距離（不含 stepDt 投影）。
            if (!isWinner) {
                return computeMergeInputMaxDistance(totalLength, mergeGateSpacing, false, node, []);
            }

            const distancesFromMerge = [];
            state.activeTransfers.forEach(other => {
                if (!other || other === transfer) return;
                if (other.lineId !== node.outputGroupId) return;
                if (!Array.isArray(other.routePoints) || other.routePoints.length < 2) return;
                const otherTotal = getPathTotalLength(other.routePoints, pathMetricsCache);
                if (otherTotal <= 0) return;
                const otherDistance = Math.max(0, Math.min(1, Number(other.progress) || 0)) * otherTotal;
                const mergeDistance = getPathDistanceToPoint(other.routePoints, mergePoint, pathMetricsCache);
                distancesFromMerge.push(otherDistance - mergeDistance);
            });
            return computeMergeInputMaxDistance(totalLength, mergeGateSpacing, true, node, distancesFromMerge);
        };
        const routeSignature = (transfer) => {
            const points = transfer.routePoints || [];
            if (!Array.isArray(points) || points.length < 2) return null;
            return routePointsSignature(points); // [效能] 以路徑參照記憶化
        };
        const routeSignatureLineIds = new Map();
        state.activeTransfers.forEach(transfer => {
            const signature = routeSignature(transfer);
            if (!signature) return;
            if (!routeSignatureLineIds.has(signature)) routeSignatureLineIds.set(signature, new Set());
            routeSignatureLineIds.get(signature).add(transfer.lineId || "");
        });
        const pathKey = (transfer) => {
            const signature = routeSignature(transfer);
            if (signature && (routeSignatureLineIds.get(signature)?.size || 0) > 1) {
                return `route:${signature}`;
            }
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
            const queueSpacing = transfers.some(isMergeOutputTransfer) ? mergeGateSpacing : ITEM_LENGTH;
            const queueReleaseThreshold = queueSpacing * 1.05;
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
                    ? prevQueuedDistance - queueSpacing
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
                    // [拉鏈式合流] 主線穿越車在輪到支線時於合流點前一格讓行
                    if (isMergeOutputTransfer(transfer) &&
                        this.system && typeof this.system.getLogisticsMergeThroughYieldLimit === 'function') {
                        const yieldLimit = this.system.getLogisticsMergeThroughYieldLimit(transfer, state, mergeGateSpacing);
                        if (Number.isFinite(yieldLimit)) {
                            maxAllowed = Math.min(maxAllowed, yieldLimit);
                        }
                    }
                }

                let queuedDistance = Math.max(0, Math.min(desired, maxAllowed));
                if (Number.isFinite(prevQueuedDistance)) {
                    const distToFront = prevQueuedDistance - desired;
                    if (distToFront < queueSpacing) {
                        queuedDistance = Math.max(0, prevQueuedDistance - queueSpacing);
                    } else if (transfer.queueBlocked === true && distToFront < queueReleaseThreshold) {
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
                let nextDistance = stopBeforeSuppressedEndpoint && currentDistance > breakpointLimit
                    ? breakpointLimit
                    : queuedDistance;
                // [只停不退] 物品只能停止或前進；以「當前實際位置」為下限，
                // 嚴禁任何排隊/合流規則把已前進的物品往回推（兩套上限實作的微小分歧不得轉化為倒退）。
                if (!(stopBeforeSuppressedEndpoint && currentDistance > breakpointLimit)) {
                    nextDistance = Math.max(nextDistance, Math.min(currentDistance, totalLength));
                }
                logisticsTransportArrayState.setTransferDistance(transfer, nextDistance, totalLength, TS);
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
