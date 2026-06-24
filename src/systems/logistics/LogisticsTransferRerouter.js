import { annotateRoutePoints } from './LogisticsGeometry.js';
import {
    getDistanceToPath,
    getPathDistanceToPoint,
    getPathTotalLength,
    getPointOnPathProgress,
    pushUniquePoint
} from './LogisticsPathMetrics.js';
import {
    buildSegmentNodeGraph,
    findNearestNode,
    findShortestNodePath,
    getReachableNodes
} from './LogisticsRouteGraph.js';

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
        const getEntityId = (ent) => window.UIManager?.getEntityId?.(ent) || ent?.id || null;
        const recoverTransferToSource = (transfer) => {
            if (!transfer || !this.system?.undoStore?.returnTransferToSource) return false;
            return this.system.undoStore.returnTransferToSource(
                transfer,
                Array.isArray(state.mapEntities) ? state.mapEntities : [],
                getEntityId
            );
        };
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
            
            // 如果此物品所屬的物流線在當前所有物流線中已經不存在，說明該物流線已被刪除，此物品也需要被更新（以利後續清除）
            const lineExists = allLines.some(line => line && (line.groupId === lineId || line.id === lineId));
            if (!lineExists) return true;

            return false;
        };

        const pathMetricsCache = new Map();
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

            const currentPos = getPointOnPathProgress(t.routePoints, t.progress, pathMetricsCache);

            let currentSeg = null;
            let bestSegDist = Infinity;
            getCandidateLines(currentPos).forEach(line => {
                if (!line) return;
                const route = Array.isArray(line.routePoints) && line.routePoints.length >= 2
                    ? line.routePoints
                    : [{ x: line.x, y: line.y }, { x: line.x, y: line.y }];
                const d = getDistanceToPath(route, currentPos, pathMetricsCache);
                if (d < bestSegDist && d <= TS * 0.75) {
                    bestSegDist = d;
                    currentSeg = line;
                }
            });

            if (!currentSeg) {
                recoverTransferToSource(t);
                state.activeTransfers.splice(i, 1);
                continue;
            }

            const newGroupId = currentSeg.groupId || currentSeg.id;
            t.lineId = newGroupId;

            const groupSegs = getGroupSegments(newGroupId);
            let pathPoints = null;

            let routeCache = groupRouteCache.get(newGroupId);
            if (!routeCache) {
                const ordered = system.orderLogisticsSegmentsByDirection(groupSegs);
                const graph = buildSegmentNodeGraph(groupSegs, { directed: true });

                routeCache = {
                    ordered,
                    nodes: graph.nodes,
                    sources: graph.sources,
                    sinks: graph.sinks,
                    shortestPaths: new Map()
                };
                groupRouteCache.set(newGroupId, routeCache);
            }
            const ordered = routeCache.ordered;
            if (ordered.length > 0) {
                const currNode = findNearestNode(routeCache.nodes, currentPos);

                let startPt = null;
                let endPt = null;

                if (currNode) {
                    const reachableSources = getReachableNodes(currNode, 'inEdges', routeCache.sources);
                    const reachableSinks = getReachableNodes(currNode, 'outEdges', routeCache.sinks);

                    if (reachableSources.length > 0) {
                        if (reachableSources.length === 1) {
                            startPt = reachableSources[0];
                        } else if (Array.isArray(t.routePoints) && t.routePoints.length > 0) {
                            const oldStart = t.routePoints[0];
                            let bestDist = Infinity;
                            reachableSources.forEach(s => {
                                const d = Math.hypot(s.x - oldStart.x, s.y - oldStart.y);
                                if (d < bestDist) {
                                    bestDist = d;
                                    startPt = s;
                                }
                            });
                        } else {
                            startPt = reachableSources[0];
                        }
                    }

                    if (reachableSinks.length > 0) {
                        if (reachableSinks.length === 1) {
                            endPt = reachableSinks[0];
                        } else if (Array.isArray(t.routePoints) && t.routePoints.length > 0) {
                            const oldEnd = t.routePoints[t.routePoints.length - 1];
                            let bestDist = Infinity;
                            reachableSinks.forEach(s => {
                                const d = Math.hypot(s.x - oldEnd.x, s.y - oldEnd.y);
                                if (d < bestDist) {
                                    bestDist = d;
                                    endPt = s;
                                }
                            });
                        } else {
                            endPt = reachableSinks[0];
                        }
                    }
                }

                if (!startPt && ordered[0] && Array.isArray(ordered[0].routePoints)) {
                    startPt = ordered[0].routePoints[0];
                }
                if (!endPt && ordered[ordered.length - 1] && Array.isArray(ordered[ordered.length - 1].routePoints)) {
                    const lastSeg = ordered[ordered.length - 1];
                    endPt = lastSeg.routePoints[lastSeg.routePoints.length - 1];
                }

                if (startPt && endPt) {
                    const endpointKey = `${Math.round(startPt.x)},${Math.round(startPt.y)}>${Math.round(endPt.x)},${Math.round(endPt.y)}`;
                    let shortest = routeCache.shortestPaths.get(endpointKey);
                    if (!shortest) {
                        shortest = findShortestNodePath(routeCache.nodes, startPt, endPt, { directed: true });
                        if (!shortest || shortest.length === 0) {
                            shortest = findShortestNodePath(routeCache.nodes, startPt, endPt, { directed: false });
                            routeCache.shortestPaths.set(endpointKey + '_fallback', true);
                        }
                        routeCache.shortestPaths.set(endpointKey, shortest);
                    }
                    shortest = Array.isArray(shortest) ? shortest.map(point => ({ ...point })) : shortest;
                    if (shortest && shortest.length >= 2) {
                        const isFallback = routeCache.shortestPaths.get(endpointKey + '_fallback') === true;
                        let sourceEnt = null;
                        let targetEnt = null;

                        if (startPt) {
                            sourceEnt = (state.mapEntities || []).find(ent => {
                                if (ent.isUnderConstruction) return false;
                                const ports = window.UIManager?.getBuildingPortSlots(ent) || [];
                                return ports.some(port => Math.hypot(port.x - startPt.x, port.y - startPt.y) < TS * 1.5);
                            });
                        }
                        if (endPt) {
                            targetEnt = (state.mapEntities || []).find(ent => {
                                if (ent.isUnderConstruction) return false;
                                const ports = window.UIManager?.getBuildingPortSlots(ent) || [];
                                return ports.some(port => Math.hypot(port.x - endPt.x, port.y - endPt.y) < TS * 1.5);
                            });
                        }

                        if (!sourceEnt && currentSeg.sourceId) sourceEnt = entityById.get(currentSeg.sourceId);
                        if (!targetEnt && currentSeg.targetId) targetEnt = entityById.get(currentSeg.targetId);

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

                        if (isFallback) {
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
                        }

                            const transferPoints = [];

                            if (sourceAnchor && !isOpenEndedLine) pushUniquePoint(transferPoints, sourceAnchor);
                            shortest.forEach(point => pushUniquePoint(transferPoints, point));
                            if (targetAnchor) pushUniquePoint(transferPoints, targetAnchor);

                            if (transferPoints.length >= 2) {
                                pathPoints = transferPoints;
                                annotateRoutePoints(pathPoints);
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
                recoverTransferToSource(t);
                state.activeTransfers.splice(i, 1);
                continue;
            }

            const projDist = getPathDistanceToPoint(pathPoints, currentPos, pathMetricsCache);
            const totalLen = getPathTotalLength(pathPoints, pathMetricsCache);
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
