import { routePointsSignature, routeAlongDistanceToPoint } from './LogisticsRouteCache.js';
import { computeMergeInputMaxDistance } from './LogisticsMergeSpacing.js';

const _manhattanSegmentsCache = new WeakMap();
function getManhattanSegments(pts) {
    if (!Array.isArray(pts)) return [];
    let cached = _manhattanSegmentsCache.get(pts);
    if (cached) return cached;
    const segments = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.abs(dx) + Math.abs(dy);
        segments.push({ dx, dy, len });
    }
    cached = segments;
    _manhattanSegmentsCache.set(pts, cached);
    return cached;
}

// [Web Worker] 物流「運動學」核心:固定子步長的位移 + 合流閘門 + 堆積回壓。
// 這段是整個遊戲時序最敏感的部分,主執行緒與 worker 共用同一份(避免分歧)。
//
// ctx = {
//   simSystem,          // 合流/佇列查詢介面(主執行緒=conveyorSystem;worker=facade)
//   engine,             // { TILE_SIZE, getEntityConfig, addLog? }
//   transportArrayState // LogisticsTransportArrayState 實例
// }
//
// 純運動學:只變更 transfer 的 index/offset/progress/maxAllowedProgress/queueBlocked,
// 以及合流節點排程狀態。派送(存入建築/扣資源/UI)不在此處——抵達終點的 transfer 會被
// 從 activeTransfers 移除並收進回傳的 arrivals,由呼叫端(主執行緒)實際入庫。
export function runLogisticsKinematics(ctx, state, deltaTime) {
    const { simSystem, engine, transportArrayState } = ctx;
    if (!state.activeTransfers) state.activeTransfers = [];
    const arrivals = [];
    let stepDt = deltaTime;

    const getTransferSpeed = (transfer) => {
        const groupId = transfer?.lineId;
        const line = groupId && Array.isArray(state.logisticsLines)
            ? state.logisticsLines.find(item => item && (item.groupId === groupId || item.id === groupId) && Number(item.efficiency) > 0)
            : null;
        const cfg = engine && typeof engine.getEntityConfig === 'function' ? engine.getEntityConfig(line?.lineType || 'transport_line', 1) : null;
        return Math.max(0.1, Number(line?.efficiency) || Number(transfer?.efficiency) || Number(cfg?.efficiency) || 4);
    };
    const getTransferRouteMetrics = (transfer) => {
        const points = transfer?.routePoints;
        if (!Array.isArray(points) || points.length < 2) {
            return { totalPixels: 0, totalTiles: 1 };
        }
        if (transfer._logicRouteMetricsPoints === points && transfer._logicRouteMetrics) {
            return transfer._logicRouteMetrics;
        }
        const key = routePointsSignature(points);
        if (transfer._logicRouteMetricsKey === key && transfer._logicRouteMetrics) {
            transfer._logicRouteMetricsPoints = points;
            return transfer._logicRouteMetrics;
        }
        let total = 0;
        for (let j = 0; j < points.length - 1; j++) {
            total += Math.abs(points[j + 1].x - points[j].x) + Math.abs(points[j + 1].y - points[j].y);
        }
        const metrics = { totalPixels: total, totalTiles: Math.max(1, total / 20) };
        transfer._logicRouteMetricsPoints = points;
        transfer._logicRouteMetricsKey = key;
        transfer._logicRouteMetrics = metrics;
        return metrics;
    };
    const getCellSize = () => (engine && engine.TILE_SIZE) || 20;
    const syncTransferArrayPosition = (transfer) => {
        const metrics = getTransferRouteMetrics(transfer);
        transportArrayState.syncTransferFromArrayState(transfer, metrics.totalPixels, getCellSize());
    };
    const setTransferDistance = (transfer, distance) => {
        const metrics = getTransferRouteMetrics(transfer);
        transportArrayState.setTransferDistance(transfer, distance, metrics.totalPixels, getCellSize());
    };
    const getTransferRouteSignature = (transfer) => {
        const points = transfer?.routePoints || [];
        if (!Array.isArray(points) || points.length < 2) return null;
        return routePointsSignature(points);
    };
    const routeSignatureLineIds = new Map();
    (state.activeTransfers || []).forEach(transfer => {
        const signature = getTransferRouteSignature(transfer);
        if (!signature) return;
        if (!routeSignatureLineIds.has(signature)) routeSignatureLineIds.set(signature, new Set());
        routeSignatureLineIds.get(signature).add(transfer.lineId || "");
    });
    const getTransferPathKey = (transfer) => {
        const signature = getTransferRouteSignature(transfer);
        if (signature && (routeSignatureLineIds.get(signature)?.size || 0) > 1) {
            return `route:${signature}`;
        }
        if (transfer?.lineId) return `line:${transfer.lineId}`;
        const points = transfer?.routePoints || [];
        const first = points[0];
        const last = points[points.length - 1];
        return ["route", first ? `${Math.round(first.x)},${Math.round(first.y)}` : "start",
            last ? `${Math.round(last.x)},${Math.round(last.y)}` : "end"].join("|");
    };
    const getPathDistanceToPoint = routeAlongDistanceToPoint;
    const _mergeNodeCache = new Map();
    const getMergeNodeForTransfer = (transfer) => {
        if (!transfer) return null;
        if (_mergeNodeCache.has(transfer)) return _mergeNodeCache.get(transfer);
        const node = (simSystem && typeof simSystem.getLogisticsMergeNodeForInputTransfer === 'function')
            ? simSystem.getLogisticsMergeNodeForInputTransfer(transfer, state)
            : null;
        _mergeNodeCache.set(transfer, node);
        return node;
    };
    const _mergeOutputCache = new Map();
    const isMergeOutputTransferCached = (transfer) => {
        const lineId = transfer?.lineId || null;
        if (!lineId || !Array.isArray(state.logisticsMergeNodes)) return false;
        if (_mergeOutputCache.has(transfer)) return _mergeOutputCache.get(transfer);
        const result = state.logisticsMergeNodes.some(node => node?.outputGroupId === lineId);
        _mergeOutputCache.set(transfer, result);
        return result;
    };
    const getMergeAdmissionWinner = (node, spacing) => {
        if (!node || !Array.isArray(node.inputGroupIds)) return null;
        if (simSystem && typeof simSystem.getLogisticsMergeAdmissionWinner === 'function') {
            return simSystem.getLogisticsMergeAdmissionWinner(node, state, { spacing, readyDistanceFromEnd: spacing });
        }
        return null;
    };
    // [P2b 合流桶] 子步掃描用的 lineId 分桶；於閉包作用域宣告（getMergeInputMaxDistance 捕獲此 let），
    // 每子步在 transfersByPath 同一輪重建後即可查表，取代逐台掃描全部 activeTransfers 的 O(N²)。
    let transfersByLineId = new Map();
    const getMergeInputMaxDistance = (transfer, totalLength, spacing) => {
        if (!simSystem || typeof simSystem.getLogisticsMergeNodeForInputTransfer !== 'function') return totalLength;
        const node = getMergeNodeForTransfer(transfer);
        if (!node || !node.outputGroupId) return totalLength;
        const mergePoint = node.point || { x: node.x, y: node.y };
        const winnerId = getMergeAdmissionWinner(node, spacing);
        const isWinner = winnerId && transfer.id && transfer.id === winnerId;
        // [非勝者等待線] 決策算術已抽至 LogisticsMergeSpacing（與 LogisticsTransferQueues 共用同一份），
        // 杜絕兩 pass 各自一份而 drift。本 pass 刻意以「含 stepDt 投影」計算 other 距離。
        if (!isWinner) {
            return computeMergeInputMaxDistance(totalLength, spacing, false, node, []);
        }
        const distancesFromMerge = [];
        (transfersByLineId.get(node.outputGroupId) || []).forEach(other => {
            if (other === transfer) return;
            if (!Array.isArray(other.routePoints) || other.routePoints.length < 2) return;
            const otherTotal = getTransferRouteMetrics(other).totalPixels;
            if (otherTotal <= 0) return;
            const otherDistanceNow = transportArrayState.getTransferDistance(other, otherTotal, getCellSize());
            const otherMaxAllowed = other.maxAllowedProgress !== undefined ? other.maxAllowedProgress : 1.0;
            const otherMaxDistance = otherMaxAllowed * otherTotal;
            const otherQueueHeld = other.queueBlocked === true && otherDistanceNow >= otherMaxDistance - 0.0001;
            const projectedDistance = otherQueueHeld
                ? otherDistanceNow
                : Math.min(otherMaxDistance, otherDistanceNow + stepDt * getTransferSpeed(other) * getCellSize());
            const mergeDistance = getPathDistanceToPoint(other.routePoints, mergePoint);
            distancesFromMerge.push(projectedDistance - mergeDistance);
        });
        return computeMergeInputMaxDistance(totalLength, spacing, true, node, distancesFromMerge);
    };

    const LOGISTICS_SUB_DT = 0.0167;
    const MAX_LOGISTICS_SUBSTEPS = 4;
    const subSteps = Math.min(MAX_LOGISTICS_SUBSTEPS, Math.max(1, Math.ceil(deltaTime / LOGISTICS_SUB_DT - 1e-6)));
    stepDt = deltaTime / subSteps;

    // [效能] 陣列位置同步在 tick 開始前執行一次即可，子步間無外部變動不需重複同步。
    state.activeTransfers.forEach(syncTransferArrayPosition);

    for (let _subStep = 0; _subStep < subSteps; _subStep++) {
        if (simSystem && typeof simSystem.beginMergeWinnerCache === 'function') simSystem.beginMergeWinnerCache();
        if (simSystem && typeof simSystem.applyBlockedTransferQueues === 'function') simSystem.applyBlockedTransferQueues(state);

        const transfersByPath = new Map();
        // [P2b 合流桶] 每子步重建 lineId 分桶（併入此輪建表）；lineId 僅在子步末端
        // applyLogisticsMergeNodes 內變更，掃描 pass 期間桶恆穩定，與原逐台掃描等價。
        transfersByLineId = new Map();
        state.activeTransfers.forEach(t => {
            if (!t) return;
            const key = getTransferPathKey(t);
            if (!transfersByPath.has(key)) transfersByPath.set(key, []);
            transfersByPath.get(key).push(t);
            const lineId = t.lineId;
            if (lineId) {
                let bucket = transfersByLineId.get(lineId);
                if (!bucket) { bucket = []; transfersByLineId.set(lineId, bucket); }
                bucket.push(t);
            }
        });

        const cellSize = getCellSize();
        const isMergeInputTransfer = (transfer) => !!getMergeNodeForTransfer(transfer);
        const isMergeOutputTransfer = (transfer) => isMergeOutputTransferCached(transfer);

        // [效能] 預先計算 sorted 權重，避免在 sort 比較子中重複走訪 runs 尋找 merge input
        const pathEntries = Array.from(transfersByPath.entries()).map(([pathKey, groupTransfers]) => {
            const hasMergeInput = groupTransfers.some(isMergeInputTransfer);
            return { pathKey, groupTransfers, hasMergeInput };
        });
        pathEntries.sort((a, b) => Number(a.hasMergeInput) - Number(b.hasMergeInput));

        pathEntries.forEach(({ pathKey, groupTransfers }) => {
            const canonical = groupTransfers.reduce((best, transfer) => {
                const len = getTransferRouteMetrics(transfer).totalPixels;
                return len > best.length ? { points: transfer.routePoints, length: len } : best;
            }, { points: null, length: 0 });

            // [效能] 判斷組內是否存在「與 canonical 不同的路徑」。原本逐 transfer 逐座標點 hypot 比對,
            // 是 O(transfers × routePoints) 且「每子步」重算——在 worker 模式下每個 transfer 的 routePoints
            // 是各自反序列化的獨立陣列(參照不同),引用相等快取永遠 miss → 整組長蛇線每子步全量座標比對,
            // 物品多 + 路徑點多時成為主要熱點(profiling 證實)。改用「以參照記憶化的簽章字串」比對:
            // 簽章只在每個陣列首次出現時計算一次(WeakMap 快取),之後僅字串比較,等價但攤銷後近 O(transfers)。
            let useCanonical = false;
            if (groupTransfers.length > 1 && canonical.length > 0 && canonical.points) {
                const canonicalSig = routePointsSignature(canonical.points);
                useCanonical = groupTransfers.some(transfer =>
                    transfer.routePoints !== canonical.points &&
                    routePointsSignature(transfer.routePoints) !== canonicalSig
                );
            }

            // [效能] 優化走訪查找：使用快取段結構
            const getPointOnPathByDistance = (pts, distance) => {
                if (!Array.isArray(pts) || pts.length < 2) return null;
                const segments = getManhattanSegments(pts);
                let remaining = Math.max(0, Number(distance) || 0);
                for (let i = 0; i < segments.length; i++) {
                    const seg = segments[i];
                    const a = pts[i];
                    if (!a) continue;
                    if (remaining <= seg.len || i === segments.length - 1) {
                        const t = seg.len > 0 ? Math.max(0, Math.min(1, remaining / seg.len)) : 0;
                        return { x: a.x + seg.dx * t, y: a.y + seg.dy * t };
                    }
                    remaining -= seg.len;
                }
                const last = pts[pts.length - 1];
                return last ? { x: last.x, y: last.y } : null;
            };

            const distanceCache = new Map();
            const getDistance = (transfer) => {
                if (distanceCache.has(transfer)) return distanceCache.get(transfer);
                const total = getTransferRouteMetrics(transfer).totalPixels;
                const distance = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * total;
                // [效能] 若路徑與 canonical 完全相同，投影距離即為當前 local 距離，不須重算幾何
                const resolved = (useCanonical && transfer.routePoints !== canonical.points)
                    ? getPathDistanceToPoint(canonical.points, getPointOnPathByDistance(transfer.routePoints, distance))
                    : distance;
                distanceCache.set(transfer, resolved);
                return resolved;
            };

            groupTransfers.sort((a, b) => {
                const da = getDistance(a);
                const db = getDistance(b);
                if (Math.abs(db - da) > 0.0001) return db - da;
                return String(a.id).localeCompare(String(b.id));
            });

            let prevMaxCanonicalDist = Infinity;
            let pathDistPn = undefined;
            for (let j = 0; j < groupTransfers.length; j++) {
                const t = groupTransfers[j];
                const metrics = getTransferRouteMetrics(t);
                const totalLength = metrics.totalPixels;
                if (totalLength <= 0) { t.maxAllowedProgress = 1.0; continue; }

                const isMergeInput = isMergeInputTransfer(t);
                const isBreakpoint = !t.targetId && !isMergeInput;
                if (isMergeInput) { delete t.queueBlocked; delete t.blockedOnBrokenLine; }

                let dist_pn = totalLength;
                if (isBreakpoint) {
                    if (pathDistPn !== undefined) {
                        dist_pn = pathDistPn;
                    } else {
                        const bpts = t.routePoints;
                        if (Array.isArray(bpts) && bpts.length >= 2) {
                            const lastPt = bpts[bpts.length - 1];
                            const tLineId = t.lineId;
                            const isGapEndpoint = (state.logisticsLines || []).some(seg => {
                                if (!seg) return false;
                                const segGroupId = seg.groupId || seg.id;
                                if (segGroupId === tLineId) return false;
                                const segPts = Array.isArray(seg.routePoints) ? seg.routePoints : [];
                                if (segPts.length < 1) return false;
                                const segStart = segPts[0];
                                return segStart && Math.hypot(segStart.x - lastPt.x, segStart.y - lastPt.y) <= cellSize * 1.5;
                            });
                            pathDistPn = isGapEndpoint ? totalLength - cellSize : totalLength;
                        } else {
                            pathDistPn = totalLength;
                        }
                        dist_pn = pathDistPn;
                    }
                }

                const startDistOnCanonical = useCanonical
                    ? getPathDistanceToPoint(canonical.points, t.routePoints[0])
                    : 0;

                let spacing = cellSize;
                const desired = (t.progress || 0) * totalLength;

                let maxDist = totalLength;
                if (j === 0) {
                    if (isBreakpoint) maxDist = dist_pn;
                    else if (isMergeInput) maxDist = Math.min(totalLength, getMergeInputMaxDistance(t, totalLength, cellSize));
                    else maxDist = totalLength;
                } else {
                    const frontItem = groupTransfers[j - 1];
                    const frontCanonicalDist = getDistance(frontItem);
                    // [滿載防稀疏] 間距限制須以「前車本子步推進後的位置」為準,而非推進前。否則後車永遠落後前車
                    // 一個子步位移(≈1.3px),滿載線會鬆弛成 cell+一子步 的間距(實測 20→21.3,約 6.7% 變疏),
                    // 沿線累積成「內圈密外圈疏」。投影量=前車本子步實際位移,並以前車自身上限 prevMax 收斂
                    // (前車被堵→prevMax=其當前位置→不投影,後車照常停在 cell 間距,不會重疊)。
                    const frontStep = stepDt * getTransferSpeed(frontItem) * cellSize;
                    const frontProjectedCanonical = Math.min(frontCanonicalDist + frontStep, prevMaxCanonicalDist);
                    const physicalLimitCanonical = Math.max(startDistOnCanonical, frontProjectedCanonical - spacing);
                    let limitCanonical = startDistOnCanonical + totalLength;
                    if (desired <= dist_pn) {
                        const targetLimitCanonical = startDistOnCanonical + dist_pn;
                        if (frontCanonicalDist > targetLimitCanonical || prevMaxCanonicalDist > targetLimitCanonical) {
                            limitCanonical = Math.min(targetLimitCanonical, physicalLimitCanonical);
                        } else {
                            limitCanonical = physicalLimitCanonical;
                        }
                    } else {
                        limitCanonical = physicalLimitCanonical;
                    }
                    maxDist = Math.max(0, limitCanonical - startDistOnCanonical);
                }

                if (isMergeOutputTransfer(t) && simSystem &&
                    typeof simSystem.getLogisticsMergeThroughYieldLimit === 'function') {
                    const yieldLimit = simSystem.getLogisticsMergeThroughYieldLimit(t, state, cellSize);
                    if (Number.isFinite(yieldLimit)) maxDist = Math.min(maxDist, yieldLimit);
                }

                prevMaxCanonicalDist = startDistOnCanonical + maxDist;
                t.maxAllowedProgress = maxDist / totalLength;
                if (isMergeInput) t.queueBlocked = maxDist < totalLength - 0.1 && desired >= maxDist - 0.1;
            }
        });

        if (simSystem && typeof simSystem.endMergeWinnerCache === 'function') simSystem.endMergeWinnerCache();

        for (let i = state.activeTransfers.length - 1; i >= 0; i--) {
            const t = state.activeTransfers[i];
            const maxAllowed = t.maxAllowedProgress !== undefined ? t.maxAllowedProgress : 1.0;
            const queueHeld = t.queueBlocked === true && t.progress >= maxAllowed - 0.0001;

            if (!queueHeld && t.progress < maxAllowed) {
                const metrics = getTransferRouteMetrics(t);
                const distanceDelta = stepDt * getTransferSpeed(t) * getCellSize();
                transportArrayState.advanceTransfer(t, distanceDelta, metrics.totalPixels, maxAllowed, getCellSize());
            } else if (t.progress > maxAllowed) {
                t.queueBlocked = true;
            }

            if (t._mergeVisualTurn && Array.isArray(t.routePoints) && t.routePoints.length >= 2) {
                const turnPoint = { x: Number(t._mergeVisualTurn.x), y: Number(t._mergeVisualTurn.y) };
                if (Number.isFinite(turnPoint.x) && Number.isFinite(turnPoint.y)) {
                    const metrics = getTransferRouteMetrics(t);
                    const currentDistance = Math.max(0, Math.min(1, Number(t.progress) || 0)) * metrics.totalPixels;
                    const mergeDistance = getPathDistanceToPoint(t.routePoints, turnPoint);
                    if (currentDistance > mergeDistance + cellSize + 0.1) delete t._mergeVisualTurn;
                } else {
                    delete t._mergeVisualTurn;
                }
            }

            const rp = t.routePoints;
            const endPt = Array.isArray(rp) && rp.length >= 2 ? rp[rp.length - 1] : null;
            const tp = t.targetPoint;
            const targetPort = t.targetPort;
            const reachedTargetPoint = !tp || (endPt && (Math.abs(endPt.x - tp.x) + Math.abs(endPt.y - tp.y)) <= getCellSize() * 1.5);
            const reachedTargetPort = !!targetPort && endPt &&
                (Math.abs(endPt.x - targetPort.x) + Math.abs(endPt.y - targetPort.y)) <= getCellSize() * 1.5;
            const reachedTarget = reachedTargetPoint || reachedTargetPort;
            const arrivalMetrics = getTransferRouteMetrics(t);
            const currentDistance = arrivalMetrics.totalPixels > 0
                ? transportArrayState.getTransferDistance(t, arrivalMetrics.totalPixels, getCellSize())
                : 0;
            const terminalGateArrival = t.targetId && reachedTarget && arrivalMetrics.totalPixels > 0 &&
                currentDistance >= arrivalMetrics.totalPixels - getCellSize() - 0.1;

            if (t.progress >= 1 || terminalGateArrival) {
                // [斷線防護] 僅在「路線終點確實到達目標端口(targetPoint/targetPort)」時才入庫。線被切斷後 rerouter
                // 會把路線縮短到斷點,終點偏離原目標;此時不可誤判抵達,改為停在斷點等待重連/重路由。
                // [終點閘門] 滿載時前車會被 spacing 壓在終點前一格(maxAllowed=total-cell),此時仍應視為抵達,
                // 否則 worker 內會留下前車並永久限制後車。
                if (t.targetId && reachedTarget) {
                    arrivals.push({ id: t.id, targetId: t.targetId, itemType: t.itemType, transfer: t });
                    state.activeTransfers.splice(i, 1);
                } else {
                    setTransferDistance(t, arrivalMetrics.totalPixels);
                }
            }
        }

        if (simSystem && typeof simSystem.applyLogisticsMergeNodes === 'function') simSystem.applyLogisticsMergeNodes(state);
    }

    return { arrivals };
}
