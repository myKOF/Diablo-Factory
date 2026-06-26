import { GameEngine } from "../systems/game_systems.js";
import { UI_CONFIG } from "../ui/ui_config.js";
import { logisticsTransportArrayState } from "../systems/logistics/LogisticsTransportArrayState.js";
import { logisticsRenderModel } from "../systems/logistics/LogisticsRenderModel.js";

export class LogisticsRenderer {
    // [效能] 路徑幾何記憶化(WeakMap 以 routePoints 參照為鍵,自動失效零洩漏)。段長/轉角是路徑的純函式,
    // 對同路線跨幀跨 transfer 不變;normalized route 在 transfer 生命週期內參照穩定故能跨幀命中。
    static _transferPathGeomCache = new WeakMap();
    static _annotatedRoutes = new WeakSet();

    static resolveTransferProgress(transfer, routePoints = transfer?.routePoints, cellSize = GameEngine.TILE_SIZE) {
        return logisticsTransportArrayState.resolveProgress(transfer, routePoints, cellSize);
    }

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
            const rects = getRenderableLogisticsCellRects(points, widthTiles, true, line);
            if (shouldDrawOpenEndpointCell(line, points)) {
                const endpointRect = LogisticsRenderer.getLogisticsEndpointCellRect(points, widthTiles);
                if (endpointRect) {
                    rects.push(endpointRect);
                }
            }
            if (rects.length === 0) {
                drawSelectedLogisticsSegmentOutline(line);
                return;
            }

            let rect = rects[0];
            const clickX = GameEngine.state.selectedLogisticsClickX;
            const clickY = GameEngine.state.selectedLogisticsClickY;
            if (clickX !== null && clickX !== undefined && clickY !== null && clickY !== undefined) {
                let minD = Infinity;
                let bestRect = rect;
                for (const r of rects) {
                    const cx = r.x + r.w / 2;
                    const cy = r.y + r.h / 2;
                    const d = Math.hypot(cx - clickX, cy - clickY);
                    if (d < minD) {
                        minD = d;
                        bestRect = r;
                    }
                }
                rect = bestRect;
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
        const drawSelectedLogisticsRouteOutlines = (points, widthTiles, line) => {
            if (!line || !Array.isArray(points) || points.length < 2) {
                drawSelectedLogisticsSegmentOutline(line);
                return;
            }
            const rects = getRenderableLogisticsCellRects(points, widthTiles, true, line);
            if (shouldDrawOpenEndpointCell(line, points)) {
                const endpointRect = LogisticsRenderer.getLogisticsEndpointCellRect(points, widthTiles);
                if (endpointRect) rects.push(endpointRect);
            }
            if (rects.length === 0) {
                drawSelectedLogisticsSegmentOutline(line);
                return;
            }

            const padding = Math.max(0, Number(logCfg.selectedSegmentOutlinePadding) || 0);
            const outlineColor = parseColor(logCfg.selectedSegmentOutlineColor || "#ff3d00ff");
            const outlineAlpha = logCfg.selectedSegmentOutlineAlpha ?? 1;
            const outlineWidth = Math.max(1, Number(logCfg.selectedSegmentOutlineWidth) || 2);
            const drawn = new Set();
            graphics.lineStyle(outlineWidth, outlineColor, outlineAlpha);
            rects.forEach((rect) => {
                const key = rect.cellKey || `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.w)},${Math.round(rect.h)}`;
                if (drawn.has(key)) return;
                drawn.add(key);
                graphics.strokeRect(
                    rect.x - padding,
                    rect.y - padding,
                    rect.w + padding * 2,
                    rect.h + padding * 2
                );
            });
        };

        const selectedLogisticsOutlineJobs = [];
        const deleteHoverLineIds = new Set(state.logisticsDeleteBrushHoverLineIds || []);
        const deleteHoverGroupIds = new Set(state.logisticsDeleteBrushHoverGroupIds || []);
        const isDeleteHoverGroupMode = !!state.logisticsDeleteToolActive && !!state.logisticsDeleteBrushCtrlMode;
        const getDeleteBrushRect = () => {
            const point = state.logisticsDeleteBrushWorld;
            if (!state.logisticsDeleteToolActive || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
            const TS = GameEngine.TILE_SIZE || 64;
            const size = Math.max(1, Math.min(5, Number(state.logisticsDeleteBrushSize) || 1));
            const left = Math.round(point.x / TS - size / 2) * TS;
            const top = Math.round(point.y / TS - size / 2) * TS;
            const right = left + TS * size;
            const bottom = top + TS * size;
            return { left, right, top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2, size };
        };
        const rectIntersectsDeleteBrush = (rect) => {
            if (!deleteBrushRect || !rect) return false;
            const left = Math.max(deleteBrushRect.left, rect.x);
            const right = Math.min(deleteBrushRect.right, rect.x + rect.w);
            const top = Math.max(deleteBrushRect.top, rect.y);
            const bottom = Math.min(deleteBrushRect.bottom, rect.y + rect.h);
            return right - left > 0.5 && bottom - top > 0.5;
        };
        const deleteBrushRect = getDeleteBrushRect();
        const getDeleteBrushHitRects = (rects) => {
            if (!deleteBrushRect || !Array.isArray(rects) || rects.length === 0) return [];
            return rects.filter(rect => rectIntersectsDeleteBrush(rect));
        };
        const getLineSelectionKey = (line) => {
            if (!line) return null;
            const gx = line.gridX !== undefined ? line.gridX : Math.round((line.x || 0) / ((GameEngine.TILE_SIZE || 64) / 2));
            const gy = line.gridY !== undefined ? line.gridY : Math.round((line.y || 0) / ((GameEngine.TILE_SIZE || 64) / 2));
            return `${line.id || line.groupId || "logistics"}@${gx},${gy}`;
        };
        const flushSelectedLogisticsOutlines = () => {
            selectedLogisticsOutlineJobs.forEach(({ points, widthTiles, line, outlineAll }) => {
                if (outlineAll) drawSelectedLogisticsRouteOutlines(points, widthTiles, line);
                else drawSelectedLogisticsSegmentOutlineOnRoute(points, widthTiles, line);
            });
            selectedLogisticsOutlineJobs.length = 0;
        };

        const renderedLogisticsBaseCellKeys = new Set();
        const isDetachedSplitCell = (line, cellKey) =>
            (!!line?.detachedFromGroupId && !!line?.detachedAtKey && line.detachedAtKey === cellKey) ||
            (Array.isArray(line?.suppressedConnectionCellKeys) && line.suppressedConnectionCellKeys.includes(cellKey));
        const getRenderableLogisticsCellRects = (points, widthTiles, perStep, line) =>
            LogisticsRenderer.getLogisticsCellRects(points, widthTiles, perStep)
                .filter(rect => !isDetachedSplitCell(line, rect.cellKey));
        const shouldDrawOpenEndpointCell = (line, points) => {
            if (!line || line.targetId || line.suppressOpenEndpointCell) return false;
            if (!Array.isArray(points) || points.length < 2) return false;
            const end = points[points.length - 1];
            const endpointKey = end ? `${Math.round(end.x)},${Math.round(end.y)}` : null;
            return !!endpointKey && !isDetachedSplitCell(line, endpointKey);
        };
        const drawLogisticsRoute = (points, widthTiles, isSelected, isConnected, line = null, isPortToPort = false, skipArrowCellKeys = null, skipBaseCellKeys = null, skipRoundedTurnCellKeys = null, skippedTurnBaseCellKeys = null, forceDeleteHover = false) => {
            const baseThickness = logCfg.lineThickness || 3;
            const thickPx = Math.max(baseThickness, widthTiles * GameEngine.TILE_SIZE);
            const usePortToPortStyle = !!isPortToPort && !!isConnected;
            const normalColor = usePortToPortStyle
                ? (logCfg.portToPortLineColor || logCfg.lineColor)
                : (!isConnected ? (logCfg.disconnectedLineColor || "#6b6b6b") : logCfg.lineColor);
            const normalAlpha = usePortToPortStyle
                ? (logCfg.portToPortLineAlpha ?? logCfg.lineAlpha)
                : (!isConnected ? (logCfg.disconnectedLineAlpha ?? logCfg.lineAlpha) : logCfg.lineAlpha);

            const roundedSkipCellKeys = LogisticsRenderer.getLineSkippedCellKeys(line);
            const effectiveRoundedTurnSkipCellKeys = skipRoundedTurnCellKeys || skipBaseCellKeys;
            if (effectiveRoundedTurnSkipCellKeys) {
                effectiveRoundedTurnSkipCellKeys.forEach(key => {
                    if (key) roundedSkipCellKeys.add(key);
                });
            }
            const shouldDrawSkippedTurnBase = (rect) =>
                !!rect?.isTurn &&
                !!rect.cellKey &&
                skippedTurnBaseCellKeys?.has(rect.cellKey) &&
                !skipBaseCellKeys?.has(rect.cellKey);
            LogisticsRenderer.drawLogisticsRoundedTurnSegments(
                graphics,
                points,
                thickPx,
                parseColor(normalColor),
                normalAlpha,
                roundedSkipCellKeys
            );
            graphics.fillStyle(parseColor(normalColor), normalAlpha);
            getRenderableLogisticsCellRects(points, widthTiles, false, line).forEach(rect => {
                if (rect.isTurn && !shouldDrawSkippedTurnBase(rect)) return;
                if (skipBaseCellKeys?.has(rect.cellKey)) return;
                const baseKey = rect.cellKey || `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.w)},${Math.round(rect.h)}`;
                if (renderedLogisticsBaseCellKeys.has(baseKey)) return;
                renderedLogisticsBaseCellKeys.add(baseKey);
                graphics.fillRect(rect.x, rect.y, rect.w, rect.h);
            });
            if (shouldDrawOpenEndpointCell(line, points)) {
                const endpointRect = LogisticsRenderer.getLogisticsEndpointCellRect(points, widthTiles);
                if (endpointRect) {
                    const endpointBaseKey = endpointRect.cellKey || `${Math.round(endpointRect.x)},${Math.round(endpointRect.y)},${Math.round(endpointRect.w)},${Math.round(endpointRect.h)}`;
                    if (!skipBaseCellKeys?.has(endpointRect.cellKey) && !renderedLogisticsBaseCellKeys.has(endpointBaseKey)) {
                        renderedLogisticsBaseCellKeys.add(endpointBaseKey);
                        graphics.fillRect(endpointRect.x, endpointRect.y, endpointRect.w, endpointRect.h);
                    }
                }
            }

            if (isSelected) {
                const rects = getRenderableLogisticsCellRects(points, widthTiles, true, line);
                if (shouldDrawOpenEndpointCell(line, points)) {
                    const endpointRect = LogisticsRenderer.getLogisticsEndpointCellRect(points, widthTiles);
                    if (endpointRect) {
                        rects.push(endpointRect);
                    }
                }
                if (rects.length > 0) {
                    const selColor = logCfg.selectedLineColor || "#ffff00";
                    const selAlpha = logCfg.selectedLineAlpha || 1.0;
                    graphics.fillStyle(parseColor(selColor), selAlpha);
                    const selectedGroupId = GameEngine.state.selectedLogisticsGroupId;
                    const groupKey = line ? (line.groupId || line.id) : null;
                    const selectedGroupIds = selectedGroupId
                        ? logisticsRenderModel.getMergeConnectedGroupIds(selectedGroupId, state)
                        : new Set();
                    const isGroupSelection = !!groupKey && selectedGroupIds.has(groupKey);
                    if (isGroupSelection) {
                        LogisticsRenderer.drawLogisticsRoundedTurnSegments(
                            graphics,
                            points,
                            thickPx,
                            parseColor(selColor),
                            selAlpha,
                            roundedSkipCellKeys
                        );
                        graphics.fillStyle(parseColor(selColor), selAlpha);
                        rects.forEach(rect => {
                            if (rect.isTurn && !shouldDrawSkippedTurnBase(rect)) return;
                            if (skipBaseCellKeys?.has(rect.cellKey)) return;
                            graphics.fillRect(rect.x, rect.y, rect.w, rect.h);
                        });
                    } else {
                        let selectedRect = rects[0];
                        const clickX = GameEngine.state.selectedLogisticsClickX;
                        const clickY = GameEngine.state.selectedLogisticsClickY;
                        if (clickX !== null && clickX !== undefined && clickY !== null && clickY !== undefined) {
                            let minD = Infinity;
                            for (const r of rects) {
                                const cx = r.x + r.w / 2;
                                const cy = r.y + r.h / 2;
                                const d = Math.hypot(cx - clickX, cy - clickY);
                                if (d < minD) {
                                    minD = d;
                                    selectedRect = r;
                                }
                            }
                        }
                        graphics.fillRect(selectedRect.x, selectedRect.y, selectedRect.w, selectedRect.h);
                    }
                }
            }

            const lineSelectionKey = getLineSelectionKey(line);
            const lineGroupKey = line?.groupId || line?.id || null;
            const isDeleteHovered = !!state.logisticsDeleteToolActive && (forceDeleteHover ||
                (isDeleteHoverGroupMode && lineGroupKey && deleteHoverGroupIds.has(lineGroupKey)) ||
                (!isDeleteHoverGroupMode && lineSelectionKey && deleteHoverLineIds.has(lineSelectionKey))
            );
            if (isDeleteHovered) {
                const hoverColor = 0xff3030;
                const hoverAlpha = 0.72;
                const rects = getRenderableLogisticsCellRects(points, widthTiles, true, line);
                if (shouldDrawOpenEndpointCell(line, points)) {
                    const endpointRect = LogisticsRenderer.getLogisticsEndpointCellRect(points, widthTiles);
                    if (endpointRect) rects.push(endpointRect);
                }
                const shouldPaintFullRoute = forceDeleteHover || (isDeleteHoverGroupMode && lineGroupKey && deleteHoverGroupIds.has(lineGroupKey));
                const hoverRects = shouldPaintFullRoute ? rects : getDeleteBrushHitRects(rects);
                if (shouldPaintFullRoute) {
                    LogisticsRenderer.drawLogisticsRoundedTurnSegments(
                        graphics,
                        points,
                        thickPx,
                        hoverColor,
                        hoverAlpha,
                        roundedSkipCellKeys
                    );
                }
                graphics.fillStyle(hoverColor, hoverAlpha);
                hoverRects.forEach(rect => {
                    if (skipBaseCellKeys?.has(rect.cellKey)) return;
                    graphics.fillRect(rect.x, rect.y, rect.w, rect.h);
                });
            }

            const arrowRects = getRenderableLogisticsCellRects(points, widthTiles, true, line);
            if (shouldDrawOpenEndpointCell(line, points)) {
                const endpointRect = LogisticsRenderer.getLogisticsEndpointCellRect(points, widthTiles);
                if (endpointRect) arrowRects.push(endpointRect);
            }

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
                const groupKeyForLine = line?.groupId || line?.id || null;
                const getOverrideMatchKey = (override) => {
                    if (!override) return null;
                    const candidates = arrowRects
                        .map((rect, index) => {
                            const cx = rect.x + rect.w / 2;
                            const cy = rect.y + rect.h / 2;
                            const exact = override.cellKey === rect.cellKey;
                            const anchorDist = Number.isFinite(override.anchorX) && Number.isFinite(override.anchorY)
                                ? Math.hypot(cx - override.anchorX, cy - override.anchorY)
                                : Infinity;
                            if (!exact && anchorDist > GameEngine.TILE_SIZE * 0.75) return null;
                            const sourceDot = Number.isFinite(override.sourceDirX) && Number.isFinite(override.sourceDirY) &&
                                Number.isFinite(override.anchorX) && Number.isFinite(override.anchorY)
                                ? ((cx - override.anchorX) * override.sourceDirX + (cy - override.anchorY) * override.sourceDirY)
                                : 0;
                            return { rect, index, exact, anchorDist, sourceDot };
                        })
                        .filter(Boolean);
                    if (candidates.length === 0) return null;
                    candidates.sort((a, b) => {
                        if (a.exact !== b.exact) return a.exact ? -1 : 1;
                        const aForward = a.sourceDot > 0.001;
                        const bForward = b.sourceDot > 0.001;
                        if (aForward !== bForward) return aForward ? -1 : 1;
                        if (Math.abs(a.anchorDist - b.anchorDist) > 0.001) return a.anchorDist - b.anchorDist;
                        return a.index - b.index;
                    });
                    return candidates[0].rect.cellKey || `idx:${candidates[0].index}`;
                };
                const stateOverrideForLine = (GameEngine.state.logisticsTurnArrowOverrides || []).find(item =>
                    item &&
                    (!item.groupId || !groupKeyForLine || item.groupId === groupKeyForLine) &&
                    getOverrideMatchKey(item)
                ) || null;
                const activeOverride = line?.turnArrowOverride || stateOverrideForLine;
                const activeOverrideMatchKey = getOverrideMatchKey(activeOverride);
                arrowRects.forEach((rect, index) => {
                    if (skipArrowCellKeys?.has(rect.cellKey)) return;
                    if (LogisticsRenderer.isDetachedSplitCell(line, rect.cellKey)) return;
                    const lineOverride = line?.turnArrowOverride || stateOverrideForLine;
                    const rectCenterX = rect.x + rect.w / 2;
                    const rectCenterY = rect.y + rect.h / 2;
                    const rectMatchKey = rect.cellKey || `idx:${index}`;
                    const override = lineOverride && (
                        activeOverrideMatchKey
                            ? rectMatchKey === activeOverrideMatchKey
                            : lineOverride.cellKey === rect.cellKey
                    )
                        ? lineOverride
                        : null;
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
                const selectedGroupId = GameEngine.state.selectedLogisticsGroupId;
                const groupKey = line.groupId || line.id;
                const selectedGroupIds = selectedGroupId
                    ? logisticsRenderModel.getMergeConnectedGroupIds(selectedGroupId, state)
                    : new Set();
                selectedLogisticsOutlineJobs.push({
                    points,
                    widthTiles,
                    line,
                    outlineAll: selectedGroupIds.has(groupKey)
                });
            }
        };

        const drawConnectedCellOverlay = (points, widthTiles, connectedCellKeys, isPortToPort = true, skipArrowCellKeys = null, drawBase = true, skipBaseCellKeys = null) => {
            if (!connectedCellKeys || connectedCellKeys.size === 0) return;
            const rects = LogisticsRenderer.getLogisticsCellRects(points, widthTiles, true)
                .filter(rect => rect.cellKey && connectedCellKeys.has(rect.cellKey));
            const endpointRect = LogisticsRenderer.getLogisticsEndpointCellRect(points, widthTiles);
            if (
                endpointRect &&
                endpointRect.cellKey &&
                connectedCellKeys.has(endpointRect.cellKey) &&
                !skipBaseCellKeys?.has(endpointRect.cellKey) &&
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
            if (drawBase) {
                graphics.fillStyle(parseColor(lineColor), lineAlpha);
                rects.forEach(rect => {
                    if (skipBaseCellKeys?.has(rect.cellKey)) return;
                    graphics.fillRect(rect.x, rect.y, rect.w, rect.h);
                });
            }

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

            let allConnectedGroupSegs = segments;
            const connectedGroupIds = logisticsRenderModel.getMergeConnectedGroupIds(groupKey, state);
            if (connectedGroupIds && connectedGroupIds.size > 0) {
                const allSegs = [];
                connectedGroupIds.forEach(gid => {
                    const segs = groupSegments.get(gid) || [];
                    allSegs.push(...segs);
                });
                if (allSegs.length > 0) {
                    allConnectedGroupSegs = allSegs;
                }
            }

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
            allConnectedGroupSegs.forEach((seg) => {
                const pts = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
                if (pts.length < 2) return;
                for (let i = 0; i < pts.length - 1; i++) {
                    const fromPoint = pts[i];
                    const toPoint = pts[i + 1];
                    if (!fromPoint || !toPoint) continue;
                    const fromKey = makeNodeKey(fromPoint);
                    const toKey = makeNodeKey(toPoint);
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

                    const dx = toPoint.x - fromPoint.x;
                    const dy = toPoint.y - fromPoint.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > 0.001) {
                        const dirX = dx / dist;
                        const dirY = dy / dist;
                        const steps = Math.max(1, Math.round(dist / GameEngine.TILE_SIZE));
                        const stepSize = dist / steps;
                        let prevCellKey = null;
                        for (let step = 0; step < steps; step++) {
                            const point = {
                                x: fromPoint.x + dirX * stepSize * step,
                                y: fromPoint.y + dirY * stepSize * step
                            };
                            const cellKey = makeNodeKey(point);
                            cellKeySet.add(cellKey);
                            cellPointByKey.set(cellKey, getNodePoint(cellKey));
                            if (!cellAdj.has(cellKey)) cellAdj.set(cellKey, new Set());
                            addCellEdge(prevCellKey, cellKey);
                            prevCellKey = cellKey;
                        }
                        const endCellKey = makeNodeKey(toPoint);
                        cellKeySet.add(endCellKey);
                        cellPointByKey.set(endCellKey, getNodePoint(endCellKey));
                        if (!cellAdj.has(endCellKey)) cellAdj.set(endCellKey, new Set());
                        addCellEdge(prevCellKey, endCellKey);
                    }
                }
            });

            const nodeKeys = Array.from(nodeKeySet);
            if (nodeKeys.length === 0) return;
            const cellKeys = Array.from(cellKeySet);
            const terminalCellKeySet = new Set(cellKeys.filter((key) => (cellAdj.get(key)?.size || 0) <= 1));
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
            const segWithSource = allConnectedGroupSegs.find(seg => seg && seg.sourceId);
            const segWithTarget = allConnectedGroupSegs.find(seg => seg && seg.targetId);
            const representative = (segWithSource || segWithTarget) ? {
                sourceId: segWithSource?.sourceId || null,
                targetId: segWithTarget?.targetId || null,
                sourcePort: segWithSource?.sourcePort || null,
                targetPort: segWithTarget?.targetPort || null,
                routeWidth: segWithSource?.routeWidth || segWithTarget?.routeWidth || 1,
            } : null;
            const sourceEnt = representative?.sourceId
                ? (state.mapEntities?.find((ent) => (ent.id || `${ent.type1}_${ent.x}_${ent.y}`) === representative.sourceId) || null)
                : null;
            const targetEnt = representative?.targetId
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
            const terminalStartKeySet = new Set(terminalStarts);
            const terminalEndKeySet = new Set(terminalEnds);

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
            const getNearbyTerminalCellKeys = (point, maxSnap) => {
                if (!point || terminalCellKeySet.size === 0) return [];
                return getNearbyCellKeys(point, maxSnap).filter((key) => terminalCellKeySet.has(key));
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
                const explicitStarts = startKeysRaw.filter((k) => terminalStartKeySet.has(k) && (adj.get(k)?.size || 0) > 0);
                const explicitEnds = endKeysRaw.filter((k) => terminalEndKeySet.has(k) && incoming.has(k));
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
                const sourceCells = getNearbyTerminalCellKeys(sourcePort || { x: sourceEnt.x, y: sourceEnt.y }, sourceSnap);
                const targetCells = getNearbyTerminalCellKeys(targetPort || { x: targetEnt.x, y: targetEnt.y }, targetSnap);
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
                const terminalStartKeysRaw = startKeysRaw.filter((key) => terminalStartKeySet.has(key));
                const terminalEndKeysRaw = endKeysRaw.filter((key) => terminalEndKeySet.has(key));
                for (const sk of terminalStartKeysRaw) {
                    if (connected) break;
                    for (const ek of terminalEndKeysRaw) {
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
                    allConnectedGroupSegs.forEach((seg) => {
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
                            getNearbyTerminalCellKeys(candidate, GameEngine.TILE_SIZE * 2.25).forEach((k) => {
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
                        getNearbyTerminalCellKeys(sourcePort || { x: sourceEnt.x, y: sourceEnt.y }, GameEngine.TILE_SIZE * 3).forEach((k) => {
                            const owners = getPortOwnersNearCell(k, true).filter((owner) => owner.id === sourceId);
                            if (owners.length > 0) outputCells.push({ key: k, owners });
                        });
                    }
                    if (inputCells.length === 0) {
                        getNearbyTerminalCellKeys(targetPort || { x: targetEnt.x, y: targetEnt.y }, GameEngine.TILE_SIZE * 3).forEach((k) => {
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

        const propagatedConnectedGroups = logisticsRenderModel.getDisplayConnectedGroupIds(portToPortConnectedGroupIds, state);
        propagatedConnectedGroups.forEach(groupKey => {
            if (groupKey) portToPortConnectedGroupIds.add(groupKey);
        });

        const hasLogisticsTransportFilter = (groupKey, groupSegs) => {
            if (Array.isArray(groupSegs) && groupSegs.some(line => !!line?.filter)) return true;
            return (state.mapEntities || []).some(ent =>
                Array.isArray(ent?.outputTargets) &&
                ent.outputTargets.some(conn => !!conn?.filter && conn.lineId === groupKey)
            );
        };
        const groupTurnCellKeys = new Map();
        groupSegments.forEach((groupSegs, groupKey) => {
            groupTurnCellKeys.set(groupKey, LogisticsRenderer.getLogisticsGroupTurnCellKeys(groupSegs));
        });
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
        const getMergeVisualTurnsByGroup = () => {
            const result = new Map();
            const nodes = logisticsRenderModel.ensureMergeNodeStore(state);
            const routeCache = new Map();
            const nodeSnap = GameEngine.TILE_SIZE * 1.25;
            const keyOfPoint = (point) => `${Math.round(point.x)},${Math.round(point.y)}`;
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
            const getStateGroupSegments = (targetGroupId) => {
                if (!targetGroupId) return [];
                return (Array.isArray(state.logisticsLines) ? state.logisticsLines : [])
                    .filter(line => (line?.groupId || line?.id || null) === targetGroupId);
            };
            const getGroupRoutes = (targetGroupId) => {
                if (!targetGroupId) return [];
                if (routeCache.has(targetGroupId)) return routeCache.get(targetGroupId);
                const routes = [];
                LogisticsRenderer.buildSelectedGroupDebugGraphRoutes(logisticsRenderModel.getSegmentsByGroupId(targetGroupId))
                    .forEach(route => routes.push(route));
                LogisticsRenderer.buildSelectedGroupDebugGraphRoutes(getStateGroupSegments(targetGroupId))
                    .forEach(route => routes.push(route));
                routeCache.set(targetGroupId, routes);
                return routes;
            };
            const getRouteDirectionAtNode = (route, nodePoint, wantInputEnd) => {
                if (!Array.isArray(route) || route.length < 2 || !nodePoint) return null;
                let bestPoint = null;
                route.forEach((point, index) => {
                    const dist = Math.hypot(point.x - nodePoint.x, point.y - nodePoint.y);
                    if (!bestPoint || dist < bestPoint.dist) bestPoint = { index, dist };
                });
                if (bestPoint && bestPoint.dist <= nodeSnap) {
                    const index = bestPoint.index;
                    if (wantInputEnd) {
                        if (index > 0) return LogisticsRenderer.getCardinalDir(route[index - 1], route[index]);
                        if (index < route.length - 1) return LogisticsRenderer.getCardinalDir(route[index + 1], route[index]);
                    } else {
                        if (index < route.length - 1) return LogisticsRenderer.getCardinalDir(route[index], route[index + 1]);
                        if (index > 0) return LogisticsRenderer.getCardinalDir(route[index], route[index - 1]);
                    }
                }

                const segmentSnap = Math.max(nodeSnap, GameEngine.TILE_SIZE * 0.55);
                let bestSegment = null;
                for (let i = 0; i < route.length - 1; i++) {
                    const a = route[i];
                    const b = route[i + 1];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const lenSq = dx * dx + dy * dy;
                    if (lenSq < 0.001) continue;
                    const t = Math.max(0, Math.min(1, ((nodePoint.x - a.x) * dx + (nodePoint.y - a.y) * dy) / lenSq));
                    const px = a.x + dx * t;
                    const py = a.y + dy * t;
                    const dist = Math.hypot(px - nodePoint.x, py - nodePoint.y);
                    if (!bestSegment || dist < bestSegment.dist) bestSegment = { a, b, dist };
                }
                if (!bestSegment || bestSegment.dist > segmentSnap) return null;
                return LogisticsRenderer.getCardinalDir(bestSegment.a, bestSegment.b);
            };
            const getNodeOutputDir = (node) => normalizeDir(node?.outputDir);
            const getNodeInputDir = (node, inputGroupId) => normalizeDir(node?.inputDirections?.[inputGroupId]);
            const addTurn = (targetGroupId, turn) => {
                if (!targetGroupId || !turn) return;
                if (!result.has(targetGroupId)) result.set(targetGroupId, []);
                const existing = result.get(targetGroupId);
                if (existing.some(item => item.key === turn.key && item.inDir.x === turn.inDir.x && item.inDir.y === turn.inDir.y)) return;
                existing.push(turn);
            };

            (Array.isArray(nodes) ? nodes : []).forEach(node => {
                if (!node || !Array.isArray(node.inputGroupIds) || !node.outputGroupId) return;
                const nodePoint = node.point || { x: node.x, y: node.y };
                if (!nodePoint || !Number.isFinite(nodePoint.x) || !Number.isFinite(nodePoint.y)) return;
                const outDir = getNodeOutputDir(node) || getGroupRoutes(node.outputGroupId)
                    .map(route => getRouteDirectionAtNode(route, nodePoint, false))
                    .find(Boolean);
                if (!outDir) return;
                const key = keyOfPoint(nodePoint);
                node.inputGroupIds.forEach(inputGroupId => {
                    const inDir = getNodeInputDir(node, inputGroupId) || getGroupRoutes(inputGroupId)
                        .map(route => getRouteDirectionAtNode(route, nodePoint, true))
                        .find(Boolean);
                    if (!LogisticsRenderer.getTurnArrowDirection(inDir, outDir)) return;
                    addTurn(inputGroupId, {
                        key,
                        x: Math.round(nodePoint.x),
                        y: Math.round(nodePoint.y),
                        inDir,
                        outDir
                    });
                });
            });

            const contactsByKey = new Map();
            const pushContact = (key, contact) => {
                if (!key || !contact?.groupId || !contact.dir) return;
                if (!contactsByKey.has(key)) contactsByKey.set(key, []);
                contactsByKey.get(key).push(contact);
            };
            groupSegments.forEach((groupSegs, groupId) => {
                getGroupRoutes(groupId).forEach(route => {
                    if (!Array.isArray(route) || route.length < 2) return;
                    for (let i = 0; i < route.length - 1; i++) {
                        const a = route[i];
                        const b = route[i + 1];
                        const dir = LogisticsRenderer.getCardinalDir(a, b);
                        if (!dir) continue;
                        const dist = Math.hypot(b.x - a.x, b.y - a.y);
                        const steps = Math.max(1, Math.round(dist / GameEngine.TILE_SIZE));
                        let prevKey = null;
                        for (let step = 0; step <= steps; step++) {
                            const point = {
                                x: a.x + dir.x * GameEngine.TILE_SIZE * step,
                                y: a.y + dir.y * GameEngine.TILE_SIZE * step
                            };
                            const key = keyOfPoint(point);
                            if (prevKey && prevKey !== key) {
                                const [x, y] = key.split(",").map(Number);
                                pushContact(prevKey, { groupId, type: "out", dir, x: Math.round(a.x + dir.x * GameEngine.TILE_SIZE * (step - 1)), y: Math.round(a.y + dir.y * GameEngine.TILE_SIZE * (step - 1)) });
                                pushContact(key, { groupId, type: "in", dir, x, y });
                            }
                            prevKey = key;
                        }
                    }
                });
            });
            (Array.isArray(nodes) ? nodes : []).forEach(node => {
                const outDir = getNodeOutputDir(node);
                if (!outDir) return;
                const nodePoint = node.point || { x: node.x, y: node.y };
                if (!nodePoint || !Number.isFinite(nodePoint.x) || !Number.isFinite(nodePoint.y)) return;
                const key = keyOfPoint(nodePoint);
                const contacts = contactsByKey.get(key) || [];
                contacts
                    .filter(item => item.type === "in")
                    .forEach(input => {
                        if (!LogisticsRenderer.getTurnArrowDirection(input.dir, outDir)) return;
                        addTurn(input.groupId, {
                            key,
                            x: Math.round(nodePoint.x),
                            y: Math.round(nodePoint.y),
                            inDir: input.dir,
                            outDir
                        });
                    });
            });
            contactsByKey.forEach((contacts, key) => {
                const incoming = contacts.filter(item => item.type === "in");
                const outgoing = contacts.filter(item => item.type === "out");
                const distinctContactDirs = new Set(contacts.map(item => `${item.type}:${item.dir.x},${item.dir.y}`));
                const isMergeLikeContact = distinctContactDirs.size >= 3;
                incoming.forEach(input => {
                    const output = outgoing.find(candidate =>
                        (isMergeLikeContact || candidate.groupId !== input.groupId) &&
                        LogisticsRenderer.getTurnArrowDirection(input.dir, candidate.dir)
                    );
                    if (!output) return;
                    const [x, y] = key.split(",").map(Number);
                    addTurn(input.groupId, {
                        key,
                        x,
                        y,
                        inDir: input.dir,
                        outDir: output.dir
                    });
                });
            });
            return result;
        };
        const mergeVisualTurnsByGroup = getMergeVisualTurnsByGroup();

        const primarySelectedGroupId = state.selectedLogisticsGroupId || null;

        const drawnCanonicalGroups = new Set();
        if (Array.isArray(state.logisticsLines)) {
            groupSegments.forEach((groupSegs, groupKey) => {
                if (!Array.isArray(groupSegs) || groupSegs.length === 0) return;

                const representative = groupSegs.find(line => line && (line.sourceId || line.targetId)) || groupSegs[0];
                const widthTiles = Math.max(1, Number(representative?.routeWidth) || 1);
                const segmentRoutes = groupSegs
                    .map(line => ({
                        line,
                        route: logisticsRenderModel.getLineRoute(line)
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
                const rawConnectedCellPaths = portToPortConnectedCellPathsByGroup.get(groupKey) || [];
                const isSelfConnectedGroup = !!representative?.sourceId &&
                    !!representative?.targetId &&
                    representative.sourceId === representative.targetId;
                const connectedCellPaths = isSelfConnectedGroup ? [] : rawConnectedCellPaths;
                const groupOnlyTurnCellKeys = groupTurnCellKeys.get(groupKey);
                const turnCellKeys = LogisticsRenderer.mergeTurnCellKeys(
                    groupOnlyTurnCellKeys
                );
                const mergeVisualTurns = mergeVisualTurnsByGroup.get(groupKey) || [];
                // [交匯點修復] 只跳過「本群組自身」會轉彎的合流格；若該格是別的群組在轉彎，
                // 本群組（直線穿越）仍須照常繪製方形底格與箭頭，否則直線會在交匯點出現缺口。
                const mergeVisualTurnCellKeys = new Set(
                    mergeVisualTurns.map(turn => turn?.key).filter(Boolean)
                );
                const useConnectedIdleStyle = isPhysicallyConnected && !isOperating;
                const effectiveTurnCellKeys = new Set();
                // roundedTurnSkipCellKeys：本群組逐段繪製時要略過「圓角重繪」的格（圓角已由群組層 drawLogisticsGroupRoundedTurns 統一畫）。
                // roundedBaseSkipCellKeys：要略過「方形底圖」的格。預設由 roundedTurnSkipCellKeys 複製而來（不可直接由 turnCellKeys 建構，
                // 否則合流視覺轉彎格的底圖會被一併略過，導致接通後 180 度迴轉末端少一格底圖——見 protocol_alignment 對應回歸測試）。
                const roundedTurnSkipCellKeys = new Set(turnCellKeys ? [...turnCellKeys] : []);
                const roundedBaseSkipCellKeys = new Set(roundedTurnSkipCellKeys);
                mergeVisualTurnCellKeys.forEach(key => {
                    // 合流視覺轉彎格由 drawLogisticsMergeVisualTurns 另行繪製其圓角，故略過圓角重繪；
                    // 但對「本群組」而言此格是直線穿越格(isTurn=false)，必須保留其方形底圖，因此從 base-skip 移除。
                    roundedBaseSkipCellKeys.delete(key);
                    roundedTurnSkipCellKeys.add(key);
                });
                const detachedSplitArrowCellKeys = LogisticsRenderer.getDetachedSplitArrowCellKeys(groupSegs);
                const ordinaryTurnSkipCellKeys = new Set(detachedSplitArrowCellKeys);
                mergeVisualTurnCellKeys.forEach(key => ordinaryTurnSkipCellKeys.add(key));
                groupSegs.forEach(seg => {
                    if (seg?.turnArrowOverride?.cellKey) effectiveTurnCellKeys.add(seg.turnArrowOverride.cellKey);
                });
                (state.logisticsTurnArrowOverrides || []).forEach(override => {
                    if (!override?.cellKey) return;
                    if (override.groupId && override.groupId !== groupKey) return;
                    effectiveTurnCellKeys.add(override.cellKey);
                });
                const ordinaryArrowSkipCellKeys = new Set(effectiveTurnCellKeys);
                if (groupOnlyTurnCellKeys) {
                    groupOnlyTurnCellKeys.forEach(key => {
                        if (key) ordinaryArrowSkipCellKeys.add(key);
                    });
                }
                mergeVisualTurnCellKeys.forEach(key => ordinaryArrowSkipCellKeys.add(key));

                {
                    const baseThickness = logCfg.lineThickness || 3;
                    const thickPx = Math.max(baseThickness, widthTiles * GameEngine.TILE_SIZE);
                    const usePortToPortStyle = !!useConnectedIdleStyle && !!isConnected;
                    const normalColor = usePortToPortStyle
                        ? (logCfg.portToPortLineColor || logCfg.lineColor)
                        : (!isConnected ? (logCfg.disconnectedLineColor || "#6b6b6b") : logCfg.lineColor);
                    const normalAlpha = usePortToPortStyle
                        ? (logCfg.portToPortLineAlpha ?? logCfg.lineAlpha)
                        : (!isConnected ? (logCfg.disconnectedLineAlpha ?? logCfg.lineAlpha) : logCfg.lineAlpha);
                    LogisticsRenderer.drawLogisticsGroupRoundedTurns(
                        graphics,
                        groupSegs,
                        thickPx,
                        parseColor(normalColor),
                        normalAlpha,
                        ordinaryTurnSkipCellKeys
                    );
                    LogisticsRenderer.drawLogisticsMergeVisualTurns(
                        graphics,
                        mergeVisualTurns,
                        thickPx,
                        parseColor(normalColor),
                        normalAlpha,
                        detachedSplitArrowCellKeys
                    );
                }
                const groupDeleteHovered = !!state.logisticsDeleteToolActive &&
                    !!isDeleteHoverGroupMode &&
                    !!groupKey &&
                    deleteHoverGroupIds.has(groupKey);
                segmentRoutes.forEach(({ line, route }) => {
                    // [核心修正] 單擊時僅高亮被點擊的那一段，而不是用 some 讓整個群組都高亮
                    const isLineSelected = logisticsRenderModel.isSelectedLine(line, state);
                    drawLogisticsRoute(route.points, route.width || widthTiles, isLineSelected, isConnected, line, useConnectedIdleStyle, ordinaryArrowSkipCellKeys, roundedBaseSkipCellKeys, roundedTurnSkipCellKeys, null, groupDeleteHovered);
                });
                if (isPortToPortCandidate && useConnectedIdleStyle) {
                    segmentRoutes.forEach(({ route }) => {
                        drawConnectedCellOverlay(route.points, route.width || widthTiles, connectedCellKeys, useConnectedIdleStyle, ordinaryArrowSkipCellKeys, useConnectedIdleStyle, roundedBaseSkipCellKeys);
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
                    graphics.fillStyle(arrowColor, arrowAlpha);
                    LogisticsRenderer.drawLogisticsGroupTurnArrows(
                        graphics,
                        groupSegs,
                        widthTiles,
                        arrowColor,
                        arrowAlpha,
                        arrowSize,
                        null,
                        ordinaryTurnSkipCellKeys
                    );
                    LogisticsRenderer.drawLogisticsMergeVisualTurnArrows(
                        graphics,
                        mergeVisualTurns,
                        arrowColor,
                        arrowAlpha,
                        arrowSize,
                        detachedSplitArrowCellKeys
                    );
                }
                const isGroupSelected = state.selectedLogisticsGroupId
                    ? logisticsRenderModel.getMergeConnectedGroupIds(state.selectedLogisticsGroupId, state).has(groupKey)
                    : groupSegs.some(line => logisticsRenderModel.isSelectedLine(line, state));

                const selectedLine = state.selectedLogisticsLineId
                    ? groupSegs.find(line => logisticsRenderModel.isSelectedLine(line, state))
                    : null;
                const isPrimarySelected = (groupKey === primarySelectedGroupId) || !!selectedLine;

                const showLogisticsLineNumbers = !!state.settings?.showLogisticsLineNumbers;
                if (isPrimarySelected && showLogisticsLineNumbers) {
                    // [核心修正] 移除原先的 segmentRoutes.forEach 繪製紅色方框，因為這會導致單擊也顯示整條方框。
                    // 紅色方框繪製已經被移至 drawLogisticsRoute 內部 (只針對被選中的單獨 line 繪製)。

                    // 顯示格子順序數字 (群組內有任何線段被選中時就顯示整個群組的編號)
                    if (scene.logisticsNumberTexts) {
                        scene.logisticsNumberTexts.forEach(txt => {
                            if (txt && txt.setVisible) txt.setVisible(false);
                        });
                    }
                    if (!scene.logisticsNumberSprites) scene.logisticsNumberSprites = new Map();
                    if (!scene.logisticsVisibleNumberSpriteIds) scene.logisticsVisibleNumberSpriteIds = new Set();

                    // ── 純整數半格座標 Map + 有向鏈式排序（O(n)，支援 8 方向，零浮點） ──
                    // startGx/startGy：segment 起點的半格整數座標（優先讀 seg.startGx）
                    // endGx/endGy    ：segment 終點的半格整數座標（優先讀 seg.endGx）
                    // 舊資料若無這些欄位，從 routePoints 計算（向下相容）

                    const sortedSegs = [];
                    const remaining = [...groupSegs];

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
                            Number.isFinite(seg?.endGx) && Number.isFinite(seg?.endGy)) {
                            return { startGx: seg.startGx, startGy: seg.startGy, endGx: seg.endGx, endGy: seg.endGy };
                        }
                        const s = seg?.routePoints?.[0] || { x: seg?.x || 0, y: seg?.y || 0 };
                        const e = seg?.routePoints?.[seg?.routePoints?.length - 1] || s;
                        return {
                            startGx: Math.round(s.x / _align), startGy: Math.round(s.y / _align),
                            endGx: Math.round(e.x / _align), endGy: Math.round(e.y / _align)
                        };
                    };
                    const _gKey = (gx, gy) => `${gx},${gy}`;

                    // 建立 startMap 與 endKeySet（整數格座標，無浮點問題）
                    // _endKeySet 擴展至 ±2 鄰居以容納轉彎 2 格半格座標偏差，排除自身起點
                    const _startMap = new Map();
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
                                for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]) {
                                    const cc = _startMap.get(_gKey(ex2 + dx, ey2 + dy));
                                    if (cc && _remaining.has(cc)) { _n2 = cc; break; }
                                }
                            }
                            _c2 = (_n2 && _remaining.has(_n2)) ? _n2 : null;
                        }
                    }


                    // 若整條鏈的方向與 startAnchor 相反，翻轉
                    if (startAnchor && sortedSegs.length > 1) {
                        const firstGC = _getGCoords(sortedSegs[0]);
                        const lastGC = _getGCoords(sortedSegs[sortedSegs.length - 1]);
                        const firstPx = { x: firstGC.startGx * _align, y: firstGC.startGy * _align };
                        const lastPx = { x: lastGC.startGx * _align, y: lastGC.startGy * _align };
                        const fd = Math.hypot(firstPx.x - startAnchor.x, firstPx.y - startAnchor.y);
                        const ld = Math.hypot(lastPx.x - startAnchor.x, lastPx.y - startAnchor.y);
                        if (ld < fd) sortedSegs.reverse();
                    }

                    // 為每個 segment 標記顯示座標（起點格的像素位置）
                    sortedSegs.forEach(seg => {
                        const gc = _getGCoords(seg);
                        seg.__numberLabelPoint = { x: gc.startGx * _align, y: gc.startGy * _align };
                        seg.__numberNextPoint = { x: gc.endGx * _align, y: gc.endGy * _align };
                    });

                    const numberRoutes = selectedLine && !state.selectedLogisticsGroupId
                        ? [logisticsRenderModel.getLineRoute(selectedLine)?.points || []]
                        : LogisticsRenderer.getSelectedGroupDebugRoutePoints(state, groupKey, groupSegs);
                    const numberSourceSegs = selectedLine && !state.selectedLogisticsGroupId
                        ? [selectedLine]
                        : groupSegs;
                    const numberStartIndex = selectedLine && !state.selectedLogisticsGroupId
                        ? LogisticsRenderer.getSingleLineDebugNumberStartIndex(state, groupKey, groupSegs, selectedLine)
                        : 0;
                    LogisticsRenderer.renderDebugRouteNumberSprites(scene, groupKey, numberRoutes, numberSourceSegs, numberStartIndex);
                    const extendedAllowedCellKeys = new Set();
                    numberRoutes.forEach(points => {
                        if (Array.isArray(points)) {
                            points.forEach(pt => {
                                extendedAllowedCellKeys.add(`${Math.round(pt.x)},${Math.round(pt.y)}`);
                            });
                        }
                    });
                    numberRoutes.forEach(points => {
                        LogisticsRenderer.drawRoutePointsDebug(graphics, points, extendedAllowedCellKeys);
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
        LogisticsRenderer.endLogisticsNumberSprites(scene);

        // 用整個群組拓撲畫轉角箭頭，避免單段 route（通常只有兩點）看不到轉彎。
        const drawnTurnGroups = new Set();
        groupSegments.forEach((groupSegs, groupKey) => {
            if (!Array.isArray(groupSegs) || groupSegs.length === 0) return;
            if (drawnTurnGroups.has(groupKey)) return;
            if (drawnCanonicalGroups.has(groupKey)) return;
            const sample = groupSegs[0] || {};
            const widthTiles = Math.max(1, Number(sample.routeWidth) || 1);
            const connected = portToPortConnectedGroupIds.has(groupKey) && hasLogisticsTransportFilter(groupKey, groupSegs);
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
                            const route = logisticsRenderModel.getConnectionRoute(ent, target, conn);
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
        flushSelectedLogisticsOutlines();
        if (options.drawBuildPreview !== false) {
            LogisticsRenderer.renderBuildPreview(graphics, state, scene, false);
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
                    const routeInfo = logisticsRenderModel.getConnectionTransferRoute(source, target, conn) ||
                        { points: [{ x: source.x, y: source.y }, { x: target.x, y: target.y }] };

                    const points = routeInfo.points;
                    if (Array.isArray(points)) {
                        LogisticsRenderer.annotateRoutePoints(points);
                    }

                    const pathPoint = LogisticsRenderer.getPointOnTransferPath(points, t.progress, 0);
                    let currentX = pathPoint ? pathPoint.x : source.x;
                    let currentY = pathPoint ? pathPoint.y : source.y;

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

    static renderSourcePortCells(graphics, state, scene) {
        if (!graphics || !state || !scene) return;
        const logCfg = UI_CONFIG.LogisticsSystem || {};
        const parseColor = (c) => scene.hexOrRgba(c).color;
        const fillColor = parseColor(logCfg.sourcePortCellColor || "#00ff44ff");
        const strokeColor = parseColor(logCfg.sourcePortCellStrokeColor || "#ffff00ff");
        const alpha = logCfg.sourcePortCellAlpha ?? 0.85;
        const strokeAlpha = logCfg.sourcePortCellStrokeAlpha ?? 1;
        const TS = GameEngine.TILE_SIZE || 20;
        const drawn = new Set();
        const drawPort = (port) => {
            if (!port || !Number.isFinite(port.x) || !Number.isFinite(port.y)) return;
            const rect = window.UIManager?.getPortSlotRect?.(port) || {
                x: port.x - TS / 2,
                y: port.y - TS / 2,
                w: TS,
                h: TS
            };
            const key = `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.w)},${Math.round(rect.h)}`;
            if (drawn.has(key)) return;
            drawn.add(key);
            graphics.fillStyle(fillColor, alpha);
            graphics.fillRect(rect.x, rect.y, rect.w, rect.h);
            graphics.lineStyle(Math.max(2, Math.round(TS * 0.12)), strokeColor, strokeAlpha);
            graphics.strokeRect(rect.x, rect.y, rect.w, rect.h);
        };

        (state.logisticsLines || []).forEach(line => {
            drawPort(line?.sourcePort);
            drawPort(line?.targetPort);
        });
        (state.mapEntities || []).forEach(ent => {
            (ent?.outputTargets || []).forEach(target => {
                drawPort(target?.sourcePort);
                drawPort(target?.targetPort);
            });
        });
    }

    static renderBuildingPortCells(graphics, entities, scene) {
        if (!graphics || !Array.isArray(entities) || !window.UIManager) return;
        const logCfg = UI_CONFIG.LogisticsSystem || {};
        const parseColor = (c) => scene.hexOrRgba(c).color;
        const fillColor = parseColor(logCfg.sourcePortCellColor || "#00ff44ff");
        const strokeColor = parseColor(logCfg.sourcePortCellStrokeColor || "#ffff00ff");
        const disconnectedFillColor = parseColor(logCfg.disconnectedPortCellColor || "#888888ff");
        const disconnectedStrokeColor = parseColor(logCfg.disconnectedPortCellStrokeColor || "#aaaaaaff");
        const alpha = logCfg.sourcePortCellAlpha ?? 0.85;
        const strokeAlpha = logCfg.sourcePortCellStrokeAlpha ?? 1;
        const TS = GameEngine.TILE_SIZE || 20;
        const drawn = new Set();

        const lines = GameEngine.state?.logisticsLines || [];
        const isPortConnected = (entityId, slot) => {
            return lines.some(line => {
                if (line.sourceId === entityId && line.sourcePort) {
                    if ((line.sourcePort.dir || null) === (slot.dir || null) &&
                        (line.sourcePort.slotIndex ?? line.sourcePort.defIndex ?? null) === (slot.slotIndex ?? slot.defIndex ?? null)) {
                        return true;
                    }
                }
                if (line.targetId === entityId && line.targetPort) {
                    if ((line.targetPort.dir || null) === (slot.dir || null) &&
                        (line.targetPort.slotIndex ?? line.targetPort.defIndex ?? null) === (slot.slotIndex ?? slot.defIndex ?? null)) {
                        return true;
                    }
                }
                return false;
            });
        };

        entities.forEach(ent => {
            if (!window.UIManager.canShowLogisticsPorts?.(ent)) return;
            const entityId = window.UIManager.getEntityId?.(ent) || `${ent.type1}_${ent.x}_${ent.y}`;
            const slots = window.UIManager.getBuildingPortSlots?.(ent) || [];
            slots.forEach(slot => {
                const rect = window.UIManager.getPortSlotRect?.(slot);
                if (!rect) return;
                const key = `${entityId}:${slot.defIndex}:${slot.slotIndex}:${slot.dir}:${Math.round(slot.x)},${Math.round(slot.y)}`;
                if (drawn.has(key)) return;
                drawn.add(key);

                const connected = isPortConnected(entityId, slot);

                graphics.fillStyle(connected ? fillColor : disconnectedFillColor, alpha);
                graphics.fillRect(rect.x, rect.y, rect.w, rect.h);
                graphics.lineStyle(Math.max(2, Math.round(TS * 0.12)), connected ? strokeColor : disconnectedStrokeColor, strokeAlpha);
                graphics.strokeRect(rect.x, rect.y, rect.w, rect.h);
            });
        });
    }

    static drawArrowhead(g, x, y, ux, uy, size) {
        // ux, uy 是單位方向向量
        const scale = Math.max(0.1, Number(UI_CONFIG.LogisticsSystem?.arrowGlobalScale) || 1);
        const scaledSize = size * scale;
        const px = -uy * (scaledSize * 0.6); // 垂直方向偏移
        const py = ux * (scaledSize * 0.6);

        g.beginPath();
        g.moveTo(x + ux * scaledSize, y + uy * scaledSize); // 頂點
        g.lineTo(x - ux * scaledSize * 0.5 + px, y - uy * scaledSize * 0.5 + py); // 底角 1
        g.lineTo(x - ux * scaledSize * 0.5 - px, y - uy * scaledSize * 0.5 - py); // 底角 2
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
        // [效能] 每幀對每個合流 transfer 解析路由會呼叫 getLogisticsMergeNodeOutputRoute / getSegmentsByGroupId
        // (內含 O(段×25) 的 orderByDirection)。一幀內拓樸穩定且僅讀,開啟同一個計算快取窗口把這些查詢
        // 收斂為 per node/per group 一次。單執行緒下與 logic tick 不會交錯,各自成對開關。
        const cs = logisticsRenderModel && logisticsRenderModel.system;
        if (cs && typeof cs.beginLogisticsComputeCache === 'function') cs.beginLogisticsComputeCache();
        try {
            LogisticsRenderer._renderTransfersImpl(graphics, state, scene);
        } finally {
            if (cs && typeof cs.endLogisticsComputeCache === 'function') cs.endLogisticsComputeCache();
        }
    }

    static _renderTransfersImpl(graphics, state, scene) {
        const useSpriteTransfers = LogisticsRenderer.canUseTransferSprites(scene);
        if (useSpriteTransfers) {
            LogisticsRenderer.beginTransferSprites(scene);
        }
        // [效能] 序號一律走「池化文字」路徑：序號單調遞增且永不重複，若烤進 GPU 材質會造成材質無限增生
        LogisticsRenderer.beginTransferSerialLabels(scene);
        if (!state || !Array.isArray(state.activeTransfers) || state.activeTransfers.length === 0) {
            if (useSpriteTransfers) LogisticsRenderer.endTransferSprites(scene);
            LogisticsRenderer.endTransferSerialLabels(scene);
            return;
        }

        // [效能 LOD] 序號文字每個都是獨立 GPU 材質 / 一個 draw call(無法批次)。物品多或縮放小時數字
        // 本就讀不到,卻成為主執行緒卸載(worker)後的繪製瓶頸。縮放夠大且數量不多時才畫;否則全部隱藏。
        const camZoom = scene?.cameras?.main?.zoom || 1;
        const transferCount = state.activeTransfers.length;
        const showSerial = camZoom >= 0.85 && transferCount <= 150;

        let entityById = null;
        let directConnByKey = null;
        const getEntity = (id) => {
            if (!id) return null;
            if (!entityById) {
                entityById = new Map();
                (state.mapEntities || []).forEach(ent => {
                    if (ent) entityById.set(ent.id || `${ent.type1}_${ent.x}_${ent.y}`, ent);
                });
            }
            return entityById.get(id);
        };
        const getDirectConn = (sourceId, targetId) => {
            if (!directConnByKey) directConnByKey = new Map();
            const key = `${sourceId}>${targetId || ""}`;
            if (directConnByKey.has(key)) return directConnByKey.get(key);
            const source = getEntity(sourceId);
            if (!source || !Array.isArray(source.outputTargets)) {
                directConnByKey.set(key, null);
                return null;
            }
            const conn = source.outputTargets.find(item => item && item.id === targetId) || null;
            directConnByKey.set(key, conn);
            return conn;
        };

        const cam = scene && scene.cameras && scene.cameras.main;
        const cullView = cam && cam.worldView && cam.worldView.width > 0 && cam.worldView.height > 0
            ? cam.worldView
            : null;
        const cullMargin = (GameEngine.TILE_SIZE || 20) * 2;
        const isTransferPointVisible = (x, y) => {
            if (!cullView) return true;
            return x >= cullView.x - cullMargin && x <= cullView.right + cullMargin &&
                   y >= cullView.y - cullMargin && y <= cullView.bottom + cullMargin;
        };

        state.activeTransfers.forEach(t => {
            let px, py;
            let routePoints = t.routePoints;
            const hasStoredRoute = Array.isArray(routePoints) && routePoints.length >= 2;

            if (hasStoredRoute) {
                if (!t._routeAnnotated) {
                    LogisticsRenderer.annotateRoutePoints(routePoints);
                    t._routeAnnotated = true;
                }
                const transferProgress = LogisticsRenderer.resolveTransferProgress(t, routePoints, GameEngine.TILE_SIZE);
                
                // DOD: Try fetching dense path first
                let usedDense = false;
                const pathPoint = LogisticsRenderer.getPointOnMergeTransferPath(routePoints, transferProgress, t, state);
                if (pathPoint) {
                    px = pathPoint.x;
                    py = pathPoint.y;
                    t._renderAngle = Number.isFinite(pathPoint.angle) ? pathPoint.angle : (t._renderAngle || 0);
                } else {
                    const dense = LogisticsRenderer.getDenseTransferPath(routePoints);
                    if (dense) {
                        const targetDist = Math.max(0, Math.min(dense.totalPixels, transferProgress * dense.totalPixels));
                        const idx = Math.floor(targetDist);
                        const offset = idx * 3;
                        px = dense.buffer[offset];
                        py = dense.buffer[offset + 1];
                        t._renderAngle = dense.buffer[offset + 2];
                        usedDense = true;
                    } else {
                        const pt = LogisticsRenderer.getPointOnTransferPath(routePoints, transferProgress, 0, t);
                        if (!pt) return;
                        px = pt.x;
                        py = pt.y;
                        t._renderAngle = Number.isFinite(pt.angle) ? pt.angle : (t._renderAngle || 0);
                    }
                }
            } else {
                const source = getEntity(t.sourceId);
                const target = getEntity(t.targetId);
                if (!source && !target) return;

                const directConn = getDirectConn(t.sourceId, t.targetId);
                routePoints = LogisticsRenderer.resolveNormalizedTransferRoutePoints(source, target, directConn, t);

                if (directConn?.lineId && (!Array.isArray(routePoints) || routePoints.length < 2)) return;

                if (Array.isArray(routePoints) && routePoints.length >= 2) {
                    LogisticsRenderer.annotateRoutePoints(routePoints);
                    const transferProgress = LogisticsRenderer.resolveTransferProgress(t, routePoints, GameEngine.TILE_SIZE);
                    const pathPoint = LogisticsRenderer.getPointOnMergeTransferPath(routePoints, transferProgress, t, state) ||
                        LogisticsRenderer.getPointOnTransferPath(routePoints, transferProgress, 0, t);
                    if (!pathPoint) return;
                    px = pathPoint.x;
                    py = pathPoint.y;
                    t._renderAngle = Number.isFinite(pathPoint.angle) ? pathPoint.angle : (t._renderAngle || 0);
                } else if (source && target) {
                    const transferProgress = LogisticsRenderer.resolveTransferProgress(t, null, GameEngine.TILE_SIZE);
                    px = source.x + (target.x - source.x) * transferProgress;
                    py = source.y + (target.y - source.y) * transferProgress;
                    t._renderAngle = Math.atan2(target.y - source.y, target.x - source.x);
                } else {
                    return;
                }
            }

            if (!isTransferPointVisible(px, py)) return;
            const color = (scene && typeof scene.getResourceIconColor === 'function')
                ? scene.getResourceIconColor(t.itemType)
                : 0xffffff;

            const itemSize = GameEngine.TILE_SIZE;
            const half = itemSize / 2;
            const strokeWidth = Math.max(2, Math.min(3, itemSize * 0.12));
            const inset = strokeWidth / 2;

            if (useSpriteTransfers) {
                LogisticsRenderer.renderTransferSprite(scene, t, px, py, color, itemSize, strokeWidth, t._renderAngle || 0);
            } else {
                graphics.fillStyle(0x222222, 1);
                graphics.fillRect(px - half, py - half, itemSize, itemSize);
                graphics.lineStyle(strokeWidth, color, 1);
                graphics.strokeRect(
                    px - half + inset,
                    py - half + inset,
                    itemSize - strokeWidth,
                    itemSize - strokeWidth
                );
            }
            if (showSerial) LogisticsRenderer.renderTransferSerialLabel(scene, t, px, py, itemSize);
        });
        if (useSpriteTransfers) LogisticsRenderer.endTransferSprites(scene);
        // showSerial=false 時本幀無任何 label 被標記為可見,endTransferSerialLabels 會銷毀全部殘留文字,移除其 draw call。
        LogisticsRenderer.endTransferSerialLabels(scene);
    }

    static renderBuildPreview(graphics, state, scene, clear = true) {
        if (!graphics || !state || !scene) return;
        if (clear) graphics.clear();

        const logCfg = UI_CONFIG.LogisticsSystem || {
            lineThickness: 3,
            dragLineColor: "#8bc34a",
            dragLineAlpha: 0.8
        };
        const parseColor = (c) => scene.hexOrRgba(c).color;

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
            LogisticsRenderer.strokeRoundedPolyline(graphics, dragPoints);
        }

        if (!Array.isArray(state.conveyorGhosts) || state.conveyorGhosts.length === 0) return;

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
        {
            const segments = logisticsRenderModel.buildPreviewSegments(rawGhostPoints, routeWidth);
            const routePoints = [];
            (segments || []).forEach((segment, index) => {
                const segPoints = Array.isArray(segment.routePoints) ? segment.routePoints : [];
                if (segPoints.length < 2) return;
                if (index === 0) routePoints.push({ x: segPoints[0].x, y: segPoints[0].y });
                routePoints.push({ x: segPoints[1].x, y: segPoints[1].y });
            });
            if (routePoints.length >= 2) ghostPoints = routePoints;
        }

        LogisticsRenderer.drawLogisticsCells(graphics, ghostPoints, routeWidth, 1);
        const lastGhost = rawGhostPoints[rawGhostPoints.length - 1];
        const isTargetPort = lastGhost?.isPortConnector;
        if (!isTargetPort) {
            const endpointRect = LogisticsRenderer.getLogisticsEndpointCellRect(ghostPoints, routeWidth);
            if (endpointRect) {
                graphics.fillRect(endpointRect.x, endpointRect.y, endpointRect.w, endpointRect.h);
            }
        }
        const ghostArrowRects = LogisticsRenderer.getLogisticsCellRects(ghostPoints, routeWidth, true);
        if (!isTargetPort) {
            const endpointRect = LogisticsRenderer.getLogisticsEndpointCellRect(ghostPoints, routeWidth);
            if (endpointRect) ghostArrowRects.push(endpointRect);
        }
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

        previewSegments.forEach((ghost) => {
            const wx = (ghost.x + offset.x * offsetScale) * gridUnit;
            const wy = (ghost.y + offset.y * offsetScale) * gridUnit;
            if (ghost.isMerger) {
                graphics.lineStyle(3, 0xffff00, 1);
                graphics.strokeCircle(wx, wy, TS / 3);
                graphics.lineStyle(2, ghostColor, 0.8);
            }
        });
    }

    static getLogisticsNumberAtlasKey() {
        return "logistics_number_labels_40x24_yellow";
    }

    static getLogisticsNumberFrameName(label) {
        return `n_${String(label || "0").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    }

    static ensureLogisticsNumberTexture(scene, label) {
        if (!scene || !scene.textures) return { key: null, frame: null };
        const key = LogisticsRenderer.getLogisticsNumberAtlasKey();
        const frame = LogisticsRenderer.getLogisticsNumberFrameName(label);
        if (!scene.logisticsNumberAtlas) {
            const frameW = 40;
            const frameH = 24;
            const cols = 25;
            const rows = 25;
            const texture = scene.textures.exists(key)
                ? scene.textures.get(key)
                : scene.textures.createCanvas(key, cols * frameW, rows * frameH);
            scene.logisticsNumberAtlas = { texture, frameW, frameH, cols, rows, nextIndex: 0, frames: new Set() };
        }

        const atlas = scene.logisticsNumberAtlas;
        if (!atlas.texture || atlas.frames.has(frame) || (atlas.texture.has && atlas.texture.has(frame))) {
            atlas.frames.add(frame);
            return { key, frame };
        }

        const slot = atlas.nextIndex++;
        if (slot >= atlas.cols * atlas.rows) return { key: null, frame: null };

        const x = (slot % atlas.cols) * atlas.frameW;
        const y = Math.floor(slot / atlas.cols) * atlas.frameH;
        const ctx = atlas.texture.getContext();
        ctx.clearRect(x, y, atlas.frameW, atlas.frameH);
        ctx.font = "16px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#000000";
        ctx.fillStyle = "#ffff00";
        ctx.strokeText(String(label), x + atlas.frameW / 2, y + atlas.frameH / 2);
        ctx.fillText(String(label), x + atlas.frameW / 2, y + atlas.frameH / 2);
        if (atlas.texture.add) atlas.texture.add(frame, 0, x, y, atlas.frameW, atlas.frameH);
        atlas.texture.refresh();
        atlas.frames.add(frame);
        return { key, frame };
    }

    static renderLogisticsNumberSprite(scene, id, label, x, y) {
        if (!scene || !scene.add || !scene.add.image) return;
        if (!scene.logisticsNumberSprites) scene.logisticsNumberSprites = new Map();
        if (!scene.logisticsVisibleNumberSpriteIds) scene.logisticsVisibleNumberSpriteIds = new Set();

        const textureInfo = LogisticsRenderer.ensureLogisticsNumberTexture(scene, label);
        if (!textureInfo.key) return;

        let sprite = scene.logisticsNumberSprites.get(id);
        if (!sprite) {
            if (!scene.textures.exists(textureInfo.key)) return;
            sprite = scene.add.image(x, y, textureInfo.key, textureInfo.frame).setOrigin(0.5).setDepth(600000);
            scene.logisticsNumberSprites.set(id, sprite);
        } else {
            if (sprite.texture?.key !== textureInfo.key || sprite.frame?.name !== textureInfo.frame) {
                sprite.setTexture(textureInfo.key, textureInfo.frame);
            }
            sprite.setPosition(x, y);
            if (sprite.depth !== 600000) sprite.setDepth(600000);
            sprite.setVisible(true);
        }
        scene.logisticsVisibleNumberSpriteIds.add(id);
    }

    static endLogisticsNumberSprites(scene) {
        if (!scene || !scene.logisticsNumberSprites) return;
        scene.logisticsNumberSprites.forEach((sprite, key) => {
            if (!scene.logisticsVisibleNumberSpriteIds || !scene.logisticsVisibleNumberSpriteIds.has(key)) {
                sprite.setVisible(false);
            }
        });
        if (scene.logisticsVisibleNumberSpriteIds) scene.logisticsVisibleNumberSpriteIds.clear();
    }

    static canUseTransferSprites(scene) {
        return !!(scene && scene.add && scene.add.image && scene.textures && scene.textures.createCanvas);
    }

    static beginTransferSprites(scene) {
        if (!scene) return;
        if (!scene.logisticsTransferBlitters) scene.logisticsTransferBlitters = new Map();
        if (!scene.logisticsTransferBobs) scene.logisticsTransferBobs = new Map();
        scene.logisticsVisibleTransferSpriteIds = new Set();
    }

    static endTransferSprites(scene) {
        if (!scene || !scene.logisticsTransferBobs) return;
        // [效能] 配合 Blitter，將已送達的 bob 銷毀並從池中刪除。
        scene.logisticsTransferBobs.forEach((bobData, key) => {
            if (!scene.logisticsVisibleTransferSpriteIds || !scene.logisticsVisibleTransferSpriteIds.has(key)) {
                if (bobData.bob && bobData.bob.destroy) bobData.bob.destroy();
                scene.logisticsTransferBobs.delete(key);
            }
        });
    }

    static getTransferAtlasKey(color, itemSize, strokeWidth) {
        const safeColor = Math.max(0, Number(color) || 0).toString(16).padStart(6, "0");
        return `logistics_transfer_atlas_${itemSize}_${Math.round(strokeWidth * 10)}_${safeColor}`;
    }

    static getTransferFrameName(label) {
        return `n_${String(label || "none").replace(/[^a-zA-Z0-9_-]/g, "_") || "none"}`;
    }

    static ensureTransferTexture(scene, color, label, itemSize, strokeWidth) {
        if (!scene || !scene.textures) return { key: null, frame: null };
        if (!scene.logisticsTransferAtlases) scene.logisticsTransferAtlases = new Map();

        const key = LogisticsRenderer.getTransferAtlasKey(color, itemSize, strokeWidth);
        const frame = LogisticsRenderer.getTransferFrameName(label);
        let atlas = scene.logisticsTransferAtlases.get(key);
        if (!atlas) {
            const maxSize = 1024;
            const cols = Math.max(1, Math.floor(maxSize / itemSize));
            const rows = Math.max(1, Math.floor(maxSize / itemSize));
            const width = cols * itemSize;
            const height = rows * itemSize;
            const texture = scene.textures.exists(key)
                ? scene.textures.get(key)
                : scene.textures.createCanvas(key, width, height);
            atlas = { texture, cols, rows, nextIndex: 0, frames: new Set() };
            scene.logisticsTransferAtlases.set(key, atlas);
        }

        if (!atlas.texture || atlas.frames.has(frame) || (atlas.texture.has && atlas.texture.has(frame))) {
            atlas.frames.add(frame);
            return { key, frame };
        }

        const slot = atlas.nextIndex++;
        if (slot >= atlas.cols * atlas.rows) {
            return LogisticsRenderer.ensureSingleTransferTexture(scene, color, label, itemSize, strokeWidth);
        }

        const x = (slot % atlas.cols) * itemSize;
        const y = Math.floor(slot / atlas.cols) * itemSize;
        const texture = atlas.texture;
        const ctx = texture.getContext();
        LogisticsRenderer.drawTransferTextureCell(ctx, x, y, color, label, itemSize, strokeWidth);
        if (texture.add) texture.add(frame, 0, x, y, itemSize, itemSize);
        texture.refresh();
        atlas.frames.add(frame);
        return { key, frame };
    }

    static ensureSingleTransferTexture(scene, color, label, itemSize, strokeWidth) {
        const safeColor = Math.max(0, Number(color) || 0).toString(16).padStart(6, "0");
        const safeLabel = String(label || "").replace(/[^a-zA-Z0-9_-]/g, "_") || "none";
        const key = `logistics_transfer_${itemSize}_${Math.round(strokeWidth * 10)}_${safeColor}_${safeLabel}`;
        if (!scene.textures.exists(key)) {
            const texture = scene.textures.createCanvas(key, itemSize, itemSize);
            const ctx = texture.getContext();
            LogisticsRenderer.drawTransferTextureCell(ctx, 0, 0, color, label, itemSize, strokeWidth);
            texture.refresh();
        }
        return { key, frame: null };
    }

    static drawTransferTextureCell(ctx, x, y, color, label, itemSize, strokeWidth) {
        const inset = strokeWidth / 2;
        const fontSize = label
            ? Math.max(8, Math.min(12, Math.floor(itemSize * (String(label).length > 2 ? 0.42 : 0.52))))
            : 0;
        const hex = `#${Math.max(0, Number(color) || 0).toString(16).padStart(6, "0").slice(-6)}`;

        ctx.clearRect(x, y, itemSize, itemSize);
        ctx.fillStyle = "#222222";
        ctx.fillRect(x, y, itemSize, itemSize);
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = hex;
        ctx.strokeRect(x + inset, y + inset, itemSize - strokeWidth, itemSize - strokeWidth);

        if (label) {
            ctx.font = `${fontSize}px Arial, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#000000";
            ctx.fillStyle = "#ffffff";
            ctx.strokeText(String(label), x + itemSize / 2, y + itemSize / 2);
            ctx.fillText(String(label), x + itemSize / 2, y + itemSize / 2);
        }
    }

    static renderTransferSprite(scene, transfer, x, y, color, itemSize, strokeWidth, angle = 0) {
        if (!scene || !transfer) return;
        if (!scene.logisticsTransferBlitters) scene.logisticsTransferBlitters = new Map();
        if (!scene.logisticsTransferBobs) scene.logisticsTransferBobs = new Map();
        if (!scene.logisticsVisibleTransferSpriteIds) scene.logisticsVisibleTransferSpriteIds = new Set();

        const key = transfer.id || `transfer_${transfer.serialNumber || scene.logisticsTransferBobs.size}`;
        // [效能] 取消獨立材質快取字串標籤
        const label = "";
        const textureInfo = LogisticsRenderer.ensureTransferTexture(scene, color, label, itemSize, strokeWidth);
        const textureKey = textureInfo.key;
        const frame = textureInfo.frame;
        if (!textureKey) return;

        const depth = scene.logisticsTransferGraphics?.depth || 900000;
        
        let blitter = scene.logisticsTransferBlitters.get(textureKey);
        if (!blitter) {
            blitter = scene.add.blitter(0, 0, textureKey).setDepth(depth);
            scene.logisticsTransferBlitters.set(textureKey, blitter);
        } else if (blitter.depth !== depth) {
            blitter.setDepth(depth);
        }

        let bobData = scene.logisticsTransferBobs.get(key);
        if (!bobData) {
            const bob = blitter.create(x, y, frame || undefined);
            bobData = { bob, blitterKey: textureKey };
            scene.logisticsTransferBobs.set(key, bobData);
        } else {
            // 若材質更換（極少發生），需重建 bob
            if (bobData.blitterKey !== textureKey) {
                if (bobData.bob && bobData.bob.destroy) bobData.bob.destroy();
                const newBob = blitter.create(x, y, frame || undefined);
                bobData = { bob: newBob, blitterKey: textureKey };
                scene.logisticsTransferBobs.set(key, bobData);
            } else {
                if (frame) bobData.bob.frame = blitter.texture.get(frame);
            }
        }
        
        // Phaser Bob 原點固定在左上角，因此這裡加上偏移量達到居中效果
        bobData.bob.x = x - itemSize / 2;
        bobData.bob.y = y - itemSize / 2;
        bobData.bob.alpha = 1;

        scene.logisticsVisibleTransferSpriteIds.add(key);
    }

    static beginTransferSerialLabels(scene) {
        // [效能] 移除獨立字體渲染，改為空操作以減輕 Draw Calls
    }

    static hideTransferSerialLabels(scene) {
        // [效能] 移除獨立字體渲染，改為空操作以減輕 Draw Calls
    }

    static endTransferSerialLabels(scene) {
        // [效能] 移除獨立字體渲染，改為空操作以減輕 Draw Calls
    }

    static renderTransferSerialLabel(scene, transfer, x, y, itemSize) {
        // [效能] 移除獨立字體渲染，改為空操作以減輕 Draw Calls
    }

    static resolveTransferRoutePoints(source, target, directConn, transfer) {
        let routePoints = Array.isArray(transfer.routePoints) && transfer.routePoints.length >= 2
            ? transfer.routePoints
            : null;
        if (routePoints) return routePoints;
        if (!directConn) return routePoints;

        const transferRoute = logisticsRenderModel.getConnectionTransferRoute(source, target, directConn);
        return routePoints || (transferRoute && Array.isArray(transferRoute.points) && transferRoute.points.length >= 2
            ? transferRoute.points.map(p => ({ x: p.x, y: p.y }))
            : (!directConn.lineId && Array.isArray(directConn.routePoints) && directConn.routePoints.length >= 2
                ? directConn.routePoints.map(p => ({ x: p.x, y: p.y }))
                : null));
    }

    static getRoutePointsCacheKey(points, source, target) {
        const routeKey = Array.isArray(points)
            ? points.map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join("|")
            : "";
        const sourceKey = source ? (source.id || `${source.type1}_${source.x}_${source.y}`) : "";
        const targetKey = target ? (target.id || `${target.type1}_${target.x}_${target.y}`) : "";
        return `${sourceKey}>${targetKey}:${routeKey}`;
    }

    static resolveNormalizedTransferRoutePoints(source, target, directConn, transfer) {
        const rawPoints = LogisticsRenderer.resolveTransferRoutePoints(source, target, directConn, transfer);
        if (!Array.isArray(rawPoints) || rawPoints.length < 2) return rawPoints;

        const sourceKey = source ? (source.id || `${source.type1}_${source.x}_${source.y}`) : "";
        const targetKey = target ? (target.id || `${target.type1}_${target.x}_${target.y}`) : "";
        if (
            transfer._renderRawRoutePointsRef === rawPoints &&
            transfer._renderRouteSourceKey === sourceKey &&
            transfer._renderRouteTargetKey === targetKey &&
            Array.isArray(transfer._renderNormalizedRoutePoints)
        ) {
            return transfer._renderNormalizedRoutePoints;
        }

        const cacheKey = LogisticsRenderer.getRoutePointsCacheKey(rawPoints, source, target);
        if (transfer._renderNormalizedRouteKey === cacheKey && Array.isArray(transfer._renderNormalizedRoutePoints)) {
            transfer._renderRawRoutePointsRef = rawPoints;
            transfer._renderRouteSourceKey = sourceKey;
            transfer._renderRouteTargetKey = targetKey;
            return transfer._renderNormalizedRoutePoints;
        }

        const routePoints = LogisticsRenderer.normalizeTransferRoutePoints(source, target, rawPoints);
        if (Array.isArray(routePoints)) {
            LogisticsRenderer.annotateRoutePoints(routePoints);
        }
        transfer._renderRawRoutePointsRef = rawPoints;
        transfer._renderRouteSourceKey = sourceKey;
        transfer._renderRouteTargetKey = targetKey;
        transfer._renderNormalizedRouteKey = cacheKey;
        transfer._renderNormalizedRoutePoints = routePoints;
        return routePoints;
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
        if (points.length < 2) return points;
        if (!source && !target) return points;

        const distance = (entity, point) => Math.hypot((entity.x || 0) - point.x, (entity.y || 0) - point.y);
        const first = points[0];
        const last = points[points.length - 1];

        let directScore = 0;
        let reverseScore = 0;
        if (source && target) {
            directScore = distance(source, first) + distance(target, last);
            reverseScore = distance(source, last) + distance(target, first);
        } else if (source) {
            directScore = distance(source, first);
            reverseScore = distance(source, last);
        } else if (target) {
            directScore = distance(target, last);
            reverseScore = distance(target, first);
        }
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

    static getTransferPathMetrics(points, cacheOwner = null) {
        if (!Array.isArray(points) || points.length < 2) return null;
        if (cacheOwner && cacheOwner._renderRouteMetricsPoints === points && cacheOwner._renderRouteMetrics) {
            return cacheOwner._renderRouteMetrics;
        }
        const key = points.map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join("|");
        if (cacheOwner && cacheOwner._renderRouteMetricsKey === key && cacheOwner._renderRouteMetrics) {
            cacheOwner._renderRouteMetricsPoints = points;
            return cacheOwner._renderRouteMetrics;
        }

        const visualPoints = LogisticsRenderer.buildRoundedLogisticsPathPoints(points);
        const metricPoints = Array.isArray(visualPoints) && visualPoints.length >= 2 ? visualPoints : points;
        const lengths = [];
        let totalLength = 0;
        for (let i = 0; i < metricPoints.length - 1; i++) {
            const a = metricPoints[i];
            const b = metricPoints[i + 1];
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            lengths.push(length);
            totalLength += length;
        }

        const metrics = { key, points: metricPoints, lengths, totalLength };
        if (cacheOwner) {
            cacheOwner._renderRouteMetricsPoints = points;
            cacheOwner._renderRouteMetricsKey = key;
            cacheOwner._renderRouteMetrics = metrics;
        }
        return metrics;
    }

    // [效能] 折線的段長與轉角圓角資訊只依路徑幾何(與 progress 無關),對同一條路線在所有 transfer / 所有幀
    // 都相同。以 routePoints 參照記憶化(WeakMap 自動失效),把 getPointOnTransferPath 每幀每 transfer 的
    // O(P) 重建降為查表;之後只剩 O(P) 的落點插值(且通常落在單段內提早 return)。
    static _getTransferPathGeometry(points) {
        const memo = LogisticsRenderer._transferPathGeomCache.get(points);
        if (memo !== undefined) return memo;
        const segments = [];
        let totalPixels = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
            segments.push({ a, b, len, start: totalPixels });
            totalPixels += len;
        }
        const TS = GameEngine.TILE_SIZE || 20;
        const corners = [];
        let distanceAtPoint = 0;
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];
            const prevLen = Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y);
            distanceAtPoint += prevLen;
            const inDir = LogisticsRenderer.getCardinalDir(prev, curr);
            const outDir = LogisticsRenderer.getCardinalDir(curr, next);
            const isTurn = inDir && outDir && (inDir.x !== outDir.x || inDir.y !== outDir.y);
            if (isTurn) {
                const nextLen = Math.abs(next.x - curr.x) + Math.abs(next.y - curr.y);
                const radius = Math.min(TS, prevLen, nextLen);
                if (radius >= 1) {
                    corners.push({
                        currIndex: i, curr,
                        entry: { x: curr.x - inDir.x * radius, y: curr.y - inDir.y * radius },
                        exit: { x: curr.x + outDir.x * radius, y: curr.y + outDir.y * radius },
                        distAtCorner: distanceAtPoint, radius
                    });
                }
            }
        }
        const geom = { segments, corners, totalPixels };
        LogisticsRenderer._transferPathGeomCache.set(points, geom);
        return geom;
    }
    static _densePathCache = new WeakMap();

    static getDenseTransferPath(points) {
        if (!Array.isArray(points) || points.length < 2) return null;
        let dense = LogisticsRenderer._densePathCache.get(points);
        if (dense) return dense;

        const geom = LogisticsRenderer._getTransferPathGeometry(points);
        const totalPixels = Math.ceil(geom.totalPixels);
        if (totalPixels <= 0) {
            dense = { buffer: new Float32Array([points[0].x, points[0].y, 0]), totalPixels: 0 };
            LogisticsRenderer._densePathCache.set(points, dense);
            return dense;
        }

        const buffer = new Float32Array((totalPixels + 1) * 3);
        
        for (let dist = 0; dist <= totalPixels; dist++) {
            const progress = dist / totalPixels;
            const pt = LogisticsRenderer.getPointOnTransferPath(points, progress, 0);
            if (pt) {
                buffer[dist * 3] = pt.x;
                buffer[dist * 3 + 1] = pt.y;
                buffer[dist * 3 + 2] = Number.isFinite(pt.angle) ? pt.angle : 0;
            }
        }
        
        dense = { buffer, totalPixels };
        LogisticsRenderer._densePathCache.set(points, dense);
        return dense;
    }

    static getPointOnTransferPath(points, progress, startOffset = 0, cacheOwner = null) {
        if (!Array.isArray(points) || points.length < 2) return null;
        const clampedProgress = Math.max(0, Math.min(1, Number(progress) || 0));

        // 段長與轉角資訊記憶化(只依路徑幾何)
        const { segments, corners, totalPixels } = LogisticsRenderer._getTransferPathGeometry(points);
        if (totalPixels <= 0) return { x: points[0].x, y: points[0].y, angle: 0 };

        const safeStartOffset = Math.max(0, Math.min(Number(startOffset) || 0, totalPixels * 0.45));
        const targetDistance = safeStartOffset + clampedProgress * (totalPixels - safeStartOffset);

        // 3. 檢查是否落在 Corner 的圓角區間內
        let activeCorner = null;
        for (const corner of corners) {
            const start = corner.distAtCorner - corner.radius;
            const end = corner.distAtCorner + corner.radius;
            if (targetDistance >= start && targetDistance <= end) {
                activeCorner = corner;
                break;
            }
        }

        if (activeCorner) {
            const start = activeCorner.distAtCorner - activeCorner.radius;
            const t = (targetDistance - start) / (2 * activeCorner.radius);

            // 二次貝氏曲線插值
            const entry = activeCorner.entry;
            const control = activeCorner.curr;
            const exit = activeCorner.exit;

            const px = (1 - t) * (1 - t) * entry.x + 2 * (1 - t) * t * control.x + t * t * exit.x;
            const py = (1 - t) * (1 - t) * entry.y + 2 * (1 - t) * t * control.y + t * t * exit.y;

            // 切線方向作為旋轉角度
            const tx = 2 * (1 - t) * (control.x - entry.x) + 2 * t * (exit.x - control.x);
            const ty = 2 * (1 - t) * (control.y - entry.y) + 2 * t * (exit.y - control.y);
            const angle = Math.atan2(ty, tx);

            return { x: px, y: py, angle };
        }

        // 4. 線性插值（直線段，消除過彎前後視覺長度不一致的累積誤差）
        for (let i = 0; i < segments.length; i++) {
            const { a, b, len, start } = segments[i];
            if (targetDistance <= start + len || i === segments.length - 1) {
                const localDist = targetDistance - start;
                const localProgress = len > 0 ? localDist / len : 0;
                return {
                    x: a.x + (b.x - a.x) * localProgress,
                    y: a.y + (b.y - a.y) * localProgress,
                    angle: Math.atan2(b.y - a.y, b.x - a.x)
                };
            }
        }

        const last = points[points.length - 1];
        const prev = points[points.length - 2] || last;
        return { x: last.x, y: last.y, angle: Math.atan2(last.y - prev.y, last.x - prev.x) };
    }

    static getPointOnMergeTransferPath(points, progress, transfer, state = GameEngine.state) {
        if (!Array.isArray(points) || points.length < 2 || !transfer) return null;
        const metrics = LogisticsRenderer.getTransferPathMetrics(points, transfer);
        const totalLength = metrics?.totalLength || 0;
        if (totalLength <= 0) return null;
        const clampedProgress = Math.max(0, Math.min(1, Number(progress) || 0));
        const targetDistance = clampedProgress * totalLength;

        const outputTurnPoint = LogisticsRenderer.getMergeOutputVisualHandoffPoint(
            points,
            clampedProgress,
            targetDistance,
            totalLength,
            transfer
        );
        if (outputTurnPoint) return outputTurnPoint;

        const node = logisticsRenderModel.getMergeNodeForInputTransfer(transfer, state);
        if (!node) return null;
        const nodePoint = node.point || { x: node.x, y: node.y };
        if (!nodePoint || !Number.isFinite(nodePoint.x) || !Number.isFinite(nodePoint.y)) return null;
        const inDir = LogisticsRenderer.getMergeInputDirection(points, transfer, node);
        const outDir = LogisticsRenderer.getMergeOutputDirection(node);
        if (!inDir || !outDir || !LogisticsRenderer.getTurnArrowDirection(inDir, outDir)) return null;

        return LogisticsRenderer.getMergeInputTerminalArcPoint(
            points,
            transfer,
            nodePoint,
            inDir,
            outDir,
            targetDistance,
            totalLength
        );
    }

    static getMergeInputTerminalArcPoint(points, transfer, nodePoint, inDir, outDir, targetDistance, totalLength) {
        if (!Array.isArray(points) || points.length < 2 || !nodePoint || !inDir || !outDir || totalLength <= 0) return null;
        const TS = GameEngine.TILE_SIZE || 20;
        const arcLength = Math.min(TS, totalLength);
        const arcStartDistance = Math.max(0, totalLength - arcLength);
        if (targetDistance <= arcStartDistance + 0.001) {
            return LogisticsRenderer.getPointOnTransferPath(points, targetDistance / totalLength, 0, transfer);
        }

        return LogisticsRenderer.getPointOnMergeVisualTurn(
            nodePoint,
            inDir,
            outDir,
            targetDistance - arcStartDistance,
            arcLength
        );
    }

    static getMergeOutputVisualHandoffPoint(points, progress, targetDistance, totalLength, transfer) {
        const turn = transfer?._mergeVisualTurn;
        if (!turn || !Array.isArray(points) || points.length < 2 || totalLength <= 0) return null;
        if (turn.outputGroupId && transfer?.lineId && turn.outputGroupId !== transfer.lineId) return null;
        const nodePoint = { x: Number(turn.x), y: Number(turn.y) };
        const inDir = turn.inDir;
        const outDir = turn.outDir;
        if (!Number.isFinite(nodePoint.x) || !Number.isFinite(nodePoint.y) || !inDir || !outDir) return null;
        const TS = GameEngine.TILE_SIZE || 20;
        const mergeDistance = LogisticsRenderer.getPathDistanceToPoint(points, nodePoint);
        const localDistance = targetDistance - mergeDistance;
        if (localDistance < -0.001 || localDistance > TS + 0.001) return null;
        return LogisticsRenderer.getPointOnMergeVisualTurn(
            nodePoint,
            inDir,
            outDir,
            TS + Math.max(0, localDistance),
            TS
        );
    }

    static getPointOnMergeVisualTurn(nodePoint, inDir, outDir, logicalDistance, halfLogicalLength) {
        if (!nodePoint || !inDir || !outDir) return null;
        const halfLength = Math.max(1, Number(halfLogicalLength) || (GameEngine.TILE_SIZE || 20));
        const totalLogicalLength = halfLength * 2;
        const start = {
            x: nodePoint.x - Math.sign(inDir.x || 0) * halfLength,
            y: nodePoint.y - Math.sign(inDir.y || 0) * halfLength
        };
        const end = {
            x: nodePoint.x + Math.sign(outDir.x || 0) * halfLength,
            y: nodePoint.y + Math.sign(outDir.y || 0) * halfLength
        };
        const virtualTurnPath = [start, { x: nodePoint.x, y: nodePoint.y }, end];
        const metrics = LogisticsRenderer.getTransferPathMetrics(virtualTurnPath, null);
        if (!metrics || !Number.isFinite(metrics.totalLength) || metrics.totalLength <= 0) return null;
        const clamped = Math.max(0, Math.min(totalLogicalLength, Number(logicalDistance) || 0));
        return LogisticsRenderer.getPointOnMetricPath(
            metrics.points,
            metrics.lengths,
            (clamped / totalLogicalLength) * metrics.totalLength
        );
    }

    static getPointOnVirtualTransferPathByDistance(points, distance, cacheOwner = null) {
        const metrics = LogisticsRenderer.getTransferPathMetrics(points, cacheOwner);
        if (!metrics || !Array.isArray(metrics.points) || !Array.isArray(metrics.lengths)) return null;
        return LogisticsRenderer.getPointOnMetricPath(metrics.points, metrics.lengths, distance);
    }

    static getMergeInputDirection(points, transfer, node) {
        const storedDir = node?.inputDirections?.[transfer?.lineId];
        if (storedDir && Number.isFinite(storedDir.x) && Number.isFinite(storedDir.y)) {
            return { x: Math.sign(storedDir.x), y: Math.sign(storedDir.y) };
        }
        if (!Array.isArray(points) || points.length < 2) return null;
        return LogisticsRenderer.getCardinalDir(points[points.length - 2], points[points.length - 1]);
    }

    static getMergeOutputDirection(node) {
        const storedDir = node?.outputDir;
        if (storedDir && Number.isFinite(storedDir.x) && Number.isFinite(storedDir.y)) {
            return { x: Math.sign(storedDir.x), y: Math.sign(storedDir.y) };
        }
        const route = logisticsRenderModel.getMergeNodeOutputRoute(node);
        if (Array.isArray(route) && route.length >= 2) {
            return LogisticsRenderer.getCardinalDir(route[0], route[1]);
        }
        return null;
    }

    static getSegmentLengths(points) {
        if (!Array.isArray(points) || points.length < 2) return [];
        const lengths = [];
        for (let i = 0; i < points.length - 1; i++) {
            lengths.push(Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y));
        }
        return lengths;
    }

    static getPathLength(points) {
        return LogisticsRenderer.getSegmentLengths(points).reduce((sum, length) => sum + length, 0);
    }

    static getPathDistanceToPoint(points, point) {
        if (!Array.isArray(points) || points.length < 2 || !point) return 0;
        let bestDist = Infinity;
        let bestPathDist = 0;
        let total = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy);
            const lenSq = dx * dx + dy * dy;
            if (lenSq > 0) {
                const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
                const proj = { x: a.x + dx * t, y: a.y + dy * t };
                const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestPathDist = total + len * t;
                }
            }
            total += len;
        }
        return bestPathDist;
    }

    static getPointOnMetricPath(points, lengths, distance) {
        if (!Array.isArray(points) || points.length < 2) return null;
        let targetDistance = Math.max(0, Number(distance) || 0);
        for (let i = 0; i < points.length - 1; i++) {
            const length = lengths[i] || 0;
            if (targetDistance <= length || i === points.length - 2) {
                const a = points[i];
                const b = points[i + 1];
                const localProgress = length > 0 ? Math.max(0, Math.min(1, targetDistance / length)) : 0;
                return {
                    x: a.x + (b.x - a.x) * localProgress,
                    y: a.y + (b.y - a.y) * localProgress,
                    angle: Math.atan2(b.y - a.y, b.x - a.x)
                };
            }
            targetDistance -= length;
        }
        const last = points[points.length - 1];
        const prev = points[points.length - 2] || last;
        return { x: last.x, y: last.y, angle: Math.atan2(last.y - prev.y, last.x - prev.x) };
    }

    static applyCornerVisualCompensation(points, pathDistance, point) {
        if (!point || !Array.isArray(points) || points.length < 3) return point;
        const TS = GameEngine.TILE_SIZE || 20;
        const radius = TS * 0.55;
        const maxOffset = TS * 0.08;
        let distanceAtPoint = 0;
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];
            distanceAtPoint += Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y);
            if (curr.isCorner !== true) continue;
            const distToCorner = Math.abs(pathDistance - distanceAtPoint);
            if (distToCorner > radius) continue;
            const inDir = LogisticsRenderer.getCardinalDir(prev, curr);
            const outDir = LogisticsRenderer.getCardinalDir(curr, next);
            if (!inDir || !outDir || (inDir.x === outDir.x && inDir.y === outDir.y)) continue;
            const outside = { x: inDir.x - outDir.x, y: inDir.y - outDir.y };
            const outsideLen = Math.hypot(outside.x, outside.y) || 1;
            const weight = 1 - (distToCorner / radius);
            const offset = maxOffset * weight;
            return {
                x: point.x + (outside.x / outsideLen) * offset,
                y: point.y + (outside.y / outsideLen) * offset,
                angle: point.angle
            };
        }
        return point;
    }

    static annotateRoutePoints(points) {
        if (!Array.isArray(points) || points.length < 3) return;
        // [效能] isCorner 標記只依路徑幾何且冪等;每幀每 transfer 重算 O(P) 浪費。已註解過的路徑直接跳過。
        if (LogisticsRenderer._annotatedRoutes.has(points)) return;
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];
            const inDir = LogisticsRenderer.getCardinalDir(prev, curr);
            const outDir = LogisticsRenderer.getCardinalDir(curr, next);
            if (inDir && outDir && (inDir.x !== outDir.x || inDir.y !== outDir.y)) {
                curr.isCorner = true;
            }
        }
        LogisticsRenderer._annotatedRoutes.add(points);
    }

    static isDetachedSplitCell(line, cellKey) {
        return (!!line?.detachedFromGroupId &&
            !!line?.detachedAtKey &&
            !!cellKey &&
            line.detachedAtKey === cellKey) ||
            (Array.isArray(line?.suppressedConnectionCellKeys) && line.suppressedConnectionCellKeys.includes(cellKey));
    }

    static getDetachedSplitArrowCellKeys(segments) {
        const keys = new Set();
        if (!Array.isArray(segments)) return keys;
        segments.forEach((seg) => {
            if (seg?.detachedFromGroupId && seg?.detachedAtKey) {
                keys.add(seg.detachedAtKey);
            }
            if (Array.isArray(seg?.suppressedConnectionCellKeys)) {
                seg.suppressedConnectionCellKeys.forEach(key => {
                    if (key) keys.add(key);
                });
            }
        });
        return keys;
    }

    static drawLogisticsGroupTurnArrows(g, segments, widthTiles, color, alpha, size, onlyCellKeys = null, skipCellKeys = null) {
        if (!Array.isArray(segments) || segments.length === 0) return;
        const TS = GameEngine.TILE_SIZE;
        const keyOf = (x, y) => `${Math.round(x)},${Math.round(y)}`;
        const turns = LogisticsRenderer.getLogisticsGroupTurnCells(segments);
        turns.forEach(({ x, y, inDir, outDir }) => {
            const centerKey = keyOf(x, y);
            if (skipCellKeys?.has(centerKey)) return;
            if (onlyCellKeys) {
                const inKey = keyOf(x - inDir.x * TS, y - inDir.y * TS);
                const outKey = keyOf(x + outDir.x * TS, y + outDir.y * TS);
                if (!onlyCellKeys.has(centerKey) || !onlyCellKeys.has(inKey) || !onlyCellKeys.has(outKey)) return;
            }
            const turnDir = LogisticsRenderer.getTurnArrowDirection(inDir, outDir);
            if (!turnDir) return;
            const arrowSize = Math.max(size * 1.05, GameEngine.TILE_SIZE * 0.32);
            const insetOffset = Math.max(0, Number(UI_CONFIG.LogisticsSystem?.turnArrowInsetOffset) || 0);
            const offsetX = outDir.x - inDir.x;
            const offsetY = outDir.y - inDir.y;
            const offsetLen = Math.hypot(offsetX, offsetY) || 1;
            const arrowX = x + (offsetX / offsetLen) * insetOffset;
            const arrowY = y + (offsetY / offsetLen) * insetOffset;
            LogisticsRenderer.drawArrowhead(g, arrowX, arrowY, turnDir.x, turnDir.y, arrowSize);
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

    static buildSelectedGroupDebugGraphRoutes(groupSegs) {
        // [P2a] 圖拓樸/可達性演算法已抽至系統層 LogisticsRouteGraph，經 LogisticsRenderModel facade 取用。
        // 此處保留為相容薄殼：所有既有呼叫點與測試入口不變。
        return logisticsRenderModel.buildDebugGraphRoutes(groupSegs, GameEngine.TILE_SIZE || 64);
    }

    static getDebugLabelCellKeys(groupSegs) {
        const keys = new Set();
        if (!Array.isArray(groupSegs)) return keys;
        const TS = GameEngine.TILE_SIZE || 64;
        const keyOf = (point) => `${Math.round(point.x)},${Math.round(point.y)}`;
        const startKeys = new Set();
        const terminalCandidates = [];
        const suppressedKeys = LogisticsRenderer.getDetachedSplitArrowCellKeys(groupSegs);
        groupSegs.forEach(seg => {
            const points = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
            if (points.length < 2) return;
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                const dir = LogisticsRenderer.getCardinalDir(a, b);
                if (!dir) continue;
                const dist = Math.hypot(b.x - a.x, b.y - a.y);
                const steps = Math.max(1, Math.round(dist / TS));
                for (let step = 0; step < steps; step++) {
                    const key = keyOf({ x: a.x + dir.x * TS * step, y: a.y + dir.y * TS * step });
                    if (!suppressedKeys.has(key)) keys.add(key);
                }
                const startKey = keyOf(a);
                if (!suppressedKeys.has(startKey)) startKeys.add(startKey);
                if (i === points.length - 2 && !seg.targetId && !seg.suppressOpenEndpointCell) {
                    const terminalKey = keyOf(b);
                    if (!suppressedKeys.has(terminalKey)) terminalCandidates.push(terminalKey);
                }
            }
        });
        terminalCandidates.forEach(key => {
            if (!startKeys.has(key)) keys.add(key);
        });
        return keys;
    }

    static getSingleLineDebugNumberStartIndex(state, groupKey, groupSegs, selectedLine) {
        const selectedRoute = logisticsRenderModel.getLineRoute(selectedLine)?.points || selectedLine?.routePoints || [];
        const selectedStart = Array.isArray(selectedRoute) ? selectedRoute[0] : null;
        if (!selectedStart || !Number.isFinite(selectedStart.x) || !Number.isFinite(selectedStart.y)) return 0;
        const targetKey = `${Math.round(selectedStart.x)},${Math.round(selectedStart.y)}`;
        const fullRoutes = LogisticsRenderer.getSelectedGroupDebugRoutePoints(state, groupKey, groupSegs);
        const seen = new Set();
        for (const points of fullRoutes) {
            if (!Array.isArray(points)) continue;
            for (const point of points) {
                if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
                const key = `${Math.round(point.x)},${Math.round(point.y)}`;
                if (seen.has(key)) continue;
                if (key === targetKey) return seen.size;
                seen.add(key);
            }
        }
        return 0;
    }

    static renderDebugRouteNumberSprites(scene, groupKey, routes, groupSegs = null, startIndex = 0) {
        if (!Array.isArray(routes) || routes.length === 0) return;
        const seen = new Set();
        const suppressedKeys = LogisticsRenderer.getDetachedSplitArrowCellKeys(groupSegs);
        let labelIndex = Math.max(0, Math.floor(Number(startIndex) || 0));
        routes.forEach((points, routeIndex) => {
            if (!Array.isArray(points)) return;
            points.forEach(point => {
                if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
                const key = `${Math.round(point.x)},${Math.round(point.y)}`;
                if (suppressedKeys.has(key)) return;
                if (seen.has(key)) return;
                seen.add(key);
                LogisticsRenderer.renderLogisticsNumberSprite(
                    scene,
                    `${groupKey || "group"}_debug_${routeIndex}_${key}`,
                    String(labelIndex++),
                    point.x,
                    point.y
                );
            });
        });
    }

    static getSelectedGroupDebugRoutePoints(state, groupKey, groupSegs) {
        // [P2a] 續接器（合流續接 / 實體 fallback / 回填）已抽至系統層 LogisticsDebugRouteStitcher，
        // 經 LogisticsRenderModel facade 取用；此處為相容薄殼，所有呼叫點與測試入口不變。
        return logisticsRenderModel.getSelectedGroupDebugRoutePoints(state, groupKey, groupSegs, GameEngine.TILE_SIZE || 20);
    }

    static drawRoutePointsDebug(g, points, allowedCellKeys = null) {
        if (!Array.isArray(points) || points.length < 2) return;
        const lineColor = 0xff2222;
        const nodeFill = 0xff2222;
        const nodeStroke = 0xffffff;
        const radius = Math.max(4, Math.min(7, GameEngine.TILE_SIZE * 0.12));
        const isAllowed = (point) => {
            if (!allowedCellKeys || allowedCellKeys.size === 0) return true;
            const key = `${Math.round(point.x)},${Math.round(point.y)}`;
            return allowedCellKeys.has(key);
        };

        g.lineStyle(3, lineColor, 0.95);
        let drawing = false;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            if (!isAllowed(a) || !isAllowed(b)) {
                if (drawing) {
                    g.strokePath();
                    drawing = false;
                }
                continue;
            }
            if (!drawing) {
                g.beginPath();
                g.moveTo(a.x, a.y);
                drawing = true;
            }
            g.lineTo(b.x, b.y);
        }
        if (drawing) g.strokePath();

        points.forEach(point => {
            if (!isAllowed(point)) return;
            g.fillStyle(nodeFill, 1);
            g.fillCircle(point.x, point.y, radius);
            g.lineStyle(2, nodeStroke, 0.95);
            g.strokeCircle(point.x, point.y, radius);
        });
    }

    static getLogisticsGroupTurnCellKeys(segments) {
        return new Set(LogisticsRenderer.getLogisticsGroupTurnCells(segments).map(turn => turn.key));
    }

    static mergeTurnCellKeys(...sets) {
        const merged = new Set();
        sets.forEach(set => {
            if (!set || typeof set.forEach !== 'function') return;
            set.forEach(key => {
                if (key) merged.add(key);
            });
        });
        return merged;
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

    static strokeRoundedPolyline(g, points, options = {}) {
        const roundedPoints = LogisticsRenderer.buildRoundedLogisticsPathPoints(points, options);
        LogisticsRenderer.strokePolyline(g, roundedPoints);
    }

    static getLineSkippedCellKeys(line) {
        const keys = new Set();
        if (!line) return keys;
        if (line.detachedFromGroupId && line.detachedAtKey) keys.add(line.detachedAtKey);
        if (Array.isArray(line.suppressedConnectionCellKeys)) {
            line.suppressedConnectionCellKeys.forEach(key => {
                if (key) keys.add(key);
            });
        }
        return keys;
    }

    static drawLogisticsRoundedTurnSegments(g, points, thickness, color, alpha, skipCellKeys = null) {
        const segments = LogisticsRenderer.getLogisticsRoundedTurnSegments(points, skipCellKeys);
        if (segments.length === 0) return;
        segments.forEach(segment => LogisticsRenderer.fillLogisticsRibbon(g, segment.points, thickness, color, alpha, segment));
    }

    static drawLogisticsGroupRoundedTurns(g, groupSegs, thickness, color, alpha, skipCellKeys = null) {
        const turns = LogisticsRenderer.getLogisticsGroupTurnCells(groupSegs);
        if (!Array.isArray(turns) || turns.length === 0) return;
        const TS = GameEngine.TILE_SIZE || 20;
        const turnRadius = TS / 2;
        const drawn = new Set();
        turns.forEach(({ x, y, inDir, outDir, key }) => {
            if (skipCellKeys?.has(key)) return;
            if (!inDir || !outDir) return;
            if (drawn.has(key)) return;
            drawn.add(key);
            const entry = { x: x - inDir.x * turnRadius, y: y - inDir.y * turnRadius };
            const control = { x, y };
            const exit = { x: x + outDir.x * turnRadius, y: y + outDir.y * turnRadius };
            LogisticsRenderer.fillQuadraticCornerRibbon(g, entry, control, exit, thickness, color, alpha, inDir, outDir);
        });
    }

    static drawLogisticsMergeVisualTurns(g, turns, thickness, color, alpha, skipCellKeys = null) {
        if (!Array.isArray(turns) || turns.length === 0) return;
        const TS = GameEngine.TILE_SIZE || 20;
        const turnRadius = TS / 2;
        turns.forEach(({ x, y, inDir, outDir, key }) => {
            if (skipCellKeys?.has(key)) return;
            if (!inDir || !outDir) return;
            const entry = { x: x - inDir.x * turnRadius, y: y - inDir.y * turnRadius };
            const control = { x, y };
            const exit = { x: x + outDir.x * turnRadius, y: y + outDir.y * turnRadius };
            LogisticsRenderer.fillQuadraticCornerRibbon(g, entry, control, exit, thickness, color, alpha, inDir, outDir);
        });
    }

    static drawLogisticsMergeVisualTurnArrows(g, turns, color, alpha, size, skipCellKeys = null) {
        if (!Array.isArray(turns) || turns.length === 0) return;
        const insetOffset = Math.max(0, Number(UI_CONFIG.LogisticsSystem?.turnArrowInsetOffset) || 0);
        const drawnCellKeys = new Set();
        g.fillStyle(color, alpha);
        turns.forEach(({ x, y, inDir, outDir, key }) => {
            if (skipCellKeys?.has(key)) return;
            const drawKey = key || `${Math.round(x)},${Math.round(y)}`;
            if (drawnCellKeys.has(drawKey)) return;
            const turnDir = LogisticsRenderer.getTurnArrowDirection(inDir, outDir);
            if (!turnDir) return;
            drawnCellKeys.add(drawKey);
            const arrowSize = Math.max(size * 1.05, GameEngine.TILE_SIZE * 0.32);
            const offsetX = outDir.x - inDir.x;
            const offsetY = outDir.y - inDir.y;
            const offsetLen = Math.hypot(offsetX, offsetY) || 1;
            const arrowX = x + (offsetX / offsetLen) * insetOffset;
            const arrowY = y + (offsetY / offsetLen) * insetOffset;
            LogisticsRenderer.drawArrowhead(g, arrowX, arrowY, turnDir.x, turnDir.y, arrowSize);
        });
    }

    static fillQuadraticCornerRibbon(g, entry, control, exit, thickness, color, alpha, startDir = null, endDir = null) {
        if (!g || !entry || !control || !exit) return;
        const points = LogisticsRenderer.sampleQuadraticCorner(entry, control, exit, 16);
        LogisticsRenderer.fillLogisticsRibbon(g, points, thickness, color, alpha, { startDir, endDir });
    }

    static fillLogisticsRibbon(g, points, thickness, color, alpha, options = {}) {
        if (!g || !Array.isArray(points) || points.length < 2) return;
        const half = Math.max(1, Number(thickness) || 1) / 2;
        const left = [];
        const right = [];

        for (let i = 0; i < points.length; i++) {
            const prev = points[Math.max(0, i - 1)];
            const next = points[Math.min(points.length - 1, i + 1)];
            const forcedDir = i === 0
                ? options.startDir
                : (i === points.length - 1 ? options.endDir : null);
            const dx = forcedDir ? forcedDir.x : (next.x - prev.x);
            const dy = forcedDir ? forcedDir.y : (next.y - prev.y);
            const len = Math.hypot(dx, dy);
            if (len < 0.001) continue;
            const nx = -dy / len;
            const ny = dx / len;
            const p = points[i];
            left.push({ x: p.x + nx * half, y: p.y + ny * half });
            right.push({ x: p.x - nx * half, y: p.y - ny * half });
        }

        if (left.length < 2 || right.length < 2) return;
        g.fillStyle(color, alpha);
        g.beginPath();
        g.moveTo(left[0].x, left[0].y);
        for (let i = 1; i < left.length; i++) {
            g.lineTo(left[i].x, left[i].y);
        }
        for (let i = right.length - 1; i >= 0; i--) {
            g.lineTo(right[i].x, right[i].y);
        }
        g.closePath();
        g.fillPath();
    }

    static strokeQuadraticCorner(g, entry, control, exit) {
        if (!g || !entry || !control || !exit) return;
        if (typeof g.quadraticCurveTo === "function") {
            g.beginPath();
            g.moveTo(entry.x, entry.y);
            g.quadraticCurveTo(control.x, control.y, exit.x, exit.y);
            g.strokePath();
            return;
        }
        LogisticsRenderer.strokePolyline(
            g,
            LogisticsRenderer.sampleQuadraticCorner(entry, control, exit, 8)
        );
    }

    static getLogisticsRoundedTurnSegments(points, skipCellKeys = null) {
        if (!Array.isArray(points) || points.length < 3) return [];
        const TS = GameEngine.TILE_SIZE || 20;
        const segments = [];
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];
            const inDir = LogisticsRenderer.getCardinalDir(prev, curr);
            const outDir = LogisticsRenderer.getCardinalDir(curr, next);
            if (!inDir || !outDir || (inDir.x === outDir.x && inDir.y === outDir.y)) continue;
            const currKey = `${Math.round(curr.x)},${Math.round(curr.y)}`;
            if (skipCellKeys?.has(currKey)) continue;
            const prevLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
            const nextLen = Math.hypot(next.x - curr.x, next.y - curr.y);
            const radius = Math.min(TS / 2, prevLen, nextLen);
            if (radius < 1) continue;
            const entry = {
                x: curr.x - inDir.x * radius,
                y: curr.y - inDir.y * radius
            };
            const exit = {
                x: curr.x + outDir.x * radius,
                y: curr.y + outDir.y * radius
            };
            segments.push({
                points: LogisticsRenderer.sampleQuadraticCorner(entry, curr, exit, 12),
                startDir: inDir,
                endDir: outDir
            });
        }
        return segments;
    }

    static buildRoundedLogisticsPathPoints(points, options = {}) {
        if (!Array.isArray(points) || points.length < 3) return points || [];
        const TS = GameEngine.TILE_SIZE || 20;
        const samples = Math.max(4, Math.round(Number(options.samples) || 12));
        const rounded = [];
        const pushPoint = (point) => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            const last = rounded[rounded.length - 1];
            if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.01) {
                rounded.push({ x: point.x, y: point.y });
            }
        };

        pushPoint(points[0]);
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];
            const inDir = LogisticsRenderer.getCardinalDir(prev, curr);
            const outDir = LogisticsRenderer.getCardinalDir(curr, next);
            const isTurn = inDir && outDir && (inDir.x !== outDir.x || inDir.y !== outDir.y);
            if (!isTurn) {
                pushPoint(curr);
                continue;
            }
            const prevLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
            const nextLen = Math.hypot(next.x - curr.x, next.y - curr.y);
            const radius = Math.min(TS, prevLen, nextLen);
            if (radius < 1) {
                pushPoint(curr);
                continue;
            }
            const entry = {
                x: curr.x - inDir.x * radius,
                y: curr.y - inDir.y * radius
            };
            const exit = {
                x: curr.x + outDir.x * radius,
                y: curr.y + outDir.y * radius
            };
            pushPoint(entry);
            LogisticsRenderer.sampleQuadraticCorner(entry, curr, exit, samples)
                .slice(1)
                .forEach(pushPoint);
        }
        pushPoint(points[points.length - 1]);
        return rounded.length >= 2 ? rounded : points;
    }

    static sampleQuadraticCorner(entry, control, exit, samples = 12) {
        const points = [];
        const count = Math.max(2, Math.round(samples));
        for (let step = 0; step <= count; step++) {
            const t = step / count;
            const a = (1 - t) * (1 - t);
            const b = 2 * (1 - t) * t;
            const c = t * t;
            points.push({
                x: entry.x * a + control.x * b + exit.x * c,
                y: entry.y * a + control.y * b + exit.y * c
            });
        }
        return points;
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
