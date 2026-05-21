import { GameEngine } from "../systems/game_systems.js";
import { UI_CONFIG } from "../ui/ui_config.js";
import { conveyorSystem } from "../systems/ConveyorSystem.js";

export class LogisticsRenderer {
    static render(graphics, state, scene, options = {}) {
        graphics.clear();
        const logCfg = UI_CONFIG.LogisticsSystem || {
            lineThickness: 3, lineColor: "#4caf50", lineAlpha: 0.6,
            dragLineColor: "#8bc34a", dragLineAlpha: 0.8,
            arrowColor: "#ff8800ff", arrowSize: 8, arrowSpeed: 60, arrowSpacing: 40, lineOffset: 8
        };
        const parseColor = (c) => scene.hexOrRgba(c).color;
        const currentTime = scene.time.now / 1000;

        const getCoordId = (e) => `${e.type1}_${e.x}_${e.y}`;
        const drawSelectedLogisticsSegmentOutline = (line) => {
            if (!line || line.x === undefined || line.y === undefined) return;
            const TS = GameEngine.TILE_SIZE;
            const padding = Math.max(0, Number(logCfg.selectedSegmentOutlinePadding) || 0);
            const outlineColor = parseColor(logCfg.selectedSegmentOutlineColor || "#ff3d00ff");
            const outlineAlpha = logCfg.selectedSegmentOutlineAlpha ?? 1;
            const outlineWidth = Math.max(1, Number(logCfg.selectedSegmentOutlineWidth) || 2);
            graphics.lineStyle(outlineWidth, outlineColor, outlineAlpha);
            graphics.strokeRect(
                line.x - TS / 2 - padding,
                line.y - TS / 2 - padding,
                TS + padding * 2,
                TS + padding * 2
            );
        };
        const drawSelectedLogisticsSegmentOutlineOnRoute = (points, widthTiles, line) => {
            if (!line || !Array.isArray(points) || points.length < 2) {
                drawSelectedLogisticsSegmentOutline(line);
                return;
            }
            const rects = LogisticsRenderer.getLogisticsCellRects(points, widthTiles, true);
            // [核心修正] 由於傳入的是單一 segment 的路徑點，故不應再用 order 進行二次索引。
            // 這裡永遠取第一格 rect 即可完美對齊實體。
            const rect = rects[0];
            if (!rect) {
                drawSelectedLogisticsSegmentOutline(line);
                return;
            }
            const padding = Math.max(0, Number(logCfg.selectedSegmentOutlinePadding) || 0);
            const outlineColor = parseColor(logCfg.selectedSegmentOutlineColor || "#ff3d00ff");
            const outlineAlpha = logCfg.selectedSegmentOutlineAlpha ?? 1;
            const outlineWidth = Math.max(1, Number(logCfg.selectedSegmentOutlineWidth) || 2);
            graphics.lineStyle(outlineWidth, outlineColor, outlineAlpha);
            graphics.strokeRect(
                rect.x - padding,
                rect.y - padding,
                rect.w + padding * 2,
                rect.h + padding * 2
            );
        };

        const drawLogisticsRoute = (points, widthTiles, isSelected, isConnected, line = null, isPortToPort = false, skipArrowCellKeys = null) => {
            const baseThickness = logCfg.lineThickness || 3;
            const thickPx = Math.max(baseThickness, widthTiles * GameEngine.TILE_SIZE * 0.8);
            const usePortToPortStyle = !!isPortToPort && !!isConnected;
            const lColor = isSelected
                ? (logCfg.selectedLineColor || "#ffff00")
                : (usePortToPortStyle
                    ? (logCfg.portToPortLineColor || logCfg.lineColor)
                    : (!isConnected ? (logCfg.disconnectedLineColor || "#6b6b6b") : logCfg.lineColor));
            const lAlpha = isSelected
                ? (logCfg.selectedLineAlpha || 1.0)
                : (usePortToPortStyle
                    ? (logCfg.portToPortLineAlpha ?? logCfg.lineAlpha)
                    : (!isConnected ? (logCfg.disconnectedLineAlpha ?? logCfg.lineAlpha) : logCfg.lineAlpha));
            graphics.fillStyle(parseColor(lColor), lAlpha);
            LogisticsRenderer.drawLogisticsCells(graphics, points, widthTiles, 1);
            const arrowRects = LogisticsRenderer.getLogisticsCellRects(points, widthTiles, true);

            if (arrowRects.length > 0) {
                const arrowColor = usePortToPortStyle
                    ? (logCfg.portToPortArrowColor || logCfg.arrowColor)
                    : (!isConnected ? (logCfg.disconnectedArrowColor || logCfg.disconnectedLineColor || "#9a9a9a") : logCfg.arrowColor);
                const arrowAlpha = usePortToPortStyle
                    ? (logCfg.portToPortArrowAlpha ?? 0.9)
                    : (!isConnected ? (logCfg.disconnectedArrowAlpha ?? 0.85) : 0.9);
                const arrowSize = usePortToPortStyle
                    ? (logCfg.portToPortArrowSize || logCfg.arrowSize || 8)
                    : (!isConnected ? (logCfg.disconnectedArrowSize || logCfg.arrowSize || 8) : (logCfg.arrowSize || 8));
                graphics.fillStyle(parseColor(arrowColor), arrowAlpha);
                arrowRects.forEach((rect) => {
                    const groupKey = line?.groupId || line?.id || null;
                    const rectCenterX = rect.x + rect.w / 2;
                    const rectCenterY = rect.y + rect.h / 2;
                    const stateOverride = (GameEngine.state.logisticsTurnArrowOverrides || []).find(item =>
                        item &&
                        (!item.groupId || !groupKey || item.groupId === groupKey) &&
                        (
                            item.cellKey === rect.cellKey ||
                            (
                                Number.isFinite(item.anchorX) &&
                                Number.isFinite(item.anchorY) &&
                                Math.hypot(rectCenterX - item.anchorX, rectCenterY - item.anchorY) <= GameEngine.TILE_SIZE * 0.75
                            )
                        )
                    ) || null;
                    const lineOverride = line?.turnArrowOverride || stateOverride;
                    const override = lineOverride && (
                        lineOverride.cellKey === rect.cellKey ||
                        (
                            Number.isFinite(lineOverride.anchorX) &&
                            Number.isFinite(lineOverride.anchorY) &&
                            Math.hypot(rectCenterX - lineOverride.anchorX, rectCenterY - lineOverride.anchorY) <= GameEngine.TILE_SIZE * 0.75
                        )
                    )
                        ? lineOverride
                        : null;
                    if (!override && skipArrowCellKeys?.has(rect.cellKey)) return;
                    const adx = override ? override.dirX : (rect.dirX !== undefined ? rect.dirX : 0);
                    const ady = override ? override.dirY : (rect.dirY !== undefined ? rect.dirY : 0);
                    const len = Math.hypot(adx, ady) || 1;
                    LogisticsRenderer.drawArrowhead(
                        graphics,
                        rectCenterX,
                        rectCenterY,
                        adx / len,
                        ady / len,
                        arrowSize
                    );
                });
            }
            if (isSelected && line) {
                drawSelectedLogisticsSegmentOutlineOnRoute(points, widthTiles, line);
            }
        };

        const drawConnectedCellOverlay = (points, widthTiles, connectedCellKeys, isPortToPort = true, skipArrowCellKeys = null) => {
            if (!connectedCellKeys || connectedCellKeys.size === 0) return;
            const rects = LogisticsRenderer.getLogisticsCellRects(points, widthTiles, true)
                .filter(rect => rect.cellKey && connectedCellKeys.has(rect.cellKey));
            const endpointRect = LogisticsRenderer.getLogisticsEndpointCellRect(points, widthTiles);
            if (
                endpointRect &&
                endpointRect.cellKey &&
                connectedCellKeys.has(endpointRect.cellKey) &&
                !rects.some(rect => rect.cellKey === endpointRect.cellKey)
            ) {
                rects.push(endpointRect);
            }
            if (rects.length === 0) return;
            const lineColor = isPortToPort
                ? (logCfg.portToPortLineColor || logCfg.lineColor)
                : logCfg.lineColor;
            const lineAlpha = isPortToPort
                ? (logCfg.portToPortLineAlpha ?? logCfg.lineAlpha)
                : logCfg.lineAlpha;
            graphics.fillStyle(parseColor(lineColor), lineAlpha);
            rects.forEach(rect => graphics.fillRect(rect.x, rect.y, rect.w, rect.h));

            const arrowColor = isPortToPort
                ? (logCfg.portToPortArrowColor || logCfg.arrowColor)
                : logCfg.arrowColor;
            const arrowAlpha = isPortToPort
                ? (logCfg.portToPortArrowAlpha ?? 0.9)
                : 0.9;
            const arrowSize = isPortToPort
                ? (logCfg.portToPortArrowSize || logCfg.arrowSize || 8)
                : (logCfg.arrowSize || 8);
            graphics.fillStyle(parseColor(arrowColor), arrowAlpha);
            rects.forEach((rect) => {
                if (skipArrowCellKeys?.has(rect.cellKey)) return;
                const adx = rect.dirX !== undefined ? rect.dirX : 0;
                const ady = rect.dirY !== undefined ? rect.dirY : 0;
                const len = Math.hypot(adx, ady) || 1;
                LogisticsRenderer.drawArrowhead(
                    graphics,
                    rect.x + rect.w / 2,
                    rect.y + rect.h / 2,
                    adx / len,
                    ady / len,
                    arrowSize
                );
            });
        };

        const getPointOnPathByDistance = (points, progress, startOffset = 0) => {
            if (!Array.isArray(points) || points.length < 2) return null;
            const clampedProgress = Math.max(0, Math.min(1, Number(progress) || 0));
            const lengths = [];
            let totalLength = 0;
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                const length = Math.hypot(b.x - a.x, b.y - a.y);
                lengths.push(length);
                totalLength += length;
            }
            if (totalLength <= 0) return { x: points[0].x, y: points[0].y };

            const safeStartOffset = Math.max(0, Math.min(Number(startOffset) || 0, totalLength * 0.45));
            let targetDistance = safeStartOffset + clampedProgress * (totalLength - safeStartOffset);
            for (let i = 0; i < lengths.length; i++) {
                const length = lengths[i];
                if (targetDistance <= length || i === lengths.length - 1) {
                    const a = points[i];
                    const b = points[i + 1];
                    const localProgress = length > 0 ? targetDistance / length : 0;
                    return {
                        x: a.x + (b.x - a.x) * localProgress,
                        y: a.y + (b.y - a.y) * localProgress
                    };
                }
                targetDistance -= length;
            }
            const last = points[points.length - 1];
            return { x: last.x, y: last.y };
        };

        const groupSegments = new Map();
        if (Array.isArray(state.logisticsLines)) {
            state.logisticsLines.forEach((line) => {
                if (!line) return;
                const groupKey = line.groupId || line.id;
                if (!groupSegments.has(groupKey)) groupSegments.set(groupKey, []);
                groupSegments.get(groupKey).push(line);
            });
        }

        const portToPortConnectedGroupIds = new Set();
        const portToPortConnectedCellKeysByGroup = new Map();
        const portToPortConnectedCellPathsByGroup = new Map();
        const portToPortConnectedCellPathKeysByGroup = new Map();
        const portToPortCandidateGroupIds = new Set();
        const makeNodeKey = (p) => `${Math.round(p.x)},${Math.round(p.y)}`;
        const getNodePoint = (key) => {
            const [x, y] = String(key).split(",").map(Number);
            return { x, y };
        };
        const getNearbyNodeKeys = (point, nodeKeys, maxSnap) => {
            if (!point || !Array.isArray(nodeKeys) || nodeKeys.length === 0) return [];
            const scored = [];
            for (const key of nodeKeys) {
                const np = getNodePoint(key);
                const d = Math.hypot(np.x - point.x, np.y - point.y);
                if (d <= maxSnap) scored.push({ key, d });
            }
            scored.sort((a, b) => a.d - b.d);
            return scored.slice(0, 8).map((s) => s.key);
        };
        const hasDirectedPath = (adj, startKey, endKey) => {
            if (!startKey || !endKey) return false;
            if (startKey === endKey) return false;
            const q = [startKey];
            const visited = new Set([startKey]);
            while (q.length > 0) {
                const cur = q.shift();
                const nexts = adj.get(cur);
                if (!nexts) continue;
                for (const next of nexts) {
                    if (next === endKey) return true;
                    if (visited.has(next)) continue;
                    visited.add(next);
                    q.push(next);
                }
            }
            return false;
        };
        const addConnectedCellKey = (groupKey, cellKey) => {
            if (!cellKey) return;
            if (!portToPortConnectedCellKeysByGroup.has(groupKey)) {
                portToPortConnectedCellKeysByGroup.set(groupKey, new Set());
            }
            portToPortConnectedCellKeysByGroup.get(groupKey).add(cellKey);
        };
        const addConnectedCellPath = (groupKey, path) => {
            if (!Array.isArray(path) || path.length === 0) return;
            if (!portToPortConnectedCellPathsByGroup.has(groupKey)) {
                portToPortConnectedCellPathsByGroup.set(groupKey, []);
            }
            if (!portToPortConnectedCellPathKeysByGroup.has(groupKey)) {
                portToPortConnectedCellPathKeysByGroup.set(groupKey, new Set());
            }
            const pathKey = path.join("|");
            if (portToPortConnectedCellPathKeysByGroup.get(groupKey).has(pathKey)) return;
            portToPortConnectedCellPathKeysByGroup.get(groupKey).add(pathKey);
            portToPortConnectedCellPathsByGroup.get(groupKey).push(path.slice());
            path.forEach((cellKey) => addConnectedCellKey(groupKey, cellKey));
        };
        const makePortKey = (port, index) => port
            ? `${port.dir || "port"}:${port.slotIndex ?? port.defIndex ?? index ?? 0}`
            : null;
        const canConnectPortOwners = (sourceOwners, targetOwners) => {
            return sourceOwners.some((sourceOwner) => targetOwners.some((targetOwner) =>
                sourceOwner.id !== targetOwner.id ||
                (!!sourceOwner.portKey && !!targetOwner.portKey && sourceOwner.portKey !== targetOwner.portKey)
            ));
        };

        groupSegments.forEach((segments, groupKey) => {
            if (!Array.isArray(segments) || segments.length === 0) return;

            const adj = new Map();
            const undirected = new Map();
            const cellAdj = new Map();
            const cellPointByKey = new Map();
            const incoming = new Set();
            const outDegree = new Map();
            const inDegree = new Map();
            const nodeKeySet = new Set();
            const cellKeySet = new Set();
            const addCellEdge = (a, b) => {
                if (!a || !b || a === b) return;
                if (!cellAdj.has(a)) cellAdj.set(a, new Set());
                if (!cellAdj.has(b)) cellAdj.set(b, new Set());
                cellAdj.get(a).add(b);
                cellAdj.get(b).add(a);
            };
            segments.forEach((seg) => {
                const pts = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
                if (pts.length < 2) return;
                const fromKey = makeNodeKey(pts[0]);
                const toKey = makeNodeKey(pts[1]);
                nodeKeySet.add(fromKey);
                nodeKeySet.add(toKey);
                if (!adj.has(fromKey)) adj.set(fromKey, new Set());
                adj.get(fromKey).add(toKey);
                if (!undirected.has(fromKey)) undirected.set(fromKey, new Set());
                if (!undirected.has(toKey)) undirected.set(toKey, new Set());
                undirected.get(fromKey).add(toKey);
                undirected.get(toKey).add(fromKey);
                incoming.add(toKey);
                outDegree.set(fromKey, (outDegree.get(fromKey) || 0) + 1);
                inDegree.set(toKey, (inDegree.get(toKey) || 0) + 1);

                const dx = pts[1].x - pts[0].x;
                const dy = pts[1].y - pts[0].y;
                const dist = Math.hypot(dx, dy);
                if (dist > 0.001) {
                    const dirX = dx / dist;
                    const dirY = dy / dist;
                    const steps = Math.max(1, Math.round(dist / GameEngine.TILE_SIZE));
                    const stepSize = dist / steps;
                    let prevCellKey = null;
                    for (let step = 0; step < steps; step++) {
                        const point = {
                            x: pts[0].x + dirX * stepSize * step,
                            y: pts[0].y + dirY * stepSize * step
                        };
                        const cellKey = makeNodeKey(point);
                        cellKeySet.add(cellKey);
                        cellPointByKey.set(cellKey, getNodePoint(cellKey));
                        if (!cellAdj.has(cellKey)) cellAdj.set(cellKey, new Set());
                        addCellEdge(prevCellKey, cellKey);
                        prevCellKey = cellKey;
                    }
                    const endCellKey = makeNodeKey(pts[1]);
                    cellKeySet.add(endCellKey);
                    cellPointByKey.set(endCellKey, getNodePoint(endCellKey));
                    if (!cellAdj.has(endCellKey)) cellAdj.set(endCellKey, new Set());
                    addCellEdge(prevCellKey, endCellKey);
                }
            });

            const nodeKeys = Array.from(nodeKeySet);
            if (nodeKeys.length === 0) return;
            const cellKeys = Array.from(cellKeySet);
            cellKeys.forEach((key) => {
                const p = cellPointByKey.get(key);
                if (!p) return;
                [
                    { x: p.x + GameEngine.TILE_SIZE, y: p.y },
                    { x: p.x - GameEngine.TILE_SIZE, y: p.y },
                    { x: p.x, y: p.y + GameEngine.TILE_SIZE },
                    { x: p.x, y: p.y - GameEngine.TILE_SIZE }
                ].forEach((next) => {
                    const nextKey = makeNodeKey(next);
                    if (cellKeySet.has(nextKey)) addCellEdge(key, nextKey);
                });
            });
            const representative = segments.find((seg) => seg && seg.sourceId && seg.targetId) || null;
            const sourceEnt = representative
                ? (state.mapEntities?.find((ent) => (ent.id || `${ent.type1}_${ent.x}_${ent.y}`) === representative.sourceId) || null)
                : null;
            const targetEnt = representative
                ? (state.mapEntities?.find((ent) => (ent.id || `${ent.type1}_${ent.x}_${ent.y}`) === representative.targetId) || null)
                : null;
            const representativePortsCanConnect = () => {
                if (!representative || !sourceEnt || !targetEnt) return true;
                const sourceId = sourceEnt.id || `${sourceEnt.type1}_${sourceEnt.x}_${sourceEnt.y}`;
                const targetId = targetEnt.id || `${targetEnt.type1}_${targetEnt.x}_${targetEnt.y}`;
                if (sourceId !== targetId) return true;
                const sourceKey = makePortKey(representative.sourcePort, representative.sourcePort?.slotIndex ?? representative.sourcePort?.defIndex ?? 0);
                const targetKey = makePortKey(representative.targetPort, representative.targetPort?.slotIndex ?? representative.targetPort?.defIndex ?? 0);
                return !!sourceKey && !!targetKey && sourceKey !== targetKey;
            };

            const terminalStarts = nodeKeys.filter((k) => (outDegree.get(k) || 0) > 0 && (inDegree.get(k) || 0) === 0);
            const terminalEnds = nodeKeys.filter((k) => (inDegree.get(k) || 0) > 0 && (outDegree.get(k) || 0) === 0);
            const fallbackStart = nodeKeys.filter((k) => (adj.get(k)?.size || 0) > 0);
            const fallbackEnd = nodeKeys.filter((k) => incoming.has(k));
            const startKeys = terminalStarts.length > 0 ? terminalStarts : fallbackStart;
            const endKeys = terminalEnds.length > 0 ? terminalEnds : fallbackEnd;

            const getPortOwnersNearNode = (nodeKey, wantOutput) => {
                if (!window.UIManager || typeof window.UIManager.getBuildingPortSlots !== 'function') return [];
                const nodePoint = getNodePoint(nodeKey);
                const maxSnap = GameEngine.TILE_SIZE * 1.1;
                const owners = [];
                (state.mapEntities || []).forEach((ent) => {
                    if (!ent || ent.isUnderConstruction) return;
                    const cfg = GameEngine.getEntityConfig(ent.type1) || {};
                    const logisticCfg = cfg.logistics || {};
                    if (wantOutput && !logisticCfg.canOutput) return;
                    if (!wantOutput && !logisticCfg.canInput) return;
                    const ports = window.UIManager.getBuildingPortSlots(ent);
                    if (!Array.isArray(ports) || ports.length === 0) return;
                    let best = Number.POSITIVE_INFINITY;
                    let bestPort = null;
                    let bestIndex = 0;
                    ports.forEach((port, index) => {
                        const d = Math.hypot(port.x - nodePoint.x, port.y - nodePoint.y);
                        if (d < best) {
                            best = d;
                            bestPort = port;
                            bestIndex = index;
                        }
                    });
                    if (best <= maxSnap) {
                        owners.push({
                            id: ent.id || `${ent.type1}_${ent.x}_${ent.y}`,
                            portKey: makePortKey(bestPort, bestIndex),
                            dist: best
                        });
                    }
                });
                owners.sort((a, b) => a.dist - b.dist);
                return owners;
            };

            let connected = false;
            portToPortCandidateGroupIds.add(groupKey);

            const hasUndirectedPath = (startKey, endKey) => {
                if (!startKey || !endKey) return false;
                if (startKey === endKey) return true;
                const q = [startKey];
                const visited = new Set([startKey]);
                while (q.length > 0) {
                    const cur = q.shift();
                    const nexts = undirected.get(cur);
                    if (!nexts) continue;
                    for (const next of nexts) {
                        if (next === endKey) return true;
                        if (visited.has(next)) continue;
                        visited.add(next);
                        q.push(next);
                    }
                }
                return false;
            };
            const hasCellPath = (startKey, endKey) => {
                if (!startKey || !endKey) return false;
                if (startKey === endKey) return true;
                const q = [startKey];
                const visited = new Set([startKey]);
                while (q.length > 0) {
                    const cur = q.shift();
                    const nexts = cellAdj.get(cur);
                    if (!nexts) continue;
                    for (const next of nexts) {
                        if (next === endKey) return true;
                        if (visited.has(next)) continue;
                        visited.add(next);
                        q.push(next);
                    }
                }
                return false;
            };
            const findCellPath = (startKey, endKey) => {
                if (!startKey || !endKey) return null;
                if (startKey === endKey) return [startKey];
                const q = [startKey];
                const visited = new Set([startKey]);
                const prev = new Map();
                while (q.length > 0) {
                    const cur = q.shift();
                    const nexts = cellAdj.get(cur);
                    if (!nexts) continue;
                    for (const next of nexts) {
                        if (visited.has(next)) continue;
                        visited.add(next);
                        prev.set(next, cur);
                        if (next === endKey) {
                            const path = [endKey];
                            let step = endKey;
                            while (prev.has(step)) {
                                step = prev.get(step);
                                path.push(step);
                            }
                            return path.reverse();
                        }
                        q.push(next);
                    }
                }
                return null;
            };
            const getNearbyCellKeys = (point, maxSnap) => {
                if (!point || cellKeys.length === 0) return [];
                const scored = [];
                cellKeys.forEach((key) => {
                    const cp = cellPointByKey.get(key);
                    if (!cp) return;
                    const d = Math.hypot(cp.x - point.x, cp.y - point.y);
                    if (d <= maxSnap) scored.push({ key, d });
                });
                scored.sort((a, b) => a.d - b.d);
                return scored.slice(0, 8).map((s) => s.key);
            };
            const getPortOwnersNearCell = (cellKey, wantOutput) => {
                if (!window.UIManager || typeof window.UIManager.getBuildingPortSlots !== 'function') return [];
                const cellPoint = cellPointByKey.get(cellKey) || getNodePoint(cellKey);
                const maxSnap = GameEngine.TILE_SIZE * 0.9;
                const owners = [];
                (state.mapEntities || []).forEach((ent) => {
                    if (!ent || ent.isUnderConstruction) return;
                    const cfg = GameEngine.getEntityConfig(ent.type1) || {};
                    const logisticCfg = cfg.logistics || {};
                    if (wantOutput && !logisticCfg.canOutput) return;
                    if (!wantOutput && !logisticCfg.canInput) return;
                    const ports = window.UIManager.getBuildingPortSlots(ent);
                    if (!Array.isArray(ports) || ports.length === 0) return;
                    let best = Number.POSITIVE_INFINITY;
                    let bestPort = null;
                    let bestIndex = 0;
                    ports.forEach((port, index) => {
                        const d = Math.hypot(port.x - cellPoint.x, port.y - cellPoint.y);
                        if (d < best) {
                            best = d;
                            bestPort = port;
                            bestIndex = index;
                        }
                    });
                    if (best <= maxSnap) {
                        owners.push({
                            id: ent.id || `${ent.type1}_${ent.x}_${ent.y}`,
                            portKey: makePortKey(bestPort, bestIndex),
                            dist: best
                        });
                    }
                });
                owners.sort((a, b) => a.dist - b.dist);
                return owners;
            };
            const isCellOnBuildingPort = (cellKey) => {
                if (!window.UIManager || typeof window.UIManager.getBuildingPortSlots !== 'function') return false;
                const cellPoint = cellPointByKey.get(cellKey) || getNodePoint(cellKey);
                const snap = GameEngine.TILE_SIZE * 0.6;
                return (state.mapEntities || []).some((ent) => {
                    if (!ent || ent.isUnderConstruction) return false;
                    const ports = window.UIManager.getBuildingPortSlots(ent);
                    if (!Array.isArray(ports)) return false;
                    return ports.some((port) => Math.hypot(port.x - cellPoint.x, port.y - cellPoint.y) <= snap);
                });
            };

            // First: explicit source/target ids if available.
            if (representative && sourceEnt && targetEnt && representativePortsCanConnect()) {
                const sourcePort = representative.sourcePort || null;
                const targetPort = representative.targetPort || null;
                const sourceSnap = sourcePort ? GameEngine.TILE_SIZE * 1.1 : GameEngine.TILE_SIZE * 2.5;
                const targetSnap = targetPort ? GameEngine.TILE_SIZE * 1.1 : GameEngine.TILE_SIZE * 2.5;
                const startKeysRaw = sourcePort
                    ? getNearbyNodeKeys(sourcePort, nodeKeys, sourceSnap)
                    : getNearbyNodeKeys({ x: sourceEnt.x, y: sourceEnt.y }, nodeKeys, sourceSnap);
                const endKeysRaw = targetPort
                    ? getNearbyNodeKeys(targetPort, nodeKeys, targetSnap)
                    : getNearbyNodeKeys({ x: targetEnt.x, y: targetEnt.y }, nodeKeys, targetSnap);
                const explicitStarts = startKeysRaw.filter((k) => (adj.get(k)?.size || 0) > 0);
                const explicitEnds = endKeysRaw.filter((k) => incoming.has(k));
                for (const sk of explicitStarts) {
                    if (connected) break;
                    for (const ek of explicitEnds) {
                        if (hasDirectedPath(adj, sk, ek)) {
                            connected = true;
                            break;
                        }
                    }
                }
            }

            // Second: infer from actual terminal-to-terminal port ownership (works for multi-step extensions).
            if (!connected && representative && sourceEnt && targetEnt && representativePortsCanConnect()) {
                const sourcePort = representative.sourcePort || null;
                const targetPort = representative.targetPort || null;
                const sourceSnap = sourcePort ? GameEngine.TILE_SIZE * 1.5 : GameEngine.TILE_SIZE * 2.5;
                const targetSnap = targetPort ? GameEngine.TILE_SIZE * 1.5 : GameEngine.TILE_SIZE * 2.5;
                const sourceCells = getNearbyCellKeys(sourcePort || { x: sourceEnt.x, y: sourceEnt.y }, sourceSnap);
                const targetCells = getNearbyCellKeys(targetPort || { x: targetEnt.x, y: targetEnt.y }, targetSnap);
                for (const sk of sourceCells) {
                    if (connected) break;
                    for (const ek of targetCells) {
                        if (hasCellPath(sk, ek)) {
                            connected = true;
                            break;
                        }
                    }
                }
            }

            // [修正] 只有有明確 sourceEnt & targetEnt 的群組才嘗試此 fallback，
            // 避免沒有起終點的分割後群組誤判為通路。
            if (!connected && representative && sourceEnt && targetEnt) {
                for (const sk of startKeys) {
                    if (connected) break;
                    const sourceOwners = getPortOwnersNearNode(sk, true);
                    if (sourceOwners.length === 0) continue;
                    for (const ek of endKeys) {
                        if (connected) break;
                        if (!hasDirectedPath(adj, sk, ek)) continue;
                        const targetOwners = getPortOwnersNearNode(ek, false);
                        if (targetOwners.length === 0) continue;
                        if (canConnectPortOwners(sourceOwners, targetOwners)) {
                            connected = true;
                            break;
                        }
                    }
                }
            }

            // Fallback: 對於多段延伸後方向資料混雜的路線，
            // 只要 source 端與 target 端在同一連通分量，就視為已接通。
            if (!connected && representative && sourceEnt && targetEnt && representativePortsCanConnect()) {
                const sourcePort = representative.sourcePort || null;
                const targetPort = representative.targetPort || null;
                const sourceSnap = sourcePort ? GameEngine.TILE_SIZE * 1.1 : GameEngine.TILE_SIZE * 2.5;
                const targetSnap = targetPort ? GameEngine.TILE_SIZE * 1.1 : GameEngine.TILE_SIZE * 2.5;
                const startKeysRaw = sourcePort
                    ? getNearbyNodeKeys(sourcePort, nodeKeys, sourceSnap)
                    : getNearbyNodeKeys({ x: sourceEnt.x, y: sourceEnt.y }, nodeKeys, sourceSnap);
                const endKeysRaw = targetPort
                    ? getNearbyNodeKeys(targetPort, nodeKeys, targetSnap)
                    : getNearbyNodeKeys({ x: targetEnt.x, y: targetEnt.y }, nodeKeys, targetSnap);
                for (const sk of startKeysRaw) {
                    if (connected) break;
                    for (const ek of endKeysRaw) {
                        if (hasUndirectedPath(sk, ek)) {
                            connected = true;
                            break;
                        }
                    }
                }
            }

            // Final fallback: 僅當群組擁有明確起終點實體時才執行，
            // 防止分割後的後半段（無 sourceId/targetId）靠近建築 port 而誤判為通路。
            if (!connected && representative && sourceEnt && targetEnt) {
                const outputStarts = [];
                const inputEnds = [];
                (startKeys.length > 0 ? startKeys : nodeKeys).forEach((k) => {
                    const outs = getPortOwnersNearNode(k, true);
                    if (outs.length > 0) outputStarts.push({ key: k, owners: outs });
                });
                (endKeys.length > 0 ? endKeys : nodeKeys).forEach((k) => {
                    const ins = getPortOwnersNearNode(k, false);
                    if (ins.length > 0) inputEnds.push({ key: k, owners: ins });
                });
                for (const s of outputStarts) {
                    if (connected) break;
                    for (const t of inputEnds) {
                        if (connected) break;
                        if (!hasUndirectedPath(s.key, t.key)) continue;
                        if (canConnectPortOwners(s.owners, t.owners)) {
                            connected = true;
                            break;
                        }
                    }
                }
            }

            {
                const outputCells = [];
                const inputCells = [];
                if (representative && sourceEnt && targetEnt) {
                    const sourceId = window.UIManager?.getEntityId
                        ? window.UIManager.getEntityId(sourceEnt)
                        : (sourceEnt.id || `${sourceEnt.type1}_${sourceEnt.x}_${sourceEnt.y}`);
                    const targetId = window.UIManager?.getEntityId
                        ? window.UIManager.getEntityId(targetEnt)
                        : (targetEnt.id || `${targetEnt.type1}_${targetEnt.x}_${targetEnt.y}`);
                    const sourcePort = representative.sourcePort || null;
                    const targetPort = representative.targetPort || null;
                    const groupEndpoints = [];
                    segments.forEach((seg) => {
                        const pts = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
                        if (pts[0]) groupEndpoints.push(pts[0]);
                        if (pts[pts.length - 1]) groupEndpoints.push(pts[pts.length - 1]);
                    });
                    const sourceCandidates = [
                        sourcePort,
                        ...(window.UIManager?.getBuildingPortSlots?.(sourceEnt) || []),
                        ...groupEndpoints,
                        { x: sourceEnt.x, y: sourceEnt.y }
                    ].filter(Boolean);
                    const targetCandidates = [
                        targetPort,
                        ...(window.UIManager?.getBuildingPortSlots?.(targetEnt) || []),
                        ...groupEndpoints,
                        { x: targetEnt.x, y: targetEnt.y }
                    ].filter(Boolean);
                    const collectOwnerCells = (candidates, wantOutput, ownerId, bucket) => {
                        const seen = new Set();
                        candidates.forEach((candidate) => {
                            getNearbyCellKeys(candidate, GameEngine.TILE_SIZE * 2.25).forEach((k) => {
                                if (seen.has(k)) return;
                                const owners = getPortOwnersNearCell(k, wantOutput).filter((owner) => owner.id === ownerId);
                                if (owners.length === 0) return;
                                seen.add(k);
                                bucket.push({ key: k, owners });
                            });
                        });
                    };
                    collectOwnerCells(sourceCandidates, true, sourceId, outputCells);
                    collectOwnerCells(targetCandidates, false, targetId, inputCells);
                    if (outputCells.length === 0) {
                        getNearbyCellKeys(sourcePort || { x: sourceEnt.x, y: sourceEnt.y }, GameEngine.TILE_SIZE * 3).forEach((k) => {
                            const owners = getPortOwnersNearCell(k, true).filter((owner) => owner.id === sourceId);
                            if (owners.length > 0) outputCells.push({ key: k, owners });
                        });
                    }
                    if (inputCells.length === 0) {
                        getNearbyCellKeys(targetPort || { x: targetEnt.x, y: targetEnt.y }, GameEngine.TILE_SIZE * 3).forEach((k) => {
                            const owners = getPortOwnersNearCell(k, false).filter((owner) => owner.id === targetId);
                            if (owners.length > 0) inputCells.push({ key: k, owners });
                        });
                    }
                } else {
                    // [核心修正 v2] 沒有明確起終點實體的群組（如分割後的後半段）
                    // 完全跳過 cell-level 掃描，直接不判定為通路，避免誤判。
                    // （不填充 outputCells / inputCells，後面的迴圈自然不會設定 connected = true）
                }
                for (const s of outputCells) {
                    for (const t of inputCells) {
                        const path = findCellPath(s.key, t.key);
                        if (!path) continue;
                        if (canConnectPortOwners(s.owners, t.owners)) {
                            addConnectedCellPath(groupKey, path);
                            connected = true;
                        }
                    }
                }
            }

            if (connected) portToPortConnectedGroupIds.add(groupKey);
        });

        const groupTurnCellKeys = new Map();
        groupSegments.forEach((groupSegs, groupKey) => {
            groupTurnCellKeys.set(groupKey, LogisticsRenderer.getLogisticsGroupTurnCellKeys(groupSegs));
        });
        const hasLogisticsTransportFilter = (groupKey, groupSegs) => {
            if (Array.isArray(groupSegs) && groupSegs.some(line => !!line?.filter)) return true;
            return (state.mapEntities || []).some(ent =>
                Array.isArray(ent?.outputTargets) &&
                ent.outputTargets.some(conn => !!conn?.filter && conn.lineId === groupKey)
            );
        };
        const getPathTurnCellKeys = (paths) => {
            const keys = new Set();
            const pointOfKey = (key) => {
                const [x, y] = String(key).split(",").map(Number);
                return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
            };
            (paths || []).forEach((path) => {
                if (!Array.isArray(path) || path.length < 3) return;
                for (let i = 1; i < path.length - 1; i++) {
                    const prev = pointOfKey(path[i - 1]);
                    const curr = pointOfKey(path[i]);
                    const next = pointOfKey(path[i + 1]);
                    const inDir = LogisticsRenderer.getCardinalDir(prev, curr);
                    const outDir = LogisticsRenderer.getCardinalDir(curr, next);
                    if (LogisticsRenderer.getTurnArrowDirection(inDir, outDir)) keys.add(path[i]);
                }
            });
            return keys;
        };

        const drawnCanonicalGroups = new Set();
        if (Array.isArray(state.logisticsLines)) {
            groupSegments.forEach((groupSegs, groupKey) => {
                if (!Array.isArray(groupSegs) || groupSegs.length === 0) return;

                const representative = groupSegs.find(line => line && (line.sourceId || line.targetId)) || groupSegs[0];
                const widthTiles = Math.max(1, Number(representative?.routeWidth) || 1);
                const segmentRoutes = groupSegs
                    .map(line => ({
                        line,
                        route: conveyorSystem && typeof conveyorSystem.getLogisticsLineRoute === 'function'
                            ? conveyorSystem.getLogisticsLineRoute(line)
                            : null
                    }))
                    .filter(item => item.route?.points?.length >= 2);
                if (segmentRoutes.length === 0) return;

                const isPortToPortCandidate = portToPortCandidateGroupIds.has(groupKey) || !!(representative?.sourceId && representative?.targetId);
                const hasTransportFilter = hasLogisticsTransportFilter(groupKey, groupSegs);
                // [核心修復] 嚴格要求物流線必須連接起點與終點才算 "接通" (物理連通)
                // 移除 `hasTransportFilter` 的 fallback，避免斷頭/斷尾但帶有 filter 的路線錯誤顯示亮色
                const isPhysicallyConnected = portToPortConnectedGroupIds.has(groupKey);
                const isOperating = isPhysicallyConnected && hasTransportFilter;
                const isConnected = isPhysicallyConnected || isOperating;
                const connectedCellKeys = portToPortConnectedCellKeysByGroup.get(groupKey) || new Set();
                const connectedCellPaths = portToPortConnectedCellPathsByGroup.get(groupKey) || [];
                const pathTurnCellKeys = getPathTurnCellKeys(connectedCellPaths);
                const turnCellKeys = pathTurnCellKeys.size > 0
                    ? pathTurnCellKeys
                    : (groupTurnCellKeys.get(groupKey) || null);
                const useConnectedIdleStyle = isPhysicallyConnected && !isOperating;

                segmentRoutes.forEach(({ line, route }) => {
                    // [核心修正] 單擊時僅高亮被點擊的那一段，而不是用 some 讓整個群組都高亮
                    const isLineSelected = conveyorSystem && typeof conveyorSystem.isSelectedLogisticsLine === 'function'
                        ? conveyorSystem.isSelectedLogisticsLine(line)
                        : state.selectedLogisticsLineId === line.id;
                    drawLogisticsRoute(route.points, route.width || widthTiles, isLineSelected, isConnected, line, useConnectedIdleStyle, turnCellKeys);
                });
                if (isPortToPortCandidate && isPhysicallyConnected) {
                    segmentRoutes.forEach(({ route }) => {
                        drawConnectedCellOverlay(route.points, route.width || widthTiles, connectedCellKeys, useConnectedIdleStyle, turnCellKeys);
                    });
                }
                {
                    const arrowColor = isOperating
                        ? parseColor(logCfg.arrowColor || "#00ffee")
                        : (isPhysicallyConnected
                            ? parseColor(logCfg.portToPortArrowColor || logCfg.arrowColor || "#98f8b5")
                            : parseColor(logCfg.disconnectedArrowColor || logCfg.disconnectedLineColor || "#9a9a9a"));
                    const arrowAlpha = isOperating
                        ? 0.9
                        : (isPhysicallyConnected
                            ? (logCfg.portToPortArrowAlpha ?? 0.95)
                            : (logCfg.disconnectedArrowAlpha ?? 0.85));
                    const arrowSize = isOperating
                        ? (logCfg.arrowSize || 10)
                        : (isPhysicallyConnected
                            ? (logCfg.portToPortArrowSize || logCfg.arrowSize || 10)
                            : (logCfg.disconnectedArrowSize || logCfg.arrowSize || 10));
                    if (isPhysicallyConnected && connectedCellPaths.length > 0) {
                        connectedCellPaths.forEach((path) => {
                            LogisticsRenderer.drawLogisticsPathTurnArrows(graphics, path, arrowColor, arrowAlpha, arrowSize);
                        });
                    } else {
                        LogisticsRenderer.drawLogisticsGroupTurnArrows(graphics, groupSegs, widthTiles, arrowColor, arrowAlpha, arrowSize);
                    }
                }
                const isGroupSelected = conveyorSystem && typeof conveyorSystem.isSelectedLogisticsLine === 'function'
                    ? groupSegs.some(line => conveyorSystem.isSelectedLogisticsLine(line))
                    : groupSegs.some(line => state.selectedLogisticsLineId === line.id);

                if (isGroupSelected) {
                    // [核心修正] 移除原先的 segmentRoutes.forEach 繪製紅色方框，因為這會導致單擊也顯示整條方框。
                    // 紅色方框繪製已經被移至 drawLogisticsRoute 內部 (只針對被選中的單獨 line 繪製)。

                    // 顯示格子順序數字 (群組內有任何線段被選中時就顯示整個群組的編號)
                    if (!scene.logisticsNumberTexts) scene.logisticsNumberTexts = new Map();
                    if (!scene.logisticsVisibleTextIds) scene.logisticsVisibleTextIds = new Set();
                    
                    // ── 純整數半格座標 Map + 有向鏈式排序（O(n)，支援 8 方向，零浮點） ──
                    // startGx/startGy：segment 起點的半格整數座標（優先讀 seg.startGx）
                    // endGx/endGy    ：segment 終點的半格整數座標（優先讀 seg.endGx）
                    // 舊資料若無這些欄位，從 routePoints 計算（向下相容）

                    const sortedSegs = [];
                    const remaining  = [...groupSegs];

                    // 取出 startAnchor（用來確認鏈的方向是否需要翻轉）
                    const _canonicalSourceId = representative?.sourceId || null;
                    const _sourceEnt = _canonicalSourceId
                        ? (state.mapEntities || []).find(e => e && (e.id === _canonicalSourceId || `${e.type1}_${e.x}_${e.y}` === _canonicalSourceId))
                        : null;
                    let startAnchor = null;
                    if (representative?.sourcePort && Number.isFinite(representative.sourcePort.x)) {
                        startAnchor = representative.sourcePort;
                    } else if (_sourceEnt) {
                        startAnchor = { x: _sourceEnt.x, y: _sourceEnt.y };
                    }

                    const _align = (GameEngine.TILE_SIZE || 64) / 2;
                    const _getGCoords = (seg) => {
                        if (Number.isFinite(seg?.startGx) && Number.isFinite(seg?.startGy) &&
                            Number.isFinite(seg?.endGx)   && Number.isFinite(seg?.endGy)) {
                            return { startGx: seg.startGx, startGy: seg.startGy, endGx: seg.endGx, endGy: seg.endGy };
                        }
                        const s = seg?.routePoints?.[0] || { x: seg?.x || 0, y: seg?.y || 0 };
                        const e = seg?.routePoints?.[seg?.routePoints?.length - 1] || s;
                        return {
                            startGx: Math.round(s.x / _align), startGy: Math.round(s.y / _align),
                            endGx:   Math.round(e.x / _align), endGy:   Math.round(e.y / _align)
                        };
                    };
                    const _gKey = (gx, gy) => `${gx},${gy}`;

                    // 建立 startMap 與 endKeySet（整數格座標，無浮點問題）
                    // _endKeySet 擴展至 ±2 鄰居以容納轉彎 2 格半格座標偏差，排除自身起點
                    const _startMap  = new Map();
                    const _endKeySet = new Set();
                    remaining.forEach(seg => {
                        const { startGx, startGy, endGx, endGy } = _getGCoords(seg);
                        _startMap.set(_gKey(startGx, startGy), seg);
                        for (let dx = -2; dx <= 2; dx++) {
                            for (let dy = -2; dy <= 2; dy++) {
                                const gx = endGx + dx;
                                const gy = endGy + dy;
                                if (gx === startGx && gy === startGy) continue;
                                _endKeySet.add(_gKey(gx, gy));
                            }
                        }
                    });

                    // 找真正起點：起點格座標不在任何人的終點範圍集合裡
                    let _startSeg = remaining.find(seg => {
                        const { startGx, startGy } = _getGCoords(seg);
                        return !_endKeySet.has(_gKey(startGx, startGy));
                    });
                    // 環形/資料異常 fallback
                    if (!_startSeg) {
                        _startSeg = [...remaining].sort((a, b) =>
                            (Number.isFinite(a?.splitSequenceOrder) ? a.splitSequenceOrder : (a.order || 0)) -
                            (Number.isFinite(b?.splitSequenceOrder) ? b.splitSequenceOrder : (b.order || 0))
                        )[0];
                    }

                    // O(n) 有向鏈式走完整條線（精準 + ±2 容差）
                    const _remaining = new Set(remaining);
                    let _cur = _startSeg;
                    while (_cur && _remaining.has(_cur)) {
                        sortedSegs.push(_cur);
                        _remaining.delete(_cur);
                        const { endGx, endGy } = _getGCoords(_cur);
                        // 先嘗試精準匹配，再嘗試 ±2 容差（支援轉角半格格點連接，按距離優先搜尋）
                        let _next = _startMap.get(_gKey(endGx, endGy));
                        if (!_next || !_remaining.has(_next)) {
                            const offsets = [
                                // Dist 1
                                [-1, 0], [1, 0], [0, -1], [0, 1],
                                // Dist 1.41
                                [-1, -1], [-1, 1], [1, -1], [1, 1],
                                // Dist 2
                                [-2, 0], [2, 0], [0, -2], [0, 2],
                                // Dist 2.24
                                [-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2],
                                // Dist 2.83
                                [-2, -2], [-2, 2], [2, -2], [2, 2]
                            ];
                            for (const [dx, dy] of offsets) {
                                const c = _startMap.get(_gKey(endGx + dx, endGy + dy));
                                if (c && _remaining.has(c)) { _next = c; break; }
                            }
                        }
                        _cur = (_next && _remaining.has(_next)) ? _next : null;
                    }
                    // 斷鏈時：最近鄰居接力（不用 order 排序），確保路線方向連貫
                    while (_remaining.size > 0) {
                        const { endGx: _lEx, endGy: _lEy } = _getGCoords(sortedSegs[sortedSegs.length - 1]);
                        let _best = null, _bestD = Infinity;
                        for (const s of _remaining) {
                            const { startGx: sx, startGy: sy } = _getGCoords(s);
                            const d = Math.abs(sx - _lEx) + Math.abs(sy - _lEy);
                            if (d < _bestD) { _bestD = d; _best = s; }
                        }
                        if (!_best) break;
                        let _c2 = _best;
                        while (_c2 && _remaining.has(_c2)) {
                            sortedSegs.push(_c2);
                            _remaining.delete(_c2);
                            const { endGx: ex2, endGy: ey2 } = _getGCoords(_c2);
                            let _n2 = _startMap.get(_gKey(ex2, ey2));
                            if (!_n2 || !_remaining.has(_n2)) {
                                for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1],[-2,0],[2,0],[0,-2],[0,2]]) {
                                    const cc = _startMap.get(_gKey(ex2+dx, ey2+dy));
                                    if (cc && _remaining.has(cc)) { _n2 = cc; break; }
                                }
                            }
                            _c2 = (_n2 && _remaining.has(_n2)) ? _n2 : null;
                        }
                    }


                    // 若整條鏈的方向與 startAnchor 相反，翻轉
                    if (startAnchor && sortedSegs.length > 1) {
                        const firstGC = _getGCoords(sortedSegs[0]);
                        const lastGC  = _getGCoords(sortedSegs[sortedSegs.length - 1]);
                        const firstPx = { x: firstGC.startGx * _align, y: firstGC.startGy * _align };
                        const lastPx  = { x: lastGC.startGx  * _align, y: lastGC.startGy  * _align };
                        const fd = Math.hypot(firstPx.x - startAnchor.x, firstPx.y - startAnchor.y);
                        const ld = Math.hypot(lastPx.x  - startAnchor.x, lastPx.y  - startAnchor.y);
                        if (ld < fd) sortedSegs.reverse();
                    }

                    // 為每個 segment 標記顯示座標（起點格的像素位置）
                    sortedSegs.forEach(seg => {
                        const gc = _getGCoords(seg);
                        seg.__numberLabelPoint = { x: gc.startGx * _align, y: gc.startGy * _align };
                        seg.__numberNextPoint  = { x: gc.endGx   * _align, y: gc.endGy   * _align };
                    });

                    sortedSegs.forEach((seg, index) => {
                        seg.order = index;
                        const sp = seg.__numberLabelPoint || seg.routePoints?.[0] || { x: seg.x, y: seg.y };
                        const cx = sp.x;
                        const cy = sp.y;

                        const textKey = seg.id || `${seg.x},${seg.y}`;
                        let txt = scene.logisticsNumberTexts.get(textKey);
                        if (!txt) {
                            txt = scene.add.text(cx, cy, String(index), {
                                fontSize: '16px',
                                color: '#ffff00',
                                stroke: '#000000',
                                strokeThickness: 3
                            }).setOrigin(0.5).setDepth(600000);
                            scene.logisticsNumberTexts.set(textKey, txt);
                        } else {
                            txt.setText(String(index));
                            txt.setPosition(cx, cy);
                            txt.setVisible(true);
                        }
                        scene.logisticsVisibleTextIds.add(textKey);
                    });
                }
                drawnCanonicalGroups.add(groupKey);
            });
        }
        
        // 隱藏未使用的文字 (移出 if 區塊，確保即使所有線段被刪除也能正確隱藏)
        if (scene.logisticsNumberTexts) {
            scene.logisticsNumberTexts.forEach((txt, key) => {
                if (!scene.logisticsVisibleTextIds || !scene.logisticsVisibleTextIds.has(key)) {
                    txt.setVisible(false);
                }
            });
            if (scene.logisticsVisibleTextIds) scene.logisticsVisibleTextIds.clear();
        }

        // 用整個群組拓撲畫轉角箭頭，避免單段 route（通常只有兩點）看不到轉彎。
        const drawnTurnGroups = new Set();
        groupSegments.forEach((groupSegs, groupKey) => {
            if (!Array.isArray(groupSegs) || groupSegs.length === 0) return;
            if (drawnTurnGroups.has(groupKey)) return;
            if (drawnCanonicalGroups.has(groupKey)) return;
            const sample = groupSegs[0] || {};
            const widthTiles = Math.max(1, Number(sample.routeWidth) || 1);
            const connected = portToPortConnectedGroupIds.has(groupKey) && hasLogisticsTransportFilter(groupKey, groupSegs);
            const connectedCellPaths = portToPortConnectedCellPathsByGroup.get(groupKey) || [];
            const color = connected
                ? parseColor(logCfg.portToPortArrowColor || logCfg.arrowColor || "#00ffee")
                : parseColor(logCfg.disconnectedArrowColor || logCfg.disconnectedLineColor || "#9a9a9a");
            const alpha = connected
                ? (logCfg.portToPortArrowAlpha ?? 0.95)
                : (logCfg.disconnectedArrowAlpha ?? 0.85);
            const size = connected
                ? (logCfg.portToPortArrowSize || logCfg.arrowSize || 10)
                : (logCfg.disconnectedArrowSize || logCfg.arrowSize || 10);
            if (connected) {
                const disconnectedColor = parseColor(logCfg.disconnectedArrowColor || logCfg.disconnectedLineColor || "#9a9a9a");
                const disconnectedAlpha = logCfg.disconnectedArrowAlpha ?? 0.85;
                const disconnectedSize = logCfg.disconnectedArrowSize || logCfg.arrowSize || 10;
                LogisticsRenderer.drawLogisticsGroupTurnArrows(graphics, groupSegs, widthTiles, disconnectedColor, disconnectedAlpha, disconnectedSize);
                connectedCellPaths.forEach((path) => {
                    LogisticsRenderer.drawLogisticsPathTurnArrows(graphics, path, color, alpha, size);
                });
            } else {
                LogisticsRenderer.drawLogisticsGroupTurnArrows(graphics, groupSegs, widthTiles, color, alpha, size);
            }
            drawnTurnGroups.add(groupKey);
        });

        // 1. 建立冗餘連線地圖 (同時支援 ID 與座標查詢)
        if (state.mapEntities) {
            state.mapEntities.forEach(ent => {
                if (ent.outputTargets && ent.outputTargets.length > 0) {
                    ent.outputTargets.forEach(conn => {
                        if (conn.lineId) return;
                        const target = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === conn.id);
                        if (target) {
                            const route = (conveyorSystem && typeof conveyorSystem.getConnectionRoute === 'function')
                                ? conveyorSystem.getConnectionRoute(ent, target, conn)
                                : null;
                            const points = route && Array.isArray(route.points) && route.points.length >= 2
                                ? route.points
                                : [{ x: ent.x, y: ent.y }, { x: target.x, y: target.y }];
                            const isSelected = (window.UIManager.activeLogisticsConnection &&
                                window.UIManager.activeLogisticsConnection.source === ent &&
                                window.UIManager.activeLogisticsConnection.targetId === conn.id);
                            const isPortToPort = !!conn.id;
                            drawLogisticsRoute(points, route && route.width ? route.width : 1, isSelected, !!conn.filter, null, isPortToPort);
                        }
                    });
                }
            });
        }
        if (state.logisticsDragLine) {
            const dragPoints = Array.isArray(state.logisticsDragLine.points) && state.logisticsDragLine.points.length >= 2
                ? state.logisticsDragLine.points
                : [
                    { x: state.logisticsDragLine.startX, y: state.logisticsDragLine.startY },
                    { x: state.logisticsDragLine.endX, y: state.logisticsDragLine.endY }
                ];
            const dragColor = parseColor(logCfg.dragLineColor);
            const dragWidthTiles = Math.max(1, Number(state.logisticsDragLine.lineWidth) || 1);
            const dragThickness = Math.max(
                logCfg.dragLineThickness || logCfg.lineThickness || 3,
                dragWidthTiles * GameEngine.TILE_SIZE * 0.8
            );

            graphics.lineStyle(dragThickness, dragColor, logCfg.dragLineAlpha);
            LogisticsRenderer.strokePolyline(graphics, dragPoints);
        }

        // [New] Conveyor Ghost Rendering
        if (Array.isArray(state.conveyorGhosts) && state.conveyorGhosts.length > 0) {
            const TS = GameEngine.TILE_SIZE;
            const offset = state.mapOffset || { x: 0, y: 0 };
            const isValid = state.conveyorValid;

            const buildCfg = UI_CONFIG.ConveyorBuild || {};
            const ghostColor = isValid ? (buildCfg.ghostValidColor ?? 0x00ff00) : (buildCfg.ghostInvalidColor ?? 0xff0000);
            const ghostAlpha = buildCfg.ghostAlpha ?? 0.5;

            graphics.fillStyle(ghostColor, ghostAlpha);
            graphics.lineStyle(2, ghostColor, 0.8);

            const alignUnit = Math.max(0.5, Math.min(1, Number(buildCfg.alignmentUnit) || 0.5));
            const gridUnit = TS * alignUnit;
            const offsetScale = TS / gridUnit;
            const routeWidth = Math.max(1, Math.round(Number(state.conveyorRouteWidth) || 1));
            const previewSegments = [];
            const pushPreviewSegment = (start, next, targetEnd) => {
                if (!start || !next) return;
                const dirX = Math.sign(next.x - start.x);
                const dirY = Math.sign(next.y - start.y);
                const canUseTargetEnd = targetEnd &&
                    Math.sign(targetEnd.x - next.x) === dirX &&
                    Math.sign(targetEnd.y - next.y) === dirY;
                let end = canUseTargetEnd ? targetEnd : next;
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                if (Math.hypot(dx, dy) < offsetScale - 0.001) {
                    end = {
                        x: start.x + dirX * offsetScale,
                        y: start.y + dirY * offsetScale
                    };
                }
                if (start.x === end.x && start.y === end.y) return;
                previewSegments.push({
                    x: (start.x + end.x) / 2,
                    y: (start.y + end.y) / 2,
                    dirOut: {
                        x: Math.sign(end.x - start.x),
                        y: Math.sign(end.y - start.y)
                    },
                    isMerger: !!(targetEnd && targetEnd.isMerger)
                });
            };

            for (let i = 0; i < state.conveyorGhosts.length - 1; i += offsetScale) {
                pushPreviewSegment(
                    state.conveyorGhosts[i],
                    state.conveyorGhosts[Math.min(i + 1, state.conveyorGhosts.length - 1)],
                    state.conveyorGhosts[Math.min(i + offsetScale, state.conveyorGhosts.length - 1)]
                );
            }

            const rawGhostPoints = state.conveyorGhosts.map(point => ({
                x: (point.x + offset.x * offsetScale) * gridUnit,
                y: (point.y + offset.y * offsetScale) * gridUnit,
                isPortConnector: point.isPortConnector
            }));
            let ghostPoints = rawGhostPoints;
            if (conveyorSystem && typeof conveyorSystem.buildGridRoutePoints === 'function' && typeof conveyorSystem.buildLogisticsSegments === 'function') {
                const gridPoints = conveyorSystem.buildGridRoutePoints(rawGhostPoints);
                const segments = conveyorSystem.buildLogisticsSegments(
                    '__preview__',
                    null,
                    null,
                    null,
                    gridPoints,
                    routeWidth,
                    null,
                    null,
                    null
                );
                const routePoints = [];
                segments.forEach((segment, index) => {
                    const segPoints = Array.isArray(segment.routePoints) ? segment.routePoints : [];
                    if (segPoints.length < 2) return;
                    if (index === 0) routePoints.push({ x: segPoints[0].x, y: segPoints[0].y });
                    routePoints.push({ x: segPoints[1].x, y: segPoints[1].y });
                });
                if (routePoints.length >= 2) ghostPoints = routePoints;
            }
            LogisticsRenderer.drawLogisticsCells(graphics, ghostPoints, routeWidth, 1);
            const ghostArrowRects = LogisticsRenderer.getLogisticsCellRects(ghostPoints, routeWidth, true);
            if (ghostArrowRects.length > 0) {
                graphics.fillStyle(ghostColor, 0.85);
                ghostArrowRects.forEach((rect) => {
                    const adx = rect.dirX !== undefined ? rect.dirX : 0;
                    const ady = rect.dirY !== undefined ? rect.dirY : 0;
                    const len = Math.hypot(adx, ady) || 1;
                    LogisticsRenderer.drawArrowhead(
                        graphics,
                        rect.x + rect.w / 2,
                        rect.y + rect.h / 2,
                        adx / len,
                        ady / len,
                        5
                    );
                });
            }

            previewSegments.forEach((ghost, ghostIndex) => {
                const wx = (ghost.x + offset.x * offsetScale) * gridUnit;
                const wy = (ghost.y + offset.y * offsetScale) * gridUnit;

                // Special marker for mergers
                if (ghost.isMerger) {
                    graphics.lineStyle(3, 0xffff00, 1);
                    graphics.strokeCircle(wx, wy, TS / 3);
                    graphics.lineStyle(2, ghostColor, 0.8);
                }
            });
        }

        // 繪製自動傳輸線上的動態物品
        if (options.drawTransfers !== false && state.activeTransfers && state.activeTransfers.length > 0) {
            state.activeTransfers.forEach(t => {
                const source = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === t.sourceId);
                const target = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === t.targetId);

                if (source && target) {
                    // 1. 取得完整且連續的幾何路由路徑
                    const outputTargets = Array.isArray(source.outputTargets) ? source.outputTargets : [];
                    const conn = outputTargets.find(c => c.id === t.targetId);
                    const routeInfo = (conveyorSystem && typeof conveyorSystem.getConnectionTransferRoute === 'function')
                        ? conveyorSystem.getConnectionTransferRoute(source, target, conn)
                        : { points: [{ x: source.x, y: source.y }, { x: target.x, y: target.y }] };

                    const points = routeInfo.points;

                    // 2. 計算多邊形總長度
                    let totalLength = 0;
                    const segments = [];
                    for (let i = 0; i < points.length - 1; i++) {
                        const d = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
                        segments.push({ start: points[i], end: points[i + 1], dist: d });
                        totalLength += d;
                    }

                    // 3. 根據 progress 尋找目前所在的線段與座標
                    let targetDist = totalLength * t.progress;
                    let currentX = source.x;
                    let currentY = source.y;

                    for (const seg of segments) {
                        if (targetDist <= seg.dist) {
                            const ratio = seg.dist === 0 ? 0 : (targetDist / seg.dist);
                            currentX = seg.start.x + (seg.end.x - seg.start.x) * ratio;
                            currentY = seg.start.y + (seg.end.y - seg.start.y) * ratio;
                            break;
                        }
                        targetDist -= seg.dist;
                    }

                    // 防止超出邊界
                    if (t.progress >= 1) {
                        currentX = target.x; currentY = target.y;
                    }

                    // 4. 繪製小箱子
                    const color = (scene && typeof scene.getResourceIconColor === 'function')
                        ? scene.getResourceIconColor(t.itemType) : 0xffffff;

                    graphics.fillStyle(0x1a1a1a, 0.95);
                    graphics.fillRect(currentX - 8, currentY - 8, 16, 16);
                    graphics.lineStyle(2, color, 1);
                    graphics.strokeRect(currentX - 8, currentY - 8, 16, 16);
                }
            });
        }
    }

    static drawArrowhead(g, x, y, ux, uy, size) {
        // ux, uy 是單位方向向量
        const px = -uy * (size * 0.6); // 垂直方向偏移
        const py = ux * (size * 0.6);

        g.beginPath();
        g.moveTo(x + ux * size, y + uy * size); // 頂點
        g.lineTo(x - ux * size * 0.5 + px, y - uy * size * 0.5 + py); // 底角 1
        g.lineTo(x - ux * size * 0.5 - px, y - uy * size * 0.5 - py); // 底角 2
        g.closePath();
        g.fillPath();
    }

    static getCardinalDir(from, to) {
        if (!from || !to) return null;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
        if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx) || 1, y: 0 };
        return { x: 0, y: Math.sign(dy) || 1 };
    }

    static drawLogisticsTurnArrows(g, points, widthTiles, color, alpha, size) {
        if (!Array.isArray(points) || points.length < 3) return;
        const TS = GameEngine.TILE_SIZE;
        const shaft = Math.max(4, Math.min(TS * 0.55, size * 1.1));
        const halfLeg = Math.max(size * 0.7, TS * 0.28);
        const lineWidth = Math.max(2, Math.min(TS * 0.35, Math.max(3, widthTiles * TS * 0.22)));
        g.lineStyle(lineWidth, color, alpha);
        g.fillStyle(color, alpha);

        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];
            const inDir = LogisticsRenderer.getCardinalDir(prev, curr);
            const outDir = LogisticsRenderer.getCardinalDir(curr, next);
            if (!inDir || !outDir) continue;
            const isTurn = inDir.x !== outDir.x || inDir.y !== outDir.y;
            if (!isTurn) continue;

            const startX = curr.x - inDir.x * halfLeg;
            const startY = curr.y - inDir.y * halfLeg;
            const endX = curr.x + outDir.x * halfLeg;
            const endY = curr.y + outDir.y * halfLeg;

            g.beginPath();
            g.moveTo(startX, startY);
            g.lineTo(curr.x, curr.y);
            g.lineTo(endX, endY);
            g.strokePath();

            LogisticsRenderer.drawArrowhead(g, endX, endY, outDir.x, outDir.y, shaft);
        }
    }

    static renderTransfers(graphics, state, scene) {
        graphics.clear();
        if (!state || !Array.isArray(state.activeTransfers) || state.activeTransfers.length === 0) return;

        state.activeTransfers.forEach(t => {
            const source = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === t.sourceId);
            const target = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === t.targetId);
            if (!source || !target) return;

            const directConn = Array.isArray(source.outputTargets)
                ? source.outputTargets.find(conn => conn && conn.id === t.targetId)
                : null;
            const routePoints = LogisticsRenderer.normalizeTransferRoutePoints(
                source,
                target,
                LogisticsRenderer.resolveTransferRoutePoints(source, target, directConn, t)
            );

            if (directConn?.lineId && (!Array.isArray(routePoints) || routePoints.length < 2)) return;

            let px, py;
            if (Array.isArray(routePoints) && routePoints.length >= 2) {
                const pathPoint = LogisticsRenderer.getPointOnTransferPath(routePoints, t.progress, GameEngine.TILE_SIZE * 0.5);
                if (!pathPoint) return;
                px = pathPoint.x;
                py = pathPoint.y;
            } else {
                px = source.x + (target.x - source.x) * t.progress;
                py = source.y + (target.y - source.y) * t.progress;
            }
            LogisticsRenderer.logTransferRenderDebug(graphics, state, scene, source, target, routePoints, t, px, py);

            const color = (scene && typeof scene.getResourceIconColor === 'function')
                ? scene.getResourceIconColor(t.itemType)
                : 0xffffff;

            graphics.fillStyle(0x222222, 1);
            graphics.fillRect(px - 10, py - 10, 20, 20);
            graphics.lineStyle(3, color, 1);
            graphics.strokeRect(px - 10, py - 10, 20, 20);
            graphics.fillStyle(color, 0.8);
            graphics.fillRect(px - 4, py - 4, 8, 8);
        });
    }

    static resolveTransferRoutePoints(source, target, directConn, transfer) {
        let routePoints = Array.isArray(transfer.routePoints) && transfer.routePoints.length >= 2
            ? transfer.routePoints.map(p => ({ x: p.x, y: p.y }))
            : null;
        if (!directConn) return routePoints;

        const transferRoute = (conveyorSystem && typeof conveyorSystem.getConnectionTransferRoute === 'function')
            ? conveyorSystem.getConnectionTransferRoute(source, target, directConn)
            : null;
        return routePoints || (transferRoute && Array.isArray(transferRoute.points) && transferRoute.points.length >= 2
            ? transferRoute.points.map(p => ({ x: p.x, y: p.y }))
            : (!directConn.lineId && Array.isArray(directConn.routePoints) && directConn.routePoints.length >= 2
                ? directConn.routePoints.map(p => ({ x: p.x, y: p.y }))
                : null));
    }

    static normalizeTransferRoutePoints(source, target, routePoints) {
        if (!Array.isArray(routePoints) || routePoints.length < 2) return routePoints;
        const points = [];
        routePoints.forEach(point => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            const last = points[points.length - 1];
            if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.5) {
                points.push({ x: point.x, y: point.y });
            }
        });
        if (points.length < 2 || !source || !target) return points;

        const distance = (entity, point) => Math.hypot((entity.x || 0) - point.x, (entity.y || 0) - point.y);
        const first = points[0];
        const last = points[points.length - 1];
        const directScore = distance(source, first) + distance(target, last);
        const reverseScore = distance(source, last) + distance(target, first);
        return reverseScore < directScore ? points.reverse() : points;
    }

    static formatPoint(point) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return "null";
        return `(${Math.round(point.x)},${Math.round(point.y)})`;
    }

    static logTransferRenderDebug(graphics, state, scene, source, target, routePoints, transfer, px, py) {
        if (!GameEngine || typeof GameEngine.addLog !== 'function') return;
        const now = Date.now();
        const key = transfer.id || `${transfer.lineId || transfer.sourceId || 'line'}:${transfer.targetId || 'target'}:${transfer.itemType || 'item'}`;
        state._transferRenderDebugAt = state._transferRenderDebugAt || {};
        if (state._transferRenderDebugAt[key]) return;
        state._transferRenderDebugAt[key] = now;

        const first = Array.isArray(routePoints) ? routePoints[0] : null;
        const last = Array.isArray(routePoints) ? routePoints[routePoints.length - 1] : null;
        const lineDepth = scene?.logisticsGraphics?.depth ?? "n/a";
        const itemDepth = scene?.logisticsTransferGraphics?.depth ?? graphics?.depth ?? "n/a";
        const aboveLine = Number.isFinite(itemDepth) && Number.isFinite(lineDepth) ? itemDepth > lineDepth : "n/a";
                // GameEngine.addLog(
        //     `[DEBUG] Transfer render ${String(transfer.itemType || '').toUpperCase()} ` +
        //     `id=${transfer.id || 'none'} ` +
        //     `draw=${LogisticsRenderer.formatPoint({ x: px, y: py })} progress=${Number(transfer.progress || 0).toFixed(2)} ` +
        //     `first=${LogisticsRenderer.formatPoint(first)} last=${LogisticsRenderer.formatPoint(last)} ` +
        //     `source=${LogisticsRenderer.formatPoint(source)} target=${LogisticsRenderer.formatPoint(target)} ` +
        //     `lineDepth=${lineDepth} itemDepth=${itemDepth} itemAboveLine=${aboveLine}`,
        //     'LOGISTICS'
        // );
    }

    static getPointOnTransferPath(points, progress, startOffset = 0) {
        if (!Array.isArray(points) || points.length < 2) return null;
        const clampedProgress = Math.max(0, Math.min(1, Number(progress) || 0));
        const lengths = [];
        let totalLength = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            lengths.push(length);
            totalLength += length;
        }
        if (totalLength <= 0) return { x: points[0].x, y: points[0].y };

        const safeStartOffset = Math.max(0, Math.min(Number(startOffset) || 0, totalLength * 0.45));
        let targetDistance = safeStartOffset + clampedProgress * (totalLength - safeStartOffset);
        for (let i = 0; i < lengths.length; i++) {
            const length = lengths[i];
            if (targetDistance <= length || i === lengths.length - 1) {
                const a = points[i];
                const b = points[i + 1];
                const localProgress = length > 0 ? targetDistance / length : 0;
                return {
                    x: a.x + (b.x - a.x) * localProgress,
                    y: a.y + (b.y - a.y) * localProgress
                };
            }
            targetDistance -= length;
        }
        const last = points[points.length - 1];
        return { x: last.x, y: last.y };
    }

    static drawLogisticsGroupTurnArrows(g, segments, widthTiles, color, alpha, size, onlyCellKeys = null) {
        if (!Array.isArray(segments) || segments.length === 0) return;
        const TS = GameEngine.TILE_SIZE;
        const keyOf = (x, y) => `${Math.round(x)},${Math.round(y)}`;
        const turns = LogisticsRenderer.getLogisticsGroupTurnCells(segments);
        turns.forEach(({ x, y, inDir, outDir }) => {
            if (onlyCellKeys) {
                const centerKey = keyOf(x, y);
                const inKey = keyOf(x - inDir.x * TS, y - inDir.y * TS);
                const outKey = keyOf(x + outDir.x * TS, y + outDir.y * TS);
                if (!onlyCellKeys.has(centerKey) || !onlyCellKeys.has(inKey) || !onlyCellKeys.has(outKey)) return;
            }
            const turnDir = LogisticsRenderer.getTurnArrowDirection(inDir, outDir);
            if (!turnDir) return;
            const arrowSize = Math.max(size * 1.05, GameEngine.TILE_SIZE * 0.32);
            LogisticsRenderer.drawArrowhead(g, x, y, turnDir.x, turnDir.y, arrowSize);
        });
    }

    static drawLogisticsPathTurnArrows(g, cellPath, color, alpha, size) {
        if (!Array.isArray(cellPath) || cellPath.length < 3) return;
        const pointOfKey = (key) => {
            const [x, y] = String(key).split(",").map(Number);
            return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
        };
        g.fillStyle(color, alpha);
        for (let i = 1; i < cellPath.length - 1; i++) {
            const prev = pointOfKey(cellPath[i - 1]);
            const curr = pointOfKey(cellPath[i]);
            const next = pointOfKey(cellPath[i + 1]);
            const inDir = LogisticsRenderer.getCardinalDir(prev, curr);
            const outDir = LogisticsRenderer.getCardinalDir(curr, next);
            const turnDir = LogisticsRenderer.getTurnArrowDirection(inDir, outDir);
            if (!turnDir || !curr) continue;
            const arrowSize = Math.max(size * 1.05, GameEngine.TILE_SIZE * 0.32);
            LogisticsRenderer.drawArrowhead(g, curr.x, curr.y, turnDir.x, turnDir.y, arrowSize);
        }
    }

    static getLogisticsGroupTurnCellKeys(segments) {
        return new Set(LogisticsRenderer.getLogisticsGroupTurnCells(segments).map(turn => turn.key));
    }

    static getLogisticsGroupTurnCells(segments) {
        if (!Array.isArray(segments) || segments.length === 0) return [];
        const TS = GameEngine.TILE_SIZE;
        const keyOf = (p) => `${Math.round(p.x)},${Math.round(p.y)}`;
        const pointOfKey = (k) => {
            const [x, y] = String(k).split(",").map(Number);
            return { x, y };
        };
        const incoming = new Map();
        const outgoing = new Map();
        const pushDir = (map, key, dir) => {
            if (!key || !dir) return;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(dir);
        };

        segments.forEach((seg) => {
            const pts = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
            if (pts.length < 2) return;
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i];
                const b = pts[i + 1];
                const dir = LogisticsRenderer.getCardinalDir(a, b);
                if (!dir) continue;
                const dist = Math.hypot(b.x - a.x, b.y - a.y);
                const steps = Math.max(1, Math.round(dist / TS));
                let prevKey = null;
                for (let step = 0; step <= steps; step++) {
                    const p = {
                        x: a.x + dir.x * TS * step,
                        y: a.y + dir.y * TS * step
                    };
                    const key = keyOf(p);
                    if (prevKey && prevKey !== key) {
                        pushDir(outgoing, prevKey, dir);
                        pushDir(incoming, key, dir);
                    }
                    prevKey = key;
                }
            }
        });

        const turns = [];
        const allKeys = new Set([...incoming.keys(), ...outgoing.keys()]);
        const hasTurnAtKey = (key) => turns.some(turn => turn.key === key);
        allKeys.forEach((key) => {
            const inList = incoming.get(key) || [];
            const outList = outgoing.get(key) || [];
            if (inList.length === 0 || outList.length === 0) return;

            for (const inDir of inList) {
                for (const outDir of outList) {
                    if (!LogisticsRenderer.getTurnArrowDirection(inDir, outDir)) continue;
                    const point = pointOfKey(key);
                    turns.push({ key, x: point.x, y: point.y, inDir, outDir });
                    return;
                }
            }
        });

        allKeys.forEach((key) => {
            if (hasTurnAtKey(key)) return;
            const outList = outgoing.get(key) || [];
            if (outList.length < 2) return;
            for (let i = 0; i < outList.length - 1; i++) {
                for (let j = i + 1; j < outList.length; j++) {
                    const firstDir = outList[i];
                    const secondDir = outList[j];
                    if (!LogisticsRenderer.getTurnArrowDirection(firstDir, secondDir)) continue;
                    const point = pointOfKey(key);
                    turns.push({ key, x: point.x, y: point.y, inDir: firstDir, outDir: secondDir });
                    return;
                }
            }
        });

        allKeys.forEach((key) => {
            if (hasTurnAtKey(key)) return;
            if ((incoming.get(key) || []).length > 0) return;
            const outList = outgoing.get(key) || [];
            if (outList.length === 0) return;
            const point = pointOfKey(key);
            for (const outDir of outList) {
                const candidates = [
                    { x: point.x - TS, y: point.y },
                    { x: point.x + TS, y: point.y },
                    { x: point.x, y: point.y - TS },
                    { x: point.x, y: point.y + TS }
                ];
                for (const candidate of candidates) {
                    const neighborKey = keyOf(candidate);
                    if ((outgoing.get(neighborKey) || []).length > 0) continue;
                    const neighborIncoming = incoming.get(neighborKey) || [];
                    for (const inDir of neighborIncoming) {
                        if (!LogisticsRenderer.getTurnArrowDirection(inDir, outDir)) continue;
                        turns.push({ key, x: point.x, y: point.y, inDir, outDir });
                        return;
                    }
                }
            }
        });
        return turns;
    }

    static getTurnArrowDirection(inDir, outDir) {
        if (!inDir || !outDir) return null;
        const isTurn = inDir.x !== outDir.x || inDir.y !== outDir.y;
        if (!isTurn) return null;
        const collinear = (inDir.x === outDir.x && inDir.y === outDir.y) || (inDir.x === -outDir.x && inDir.y === -outDir.y);
        if (collinear) return null;
        const dx = inDir.x + outDir.x;
        const dy = inDir.y + outDir.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) return null;
        return { x: dx / len, y: dy / len };
    }

    static drawTurnArrowGlyph(g, cx, cy, size, inDir, outDir, color, alpha) {
        if (!inDir || !outDir) return;
        const pair = `${inDir.x},${inDir.y}->${outDir.x},${outDir.y}`;
        const map = {
            "-1,0->0,-1": 0,
            "0,1->1,0": 0,
            "1,0->0,1": 0,
            "0,-1->-1,0": 0,
            "0,-1->1,0": 1,
            "-1,0->0,1": 1,
            "0,1->-1,0": 1,
            "1,0->0,-1": 1,
            "1,0->0,-1": 1,
            "0,1->-1,0": 1,
            "-1,0->0,1": 1,
            "0,-1->1,0": 1,
            "-1,0->0,1": 1,
            "0,-1->1,0": 1,
            "1,0->0,-1": 1,
            "0,1->-1,0": 1,
            "-1,0->0,-1": 2,
            "0,1->1,0": 2,
            "1,0->0,1": 2,
            "0,-1->-1,0": 2,
            "0,-1->-1,0": 3,
            "1,0->0,1": 3,
            "0,1->1,0": 3,
            "-1,0->0,-1": 3
        };
        // 轉彎模板：以「左進上出」為基礎，透過旋轉得到其餘三向。
        const rotQuarter = map[pair];
        if (rotQuarter === undefined) return;

        const s = size / 2;
        const pts = [
            { x: -0.80, y: 0.30 }, { x: 0.00, y: 0.30 }, { x: 0.00, y: -0.35 },
            { x: -0.20, y: -0.35 }, { x: 0.00, y: -0.80 }, { x: 0.20, y: -0.35 },
            { x: 0.00, y: -0.35 }, { x: 0.00, y: 0.55 }, { x: -0.80, y: 0.55 }
        ];
        const rot = (p) => {
            let x = p.x, y = p.y;
            for (let i = 0; i < rotQuarter; i++) {
                const nx = y;
                const ny = -x;
                x = nx; y = ny;
            }
            return { x, y };
        };

        g.fillStyle(color, alpha);
        g.beginPath();
        pts.forEach((p, idx) => {
            const rp = rot(p);
            const px = cx + rp.x * s;
            const py = cy + rp.y * s;
            if (idx === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
        });
        g.closePath();
        g.fillPath();
    }

    static strokePolyline(g, points) {
        if (!Array.isArray(points) || points.length < 2) return;
        g.beginPath();
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            g.lineTo(points[i].x, points[i].y);
        }
        g.strokePath();
    }

    static drawLogisticsCells(g, points, widthTiles = 1, alpha = 1) {
        const rects = LogisticsRenderer.getLogisticsCellRects(points, widthTiles);
        rects.forEach(rect => g.fillRect(rect.x, rect.y, rect.w, rect.h));
    }

    static getLogisticsEndpointCellRect(points, widthTiles = 1) {
        if (!Array.isArray(points) || points.length < 2) return null;
        const TS = GameEngine.TILE_SIZE;
        const width = Math.max(1, Math.round(Number(widthTiles) || 1));
        const end = points[points.length - 1];
        const prev = points[points.length - 2];
        if (!end || !prev) return null;
        const dx = end.x - prev.x;
        const dy = end.y - prev.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.001) return null;
        const dir = { x: dx / dist, y: dy / dist };
        const isHorizontal = Math.abs(dir.x) > Math.abs(dir.y);
        return {
            x: end.x - (isHorizontal ? TS / 2 : (width * TS) / 2),
            y: end.y - (isHorizontal ? (width * TS) / 2 : TS / 2),
            w: (isHorizontal ? TS : width * TS),
            h: (isHorizontal ? width * TS : TS),
            cellKey: `${Math.round(end.x)},${Math.round(end.y)}`,
            dirX: dir.x,
            dirY: dir.y
        };
    }

    static getLogisticsCellRects(points, widthTiles = 1, perStep = false) {
        if (!Array.isArray(points) || points.length < 2) return [];
        const TS = GameEngine.TILE_SIZE;
        const width = Math.max(1, Math.round(Number(widthTiles) || 1));
        const eps = 0.001;
        const cells = new Set();
        const stepRects = [];
        const mergedRects = [];
        const addCell = (col, row) => {
            if (!Number.isFinite(col) || !Number.isFinite(row)) return;
            cells.add(`${col},${row}`);
        };
        const getDir = (from, to) => {
            if (!from || !to) return null;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            if (Math.abs(dx) < eps && Math.abs(dy) < eps) return null;
            return Math.abs(dx) >= Math.abs(dy)
                ? { x: Math.sign(dx) || 1, y: 0 }
                : { x: 0, y: Math.sign(dy) || 1 };
        };
        const firstDir = getDir(points[0], points[1]);
        if (!firstDir) return [];
        const turnDirsByCellKey = new Map();
        for (let i = 1; i < points.length - 1; i++) {
            const inDir = getDir(points[i - 1], points[i]);
            const outDir = getDir(points[i], points[i + 1]);
            const turnDir = LogisticsRenderer.getTurnArrowDirection(inDir, outDir);
            if (turnDir) {
                turnDirsByCellKey.set(`${Math.round(points[i].x)},${Math.round(points[i].y)}`, turnDir);
            }
        }
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            if (dist < eps) continue;

            const dir = { x: dx / dist, y: dy / dist };
            const steps = Math.max(1, Math.round(dist / TS)); // 1.0-tile steps
            const stepSize = dist / steps;

            for (let step = 0; step < steps; step++) {
                const px = a.x + dir.x * stepSize * step;
                const py = a.y + dir.y * stepSize * step;

                // [核心修正] 考慮寬度 (widthTiles)，計算正交偏移，確保選取框與渲染完全對齊
                const isHorizontal = Math.abs(dir.x) > Math.abs(dir.y);
                const rect = {
                    x: px - (isHorizontal ? TS / 2 : (width * TS) / 2),
                    y: py - (isHorizontal ? (width * TS) / 2 : TS / 2),
                    w: (isHorizontal ? TS : width * TS),
                    h: (isHorizontal ? width * TS : TS),
                    cellKey: `${Math.round(px)},${Math.round(py)}`,
                    dirX: dir.x,
                    dirY: dir.y
                };
                const turnDir = turnDirsByCellKey.get(rect.cellKey);
                if (turnDir) {
                    rect.dirX = turnDir.x;
                    rect.dirY = turnDir.y;
                    rect.isTurn = true;
                }

                stepRects.push(rect);
            }
        }

        return stepRects;
    }

    static getLogisticsCellCenterline(points, widthTiles = 1) {
        if (!Array.isArray(points) || points.length < 2) return points || [];
        const TS = GameEngine.TILE_SIZE;
        const width = Math.max(1, Math.round(Number(widthTiles) || 1));
        const eps = 0.001;
        const getDir = (from, to) => {
            if (!from || !to) return null;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            if (Math.abs(dx) < eps && Math.abs(dy) < eps) return null;
            return Math.abs(dx) >= Math.abs(dy)
                ? { x: Math.sign(dx) || 1, y: 0 }
                : { x: 0, y: Math.sign(dy) || 1 };
        };
        const first = points[0];
        const firstDir = getDir(points[0], points[1]);
        if (!firstDir) return points;
        let originX = first.x - (width * TS) / 2;
        let originY = first.y - (width * TS) / 2;
        if (firstDir.x > 0) {
            originX = first.x;
            originY = first.y - (width * TS) / 2;
        } else if (firstDir.x < 0) {
            originX = first.x - TS;
            originY = first.y - (width * TS) / 2;
        } else if (firstDir.y > 0) {
            originX = first.x - (width * TS) / 2;
            originY = first.y;
        } else if (firstDir.y < 0) {
            originX = first.x - (width * TS) / 2;
            originY = first.y - TS;
        }
        let cursorCol = 0;
        let cursorRow = 0;
        let currentDir = firstDir;
        const centers = [];
        const pushCenter = (col, row, dir) => {
            const last = centers[centers.length - 1];
            const cx = originX + (col + (dir.x !== 0 ? 0.5 : width / 2)) * TS;
            const cy = originY + (row + (dir.x !== 0 ? width / 2 : 0.5)) * TS;
            if (!last || last.x !== cx || last.y !== cy) centers.push({ x: cx, y: cy });
        };
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            if (Math.abs(dx) < eps && Math.abs(dy) < eps) continue;
            const dir = getDir(a, b);
            const steps = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / TS));
            for (let step = 0; step < steps; step++) {
                if (dir.x !== currentDir.x || dir.y !== currentDir.y) {
                    cursorCol = cursorCol - currentDir.x + dir.x;
                    cursorRow = cursorRow - currentDir.y + dir.y;
                    currentDir = dir;
                }
                pushCenter(cursorCol, cursorRow, dir);
                cursorCol += dir.x;
                cursorRow += dir.y;
            }
        }
        return centers.length >= 2 ? centers : points;
    }

    static getPolylineLength(points) {
        if (!Array.isArray(points) || points.length < 2) return 0;
        let total = 0;
        for (let i = 0; i < points.length - 1; i++) {
            total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
        }
        return total;
    }

    static getPointAndDirectionOnPolyline(points, distance) {
        if (!Array.isArray(points) || points.length < 2) return null;
        let remain = distance;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const segLen = Math.hypot(dx, dy);
            if (segLen < 0.001) continue;
            if (remain <= segLen) {
                const t = remain / segLen;
                return {
                    x: a.x + dx * t,
                    y: a.y + dy * t,
                    ux: dx / segLen,
                    uy: dy / segLen
                };
            }
            remain -= segLen;
        }
        const a = points[points.length - 2];
        const b = points[points.length - 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const segLen = Math.hypot(dx, dy) || 1;
        return { x: b.x, y: b.y, ux: dx / segLen, uy: dy / segLen };
    }

    static drawArrowsOnPolyline(g, points, offset, spacing, size) {
        const len = LogisticsRenderer.getPolylineLength(points);
        if (len <= 8) return;
        for (let d = offset; d < len - 8; d += spacing) {
            const info = LogisticsRenderer.getPointAndDirectionOnPolyline(points, d);
            if (info) LogisticsRenderer.drawArrowhead(g, info.x, info.y, info.ux, info.uy, size);
        }
    }

    static drawArrowAtPolylineEnd(g, points, size) {
        if (!Array.isArray(points) || points.length < 2) return;
        const a = points[points.length - 2];
        const b = points[points.length - 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const segLen = Math.hypot(dx, dy);
        if (segLen < 0.001) return;
        const ux = dx / segLen;
        const uy = dy / segLen;
        const cx = b.x - ux * size;
        const cy = b.y - uy * size;
        LogisticsRenderer.drawArrowhead(g, cx, cy, ux, uy, size);
    }
}
