import { ConveyorRouter } from './ConveyorRouter.js';
import { GameEngine } from './game_systems.js';
import { UI_CONFIG } from '../ui/ui_config.js';
import { BuildingSystem } from './BuildingSystem.js';

export class ConveyorSystem {
    constructor() {
        this.activeDrag = null;
        this.router = null;
        this.ghosts = [];
        this.isValid = false;
        this.pendingDragPoint = null;
        this.isDragFrameQueued = false;
        this.lastRouteKey = null;
        this.logisticsOccupiedKeys = new Set();
    }

    startDrag(startX, startY, sourceEntity = null, sourcePort = null, sourceLine = null) {
        const state = GameEngine.state;
        const grid = state.pathfinding?.grid || [];
        if (grid.length === 0) return;

        const currentSourcePort = sourceEntity && sourcePort && window.UIManager?.resolveCurrentPortSlot
            ? window.UIManager.resolveCurrentPortSlot(sourceEntity, sourcePort, startX, startY)
            : sourcePort;
        const resolvedStartX = currentSourcePort && Number.isFinite(currentSourcePort.x) ? currentSourcePort.x : startX;
        const resolvedStartY = currentSourcePort && Number.isFinite(currentSourcePort.y) ? currentSourcePort.y : startY;
        const isLineExtension = currentSourcePort?.sourceType === "logistics_line" || !!sourceLine;

        const rows = grid.length;
        const cols = grid[0].length;
        const routeScale = this.getRouteScale();
        const routeWidth = Math.max(1, Number(currentSourcePort?.width) || 1);
        const routeGrid = this.createRoutingGrid(grid, sourceLine);

        // [核心重構] 傳入 UI_CONFIG 作為初始化參數，解除 Router 的外部依賴
        this.router = new ConveyorRouter(routeGrid, cols * routeScale, rows * routeScale, UI_CONFIG.ConveyorBuild);
        this.router.tileSize = this.getGridUnitSize();
        this.logisticsOccupiedKeys = this.collectLogisticsOccupiedKeys(sourceLine);

        const initialBendMode = isLineExtension
            ? ((currentSourcePort?.dir === 'up' || currentSourcePort?.dir === 'down') ? 'y-first' : 'x-first')
            : 'x-first';
        this.activeDrag = {
            startX: resolvedStartX,
            startY: resolvedStartY,
            sourceEntity,
            sourcePort: currentSourcePort,
            sourceLine,
            targetBuilding: null,
            targetPort: null,
            bendMode: initialBendMode,
            lastWorldPoint: null,
            // [核心修復] 使用方向偏好，確保右/下端口座標歸入建築格網
            startGrid: this.toGrid(resolvedStartX, resolvedStartY, currentSourcePort?.dir),
            routeWidth,
            isLineExtension,
            directionLocked: false // [核心新增] 是否已鎖定移動方向
        };

        this.ghosts = [];
        this.isValid = false;
        this.pendingDragPoint = null;
        this.isDragFrameQueued = false;
        this.lastRouteKey = null;
    }

    getAlignmentUnit() {
        const unit = Number(UI_CONFIG.ConveyorBuild?.alignmentUnit) || 0.5;
        return Math.max(0.5, Math.min(1, unit));
    }

    getGridUnitSize() {
        return GameEngine.TILE_SIZE;
    }

    getRouteScale() {
        return Math.round(1 / this.getAlignmentUnit());
    }

    getTransportLineConfig() {
        const configs = GameEngine.state?.buildingConfigs || {};
        const selectedType = GameEngine.state?.activeTransportLineType;
        return (selectedType && configs[selectedType]) ||
            Object.values(configs).find(cfg => cfg && cfg.type2 === 'transport_line') ||
            configs.transport_line ||
            null;
    }

    getTransportLineCost(segmentCount) {
        const cfg = this.getTransportLineConfig();
        const costs = {};
        Object.entries(cfg?.costs || {}).forEach(([resource, amount]) => {
            const value = Number(amount) || 0;
            if (value > 0) costs[resource] = value * Math.max(0, segmentCount);
        });
        return costs;
    }

    canAffordTransportLine(segmentCount) {
        const costs = this.getTransportLineCost(segmentCount);
        return Object.entries(costs).every(([resource, amount]) => (GameEngine.state.resources[resource] || 0) >= amount);
    }

    buildSingleSegmentAt(worldX, worldY) {
        GameEngine.addLog(`[物流線] 至少需要向任一方向拖曳 2 格才能建造。`, 'LOGISTICS');
        return false;
    }

    getPortAnchorGrid(port, portGrid) {
        if (!port || !port.dir || !portGrid) return portGrid;
        if (port.sourceType === "logistics_line") return portGrid;
        // [核心優化] 使用 Router 的向量計算方法
        const dir = this.router.getDirectionVector(port.dir);
        const routeScale = this.getRouteScale();
        return {
            x: portGrid.x + dir.x * routeScale,
            y: portGrid.y + dir.y * routeScale
        };
    }

    buildPortSafePath(routePath, sourcePortGrid, sourceRouteGrid, targetPortGrid, targetRouteGrid) {
        if (!routePath || routePath.length === 0) return [];
        const path = routePath.map(p => ({ ...p }));

        if (sourcePortGrid) {
            const alreadyHasStart = path.length > 0 && samePoint(path[0], sourcePortGrid);
            if (!alreadyHasStart && !samePoint(sourcePortGrid, sourceRouteGrid)) {
                path.unshift({ x: sourcePortGrid.x, y: sourcePortGrid.y, isPortConnector: true });
            }
            path.forEach(p => {
                if (samePoint(p, sourceRouteGrid)) p.isPortConnector = true;
                if (samePoint(p, sourcePortGrid)) p.isPortConnector = true;
            });
        }

        if (targetPortGrid) {
            const alreadyHasEnd = path.length > 0 && path[path.length - 1] && samePoint(path[path.length - 1], targetPortGrid);
            if (!alreadyHasEnd && !samePoint(targetPortGrid, targetRouteGrid)) {
                path.push({ x: targetPortGrid.x, y: targetPortGrid.y, isPortConnector: true });
            }
            path.forEach(p => {
                if (samePoint(p, targetRouteGrid)) p.isPortConnector = true;
                if (samePoint(p, targetPortGrid)) p.isPortConnector = true;
            });
        }

        function samePoint(a, b) {
            return a && b && a.x === b.x && a.y === b.y;
        }

        return path;
    }

    dedupeExtensionStart(path) {
        if (!this.activeDrag?.isLineExtension || !this.activeDrag?.sourceLine || !Array.isArray(path) || path.length < 2) {
            return path;
        }
        const sourceLine = this.activeDrag.sourceLine;
        const groupId = sourceLine.groupId || sourceLine.id;
        const lines = (GameEngine.state.logisticsLines || []).filter(line => line && (line.groupId === groupId || line.id === groupId));
        if (lines.length === 0) return path;

        const occupied = new Set();
        lines.forEach(line => {
            const route = Array.isArray(line.routePoints) ? line.routePoints : [];
            for (let i = 0; i < route.length - 1; i++) {
                const a = this.toGrid(route[i].x, route[i].y);
                const b = this.toGrid(route[i + 1].x, route[i + 1].y);
                const dx = Math.sign(b.x - a.x);
                const dy = Math.sign(b.y - a.y);
                const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
                for (let step = 0; step < steps; step++) {
                    occupied.add(`${a.x + dx * step},${a.y + dy * step}`);
                }
            }
        });

        const startKey = `${path[0].x},${path[0].y}`;
        if (!occupied.has(startKey)) return path;
        let firstOpenIndex = 0;
        while (firstOpenIndex < path.length - 1 && occupied.has(`${path[firstOpenIndex].x},${path[firstOpenIndex].y}`)) {
            firstOpenIndex++;
        }
        return firstOpenIndex > 0 ? path.slice(firstOpenIndex) : path;
    }

    collectLogisticsOccupiedKeys(ignoreLine = null) {
        const keys = new Set();
        const lines = GameEngine.state.logisticsLines || [];
        const addKey = (x, y) => keys.add(`${x},${y}`);
        lines.forEach(line => {
            if (ignoreLine && (line.id === ignoreLine.id || line.groupId === ignoreLine.groupId)) return;
            const width = Math.max(1, Number(line.routeWidth) || 1);
            const points = Array.isArray(line.routePoints) && line.routePoints.length >= 2
                ? line.routePoints
                : [{ x: line.x, y: line.y }, { x: line.x, y: line.y }];
            for (let i = 0; i < points.length - 1; i++) {
                const a = this.toGrid(points[i].x, points[i].y);
                const b = this.toGrid(points[i + 1].x, points[i + 1].y);
                const dx = Math.sign(b.x - a.x);
                const dy = Math.sign(b.y - a.y);
                const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
                const ghosts = [];
                for (let step = 0; step <= steps; step++) {
                    ghosts.push({
                        x: a.x + dx * step,
                        y: a.y + dy * step,
                        dirOut: { x: dx, y: dy },
                        dirIn: { x: dx, y: dy }
                    });
                }
                this.router.getGhostOccupiedCells(ghosts, width).forEach(cell => addKey(cell.x, cell.y));
            }
        });
        return keys;
    }

    markLineOnGrid(routeGrid, line) {
        if (!routeGrid || !line) return;
        const width = Math.max(1, Number(line.routeWidth) || 1);
        const mark = (x, y) => {
            if (y < 0 || y >= routeGrid.length || x < 0 || x >= routeGrid[y].length) return;
            routeGrid[y][x] = 1;
        };
        const points = Array.isArray(line.routePoints) && line.routePoints.length >= 2
            ? line.routePoints
            : [{ x: line.x, y: line.y }, { x: line.x, y: line.y }];

        for (let i = 0; i < points.length - 1; i++) {
            const a = this.toGrid(points[i].x, points[i].y);
            const b = this.toGrid(points[i + 1].x, points[i + 1].y);
            const dx = Math.sign(b.x - a.x);
            const dy = Math.sign(b.y - a.y);
            const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
            const ghosts = [];
            for (let step = 0; step <= steps; step++) {
                ghosts.push({
                    x: a.x + dx * step,
                    y: a.y + dy * step,
                    dirOut: { x: dx, y: dy },
                    dirIn: { x: dx, y: dy }
                });
            }
            // [核心優化] 使用 Router 的足跡佔用計算法
            this.router.getGhostOccupiedCells(ghosts, width).forEach(cell => mark(cell.x, cell.y));
        }
    }

    createRoutingGrid(grid, ignoreLine = null) {
        const expanded = [];
        const routeScale = this.getRouteScale();
        for (let y = 0; y < grid.length; y++) {
            const sourceRows = [];
            for (let row = 0; row < routeScale; row++) sourceRows.push([]);
            for (let x = 0; x < grid[y].length; x++) {
                const values = Array(routeScale).fill(grid[y][x]);
                sourceRows.forEach(row => row.push(...values));
            }
            expanded.push(...sourceRows);
        }
        const routeGrid = expanded.map(row => row.slice());

        (GameEngine.state.logisticsLines || []).forEach(line => {
            if (ignoreLine && (line.id === ignoreLine.id || line.groupId === ignoreLine.groupId)) return;
            this.markLineOnGrid(routeGrid, line);
        });
        return routeGrid;
    }

    updateDrag(currentX, currentY) {
        if (!this.activeDrag) return;
        this.pendingDragPoint = { x: currentX, y: currentY };
        if (this.isDragFrameQueued) return;

        this.isDragFrameQueued = true;
        const scheduleFrame = typeof requestAnimationFrame === "function"
            ? requestAnimationFrame
            : (callback) => setTimeout(callback, 16);
        scheduleFrame(() => {
            this.isDragFrameQueued = false;
            if (!this.activeDrag || !this.pendingDragPoint) return;
            const point = this.pendingDragPoint;
            this.pendingDragPoint = null;
            this.updateDragNow(point.x, point.y);
        });
    }

    updateDragNow(currentX, currentY) {
        if (!this.activeDrag) return;
        this.activeDrag.lastWorldPoint = { x: currentX, y: currentY };

        const dragTarget = this.resolveDragTarget(currentX, currentY);
        // [核心修復] 獲取目標網格時考慮端口方向偏好
        const targetPortGrid = this.toGrid(dragTarget.x, dragTarget.y, dragTarget.port?.dir);
        const sourcePortGrid = this.activeDrag.startGrid;
        const sourceRouteGrid = this.getPortAnchorGrid(this.activeDrag.sourcePort, sourcePortGrid);
        const targetRouteGrid = dragTarget.port
            ? this.getPortAnchorGrid(dragTarget.port, targetPortGrid)
            : targetPortGrid;

        // [核心優化] 動態判定 L 形彎折模式：根據游標移動方向自動切換 x-first 或 y-first
        if (this.activeDrag && !this.activeDrag.directionLocked) {
            const dx = Math.abs(currentX - this.activeDrag.startX);
            const dy = Math.abs(currentY - this.activeDrag.startY);
            const TS = GameEngine.TILE_SIZE;
            const threshold = (UI_CONFIG.ConveyorBuild?.directionLockThreshold || 0.5) * TS;

            if (dx > threshold || dy > threshold) {
                // 如果 X 軸偏移明顯大於 Y 軸，鎖定為橫向優先
                if (dx > dy * 1.2) {
                    this.activeDrag.bendMode = 'x-first';
                    this.activeDrag.directionLocked = true;
                }
                // 如果 Y 軸偏移明顯大於 X 軸，鎖定為縱向優先
                else if (dy > dx * 1.2) {
                    this.activeDrag.bendMode = 'y-first';
                    this.activeDrag.directionLocked = true;
                }
            }
        } else if (this.activeDrag && this.activeDrag.directionLocked) {
            // [核心優化] 回位解鎖：如果游標回到起點附近，解鎖方向判定，允許重新選擇
            const dx = Math.abs(currentX - this.activeDrag.startX);
            const dy = Math.abs(currentY - this.activeDrag.startY);
            const TS = GameEngine.TILE_SIZE;
            const resetThreshold = (UI_CONFIG.ConveyorBuild?.directionLockThreshold || 0.5) * 0.4 * TS;
            if (dx < resetThreshold && dy < resetThreshold) {
                this.activeDrag.directionLocked = false;
            }
        }

        const routeKey = `${sourceRouteGrid.x},${sourceRouteGrid.y}->${targetRouteGrid.x},${targetRouteGrid.y}:${sourcePortGrid.x},${sourcePortGrid.y}:${targetPortGrid.x},${targetPortGrid.y}:${this.activeDrag.sourcePort?.dir || ''}:${dragTarget.port?.dir || ''}:${this.activeDrag.bendMode}:${dragTarget.building ? window.UIManager?.getEntityId?.(dragTarget.building) : ''}`;
        if (routeKey === this.lastRouteKey) return;
        this.lastRouteKey = routeKey;

        const sourceEnt = this.activeDrag.sourceEntity;
        const targetEnt = dragTarget.building;
        const TS = GameEngine.TILE_SIZE;
        const scale = this.getRouteScale();
        const gridUnit = TS / scale;
        const offset = GameEngine.state.mapOffset || { x: 0, y: 0 };

        this.router.onCollision = (gx, gy) => {
            // Allow only exact anchor cells to bypass occupancy.
            if (gx === sourcePortGrid.x && gy === sourcePortGrid.y) return true;
            if (gx === targetPortGrid.x && gy === targetPortGrid.y) return true;
            // In extension mode, existing logistics cells are pass-through only.
            // They still won't be rebuilt because upsert skips occupied segments.
            if (this.activeDrag?.isLineExtension && this.logisticsOccupiedKeys?.has(`${gx},${gy}`)) return true;

            const wx = (gx + offset.x * scale) * gridUnit + gridUnit / 2;
            const wy = (gy + offset.y * scale) * gridUnit + gridUnit / 2;

            // 實體碰撞免除邏輯
            if (sourceEnt && window.UIManager?.isPointInsideEntity(sourceEnt, wx, wy)) return true;
            if (targetEnt && window.UIManager?.isPointInsideEntity(targetEnt, wx, wy)) return true;

            // 游標下實體免除
            const bAtCursor = window.UIManager?.getEntityAtPoint?.(currentX, currentY);
            if (bAtCursor && window.UIManager?.isPointInsideEntity(bAtCursor, wx, wy)) return true;
            return false;
        };

        const widthOffsets = this.router.getWidthOffsets(this.activeDrag.routeWidth);

        const routeStartDir = this.activeDrag.isLineExtension ? null : this.activeDrag.sourcePort?.dir;
        const routePath = this.router.findPath(sourceRouteGrid, targetRouteGrid, routeStartDir, this.activeDrag.bendMode, widthOffsets);
        let path = this.buildPortSafePath(routePath, sourcePortGrid, sourceRouteGrid, dragTarget.port ? targetPortGrid : null, targetRouteGrid);
        path = this.dedupeExtensionStart(path);

        // [核心修復] 處理 N-1 渲染落差：如果是拖曳到空地，順著最後方向延伸一個虛擬節點，迫使渲染器畫滿游標當前格
        if (!dragTarget.port && path && path.length >= 2) {
            const last = path[path.length - 1];
            const prev = path[path.length - 2];
            const dx = Math.sign(last.x - prev.x);
            const dy = Math.sign(last.y - prev.y);
            path.push({ x: last.x + dx, y: last.y + dy, isVirtualEnd: true });
        }

        if (path) {
            this.ghosts = this.router.processPath(path, dragTarget.building, GameEngine.state.logisticsLines || []);
            this.isValid = this.validateGhosts(this.ghosts);
        } else {
            this.ghosts = [];
            this.isValid = false;
        }

        GameEngine.state.conveyorGhosts = this.ghosts;
        GameEngine.state.conveyorValid = this.isValid;
        GameEngine.state.conveyorRouteWidth = this.activeDrag.routeWidth || 1;
    }

    toggleBendMode() {
        if (!this.activeDrag) return false;
        this.activeDrag.bendMode = this.activeDrag.bendMode === 'x-first' ? 'y-first' : 'x-first';
        this.activeDrag.directionLocked = true; // 手動切換後也鎖定，防止自動判定蓋掉玩家意圖
        this.lastRouteKey = null;
        const point = this.pendingDragPoint || this.activeDrag.lastWorldPoint;
        if (point) {
            this.pendingDragPoint = null;
            this.updateDragNow(point.x, point.y);
        }
        return true;
    }

    resolveDragTarget(currentX, currentY) {
        const targetBuilding = window.UIManager?.getLogisticsTargetBuildingAt(currentX, currentY, this.activeDrag.sourceEntity);
        if (!targetBuilding) {
            this.activeDrag.targetBuilding = null;
            this.activeDrag.targetPort = null;
            return { x: currentX, y: currentY, building: null, port: null };
        }

        const preferredDir = this.activeDrag.isLineExtension
            ? null
            : (this.activeDrag.sourcePort?.dir
                ? window.UIManager?.getOppositeDirection?.(this.activeDrag.sourcePort.dir)
                : null);
        const targetPort = window.UIManager?.getNearestPortSlot(
            targetBuilding,
            currentX,
            currentY,
            preferredDir
        );

        if (!targetPort) {
            this.activeDrag.targetBuilding = targetBuilding;
            this.activeDrag.targetPort = null;
            return { x: currentX, y: currentY, building: targetBuilding, port: null };
        }

        this.activeDrag.targetBuilding = targetBuilding;
        this.activeDrag.targetPort = targetPort;
        return {
            x: targetPort.x,
            y: targetPort.y,
            building: targetBuilding,
            port: targetPort
        };
    }

    submitDrag() {
        if (this.activeDrag && this.pendingDragPoint) {
            const point = this.pendingDragPoint;
            this.pendingDragPoint = null;
            this.updateDragNow(point.x, point.y);
        }
        if (!this.activeDrag || !this.isValid || this.ghosts.length < 2) {
            this.cancelDrag();
            return;
        }

        const drag = this.activeDrag;
        const TS = GameEngine.TILE_SIZE;
        const offset = GameEngine.state.mapOffset || { x: 0, y: 0 };
        const scale = this.getRouteScale();
        const gridUnit = TS / scale;

        const points = this.ghosts.map(g => ({
            ...g,
            x: (g.x + offset.x * scale) * gridUnit,
            y: (g.y + offset.y * scale) * gridUnit
        }));
        this.applyExtensionTurnArrowOverride(drag, points);

        const lastPoint = points[points.length - 1];
        const dragTarget = this.resolveDragTarget(lastPoint.x, lastPoint.y);
        const targetBuilding = dragTarget.building || drag.targetBuilding;
        const targetPort = dragTarget.port || drag.targetPort || (targetBuilding ? window.UIManager?.getNearestPortSlot(targetBuilding, points[points.length - 2]?.x || points[0].x, points[points.length - 2]?.y || points[0].y) : null);
        const sourceGroupId = drag.sourceLine?.groupId || drag.sourceLine?.id || null;
        const touchedTargetLine = sourceGroupId && window.UIManager?.getLogisticsLinesAt
            ? window.UIManager.getLogisticsLinesAt(lastPoint.x, lastPoint.y).find(line => {
                const groupId = line?.groupId || line?.id || null;
                return groupId && groupId !== sourceGroupId;
            })
            : null;
        const touchedTargetGroupId = touchedTargetLine ? (touchedTargetLine.groupId || touchedTargetLine.id) : null;

        if (window.UIManager) {
            const sourceEntity = drag.sourceEntity || (
                drag.sourceLine?.sourceId
                    ? GameEngine.state.mapEntities.find(ent => window.UIManager.getEntityId(ent) === drag.sourceLine.sourceId)
                    : null
            );
            let conn = null;
            if (sourceEntity && targetBuilding) {
                const targetId = window.UIManager.getEntityId(targetBuilding);
                if (!Array.isArray(sourceEntity.outputTargets)) sourceEntity.outputTargets = [];
                conn = sourceEntity.outputTargets.find(item => item.id === targetId || (drag.sourceLine?.groupId && item.lineId === drag.sourceLine.groupId));
                if (!conn) {
                    conn = { id: targetId, filter: drag.sourceLine?.filter || null };
                    sourceEntity.outputTargets.push(conn);
                } else {
                    conn.id = targetId;
                    if (!conn.filter && drag.sourceLine?.filter) conn.filter = drag.sourceLine.filter;
                }
            }
            const beforeCount = Array.isArray(GameEngine.state.logisticsLines) ? GameEngine.state.logisticsLines.length : 0;
            const segmentCostCount = Math.max(1, this.ghosts.length - 1);
            if (segmentCostCount < 2) {
                GameEngine.addLog(`[物流線] 至少需要向任一方向拖曳 2 格才能建造。`, 'LOGISTICS');
                this.cancelDrag();
                return;
            }
            const maxCosts = this.getTransportLineCost(segmentCostCount);
            const missing = Object.entries(maxCosts).find(([resource, amount]) => (GameEngine.state.resources[resource] || 0) < amount);
            if (missing) {
                GameEngine.triggerWarning("1", [missing[0].toUpperCase()]);
                this.cancelDrag();
                return;
            }
            const transportCfg = this.getTransportLineConfig();
            
            let shouldMergeWithSource = false;
            if (drag.sourceLine && (drag.sourceLine.groupId || drag.sourceLine.id)) {
                const sourceGroupId = drag.sourceLine.groupId || drag.sourceLine.id;
                const lines = (GameEngine.state.logisticsLines || []).filter(l => l && (l.groupId === sourceGroupId || l.id === sourceGroupId));
                const grid = this.toGrid(drag.startX, drag.startY);
                let p1MatchCount = 0;
                let p2MatchCount = 0;
                lines.forEach(l => {
                    const pts = Array.isArray(l.routePoints) ? l.routePoints : [{x: l.x, y: l.y}, {x: l.x, y: l.y}];
                    if (pts.length === 0) return;
                    const p1 = this.toGrid(pts[0].x, pts[0].y);
                    const p2 = this.toGrid(pts[pts.length - 1].x, pts[pts.length - 1].y);
                    if (p1.x === grid.x && p1.y === grid.y) p1MatchCount++;
                    if (p2.x === grid.x && p2.y === grid.y) p2MatchCount++;
                });
                
                // 只有從群組的真正終點延伸，才是連續的物流線 (允許合併)。
                // 若是單格點 (p1 與 p2 重疊且只有一條線)，也視為終點。
                const isTrueEnd = (p2MatchCount === 1 && p1MatchCount === 0) || 
                                  (p1MatchCount === 1 && p2MatchCount === 1 && lines.length === 1);

                if (isTrueEnd) {
                    shouldMergeWithSource = true;
                    // 檢查是否為完全反向拖曳，反向也不允許合併
                    const sourceRoute = Array.isArray(drag.sourceLine.routePoints) ? drag.sourceLine.routePoints : [];
                    if (sourceRoute.length >= 2 && points.length >= 2) {
                        const getDir = (a, b) => {
                            if (!a || !b) return null;
                            const dx = b.x - a.x;
                            const dy = b.y - a.y;
                            if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
                            return Math.abs(dx) >= Math.abs(dy)
                                ? { x: Math.sign(dx) || 1, y: 0 }
                                : { x: 0, y: Math.sign(dy) || 1 };
                        };
                        // 取得來源線段最後一個 vector
                        const originalDir = getDir(sourceRoute[sourceRoute.length - 2], sourceRoute[sourceRoute.length - 1]);
                        const extensionDir = getDir(points[0], points[1]);
                        if (originalDir && extensionDir && originalDir.x === -extensionDir.x && originalDir.y === -extensionDir.y) {
                            shouldMergeWithSource = false;
                        }
                    }
                }
            }

            const createdLine = window.UIManager.upsertLogisticsLine({
                lineId: shouldMergeWithSource ? (drag.sourceLine.groupId || drag.sourceLine.id) : null,
                sourceEnt: sourceEntity,
                targetEnt: targetBuilding,
                targetPoint: targetPort || points[points.length - 1],
                points: points,
                routeWidth: drag.routeWidth || drag.sourcePort?.width || 1,
                sourcePort: drag.sourcePort,
                targetPort: targetPort,
                conn,
                lineType: transportCfg?.model || transportCfg?.type1 || 'transport_line',
                efficiency: Number(transportCfg?.efficiency) || 0
            });
            if (
                createdLine?.groupId &&
                touchedTargetGroupId &&
                window.UIManager.areLogisticsGroupsTouching?.(createdLine.groupId, touchedTargetGroupId) &&
                window.UIManager.mergeLogisticsLineGroups
            ) {
                window.UIManager.mergeLogisticsLineGroups(createdLine.groupId, touchedTargetGroupId);
            }
            if (drag.sourceLine?.filter && createdLine?.groupId) {
                window.UIManager.setLogisticsGroupFilter(createdLine.groupId, drag.sourceLine.filter);
            }
            const afterCount = Array.isArray(GameEngine.state.logisticsLines) ? GameEngine.state.logisticsLines.length : beforeCount;
            const builtSegments = Math.max(0, afterCount - beforeCount);
            if (!BuildingSystem.spendResources(GameEngine.state, this.getTransportLineCost(builtSegments))) {
                this.cancelDrag();
                return;
            }
            GameEngine.addLog(`[物流] 傳送帶建造完成，共 ${builtSegments} 節。`, 'LOGISTICS');
        }

        this.cancelDrag();
    }

    applyExtensionTurnArrowOverride(drag, points) {
        if (!drag?.isLineExtension || !drag.sourceLine || !Array.isArray(points) || points.length < 2) return;
        const sourceLine = drag.sourceLine;
        const route = Array.isArray(sourceLine.routePoints) ? sourceLine.routePoints : [];
        if (route.length < 2) return;

        const getDir = (a, b) => {
            if (!a || !b) return null;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
            return Math.abs(dx) >= Math.abs(dy)
                ? { x: Math.sign(dx) || 1, y: 0 }
                : { x: 0, y: Math.sign(dy) || 1 };
        };
        const originalDir = getDir(route[0], route[1]);
        const extensionDir = getDir(points[0], points[1]);
        if (!originalDir || !extensionDir) return;
        const groupId = sourceLine.groupId || sourceLine.id || null;
        const cellKey = `${Math.round(sourceLine.x)},${Math.round(sourceLine.y)}`;
        const clearStateOverride = () => {
            if (!Array.isArray(GameEngine.state.logisticsTurnArrowOverrides)) return;
            GameEngine.state.logisticsTurnArrowOverrides = GameEngine.state.logisticsTurnArrowOverrides.filter(item =>
                item?.overrideKey !== `${groupId || "line"}:${cellKey}`
            );
        };

        const isSame = originalDir.x === extensionDir.x && originalDir.y === extensionDir.y;
        const isOpposite = originalDir.x === -extensionDir.x && originalDir.y === -extensionDir.y;
        if (isSame || isOpposite) {
            delete sourceLine.turnArrowOverride;
            clearStateOverride();
            return;
        }

        const dx = originalDir.x + extensionDir.x;
        const dy = originalDir.y + extensionDir.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) {
            delete sourceLine.turnArrowOverride;
            clearStateOverride();
            return;
        }

        const turnArrowOverride = {
            groupId,
            cellKey,
            anchorX: sourceLine.x,
            anchorY: sourceLine.y,
            dirX: dx / len,
            dirY: dy / len,
            sourceDirX: originalDir.x,
            sourceDirY: originalDir.y,
            extensionDirX: extensionDir.x,
            extensionDirY: extensionDir.y
        };
        sourceLine.turnArrowOverride = turnArrowOverride;

        if (!Array.isArray(GameEngine.state.logisticsTurnArrowOverrides)) {
            GameEngine.state.logisticsTurnArrowOverrides = [];
        }
        const overrideKey = `${turnArrowOverride.groupId || "line"}:${turnArrowOverride.cellKey}`;
        const stateOverride = { ...turnArrowOverride, overrideKey };
        const existingIndex = GameEngine.state.logisticsTurnArrowOverrides.findIndex(item => item?.overrideKey === overrideKey);
        if (existingIndex >= 0) {
            GameEngine.state.logisticsTurnArrowOverrides[existingIndex] = stateOverride;
        } else {
            GameEngine.state.logisticsTurnArrowOverrides.push(stateOverride);
        }

        (GameEngine.state.logisticsLines || []).forEach((line) => {
            if (!line) return;
            const sameId = sourceLine.id && line.id === sourceLine.id;
            const sameGroupPosition = (sourceLine.groupId || sourceLine.id) &&
                (line.groupId === sourceLine.groupId || line.id === sourceLine.groupId || line.groupId === sourceLine.id) &&
                Math.abs((line.x || 0) - (sourceLine.x || 0)) < 0.001 &&
                Math.abs((line.y || 0) - (sourceLine.y || 0)) < 0.001;
            if (sameId || sameGroupPosition) {
                line.turnArrowOverride = { ...turnArrowOverride };
            }
        });
    }

    cancelDrag() {
        this.activeDrag = null;
        this.ghosts = [];
        this.pendingDragPoint = null;
        this.isDragFrameQueued = false;
        this.lastRouteKey = null;
        this.logisticsOccupiedKeys = new Set();
        if (this.router) this.router.onCollision = null;
        if (GameEngine.state) {
            GameEngine.state.conveyorGhosts = [];
            GameEngine.state.conveyorValid = false;
            GameEngine.state.conveyorRouteWidth = 1;
        }
    }

    toGrid(worldX, worldY, dirBias = null) {
        const TS = GameEngine.TILE_SIZE;
        const scale = this.getRouteScale();
        const gridUnit = TS / scale;
        const offset = GameEngine.state.mapOffset || { x: 0, y: 0 };

        // [核心修復] 處理邊界歧義：對於右側與下側邊界點，微調座標使其歸入「前一格」(即建築內部格子)
        // 這樣 Anchor (port+1) 才會剛好落在緊貼建築的格子，消除 1 格間距
        let bx = worldX;
        let by = worldY;
        if (dirBias === 'right') bx -= 1;
        if (dirBias === 'down') by -= 1;

        return {
            x: Math.floor(bx / gridUnit) - offset.x * scale,
            y: Math.floor(by / gridUnit) - offset.y * scale
        };
    }

    validateGhosts(ghosts) {
        if (!this.router) return false;
        const routeWidth = this.activeDrag?.routeWidth || 1;

        // [核心優化] 統一調用 Router 的驗證邏輯，保持 Single Source of Truth
        const isFootprintValid = this.router.validateRouteFootprint(ghosts, routeWidth, (segmentCount) => {
            if (!UI_CONFIG.ConveyorBuild) return true;

            // 道具消耗檢查
            return this.canAffordTransportLine(segmentCount);
        });

        return isFootprintValid;
    }
}

export const conveyorSystem = new ConveyorSystem();
