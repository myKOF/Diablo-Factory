/**
 * @module BuildingConnector
 * @description 建築連接器：Port 吸附、Ghost Preview 管理、碰撞檢查
 *
 * 職責：
 * - 精確感知建築的 Input/Output Port 座標與方向
 * - 提供吸附（Snapping）功能：游標吸附至最近 Port
 * - 配對 Output→Input Port 建立邏輯連線
 * - 不操作渲染物件（所有座標均為世界座標或網格座標）
 */

// ─────────────────────────────────────────────
// 1. 型別定義
// ─────────────────────────────────────────────

/**
 * @typedef {Object} PortSlot
 * @property {number} x          - 世界座標 X
 * @property {number} y          - 世界座標 Y
 * @property {string} dir        - 方向 'up'|'down'|'left'|'right'
 * @property {'input'|'output'} portType - Port 類型
 * @property {number} slotIndex  - Port 索引
 * @property {number} width      - Port 寬度（格數）
 */

/**
 * @typedef {Object} ConnectionInfo
 * @property {string} sourceEntityId
 * @property {string} targetEntityId
 * @property {PortSlot} sourcePort
 * @property {PortSlot} targetPort
 * @property {number} distance    - 直線距離（像素）
 */

// ─────────────────────────────────────────────
// 2. 方向工具（本地）
// ─────────────────────────────────────────────

/** 方向名稱對應向量 */
const DIR_VECTORS = {
    up:    { x: 0,  y: -1 },
    down:  { x: 0,  y: 1  },
    left:  { x: -1, y: 0  },
    right: { x: 1,  y: 0  }
};

/** 取得相反方向 */
const opposite = (dir) => ({ up: 'down', down: 'up', left: 'right', right: 'left' }[dir] || dir);

// ─────────────────────────────────────────────
// 3. BuildingConnector 核心類別
// ─────────────────────────────────────────────

export class BuildingConnector {
    /**
     * @param {Object} options
     * @param {number} [options.tileSize=64]        - 格子像素尺寸
     * @param {number} [options.snapRadius=0.8]     - 吸附半徑（格數倍率）
     * @param {number} [options.portHitRadius=0.8]  - Port 命中半徑（格數倍率）
     */
    constructor({ tileSize = 64, snapRadius = 0.8, portHitRadius = 0.8 } = {}) {
        this.tileSize = tileSize;
        this.snapRadius = snapRadius;
        this.portHitRadius = portHitRadius;

        /**
         * 建築 Port 快取（建築 ID → PortSlot[]）
         * @type {Map<string, PortSlot[]>}
         */
        this._portCache = new Map();
    }

    // ─────────────────────────────────────────
    // 4. Port 管理
    // ─────────────────────────────────────────

    /**
     * 根據建築配置計算所有 Port 座標
     *
     * 設計：不依賴 window.UIManager，接受純資料物件輸入
     *
     * @param {Object} entity             - 建築實體
     * @param {Object} config             - 建築配置（含 portDefs）
     * @param {number} [tileSize]         - 覆蓋預設格子尺寸
     * @returns {PortSlot[]}
     */
    computePorts(entity, config, tileSize = null) {
        const TS = tileSize || this.tileSize;
        const portDefs = config?.portDefs || config?.logistics?.portDefs || [];

        if (!portDefs.length) return [];

        const entityId = this._getEntityId(entity);
        const ports = [];

        for (let i = 0; i < portDefs.length; i++) {
            const def = portDefs[i];
            if (!def || !def.dir) continue;

            const vec = DIR_VECTORS[def.dir] || { x: 0, y: 0 };
            const w = Math.max(1, Number(def.width) || 1);

            // 建築邊界中心 Port 座標
            const halfW = (entity.width || TS) / 2;
            const halfH = (entity.height || TS) / 2;

            let px = entity.x;
            let py = entity.y;

            if (def.dir === 'right') px = entity.x + halfW;
            else if (def.dir === 'left')  px = entity.x - halfW;
            else if (def.dir === 'down')  py = entity.y + halfH;
            else if (def.dir === 'up')    py = entity.y - halfH;

            // 多 Port 偏移
            if (Number.isFinite(def.offsetX)) px += def.offsetX * TS;
            if (Number.isFinite(def.offsetY)) py += def.offsetY * TS;

            ports.push({
                x: px,
                y: py,
                dir: def.dir,
                portType: def.portType || (i % 2 === 0 ? 'output' : 'input'),
                slotIndex: i,
                defIndex: i,
                width: w,
                entityId
            });
        }

        if (entityId) this._portCache.set(entityId, ports);
        return ports;
    }

    /**
     * 取得建築的所有 Port（優先讀取快取）
     * @param {Object} entity
     * @param {Object} config
     * @returns {PortSlot[]}
     */
    getPorts(entity, config) {
        const entityId = this._getEntityId(entity);
        if (entityId && this._portCache.has(entityId)) {
            return this._portCache.get(entityId);
        }
        return this.computePorts(entity, config);
    }

    /**
     * 按方向篩選 Port
     * @param {PortSlot[]} ports
     * @param {string} dir - 'up'|'down'|'left'|'right'
     * @returns {PortSlot[]}
     */
    getPortsByDirection(ports, dir) {
        return ports.filter(p => p.dir === dir);
    }

    /**
     * 按類型篩選 Port
     * @param {PortSlot[]} ports
     * @param {'input'|'output'} portType
     * @returns {PortSlot[]}
     */
    getPortsByType(ports, portType) {
        return ports.filter(p => p.portType === portType);
    }

    // ─────────────────────────────────────────
    // 5. 吸附（Snapping）
    // ─────────────────────────────────────────

    /**
     * 將游標座標吸附至最近的 Port
     *
     * @param {{ x: number, y: number }} worldPos  - 世界座標
     * @param {Object[]} entities                  - 所有建築實體
     * @param {Function} getConfig                 - (entity) => config 函式
     * @param {Object} [options]
     * @param {string|null} [options.preferDir]    - 優先吸附方向（'in'|'out'|null）
     * @param {string|null} [options.preferOppositeOf] - 優先選擇此方向的相反方向
     * @returns {{ port: PortSlot|null, entity: Object|null, distance: number }}
     */
    snapToPort(worldPos, entities, getConfig, options = {}) {
        const { preferDir = null, preferOppositeOf = null } = options;
        const snapRadiusPx = this.tileSize * this.snapRadius;

        let bestPort = null;
        let bestEntity = null;
        let bestDist = Infinity;

        for (const entity of entities) {
            if (entity.isUnderConstruction) continue;
            const config = getConfig(entity);
            if (!config?.logistics?.canInput && !config?.logistics?.canOutput) continue;

            const ports = this.getPorts(entity, config);
            for (const port of ports) {
                const dist = Math.hypot(port.x - worldPos.x, port.y - worldPos.y);
                if (dist > snapRadiusPx) continue;

                // 優先方向篩選
                if (preferOppositeOf && port.dir !== opposite(preferOppositeOf)) continue;
                if (preferDir && port.portType !== preferDir) continue;

                if (dist < bestDist) {
                    bestDist = dist;
                    bestPort = port;
                    bestEntity = entity;
                }
            }
        }

        return { port: bestPort, entity: bestEntity, distance: bestDist };
    }

    /**
     * 取得最近的 Port（不限距離）
     * @param {Object} entity
     * @param {{ x: number, y: number }} worldPos
     * @param {Object} config
     * @param {string|null} [preferDir]
     * @returns {PortSlot|null}
     */
    getNearestPort(entity, worldPos, config, preferDir = null) {
        const ports = this.getPorts(entity, config);
        let best = null;
        let bestDist = Infinity;

        for (const port of ports) {
            if (preferDir && port.dir !== preferDir) continue;
            const dist = Math.hypot(port.x - worldPos.x, port.y - worldPos.y);
            if (dist < bestDist) {
                bestDist = dist;
                best = port;
            }
        }

        // 找不到符合方向的 Port → 不限方向重找
        if (!best && preferDir) {
            return this.getNearestPort(entity, worldPos, config, null);
        }

        return best;
    }

    // ─────────────────────────────────────────
    // 6. 碰撞檢查
    // ─────────────────────────────────────────

    /**
     * 檢查世界座標點是否在建築內部
     * @param {Object} entity
     * @param {{ x: number, y: number }} point
     * @param {number} [tileSize]
     * @returns {boolean}
     */
    isPointInsideEntity(entity, point, tileSize = null) {
        const TS = tileSize || this.tileSize;
        const hw = (entity.width || TS) / 2;
        const hh = (entity.height || TS) / 2;
        return (
            point.x >= entity.x - hw &&
            point.x <= entity.x + hw &&
            point.y >= entity.y - hh &&
            point.y <= entity.y + hh
        );
    }

    /**
     * 取得路徑上所有格位的建築碰撞狀態
     *
     * @param {{ x: number, y: number }[]} path       - 世界座標路徑（網格中心點）
     * @param {Object[]} entities                      - 所有建築
     * @param {Object} [options]
     * @param {Object|null} [options.sourceEntity]     - 起點建築（免除碰撞）
     * @param {Object|null} [options.targetEntity]     - 終點建築（免除碰撞）
     * @returns {{ hasCollision: boolean, collisionPoints: {x:number,y:number}[] }}
     */
    checkPathCollision(path, entities, options = {}) {
        const { sourceEntity = null, targetEntity = null } = options;
        const collisionPoints = [];

        for (const point of path) {
            for (const entity of entities) {
                if (entity === sourceEntity || entity === targetEntity) continue;
                if (this.isPointInsideEntity(entity, point)) {
                    collisionPoints.push({ x: point.x, y: point.y });
                    break;
                }
            }
        }

        return {
            hasCollision: collisionPoints.length > 0,
            collisionPoints
        };
    }

    // ─────────────────────────────────────────
    // 7. 自動配對（Output → Input）
    // ─────────────────────────────────────────

    /**
     * 自動配對兩個建築間最優的 Output/Input Port 組合
     *
     * 策略：
     * 1. sourceEntity 的 Output Port 朝向 targetEntity 的 Input Port
     * 2. 選擇兩 Port 直線距離最短的組合
     *
     * @param {Object} sourceEntity
     * @param {Object} targetEntity
     * @param {Object} sourceConfig
     * @param {Object} targetConfig
     * @returns {ConnectionInfo|null}
     */
    resolveConnectionPorts(sourceEntity, targetEntity, sourceConfig, targetConfig) {
        const sourcePorts = this.getPortsByType(
            this.getPorts(sourceEntity, sourceConfig),
            'output'
        );
        const targetPorts = this.getPortsByType(
            this.getPorts(targetEntity, targetConfig),
            'input'
        );

        if (sourcePorts.length === 0 || targetPorts.length === 0) return null;

        let bestSourcePort = null;
        let bestTargetPort = null;
        let bestDist = Infinity;

        for (const sp of sourcePorts) {
            for (const tp of targetPorts) {
                // 方向相容性：Output 方向應指向 Input 方向（相反方向）
                const dirCompatible = sp.dir === opposite(tp.dir);
                const dist = Math.hypot(sp.x - tp.x, sp.y - tp.y);
                const score = dist * (dirCompatible ? 0.5 : 1.5); // 方向相容加權

                if (score < bestDist) {
                    bestDist = score;
                    bestSourcePort = sp;
                    bestTargetPort = tp;
                }
            }
        }

        if (!bestSourcePort || !bestTargetPort) return null;

        const sourceId = this._getEntityId(sourceEntity);
        const targetId = this._getEntityId(targetEntity);

        return {
            sourceEntityId: sourceId,
            targetEntityId: targetId,
            sourcePort: bestSourcePort,
            targetPort: bestTargetPort,
            distance: Math.hypot(bestSourcePort.x - bestTargetPort.x, bestSourcePort.y - bestTargetPort.y)
        };
    }

    // ─────────────────────────────────────────
    // 8. Ghost Preview 管理
    // ─────────────────────────────────────────

    /**
     * 計算 Ghost Preview 的格位資料（用於渲染層讀取）
     *
     * @param {{ x: number, y: number, dirIn?: {x:number,y:number}, dirOut?: {x:number,y:number} }[]} ghostCells
     * @param {boolean} isValid        - 路徑是否有效
     * @param {number} tileSize
     * @returns {{
     *   cells: Array<{x:number, y:number, isCurve:boolean, isValid:boolean}>,
     *   valid: boolean
     * }}
     */
    buildGhostPreview(ghostCells, isValid, tileSize = null) {
        const TS = tileSize || this.tileSize;

        const cells = ghostCells.map(cell => ({
            x: cell.x,
            y: cell.y,
            dirIn: cell.dirIn || null,
            dirOut: cell.dirOut || null,
            isCurve: !!(cell.dirIn && cell.dirOut &&
                (cell.dirIn.x !== cell.dirOut.x || cell.dirIn.y !== cell.dirOut.y)),
            isPortConnector: !!cell.isPortConnector,
            isVirtualEnd: !!cell.isVirtualEnd,
            isValid
        }));

        return { cells, valid: isValid };
    }

    // ─────────────────────────────────────────
    // 9. 快取管理
    // ─────────────────────────────────────────

    /**
     * 清除指定建築的 Port 快取（建築移動/升級後呼叫）
     * @param {Object} entity
     */
    invalidatePortCache(entity) {
        const id = this._getEntityId(entity);
        if (id) this._portCache.delete(id);
    }

    /**
     * 清除全部 Port 快取
     */
    clearPortCache() {
        this._portCache.clear();
    }

    // ─────────────────────────────────────────
    // 10. 內部工具
    // ─────────────────────────────────────────

    /**
     * 取得建築唯一 ID
     * @param {Object} entity
     * @returns {string|null}
     */
    _getEntityId(entity) {
        if (!entity) return null;
        return entity.id || entity.entityId || entity._id || null;
    }
}

// 導出單例
export const buildingConnector = new BuildingConnector();
