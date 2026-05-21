/**
 * @module PathfindingModule
 * @description 純函式庫：A* 與 L 形曼哈頓路徑規劃。
 *
 * 設計原則：
 * - 無副作用（Pure Functions），不依賴 GameEngine 或全域狀態。
 * - 所有座標以「網格整數格」為單位（非像素座標）。
 * - O(n log n) A* 實作（最小堆 / 優先佇列）。
 * - 100% Manhattan Distance，禁止斜向移動。
 */

// ─────────────────────────────────────────────
// 1. 型別定義 (JSDoc)
// ─────────────────────────────────────────────

/**
 * @typedef {Object} GridPoint
 * @property {number} x - 網格 X 座標（整數）
 * @property {number} y - 網格 Y 座標（整數）
 */

/**
 * @typedef {Object} PathOptions
 * @property {number} [turnPenalty=100]    - 轉彎懲罰分數（A* 用）
 * @property {number} [maxNodes=12000]     - A* 最大搜尋節點數
 * @property {'x-first'|'y-first'} [bendMode='x-first'] - L 形彎折優先軸向
 * @property {string|null} [startDir=null] - 起始方向偏好 ('up'|'down'|'left'|'right'|null)
 * @property {number[][]} [blockedKeys]    - 額外封鎖的格位集合（為 Set<string> 形式 `"x,y"`）
 */

/**
 * @typedef {Object} PathResult
 * @property {GridPoint[]} path   - 網格座標陣列（含起點與終點）
 * @property {boolean} valid      - 路徑是否有效
 * @property {'l-shape'|'astar'|'none'} method - 使用的演算法
 */

// ─────────────────────────────────────────────
// 2. 方向工具
// ─────────────────────────────────────────────

/**
 * 將方向字串轉換為向量
 * @param {string} dir - 'up' | 'down' | 'left' | 'right'
 * @returns {{x:number, y:number}}
 */
export function dirToVector(dir) {
    switch (dir) {
        case 'up':    return { x: 0, y: -1 };
        case 'down':  return { x: 0, y: 1 };
        case 'left':  return { x: -1, y: 0 };
        case 'right': return { x: 1, y: 0 };
        default:      return { x: 0, y: 0 };
    }
}

/**
 * 將向量轉換為方向字串
 * @param {{x:number, y:number}} vec
 * @returns {string}
 */
export function vectorToDir(vec) {
    if (vec.x > 0) return 'right';
    if (vec.x < 0) return 'left';
    if (vec.y > 0) return 'down';
    if (vec.y < 0) return 'up';
    return 'none';
}

/**
 * 取得相反方向
 * @param {string} dir
 * @returns {string}
 */
export function oppositeDir(dir) {
    const map = { up: 'down', down: 'up', left: 'right', right: 'left' };
    return map[dir] || 'none';
}

// ─────────────────────────────────────────────
// 3. 網格驗證工具
// ─────────────────────────────────────────────

/**
 * 確認座標是否在網格範圍內
 * @param {number} x
 * @param {number} y
 * @param {number[][]} grid - 2D 整數陣列（0=可走，1=障礙）
 * @returns {boolean}
 */
export function isInsideGrid(x, y, grid) {
    return y >= 0 && y < grid.length && x >= 0 && x < (grid[0]?.length ?? 0);
}

/**
 * 確認格位是否可通行（0 = 可走）
 * @param {number} x
 * @param {number} y
 * @param {number[][]} grid
 * @param {Set<string>} [blockedKeys] - 額外封鎖的格位（`"x,y"` 字串 Set）
 * @returns {boolean}
 */
export function isWalkable(x, y, grid, blockedKeys = null) {
    if (!isInsideGrid(x, y, grid)) return false;
    if (grid[y][x] !== 0) return false;
    if (blockedKeys && blockedKeys.has(`${x},${y}`)) return false;
    return true;
}

// ─────────────────────────────────────────────
// 4. 最小堆（Priority Queue）- O(log n) push/pop
// ─────────────────────────────────────────────

class MinHeap {
    constructor() {
        /** @type {Array<{f:number, [key:string]:any}>} */
        this._data = [];
    }

    get size() { return this._data.length; }

    /**
     * 插入節點
     * @param {{f:number}} node
     */
    push(node) {
        this._data.push(node);
        this._bubbleUp(this._data.length - 1);
    }

    /**
     * 彈出 f 值最小的節點
     * @returns {{f:number}|null}
     */
    pop() {
        if (this._data.length === 0) return null;
        const root = this._data[0];
        const last = this._data.pop();
        if (this._data.length > 0) {
            this._data[0] = last;
            this._siftDown(0);
        }
        return root;
    }

    _bubbleUp(i) {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this._data[parent].f <= this._data[i].f) break;
            [this._data[parent], this._data[i]] = [this._data[i], this._data[parent]];
            i = parent;
        }
    }

    _siftDown(i) {
        const n = this._data.length;
        while (true) {
            let smallest = i;
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            if (left < n && this._data[left].f < this._data[smallest].f) smallest = left;
            if (right < n && this._data[right].f < this._data[smallest].f) smallest = right;
            if (smallest === i) break;
            [this._data[smallest], this._data[i]] = [this._data[i], this._data[smallest]];
            i = smallest;
        }
    }
}

// ─────────────────────────────────────────────
// 5. L 形路徑（最多 1 次轉彎，Manhattan Distance 優先）
// ─────────────────────────────────────────────

/**
 * 產生所有 L 形候選路徑（至多一次轉彎）
 * @param {GridPoint} start
 * @param {GridPoint} end
 * @param {'x-first'|'y-first'} bendMode
 * @returns {GridPoint[][]} 候選路徑陣列
 */
function generateLShapeCandidates(start, end, bendMode) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // 直線（同行同列）
    if (dx === 0 || dy === 0) {
        const path = [];
        if (dx === 0) {
            const step = Math.sign(dy) || 1;
            for (let y = start.y; y !== end.y + step; y += step) path.push({ x: start.x, y });
        } else {
            const step = Math.sign(dx) || 1;
            for (let x = start.x; x !== end.x + step; x += step) path.push({ x, y: start.y });
        }
        return [path];
    }

    // X-first: 先橫後縱
    const buildXFirst = () => {
        const path = [];
        const sx = Math.sign(dx);
        const sy = Math.sign(dy);
        for (let x = start.x; x !== end.x + sx; x += sx) path.push({ x, y: start.y });
        for (let y = start.y + sy; y !== end.y + sy; y += sy) path.push({ x: end.x, y });
        return path;
    };

    // Y-first: 先縱後橫
    const buildYFirst = () => {
        const path = [];
        const sx = Math.sign(dx);
        const sy = Math.sign(dy);
        for (let y = start.y; y !== end.y + sy; y += sy) path.push({ x: start.x, y });
        for (let x = start.x + sx; x !== end.x + sx; x += sx) path.push({ x, y: end.y });
        return path;
    };

    return bendMode === 'y-first'
        ? [buildYFirst(), buildXFirst()]
        : [buildXFirst(), buildYFirst()];
}

/**
 * 檢查路徑上所有格位是否可通行
 * @param {GridPoint[]} path
 * @param {number[][]} grid
 * @param {Set<string>} [blockedKeys]
 * @param {string|null} [startDir] - 起始方向（防止 U-Turn）
 * @returns {boolean}
 */
function isLShapePathValid(path, grid, blockedKeys, startDir) {
    if (!path || path.length === 0) return false;

    // U-Turn 防呆：若起始方向與第一步方向相反，拒絕此路徑
    if (startDir && path.length >= 2) {
        const startVec = dirToVector(startDir);
        const firstStepX = path[1].x - path[0].x;
        const firstStepY = path[1].y - path[0].y;
        if (startVec.x !== 0 && Math.sign(firstStepX) === -Math.sign(startVec.x)) return false;
        if (startVec.y !== 0 && Math.sign(firstStepY) === -Math.sign(startVec.y)) return false;
    }

    for (const p of path) {
        if (!isWalkable(p.x, p.y, grid, blockedKeys)) return false;
    }
    return true;
}

// ─────────────────────────────────────────────
// 6. A*（帶轉彎懲罰，Manhattan Heuristic）
// ─────────────────────────────────────────────

/**
 * A* 路徑規劃（曼哈頓距離 + 轉彎懲罰）
 * @param {GridPoint} start
 * @param {GridPoint} end
 * @param {number[][]} grid
 * @param {PathOptions} [options]
 * @returns {GridPoint[]|null}
 */
function findAStarPath(start, end, grid, options = {}) {
    const { turnPenalty = 100, maxNodes = 12000, startDir = null, blockedKeys = null } = options;
    const heap = new MinHeap();
    /** @type {Map<string, {g:number}>} */
    const bestCost = new Map();

    const startDirVec = startDir ? dirToVector(startDir) : null;
    const getKey = (x, y, dx, dy) => `${x},${y},${dx},${dy}`;

    const startNode = {
        x: start.x, y: start.y,
        g: 0,
        h: Math.abs(end.x - start.x) + Math.abs(end.y - start.y),
        f: 0,
        dir: startDirVec,
        parent: null
    };
    startNode.f = startNode.g + startNode.h;

    heap.push(startNode);

    let searched = 0;
    while (heap.size > 0) {
        if (++searched > maxNodes) return null;

        const curr = heap.pop();
        const key = getKey(curr.x, curr.y, curr.dir?.x ?? 0, curr.dir?.y ?? 0);
        const best = bestCost.get(key);
        if (best !== undefined && curr.g >= best) continue;
        bestCost.set(key, curr.g);

        if (curr.x === end.x && curr.y === end.y) {
            // 重建路徑
            const path = [];
            let node = curr;
            while (node) { path.push({ x: node.x, y: node.y }); node = node.parent; }
            return path.reverse();
        }

        const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
        for (const d of dirs) {
            const nx = curr.x + d.x;
            const ny = curr.y + d.y;

            // 終點特例：即使被標記為障礙也允許進入（呼叫端已清除）
            const isEnd = nx === end.x && ny === end.y;
            if (!isEnd && !isWalkable(nx, ny, grid, blockedKeys)) continue;

            let cost = 1;
            if (curr.dir && (curr.dir.x !== d.x || curr.dir.y !== d.y)) {
                cost += turnPenalty;
            }

            const g = curr.g + cost;
            const h = Math.abs(end.x - nx) + Math.abs(end.y - ny);
            heap.push({ x: nx, y: ny, g, h, f: g + h, dir: d, parent: curr });
        }
    }
    return null;
}

// ─────────────────────────────────────────────
// 7. 主要對外 API
// ─────────────────────────────────────────────

/**
 * 尋找曼哈頓路徑（L 形優先，失敗才用 A*）
 *
 * @param {GridPoint} start  - 起點（網格整數座標）
 * @param {GridPoint} end    - 終點（網格整數座標）
 * @param {number[][]} grid  - 2D 網格（0=可走，1=障礙）
 * @param {PathOptions} [options]
 * @returns {PathResult}
 */
export function findManhattanPath(start, end, grid, options = {}) {
    const {
        bendMode = 'x-first',
        startDir = null,
        blockedKeys = null
    } = options;

    if (!start || !end || !grid || grid.length === 0) {
        return { path: [], valid: false, method: 'none' };
    }

    // 相同點：直接回傳
    if (start.x === end.x && start.y === end.y) {
        return { path: [{ ...start }], valid: true, method: 'l-shape' };
    }

    // 暫時清除起終點的障礙標記（確保路徑可連接建築邊界）
    const startVal = grid[start.y]?.[start.x];
    const endVal = grid[end.y]?.[end.x];
    if (grid[start.y]) grid[start.y][start.x] = 0;
    if (grid[end.y]) grid[end.y][end.x] = 0;

    // Phase 1：嘗試 L 形（O(n) 線性掃描）
    const candidates = generateLShapeCandidates(start, end, bendMode);
    for (const candidate of candidates) {
        if (isLShapePathValid(candidate, grid, blockedKeys, startDir)) {
            // 還原網格
            if (grid[start.y]) grid[start.y][start.x] = startVal;
            if (grid[end.y]) grid[end.y][end.x] = endVal;
            return { path: candidate, valid: true, method: 'l-shape' };
        }
    }

    // Phase 2：回退 A*（O(n log n)）
    const astarPath = findAStarPath(start, end, grid, { ...options, blockedKeys });

    // 還原網格
    if (grid[start.y]) grid[start.y][start.x] = startVal;
    if (grid[end.y]) grid[end.y][end.x] = endVal;

    if (astarPath) {
        return { path: astarPath, valid: true, method: 'astar' };
    }

    return { path: [], valid: false, method: 'none' };
}

/**
 * 驗證路徑的連通性（所有格位皆可走且無斷點）
 *
 * @param {GridPoint[]} path  - 路徑陣列
 * @param {number[][]} grid   - 2D 網格
 * @param {Set<string>} [blockedKeys]
 * @returns {{ valid: boolean, isolatedCount: number, reason: string }}
 */
export function validatePath(path, grid, blockedKeys = null) {
    if (!Array.isArray(path) || path.length === 0) {
        return { valid: false, isolatedCount: 0, reason: '路徑為空' };
    }

    let isolatedCount = 0;

    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        if (!isInsideGrid(p.x, p.y, grid)) {
            return { valid: false, isolatedCount, reason: `第 ${i} 格超出網格範圍 (${p.x},${p.y})` };
        }
        if (!isWalkable(p.x, p.y, grid, blockedKeys)) {
            isolatedCount++;
        }

        // 連通性：相鄰點必須水平或垂直相鄰（距離 1 格）
        if (i > 0) {
            const prev = path[i - 1];
            const manDist = Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
            if (manDist !== 1) {
                return { valid: false, isolatedCount, reason: `第 ${i-1} 到第 ${i} 格不相鄰 (距離=${manDist})` };
            }
        }
    }

    return { valid: true, isolatedCount, reason: '連通性驗證通過' };
}

/**
 * 建立路由網格（擴展原始格地圖並標記已佔用的物流線）
 *
 * @param {number[][]} baseGrid       - 原始地圖網格
 * @param {Array<Object>} logisticsLines - 已建立的物流線陣列
 * @param {number} routeScale         - 網格放大倍率（1 or 2）
 * @param {Object|null} [ignoreLine]  - 建造時忽略的現有線段（延伸模式）
 * @returns {number[][]} 路由網格（已放大並標記佔用）
 */
export function buildRoutingGrid(baseGrid, logisticsLines = [], routeScale = 1, ignoreLine = null) {
    if (!baseGrid || baseGrid.length === 0) return [];

    // 網格放大（0.5 網格系統）
    const expanded = [];
    for (let y = 0; y < baseGrid.length; y++) {
        for (let row = 0; row < routeScale; row++) {
            const newRow = [];
            for (let x = 0; x < baseGrid[y].length; x++) {
                for (let col = 0; col < routeScale; col++) {
                    newRow.push(baseGrid[y][x]);
                }
            }
            expanded.push(newRow);
        }
    }

    // 標記已佔用的物流線格位
    const mark = (rx, ry) => {
        if (ry >= 0 && ry < expanded.length && rx >= 0 && rx < (expanded[0]?.length ?? 0)) {
            expanded[ry][rx] = 1;
        }
    };

    for (const line of logisticsLines) {
        if (!line) continue;
        if (ignoreLine && (line.id === ignoreLine.id || line.groupId === ignoreLine.groupId)) continue;

        const pts = Array.isArray(line.routePoints) && line.routePoints.length >= 2
            ? line.routePoints
            : [{ x: line.x || 0, y: line.y || 0 }, { x: line.x || 0, y: line.y || 0 }];

        for (let i = 0; i < pts.length - 1; i++) {
            const ax = Math.round(pts[i].x);
            const ay = Math.round(pts[i].y);
            const bx = Math.round(pts[i + 1].x);
            const by = Math.round(pts[i + 1].y);
            const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
            const dx = Math.sign(bx - ax);
            const dy = Math.sign(by - ay);
            for (let s = 0; s <= steps; s++) {
                mark(ax + dx * s, ay + dy * s);
            }
        }
    }

    return expanded;
}

/**
 * 從圖節點集合中尋找所有孤立節點（BFS 連通分量分析）
 *
 * @param {Map<string, string[]>} adjacency - 鄰接表（key: "x,y"，value: 相鄰鍵陣列）
 * @returns {{ components: string[][], isolatedNodes: string[] }}
 */
export function findConnectedComponents(adjacency) {
    const visited = new Set();
    const components = [];

    for (const startKey of adjacency.keys()) {
        if (visited.has(startKey)) continue;
        const component = [];
        const queue = [startKey];
        visited.add(startKey);
        while (queue.length > 0) {
            const curr = queue.shift();
            component.push(curr);
            for (const neighbor of (adjacency.get(curr) || [])) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
        components.push(component);
    }

    const isolatedNodes = components
        .filter(comp => comp.length === 1)
        .map(comp => comp[0]);

    return { components, isolatedNodes };
}
