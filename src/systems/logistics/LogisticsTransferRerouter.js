import { annotateRoutePoints } from './LogisticsGeometry.js';

export class LogisticsTransferRerouter {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    updateOnLogisticsChange(state, affectedGroupIds = null) {
        if (!state || !Array.isArray(state.activeTransfers) || state.activeTransfers.length === 0) return;
        const system = this.system;
        const GameEngine = this.gameEngine;
        const TS = GameEngine.TILE_SIZE || 20;
        const affectedSet = affectedGroupIds
            ? new Set([...affectedGroupIds].filter(Boolean))
            : null;
        const allLines = state.logisticsLines || [];
        const relevantLines = affectedSet && affectedSet.size > 0
            ? allLines.filter(line => {
                const groupId = line?.groupId || line?.id;
                return groupId && affectedSet.has(groupId);
            })
            : allLines;
        const entityById = new Map();
        (state.mapEntities || []).forEach(ent => {
            if (!ent) return;
            entityById.set(window.UIManager.getEntityId(ent), ent);
        });
        const affectedSourceIds = new Set();
        const affectedTargetIds = new Set();
        relevantLines.forEach(line => {
            if (line?.sourceId) affectedSourceIds.add(line.sourceId);
            if (line?.targetId) affectedTargetIds.add(line.targetId);
        });
        const lineBuckets = new Map();
        const addLineBucket = (key, line) => {
            if (!key || !line) return;
            if (!lineBuckets.has(key)) lineBuckets.set(key, []);
            lineBuckets.get(key).push(line);
        };
        relevantLines.forEach(line => {
            const route = Array.isArray(line?.routePoints) && line.routePoints.length >= 2
                ? line.routePoints
                : [{ x: line?.x, y: line?.y }, { x: line?.x, y: line?.y }];
            for (let r = 0; r < route.length - 1; r++) {
                const a = route[r];
                const b = route[r + 1];
                if (!a || !b) continue;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 0.001) continue;
                const steps = Math.max(1, Math.round(dist / TS));
                const stepSize = dist / steps;
                const dirX = dx / dist;
                const dirY = dy / dist;
                for (let step = 0; step <= steps; step++) {
                    const px = step === steps ? b.x : a.x + dirX * stepSize * step;
                    const py = step === steps ? b.y : a.y + dirY * stepSize * step;
                    const snapped = system.snapPointToGridCenter({ x: px, y: py });
                    addLineBucket(`${snapped.x},${snapped.y}`, line);
                }
            }
        });
        const getCandidateLines = (pos) => {
            if (!pos || lineBuckets.size === 0) return relevantLines;
            const snapped = system.snapPointToGridCenter(pos);
            const candidates = new Set();
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const key = `${snapped.x + dx * TS},${snapped.y + dy * TS}`;
                    (lineBuckets.get(key) || []).forEach(line => candidates.add(line));
                }
            }
            return candidates.size > 0 ? [...candidates] : relevantLines;
        };
        const shouldUpdateTransfer = (transfer) => {
            if (!affectedSet || affectedSet.size === 0) return true;
            const lineId = transfer?.lineId || null;
            if (lineId && affectedSet.has(lineId)) return true;
            const sourceId = transfer?.sourceId || null;
            const targetId = transfer?.targetId || null;
            return (sourceId && affectedSourceIds.has(sourceId)) || (targetId && affectedTargetIds.has(targetId));
        };

        const findShortestPathBetweenPoints = (segments, startPt, endPt) => {
            if (!Array.isArray(segments) || segments.length === 0) return [];
            const nodes = [];
            segments.forEach(seg => {
                if (Array.isArray(seg.routePoints) && seg.routePoints.length >= 2) {
                    for (let i = 0; i < seg.routePoints.length - 1; i++) {
                        const p1 = seg.routePoints[i];
                        const p2 = seg.routePoints[i + 1];
                        let n1 = nodes.find(n => Math.hypot(n.x - p1.x, n.y - p1.y) < 2);
                        if (!n1) { n1 = { x: p1.x, y: p1.y, edges: [] }; nodes.push(n1); }
                        let n2 = nodes.find(n => Math.hypot(n.x - p2.x, n.y - p2.y) < 2);
                        if (!n2) { n2 = { x: p2.x, y: p2.y, edges: [] }; nodes.push(n2); }

                        if (!n1.edges.includes(n2)) n1.edges.push(n2);
                        if (!n2.edges.includes(n1)) n2.edges.push(n1);
                    }
                }
            });

            let startNode = null; let startDist = Infinity;
            let endNode = null; let endDist = Infinity;

            nodes.forEach(n => {
                const ds = Math.hypot(n.x - startPt.x, n.y - startPt.y);
                if (ds < startDist) { startDist = ds; startNode = n; }
                const dt = Math.hypot(n.x - endPt.x, n.y - endPt.y);
                if (dt < endDist) { endDist = dt; endNode = n; }
            });

            if (startNode && endNode) {
                const queue = [[startNode]];
                const visited = new Set([startNode]);
                while (queue.length > 0) {
                    const path = queue.shift();
                    const curr = path[path.length - 1];

                    if (curr === endNode) {
                        return path.map(n => ({ x: n.x, y: n.y }));
                    }

                    curr.edges.forEach(neighbor => {
                        if (!visited.has(neighbor)) {
                            visited.add(neighbor);
                            queue.push([...path, neighbor]);
                        }
                    });
                }
            }
            return [];
        };

        const getPointOnPath = (points, progress) => {
            if (!Array.isArray(points) || points.length === 0) return { x: 0, y: 0 };
            if (points.length === 1) return { x: points[0].x, y: points[0].y };
            const clamped = Math.max(0, Math.min(1, progress));
            let total = 0;
            const lengths = [];
            for (let i = 0; i < points.length - 1; i++) {
                const d = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
                lengths.push(d);
                total += d;
            }
            if (total <= 0) return { x: points[0].x, y: points[0].y };
            let targetDist = clamped * total;
            for (let i = 0; i < lengths.length; i++) {
                const len = lengths[i];
                if (targetDist <= len || i === lengths.length - 1) {
                    const ratio = len === 0 ? 0 : (targetDist / len);
                    const p1 = points[i];
                    const p2 = points[i + 1];

                    return {
                        x: p1.x + (p2.x - p1.x) * ratio,
                        y: p1.y + (p2.y - p1.y) * ratio
                    };
                }
                targetDist -= len;
            }
            return { x: points[points.length - 1].x, y: points[points.length - 1].y };
        };

        const getPathDistanceToProj = (points, pos) => {
            if (!Array.isArray(points) || points.length < 2) return 0;
            let bestDist = Infinity;
            let bestPathDist = 0;
            let currentPathDist = 0;

            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                if (segLen === 0) continue;

                const u = ((pos.x - p1.x) * (p2.x - p1.x) + (pos.y - p1.y) * (p2.y - p1.y)) / (segLen * segLen);
                const t = Math.max(0, Math.min(1, u));
                const proj = {
                    x: p1.x + t * (p2.x - p1.x),
                    y: p1.y + t * (p2.y - p1.y)
                };
                const distToProj = Math.hypot(pos.x - proj.x, pos.y - proj.y);
                if (distToProj < bestDist) {
                    bestDist = distToProj;
                    bestPathDist = currentPathDist + t * segLen;
                }
                currentPathDist += segLen;
            }
            return bestPathDist;
        };

        const getPathTotalLength = (points) => {
            if (!Array.isArray(points) || points.length < 2) return 0;
            let total = 0;
            for (let i = 0; i < points.length - 1; i++) {
                total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
            }
            return total;
        };
        const getDistanceToPath = (points, pos) => {
            if (!Array.isArray(points) || points.length < 2 || !pos) return Infinity;
            let bestDist = Infinity;
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                const segLenSq = Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2);
                if (segLenSq <= 0) continue;
                const u = ((pos.x - p1.x) * (p2.x - p1.x) + (pos.y - p1.y) * (p2.y - p1.y)) / segLenSq;
                const t = Math.max(0, Math.min(1, u));
                const proj = {
                    x: p1.x + t * (p2.x - p1.x),
                    y: p1.y + t * (p2.y - p1.y)
                };
                bestDist = Math.min(bestDist, Math.hypot(pos.x - proj.x, pos.y - proj.y));
            }
            return bestDist;
        };
        const groupSegmentsCache = new Map();
        const getGroupSegments = (groupId) => {
            if (!groupSegmentsCache.has(groupId)) {
                groupSegmentsCache.set(
                    groupId,
                    allLines.filter(l => l && (l.groupId === groupId || l.id === groupId))
                );
            }
            return groupSegmentsCache.get(groupId);
        };
        const groupRouteCache = new Map();

        for (let i = state.activeTransfers.length - 1; i >= 0; i--) {
            const t = state.activeTransfers[i];
            if (!shouldUpdateTransfer(t)) continue;
            if (!Array.isArray(t.routePoints) || t.routePoints.length < 2) continue;

            const currentPos = getPointOnPath(t.routePoints, t.progress);

            let currentSeg = null;
            let bestSegDist = Infinity;
            getCandidateLines(currentPos).forEach(line => {
                if (!line) return;
                const route = Array.isArray(line.routePoints) && line.routePoints.length >= 2
                    ? line.routePoints
                    : [{ x: line.x, y: line.y }, { x: line.x, y: line.y }];
                const d = getDistanceToPath(route, currentPos);
                if (d < bestSegDist && d <= TS * 0.75) {
                    bestSegDist = d;
                    currentSeg = line;
                }
            });

            if (!currentSeg) {
                state.activeTransfers.splice(i, 1);
                continue;
            }

            const newGroupId = currentSeg.groupId || currentSeg.id;
            t.lineId = newGroupId;

            const groupSegs = getGroupSegments(newGroupId);
            let pathPoints = null;

            let routeCache = groupRouteCache.get(newGroupId);
            if (!routeCache) {
                routeCache = {
                    ordered: system.orderLogisticsSegmentsByDirection(groupSegs),
                    shortestPaths: new Map()
                };
                groupRouteCache.set(newGroupId, routeCache);
            }
            const ordered = routeCache.ordered;
            if (ordered.length > 0) {
                const firstSeg = ordered[0];
                const lastSeg = ordered[ordered.length - 1];
                if (firstSeg && lastSeg && Array.isArray(firstSeg.routePoints) && Array.isArray(lastSeg.routePoints)) {
                    const startPt = firstSeg.routePoints[0];
                    const endPt = lastSeg.routePoints[lastSeg.routePoints.length - 1];
                    if (startPt && endPt) {
                        const endpointKey = `${Math.round(startPt.x)},${Math.round(startPt.y)}>${Math.round(endPt.x)},${Math.round(endPt.y)}`;
                        let shortest = routeCache.shortestPaths.get(endpointKey);
                        if (!shortest) {
                            shortest = findShortestPathBetweenPoints(groupSegs, startPt, endPt);
                            routeCache.shortestPaths.set(endpointKey, shortest);
                        }
                        shortest = Array.isArray(shortest) ? shortest.map(point => ({ ...point })) : shortest;
                        if (shortest && shortest.length >= 2) {
                            const sourceEnt = currentSeg.sourceId
                                ? entityById.get(currentSeg.sourceId)
                                : null;
                            const targetEnt = currentSeg.targetId
                                ? entityById.get(currentSeg.targetId)
                                : null;

                            const first = shortest[0];
                            const last = shortest[shortest.length - 1];

                            let sourceAnchor = null;
                            if (sourceEnt) {
                                const sourcePort = currentSeg.sourcePort || t.sourcePort
                                    ? window.UIManager.resolveCurrentPortSlot(sourceEnt, currentSeg.sourcePort || t.sourcePort, first?.x, first?.y)
                                    : window.UIManager.getNearestPortSlot(sourceEnt, first?.x ?? (targetEnt ? targetEnt.x : first?.x), first?.y ?? (targetEnt ? targetEnt.y : first?.y));
                                sourceAnchor = sourcePort ? { x: sourcePort.x, y: sourcePort.y } : { x: sourceEnt.x, y: sourceEnt.y };
                            }

                            let targetAnchor = null;
                            if (targetEnt) {
                                const targetPort = currentSeg.targetPort || t.targetPort
                                    ? window.UIManager.resolveCurrentPortSlot(targetEnt, currentSeg.targetPort || t.targetPort, last?.x, last?.y)
                                    : window.UIManager.getNearestPortSlot(targetEnt, last?.x ?? (sourceEnt ? sourceEnt.x : last?.x), last?.y ?? (sourceEnt ? sourceEnt.y : last?.y));
                                targetAnchor = targetPort ? { x: targetPort.x, y: targetPort.y } : { x: targetEnt.x, y: targetEnt.y };
                            }
                            const isOpenEndedLine = !targetAnchor && !currentSeg.targetId;

                            if (sourceAnchor) {
                                const distFirstToSource = Math.hypot(shortest[0].x - sourceAnchor.x, shortest[0].y - sourceAnchor.y);
                                const distLastToSource = Math.hypot(shortest[shortest.length - 1].x - sourceAnchor.x, shortest[shortest.length - 1].y - sourceAnchor.y);
                                if (distLastToSource < distFirstToSource) {
                                    shortest.reverse();
                                }
                            } else if (targetAnchor) {
                                const distFirstToTarget = Math.hypot(shortest[0].x - targetAnchor.x, shortest[0].y - targetAnchor.y);
                                const distLastToTarget = Math.hypot(shortest[shortest.length - 1].x - targetAnchor.x, shortest[shortest.length - 1].y - targetAnchor.y);
                                if (distFirstToTarget < distLastToTarget) {
                                    shortest.reverse();
                                }
                            } else {
                                if (Array.isArray(t.routePoints) && t.routePoints.length >= 2) {
                                    const distFirstToOldStart = Math.hypot(shortest[0].x - t.routePoints[0].x, shortest[0].y - t.routePoints[0].y);
                                    const distLastToOldStart = Math.hypot(shortest[shortest.length - 1].x - t.routePoints[0].x, shortest[shortest.length - 1].y - t.routePoints[0].y);
                                    if (distLastToOldStart < distFirstToOldStart) {
                                        shortest.reverse();
                                    }
                                }
                            }

                            const transferPoints = [];
                            const pushPoint = (point) => {
                                if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
                                const lastPoint = transferPoints[transferPoints.length - 1];
                                if (!lastPoint || Math.hypot(lastPoint.x - point.x, lastPoint.y - point.y) > 1) {
                                    transferPoints.push({ x: point.x, y: point.y });
                                }
                            };

                            if (sourceAnchor && !isOpenEndedLine) pushPoint(sourceAnchor);
                            shortest.forEach(pushPoint);
                            if (targetAnchor) pushPoint(targetAnchor);

                            if (transferPoints.length >= 2) {
                                pathPoints = transferPoints;
                                annotateRoutePoints(pathPoints);
                            }
                        }
                    }
                }
            }

            if (!pathPoints) {
                pathPoints = [];
                ordered.forEach(seg => {
                    if (Array.isArray(seg.routePoints)) {
                        seg.routePoints.forEach(p => {
                            if (pathPoints.length === 0 ||
                                Math.hypot(pathPoints[pathPoints.length - 1].x - p.x, pathPoints[pathPoints.length - 1].y - p.y) > 0.1) {
                                pathPoints.push({ x: p.x, y: p.y });
                            }
                        });
                    }
                });
                if (pathPoints.length >= 3) {
                    const getCardinalDir = (from, to) => {
                        if (!from || !to) return null;
                        const dx = to.x - from.x;
                        const dy = to.y - from.y;
                        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
                        if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx) || 1, y: 0 };
                        return { x: 0, y: Math.sign(dy) || 1 };
                    };
                    for (let idx = 1; idx < pathPoints.length - 1; idx++) {
                        const prev = pathPoints[idx - 1];
                        const curr = pathPoints[idx];
                        const next = pathPoints[idx + 1];
                        const inDir = getCardinalDir(prev, curr);
                        const outDir = getCardinalDir(curr, next);
                        if (inDir && outDir && (inDir.x !== outDir.x || inDir.y !== outDir.y)) {
                            curr.isCorner = true;
                        }
                    }
                }
            } else {
                const renderer = window.LogisticsRenderer || (typeof LogisticsRenderer !== 'undefined' ? LogisticsRenderer : null);
                if (renderer && typeof renderer.annotateRoutePoints === 'function') {
                    renderer.annotateRoutePoints(pathPoints);
                }
            }

            if (pathPoints.length < 2) {
                state.activeTransfers.splice(i, 1);
                continue;
            }

            const projDist = getPathDistanceToProj(pathPoints, currentPos);
            const totalLen = getPathTotalLength(pathPoints);
            t.progress = totalLen > 0 ? Math.max(0, Math.min(1, projDist / totalLen)) : 1;
            t.routePoints = pathPoints;
            t.sourceId = currentSeg.sourceId || null;
            t.targetId = currentSeg.targetId || null;
            t.efficiency = Number(currentSeg.efficiency) || 0;
        }

        system.applyLogisticsMergeNodes(state);
        system.applyBlockedTransferQueues(state);
    }
}
