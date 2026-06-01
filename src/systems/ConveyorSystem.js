import { ConveyorRouter } from './ConveyorRouter.js';
import { GameEngine } from './game_systems.js';
import { UI_CONFIG } from '../ui/ui_config.js';
import { BuildingSystem } from './BuildingSystem.js';

function annotateRoutePoints(points) {
    if (!Array.isArray(points) || points.length < 3) return;
    const getCardinalDir = (from, to) => {
        if (!from || !to) return null;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
        if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx) || 1, y: 0 };
        return { x: 0, y: Math.sign(dy) || 1 };
    };
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        const inDir = getCardinalDir(prev, curr);
        const outDir = getCardinalDir(curr, next);
        if (inDir && outDir && (inDir.x !== outDir.x || inDir.y !== outDir.y)) {
            curr.isCorner = true;
        }
    }
}

class SpatialHashGrid {
    constructor(cellSize = 64) {
        this.cellSize = cellSize;
        this.grid = new Map();
    }

    clear() {
        this.grid.clear();
    }

    _getBucket(x, y) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        return `${cx},${cy}`;
    }

    insert(segment) {
        if (!segment) return;
        const rects = this._getSegmentRects(segment);
        rects.forEach(rect => {
            const minX = rect.x;
            const maxX = rect.x + rect.w;
            const minY = rect.y;
            const maxY = rect.y + rect.h;

            const startCx = Math.floor(minX / this.cellSize);
            const endCx = Math.floor(maxX / this.cellSize);
            const startCy = Math.floor(minY / this.cellSize);
            const endCy = Math.floor(maxY / this.cellSize);

            for (let cx = startCx; cx <= endCx; cx++) {
                for (let cy = startCy; cy <= endCy; cy++) {
                    const key = `${cx},${cy}`;
                    if (!this.grid.has(key)) {
                        this.grid.set(key, new Set());
                    }
                    this.grid.get(key).add(segment);
                }
            }
        });
    }

    getNearby(worldX, worldY) {
        const cx = Math.floor(worldX / this.cellSize);
        const cy = Math.floor(worldY / this.cellSize);
        const results = new Set();
        
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const key = `${cx + dx},${cy + dy}`;
                const bucket = this.grid.get(key);
                if (bucket) {
                    bucket.forEach(item => results.add(item));
                }
            }
        }
        return results;
    }

    _getSegmentRects(line) {
        const TS = GameEngine.TILE_SIZE || 20;
        const points = Array.isArray(line.routePoints)
            ? line.routePoints.map(p => ({ x: p.x, y: p.y }))
            : [];
        if (points.length < 2) return [];
        const width = Math.max(1, Math.round(Number(line.routeWidth) || 1));
        const rects = [];
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.001) continue;

            const dir = { x: dx / dist, y: dy / dist };
            const steps = Math.max(1, Math.round(dist / TS));
            const stepSize = dist / steps;

            for (let step = 0; step < steps; step++) {
                const px = a.x + dir.x * stepSize * step;
                const py = a.y + dir.y * stepSize * step;

                const isHorizontal = Math.abs(dir.x) > Math.abs(dir.y);
                rects.push({
                    x: px - (isHorizontal ? TS / 2 : (width * TS) / 2),
                    y: py - (isHorizontal ? (width * TS) / 2 : TS / 2),
                    w: (isHorizontal ? TS : width * TS),
                    h: (isHorizontal ? width * TS : TS)
                });
            }
        }
        if (!line.targetId && !line.suppressOpenEndpointCell) {
            const end = points[points.length - 1];
            const prev = points[points.length - 2];
            if (end && prev) {
                const dx = end.x - prev.x;
                const dy = end.y - prev.y;
                const dist = Math.hypot(dx, dy);
                if (dist >= 0.001) {
                    const dir = { x: dx / dist, y: dy / dist };
                    const isHorizontal = Math.abs(dir.x) > Math.abs(dir.y);
                    rects.push({
                        x: end.x - (isHorizontal ? TS / 2 : (width * TS) / 2),
                        y: end.y - (isHorizontal ? (width * TS) / 2 : TS / 2),
                        w: (isHorizontal ? TS : width * TS),
                        h: (isHorizontal ? width * TS : TS)
                    });
                }
            }
        }
        return rects;
    }
}

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
        // [合併鎖定] 防止拆分後立刻被自動合併覆蓋，由 deleteLogisticsLineById 啟用
        this.isProcessingMerge = false;
        this.spatialGrid = new SpatialHashGrid(64);
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
        const startGridDirBias = currentSourcePort?.sourceType === "logistics_line" ? null : currentSourcePort?.dir;
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
            // [核心修復] 建築端口才使用方向偏好；物流線延伸要保留實際點擊格。
            startGrid: this.toGrid(resolvedStartX, resolvedStartY, startGridDirBias),
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
        if (firstOpenIndex <= 0) return path;
        // Keep the original logistics-line anchor so side extensions share a real graph node.
        // Dropping it makes the new route start one cell outside the line, which later creates
        // outward detours when the extension is merged into the existing routePoints.
        return [path[0], ...path.slice(firstOpenIndex)];
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
        const targetBuilding = this.getLogisticsTargetBuildingAt(currentX, currentY, this.activeDrag.sourceEntity);
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
        const buildGhosts = this.ghosts;
        if (buildGhosts.length < 2) {
            this.cancelDrag();
            return;
        }

        const savedLogisticsLines = Array.isArray(GameEngine.state.logisticsLines)
            ? [...GameEngine.state.logisticsLines]
            : [];
        const savedTurnArrowOverrides = Array.isArray(GameEngine.state.logisticsTurnArrowOverrides)
            ? [...GameEngine.state.logisticsTurnArrowOverrides]
            : [];

        const drag = this.activeDrag;
        const TS = GameEngine.TILE_SIZE;
        const offset = GameEngine.state.mapOffset || { x: 0, y: 0 };
        const scale = this.getRouteScale();
        const gridUnit = TS / scale;

        const points = buildGhosts.map(g => ({
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
            const segmentCostCount = Math.max(1, buildGhosts.length - 1);
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
                
                // 1. 統計所有點的 grid 出現次數以決定物理端點
                const gridCounts = new Map();
                lines.forEach(l => {
                    const pts = Array.isArray(l.routePoints) ? l.routePoints : [{ x: l.x, y: l.y }, { x: l.x, y: l.y }];
                    if (pts.length < 2) return;
                    const p1 = this.toGrid(pts[0].x, pts[0].y);
                    const p2 = this.toGrid(pts[pts.length - 1].x, pts[pts.length - 1].y);
                    
                    const k1 = `${p1.x},${p1.y}`;
                    const k2 = `${p2.x},${p2.y}`;
                    gridCounts.set(k1, (gridCounts.get(k1) || 0) + 1);
                    gridCounts.set(k2, (gridCounts.get(k2) || 0) + 1);
                });
                
                const endpoints = [];
                gridCounts.forEach((count, key) => {
                    if (count === 1) {
                        const [gx, gy] = key.split(',').map(Number);
                        endpoints.push({ x: gx, y: gy });
                    }
                });
                
                if (lines.length === 1) {
                    const pts = Array.isArray(lines[0].routePoints) ? lines[0].routePoints : [{ x: lines[0].x, y: lines[0].y }];
                    if (pts.length >= 2) {
                        const p1 = this.toGrid(pts[0].x, pts[0].y);
                        const p2 = this.toGrid(pts[pts.length - 1].x, pts[pts.length - 1].y);
                        endpoints.push(p1, p2);
                    }
                }
                
                // 2. 檢查 drag.startX, drag.startY 對應 of grid 點是否鄰近（距離在一格 20px 以內）任何端點
                const startGrid = this.toGrid(drag.startX, drag.startY);
                const isNearEndpoint = endpoints.some(ep => {
                    const dist = Math.max(Math.abs(ep.x - startGrid.x), Math.abs(ep.y - startGrid.y));
                    return dist <= this.getRouteScale(); // 容許虛擬段造成的偏移（一格對應 routeScale 個 grid 單位）
                });
                
                let isTrueEnd = isNearEndpoint;

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
                        const originalDir = getDir(sourceRoute[sourceRoute.length - 2], sourceRoute[sourceRoute.length - 1]);
                        const extensionDir = getDir(points[0], points[1]);
                        if (originalDir && extensionDir && originalDir.x === -extensionDir.x && originalDir.y === -extensionDir.y) {
                            shouldMergeWithSource = false;
                        }
                    }
                }
            }

            const createdLine = this.upsertLogisticsLine({
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
            let finalGroupId = createdLine?.groupId || null;
            if (
                createdLine?.groupId &&
                touchedTargetGroupId &&
                this.areLogisticsGroupsTouching?.(createdLine.groupId, touchedTargetGroupId) &&
                this.mergeLogisticsLineGroups
            ) {
                finalGroupId = this.mergeLogisticsLineGroups(createdLine.groupId, touchedTargetGroupId) || finalGroupId;
                if (finalGroupId) {
                    this.recalculateLogisticsGroupEndpoints(finalGroupId);
                    this.updateActiveTransfersOnLogisticsChange(GameEngine.state);
                }
            }
            if (drag.sourceLine?.filter && finalGroupId) {
                this.setLogisticsGroupFilter(finalGroupId, drag.sourceLine.filter);
            }
            const afterCount = Array.isArray(GameEngine.state.logisticsLines) ? GameEngine.state.logisticsLines.length : beforeCount;
            const builtSegments = Math.max(0, afterCount - beforeCount);
            if (!BuildingSystem.spendResources(GameEngine.state, this.getTransportLineCost(builtSegments))) {
                GameEngine.state.logisticsLines = savedLogisticsLines;
                GameEngine.state.logisticsTurnArrowOverrides = savedTurnArrowOverrides;
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

    rebuildSpatialHashGrid() {
        this.spatialGrid.clear();
        const lines = this.ensureLogisticsLineStore();
        lines.forEach(line => {
            if (line) {
                this.spatialGrid.insert(line);
            }
        });
    }

    toGrid(worldX, worldY, dirBias = null) {
        const TS = GameEngine.TILE_SIZE;
        const scale = this.getRouteScale();
        const gridUnit = TS / scale;
        const offset = GameEngine.state.mapOffset || { x: 0, y: 0 };

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

    buildOrthogonalRoute(startPoint, endPoint, startDir = null, endDir = null, biasPoint = null) {
        const TS = GameEngine.TILE_SIZE;
        const margin = TS; // [核心修正] 與 ConveyorSystem.routeScale 保持一致 (1.0 Tile)
        const pts = [];
        const pushPoint = (x, y) => {
            const px = Math.round(x);
            const py = Math.round(y);
            const last = pts[pts.length - 1];
            if (!last || last.x !== px || last.y !== py) {
                pts.push({ x: px, y: py });
            }
        };

        const startVec = startDir ? window.UIManager.getDirectionVector(startDir) : null;
        const endVec = endDir ? window.UIManager.getDirectionVector(endDir) : null;

        const s0 = { x: startPoint.x, y: startPoint.y };
        const s1 = startVec ? { x: s0.x + startVec.x * margin, y: s0.y + startVec.y * margin } : { ...s0 };
        const e0 = { x: endPoint.x, y: endPoint.y };
        const e1 = endVec ? { x: e0.x + endVec.x * margin, y: e0.y + endVec.y * margin } : { ...e0 };

        pushPoint(s0.x, s0.y);
        pushPoint(s1.x, s1.y);

        const dx = e1.x - s1.x;
        const dy = e1.y - s1.y;
        if (Math.abs(dx) < 1 || Math.abs(dy) < 1) {
            pushPoint(e1.x, e1.y);
        } else {
            const bendA = { x: e1.x, y: s1.y }; // 先水平後垂直
            const bendB = { x: s1.x, y: e1.y }; // 先垂直後水平
            let chooseA = Math.abs(dx) >= Math.abs(dy);
            if (biasPoint) {
                const aScore = Math.hypot(bendA.x - biasPoint.x, bendA.y - biasPoint.y);
                const bScore = Math.hypot(bendB.x - biasPoint.x, bendB.y - biasPoint.y);
                chooseA = aScore <= bScore;
            }
            const bend = chooseA ? bendA : bendB;
            pushPoint(bend.x, bend.y);
            pushPoint(e1.x, e1.y);
        }

        pushPoint(e0.x, e0.y);
        return pts;
    }

    getLogisticsTargetBuildingAt(worldX, worldY, sourceEnt = null) {
        return GameEngine.state.mapEntities.find(ent => {
            if (ent.isUnderConstruction) return false;
            if (sourceEnt && ent === sourceEnt) return false;
            const cfg = GameEngine.getEntityConfig(ent.type1);
            if (!cfg || !cfg.logistics || !cfg.logistics.canInput) return false;
            if (window.UIManager.isPointInsideEntity(ent, worldX, worldY)) return true;

            const portHitRadius = GameEngine.TILE_SIZE * 0.8;
            return window.UIManager.getBuildingPortSlots(ent).some(port =>
                Math.hypot(port.x - worldX, port.y - worldY) <= portHitRadius
            );
        }) || null;
    }

    getConnectionRoute(sourceEnt, targetEnt, conn = null) {
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

    getConnectionTransferRoute(sourceEnt, targetEnt, conn = null) {
        if (!sourceEnt || !targetEnt) return null;

        let rawPoints = [];

        // 1. 強健的圖形搜尋：直接從群組內的所有線段碎片重建路徑
        if (conn && conn.lineId) {
            const segments = this.getLogisticsSegmentsByGroupId(conn.lineId);
            if (segments && segments.length > 0) {
                const nodes = [];
                // 提取所有節點並建立無向圖 (容差 2px 內視為同一節點)
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

                const sRef = conn.sourcePort || sourceEnt;
                const tRef = conn.targetPort || targetEnt;

                // 尋找最靠近起點與終點的網格節點
                nodes.forEach(n => {
                    const ds = Math.hypot(n.x - sRef.x, n.y - sRef.y);
                    if (ds < startDist) { startDist = ds; startNode = n; }
                    const dt = Math.hypot(n.x - tRef.x, n.y - tRef.y);
                    if (dt < endDist) { endDist = dt; endNode = n; }
                });

                // 執行 BFS 最短路徑搜尋
                if (startNode && endNode) {
                    const queue = [[startNode]];
                    const visited = new Set([startNode]);
                    let pathFound = null;

                    while (queue.length > 0) {
                        const path = queue.shift();
                        const curr = path[path.length - 1];

                        if (curr === endNode) {
                            pathFound = path;
                            break;
                        }

                        curr.edges.forEach(neighbor => {
                            if (!visited.has(neighbor)) {
                                visited.add(neighbor);
                                queue.push([...path, neighbor]);
                            }
                        });
                    }

                    if (pathFound) {
                        rawPoints = pathFound.map(n => ({ x: n.x, y: n.y }));
                    }
                }
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
        const pushPoint = (point) => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            const lastPoint = transferPoints[transferPoints.length - 1];
            // 過濾重複點避免卡頓
            if (!lastPoint || Math.hypot(lastPoint.x - point.x, lastPoint.y - point.y) > 1) {
                transferPoints.push({ x: point.x, y: point.y });
            }
        };

        pushPoint(sourceAnchor);
        rawPoints.forEach(pushPoint);
        pushPoint(targetAnchor);

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

    getLogisticsGroupRoutePoints(lineId, startRef = null, endRef = null) {
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

    buildLogisticsGraphRoutePoints(segments, startRef = null, endRef = null) {
        if (!Array.isArray(segments) || segments.length === 0) return null;
        const TS = GameEngine.TILE_SIZE || 20;
        const makeKey = (point) => `${Math.round(point.x)},${Math.round(point.y)}`;
        const nodes = new Map();
        const edges = new Map();
        const addNode = (point) => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
            const key = makeKey(point);
            if (!nodes.has(key)) nodes.set(key, { x: Math.round(point.x), y: Math.round(point.y) });
            if (!edges.has(key)) edges.set(key, new Set());
            return key;
        };
        const addEdge = (a, b) => {
            const ak = addNode(a);
            const bk = addNode(b);
            if (!ak || !bk || ak === bk) return;
            edges.get(ak).add(bk);
            edges.get(bk).add(ak);
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

        segments.forEach(seg => {
            const points = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
            if (points.length < 2) return;
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                const dir = getCardinalDir(a, b);
                if (!dir) continue;
                const dist = Math.hypot(b.x - a.x, b.y - a.y);
                const steps = Math.max(1, Math.round(dist / TS));
                let prev = null;
                for (let step = 0; step <= steps; step++) {
                    const point = step === steps
                        ? b
                        : { x: a.x + dir.x * TS * step, y: a.y + dir.y * TS * step };
                    const key = addNode(point);
                    if (prev && key) addEdge(nodes.get(prev), nodes.get(key));
                    prev = key;
                }
            }
        });
        if (nodes.size < 2) return null;

        const nearestKey = (ref) => {
            if (!ref || !Number.isFinite(ref.x) || !Number.isFinite(ref.y)) return null;
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
        const endpointKeys = [...nodes.keys()].filter(key => (edges.get(key)?.size || 0) <= 1);
        const farthestEndpointKey = (fromKey) => {
            const from = nodes.get(fromKey);
            if (!from) return null;
            let bestKey = null;
            let bestDist = -Infinity;
            (endpointKeys.length > 0 ? endpointKeys : [...nodes.keys()]).forEach(key => {
                if (key === fromKey) return;
                const point = nodes.get(key);
                const dist = Math.hypot(point.x - from.x, point.y - from.y);
                if (dist > bestDist) {
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
                (edges.get(current) || new Set()).forEach(nextKey => {
                    if (visited.has(nextKey)) return;
                    visited.add(nextKey);
                    previous.set(nextKey, current);
                    queue.push(nextKey);
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

        let startKey = nearestKey(startRef);
        let endKey = nearestKey(endRef);
        if (!startKey && endpointKeys.length > 0) startKey = endpointKeys[0];
        if (!endKey && startKey) endKey = farthestEndpointKey(startKey);
        const route = findPath(startKey, endKey);
        if (!Array.isArray(route) || route.length < 2) return null;
        annotateRoutePoints(route);
        return route;
    }

    ensureLogisticsLineStore() {
        const state = GameEngine.state;
        if (!Array.isArray(state.logisticsLines)) state.logisticsLines = [];
        return state.logisticsLines;
    }

    snapPointToGridCenter(point) {
        const TS = GameEngine.TILE_SIZE;
        const align = TS;
        return {
            x: Math.floor(point.x / align) * align + align / 2,
            y: Math.floor(point.y / align) * align + align / 2
        };
    }

    makeLogisticsLineId(sourceId, targetId = null, targetPoint = null) {
        const targetKey = targetId || `${Math.round(targetPoint?.x || 0)}_${Math.round(targetPoint?.y || 0)}`;
        return `logistics_${sourceId}_${targetKey}_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000).toString(36)}`;
    }

    getLogisticsSegmentOccupyKey(line) {
        if (!line) return null;
        const TS = GameEngine.TILE_SIZE;
        // Logistics segments are stored on half-tile grid (alignUnit: 0.5).
        // Occupancy keys must use the same coordinate system as buildLogisticsSegments.
        const align = TS / 2;
        const gx = line.gridX !== undefined ? line.gridX : Math.round(line.x / align);
        const gy = line.gridY !== undefined ? line.gridY : Math.round(line.y / align);
        return `${gx},${gy}`;
    }

    markDeletedGapEndpoint(segment) {
        if (!segment) return;
        const points = Array.isArray(segment.routePoints) ? segment.routePoints : [];
        const end = points[points.length - 1];
        segment.suppressOpenEndpointCell = true;
        if (end && Number.isFinite(end.x) && Number.isFinite(end.y)) {
            segment.suppressedOpenEndpointCellKey = `${Math.round(end.x)},${Math.round(end.y)}`;
        }
    }

    getLogisticsSegmentOccupiedKeys(line) {
        const centerKey = this.getLogisticsSegmentOccupyKey(line);
        if (!centerKey) return [];
        const routeWidth = Math.max(1, Math.round(Number(line.routeWidth) || 1));
        const offsets = Array.from({ length: routeWidth }, (_, i) => (i - (routeWidth - 1) / 2) * 2);
        const points = Array.isArray(line.routePoints) ? line.routePoints : [];
        const a = points[0] || { x: line.x, y: line.y };
        const b = points[1] || a;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const [gx, gy] = centerKey.split(',').map(Number);
        return offsets.map(offset => {
            const ox = Math.abs(dx) > Math.abs(dy) ? 0 : offset;
            const oy = Math.abs(dx) > Math.abs(dy) ? offset : 0;
            return `${gx + ox},${gy + oy}`;
        });
    }

    buildGridRoutePoints(points) {
        if (!Array.isArray(points) || points.length < 2) return [];
        const TS = GameEngine.TILE_SIZE;
        const align = TS / 2;
        const snapped = points.map(p => this.snapPointToGridCenter(p));
        const route = [];
        const push = (p) => {
            const last = route[route.length - 1];
            if (!last || last.x !== p.x || last.y !== p.y) route.push({ x: p.x, y: p.y });
        };

        push(snapped[0]);
        for (let i = 1; i < snapped.length; i++) {
            const last = route[route.length - 1];
            const next = snapped[i];
            if (!last || (last.x === next.x && last.y === next.y)) continue;
            if (last.x !== next.x && last.y !== next.y) {
                push({ x: next.x, y: last.y });
            }
            push(next);
        }

        const expanded = [];
        const pushExpanded = (p) => {
            const last = expanded[expanded.length - 1];
            if (!last || last.x !== p.x || last.y !== p.y) expanded.push({ x: p.x, y: p.y });
        };
        pushExpanded(route[0]);
        for (let i = 1; i < route.length; i++) {
            const a = expanded[expanded.length - 1];
            const b = route[i];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const steps = Math.max(Math.abs(dx), Math.abs(dy)) / align;
            const sx = Math.sign(dx) * align;
            const sy = Math.sign(dy) * align;
            for (let step = 1; step <= steps; step++) {
                pushExpanded({ x: a.x + sx * step, y: a.y + sy * step });
            }
        }
        return expanded;
    }

    buildLogisticsSegments(groupId, sourceId, targetId, targetPoint, gridPoints, routeWidth, sourcePort, targetPort, filter, lineType = 'transport_line', efficiency = 0) {
        if (!Array.isArray(gridPoints) || gridPoints.length < 2) return [];
        const TS = GameEngine.TILE_SIZE;
        const align = TS / 2;
        const segments = [];
        let i = 0;
        while (i < gridPoints.length - 1) {
            const start = gridPoints[i];
            const next = gridPoints[Math.min(i + 1, gridPoints.length - 1)];
            const targetEnd = gridPoints[Math.min(i + 2, gridPoints.length - 1)];
            const dirX = Math.sign(next.x - start.x);
            const dirY = Math.sign(next.y - start.y);
            const nextDirX = Math.sign(targetEnd.x - next.x);
            const nextDirY = Math.sign(targetEnd.y - next.y);
            const canUseTargetEnd = i + 2 < gridPoints.length &&
                dirX === nextDirX &&
                dirY === nextDirY;
            const segmentEnd = canUseTargetEnd ? targetEnd : next;
            const dx = segmentEnd.x - start.x;
            const dy = segmentEnd.y - start.y;
            let end = segmentEnd;
            if (canUseTargetEnd && Math.hypot(dx, dy) < TS - 0.001) {
                end = {
                    x: start.x + dirX * TS,
                    y: start.y + dirY * TS
                };
            }
            if (start.x === end.x && start.y === end.y) {
                i += 1;
                continue;
            }
            const centerX = (start.x + end.x) / 2;
            const centerY = (start.y + end.y) / 2;
            const gx = Math.round(centerX / align);
            const gy = Math.round(centerY / align);
            // ── 方向屬性（整數半格座標 + 離散角度）──────────────────────────────
            // startGx/startGy：routePoints[0]（起點）的半格整數座標
            // endGx/endGy：targetEnd（邏輯終點）的半格整數座標
            //   ★ 鍵點：必須用 targetEnd 而非合成終點(end)，否則轉角處會對不上下一段的 startGx
            // dir：方向角度（0=右, 45=右下, 90=下, 135=左下, 180=左, 225=左上, 270=上, 315=右上）
            const startGx = Math.round(start.x / align);
            const startGy = Math.round(start.y / align);
            const endGx = Math.round(end.x / align);  // 用邏輯終點，不用合成終點
            const endGy = Math.round(end.y / align);
            // [方向修正] dir 使用實際路徑向量 (next - start) 計算，確保與物流「流動方向」一致
            // 舊邏輯使用 targetEnd - start（跨 2 格的向量），在轉角段會產生斜向誤判。
            // 改用 next（gridPoints[i+1]）與 start（gridPoints[i]）的差值，即每段的實際走向。
            const tDirSignX = Math.sign(next.x - start.x);
            const tDirSignY = Math.sign(next.y - start.y);
            const rawAngle = Math.atan2(tDirSignY, tDirSignX) * 180 / Math.PI;
            const dir = Math.round(((rawAngle % 360) + 360) % 360);
            segments.push({
                id: `${groupId}_seg_${gx}_${gy}_${i}`,
                groupId,
                type: 'logistics_segment',
                sourceId,
                targetId,
                targetPoint: targetId ? null : targetPoint,
                gridX: gx,
                gridY: gy,
                startGx,
                startGy,
                endGx,
                endGy,
                dir,
                alignUnit: 0.5,
                x: centerX,
                y: centerY,
                routePoints: [{ x: start.x, y: start.y }, { x: end.x, y: end.y }],
                routeWidth: Math.max(1, Number(routeWidth) || 1),
                lineType,
                efficiency: Number(efficiency) || 0,
                sourcePort,
                targetPort,
                filter: filter || null,
                prevId: null,
                nextId: null,
                order: i,
                createdAt: Date.now()
            });
            i += canUseTargetEnd ? 2 : 1;
        }
        for (let i = 0; i < segments.length; i++) {
            segments[i].prevId = i > 0 ? segments[i - 1].id : null;
            segments[i].nextId = i < segments.length - 1 ? segments[i + 1].id : null;
            
            const prevSeg = i > 0 ? segments[i - 1] : null;
            const nextSeg = i < segments.length - 1 ? segments[i + 1] : null;
            const isCorner = (prevSeg && prevSeg.dir !== segments[i].dir) || 
                             (nextSeg && nextSeg.dir !== segments[i].dir);
            segments[i].isCorner = !!isCorner;
        }
        return segments;
    }

    upsertLogisticsLine({ lineId = null, sourceEnt, targetEnt = null, targetPoint = null, points = [], routeWidth = 1, sourcePort = null, targetPort = null, conn = null, lineType = 'transport_line', efficiency = 0 }) {
        if (this.isProcessingMerge) return null;
        const lines = this.ensureLogisticsLineStore();
        const sourceId = window.UIManager.getEntityId(sourceEnt);
        const targetId = targetEnt ? window.UIManager.getEntityId(targetEnt) : null;
        const groupId = lineId || conn?.lineId || this.makeLogisticsLineId(sourceId, targetId, targetPoint);
        const cleanTargetPoint = (targetId || !targetPoint) ? null : this.snapPointToGridCenter(targetPoint);
        const gridPoints = this.buildGridRoutePoints(points);
        const previous = lines.find(item => item.groupId === groupId || item.id === groupId);
        const clonePort = (port) => {
            if (!port) return null;
            const cloned = {
                dir: port.dir,
                slotIndex: port.slotIndex,
                defIndex: port.defIndex,
                width: Math.max(1, Number(port.width) || 1)
            };
            if (Number.isFinite(port.x)) cloned.x = port.x;
            if (Number.isFinite(port.y)) cloned.y = port.y;
            return cloned;
        };
        const hasPortPosition = (port) => port && Number.isFinite(port.x) && Number.isFinite(port.y);
        const findNearestSourceEntityPort = () => {
            if (!sourceEnt || typeof window.UIManager.getBuildingPortSlots !== 'function') return null;
            const slots = window.UIManager.getBuildingPortSlots(sourceEnt);
            if (!Array.isArray(slots) || slots.length === 0) return null;

            const refs = [];
            lines.forEach(line => {
                if (!line || (line.groupId !== groupId && line.id !== groupId)) return;
                (line.routePoints || []).forEach(point => {
                    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) refs.push(point);
                });
            });
            gridPoints.forEach(point => {
                if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) refs.push(point);
            });
            if (targetEnt) refs.push({ x: targetEnt.x, y: targetEnt.y });
            if (targetPoint) refs.push(targetPoint);
            if (refs.length === 0) return null;

            let best = null;
            let bestScore = Infinity;
            slots.forEach(slot => {
                refs.forEach(ref => {
                    const score = Math.hypot(slot.x - ref.x, slot.y - ref.y);
                    if (score < bestScore) {
                        bestScore = score;
                        best = slot;
                    }
                });
            });
            return clonePort(best);
        };
        const fallbackSourcePort = () => {
            const candidates = [
                conn?.sourcePort,
                previous?.sourcePort,
                ...lines
                    .filter(line => line && (line.groupId === groupId || line.id === groupId))
                    .map(line => line.sourcePort)
            ];
            const stored = candidates.find(hasPortPosition);
            return stored ? clonePort(stored) : findNearestSourceEntityPort();
        };
        let cleanSourcePort = sourcePort?.sourceType === "logistics_line" ? null : clonePort(sourcePort);
        if (!hasPortPosition(cleanSourcePort)) cleanSourcePort = fallbackSourcePort();
        const cleanTargetPort = clonePort(targetPort);
        const filter = conn ? (conn.filter || null) : (previous?.filter || null);
        const segments = this.buildLogisticsSegments(groupId, sourceId, targetId, cleanTargetPoint, gridPoints, routeWidth, cleanSourcePort, cleanTargetPort, filter, lineType, efficiency);
        const existingGroupSegments = lines.filter(line => line && (line.groupId === groupId || line.id === groupId));
        const extendsSplitSequence = existingGroupSegments.some(line => Number.isFinite(line?.splitSequenceOrder));
        const splitSequenceStart = extendsSplitSequence
            ? Math.max(...existingGroupSegments.map(line => Number.isFinite(line?.splitSequenceOrder) ? line.splitSequenceOrder : (Number(line?.order) || 0))) + 1
            : null;
        if (Number.isFinite(splitSequenceStart)) {
            segments.forEach((segment, index) => {
                segment.splitSequenceOrder = splitSequenceStart + index;
            });
        }
        const occupied = new Map();
        const occupiedTileCenters = new Map();
        const sameGroup = (seg) => !!seg && ((seg.groupId === groupId) || (seg.id === groupId));
        const sameRoute = (a, b) => {
            const ap = Array.isArray(a?.routePoints) ? a.routePoints : [];
            const bp = Array.isArray(b?.routePoints) ? b.routePoints : [];
            if (ap.length < 2 || bp.length < 2) return false;
            return (ap[0].x === bp[0].x && ap[0].y === bp[0].y && ap[1].x === bp[1].x && ap[1].y === bp[1].y)
                || (ap[0].x === bp[1].x && ap[0].y === bp[1].y && ap[1].x === bp[0].x && ap[1].y === bp[0].y);
        };
        const getSegmentTileKeys = (seg) => {
            const points = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
            if (points.length < 2) return [];
            const TS = GameEngine.TILE_SIZE;
            const eps = 0.001;
            const keys = new Set();
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                if (!a || !b) continue;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                if (dist < eps) continue;
                const dirX = dx / dist;
                const dirY = dy / dist;
                const steps = Math.max(1, Math.round(dist / TS));
                const stepSize = dist / steps;
                for (let step = 0; step < steps; step++) {
                    const px = a.x + dirX * stepSize * step;
                    const py = a.y + dirY * stepSize * step;
                    const snapped = this.snapPointToGridCenter({ x: px, y: py });
                    keys.add(`${snapped.x},${snapped.y}`);
                }
            }
            return Array.from(keys);
        };
        // 使用完整的 lines（含本群組舊段）建立佔用索引，確保延伸時不會蓋掉自身已有線段
        lines.forEach(item => {
            this.getLogisticsSegmentOccupiedKeys(item).forEach(key => {
                if (key && !occupied.has(key)) occupied.set(key, item);
            });
            getSegmentTileKeys(item).forEach(key => {
                if (!occupiedTileCenters.has(key)) occupiedTileCenters.set(key, []);
                occupiedTileCenters.get(key).push(item);
            });
        });
        const additions = [];
        const overlapMergeGroupIds = new Set();
        const blockedOverlapGroupIds = new Set();
        const getLineGroupId = (line) => line?.groupId || line?.id || null;
        const collectSameDirectionOverlapGroups = (segment) => {
            const groupIds = new Set();
            this.getLogisticsLineDirectedCells(segment).forEach(cell => {
                const hits = occupiedTileCenters.get(cell.key) || [];
                hits.forEach(hit => {
                    const hitGroupId = getLineGroupId(hit);
                    if (!hitGroupId || hitGroupId === groupId) return;
                    // [嚴格化合併檢查] 若目前處於合併處理中，禁止合併
                    if (this.isProcessingMerge === true) {
                        blockedOverlapGroupIds.add(hitGroupId);
                        return;
                    }
                    const hitCells = this.getLogisticsLineDirectedCells(hit).filter(hitCell => hitCell.key === cell.key);
                    const hasOppositeDirection = hitCells.some(hitCell =>
                        hitCell.dirX === -cell.dirX &&
                        hitCell.dirY === -cell.dirY
                    );
                    if (hasOppositeDirection) {
                        blockedOverlapGroupIds.add(hitGroupId);
                        groupIds.delete(hitGroupId);
                        return;
                    }
                    const matchesDirection = hitCells.some(hitCell => hitCell.dirX === cell.dirX && hitCell.dirY === cell.dirY);
                    if (matchesDirection) groupIds.add(hitGroupId);
                });
            });
            return groupIds;
        };
        segments.forEach(segment => {
            const keys = this.getLogisticsSegmentOccupiedKeys(segment);
            const segmentTileKeys = getSegmentTileKeys(segment);
            if (!keys.length) return;
            // 使用完整 lines 比對同路由（確保延伸不會重複追加完全相同的段）
            const alreadySameRoute = lines.some(item => sameGroup(item) && sameRoute(item, segment));
            if (alreadySameRoute) return;
            const sameDirectionOverlapGroupIds = collectSameDirectionOverlapGroups(segment);
            const overlapsOccupiedLine = keys.some((key) => {
                const hit = occupied.get(key);
                return hit && !sameGroup(hit);
            });
            if (overlapsOccupiedLine) {
                sameDirectionOverlapGroupIds.forEach(id => overlapMergeGroupIds.add(id));
                return;
            }
            const centerBlockedByOccupiedLine = segmentTileKeys.some((key) => {
                const hits = occupiedTileCenters.get(key) || [];
                return hits.some(hit => !sameGroup(hit));
            });
            if (centerBlockedByOccupiedLine) {
                sameDirectionOverlapGroupIds.forEach(id => overlapMergeGroupIds.add(id));
                return;
            }
            keys.forEach(key => occupied.set(key, segment));
            segmentTileKeys.forEach(key => {
                if (!occupiedTileCenters.has(key)) occupiedTileCenters.set(key, []);
                occupiedTileCenters.get(key).push(segment);
            });
            additions.push(segment);
        });
        // 在原始 lines 基礎上追加新生成的 additions（延伸模式的正確行為）
        const mergedLines = lines.concat(additions);

        // [物流延伸修正] 同一群組在多次延伸後，舊段也必須同步最新端點/連線資訊，
        // 否則渲染端在判定 port-to-port 接通時會讀到過期 metadata，導致誤顯示為未接通。
        mergedLines.forEach((seg) => {
            if (!seg) return;
            const sameGroup = (seg.groupId === groupId) || (seg.id === groupId);
            if (!sameGroup) return;
            seg.groupId = groupId;
            seg.sourceId = sourceId;
            seg.targetId = targetId;
            seg.targetPoint = targetId ? null : cleanTargetPoint;
            seg.routeWidth = Math.max(1, Number(routeWidth) || 1);
            seg.lineType = lineType || seg.lineType || 'transport_line';
            seg.efficiency = Number(efficiency) || Number(seg.efficiency) || 0;
            if (cleanSourcePort) seg.sourcePort = cleanSourcePort;
            if (cleanTargetPort) seg.targetPort = cleanTargetPort;
            seg.filter = filter || null;
        });

        GameEngine.state.logisticsLines = mergedLines;

        if (conn) {
            conn.lineId = groupId;
            conn.routePoints = gridPoints.map(p => ({ x: p.x, y: p.y }));
            conn.routeWidth = Math.max(1, Number(routeWidth) || 1);
            conn.lineType = lineType || 'transport_line';
            conn.efficiency = Number(efficiency) || 0;
            conn.sourcePort = cleanSourcePort;
            conn.targetPort = cleanTargetPort;
        }

        let mergedGroupId = groupId;
        overlapMergeGroupIds.forEach(otherGroupId => {
            if (!otherGroupId || otherGroupId === mergedGroupId) return;
            if (blockedOverlapGroupIds.has(otherGroupId)) return;
            mergedGroupId = this.mergeLogisticsLineGroups(mergedGroupId, otherGroupId) || mergedGroupId;
        });
        mergedGroupId = this.mergeConnectedLogisticsGroups(mergedGroupId) || mergedGroupId;

        // [修正 v2] 建造/延伸/合併全部完成後，對最終群組再做一次統一重整。
        // 確保純延伸（未觸發 mergeLogisticsLineGroups）的情境下 order 也正確。
        const postBuildSegs = (GameEngine.state.logisticsLines || []).filter(
            l => l && (l.groupId === mergedGroupId || l.id === mergedGroupId)
        );
        if (postBuildSegs.length > 0) {
            this.orderLogisticsSegmentsByDirection(postBuildSegs);
        }

        if (conn && mergedGroupId !== groupId) {
            conn.lineId = mergedGroupId;
        }
        this.recalculateLogisticsGroupEndpoints(mergedGroupId);
        this.rebuildSpatialHashGrid();
        this.updateActiveTransfersOnLogisticsChange(GameEngine.state);
        return additions[additions.length - 1] || segments.map(segment => occupied.get(this.getLogisticsSegmentOccupyKey(segment))).filter(Boolean).pop() || this.getLogisticsLineById(mergedGroupId) || null;
    }

    getLogisticsLineRoute(line) {
        if (!line || !Array.isArray(line.routePoints) || line.routePoints.length < 2) return null;
        return {
            points: line.routePoints.map(p => ({ x: p.x, y: p.y })),
            width: Math.max(1, Number(line.routeWidth) || 1)
        };
    }

    getLogisticsLineById(lineId) {
        return this.ensureLogisticsLineStore().find(line =>
            line.id === lineId ||
            line.groupId === lineId ||
            this.getLogisticsLineSelectionKey(line) === lineId
        ) || null;
    }

    getLogisticsSegmentsByGroupId(groupId) {
        return this.ensureLogisticsLineStore()
            .filter(line => line.groupId === groupId || line.id === groupId)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    setLogisticsGroupFilter(groupId, filterItem) {
        this.getLogisticsSegmentsByGroupId(groupId).forEach(line => {
            line.filter = filterItem || null;
        });
    }

    getLogisticsLineNodePoints(line) {
        const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
        const nodes = [];
        const push = (point) => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            if (!nodes.some(node => Math.hypot(node.x - point.x, node.y - point.y) < 1)) {
                nodes.push({ x: point.x, y: point.y });
            }
        };

        points.forEach(push);
        if (Number.isFinite(line?.x) && Number.isFinite(line?.y)) push({ x: line.x, y: line.y });
        return nodes;
    }

    isPointOnLogisticsLine(point, line) {
        if (!point || !line) return false;
        const points = Array.isArray(line.routePoints) ? line.routePoints : [];
        if (points.some(p => p && Math.hypot(p.x - point.x, p.y - point.y) < 1)) return true;
        if (Number.isFinite(line.x) && Number.isFinite(line.y) && Math.hypot(line.x - point.x, line.y - point.y) < 1) return true;

        const eps = 1;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const lengthSq = dx * dx + dy * dy;
            if (lengthSq < 0.001) continue;
            const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
            if (t < -0.001 || t > 1.001) continue;
            const projX = a.x + dx * t;
            const projY = a.y + dy * t;
            if (Math.hypot(point.x - projX, point.y - projY) <= eps) return true;
        }
        return false;
    }

    getLogisticsLineDirectedCells(line) {
        const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
        if (points.length < 2) return [];
        const TS = GameEngine.TILE_SIZE;
        const cells = [];
        const seen = new Set();

        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            if (!a || !b) continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.001) continue;

            const dirX = Math.sign(dx);
            const dirY = Math.sign(dy);
            const steps = Math.max(1, Math.round(dist / TS));
            const stepSize = dist / steps;

            for (let step = 0; step < steps; step++) {
                const px = a.x + (dx / dist) * stepSize * step;
                const py = a.y + (dy / dist) * stepSize * step;
                const snapped = this.snapPointToGridCenter({ x: px, y: py });
                const key = `${snapped.x},${snapped.y}`;
                const uniqueKey = `${key}:${dirX},${dirY}`;
                if (seen.has(uniqueKey)) continue;
                seen.add(uniqueKey);
                cells.push({ key, dirX, dirY });
            }
        }

        return cells;
    }

    areLogisticsGroupsTouching(primaryGroupId, secondaryGroupId) {
        if (!primaryGroupId || !secondaryGroupId || primaryGroupId === secondaryGroupId) return false;
        const primaryLines = this.getLogisticsSegmentsByGroupId(primaryGroupId);
        const secondaryLines = this.getLogisticsSegmentsByGroupId(secondaryGroupId);
        if (!primaryLines.length || !secondaryLines.length) return false;

        const getEndpointDirs = (line) => {
            const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
            if (points.length < 2) return [];
            const start = points[0];
            const end = points[points.length - 1];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const dir = Math.abs(dx) >= Math.abs(dy)
                ? { x: Math.sign(dx) || 1, y: 0 }
                : { x: 0, y: Math.sign(dy) || 1 };
            return [
                { key: `${Math.round(start.x)},${Math.round(start.y)}`, dirX: dir.x, dirY: dir.y },
                { key: `${Math.round(end.x)},${Math.round(end.y)}`, dirX: dir.x, dirY: dir.y }
            ];
        };

        const secondaryEndpoints = new Map();
        secondaryLines.forEach(line => {
            getEndpointDirs(line).forEach(endpoint => {
                if (!secondaryEndpoints.has(endpoint.key)) secondaryEndpoints.set(endpoint.key, []);
                secondaryEndpoints.get(endpoint.key).push(endpoint);
            });
        });

        for (const line of primaryLines) {
            for (const endpoint of getEndpointDirs(line)) {
                const matches = secondaryEndpoints.get(endpoint.key) || [];
                if (matches.some(other => !(other.dirX === -endpoint.dirX && other.dirY === -endpoint.dirY))) {
                    return true;
                }
            }
        }

        const secondaryCells = new Map();
        secondaryLines.forEach(line => {
            this.getLogisticsLineDirectedCells(line).forEach(cell => {
                if (!secondaryCells.has(cell.key)) secondaryCells.set(cell.key, []);
                secondaryCells.get(cell.key).push(cell);
            });
        });

        let hasSameDirectionOverlap = false;
        for (const line of primaryLines) {
            const cells = this.getLogisticsLineDirectedCells(line);
            for (const cell of cells) {
                const overlaps = secondaryCells.get(cell.key) || [];
                if (overlaps.some(other => other.dirX === -cell.dirX && other.dirY === -cell.dirY)) return false;
                if (overlaps.some(other => other.dirX === cell.dirX && other.dirY === cell.dirY)) hasSameDirectionOverlap = true;
            }
        }
        return hasSameDirectionOverlap;
    }

    mergeConnectedLogisticsGroups(groupId) {
        if (this.isProcessingMerge === true) {
            return groupId;
        }

        let activeGroupId = groupId;
        if (!activeGroupId) return null;

        let merged = true;
        while (merged) {
            merged = false;
            const otherGroupIds = [...new Set(this.ensureLogisticsLineStore()
                .map(line => line?.groupId || line?.id)
                .filter(id => id && id !== activeGroupId))];

            for (const otherGroupId of otherGroupIds) {
                if (!this.areLogisticsGroupsTouching(activeGroupId, otherGroupId)) continue;
                activeGroupId = this.mergeLogisticsLineGroups(activeGroupId, otherGroupId);
                merged = true;
                break;
            }
        }
        return activeGroupId;
    }

    mergeLogisticsLineGroups(primaryGroupId, secondaryGroupId) {
        if (this.isProcessingMerge === true) {
            return primaryGroupId;
        }
        if (!primaryGroupId || !secondaryGroupId || primaryGroupId === secondaryGroupId) return primaryGroupId || secondaryGroupId || null;
        const lines = this.ensureLogisticsLineStore();
        const primaryLines = lines.filter(line => line && (line.groupId === primaryGroupId || line.id === primaryGroupId));
        const secondaryLines = lines.filter(line => line && (line.groupId === secondaryGroupId || line.id === secondaryGroupId));
        if (primaryLines.length === 0 || secondaryLines.length === 0) return primaryGroupId;

        const hasPortPosition = (port) => port && Number.isFinite(port.x) && Number.isFinite(port.y);
        const primaryMeta = primaryLines.find(line => line && (line.sourceId || line.targetId || line.sourcePort || line.targetPort)) || primaryLines[0];
        const secondaryMeta = secondaryLines.find(line => line && (line.sourceId || line.targetId || line.sourcePort || line.targetPort)) || secondaryLines[0];
        let canonicalSourceId = primaryMeta?.sourceId || secondaryMeta?.sourceId || null;
        let canonicalTargetId = primaryMeta?.targetId || secondaryMeta?.targetId || null;
        let canonicalSourcePort = [primaryMeta?.sourcePort, secondaryMeta?.sourcePort].find(hasPortPosition) || null;
        let canonicalTargetPort = [primaryMeta?.targetPort, secondaryMeta?.targetPort].find(hasPortPosition) || null;
        let filter = primaryMeta?.filter || secondaryMeta?.filter || null;

        (GameEngine.state.mapEntities || []).forEach(ent => {
            if (!Array.isArray(ent.outputTargets)) return;
            const sourceId = window.UIManager.getEntityId(ent);
            ent.outputTargets.forEach(conn => {
                if (!conn) return;
                if (conn.lineId !== primaryGroupId && conn.lineId !== secondaryGroupId) return;
                conn.lineId = primaryGroupId;
                canonicalSourceId = sourceId || canonicalSourceId;
                canonicalTargetId = conn.id || canonicalTargetId;
                canonicalSourcePort = hasPortPosition(conn.sourcePort) ? conn.sourcePort : canonicalSourcePort;
                canonicalTargetPort = hasPortPosition(conn.targetPort) ? conn.targetPort : canonicalTargetPort;
                filter = conn.filter || filter;
            });
        });

        [...primaryLines, ...secondaryLines].forEach(line => {
            line.groupId = primaryGroupId;
            if (canonicalSourceId) line.sourceId = canonicalSourceId;
            if (canonicalTargetId) line.targetId = canonicalTargetId;
            if (hasPortPosition(canonicalSourcePort)) line.sourcePort = canonicalSourcePort;
            if (hasPortPosition(canonicalTargetPort)) line.targetPort = canonicalTargetPort;
            if (filter) line.filter = filter;
        });

        // [修正 v2] 合併後強制重整 order/splitSequenceOrder，防止兩群組各自的 0..n
        // 合併成一個群組後產生重複值，導致後續刪除前後段分割完全錯誤。
        const allMergedSegs = lines.filter(l => l && l.groupId === primaryGroupId);
        if (allMergedSegs.length > 0) {
            this.orderLogisticsSegmentsByDirection(allMergedSegs);
        }

        if (GameEngine.state.selectedLogisticsGroupId === secondaryGroupId) GameEngine.state.selectedLogisticsGroupId = primaryGroupId;
        this.recalculateLogisticsGroupEndpoints(primaryGroupId);
        return primaryGroupId;
    }

    cleanupDeletedLinePreviousTurnOverride(deletedLine, originalGroupId) {
        if (!deletedLine || !originalGroupId) return;
        const TS = GameEngine.TILE_SIZE;
        const lines = this.ensureLogisticsLineStore();
        const getSequenceOrder = (line) => Number.isFinite(line?.splitSequenceOrder)
            ? line.splitSequenceOrder
            : (Number.isFinite(line?.order) ? line.order : 0);
        const deletedOrder = getSequenceOrder(deletedLine);
        const previous = lines
            .filter(line => line && (line.groupId === originalGroupId || line.id === originalGroupId))
            .filter(line => getSequenceOrder(line) < deletedOrder)
            .sort((a, b) => getSequenceOrder(b) - getSequenceOrder(a))[0] || null;
        if (!previous?.turnArrowOverride) return;

        const pointsTowardDeletedLine = (override) => {
            if (!Number.isFinite(override?.anchorX) || !Number.isFinite(override?.anchorY)) return false;
            if (!Number.isFinite(override?.extensionDirX) || !Number.isFinite(override?.extensionDirY)) return false;
            const targetX = override.anchorX + override.extensionDirX * TS;
            const targetY = override.anchorY + override.extensionDirY * TS;
            return Math.hypot(targetX - (deletedLine.x || 0), targetY - (deletedLine.y || 0)) <= TS * 0.25;
        };

        if (!pointsTowardDeletedLine(previous.turnArrowOverride)) return;
        const overrideKey = `${previous.turnArrowOverride.groupId || "line"}:${previous.turnArrowOverride.cellKey}`;
        const overrideCellKey = previous.turnArrowOverride.cellKey;
        delete previous.turnArrowOverride;

        if (Array.isArray(GameEngine.state.logisticsTurnArrowOverrides)) {
            GameEngine.state.logisticsTurnArrowOverrides = GameEngine.state.logisticsTurnArrowOverrides.filter(override => {
                if (override?.overrideKey === overrideKey) return false;
                return override?.cellKey !== overrideCellKey;
            });
        }
    }

    getLogisticsLineSourceEntity(line) {
        if (!line || !line.sourceId || !GameEngine.state?.mapEntities) return null;
        return GameEngine.state.mapEntities.find(ent => window.UIManager.getEntityId(ent) === line.sourceId) || null;
    }
    getLogisticsLineSelectionKey(line) {
        if (!line) return null;
        const gx = line.gridX !== undefined ? line.gridX : Math.round((line.x || 0) / (GameEngine.TILE_SIZE / 2));
        const gy = line.gridY !== undefined ? line.gridY : Math.round((line.y || 0) / (GameEngine.TILE_SIZE / 2));
        return `${line.id || line.groupId || 'logistics'}@${gx},${gy}`;
    }

    isSelectedLogisticsLine(line) {
        const selectedId = GameEngine.state.selectedLogisticsLineId;
        const selectedGroupId = GameEngine.state.selectedLogisticsGroupId;
        if (!line) return false;
        if (selectedGroupId && (line.groupId === selectedGroupId || line.id === selectedGroupId)) return true;
        if (!selectedId) return false;
        return this.getLogisticsLineSelectionKey(line) === selectedId;
    }

    orderLogisticsSegmentsByDirection(segments) {
        if (!Array.isArray(segments) || segments.length <= 1) {
            if (Array.isArray(segments) && segments.length === 1) {
                segments[0].order = 0;
                segments[0].splitSequenceOrder = 0;
            }
            return Array.isArray(segments) ? [...segments] : [];
        }

        const TS = GameEngine.TILE_SIZE || 20;
        const align = TS / 2;
        const getSequenceOrder = (seg) => Number.isFinite(seg?.splitSequenceOrder)
            ? seg.splitSequenceOrder
            : (Number.isFinite(seg?.order) ? seg.order : 0);
        const getCoords = (seg) => {
            if (Number.isFinite(seg?.startGx) && Number.isFinite(seg?.startGy) &&
                Number.isFinite(seg?.endGx) && Number.isFinite(seg?.endGy)) {
                return { startGx: seg.startGx, startGy: seg.startGy, endGx: seg.endGx, endGy: seg.endGy };
            }
            const points = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
            const start = points[0] || { x: seg?.x || 0, y: seg?.y || 0 };
            const end = points[points.length - 1] || start;
            return {
                startGx: Math.round(start.x / align),
                startGy: Math.round(start.y / align),
                endGx: Math.round(end.x / align),
                endGy: Math.round(end.y / align)
            };
        };
        const coordKey = (gx, gy) => gx + "," + gy;
        const directionOf = (seg) => {
            const c = getCoords(seg);
            return {
                x: Math.sign(c.endGx - c.startGx),
                y: Math.sign(c.endGy - c.startGy)
            };
        };
        const sortStable = (list) => [...list].sort((a, b) =>
            getSequenceOrder(a) - getSequenceOrder(b) ||
            String(a.id || "").localeCompare(String(b.id || ""))
        );

        const byStart = new Map();
        const byEnd = new Map();
        const addEndpoint = (map, key, seg) => {
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(seg);
        };
        segments.forEach(seg => {
            const c = getCoords(seg);
            addEndpoint(byStart, coordKey(c.startGx, c.startGy), seg);
            addEndpoint(byEnd, coordKey(c.endGx, c.endGy), seg);
        });

        const offsets = [
            [0, 0],
            [-1, 0], [1, 0], [0, -1], [0, 1],
            [-1, -1], [-1, 1], [1, -1], [1, 1],
            [-2, 0], [2, 0], [0, -2], [0, 2],
            [-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2],
            [-2, -2], [-2, 2], [2, -2], [2, 2]
        ];

        const countIncoming = (seg) => {
            const c = getCoords(seg);
            let count = 0;
            offsets.forEach(([dx, dy]) => {
                (byEnd.get(coordKey(c.startGx + dx, c.startGy + dy)) || []).forEach(candidate => {
                    if (candidate !== seg) count++;
                });
            });
            return count;
        };

        const ordered = [];
        const remaining = new Set(segments);
        let current = sortStable(segments).find(seg => countIncoming(seg) === 0) || sortStable(segments)[0];

        const pickNext = (seg) => {
            const c = getCoords(seg);
            const currentDir = directionOf(seg);
            const candidates = [];
            offsets.forEach(([dx, dy], offsetIndex) => {
                (byStart.get(coordKey(c.endGx + dx, c.endGy + dy)) || []).forEach(candidate => {
                    if (!remaining.has(candidate) || candidate === seg) return;
                    const candidateDir = directionOf(candidate);
                    if (currentDir.x === -candidateDir.x && currentDir.y === -candidateDir.y) return;
                    const distance = Math.hypot(dx, dy);
                    const turnPenalty = currentDir.x === candidateDir.x && currentDir.y === candidateDir.y ? 0 : 0.25;
                    candidates.push({ candidate, score: distance + turnPenalty, offsetIndex });
                });
            });
            candidates.sort((a, b) =>
                a.score - b.score ||
                a.offsetIndex - b.offsetIndex ||
                getSequenceOrder(a.candidate) - getSequenceOrder(b.candidate) ||
                String(a.candidate.id || "").localeCompare(String(b.candidate.id || ""))
            );
            return candidates[0]?.candidate || null;
        };

        while (current && remaining.has(current)) {
            ordered.push(current);
            remaining.delete(current);
            current = pickNext(current);
        }

        if (remaining.size > 0) {
            sortStable([...remaining]).forEach(seg => ordered.push(seg));
        }

        for (let i = 0; i < ordered.length; i++) {
            ordered[i].prevId = i > 0 ? ordered[i - 1].id : null;
            ordered[i].nextId = i < ordered.length - 1 ? ordered[i + 1].id : null;
            ordered[i].order = i;
            ordered[i].splitSequenceOrder = i;

            const prevSeg = i > 0 ? ordered[i - 1] : null;
            const nextSeg = i < ordered.length - 1 ? ordered[i + 1] : null;
            const isCorner = (prevSeg && prevSeg.dir !== ordered[i].dir) || 
                             (nextSeg && nextSeg.dir !== ordered[i].dir);
            ordered[i].isCorner = !!isCorner;
        }

        return ordered;
    }

    updateActiveTransfersOnLogisticsChange(state) {
        if (!state || !Array.isArray(state.activeTransfers) || state.activeTransfers.length === 0) return;
        const TS = GameEngine.TILE_SIZE || 20;

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

        for (let i = state.activeTransfers.length - 1; i >= 0; i--) {
            const t = state.activeTransfers[i];
            if (!Array.isArray(t.routePoints) || t.routePoints.length < 2) continue;

            // 計算目前視覺位置
            const currentPos = getPointOnPath(t.routePoints, t.progress);

            // 尋找地圖上最接近的輸送帶線段
            let currentSeg = null;
            let bestSegDist = Infinity;
            (state.logisticsLines || []).forEach(line => {
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
                // 底下輸送帶被刪除 -> 物品掉落或毀損
                state.activeTransfers.splice(i, 1);
                continue;
            }

            // 更新 lineId 到該線段的最新 groupId
            const newGroupId = currentSeg.groupId || currentSeg.id;
            t.lineId = newGroupId;

            // 取得該群組全新的完整路徑點
            const groupSegs = (state.logisticsLines || []).filter(l => l && (l.groupId === newGroupId || l.id === newGroupId));
            let pathPoints = null;

            const ordered = this.orderLogisticsSegmentsByDirection(groupSegs);
            if (ordered.length > 0) {
                const firstSeg = ordered[0];
                const lastSeg = ordered[ordered.length - 1];
                if (firstSeg && lastSeg && Array.isArray(firstSeg.routePoints) && Array.isArray(lastSeg.routePoints)) {
                    const startPt = firstSeg.routePoints[0];
                    const endPt = lastSeg.routePoints[lastSeg.routePoints.length - 1];
                    if (startPt && endPt) {
                        const shortest = findShortestPathBetweenPoints(groupSegs, startPt, endPt);
                        if (shortest && shortest.length >= 2) {
                            // 尋找起點與終點建築
                            const sourceEnt = currentSeg.sourceId
                                ? state.mapEntities.find(ent => window.UIManager.getEntityId(ent) === currentSeg.sourceId)
                                : null;
                            const targetEnt = currentSeg.targetId
                                ? state.mapEntities.find(ent => window.UIManager.getEntityId(ent) === currentSeg.targetId)
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
                                // 即使無建築，也應與原路徑方向比對
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
                // Correctly annotate corners instead of using ordered[idx].isCorner (子任務 C-3)
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

            // 投影回新路徑上，重新計算 progress，保持在相同實體位置
            const projDist = getPathDistanceToProj(pathPoints, currentPos);
            const totalLen = getPathTotalLength(pathPoints);
            t.progress = totalLen > 0 ? Math.max(0, Math.min(1, projDist / totalLen)) : 1;
            t.routePoints = pathPoints;
            t.sourceId = currentSeg.sourceId || null;
            t.targetId = currentSeg.targetId || null;
            t.efficiency = Number(currentSeg.efficiency) || 0;
        }

        this.applyBlockedTransferQueues(state);
    }

    applyBlockedTransferQueues(state) {
        if (!state || !Array.isArray(state.activeTransfers) || state.activeTransfers.length === 0) return;
        const TS = GameEngine.TILE_SIZE || 20;
        const pathMetricsCache = new Map();

        const getPathMetrics = (points) => {
            if (!Array.isArray(points) || points.length < 2) return { total: 0, segments: [] };
            const cached = pathMetricsCache.get(points);
            if (cached) return cached;

            let total = 0;
            const segments = [];
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.hypot(dx, dy);
                segments.push({ a, b, dx, dy, len, start: total });
                total += len;
            }
            const metrics = { total, segments };
            pathMetricsCache.set(points, metrics);
            return metrics;
        };
        const getPathTotalLength = (points) => {
            return getPathMetrics(points).total;
        };
        const getPointOnPathByDistance = (points, distance) => {
            if (!Array.isArray(points) || points.length < 2) return null;
            let remaining = Math.max(0, Number(distance) || 0);
            const segments = getPathMetrics(points).segments;
            for (let i = 0; i < segments.length; i++) {
                const { a, b, dx, dy, len } = segments[i];
                if (len <= 0) continue;
                if (remaining <= len || i === segments.length - 1) {
                    const t = Math.max(0, Math.min(1, remaining / len));
                    return {
                        x: a.x + dx * t,
                        y: a.y + dy * t
                    };
                }
                remaining -= len;
            }
            return points[points.length - 1] || null;
        };
        const getPathDistanceToPoint = (points, point) => {
            if (!Array.isArray(points) || points.length < 2 || !point) return 0;
            let bestDist = Infinity;
            let bestPathDist = 0;
            const segments = getPathMetrics(points).segments;
            for (let i = 0; i < segments.length; i++) {
                const { a, dx, dy, len, start } = segments[i];
                const lenSq = dx * dx + dy * dy;
                if (lenSq <= 0) continue;
                const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
                const proj = { x: a.x + dx * t, y: a.y + dy * t };
                const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestPathDist = start + len * t;
                }
            }
            return bestPathDist;
        };
        const pathKey = (transfer) => {
            if (transfer.lineId) return `line:${transfer.lineId}`;
            const points = transfer.routePoints || [];
            const first = points[0];
            const last = points[points.length - 1];
            return [
                "route",
                first ? `${Math.round(first.x)},${Math.round(first.y)}` : "start",
                last ? `${Math.round(last.x)},${Math.round(last.y)}` : "end"
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
            const canonical = transfers.reduce((best, transfer) => {
                const len = getPathTotalLength(transfer.routePoints);
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
                const total = getPathTotalLength(transfer.routePoints);
                const distance = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * total;
                const resolved = useCanonical
                    ? getPathDistanceToPoint(canonical.points, getPointOnPathByDistance(transfer.routePoints, distance))
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

            let occupiedProgress = Infinity;
            let queueBlockedBehind = false;
            transfers.forEach(transfer => {
                const sourceLength = getPathTotalLength(transfer.routePoints);
                const totalLength = useCanonical ? canonical.length : sourceLength;
                if (totalLength <= 0) return;

                const sourceDistance = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * sourceLength;
                const desired = useCanonical
                    ? getPathDistanceToPoint(canonical.points, getPointOnPathByDistance(transfer.routePoints, sourceDistance))
                    : sourceDistance;
                let maxAllowed = occupiedProgress - TS;
                let breakpointLimit = totalLength;

                if (!transfer.targetId) {
                    breakpointLimit = Math.floor(totalLength / TS) * TS;
                    maxAllowed = Math.min(maxAllowed, breakpointLimit);
                } else {
                    maxAllowed = Math.min(maxAllowed, totalLength);
                }

                let queuedDistance = Math.max(0, Math.min(desired, maxAllowed));
                if (Math.abs(queuedDistance - desired) < 0.1) {
                    queuedDistance = desired;
                }

                const blockedAtBreakpoint = !transfer.targetId && queuedDistance >= breakpointLimit - 0.1;
                transfer.queueBlocked = queuedDistance < desired - 0.1 || blockedAtBreakpoint || queueBlockedBehind;
                if (useCanonical) {
                    transfer.routePoints = canonical.points.map(point => ({ ...point }));
                }
                transfer.progress = Math.max(0, Math.min(1, queuedDistance / totalLength));
                if (transfer.targetId) {
                    delete transfer.blockedOnBrokenLine;
                } else {
                    transfer.blockedOnBrokenLine = true;
                }

                occupiedProgress = queuedDistance;
                queueBlockedBehind = transfer.queueBlocked === true;
            });
        });
    }

    recalculateLogisticsGroupEndpoints(groupId) {
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
        const matchThreshold = TS * 0.9; // 允許鄰近一個網格以內的距離
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
            conn.filter = firstSeg.filter || null;

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

    deleteLogisticsLineById(lineId) {
        this.isProcessingMerge = true;
        try {
            const state = GameEngine.state;
            const line = this.getLogisticsLineById(lineId);
            if (!line) return false;
            const lineKey = this.getLogisticsLineSelectionKey(line);
            const groupId = line.groupId || line.id;

            const lineGridX = line.gridX;
            const lineGridY = line.gridY;

            // DLL 指標斷開
            const segments = this.ensureLogisticsLineStore();
            const prevSeg = segments.find(s => s && s.nextId === line.id);
            const nextSeg = segments.find(s => s && s.prevId === line.id);
            if (prevSeg) prevSeg.nextId = null;
            if (nextSeg) nextSeg.prevId = null;

            state.logisticsLines = segments.filter(item => {
                const isTarget = this.getLogisticsLineSelectionKey(item) === lineKey;
                const isDuplicate = item && item.gridX === lineGridX && item.gridY === lineGridY;
                return !isTarget && !isDuplicate;
            });
            this.cleanupDeletedLinePreviousTurnOverride(line, groupId);

            // [核心修正 v3] 使用「order 值直接分割」取代不可靠的 BFS 端點連通判定。
            const getSequenceOrder = (seg) =>
                Number.isFinite(seg?.splitSequenceOrder) ? seg.splitSequenceOrder
                    : (Number.isFinite(seg?.order) ? seg.order : 0);

            const deletedOrder = getSequenceOrder(line);
            const remainingSegments = this.getLogisticsSegmentsByGroupId(groupId);

            if (remainingSegments.length > 0) {
                // 依 order 值將剩餘線段分為前半段與後半段
                const frontSegments = remainingSegments.filter(seg => getSequenceOrder(seg) < deletedOrder);
                const backSegments = remainingSegments.filter(seg => getSequenceOrder(seg) >= deletedOrder);

                if (frontSegments.length > 0 && backSegments.length > 0) {
                    const newGroupId = `log_group_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
                    backSegments.forEach(seg => {
                        if (seg) seg.groupId = newGroupId;
                    });
                    const frontTail = frontSegments
                        .sort((a, b) => getSequenceOrder(b) - getSequenceOrder(a))[0] || null;
                    this.markDeletedGapEndpoint(frontTail);

                    // 自動重新計算兩段物流線的端點及與建築物的連接關係
                    this.recalculateLogisticsGroupEndpoints(groupId);
                    this.recalculateLogisticsGroupEndpoints(newGroupId);

                    GameEngine.addLog(`[物流] 線段中斷，物流線已拆分為獨立路線。`, 'LOGISTICS');
                } else {
                    // 只有前半或只有後半（從端點刪除），只需重新計算該群組即可
                    this.recalculateLogisticsGroupEndpoints(groupId);
                }
            } else {
                // 如果這個群組已經沒有任何線段，清除 sourceEnt 的輸出紀錄
                if (line.sourceId) {
                    const sourceEnt = state.mapEntities.find(ent => window.UIManager.getEntityId(ent) === line.sourceId);
                    if (sourceEnt && Array.isArray(sourceEnt.outputTargets)) {
                        sourceEnt.outputTargets = sourceEnt.outputTargets.filter(conn => conn.lineId !== groupId);
                    }
                }
            }

            this.updateActiveTransfersOnLogisticsChange(state);

            if (state.selectedLogisticsLineId === lineKey) state.selectedLogisticsLineId = null;
            if (state.selectedLogisticsGroupId === line.groupId || state.selectedLogisticsGroupId === line.id) state.selectedLogisticsGroupId = null;
            if (window.UIManager.activeLogisticsLine && this.getLogisticsLineSelectionKey(window.UIManager.activeLogisticsLine) === lineKey) window.UIManager.activeLogisticsLine = null;
            if (window.UIManager.activeLogisticsConnection?.lineId === lineKey) window.UIManager.activeLogisticsConnection = null;
            GameEngine.addLog(`[物流] 物流線段已刪除`, 'LOGISTICS');
            return true;
        } finally {
            this.isProcessingMerge = false;
            this.rebuildSpatialHashGrid();
        }
    }

    deleteLogisticsLineGroupById(groupId) {
        const state = GameEngine.state;
        const segments = this.getLogisticsSegmentsByGroupId(groupId);
        if (!segments.length) return false;
        const first = segments[0];
        state.logisticsLines = this.ensureLogisticsLineStore().filter(item => item.groupId !== groupId && item.id !== groupId);
        if (first.sourceId) {
            const sourceEnt = state.mapEntities.find(ent => window.UIManager.getEntityId(ent) === first.sourceId);
            if (sourceEnt && Array.isArray(sourceEnt.outputTargets)) {
                sourceEnt.outputTargets = sourceEnt.outputTargets.filter(conn => conn.lineId !== groupId);
            }
        }
        if (segments.some(line => this.isSelectedLogisticsLine(line))) state.selectedLogisticsLineId = null;
        if (state.selectedLogisticsGroupId === groupId) state.selectedLogisticsGroupId = null;
        if (window.UIManager.activeLogisticsLine && window.UIManager.activeLogisticsLine.groupId === groupId) window.UIManager.activeLogisticsLine = null;
        if (window.UIManager.activeLogisticsConnection?.groupId === groupId) window.UIManager.activeLogisticsConnection = null;
        this.updateActiveTransfersOnLogisticsChange(state);
        GameEngine.addLog(`[物流] 物流線群組已刪除`, 'LOGISTICS');
        this.rebuildSpatialHashGrid();
        return true;
    }

    getLogisticsLineAt(worldX, worldY) {
        return this.getLogisticsLinesAt(worldX, worldY)[0] || null;
    }

    getLogisticsLinesAt(worldX, worldY) {
        const TS = GameEngine.TILE_SIZE;
        const getVisibleRects = (line) => {
            const points = Array.isArray(line.routePoints)
                ? line.routePoints.map(p => ({ x: p.x, y: p.y }))
                : [];
            if (points.length < 2) return [];
            const width = Math.max(1, Math.round(Number(line.routeWidth) || 1));
            const rects = [];
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 0.001) continue;

                const dir = { x: dx / dist, y: dy / dist };
                const steps = Math.max(1, Math.round(dist / TS));
                const stepSize = dist / steps;

                for (let step = 0; step < steps; step++) {
                    const px = a.x + dir.x * stepSize * step;
                    const py = a.y + dir.y * stepSize * step;

                    const isHorizontal = Math.abs(dir.x) > Math.abs(dir.y);
                    rects.push({
                        x: px - (isHorizontal ? TS / 2 : (width * TS) / 2),
                        y: py - (isHorizontal ? (width * TS) / 2 : TS / 2),
                        w: (isHorizontal ? TS : width * TS),
                        h: (isHorizontal ? width * TS : TS),
                        segment: line,
                        isEndpoint: false
                    });
                }
            }
            if (!line.targetId && !line.suppressOpenEndpointCell) {
                const end = points[points.length - 1];
                const prev = points[points.length - 2];
                if (end && prev) {
                    const dx = end.x - prev.x;
                    const dy = end.y - prev.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist >= 0.001) {
                        const dir = { x: dx / dist, y: dy / dist };
                        const isHorizontal = Math.abs(dir.x) > Math.abs(dir.y);
                        rects.push({
                            x: end.x - (isHorizontal ? TS / 2 : (width * TS) / 2),
                            y: end.y - (isHorizontal ? (width * TS) / 2 : TS / 2),
                            w: (isHorizontal ? TS : width * TS),
                            h: (isHorizontal ? width * TS : TS),
                            segment: line,
                            isEndpoint: true
                        });
                    }
                }
            }
            return rects;
        };
        const hits = [];
        const nearbyLines = this.spatialGrid.getNearby(worldX, worldY);
        nearbyLines.forEach(line => {
            getVisibleRects(line).forEach(rect => {
                if (
                    worldX >= rect.x && worldX <= rect.x + rect.w &&
                    worldY >= rect.y && worldY <= rect.y + rect.h
                ) {
                    const cx = rect.x + rect.w / 2;
                    const cy = rect.y + rect.h / 2;
                    hits.push({
                        line: rect.segment || line,
                        distance: Math.hypot(worldX - cx, worldY - cy),
                        isEndpoint: !!rect.isEndpoint
                    });
                }
            });
        });
        hits.sort((a, b) =>
            Number(a.isEndpoint) - Number(b.isEndpoint) ||
            a.distance - b.distance ||
            (b.line.createdAt || 0) - (a.line.createdAt || 0)
        );
        return hits.map(hit => hit.line);
    }
}

export const conveyorSystem = new ConveyorSystem();
