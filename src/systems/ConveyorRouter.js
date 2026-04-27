/**
 * Conveyor Routing Engine (Headless)
 * Implements: L-Shape Priority, A* with Turn Penalty, Node Vectoring.
 */
export class ConveyorRouter {
    constructor(grid, cols, rows) {
        this.grid = grid; // 0: walkable, 1: obstacle
        this.cols = cols;
        this.rows = rows;
        this.turnPenalty = 100; // High penalty for changing direction
        this.maxSearchNodes = 6000;
    }

    /**
     * Find path using A* or L-Shape
     */
    findPath(start, end, startDir = null, bendMode = 'x-first') {
        if (!start || !end) return null;
        if (start.x === end.x && start.y === end.y) return [start];
        if (!this.isInsideGrid(start) || !this.isInsideGrid(end)) return null;

        // Ensure start and end are considered walkable for the routing
        const oldStartVal = this.grid[start.y]?.[start.x];
        const oldEndVal = this.grid[end.y]?.[end.x];
        if (this.grid[start.y]) this.grid[start.y][start.x] = 0;
        if (this.grid[end.y]) this.grid[end.y][end.x] = 0;

        let path = this.getLShapePath(start, end, startDir, bendMode);
        if (!path) {
            path = this.findAStarPath(start, end, startDir);
        }

        // Restore grid
        if (this.grid[start.y]) this.grid[start.y][start.x] = oldStartVal;
        if (this.grid[end.y]) this.grid[end.y][end.x] = oldEndVal;

        return path;
    }

    /**
     * L-Shape Priority: Max 1 turn
     */
    getLShapePath(start, end, startDir, bendMode = 'x-first') {
        const dx = end.x - start.x;
        const dy = end.y - start.y;

        if (dx === 0 && dy === 0) return [start];

        const paths = [];

        // Try X then Y
        const pathX = [];
        for (let x = start.x; x !== end.x + Math.sign(dx); x += Math.sign(dx)) pathX.push({ x, y: start.y });
        for (let y = start.y + Math.sign(dy); y !== end.y + Math.sign(dy); y += Math.sign(dy)) pathX.push({ x: end.x, y });
        paths.push(pathX);

        // Try Y then X
        const pathY = [];
        for (let y = start.y; y !== end.y + Math.sign(dy); y += Math.sign(dy)) pathY.push({ x: start.x, y });
        for (let x = start.x + Math.sign(dx); x !== end.x + Math.sign(dx); x += Math.sign(dx)) pathY.push({ x, y: end.y });
        paths.push(pathY);

        const primary = bendMode === 'y-first' ? pathY : pathX;
        const secondary = bendMode === 'y-first' ? pathX : pathY;
        if (this.isValidPath(primary)) return primary;
        if (this.isValidPath(secondary)) return secondary;

        return null;
    }

    isValidPath(path) {
        for (const p of path) {
            if (!this.isInsideGrid(p)) return false;
            // Note: start and end are already cleared in findPath
            if (this.grid[p.y][p.x] !== 0) return false;
        }
        return true;
    }

    isInsideGrid(point) {
        return point.x >= 0 && point.x < this.cols && point.y >= 0 && point.y < this.rows;
    }

    getDirectionVector(dir) {
        switch (dir) {
            case 'up': return { x: 0, y: -1 };
            case 'down': return { x: 0, y: 1 };
            case 'left': return { x: -1, y: 0 };
            case 'right': return { x: 1, y: 0 };
            default: return { x: 0, y: 0 };
        }
    }

    /**
     * A* with Turn Penalty
     */
    findAStarPath(start, end, startDir) {
        const openHeap = [];
        const bestOpen = new Map();
        const closedSet = new Set();
        const pushHeap = (node) => {
            openHeap.push(node);
            let index = openHeap.length - 1;
            while (index > 0) {
                const parent = Math.floor((index - 1) / 2);
                if (openHeap[parent].f <= node.f) break;
                openHeap[index] = openHeap[parent];
                index = parent;
            }
            openHeap[index] = node;
        };
        const popHeap = () => {
            if (openHeap.length === 0) return null;
            const root = openHeap[0];
            const last = openHeap.pop();
            if (openHeap.length > 0) {
                let index = 0;
                while (true) {
                    const left = index * 2 + 1;
                    const right = left + 1;
                    if (left >= openHeap.length) break;
                    let child = left;
                    if (right < openHeap.length && openHeap[right].f < openHeap[left].f) child = right;
                    if (openHeap[child].f >= last.f) break;
                    openHeap[index] = openHeap[child];
                    index = child;
                }
                openHeap[index] = last;
            }
            return root;
        };
        const getNodeKey = (x, y, dir) => `${x},${y},${dir ? dir.x : 0},${dir ? dir.y : 0}`;

        const startNode = {
            x: start.x,
            y: start.y,
            g: 0,
            h: Math.abs(end.x - start.x) + Math.abs(end.y - start.y),
            f: 0,
            parent: null,
            dir: startDir ? this.getDirectionVector(startDir) : null
        };
        startNode.f = startNode.g + startNode.h;

        pushHeap(startNode);
        bestOpen.set(getNodeKey(startNode.x, startNode.y, startNode.dir), startNode);

        let searchedNodes = 0;
        while (openHeap.length > 0) {
            searchedNodes++;
            if (searchedNodes > this.maxSearchNodes) return null;

            const current = popHeap();
            const currentKey = getNodeKey(current.x, current.y, current.dir);
            if (bestOpen.get(currentKey) !== current) continue;
            bestOpen.delete(currentKey);

            if (current.x === end.x && current.y === end.y) {
                return this.reconstructPath(current);
            }

            closedSet.add(currentKey);

            const neighbors = [
                { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }
            ];

            for (const n of neighbors) {
                const nx = current.x + n.x;
                const ny = current.y + n.y;

                if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) continue;
                if (this.grid[ny][nx] !== 0) continue;

                const key = getNodeKey(nx, ny, n);
                if (closedSet.has(key)) continue;

                let moveCost = 1;
                if (current.dir && (current.dir.x !== n.x || current.dir.y !== n.y)) {
                    moveCost += this.turnPenalty;
                }

                const g = current.g + moveCost;
                const h = Math.abs(end.x - nx) + Math.abs(end.y - ny);
                const f = g + h;

                const existingOpen = bestOpen.get(key);
                if (existingOpen && g >= existingOpen.g) continue;

                const nextNode = { x: nx, y: ny, g, h, f, parent: current, dir: n };
                bestOpen.set(key, nextNode);
                pushHeap(nextNode);
            }
        }

        return null;
    }

    reconstructPath(node) {
        const path = [];
        let curr = node;
        while (curr) {
            path.push({ x: curr.x, y: curr.y });
            curr = curr.parent;
        }
        return path.reverse();
    }

    /**
     * Node Vectoring: Determine direction and curves
     */
    processPath(path, targetEntity = null, existingLines = []) {
        if (path.length === 0) return [];
        const result = [];
        const existingLineKeys = new Set(existingLines.map(line => {
            const lx = line.gridX !== undefined ? line.gridX : Math.round(line.x / (this.tileSize || 20));
            const ly = line.gridY !== undefined ? line.gridY : Math.round(line.y / (this.tileSize || 20));
            return `${lx},${ly}`;
        }));
        for (let i = 0; i < path.length; i++) {
            const curr = path[i];
            const prev = path[i - 1];
            const next = path[i + 1];

            let dirIn = null;
            if (prev) {
                dirIn = { x: curr.x - prev.x, y: curr.y - prev.y };
            }

            let dirOut = null;
            if (next) {
                dirOut = { x: next.x - curr.x, y: next.y - curr.y };
            }

            // Auto-Merge Detection
            let isMerger = false;
            if (i === path.length - 1 && !targetEntity) {
                if (existingLineKeys.has(`${curr.x},${curr.y}`)) {
                    isMerger = true;
                }
            }

            result.push({
                x: curr.x,
                y: curr.y,
                dirIn,
                dirOut,
                isCurve: dirIn && dirOut && (dirIn.x !== dirOut.x || dirIn.y !== dirOut.y),
                isMerger
            });
        }
        return result;
    }

    /**
     * Terminal Snapping: Snap to building port if within 1 tile
     */
    getSnapPoint(point, entities, tileSize) {
        for (const ent of entities) {
            if (ent.isUnderConstruction) continue;
            // Simplified snapping: if within 1 tile of entity footprint center
            const dist = Math.hypot(ent.x - point.x, ent.y - point.y);
            if (dist < tileSize * 1.5) {
                return { x: ent.x, y: ent.y, entity: ent };
            }
        }
        return null;
    }
}
