import { ConveyorRouter } from './ConveyorRouter.js';
import { GameEngine } from './game_systems.js';
import { UI_CONFIG } from '../ui/ui_config.js';
import { BuildingSystem } from './BuildingSystem.js';
import { SpatialHashGrid } from './logistics/SpatialHashGrid.js';
import { annotateRoutePoints } from './logistics/LogisticsGeometry.js';
import { LogisticsUndoStore } from './logistics/LogisticsUndoStore.js';
import { LogisticsLineStore } from './logistics/LogisticsLineStore.js';
import { RoutingGridBuilder } from './logistics/RoutingGridBuilder.js';
import { LogisticsSegmentBuilder } from './logistics/LogisticsSegmentBuilder.js';
import { cloneLogisticsPort, hasLogisticsPortPosition } from './logistics/LogisticsPortUtils.js';
import { LogisticsLineBuildContext } from './logistics/LogisticsLineBuildContext.js';
import { LogisticsLinePlacement } from './logistics/LogisticsLinePlacement.js';
import { LogisticsLineMetadata } from './logistics/LogisticsLineMetadata.js';
import { LogisticsLineMergeCoordinator } from './logistics/LogisticsLineMergeCoordinator.js';
import { LogisticsLineFinalizer } from './logistics/LogisticsLineFinalizer.js';
import { LogisticsLineQuery } from './logistics/LogisticsLineQuery.js';
import { LogisticsLineHitTester } from './logistics/LogisticsLineHitTester.js';
import { LogisticsSourcePortQuery } from './logistics/LogisticsSourcePortQuery.js';
import { LogisticsGroupConnectivity } from './logistics/LogisticsGroupConnectivity.js';
import { LogisticsLineOrdering } from './logistics/LogisticsLineOrdering.js';
import { LogisticsTransferQueues } from './logistics/LogisticsTransferQueues.js';
import { LogisticsMergeNodeRuntime } from './logistics/LogisticsMergeNodeRuntime.js';
import { LogisticsTransferRerouter } from './logistics/LogisticsTransferRerouter.js';

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
        this.logisticsBuildUndoStack = [];
        this.maxLogisticsBuildUndoSteps = 5;
        this.lineStore = new LogisticsLineStore(this, () => GameEngine);
        this.undoStore = new LogisticsUndoStore(this, () => GameEngine);
        this.routingGridBuilder = new RoutingGridBuilder(this, () => GameEngine);
        this.segmentBuilder = new LogisticsSegmentBuilder(() => GameEngine);
        this.lineBuildContext = new LogisticsLineBuildContext(this, () => GameEngine);
        this.linePlacement = new LogisticsLinePlacement(this, () => GameEngine);
        this.lineMetadata = new LogisticsLineMetadata();
        this.lineMergeCoordinator = new LogisticsLineMergeCoordinator(this, () => GameEngine);
        this.lineFinalizer = new LogisticsLineFinalizer(this, () => GameEngine);
        this.lineQuery = new LogisticsLineQuery(this, () => GameEngine);
        this.sourcePortQuery = new LogisticsSourcePortQuery(this, () => GameEngine);
        this.lineHitTester = new LogisticsLineHitTester(this, () => GameEngine);
        this.groupConnectivity = new LogisticsGroupConnectivity(this);
        this.lineOrdering = new LogisticsLineOrdering(() => GameEngine);
        this.transferQueues = new LogisticsTransferQueues(this, () => GameEngine);
        this.mergeNodeRuntime = new LogisticsMergeNodeRuntime(this, () => GameEngine);
        this.transferRerouter = new LogisticsTransferRerouter(this, () => GameEngine);
        this.spatialGrid = new SpatialHashGrid(64, () => GameEngine.TILE_SIZE || 20);
    }

    cloneLogisticsUndoValue(value) {
        return this.undoStore.cloneValue(value);
    }

    captureLogisticsBuildUndoSnapshot(state = GameEngine.state) {
        return this.undoStore.capture(state);
    }

    recordLogisticsBuildUndoSnapshot(snapshot = null, state = GameEngine.state) {
        return this.undoStore.record(snapshot, state);
    }

    restoreLogisticsBuildUndoSnapshot(snapshot, state = GameEngine.state) {
        return this.undoStore.restore(snapshot, state);
    }

    undoLastLogisticsBuild(state = GameEngine.state) {
        return this.undoStore.undoLast(state);
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
        return this.routingGridBuilder.collectLogisticsOccupiedKeys(ignoreLine);
    }

    markLineOnGrid(routeGrid, line) {
        return this.routingGridBuilder.markLineOnGrid(routeGrid, line);
    }

    createRoutingGrid(grid, ignoreLine = null) {
        return this.routingGridBuilder.createRoutingGrid(grid, ignoreLine);
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

        const buildUndoSnapshot = this.captureLogisticsBuildUndoSnapshot(GameEngine.state);

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
        const touchedTargetLine = this.findTouchedLogisticsLineAt(lastPoint, sourceGroupId);
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
                    conn = { id: targetId, filter: null };
                    sourceEntity.outputTargets.push(conn);
                } else {
                    conn.id = targetId;
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
            let middleExtensionSplit = null;
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
                    const sourceLineKey = this.getLogisticsLineSelectionKey(drag.sourceLine);
                    const terminalSourceEndpoints = [];
                    lines.forEach(line => {
                        if (!line || this.getLogisticsLineSelectionKey(line) !== sourceLineKey) return;
                        const pts = Array.isArray(line.routePoints) ? line.routePoints : [{ x: line.x, y: line.y }, { x: line.x, y: line.y }];
                        if (pts.length < 2) return;
                        const p1 = this.toGrid(pts[0].x, pts[0].y);
                        const p2 = this.toGrid(pts[pts.length - 1].x, pts[pts.length - 1].y);
                        const k1 = `${p1.x},${p1.y}`;
                        const k2 = `${p2.x},${p2.y}`;
                        if (gridCounts.get(k1) === 1 || lines.length === 1) terminalSourceEndpoints.push(p1);
                        if (gridCounts.get(k2) === 1 || lines.length === 1) terminalSourceEndpoints.push(p2);
                    });
                    isTrueEnd = terminalSourceEndpoints.some(ep => {
                        const dist = Math.max(Math.abs(ep.x - startGrid.x), Math.abs(ep.y - startGrid.y));
                        return dist <= this.getRouteScale();
                    });
                }

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

                if (!shouldMergeWithSource) {
                    middleExtensionSplit = this.splitSourceGroupForMiddleExtension(drag);
                    if (middleExtensionSplit) {
                        shouldMergeWithSource = true;
                        if (middleExtensionSplit.attachPoint && points.length > 0) {
                            points[0] = { ...middleExtensionSplit.attachPoint };
                        }
                    }
                }
            }

            const createdLine = this.upsertLogisticsLine({
                lineId: shouldMergeWithSource ? (middleExtensionSplit?.sourceGroupId || sourceGroupId || drag.sourceLine.groupId || drag.sourceLine.id) : null,
                sourceEnt: sourceEntity,
                targetEnt: targetBuilding,
                targetPoint: targetPort || points[points.length - 1],
                points: points,
                routeWidth: drag.routeWidth || drag.sourcePort?.width || 1,
                sourcePort: drag.sourcePort,
                targetPort: targetPort,
                conn,
                lineType: transportCfg?.model || transportCfg?.type1 || 'transport_line',
                efficiency: Number(transportCfg?.efficiency) || 0,
                allowGroupMerge: !touchedTargetGroupId
            });
            let finalGroupId = createdLine?.groupId || null;
            const submitAffectedGroupIds = new Set([
                finalGroupId,
                sourceGroupId,
                touchedTargetGroupId,
                middleExtensionSplit?.detachedGroupId
            ].filter(Boolean));
            if (createdLine?.groupId && touchedTargetGroupId) {
                const reconnectedGroupId = this.reconnectDeletedGapContinuationGroups(createdLine.groupId, touchedTargetGroupId, GameEngine.state);
                if (reconnectedGroupId) {
                    finalGroupId = reconnectedGroupId;
                    submitAffectedGroupIds.add(reconnectedGroupId);
                    submitAffectedGroupIds.add(touchedTargetGroupId);
                } else {
                    this.registerLogisticsMergeNode({
                        inputGroupId: createdLine.groupId,
                        outputGroupId: touchedTargetGroupId,
                        point: lastPoint,
                        inputLine: createdLine,
                        outputLine: touchedTargetLine
                    });
                    submitAffectedGroupIds.add(touchedTargetGroupId);
                }
            }
            const afterCount = Array.isArray(GameEngine.state.logisticsLines) ? GameEngine.state.logisticsLines.length : beforeCount;
            const builtSegments = Math.max(0, afterCount - beforeCount);
            if (!BuildingSystem.spendResources(GameEngine.state, this.getTransportLineCost(builtSegments))) {
                this.restoreLogisticsBuildUndoSnapshot(buildUndoSnapshot, GameEngine.state);
                this.cancelDrag();
                return;
            }
            this.recordLogisticsBuildUndoSnapshot(buildUndoSnapshot, GameEngine.state);
            if (drag.isLineExtension && finalGroupId && GameEngine.state) {
                const finalSegments = this.getLogisticsSegmentsByGroupId(finalGroupId);
                const activeSegment = finalSegments
                    .slice()
                    .sort((a, b) =>
                        (Number(a?.createdAt) || 0) - (Number(b?.createdAt) || 0) ||
                        (Number(a?.order) || 0) - (Number(b?.order) || 0)
                    )
                    .pop() || this.getLogisticsLineById(finalGroupId);
                GameEngine.state.selectedLogisticsGroupId = finalGroupId;
                GameEngine.state.selectedLogisticsLineId = activeSegment
                    ? this.getLogisticsLineSelectionKey(activeSegment)
                    : null;
                if (window.UIManager) {
                    window.UIManager.activeLogisticsLine = activeSegment || null;
                    window.UIManager.activeLogisticsConnection = null;
                }
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

    splitSourceGroupForMiddleExtension(drag) {
        const sourceLine = drag?.sourceLine || null;
        const sourceGroupId = sourceLine?.groupId || sourceLine?.id || null;
        if (!sourceGroupId) return null;

        const groupSegments = this.getLogisticsSegmentsByGroupId(sourceGroupId);
        if (!Array.isArray(groupSegments) || groupSegments.length < 2) return null;

        const TS = GameEngine.TILE_SIZE || 20;
        const startPoint = { x: drag.startX, y: drag.startY };
        const getRoute = (seg) => Array.isArray(seg?.routePoints) ? seg.routePoints : [];
        const getSegmentKey = (seg) => this.getLogisticsLineSelectionKey(seg) || seg?.id || `${seg?.x},${seg?.y}`;
        const getPointKey = (point) => point ? `${Math.round(point.x)},${Math.round(point.y)}` : null;
        const getStartPoint = (seg) => getRoute(seg)[0] || null;
        const getEndPoint = (seg) => {
            const route = getRoute(seg);
            return route[route.length - 1] || null;
        };
        const getSourceLineMatchKey = () => this.getLogisticsLineSelectionKey(sourceLine) || sourceLine?.id || null;
        const ordered = this.orderLogisticsSegmentsByDirection(groupSegments);
        const firstRoute = getRoute(ordered[0]);
        const lastRoute = getRoute(ordered[ordered.length - 1]);
        const groupStart = firstRoute[0] || null;
        const groupEnd = lastRoute[lastRoute.length - 1] || null;
        if (groupStart && Math.hypot(startPoint.x - groupStart.x, startPoint.y - groupStart.y) <= TS * 0.75) return null;
        if (groupEnd && Math.hypot(startPoint.x - groupEnd.x, startPoint.y - groupEnd.y) <= TS * 0.75) return null;

        const distanceToSegment = (point, seg) => {
            const points = getRoute(seg);
            if (points.length < 2) return Infinity;
            let best = Infinity;
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                if (!a || !b) continue;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const lengthSq = dx * dx + dy * dy;
                if (lengthSq < 0.001) continue;
                const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
                const px = a.x + dx * t;
                const py = a.y + dy * t;
                best = Math.min(best, Math.hypot(point.x - px, point.y - py));
            }
            return best;
        };

        const sourceLineMatchKey = getSourceLineMatchKey();
        let splitSegment = ordered.find(seg =>
            seg === sourceLine ||
            (sourceLine.id && seg.id === sourceLine.id) ||
            this.getLogisticsLineSelectionKey(seg) === sourceLineMatchKey
        ) || null;
        if (!splitSegment) {
            let bestDistance = Infinity;
            ordered.forEach((seg) => {
                const dist = distanceToSegment(startPoint, seg);
                if (dist < bestDistance) {
                    bestDistance = dist;
                    splitSegment = seg;
                }
            });
            if (bestDistance > TS * 0.75) return null;
        }

        const graph = new Map();
        const edgeToSegments = new Map();
        const addNode = (key) => {
            if (!key) return;
            if (!graph.has(key)) graph.set(key, new Set());
        };
        const getEdgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
        ordered.forEach(seg => {
            const segKey = getSegmentKey(seg);
            const route = getRoute(seg);
            for (let i = 0; i < route.length - 1; i++) {
                const a = route[i];
                const b = route[i + 1];
                if (!a || !b) continue;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 0.001) continue;
                const dirX = dx / dist;
                const dirY = dy / dist;
                const steps = Math.max(1, Math.round(dist / TS));
                let previousKey = getPointKey(a);
                addNode(previousKey);
                for (let step = 1; step <= steps; step++) {
                    const point = step === steps
                        ? b
                        : { x: a.x + dirX * TS * step, y: a.y + dirY * TS * step };
                    const key = getPointKey(point);
                    addNode(key);
                    graph.get(previousKey).add(key);
                    graph.get(key).add(previousKey);
                    const edgeKey = getEdgeKey(previousKey, key);
                    if (!edgeToSegments.has(edgeKey)) edgeToSegments.set(edgeKey, new Set());
                    edgeToSegments.get(edgeKey).add(segKey);
                    previousKey = key;
                }
            }
        });

        const nearestNodeKey = (point) => {
            if (!point || graph.size === 0) return null;
            let bestKey = null;
            let bestDistance = Infinity;
            graph.forEach((_, key) => {
                const [x, y] = key.split(",").map(Number);
                const dist = Math.hypot(x - point.x, y - point.y);
                if (dist < bestDistance) {
                    bestDistance = dist;
                    bestKey = key;
                }
            });
            return bestKey;
        };
        const findNodePath = (startKey, endKey) => {
            if (!startKey || !endKey) return null;
            const queue = [startKey];
            const visited = new Set([startKey]);
            const previous = new Map();
            while (queue.length > 0) {
                const current = queue.shift();
                if (current === endKey) break;
                (graph.get(current) || new Set()).forEach(next => {
                    if (visited.has(next)) return;
                    visited.add(next);
                    previous.set(next, current);
                    queue.push(next);
                });
            }
            if (!visited.has(endKey)) return null;
            const path = [];
            let current = endKey;
            while (current) {
                path.unshift(current);
                if (current === startKey) break;
                current = previous.get(current);
            }
            return path[0] === startKey ? path : null;
        };

        const sourcePort = ordered.find(seg => seg?.sourcePort)?.sourcePort || null;
        const sequenceStart = getStartPoint(ordered[0]);
        const sourceKey = nearestNodeKey(sourcePort || sequenceStart);
        const splitStartPoint = getStartPoint(splitSegment);
        const branchKey = getPointKey(splitStartPoint) || nearestNodeKey(startPoint);
        const sourceToBranchPath = findNodePath(sourceKey, branchKey);
        const keepSegmentKeys = new Set();
        const sourceSegmentKey = getSegmentKey(splitSegment);
        if (sourceToBranchPath && sourceToBranchPath.length >= 2) {
            for (let i = 0; i < sourceToBranchPath.length - 1; i++) {
                const edgeKey = getEdgeKey(sourceToBranchPath[i], sourceToBranchPath[i + 1]);
                (edgeToSegments.get(edgeKey) || new Set()).forEach(segKey => keepSegmentKeys.add(segKey));
            }
        }
        if (sourceSegmentKey) keepSegmentKeys.delete(sourceSegmentKey);

        let frontSegments = [];
        let backSegments = [];
        if (keepSegmentKeys.size > 0) {
            frontSegments = ordered.filter(seg => keepSegmentKeys.has(getSegmentKey(seg)));
            backSegments = ordered.filter(seg => !keepSegmentKeys.has(getSegmentKey(seg)));
        } else {
            const byStartKey = new Map();
            ordered.forEach(seg => {
                const key = getPointKey(getStartPoint(seg));
                if (!key) return;
                if (!byStartKey.has(key)) byStartKey.set(key, []);
                byStartKey.get(key).push(seg);
            });
            const downstream = new Set();
            const queue = [splitSegment, ...(byStartKey.get(getPointKey(getEndPoint(splitSegment))) || [])];
            while (queue.length > 0) {
                const seg = queue.shift();
                if (!seg) continue;
                const segKey = getSegmentKey(seg);
                if (!segKey || downstream.has(segKey)) continue;
                downstream.add(segKey);
                (byStartKey.get(getPointKey(getEndPoint(seg))) || []).forEach(next => queue.push(next));
            }
            frontSegments = ordered.filter(seg => !downstream.has(getSegmentKey(seg)));
            backSegments = ordered.filter(seg => downstream.has(getSegmentKey(seg)));
        }
        if (frontSegments.length === 0 || backSegments.length === 0) return null;

        const newGroupId = `log_group_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const frontTail = frontSegments[frontSegments.length - 1] || null;
        const backHead = backSegments[0];
        const detachPoint = getStartPoint(splitSegment) || getEndPoint(frontTail) || getStartPoint(backHead) || null;
        const detachKey = detachPoint ? `${Math.round(detachPoint.x)},${Math.round(detachPoint.y)}` : null;

        if (frontTail) frontTail.nextId = null;
        if (backHead) backHead.prevId = null;
        backSegments.forEach(seg => {
            if (!seg) return;
            seg.groupId = newGroupId;
            seg.sourceId = null;
            seg.targetId = null;
            seg.sourcePort = null;
            seg.targetPort = null;
            seg.targetPoint = null;
            seg.detachedFromGroupId = sourceGroupId;
            if (detachKey) seg.detachedAtKey = detachKey;
            delete seg.detachedByDeletedGap;
            delete seg.turnArrowOverride;
        });

        this.orderLogisticsSegmentsByDirection(frontSegments);
        this.orderLogisticsSegmentsByDirection(backSegments);
        return {
            sourceGroupId,
            detachedGroupId: newGroupId,
            attachPoint: detachPoint ? { x: detachPoint.x, y: detachPoint.y } : null
        };
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
        return this.lineStore.ensure();
    }

    ensureLogisticsMergeNodeStore(state = GameEngine.state) {
        if (!state) return [];
        if (!Array.isArray(state.logisticsMergeNodes)) state.logisticsMergeNodes = [];
        return state.logisticsMergeNodes;
    }

    areLogisticsGroupsLinkedByMergeNode(groupA, groupB, state = GameEngine.state) {
        if (!groupA || !groupB || groupA === groupB) return false;
        return this.ensureLogisticsMergeNodeStore(state).some(node => {
            if (!node || !Array.isArray(node.inputGroupIds) || !node.outputGroupId) return false;
            const aInputs = node.inputGroupIds.includes(groupA);
            const bInputs = node.inputGroupIds.includes(groupB);
            return (node.outputGroupId === groupA && bInputs) ||
                (node.outputGroupId === groupB && aInputs) ||
                (aInputs && bInputs);
        });
    }

    areLogisticsGroupsInSameMergeComponent(groupA, groupB, state = GameEngine.state) {
        if (!groupA || !groupB || groupA === groupB) return false;
        return this.getLogisticsMergeConnectedGroupIds(groupA, state).has(groupB);
    }

    getLogisticsGroupsConnectedThroughMergeNodes(baseConnectedGroupIds, state = GameEngine.state) {
        const connected = new Set(baseConnectedGroupIds || []);
        let changed = true;
        while (changed) {
            changed = false;
            this.ensureLogisticsMergeNodeStore(state).forEach(node => {
                if (!node || !node.outputGroupId || !Array.isArray(node.inputGroupIds)) return;
                if (!connected.has(node.outputGroupId)) return;
                node.inputGroupIds.forEach(inputGroupId => {
                    if (!inputGroupId || connected.has(inputGroupId)) return;
                    if (!this.isLogisticsMergeNodeInputConnectionIntact(node, inputGroupId, state)) return;
                    connected.add(inputGroupId);
                    changed = true;
                });
            });
        }
        return connected;
    }

    getLogisticsLinesForState(state = GameEngine.state) {
        return this.lineStore.getForState(state);
    }

    getLogisticsConnectionPointKey(point) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
        return `${Math.round(point.x)},${Math.round(point.y)}`;
    }

    doesLogisticsLineContainConnectionPoint(line, point, tolerance = 1, blockedKey = null) {
        if (!line || !point) return false;
        const pointKey = blockedKey || this.getLogisticsConnectionPointKey(point);
        if (pointKey && line.suppressedOpenEndpointCellKey === pointKey) return false;
        const points = Array.isArray(line.routePoints) ? line.routePoints : [];
        for (let i = 0; i < points.length - 1; i++) {
            if (this.isPointOnSegment(point, points[i], points[i + 1], tolerance)) return true;
        }
        return points.some(p =>
            Number.isFinite(p?.x) && Number.isFinite(p?.y) &&
            Math.hypot(p.x - point.x, p.y - point.y) <= tolerance
        );
    }

    doesLogisticsGroupContainConnectionPoint(groupId, point, tolerance = 1, state = GameEngine.state, blockedKey = null) {
        if (!groupId || !point) return false;
        return this.getLogisticsLinesForState(state).some(line =>
            (line?.groupId || line?.id || null) === groupId &&
            this.doesLogisticsLineContainConnectionPoint(line, point, tolerance, blockedKey)
        );
    }

    isLogisticsMergeNodeInputConnectionIntact(node, inputGroupId, state = GameEngine.state) {
        if (!node || !inputGroupId || !node.outputGroupId) return false;
        if (!Array.isArray(node.inputGroupIds) || !node.inputGroupIds.includes(inputGroupId)) return false;
        const point = node.point || (Number.isFinite(node.x) && Number.isFinite(node.y) ? { x: node.x, y: node.y } : null);
        if (!point) return false;
        const tolerance = Math.max(1, (GameEngine.TILE_SIZE || 20) * 0.75);
        const key = node.cellKey || this.getLogisticsConnectionPointKey(point);
        return this.doesLogisticsGroupContainConnectionPoint(node.outputGroupId, point, tolerance, state, key) &&
            this.doesLogisticsGroupContainConnectionPoint(inputGroupId, point, tolerance, state, key);
    }

    getLogisticsMergeConnectedGroupIds(groupId, state = GameEngine.state) {
        const connected = new Set();
        if (!groupId) return connected;
        connected.add(groupId);
        const nodes = this.ensureLogisticsMergeNodeStore(state);
        let changed = true;
        while (changed) {
            changed = false;
            nodes.forEach(node => {
                if (!node || !node.outputGroupId || !Array.isArray(node.inputGroupIds)) return;
                const members = [node.outputGroupId, ...node.inputGroupIds].filter(Boolean);
                if (!members.some(id => connected.has(id))) return;
                members.forEach(id => {
                    if (connected.has(id)) return;
                    connected.add(id);
                    changed = true;
                });
            });
        }
        return connected;
    }

    isLogisticsDetachedDisplayConnectionIntact(groupId, detachedFromGroupId, detachedAtKey, state = GameEngine.state) {
        if (!groupId || !detachedFromGroupId || !detachedAtKey) return false;
        const [x, y] = String(detachedAtKey).split(',').map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        const point = { x, y };
        const tolerance = Math.max(1, (GameEngine.TILE_SIZE || 20) * 0.05);
        return this.doesLogisticsGroupContainConnectionPoint(groupId, point, tolerance, state, detachedAtKey) &&
            this.doesLogisticsGroupContainConnectionPoint(detachedFromGroupId, point, tolerance, state, detachedAtKey);
    }

    isDeletedGapContinuationLine(line) {
        return line?.detachedByDeletedGap === true;
    }

    getLogisticsPhysicalGroupGraph(state = GameEngine.state) {
        const groupIds = [...new Set(this.getLogisticsLinesForState(state)
            .map(line => line?.groupId || line?.id || null)
            .filter(Boolean))];
        const adjacency = new Map(groupIds.map(groupId => [groupId, new Set()]));

        for (let i = 0; i < groupIds.length; i++) {
            for (let j = i + 1; j < groupIds.length; j++) {
                const a = groupIds[i];
                const b = groupIds[j];
                if (!this.areLogisticsGroupsTouching(a, b)) continue;
                adjacency.get(a).add(b);
                adjacency.get(b).add(a);
            }
        }

        return { groupIds, adjacency };
    }

    getLogisticsPhysicalGroupComponents(state = GameEngine.state) {
        const { groupIds, adjacency } = this.getLogisticsPhysicalGroupGraph(state);
        const visited = new Set();
        const components = [];
        groupIds.forEach(groupId => {
            if (visited.has(groupId)) return;
            const queue = [groupId];
            const members = new Set([groupId]);
            visited.add(groupId);
            while (queue.length > 0) {
                const current = queue.shift();
                (adjacency.get(current) || new Set()).forEach(next => {
                    if (visited.has(next)) return;
                    visited.add(next);
                    members.add(next);
                    queue.push(next);
                });
            }
            components.push(members);
        });
        return components;
    }

    findLogisticsPhysicalGroupPath(startGroupId, endGroupId, state = GameEngine.state) {
        if (!startGroupId || !endGroupId) return null;
        const { adjacency } = this.getLogisticsPhysicalGroupGraph(state);
        if (!adjacency.has(startGroupId) || !adjacency.has(endGroupId)) return null;
        if (startGroupId === endGroupId) return [startGroupId];

        const queue = [startGroupId];
        const visited = new Set([startGroupId]);
        const previous = new Map();
        while (queue.length > 0) {
            const current = queue.shift();
            const nextGroups = adjacency.get(current) || new Set();
            for (const next of nextGroups) {
                if (visited.has(next)) continue;
                visited.add(next);
                previous.set(next, current);
                if (next === endGroupId) {
                    const path = [endGroupId];
                    let step = endGroupId;
                    while (previous.has(step)) {
                        step = previous.get(step);
                        path.push(step);
                    }
                    return path.reverse();
                }
                queue.push(next);
            }
        }
        return null;
    }

    getLogisticsPortConnectedPhysicalGroupIds(state = GameEngine.state) {
        const connected = new Set();
        const lines = this.getLogisticsLinesForState(state);
        const groupHasSource = new Set();
        lines.forEach(line => {
            const groupId = line?.groupId || line?.id || null;
            if (groupId && line.sourceId) groupHasSource.add(groupId);
        });

        lines.forEach(line => {
            const targetGroupId = line?.groupId || line?.id || null;
            if (!targetGroupId || !line.targetId) return;
            if (line.sourceId) {
                connected.add(targetGroupId);
                return;
            }

            const sourceGroupId = line.detachedFromGroupId || null;
            if (!sourceGroupId || !this.isDeletedGapContinuationLine(line) || !groupHasSource.has(sourceGroupId)) return;
            if (this.isLogisticsDetachedDisplayConnectionIntact(targetGroupId, sourceGroupId, line?.detachedAtKey, state)) {
                connected.add(sourceGroupId);
                connected.add(targetGroupId);
                return;
            }
            const path = this.findLogisticsPhysicalGroupPath(sourceGroupId, targetGroupId, state);
            if (!Array.isArray(path) || path.length === 0) return;
            path.forEach(groupId => connected.add(groupId));
        });
        return connected;
    }

    getLogisticsDisplayConnectedGroupIds(baseConnectedGroupIds, state = GameEngine.state) {
        const connected = new Set(baseConnectedGroupIds || []);
        this.getLogisticsPortConnectedPhysicalGroupIds(state).forEach(groupId => connected.add(groupId));
        let changed = true;
        while (changed) {
            changed = false;
            this.getLogisticsGroupsConnectedThroughMergeNodes(connected, state).forEach(groupId => {
                if (!groupId || connected.has(groupId)) return;
                connected.add(groupId);
                changed = true;
            });
            const lines = this.getLogisticsLinesForState(state);
            lines.forEach(line => {
                const groupId = line?.groupId || line?.id || null;
                const detachedFromGroupId = line?.detachedFromGroupId || null;
                if (!groupId || !detachedFromGroupId) return;
                if (!this.isDeletedGapContinuationLine(line)) return;
                if (!this.isLogisticsDetachedDisplayConnectionIntact(groupId, detachedFromGroupId, line?.detachedAtKey, state)) return;
                if (connected.has(groupId) && !connected.has(detachedFromGroupId)) {
                    connected.add(detachedFromGroupId);
                    changed = true;
                }
                if (connected.has(detachedFromGroupId) && !connected.has(groupId)) {
                    connected.add(groupId);
                    changed = true;
                }
            });
        }
        return connected;
    }

    getCardinalDirection(from, to) {
        if (!from || !to) return null;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
        return Math.abs(dx) >= Math.abs(dy)
            ? { x: Math.sign(dx) || 1, y: 0 }
            : { x: 0, y: Math.sign(dy) || 1 };
    }

    isPointOnSegment(point, start, end, tolerance = 1) {
        if (!point || !start || !end) return false;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq < 0.001) return Math.hypot(point.x - start.x, point.y - start.y) <= tolerance;
        const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq;
        if (t < -0.001 || t > 1.001) return false;
        const projX = start.x + dx * t;
        const projY = start.y + dy * t;
        return Math.hypot(point.x - projX, point.y - projY) <= tolerance;
    }

    getLogisticsLineDirectionAtPoint(line, point) {
        const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
        for (let i = 0; i < points.length - 1; i++) {
            const start = points[i];
            const end = points[i + 1];
            if (this.isPointOnSegment(point, start, end, GameEngine.TILE_SIZE * 0.25)) {
                return this.getCardinalDirection(start, end);
            }
        }
        if (points.length >= 2) return this.getCardinalDirection(points[0], points[points.length - 1]);
        return null;
    }

    findTouchedLogisticsLineAt(point, excludedGroupId = null, tolerance = null) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
        const TS = GameEngine.TILE_SIZE || 20;
        const tol = Number.isFinite(tolerance) ? tolerance : TS * 0.55;
        const groupOf = (line) => line?.groupId || line?.id || null;
        const isCandidate = (line) => {
            const groupId = groupOf(line);
            return !!groupId && groupId !== excludedGroupId;
        };

        const directHits = typeof this.getLogisticsLinesAt === 'function'
            ? this.getLogisticsLinesAt(point.x, point.y).filter(isCandidate)
            : [];
        if (directHits.length > 0) return directHits[0];

        const snapped = this.snapPointToGridCenter(point);
        const probes = [{ x: point.x, y: point.y }];
        if (Math.hypot(snapped.x - point.x, snapped.y - point.y) > 0.1) {
            probes.push(snapped);
        }
        let bestLine = null;
        let bestDist = Infinity;
        this.ensureLogisticsLineStore().forEach(line => {
            if (!isCandidate(line)) return;
            const points = Array.isArray(line.routePoints) ? line.routePoints : [];
            for (let i = 0; i < points.length - 1; i++) {
                const start = points[i];
                const end = points[i + 1];
                probes.forEach(probe => {
                    if (!this.isPointOnSegment(probe, start, end, tol)) return;
                    const dist = Math.min(
                        Math.hypot(probe.x - start.x, probe.y - start.y),
                        Math.hypot(probe.x - end.x, probe.y - end.y)
                    );
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestLine = line;
                    }
                });
            }
        });
        return bestLine;
    }

    registerLogisticsMergeNode({ inputGroupId, outputGroupId, point, inputLine = null, outputLine = null }) {
        if (!inputGroupId || !outputGroupId || inputGroupId === outputGroupId || !point) return null;
        const nodes = this.ensureLogisticsMergeNodeStore();
        const snapped = this.snapPointToGridCenter(point);
        const cellKey = `${Math.round(snapped.x)},${Math.round(snapped.y)}`;
        let node = nodes.find(item => item && item.outputGroupId === outputGroupId && item.cellKey === cellKey);
        if (!node) {
            node = {
                id: `merge_${cellKey}_${outputGroupId}`,
                nodeId: `merge_${cellKey}_${outputGroupId}`,
                type: 'logistics_merge',
                cellKey,
                x: snapped.x,
                y: snapped.y,
                point: { x: snapped.x, y: snapped.y },
                inputGroupIds: [],
                outputGroupId,
                roundRobinIndex: 0
            };
            nodes.push(node);
        }
        if (!node.inputGroupIds.includes(inputGroupId)) {
            node.inputGroupIds.push(inputGroupId);
        }

        const inputDir = this.getLogisticsLineDirectionAtPoint(inputLine, snapped);
        const outputDir = this.getLogisticsLineDirectionAtPoint(outputLine, snapped);
        if (inputDir) {
            node.inputDirections = node.inputDirections || {};
            node.inputDirections[inputGroupId] = inputDir;
        }
        if (outputDir) node.outputDir = outputDir;
        this.getLogisticsSegmentsByGroupId(inputGroupId).forEach(line => this.clearSuppressedLogisticsConnectionCell(line, snapped));
        this.getLogisticsSegmentsByGroupId(outputGroupId).forEach(line => this.clearSuppressedLogisticsConnectionCell(line, snapped));
        this.reassignDeletedGapContinuationToMergeInput(inputGroupId, outputGroupId, snapped);
        return node;
    }

    reassignDeletedGapContinuationToMergeInput(inputGroupId, outputGroupId, point) {
        if (!inputGroupId || !outputGroupId || !point) return false;
        const inputHasSource = this.getLogisticsSegmentsByGroupId(inputGroupId).some(line => !!line?.sourceId);
        if (!inputHasSource) return false;
        const outputLines = this.getLogisticsSegmentsByGroupId(outputGroupId);
        const continuationLines = outputLines.filter(line => line?.detachedByDeletedGap === true && line?.targetId && !line?.sourceId);
        if (continuationLines.length === 0) return false;
        const connectionKey = `${Math.round(point.x)},${Math.round(point.y)}`;
        let changed = false;
        continuationLines.forEach(line => {
            line.detachedFromGroupId = inputGroupId;
            line.detachedAtKey = connectionKey;
            changed = true;
        });
        return changed;
    }

    getLogisticsMergeNodeOutputRoute(node) {
        if (!node?.outputGroupId) return null;
        const point = node.point || { x: node.x, y: node.y };
        const segments = this.getLogisticsSegmentsByGroupId(node.outputGroupId);
        if (!segments.length || !point) return null;

        const ordered = this.orderLogisticsSegmentsByDirection(segments);
        let startIndex = -1;
        let startPoint = null;
        for (let i = 0; i < ordered.length; i++) {
            const points = Array.isArray(ordered[i]?.routePoints) ? ordered[i].routePoints : [];
            for (let p = 0; p < points.length - 1; p++) {
                if (this.isPointOnSegment(point, points[p], points[p + 1], GameEngine.TILE_SIZE * 0.35)) {
                    startIndex = i;
                    startPoint = { x: point.x, y: point.y };
                    break;
                }
            }
            if (startIndex >= 0) break;
        }

        if (startIndex < 0) {
            const fallback = this.getLogisticsGroupRoutePoints(node.outputGroupId);
            return Array.isArray(fallback) && fallback.length >= 2 ? fallback : null;
        }

        const route = [];
        const pushPoint = (p) => {
            if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
            const last = route[route.length - 1];
            if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.1) {
                route.push({ x: p.x, y: p.y });
            }
        };

        for (let i = startIndex; i < ordered.length; i++) {
            const points = Array.isArray(ordered[i]?.routePoints) ? ordered[i].routePoints : [];
            if (points.length < 2) continue;
            if (i === startIndex) {
                const segStart = points[0];
                const segEnd = points[points.length - 1];
                const distToStart = Math.hypot(point.x - segStart.x, point.y - segStart.y);
                const distToEnd = Math.hypot(point.x - segEnd.x, point.y - segEnd.y);
                if (distToEnd < 1 && i < ordered.length - 1) {
                    pushPoint(segEnd);
                } else if (distToStart < 1) {
                    points.forEach(pushPoint);
                } else {
                    pushPoint(startPoint);
                    pushPoint(segEnd);
                }
            } else {
                points.forEach(pushPoint);
            }
        }

        if (route.length < 2) return null;
        return route;
    }

    getLogisticsMergeNodeForInputTransfer(transfer, state = GameEngine.state) {
        const lineId = transfer?.lineId || null;
        if (!lineId) return null;
        const route = Array.isArray(transfer.routePoints) ? transfer.routePoints : [];
        const endPoint = route[route.length - 1] || null;
        const TS = GameEngine.TILE_SIZE || 20;
        return this.ensureLogisticsMergeNodeStore(state).find(node => {
            if (!node || !Array.isArray(node.inputGroupIds) || !node.inputGroupIds.includes(lineId)) return false;
            if (!node.outputGroupId) return false;
            if (!this.isLogisticsMergeNodeInputConnectionIntact(node, lineId, state)) return false;
            if (!endPoint) return true;
            const p = node.point || { x: node.x, y: node.y };
            return p && Math.hypot(endPoint.x - p.x, endPoint.y - p.y) <= TS * 0.75;
        }) || null;
    }

    isLogisticsMergeInputTransfer(transfer, state = GameEngine.state) {
        return !!this.getLogisticsMergeNodeForInputTransfer(transfer, state);
    }

    applyLogisticsMergeNodes(state = GameEngine.state) {
        return this.mergeNodeRuntime.apply(state);
    }

    snapPointToGridCenter(point) {
        return this.segmentBuilder.snapPointToGridCenter(point);
    }

    makeLogisticsLineId(sourceId, targetId = null, targetPoint = null) {
        return this.segmentBuilder.makeLogisticsLineId(sourceId, targetId, targetPoint);
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

    getLogisticsLineEndpointNearPoint(line, point, tolerance = (GameEngine.TILE_SIZE || 20) * 0.8) {
        if (!line || !point) return null;
        const points = Array.isArray(line.routePoints) ? line.routePoints : [];
        if (points.length < 2) return null;
        const endpoints = [
            { point: points[0], side: 'start' },
            { point: points[points.length - 1], side: 'end' }
        ];
        return endpoints.find(endpoint =>
            endpoint.point &&
            Number.isFinite(endpoint.point.x) &&
            Number.isFinite(endpoint.point.y) &&
            Math.hypot(endpoint.point.x - point.x, endpoint.point.y - point.y) <= tolerance
        ) || null;
    }

    markSuppressedLogisticsConnectionCell(line, point) {
        const endpoint = this.getLogisticsLineEndpointNearPoint(line, point);
        if (!endpoint) return false;
        const key = `${Math.round(endpoint.point.x)},${Math.round(endpoint.point.y)}`;
        const keys = Array.isArray(line.suppressedConnectionCellKeys)
            ? line.suppressedConnectionCellKeys.slice()
            : [];
        if (!keys.includes(key)) keys.push(key);
        line.suppressedConnectionCellKeys = keys;
        if (endpoint.side === 'end') {
            line.suppressOpenEndpointCell = true;
            line.suppressedOpenEndpointCellKey = key;
        }
        return true;
    }

    clearSuppressedLogisticsConnectionCell(line, point) {
        if (!line || !point) return false;
        const endpoint = this.getLogisticsLineEndpointNearPoint(line, point);
        if (!endpoint) return false;
        const key = `${Math.round(endpoint.point.x)},${Math.round(endpoint.point.y)}`;
        let changed = false;
        if (Array.isArray(line.suppressedConnectionCellKeys)) {
            const nextKeys = line.suppressedConnectionCellKeys.filter(item => item !== key);
            changed = nextKeys.length !== line.suppressedConnectionCellKeys.length;
            if (nextKeys.length > 0) line.suppressedConnectionCellKeys = nextKeys;
            else delete line.suppressedConnectionCellKeys;
        }
        if (line.suppressedOpenEndpointCellKey === key) {
            delete line.suppressOpenEndpointCell;
            delete line.suppressedOpenEndpointCellKey;
            changed = true;
        }
        return changed;
    }

    cleanupLogisticsMergeNodesForDeletedLine(deletedLine) {
        const state = GameEngine.state;
        const points = Array.isArray(deletedLine?.routePoints) ? deletedLine.routePoints : [];
        if (points.length === 0) return new Set();
        const TS = GameEngine.TILE_SIZE || 20;
        const tolerance = TS * 0.8;
        const nodes = this.ensureLogisticsMergeNodeStore(state);
        const removedNodes = nodes.filter(node => {
            const point = node?.point || (Number.isFinite(node?.x) && Number.isFinite(node?.y) ? { x: node.x, y: node.y } : null);
            if (!point) return false;
            return points.some(routePoint =>
                routePoint &&
                Number.isFinite(routePoint.x) &&
                Number.isFinite(routePoint.y) &&
                Math.hypot(routePoint.x - point.x, routePoint.y - point.y) <= tolerance
            );
        });
        if (removedNodes.length === 0) return new Set();

        const affectedGroupIds = new Set();
        const removedPoints = [];
        removedNodes.forEach(node => {
            if (node.outputGroupId) affectedGroupIds.add(node.outputGroupId);
            (node.inputGroupIds || []).forEach(groupId => {
                if (groupId) affectedGroupIds.add(groupId);
            });
            const point = node.point || { x: node.x, y: node.y };
            if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) removedPoints.push(point);
        });
        state.logisticsMergeNodes = nodes.filter(node => !removedNodes.includes(node));

        this.ensureLogisticsLineStore().forEach(line => {
            const groupId = line?.groupId || line?.id || null;
            if (!groupId || !affectedGroupIds.has(groupId)) return;
            removedPoints.forEach(point => this.markSuppressedLogisticsConnectionCell(line, point));
        });
        return affectedGroupIds;
    }

    isLogisticsDetachedSplitCell(line, cellKey) {
        return (!!line?.detachedFromGroupId && !!line?.detachedAtKey && line.detachedAtKey === cellKey) ||
            (Array.isArray(line?.suppressedConnectionCellKeys) && line.suppressedConnectionCellKeys.includes(cellKey));
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
        return this.segmentBuilder.buildGridRoutePoints(points);
    }

    buildLogisticsSegments(groupId, sourceId, targetId, targetPoint, gridPoints, routeWidth, sourcePort, targetPort, filter, lineType = 'transport_line', efficiency = 0) {
        return this.segmentBuilder.buildLogisticsSegments(groupId, sourceId, targetId, targetPoint, gridPoints, routeWidth, sourcePort, targetPort, filter, lineType, efficiency);
    }

    upsertLogisticsLine({ lineId = null, sourceEnt, targetEnt = null, targetPoint = null, points = [], routeWidth = 1, sourcePort = null, targetPort = null, conn = null, lineType = 'transport_line', efficiency = 0, allowGroupMerge = true }) {
        if (this.isProcessingMerge) return null;
        const {
            lines,
            targetId,
            groupId,
            cleanTargetPoint,
            gridPoints,
            previous,
            existingGroupSegments,
            canonicalSourceId,
            cleanSourcePort,
            cleanTargetPort,
            filter
        } = this.lineBuildContext.create({
            lineId,
            sourceEnt,
            targetEnt,
            targetPoint,
            points,
            sourcePort,
            targetPort,
            conn
        });
        const segments = this.buildLogisticsSegments(groupId, canonicalSourceId, targetId, cleanTargetPoint, gridPoints, routeWidth, cleanSourcePort, cleanTargetPort, filter, lineType, efficiency);
        this.lineMetadata.applySplitSequenceStart(segments, existingGroupSegments);
        const {
            additions,
            occupied,
            mergedLines,
            overlapMergeGroupIds,
            blockedOverlapGroupIds
        } = this.linePlacement.placeSegments({ lines, segments, groupId });

        // [物流延伸修正] 同一群組在多次延伸後，舊段也必須同步最新端點/連線資訊，
        // 否則渲染端在判定 port-to-port 接通時會讀到過期 metadata，導致誤顯示為未接通。
        this.lineMetadata.syncGroupSegments({
            mergedLines,
            groupId,
            canonicalSourceId,
            targetId,
            cleanTargetPoint,
            routeWidth,
            lineType,
            efficiency,
            cleanSourcePort,
            cleanTargetPort,
            conn,
            filter
        });

        GameEngine.state.logisticsLines = mergedLines;
        this.lineMetadata.syncConnection({ conn, groupId, gridPoints, routeWidth, lineType, efficiency, cleanSourcePort, cleanTargetPort });

        const { mergedGroupId, affectedGroupIds } = this.lineMergeCoordinator.mergeOverlaps({
            groupId,
            overlapMergeGroupIds,
            blockedOverlapGroupIds,
            allowGroupMerge
        });

        return this.lineFinalizer.finalizeBuild({
            groupId,
            mergedGroupId,
            affectedGroupIds,
            conn,
            additions,
            segments,
            occupied
        });
    }

    getLogisticsLineRoute(line) {
        return this.lineQuery.getRoute(line);
    }

    getLogisticsLineById(lineId) {
        return this.lineStore.getById(lineId);
    }

    getLogisticsSegmentsByGroupId(groupId) {
        return this.lineStore.getSegmentsByGroupId(groupId);
    }

    setLogisticsGroupFilter(groupId, filterItem) {
        this.getLogisticsSegmentsByGroupId(groupId).forEach(line => {
            line.filter = filterItem || null;
        });
    }

    getLogisticsLineNodePoints(line) {
        return this.lineQuery.getNodePoints(line);
    }

    isPointOnLogisticsLine(point, line) {
        return this.lineQuery.isPointOnLine(point, line);
    }

    getLogisticsLineDirectedCells(line) {
        return this.lineQuery.getDirectedCells(line);
    }

    areLogisticsGroupsTouching(primaryGroupId, secondaryGroupId) {
        return this.groupConnectivity.areTouching(primaryGroupId, secondaryGroupId);
    }

    mergeConnectedLogisticsGroups(groupId) {
        return this.lineMergeCoordinator.mergeConnectedGroups(groupId);
    }

    getDeletedGapContinuationRelation(groupAId, groupBId, state = GameEngine.state) {
        return this.lineMergeCoordinator.getDeletedGapContinuationRelation(groupAId, groupBId, state);
    }

    reconnectDeletedGapContinuationGroups(groupAId, groupBId, state = GameEngine.state) {
        return this.lineMergeCoordinator.reconnectDeletedGapContinuationGroups(groupAId, groupBId, state);
    }

    mergeLogisticsLineGroups(primaryGroupId, secondaryGroupId) {
        return this.lineMergeCoordinator.mergeGroups(primaryGroupId, secondaryGroupId);
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
        if (selectedGroupId) {
            const lineGroupId = line.groupId || line.id || null;
            if (lineGroupId && this.getLogisticsMergeConnectedGroupIds(selectedGroupId).has(lineGroupId)) return true;
        }
        if (!selectedId) return false;
        return this.getLogisticsLineSelectionKey(line) === selectedId;
    }

    orderLogisticsSegmentsByDirection(segments) {
        return this.lineOrdering.orderByDirection(segments);
    }

    updateActiveTransfersOnLogisticsChange(state, affectedGroupIds = null) {
        return this.transferRerouter.updateOnLogisticsChange(state, affectedGroupIds);
    }

    applyBlockedTransferQueues(state) {
        return this.transferQueues.applyBlockedQueues(state);
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

    deleteLogisticsLineById(lineId) {
        this.isProcessingMerge = true;
        try {
            const state = GameEngine.state;
            const line = this.getLogisticsLineById(lineId);
            if (!line) return false;
            const deleteUndoSnapshot = this.captureLogisticsBuildUndoSnapshot(state);
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
            const mergeCleanupAffectedGroupIds = this.cleanupLogisticsMergeNodesForDeletedLine(line);

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
                    const frontTail = frontSegments
                        .sort((a, b) => getSequenceOrder(b) - getSequenceOrder(a))[0] || null;
                    this.markDeletedGapEndpoint(frontTail);
                    const detachKey = frontTail?.suppressedOpenEndpointCellKey || null;
                    backSegments.forEach(seg => {
                        if (!seg) return;
                        seg.groupId = newGroupId;
                        seg.detachedFromGroupId = groupId;
                        if (detachKey) seg.detachedAtKey = detachKey;
                        seg.detachedByDeletedGap = true;
                    });

                    // 自動重新計算兩段物流線的端點及與建築物的連接關係
                    this.recalculateLogisticsGroupEndpoints(groupId);
                    this.recalculateLogisticsGroupEndpoints(newGroupId);
                    this.updateActiveTransfersOnLogisticsChange(state, new Set([groupId, newGroupId, ...mergeCleanupAffectedGroupIds]));

                    GameEngine.addLog(`[物流] 線段中斷，物流線已拆分為獨立路線。`, 'LOGISTICS');
                } else {
                    // 只有前半或只有後半（從端點刪除），只需重新計算該群組即可
                    this.recalculateLogisticsGroupEndpoints(groupId);
                    this.updateActiveTransfersOnLogisticsChange(state, new Set([groupId, ...mergeCleanupAffectedGroupIds]));
                }
            } else {
                // 如果這個群組已經沒有任何線段，清除 sourceEnt 的輸出紀錄
                if (line.sourceId) {
                    const sourceEnt = state.mapEntities.find(ent => window.UIManager.getEntityId(ent) === line.sourceId);
                    if (sourceEnt && Array.isArray(sourceEnt.outputTargets)) {
                        sourceEnt.outputTargets = sourceEnt.outputTargets.filter(conn => conn.lineId !== groupId);
                    }
                }
                if (mergeCleanupAffectedGroupIds.size > 0) {
                    this.updateActiveTransfersOnLogisticsChange(state, mergeCleanupAffectedGroupIds);
                }
            }

            if (state.selectedLogisticsLineId === lineKey) state.selectedLogisticsLineId = null;
            if (state.selectedLogisticsGroupId === line.groupId || state.selectedLogisticsGroupId === line.id) state.selectedLogisticsGroupId = null;
            if (window.UIManager.activeLogisticsLine && this.getLogisticsLineSelectionKey(window.UIManager.activeLogisticsLine) === lineKey) window.UIManager.activeLogisticsLine = null;
            if (window.UIManager.activeLogisticsConnection?.lineId === lineKey) window.UIManager.activeLogisticsConnection = null;
            this.recordLogisticsBuildUndoSnapshot(deleteUndoSnapshot, state);
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
        this.updateActiveTransfersOnLogisticsChange(state, new Set([groupId]));
        GameEngine.addLog(`[物流] 物流線群組已刪除`, 'LOGISTICS');
        this.rebuildSpatialHashGrid();
        return true;
    }

    getLogisticsSourcePortConnection(line) {
        return this.sourcePortQuery.getConnection(line);
    }

    getLogisticsSourcePortCellInfo(line) {
        return this.sourcePortQuery.getCellInfo(line);
    }

    isLogisticsSourcePortCell(line, worldX, worldY) {
        return this.sourcePortQuery.isSourcePortCell(line, worldX, worldY);
    }

    getLogisticsSourcePortHitAt(worldX, worldY) {
        return this.sourcePortQuery.getHitAt(worldX, worldY);
    }

    getLogisticsLineAt(worldX, worldY) {
        return this.lineHitTester.getLineAt(worldX, worldY);
    }

    getLogisticsLinesAt(worldX, worldY) {
        return this.lineHitTester.getLinesAt(worldX, worldY);
    }
}

export const conveyorSystem = new ConveyorSystem();
