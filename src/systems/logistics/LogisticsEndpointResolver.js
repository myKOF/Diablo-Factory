import { GameEngine } from '../game_systems.js';
import { annotateRoutePoints } from './LogisticsGeometry.js';
import { cloneLogisticsPort, hasLogisticsPortPosition } from './LogisticsPortUtils.js';
import { pushUniquePoint } from './LogisticsPathMetrics.js';
import { buildExpandedRoutePoints, buildSegmentNodeGraph, findShortestNodePath } from './LogisticsRouteGraph.js';

function getLogisticsTargetBuildingAt(worldX, worldY, sourceEnt = null) {
    return GameEngine.state.mapEntities.find(ent => {
        if (ent.isUnderConstruction) return false;
        if (sourceEnt && ent === sourceEnt) return false;
        const cfg = GameEngine.getEntityConfig(ent.type1);
        if (!cfg || !cfg.logistics || !cfg.logistics.canInput) return false;
        if (window.UIManager.isPointInsideEntity(ent, worldX, worldY)) return true;

        // 移除磁吸效果：只有游標精確落在端口格區域內才判定為該建築
        return window.UIManager.getBuildingPortSlots(ent).some(port =>
            window.UIManager.isPointInsidePortSlot(port, worldX, worldY)
        );
    }) || null;
}

function getConnectionRoute(sourceEnt, targetEnt, conn = null) {
    if (!sourceEnt || !targetEnt) return null;
    if (conn?.lineId && Array.isArray(GameEngine.state?.logisticsLines)) {
        const linePoints = this.getLogisticsGroupRoutePoints(conn.lineId, sourceEnt, targetEnt);
        if (Array.isArray(linePoints) && linePoints.length >= 2) {
            return {
                points: linePoints,
                width: Math.max(1, Number(conn.routeWidth) || 1)
            };
        }
    }
    if (conn && Array.isArray(conn.routePoints) && conn.routePoints.length >= 2) {
        return {
            points: conn.routePoints.map(p => ({ x: p.x, y: p.y })),
            width: Math.max(1, Number(conn.routeWidth) || 1)
        };
    }
    const sourcePort = window.UIManager.getNearestPortSlot(sourceEnt, targetEnt.x, targetEnt.y);
    const preferredDir = sourcePort ? window.UIManager.getOppositeDirection(sourcePort.dir) : null;
    const targetPort = window.UIManager.getNearestPortSlot(targetEnt, sourceEnt.x, sourceEnt.y, preferredDir);
    if (!sourcePort || !targetPort) return null;
    return {
        points: this.buildGridRoutePoints(this.buildOrthogonalRoute(
            { x: sourcePort.x, y: sourcePort.y },
            { x: targetPort.x, y: targetPort.y },
            sourcePort.dir,
            targetPort.dir,
            { x: (sourceEnt.x + targetEnt.x) / 2, y: (sourceEnt.y + targetEnt.y) / 2 }
        )),
        width: Math.max(1, Math.min(sourcePort.width || 1, targetPort.width || 1))
    };
}

function getConnectionTransferRoute(sourceEnt, targetEnt, conn = null) {
    if (!sourceEnt || !targetEnt) return null;

    let rawPoints = [];

    // 1. 強健的圖形搜尋：直接從群組內的所有線段碎片重建路徑
    if (conn && conn.lineId) {
        const segments = this.getLogisticsSegmentsByGroupId(conn.lineId);
        if (segments && segments.length > 0) {
            const sRef = conn.sourcePort || sourceEnt;
            const tRef = conn.targetPort || targetEnt;
            rawPoints = findShortestNodePath(buildSegmentNodeGraph(segments).nodes, sRef, tRef);
        }
    }

    // 2. 防呆退回：如果圖形搜尋失敗，退回單段路徑
    if (rawPoints.length < 2) {
        const route = this.getConnectionRoute(sourceEnt, targetEnt, conn);
        if (route && Array.isArray(route.points)) {
            rawPoints = route.points.map(p => ({ x: p.x, y: p.y }));
        } else {
            rawPoints = [{ x: sourceEnt.x, y: sourceEnt.y }, { x: targetEnt.x, y: targetEnt.y }];
        }
    }

    // 3. 決定真實物理接口 (Port)
    const first = rawPoints[0];
    const last = rawPoints[rawPoints.length - 1];

    const sourcePort = conn?.sourcePort
        ? window.UIManager.resolveCurrentPortSlot(sourceEnt, conn.sourcePort, first?.x, first?.y)
        : window.UIManager.getNearestPortSlot(sourceEnt, first?.x ?? targetEnt.x, first?.y ?? targetEnt.y);

    const targetPort = conn?.targetPort
        ? window.UIManager.resolveCurrentPortSlot(targetEnt, conn.targetPort, last?.x, last?.y)
        : window.UIManager.getNearestPortSlot(targetEnt, last?.x ?? sourceEnt.x, last?.y ?? sourceEnt.y);

    const sourceAnchor = sourcePort ? { x: sourcePort.x, y: sourcePort.y } : { x: sourceEnt.x, y: sourceEnt.y };
    const targetAnchor = targetPort ? { x: targetPort.x, y: targetPort.y } : { x: targetEnt.x, y: targetEnt.y };

    // 4. 確保陣列方向性
    const distFirstToSource = Math.hypot(first.x - sourceAnchor.x, first.y - sourceAnchor.y);
    const distLastToSource = Math.hypot(last.x - sourceAnchor.x, last.y - sourceAnchor.y);

    if (distLastToSource < distFirstToSource) {
        rawPoints.reverse();
    }

    // 5. 組裝最終幾何軌跡
    const transferPoints = [];
    pushUniquePoint(transferPoints, sourceAnchor);
    rawPoints.forEach(point => pushUniquePoint(transferPoints, point));
    pushUniquePoint(transferPoints, targetAnchor);

    if (transferPoints.length < 2) return null;

    const getCardinalDir = (from, to) => {
        if (!from || !to) return null;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
        if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx) || 1, y: 0 };
        return { x: 0, y: Math.sign(dy) || 1 };
    };
    for (let i = 1; i < transferPoints.length - 1; i++) {
        const prev = transferPoints[i - 1];
        const curr = transferPoints[i];
        const next = transferPoints[i + 1];
        const inDir = getCardinalDir(prev, curr);
        const outDir = getCardinalDir(curr, next);
        if (inDir && outDir && (inDir.x !== outDir.x || inDir.y !== outDir.y)) {
            curr.isCorner = true;
        }
    }

    return {
        points: transferPoints,
        width: Math.max(1, Number(conn?.routeWidth) || 1)
    };
}

function getLogisticsGroupRoutePoints(lineId, startRef = null, endRef = null) {
    const segments = this.getLogisticsSegmentsByGroupId(lineId);
    if (!Array.isArray(segments) || segments.length === 0) return null;
    const segmentPoints = segments
        .map(seg => Array.isArray(seg.routePoints) ? seg.routePoints.map(p => ({ x: p.x, y: p.y })) : [])
        .filter(points => points.length >= 2);
    if (segmentPoints.length === 0) return null;

    const makeKey = (point) => `${Math.round(point.x)},${Math.round(point.y)}`;
    const nodes = new Map();
    const edges = new Map();
    const addNode = (point) => {
        const key = makeKey(point);
        if (!nodes.has(key)) nodes.set(key, { x: Math.round(point.x), y: Math.round(point.y) });
        if (!edges.has(key)) edges.set(key, []);
        return key;
    };
    const addEdge = (a, b) => {
        const ak = addNode(a);
        const bk = addNode(b);
        if (ak === bk) return;
        edges.get(ak).push({ key: bk });
        edges.get(bk).push({ key: ak });
    };
    const getCardinalDir = (from, to) => {
        if (!from || !to) return null;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
        if (Math.abs(dx) > 0.001 && Math.abs(dy) > 0.001) return null;
        return Math.abs(dx) >= Math.abs(dy)
            ? { x: Math.sign(dx) || 1, y: 0 }
            : { x: 0, y: Math.sign(dy) || 1 };
    };

    segments.forEach((seg, index) => {
        const points = segmentPoints[index];
        if (!points) return;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const dir = getCardinalDir(a, b);
            if (!dir) continue;
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            const steps = Math.max(1, Math.round(dist / GameEngine.TILE_SIZE));
            let prev = null;
            for (let step = 0; step <= steps; step++) {
                const point = {
                    x: a.x + dir.x * GameEngine.TILE_SIZE * step,
                    y: a.y + dir.y * GameEngine.TILE_SIZE * step
                };
                const normalized = step === steps ? b : point;
                const key = makeKey(normalized);
                addNode(normalized);
                if (prev) addEdge(nodes.get(prev), normalized);
                prev = key;
            }
        }
    });

    const nearestKey = (ref) => {
        if (!ref || !nodes.size) return null;
        let bestKey = null;
        let bestDist = Infinity;
        nodes.forEach((point, key) => {
            const dist = Math.hypot(point.x - ref.x, point.y - ref.y);
            if (dist < bestDist) {
                bestDist = dist;
                bestKey = key;
            }
        });
        return bestKey;
    };

    const findPath = (startKey, endKey) => {
        if (!startKey || !endKey) return null;
        if (startKey === endKey) return [nodes.get(startKey)];
        const queue = [startKey];
        const visited = new Set([startKey]);
        const previous = new Map();

        while (queue.length > 0) {
            const current = queue.shift();
            if (current === endKey) break;
            (edges.get(current) || []).forEach(edge => {
                if (visited.has(edge.key)) return;
                visited.add(edge.key);
                previous.set(edge.key, current);
                queue.push(edge.key);
            });
        }

        if (!visited.has(endKey)) return null;
        const keys = [];
        let current = endKey;
        while (current) {
            keys.unshift(current);
            if (current === startKey) break;
            current = previous.get(current);
        }
        return keys[0] === startKey ? keys.map(key => ({ ...nodes.get(key) })) : null;
    };

    if (startRef && endRef) {
        const routed = findPath(nearestKey(startRef), nearestKey(endRef));
        if (Array.isArray(routed) && routed.length >= 2) return routed;
    }

    const remaining = segmentPoints.map(points => points.slice());
    const points = remaining.shift();
    const samePoint = (a, b) => a && b && a.x === b.x && a.y === b.y;

    while (remaining.length > 0) {
        const first = points[0];
        const last = points[points.length - 1];
        let foundIndex = -1;
        let prepend = false;
        let reverse = false;

        for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i];
            if (samePoint(candidate[0], last)) {
                foundIndex = i;
                break;
            }
            if (samePoint(candidate[candidate.length - 1], last)) {
                foundIndex = i;
                reverse = true;
                break;
            }
            if (samePoint(candidate[candidate.length - 1], first)) {
                foundIndex = i;
                prepend = true;
                break;
            }
            if (samePoint(candidate[0], first)) {
                foundIndex = i;
                prepend = true;
                reverse = true;
                break;
            }
        }

        if (foundIndex === -1) break;
        const next = remaining.splice(foundIndex, 1)[0];
        if (reverse) next.reverse();
        if (prepend) points.unshift(...next.slice(0, -1));
        else points.push(...next.slice(1));
    }

    if (startRef && points.length >= 2) {
        const firstDist = Math.hypot(points[0].x - startRef.x, points[0].y - startRef.y);
        const lastDist = Math.hypot(points[points.length - 1].x - startRef.x, points[points.length - 1].y - startRef.y);
        if (lastDist < firstDist) points.reverse();
    }
    return points;
}

function buildLogisticsGraphRoutePoints(segments, startRef = null, endRef = null) {
    return buildExpandedRoutePoints(segments, startRef, endRef, GameEngine.TILE_SIZE || 20);
}

function recalculateLogisticsGroupEndpoints(groupId) {
    const state = GameEngine.state;
    const groupSegments = this.getLogisticsSegmentsByGroupId(groupId);
    if (!Array.isArray(groupSegments) || groupSegments.length === 0) return;

    const ordered = this.orderLogisticsSegmentsByDirection(groupSegments);
    const firstSeg = ordered[0];
    const lastSeg = ordered[ordered.length - 1];

    if (!firstSeg || !Array.isArray(firstSeg.routePoints) || firstSeg.routePoints.length === 0) return;
    if (!lastSeg || !Array.isArray(lastSeg.routePoints) || lastSeg.routePoints.length === 0) return;

    const startPt = firstSeg.routePoints[0];
    const endPt = lastSeg.routePoints[lastSeg.routePoints.length - 1];

    let sourceEnt = null;
    let sourcePort = null;
    let targetEnt = null;
    let targetPort = null;

    const TS = GameEngine.TILE_SIZE || 64;
    const matchThreshold = TS * 1.1; // 允許端口第一格距離端口中心一個網格
    let bestSourceDist = matchThreshold;
    let bestTargetDist = matchThreshold;

    // 搜尋所有的 mapEntities 尋找匹配的端點建築與端口
    (state.mapEntities || []).forEach(ent => {
        if (ent.isUnderConstruction) return;
        const cfg = GameEngine.getEntityConfig(ent.type1);
        if (!cfg) return;

        const ports = window.UIManager?.getBuildingPortSlots(ent) || [];
        ports.forEach(port => {
            if (!port || !Number.isFinite(port.x) || !Number.isFinite(port.y)) return;

            // 檢查是否為 source (輸出端)
            if (cfg.logistics?.canOutput) {
                const dist = Math.hypot(port.x - startPt.x, port.y - startPt.y);
                if (dist < bestSourceDist) {
                    bestSourceDist = dist;
                    sourceEnt = ent;
                    sourcePort = {
                        dir: port.dir,
                        slotIndex: port.slotIndex,
                        defIndex: port.defIndex,
                        width: port.width,
                        x: port.x,
                        y: port.y
                    };
                }
            }

            // 檢查是否為 target (輸入端)
            if (cfg.logistics?.canInput) {
                const dist = Math.hypot(port.x - endPt.x, port.y - endPt.y);
                if (dist < bestTargetDist) {
                    bestTargetDist = dist;
                    targetEnt = ent;
                    targetPort = {
                        dir: port.dir,
                        slotIndex: port.slotIndex,
                        defIndex: port.defIndex,
                        width: port.width,
                        x: port.x,
                        y: port.y
                    };
                }
            }
        });
    });

    const findEntityById = (id) => {
        if (!id) return null;
        return (state.mapEntities || []).find(ent => (window.UIManager?.getEntityId(ent) || ent?.id) === id) || null;
    };
    const storedConnection = (state.mapEntities || [])
        .flatMap(ent => (Array.isArray(ent.outputTargets) ? ent.outputTargets : []).map(conn => ({ ent, conn })))
        .find(item => item.conn?.lineId === groupId) || null;
    const existingMeta = groupSegments.find(seg => seg && (seg.sourceId || seg.targetId || seg.sourcePort || seg.targetPort)) || null;

    if (!sourceEnt) {
        const storedSourcePort = cloneLogisticsPort(storedConnection?.conn?.sourcePort);
        const existingSourcePort = cloneLogisticsPort(existingMeta?.sourcePort);
        const preservedSourcePort = [storedSourcePort, existingSourcePort].find(hasLogisticsPortPosition) || null;
        const preservedSourceId = (storedConnection?.ent ? (window.UIManager?.getEntityId(storedConnection.ent) || storedConnection.ent.id) : null) ||
            existingMeta?.sourceId ||
            null;
        if (preservedSourceId && preservedSourcePort && this.doesLogisticsGroupContainConnectionPoint(groupId, preservedSourcePort, TS * 0.75, state)) {
            sourceEnt = findEntityById(preservedSourceId);
            sourcePort = preservedSourcePort;
        }
    }

    if (!targetEnt) {
        const storedTargetPort = cloneLogisticsPort(storedConnection?.conn?.targetPort);
        const existingTargetPort = cloneLogisticsPort(existingMeta?.targetPort);
        const preservedTargetPort = [storedTargetPort, existingTargetPort].find(hasLogisticsPortPosition) || null;
        const preservedTargetId = storedConnection?.conn?.id || existingMeta?.targetId || null;
        if (preservedTargetId && preservedTargetPort && this.doesLogisticsGroupContainConnectionPoint(groupId, preservedTargetPort, TS * 0.75, state)) {
            targetEnt = findEntityById(preservedTargetId);
            targetPort = preservedTargetPort;
        }
    }

    const sourceId = sourceEnt ? (window.UIManager?.getEntityId(sourceEnt) || sourceEnt.id) : null;
    const targetId = targetEnt ? (window.UIManager?.getEntityId(targetEnt) || targetEnt.id) : null;

    // 更新該群組所有線段的連線資訊
    groupSegments.forEach(seg => {
        seg.sourceId = sourceId;
        seg.targetId = targetId;
        seg.sourcePort = sourcePort;
        seg.targetPort = targetPort;
        if (targetId) {
            seg.targetPoint = null;
        }
    });

    // 更新 sourceEnt 的 outputTargets 連線資訊
    if (sourceEnt) {
        if (!Array.isArray(sourceEnt.outputTargets)) {
            sourceEnt.outputTargets = [];
        }
        let conn = sourceEnt.outputTargets.find(item => item.lineId === groupId);
        if (!conn) {
            conn = {
                id: targetId || null,
                lineId: groupId
            };
            sourceEnt.outputTargets.push(conn);
        }
        sourceEnt.outputTargets = sourceEnt.outputTargets.filter(item => item === conn || item?.lineId !== groupId);
        conn.id = targetId || null;
        conn.sourcePort = sourcePort;
        conn.targetPort = targetPort;
        conn.routeWidth = firstSeg.routeWidth || 1;
        conn.lineType = firstSeg.lineType || 'transport_line';
        conn.efficiency = firstSeg.efficiency || 0;
        if (!conn.filter && firstSeg.filter) conn.filter = firstSeg.filter;

        // 合併產生一份完整的排序好的路徑點，讓 UIManager/WorkerSystem 可以完美載入
        const pathPoints = [];
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
        conn.routePoints = pathPoints;
        const graphPathPoints = this.buildLogisticsGraphRoutePoints(
            groupSegments,
            sourcePort || startPt,
            targetPort || (targetEnt ? endPt : null)
        );
        if (Array.isArray(graphPathPoints) && graphPathPoints.length >= 2) {
            conn.routePoints = graphPathPoints;
        }
    }

    // 清除所有其他建築中對應此 groupId 的 outputTargets (如果斷線或轉移)
    (state.mapEntities || []).forEach(ent => {
        if (ent !== sourceEnt && Array.isArray(ent.outputTargets)) {
            ent.outputTargets = ent.outputTargets.filter(conn => conn.lineId !== groupId);
        } else if (ent === sourceEnt && !sourceEnt && Array.isArray(ent.outputTargets)) {
            ent.outputTargets = ent.outputTargets.filter(conn => conn.lineId !== groupId);
        }
    });
}

export class LogisticsEndpointResolver {
    constructor(system) {
        this.system = system;
    }

    getLogisticsTargetBuildingAt(worldX, worldY, sourceEnt = null) {
        return getLogisticsTargetBuildingAt.apply(this.system, arguments);
    }

    getConnectionRoute(sourceEnt, targetEnt, conn = null) {
        return getConnectionRoute.apply(this.system, arguments);
    }

    getConnectionTransferRoute(sourceEnt, targetEnt, conn = null) {
        return getConnectionTransferRoute.apply(this.system, arguments);
    }

    getLogisticsGroupRoutePoints(lineId, startRef = null, endRef = null) {
        return getLogisticsGroupRoutePoints.apply(this.system, arguments);
    }

    buildLogisticsGraphRoutePoints(segments, startRef = null, endRef = null) {
        return buildLogisticsGraphRoutePoints.apply(this.system, arguments);
    }

    recalculateLogisticsGroupEndpoints(groupId) {
        return recalculateLogisticsGroupEndpoints.apply(this.system, arguments);
    }

}
