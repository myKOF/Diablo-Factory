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

        const rows = grid.length;
        const cols = grid[0].length;
        const routeGrid = this.createRoutingGrid(grid);
        const routeScale = this.getRouteScale();
        
        this.router = new ConveyorRouter(routeGrid, cols * routeScale, rows * routeScale);
        this.router.tileSize = this.getGridUnitSize();
        this.router.maxSearchNodes = Math.max(500, Number(UI_CONFIG.ConveyorBuild?.maxRouteSearchNodes) || 12000);

        this.activeDrag = {
            startX,
            startY,
            sourceEntity,
            sourcePort,
            sourceLine,
            targetBuilding: null,
            targetPort: null,
            bendMode: 'x-first',
            lastWorldPoint: null,
            startGrid: this.toGrid(startX, startY)
        };
        
        this.ghosts = [];
        this.isValid = false;
        this.pendingDragPoint = null;
        this.isDragFrameQueued = false;
        this.lastRouteKey = null;
        console.log(`[ConveyorSystem] Drag started at ${startX},${startY}`);
    }

    getAlignmentUnit() {
        const unit = Number(UI_CONFIG.ConveyorBuild?.alignmentUnit) || 0.5;
        return Math.max(0.5, Math.min(1, unit));
    }

    getGridUnitSize() {
        return GameEngine.TILE_SIZE * this.getAlignmentUnit();
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
        const routeScale = this.getRouteScale();
        const dir = this.getDirectionVector(port.dir);
        return {
            x: portGrid.x + dir.x * routeScale,
            y: portGrid.y + dir.y * routeScale
        };
    }

    buildPortSafePath(routePath, sourcePortGrid, sourceRouteGrid, targetPortGrid, targetRouteGrid) {
        if (!Array.isArray(routePath) || routePath.length === 0) return routePath;
        const path = routePath.map(p => ({ x: p.x, y: p.y }));
        const samePoint = (a, b) => a && b && a.x === b.x && a.y === b.y;
        if (sourcePortGrid && !samePoint(sourcePortGrid, sourceRouteGrid)) {
            path.unshift({ x: sourcePortGrid.x, y: sourcePortGrid.y, isPortConnector: true });
        }
        if (targetPortGrid && !samePoint(targetPortGrid, targetRouteGrid) && !samePoint(path[path.length - 1], targetPortGrid)) {
            path.push({ x: targetPortGrid.x, y: targetPortGrid.y, isPortConnector: true });
        }
        return path;
    }

    createRoutingGrid(grid) {
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
        const inflated = expanded.map(row => row.slice());
        const clearance = Math.max(1, Math.floor(routeScale / 2));
        for (let y = 0; y < expanded.length; y++) {
            for (let x = 0; x < expanded[y].length; x++) {
                if (expanded[y][x] === 0) continue;
                for (let dy = -clearance; dy <= clearance; dy++) {
                    for (let dx = -clearance; dx <= clearance; dx++) {
                        const ny = y + dy;
                        const nx = x + dx;
                        if (ny < 0 || ny >= inflated.length || nx < 0 || nx >= inflated[ny].length) continue;
                        inflated[ny][nx] = expanded[y][x];
                    }
                }
            }
        }
        return inflated;
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
            this.activeDrag.startX,
            this.activeDrag.startY,
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

        // Convert Ghost path to world points
        const points = this.ghosts.map(g => ({
            x: (g.x + offsetX) * unit,
            y: (g.y + offsetY) * unit
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
                routeWidth: drag.sourcePort?.width || 1,
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
        }
    }

    toGrid(worldX, worldY) {
        const TS = GameEngine.TILE_SIZE;
        const offset = GameEngine.state.mapOffset || { x: 0, y: 0 };
        const unit = this.getGridUnitSize();
        const offsetX = offset.x * (TS / unit);
        const offsetY = offset.y * (TS / unit);
        return {
            x: Math.round(worldX / unit) - offsetX,
            y: Math.round(worldY / unit) - offsetY
        };
    }

    validateGhosts(ghosts) {
        if (ghosts.length === 0) return false;
        
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
