import { ConveyorRouter } from '../ConveyorRouter.js';
import { GameEngine } from '../game_systems.js';
import { UI_CONFIG } from '../../ui/ui_config.js';

function startDrag(startX, startY, sourceEntity = null, sourcePort = null, sourceLine = null) {
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
        routeContext: null,
        directionLocked: false // [核心新增] 是否已鎖定移動方向
    };

    this.ghosts = [];
    this.isValid = false;
    this.pendingDragPoint = null;
    this.isDragFrameQueued = false;
    this.lastRouteKey = null;
}

function updateDrag(currentX, currentY) {
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

function updateDragNow(currentX, currentY) {
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

        // 實體碰撞免除邏輯：僅免除端口附近區域，防止貫穿建築
        const sourcePortRadius = (this.activeDrag.sourcePort?.width || 1) + 1;
        const inSourcePortArea = Math.abs(gx - sourcePortGrid.x) <= sourcePortRadius && Math.abs(gy - sourcePortGrid.y) <= sourcePortRadius;
        if (inSourcePortArea && sourceEnt && window.UIManager?.isPointInsideEntity(sourceEnt, wx, wy)) return true;

        const targetPortRadius = (dragTarget.port?.width || 1) + 1;
        const inTargetPortArea = targetPortGrid && Math.abs(gx - targetPortGrid.x) <= targetPortRadius && Math.abs(gy - targetPortGrid.y) <= targetPortRadius;
        if (inTargetPortArea && targetEnt && window.UIManager?.isPointInsideEntity(targetEnt, wx, wy)) return true;

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

    this.activeDrag.routeContext = {
        dragTarget,
        sourcePortGrid,
        sourceRouteGrid,
        targetPortGrid,
        targetRouteGrid,
        sourcePort: this.activeDrag.sourcePort,
        targetPort: dragTarget.port || null,
        sourceEntity: sourceEnt || null,
        targetBuilding: dragTarget.building || null,
        routeWidth: this.activeDrag.routeWidth || 1,
        widthOffsets,
        bendMode: this.activeDrag.bendMode,
        routeStartDir,
        routePath,
        path,
        ghosts: this.ghosts,
        routeKey,
        lastWorldPoint: { x: currentX, y: currentY },
        costSegmentCount: Math.max(1, this.ghosts.length - 1),
        isValid: this.isValid
    };

    GameEngine.state.conveyorGhosts = this.ghosts;
    GameEngine.state.conveyorValid = this.isValid;
    GameEngine.state.conveyorRouteWidth = this.activeDrag.routeWidth || 1;
}

function toggleBendMode() {
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

function resolveDragTarget(currentX, currentY) {
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
    let targetPort = window.UIManager?.getPortSlotAt(
        targetBuilding,
        currentX,
        currentY,
        preferredDir
    );

    if (!targetPort && window.UIManager?.isPointInsideEntity(targetBuilding, currentX, currentY)) {
        // 移除磁吸效果：游標在建築內部但非端口上時，保持上一次已鎖定的端口
        // 這使虛影停在端口那一格，不會穿透也不會消失
        const prevBuilding = this.activeDrag.targetBuilding;
        const prevPort = this.activeDrag.targetPort;
        if (prevBuilding && prevPort && window.UIManager?.getEntityId?.(prevBuilding) === window.UIManager?.getEntityId?.(targetBuilding)) {
            targetPort = prevPort;
        }
    }

    if (!targetPort) {
        this.activeDrag.targetBuilding = null;
        this.activeDrag.targetPort = null;
        return { x: currentX, y: currentY, building: null, port: null };
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

function cancelDrag() {
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

export class LogisticsDragSession {
    constructor(system) {
        this.system = system;
    }

    startDrag(startX, startY, sourceEntity = null, sourcePort = null, sourceLine = null) {
        return startDrag.apply(this.system, arguments);
    }

    updateDrag(currentX, currentY) {
        return updateDrag.apply(this.system, arguments);
    }

    updateDragNow(currentX, currentY) {
        return updateDragNow.apply(this.system, arguments);
    }

    toggleBendMode() {
        return toggleBendMode.apply(this.system, arguments);
    }

    resolveDragTarget(currentX, currentY) {
        return resolveDragTarget.apply(this.system, arguments);
    }

    cancelDrag() {
        return cancelDrag.apply(this.system, arguments);
    }

}
