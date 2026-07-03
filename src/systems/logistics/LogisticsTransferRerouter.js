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
import { logisticsTransportArrayState } from './LogisticsTransportArrayState.js';

export class LogisticsTransferRerouter {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    updateOnLogisticsChange(state, affectedGroupIds = null) {
        // [根因修正] 找不到 currentSeg / 算不出有效路線時,這裡會把物品從 state.activeTransfers
        // 退款+移除,但從未告知 worker——worker 的 byId 裡這個 id 永遠不會被清掉,變成一個「幽靈物品」
        // 繼續參與該線的排隊間距計算(佔住位置擋住後車),永遠卡在移除當下的 progress/maxAllowedProgress,
        // 且完全不會出現在主執行緒的 activeTransfers,導致所有掃描主執行緒資料的診斷都看不到它、
        // 而 worker 端凍結物品數卻持續攀升——這正是「拉分支後過幾秒才顯現的卡死,且找不到主執行緒側落差」
        // 的真根因。改為收集本次被移除的 id,回傳給呼叫端(見 LogisticsTransferSystem)通知
        // workerBridge.removeTransfers(...) 一併清掉。
        const removedTransferIds = [];
        if (!state || !Array.isArray(state.activeTransfers) || state.activeTransfers.length === 0) return removedTransferIds;
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
                getEntityId,
                state
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

        // [TEMP-DIAG] 中段拉分支後在途物品 routeEnd 與 targetPoint 對不上的即時偵測(問題定位後移除)。
        // 只在真的超出抵達容差時才印,避免洗版;藉此分辨是「本次沒被納入重算範圍(shouldUpdateTransfer
        // 跳過)」還是「重算了但結果本身就對不上」兩種可能。
        const mismatchDist = (tr) => {
            if (!tr || !Array.isArray(tr.routePoints) || tr.routePoints.length < 2 || !tr.targetPoint) return 0;
            const end = tr.routePoints[tr.routePoints.length - 1];
            return Math.hypot((end.x || 0) - tr.targetPoint.x, (end.y || 0) - tr.targetPoint.y);
        };

        for (let i = state.activeTransfers.length - 1; i >= 0; i--) {
            const t = state.activeTransfers[i];
            if (!shouldUpdateTransfer(t)) {
                const md = mismatchDist(t);
                if (md > TS * 1.5 && GameEngine && typeof GameEngine.addLog === 'function') {
                    GameEngine.addLog(
                        `[WORKER診斷] rerouter 跳過(不在本次重算範圍) id=${t.id} lineId=${t.lineId} 落差=${Math.round(md)}px progress=${(+t.progress || 0).toFixed(4)} affectedSetSize=${affectedSet ? affectedSet.size : 'null'}`,
                        'LOGISTICS'
                    );
                }
                continue;
            }
            if (!Array.isArray(t.routePoints) || t.routePoints.length < 2) continue;

            const currentPos = getPointOnPathProgress(t.routePoints, t.progress, pathMetricsCache);

            // [根因修正] 純「距離最近者勝」會讓中段拉出的新分支(即使跟這個物品毫無關係、只是幾何上剛好經過
            // 附近)把正在正常運送的物品「搶走」——物品被重新指派到新分支上,若新分支還沒接到任何終點
            // (targetId 為空),物品從此進度雖然還會前進,卻永遠送不到、也不再回報任何錯誤(靜默遺失產能)。
            // 優先保留物品目前所在的群組(只要它仍是容差內的有效候選),只有在目前群組不再是候選時
            // (真的斷線/延伸/接回等既有情境)才照舊選「距離最近」的線段。
            // [根因修正 2] 同一個群組內,不同線段各自的 targetId 可能不一致(把一條無終點的死路分支
            // 合併進原本正常送貨的群組後,群組裡就同時存在「有終點」與「無終點」的線段)。純比同群組
            // 還不夠,還要在「同群組」內優先選有 targetId 的線段,否則物品可能被同群組裡剛好距離更近的
            // 死路段搶走,一樣會靜默送不到。
            // [根因修正 3] 中段再次拉分支時,原本物品實際延續的那段路(舊 back segments)會被切割改配
            // 到全新的 detachedGroupId(但仍保有 targetId);而新拉出的那條分支,無論有沒有設終點,
            // 一律沿用原本的 sourceGroupId(見 LogisticsDragSubmission.js 的 upsertLogisticsLine 呼叫)。
            // 若「同群組」優先於「有終點」,就會讓「同群組但無終點」的新分支(tier 舊版=1)搶贏
            // 「跨群組但有終點」的正確延續段(tier 舊版=2),物品從此送不到。
            // 故改為「有終點」優先於「同群組」:0=同群組+有終點(最優)、1=跨群組+有終點、
            // 2=同群組但無終點、3=跨群組且無終點(真斷線,才會落到這裡)。
            let currentSeg = null;
            let bestSegDist = Infinity;
            let currentSegTier = Infinity;
            getCandidateLines(currentPos).forEach(line => {
                if (!line) return;
                const route = Array.isArray(line.routePoints) && line.routePoints.length >= 2
                    ? line.routePoints
                    : [{ x: line.x, y: line.y }, { x: line.x, y: line.y }];
                const d = getDistanceToPath(route, currentPos, pathMetricsCache);
                if (d > TS * 0.75) return;
                const sameGroup = (line.groupId || line.id) === t.lineId;
                const tier = line.targetId ? (sameGroup ? 0 : 1) : (sameGroup ? 2 : 3);
                if (tier < currentSegTier || (tier === currentSegTier && d < bestSegDist)) {
                    bestSegDist = d;
                    currentSeg = line;
                    currentSegTier = tier;
                }
            });

            if (!currentSeg) {
                recoverTransferToSource(t);
                state.activeTransfers.splice(i, 1);
                removedTransferIds.push(t.id);
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
                            const storedTargetPort = currentSeg.targetPort || t.targetPort || null;
                            const nearestTargetPort = window.UIManager.getNearestPortSlot(
                                targetEnt,
                                last?.x ?? (sourceEnt ? sourceEnt.x : targetEnt.x),
                                last?.y ?? (sourceEnt ? sourceEnt.y : targetEnt.y)
                            );
                            let targetPort = storedTargetPort
                                ? window.UIManager.resolveCurrentPortSlot(targetEnt, storedTargetPort, last?.x, last?.y)
                                : nearestTargetPort;
                            if (targetPort && nearestTargetPort && last) {
                                const resolvedDist = Math.hypot(targetPort.x - last.x, targetPort.y - last.y);
                                const nearestDist = Math.hypot(nearestTargetPort.x - last.x, nearestTargetPort.y - last.y);
                                // 重接到同建築另一端口時，舊 targetPort 的 slotIndex 仍可能匹配成功；
                                // 若它已遠離新路線尾端，必須以物理尾端最近端口為準，避免入庫判定被釘回舊端口。
                                if (resolvedDist > TS * 1.1 && nearestDist < resolvedDist) {
                                    targetPort = nearestTargetPort;
                                }
                            }
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
                removedTransferIds.push(t.id);
                continue;
            }

            const projDist = getPathDistanceToPoint(pathPoints, currentPos, pathMetricsCache);
            const totalLen = getPathTotalLength(pathPoints, pathMetricsCache);
            t.routePoints = pathPoints;
            logisticsTransportArrayState.setTransferDistance(t, totalLen > 0 ? projDist : 0, totalLen, TS);
            t.sourceId = currentSeg.sourceId || null;
            t.targetId = currentSeg.targetId || null;
            t.efficiency = Number(currentSeg.efficiency) || 0;
            // [根因修正] 這裡只更新了 routePoints/targetId,卻沒有同步 targetPoint。LogisticsKinematics 的抵達
            // 判定要求 routePoints 末端落在 targetPoint 附近(見該檔案「斷線防護」註解:線被切斷時 routePoints
            // 會縮到斷點、但 targetPoint 刻意保持不變,兩者不一致才能分辨「真斷線」而不誤判抵達)。
            // 但這裡目前解出了「有效」的新目的地(currentSeg.targetId 非空)時,若不同步更新 targetPoint,
            // 它會永遠停留在舊值(例如中段延伸前的舊端點/舊分支目標),導致 routePoints 末端從此再也對不上
            // targetPoint → 永遠判定未抵達 → 物品在新端口前堵死不入庫。只在確實解出有效目標時更新,
            // 沒有目標(真斷線)時保留原值,維持斷線防護語意不變。
            if (currentSeg.targetId) {
                const newEnd = pathPoints[pathPoints.length - 1];
                t.targetPoint = { x: newEnd.x, y: newEnd.y };
            }

            // [TEMP-DIAG] 理論上這裡剛把 targetPoint 設成 pathPoints 的尾端,不該再有落差;
            // 若還是超出容差,代表問題不在「跳過重算」而在重算本身算錯(例如選錯 sink/graph 路徑)。
            {
                const md = mismatchDist(t);
                if (md > TS * 1.5 && GameEngine && typeof GameEngine.addLog === 'function') {
                    GameEngine.addLog(
                        `[WORKER診斷] rerouter 重算後仍有落差 id=${t.id} lineId=${t.lineId} 落差=${Math.round(md)}px targetId=${t.targetId} progress=${(+t.progress || 0).toFixed(4)}`,
                        'LOGISTICS'
                    );
                }
            }
        }

        system.applyLogisticsMergeNodes(state);
        system.applyBlockedTransferQueues(state);
        return removedTransferIds;
    }
}
