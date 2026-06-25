import { getCardinalDirection } from './LogisticsGeometry.js';
import { buildSelectedGroupDebugGraphRoutes } from './LogisticsRouteGraph.js';

/**
 * 物流 debug overlay「選取群組路線高亮」的續接器（route-stitching）。
 *
 * 由 buildSelectedGroupDebugGraphRoutes 取得選取群組的基礎路線後，沿三條路徑把
 * 相鄰群組接成連續高亮：
 *   1) 合流續接：沿 logisticsMergeNodes 從輸入群組穿越合流點接到輸出群組（while 迴圈）。
 *   2) 實體 fallback：無合流節點時，把端點鄰接的共線相鄰群組接續（findPhysicalContinuationRoute）。
 *   3) 回填：選取輸出群組時，遞迴把上游輸入支線回填成貫穿路線（getBackfilledRoutes）。
 *
 * P2a：此續接器原為 LogisticsRenderer.getSelectedGroupDebugRoutePoints（~370 行）的渲染層
 * god-method 一部分，現抽至系統層。渲染層經 LogisticsRenderModel facade 取用。
 *
 * 依賴以參數注入（renderModel）而非 import 單例，避免 LogisticsRenderModel ↔ 本模組循環依賴。
 * renderModel 須提供：ensureMergeNodeStore / getGroupRoutePoints / getMergeNodeOutputRoute /
 * getSegmentsByGroupId（即 LogisticsRenderModel 介面）。
 *
 * @param {object} state 遊戲狀態（讀 logisticsLines / logisticsMergeNodes / mapEntities）
 * @param {string} groupKey 選取群組 id
 * @param {Array} groupSegs 選取群組的線段
 * @param {object} renderModel LogisticsRenderModel facade（系統層存取閘道）
 * @param {number} tileSize 格邊長
 * @returns {Array<Array<{x,y}>>} 高亮路線陣列
 */
export function buildSelectedGroupDebugRoutePoints(state, groupKey, groupSegs, renderModel, tileSize = 20) {
    const routes = [];
    const seen = new Set();
    const suppressedEndpointKeys = new Set(
        (Array.isArray(groupSegs) ? groupSegs : [])
            .map(seg => seg?.detachedFromGroupId && seg.detachedAtKey ? seg.detachedAtKey : null)
            .filter(Boolean)
    );
    const normalize = (points) => {
        if (!Array.isArray(points) || points.length < 2) return null;
        const clean = [];
        points.forEach(point => {
            const x = Number(point?.x);
            const y = Number(point?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            const prev = clean[clean.length - 1];
            if (!prev || Math.round(prev.x) !== Math.round(x) || Math.round(prev.y) !== Math.round(y)) {
                clean.push({ x, y });
            }
        });
        while (clean.length >= 2) {
            const last = clean[clean.length - 1];
            const lastKey = `${Math.round(last.x)},${Math.round(last.y)}`;
            if (!suppressedEndpointKeys.has(lastKey)) break;
            clean.pop();
        }
        return clean.length >= 2 ? clean : null;
    };
    const addRoute = (points) => {
        const clean = normalize(points);
        if (!clean) return;
        const key = clean.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join("|");
        if (seen.has(key)) return;
        seen.add(key);
        routes.push(clean);
    };

    buildSelectedGroupDebugGraphRoutes(groupSegs, tileSize).forEach(addRoute);
    if (routes.length === 0) {
        (state.mapEntities || []).forEach(ent => {
            (ent?.outputTargets || []).forEach(conn => {
                if (conn?.lineId !== groupKey) return;
                addRoute(conn.routePoints);
            });
        });
    }
    if (routes.length === 0) {
        (Array.isArray(groupSegs) ? groupSegs : []).forEach(seg => {
            const pts = normalize(seg?.routePoints);
            if (pts) addRoute(pts);
        });
    }

    const TS = tileSize || 20;
    const matchDist = TS * 2.5;
    const physicalFallbackDist = Math.max(1, TS * 0.35);
    const nodes = renderModel.ensureMergeNodeStore(state);
    const getStateGroupSegments = (targetGroupId) => {
        if (!targetGroupId) return [];
        return (Array.isArray(state.logisticsLines) ? state.logisticsLines : [])
            .filter(line => (line?.groupId || line?.id || null) === targetGroupId);
    };
    const sliceRouteFromAnchor = (route, anchorPoint, maxDistance = matchDist) => {
        if (!Array.isArray(route) || route.length < 2 || !anchorPoint) return null;
        let bestIndex = -1;
        let bestDist = Infinity;
        route.forEach((point, index) => {
            const dist = Math.hypot(point.x - anchorPoint.x, point.y - anchorPoint.y);
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = index;
            }
        });
        if (bestIndex < 0 || bestDist > maxDistance) return null;
        const sliced = route.slice(bestIndex).map(point => ({ x: point.x, y: point.y }));
        if (sliced.length < 2) return null;
        sliced[0] = { x: anchorPoint.x, y: anchorPoint.y };
        return sliced;
    };
    const getRouteExitDir = (route) => {
        if (!Array.isArray(route) || route.length < 2) return null;
        return getCardinalDirection(route[0], route[1]);
    };
    const isOppositeDir = (a, b) => !!a && !!b && a.x === -b.x && a.y === -b.y;
    const isSameDir = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;
    const normalizeDir = (dir) => {
        if (!dir || !Number.isFinite(dir.x) || !Number.isFinite(dir.y)) return null;
        const x = Math.sign(dir.x);
        const y = Math.sign(dir.y);
        if (x !== 0 && y !== 0) {
            return Math.abs(dir.x) >= Math.abs(dir.y) ? { x, y: 0 } : { x: 0, y };
        }
        if (x === 0 && y === 0) return null;
        return { x, y };
    };
    const orientRouteFromAnchor = (route, anchorPoint, maxDistance = matchDist) => {
        if (!Array.isArray(route) || route.length < 2 || !anchorPoint) return null;
        const first = route[0];
        const last = route[route.length - 1];
        if (first && Math.hypot(first.x - anchorPoint.x, first.y - anchorPoint.y) <= maxDistance) {
            const copy = route.map(point => ({ x: point.x, y: point.y }));
            copy[0] = { x: anchorPoint.x, y: anchorPoint.y };
            return copy;
        }
        if (last && Math.hypot(last.x - anchorPoint.x, last.y - anchorPoint.y) <= maxDistance) {
            const copy = route.map(point => ({ x: point.x, y: point.y })).reverse();
            copy[0] = { x: anchorPoint.x, y: anchorPoint.y };
            return copy;
        }
        return sliceRouteFromAnchor(route, anchorPoint, maxDistance);
    };
    const chooseMergeOutputRoute = (mergeNode, candidateRoutes) => {
        const nodePoint = mergeNode?.point || { x: mergeNode?.x, y: mergeNode?.y };
        if (!nodePoint) return null;
        const preferredDir = normalizeDir(mergeNode?.outputDir);
        const oriented = [];
        (candidateRoutes || []).forEach((route, index) => {
            const fromAnchor = orientRouteFromAnchor(route, nodePoint);
            if (!fromAnchor || fromAnchor.length < 2) return;
            const exitDir = getRouteExitDir(fromAnchor);
            oriented.push({
                route: fromAnchor,
                score: preferredDir && isSameDir(preferredDir, exitDir) ? 0 : (preferredDir ? 2 : 1),
                index
            });
        });
        if (oriented.length === 0) return null;
        oriented.sort((a, b) => a.score - b.score || a.index - b.index);
        return oriented[0].route;
    };
    const findPhysicalContinuationRoute = (currentGroupId, anchorPoint, visitedGroupIds, incomingDir = null) => {
        if (!anchorPoint) return null;
        const groups = [...new Set((Array.isArray(state.logisticsLines) ? state.logisticsLines : [])
            .map(line => line?.groupId || line?.id || null)
            .filter(Boolean))];
        const candidates = [];
        for (const candidateGroupId of groups) {
            if (candidateGroupId === currentGroupId || visitedGroupIds.has(candidateGroupId)) continue;
            const candidateRoutes = [];
            const systemRoute = renderModel.getGroupRoutePoints(candidateGroupId, anchorPoint);
            if (Array.isArray(systemRoute) && systemRoute.length >= 2) candidateRoutes.push(systemRoute);
            buildSelectedGroupDebugGraphRoutes(getStateGroupSegments(candidateGroupId), tileSize)
                .forEach(route => candidateRoutes.push(route));
            for (const points of candidateRoutes) {
                const route = sliceRouteFromAnchor(points, anchorPoint, physicalFallbackDist);
                if (!route) continue;
                const exitDir = getRouteExitDir(route);
                if (isOppositeDir(incomingDir, exitDir)) continue;
                candidates.push({
                    groupId: candidateGroupId,
                    route,
                    score: isSameDir(incomingDir, exitDir) ? 1 : 0
                });
            }
        }
        candidates.sort((a, b) => a.score - b.score);
        return candidates[0] || null;
    };
    const extendedRoutes = routes.map(route => {
        let currentRoute = [...route];
        let currentGroupId = groupKey;
        const visitedGroupIds = new Set([groupKey]);

        while (true) {
            let lastPt = currentRoute[currentRoute.length - 1];
            let firstPt = currentRoute[0];
            if (!lastPt) break;

            let isReverseMatch = false;
            const mergeNode = nodes.find(node => {
                if (!node || !node.outputGroupId || !Array.isArray(node.inputGroupIds)) return false;
                const isIncluded = node.inputGroupIds.includes(currentGroupId);
                const np = node.point || { x: node.x, y: node.y };
                const distLast = Math.hypot(lastPt.x - np.x, lastPt.y - np.y);
                const distFirst = Math.hypot(firstPt.x - np.x, firstPt.y - np.y);

                if (isIncluded && (distLast <= matchDist || distFirst <= matchDist)) {
                    if (distFirst < distLast) {
                        isReverseMatch = true;
                    }
                    return true;
                }
                return false;
            });

            let nextGroupId = null;
            let nextRoute = null;
            if (mergeNode) {
                // 更新最後一個點
                lastPt = currentRoute[currentRoute.length - 1];
                nextGroupId = mergeNode.outputGroupId;
                const outputRouteCandidates = [];
                const outputRoute = renderModel.getMergeNodeOutputRoute(mergeNode);
                if (Array.isArray(outputRoute) && outputRoute.length >= 2) {
                    outputRouteCandidates.push(outputRoute);
                } else if (state.logisticsMergeNodeStore && typeof state.logisticsMergeNodeStore.getLogisticsMergeNodeOutputRoute === 'function') {
                    const outputRoute = state.logisticsMergeNodeStore.getLogisticsMergeNodeOutputRoute(mergeNode);
                    if (Array.isArray(outputRoute) && outputRoute.length >= 2) outputRouteCandidates.push(outputRoute);
                }

                const nextSegs = renderModel.getSegmentsByGroupId(nextGroupId);
                if (nextSegs && nextSegs.length > 0) {
                    const groupRoute = renderModel.getGroupRoutePoints(nextGroupId, mergeNode.point || { x: mergeNode.x, y: mergeNode.y });
                    if (Array.isArray(groupRoute) && groupRoute.length >= 2) outputRouteCandidates.push(groupRoute);
                }
                buildSelectedGroupDebugGraphRoutes(getStateGroupSegments(nextGroupId), tileSize)
                    .forEach(stateRoute => outputRouteCandidates.push(stateRoute));
                nextRoute = chooseMergeOutputRoute(mergeNode, outputRouteCandidates);
            } else {
                const incomingDir = currentRoute.length >= 2
                    ? getCardinalDirection(currentRoute[currentRoute.length - 2], lastPt)
                    : null;
                const reverseIncomingDir = currentRoute.length >= 2
                    ? getCardinalDirection(currentRoute[1], firstPt)
                    : null;
                const fallback = findPhysicalContinuationRoute(currentGroupId, lastPt, visitedGroupIds, incomingDir);
                const reverseFallback = fallback ? null : findPhysicalContinuationRoute(currentGroupId, firstPt, visitedGroupIds, reverseIncomingDir);
                const chosenFallback = fallback || reverseFallback;
                if (!chosenFallback) break;
                isReverseMatch = !!reverseFallback;
                nextGroupId = chosenFallback.groupId;
                nextRoute = chosenFallback.route;
            }

            if (visitedGroupIds.has(nextGroupId)) break;
            visitedGroupIds.add(nextGroupId);

            if (!nextRoute || nextRoute.length < 2) break;

            const nextStart = nextRoute[0];
            const nextEnd = nextRoute[nextRoute.length - 1];

            if (isReverseMatch) {
                const distStartToFirst = Math.hypot(nextStart.x - firstPt.x, nextStart.y - firstPt.y);
                const distEndToFirst = Math.hypot(nextEnd.x - firstPt.x, nextEnd.y - firstPt.y);

                let toPrepend = [...nextRoute];
                if (distStartToFirst < distEndToFirst) {
                    toPrepend.reverse();
                }

                if (toPrepend.length > 0 && currentRoute.length > 0) {
                    const match = Math.hypot(toPrepend[toPrepend.length - 1].x - firstPt.x, toPrepend[toPrepend.length - 1].y - firstPt.y) < 1;
                    if (match) {
                        toPrepend.pop();
                    }
                }
                currentRoute = [...toPrepend, ...currentRoute];
            } else {
                const distStartToLast = Math.hypot(nextStart.x - lastPt.x, nextStart.y - lastPt.y);
                const distEndToLast = Math.hypot(nextEnd.x - lastPt.x, nextEnd.y - lastPt.y);

                let toAppend = [...nextRoute];
                if (distEndToLast < distStartToLast) {
                    toAppend.reverse();
                }

                const startIdx = Math.hypot(toAppend[0].x - lastPt.x, toAppend[0].y - lastPt.y) < 1 ? 1 : 0;
                for (let i = startIdx; i < toAppend.length; i++) {
                    currentRoute.push({ x: toAppend[i].x, y: toAppend[i].y });
                }
            }

            currentGroupId = nextGroupId;
        }
        return currentRoute;
    });

    const finalRoutes = [];
    const finalSeen = new Set();
    const addFinalRoute = (points) => {
        const clean = normalize(points);
        if (!clean) return;
        const key = clean.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join("|");
        if (finalSeen.has(key)) return;
        finalSeen.add(key);
        finalRoutes.push(clean);
    };
    const isNear = (a, b, distance = matchDist) => !!a && !!b &&
        Math.hypot(a.x - b.x, a.y - b.y) <= distance;
    const orientRouteToEndAt = (route, point) => {
        if (!Array.isArray(route) || route.length < 2 || !point) return null;
        const copy = route.map(p => ({ x: p.x, y: p.y }));
        const first = copy[0];
        const last = copy[copy.length - 1];
        if (isNear(last, point)) return copy;
        if (isNear(first, point)) return copy.reverse();
        return null;
    };
    const orientRouteToStartAt = (route, point) => {
        if (!Array.isArray(route) || route.length < 2 || !point) return null;
        const copy = route.map(p => ({ x: p.x, y: p.y }));
        const first = copy[0];
        const last = copy[copy.length - 1];
        if (isNear(first, point)) return copy;
        if (isNear(last, point)) return copy.reverse();
        return null;
    };
    const appendRoute = (head, tail) => {
        const merged = head.map(p => ({ x: p.x, y: p.y }));
        const startIndex = merged.length > 0 && tail.length > 0 && isNear(merged[merged.length - 1], tail[0], 1)
            ? 1
            : 0;
        for (let i = startIndex; i < tail.length; i++) {
            merged.push({ x: tail[i].x, y: tail[i].y });
        }
        return merged;
    };

    const getBackfilledRoutes = (currentGroupId, currentOutputRoute, visited = new Set()) => {
        if (visited.has(currentGroupId)) return [currentOutputRoute];
        visited.add(currentGroupId);

        const mergeNode = nodes.find(node => node && node.outputGroupId === currentGroupId && Array.isArray(node.inputGroupIds));
        if (!mergeNode) return [currentOutputRoute];

        const nodePoint = mergeNode.point || { x: mergeNode.x, y: mergeNode.y };
        if (!nodePoint) return [currentOutputRoute];

        const orientedOutputRoute = orientRouteToStartAt(currentOutputRoute, nodePoint);
        if (!orientedOutputRoute) return [currentOutputRoute];

        const resultRoutes = [];
        const dirOut = orientedOutputRoute.length >= 2
            ? getCardinalDirection(orientedOutputRoute[0], orientedOutputRoute[1])
            : null;
        const sortedInputGroupIds = [...mergeNode.inputGroupIds].sort((aId, bId) => {
            const getScore = (groupId) => {
                const modelInputSegs = renderModel.getSegmentsByGroupId(groupId);
                const inputSegs = modelInputSegs.length > 0 ? modelInputSegs : getStateGroupSegments(groupId);
                let maxScore = 0;
                buildSelectedGroupDebugGraphRoutes(inputSegs, tileSize).forEach(inputRoute => {
                    const orientedInputRoute = orientRouteToEndAt(inputRoute, nodePoint);
                    if (!orientedInputRoute || orientedInputRoute.length < 2) return;
                    const dirIn = getCardinalDirection(
                        orientedInputRoute[orientedInputRoute.length - 2],
                        orientedInputRoute[orientedInputRoute.length - 1]
                    );
                    if (dirIn && dirOut && dirIn.x === dirOut.x && dirIn.y === dirOut.y) {
                        maxScore = 1;
                    }
                });
                return maxScore;
            };
            return getScore(bId) - getScore(aId);
        });

        sortedInputGroupIds.forEach(inputGroupId => {
            const modelInputSegs = renderModel.getSegmentsByGroupId(inputGroupId);
            const inputSegs = modelInputSegs.length > 0 ? modelInputSegs : getStateGroupSegments(inputGroupId);
            let hasMerged = false;
            buildSelectedGroupDebugGraphRoutes(inputSegs, tileSize).forEach(inputRoute => {
                const orientedInputRoute = orientRouteToEndAt(inputRoute, nodePoint);
                if (!orientedInputRoute) return;
                const mergedRoute = appendRoute(orientedInputRoute, orientedOutputRoute);
                hasMerged = true;
                const recurred = getBackfilledRoutes(inputGroupId, mergedRoute, new Set(visited));
                recurred.forEach(r => resultRoutes.push(r));
            });
            if (!hasMerged) {
                resultRoutes.push(currentOutputRoute);
            }
        });

        return resultRoutes.length > 0 ? resultRoutes : [currentOutputRoute];
    };

    const backfilledRoutes = [];
    extendedRoutes.forEach(route => {
        const recursive = getBackfilledRoutes(groupKey, route);
        recursive.forEach(r => backfilledRoutes.push(r));
    });

    backfilledRoutes.forEach(addFinalRoute);
    extendedRoutes.forEach(addFinalRoute);

    return finalRoutes;
}
