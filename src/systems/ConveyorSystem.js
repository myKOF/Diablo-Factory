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
        return expanded;
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

        const dragTarget = this.resolveDragTarget(currentX, currentY);
        const endGrid = this.toGrid(dragTarget.x, dragTarget.y);
        const startGrid = this.activeDrag.startGrid;
        const routeKey = `${startGrid.x},${startGrid.y}->${endGrid.x},${endGrid.y}:${this.activeDrag.sourcePort?.dir || ''}:${dragTarget.building ? window.UIManager?.getEntityId?.(dragTarget.building) : ''}`;
        if (routeKey === this.lastRouteKey) return;
        this.lastRouteKey = routeKey;

        // Auto-Routing with A* Turn Penalty
        const path = this.router.findPath(startGrid, endGrid, this.activeDrag.sourcePort?.dir);
        
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
