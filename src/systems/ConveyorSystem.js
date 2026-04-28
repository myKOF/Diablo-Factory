import { ConveyorRouter } from './ConveyorRouter.js';
import { GameEngine } from './game_systems.js';
import { UI_CONFIG } from '../ui/ui_config.js';

export class ConveyorSystem {
    constructor() {
        this.activeDrag = null;
        this.router = null;
        this.ghosts = [];
        this.isValid = false;
        this.pendingDragPoint = null;
        this.isDragFrameQueued = false;
        this.lastRouteKey = null;
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

        const rows = grid.length;
        const cols = grid[0].length;
        const routeScale = this.getRouteScale();
        const routeWidth = Math.max(1, Number(currentSourcePort?.width) || 1);
        const routeGrid = this.createRoutingGrid(grid, sourceLine);

        this.router = new ConveyorRouter(routeGrid, cols * routeScale, rows * routeScale);
        this.router.tileSize = this.getGridUnitSize();
        this.router.maxSearchNodes = Math.max(500, Number(UI_CONFIG.ConveyorBuild?.maxRouteSearchNodes) || 12000);

        this.activeDrag = {
            startX: resolvedStartX,
            startY: resolvedStartY,
            sourceEntity,
            sourcePort: currentSourcePort,
            sourceLine,
            targetBuilding: null,
            targetPort: null,
            bendMode: 'x-first',
            lastWorldPoint: null,
            startGrid: this.toGrid(resolvedStartX, resolvedStartY),
            routeWidth
        };

        this.ghosts = [];
        this.isValid = false;
        this.pendingDragPoint = null;
        this.isDragFrameQueued = false;
        this.lastRouteKey = null;
        console.log(`[ConveyorSystem] Drag started at ${resolvedStartX},${resolvedStartY}`);
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

    getDirectionVector(dir) {
        if (dir === 'up') return { x: 0, y: -1 };
        if (dir === 'down') return { x: 0, y: 1 };
        if (dir === 'left') return { x: -1, y: 0 };
        if (dir === 'right') return { x: 1, y: 0 };
        return { x: 0, y: 0 };
    }

    getPortAnchorGrid(port, portGrid) {
        if (!port || !port.dir || !portGrid) return portGrid;
        const dir = this.getDirectionVector(port.dir);
        // [需求修正] 回歸 0.5 網格下，1.0 Tile 的距離等於 2 格
        const routeScale = 2;
        return {
            x: portGrid.x + dir.x * routeScale,
            y: portGrid.y + dir.y * routeScale
        };
    }

    buildPortSafePath(routePath, sourcePortGrid, sourceRouteGrid, targetPortGrid, targetRouteGrid) {
        if (!routePath || routePath.length === 0) return [];
        const path = routePath.map(p => ({ ...p }));

        // 核心修復：將起點與終點的「錨點」也標記為 isPortConnector，
        // 這樣在轉向點剛好位於建築邊緣時，不會因為浮點數或對齊問題觸發非法碰撞。
        if (sourcePortGrid) {
            const alreadyHasStart = path.length > 0 && samePoint(path[0], sourcePortGrid);
            if (!alreadyHasStart && !samePoint(sourcePortGrid, sourceRouteGrid)) {
                path.unshift({ x: sourcePortGrid.x, y: sourcePortGrid.y, isPortConnector: true });
            }
            // 標記路徑中與錨點重合的點為安全
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
            // 標記路徑中與目標錨點重合的點為安全
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

    getWidthOffsets(width) {
        // [核心修正] 在 0.5 網格系統中，1 格寬度的物流線（20px）必須佔用連續的 2 小格
        // 使用 [-1, 0] 偏移量可以確保線路中心完美的落在網格點上。
        return [-1, 0];
    }

    getGhostOccupiedCells(ghosts, width) {
        if (!Array.isArray(ghosts) || ghosts.length === 0) return [];
        const cells = new Map();
        const offsets = this.getWidthOffsets(width);
        const addCell = (x, y) => cells.set(`${x},${y}`, { x, y });
        const addFootprint = (point, dir) => {
            if (!point) return;
            const d = dir || point.dirOut || point.dirIn || { x: 1, y: 0 };
            if (Math.abs(d.x) > Math.abs(d.y)) {
                offsets.forEach(offset => addCell(point.x, point.y + offset));
            } else {
                offsets.forEach(offset => addCell(point.x + offset, point.y));
            }
        };

        ghosts.forEach(ghost => {
            addFootprint(ghost, ghost.dirOut || ghost.dirIn);
            if (ghost.isCurve && ghost.dirIn && ghost.dirOut) {
                addFootprint(ghost, ghost.dirIn);
                addFootprint(ghost, ghost.dirOut);
            }
        });
        return Array.from(cells.values());
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
            this.getGhostOccupiedCells(ghosts, width).forEach(cell => mark(cell.x, cell.y));
        }
    }

    createRoutingGrid(grid, ignoreLine = null) {
        // [需求修正] 恢復網格擴張邏輯。將 1.0 Tile 的尋路格網擴張為 0.5 Tile 的物流格網
        const expanded = [];
        const routeScale = this.getRouteScale(); // 通常為 2
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
        const targetPortGrid = this.toGrid(dragTarget.x, dragTarget.y);
        const sourcePortGrid = this.activeDrag.startGrid;
        const sourceRouteGrid = this.getPortAnchorGrid(this.activeDrag.sourcePort, sourcePortGrid);
        const targetRouteGrid = dragTarget.port
            ? this.getPortAnchorGrid(dragTarget.port, targetPortGrid)
            : targetPortGrid;
        const routeKey = `${sourceRouteGrid.x},${sourceRouteGrid.y}->${targetRouteGrid.x},${targetRouteGrid.y}:${sourcePortGrid.x},${sourcePortGrid.y}:${targetPortGrid.x},${targetPortGrid.y}:${this.activeDrag.sourcePort?.dir || ''}:${dragTarget.port?.dir || ''}:${this.activeDrag.bendMode}:${dragTarget.building ? window.UIManager?.getEntityId?.(dragTarget.building) : ''}`;
        if (routeKey === this.lastRouteKey) return;
        this.lastRouteKey = routeKey;

        // Auto-Routing with A* Turn Penalty
        const routePath = this.router.findPath(sourceRouteGrid, targetRouteGrid, this.activeDrag.sourcePort?.dir, this.activeDrag.bendMode);
        const path = this.buildPortSafePath(routePath, sourcePortGrid, sourceRouteGrid, dragTarget.port ? targetPortGrid : null, targetRouteGrid);

        if (path) {
            this.ghosts = this.router.processPath(path, dragTarget.building, GameEngine.state.logisticsLines || []);
            this.isValid = this.validateGhosts(this.ghosts);
        } else {
            this.ghosts = [];
            this.isValid = false;
        }

        // Update global state for rendering
        GameEngine.state.conveyorGhosts = this.ghosts;
        GameEngine.state.conveyorValid = this.isValid;
        GameEngine.state.conveyorRouteWidth = this.activeDrag.routeWidth || 1;
    }

    toggleBendMode() {
        if (!this.activeDrag) return false;
        this.activeDrag.bendMode = this.activeDrag.bendMode === 'x-first' ? 'y-first' : 'x-first';
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

        const preferredDir = this.activeDrag.sourcePort?.dir
            ? window.UIManager?.getOppositeDirection?.(this.activeDrag.sourcePort.dir)
            : null;
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

        const state = GameEngine.state;
        const drag = this.activeDrag;
        const TS = GameEngine.TILE_SIZE;
        const offset = GameEngine.state.mapOffset || { x: 0, y: 0 };
        const unit = this.getGridUnitSize();
        const offsetX = offset.x * (TS / unit);
        const offsetY = offset.y * (TS / unit);

        // [回歸修正] 使用格中心對齊 (10, 30, 50...)
        const points = this.ghosts.map(g => ({
            ...g,
            x: (g.x + offset.x) * TS + TS / 2,
            y: (g.y + offset.y) * TS + TS / 2
        }));

        const lastPoint = points[points.length - 1];
        const dragTarget = this.resolveDragTarget(lastPoint.x, lastPoint.y);
        const targetBuilding = dragTarget.building || drag.targetBuilding;
        const targetPort = dragTarget.port || drag.targetPort || (targetBuilding ? window.UIManager?.getNearestPortSlot(targetBuilding, points[points.length - 2]?.x || points[0].x, points[points.length - 2]?.y || points[0].y) : null);

        // Call UIManager to create the real logistics line
        if (window.UIManager) {
            const createdLine = window.UIManager.upsertLogisticsLine({
                sourceEnt: drag.sourceEntity,
                targetEnt: targetBuilding,
                targetPoint: targetPort || points[points.length - 1],
                points: points,
                routeWidth: drag.routeWidth || drag.sourcePort?.width || 1,
                sourcePort: drag.sourcePort,
                targetPort: targetPort
            });
            if (drag.sourceLine?.filter && createdLine?.groupId) {
                window.UIManager.setLogisticsGroupFilter(createdLine.groupId, drag.sourceLine.filter);
            }
            GameEngine.addLog(`[物流] 傳送帶建造完成，共 ${this.ghosts.length} 節。`, 'LOGISTICS');
        }

        this.cancelDrag();
    }

    cancelDrag() {
        this.activeDrag = null;
        this.ghosts = [];
        this.pendingDragPoint = null;
        this.isDragFrameQueued = false;
        this.lastRouteKey = null;
        if (GameEngine.state) {
            GameEngine.state.conveyorGhosts = [];
            GameEngine.state.conveyorValid = false;
            GameEngine.state.conveyorRouteWidth = 1;
        }
    }

    toGrid(worldX, worldY) {
        const TS = GameEngine.TILE_SIZE;
        const offset = GameEngine.state.mapOffset || { x: 0, y: 0 };
        return {
            x: Math.floor(worldX / TS) - offset.x,
            y: Math.floor(worldY / TS) - offset.y
        };
    }

    validateGhosts(ghosts) {
        if (ghosts.length === 0) return false;
        const routeWidth = this.activeDrag?.routeWidth || 1;
        const routeGrid = this.router?.grid || [];
        const occupiedCells = this.getGhostOccupiedCells(ghosts.filter(ghost => !ghost.isPortConnector), routeWidth);
        for (const cell of occupiedCells) {
            if (cell.y < 0 || cell.y >= routeGrid.length || cell.x < 0 || cell.x >= routeGrid[cell.y].length) {
                return false;
            }
            if (routeGrid[cell.y][cell.x] !== 0) {
                return false;
            }
        }

        const cfg = UI_CONFIG.ConveyorBuild;
        if (!cfg || cfg.enableCost === false) return true;

        // 道具消耗檢查
        const cost = ghosts.length * (cfg.costPerSegment || 0);
        const resKey = cfg.costResource || "gold_ingots";
        const availableGold = (GameEngine.state.resources[resKey] || 0) + (GameEngine.state.resources.gold || 0);

        if (availableGold < cost) {
            return false;
        }

        return true;
    }
}

export const conveyorSystem = new ConveyorSystem();
