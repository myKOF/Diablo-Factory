import { ConveyorRouter } from '../ConveyorRouter.js';

export class RoutingGridBuilder {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
        this.footprintRouter = null;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    getFootprintRouter() {
        if (this.system.router) return this.system.router;
        if (!this.footprintRouter) this.footprintRouter = new ConveyorRouter([], 0, 0);
        return this.footprintRouter;
    }

    collectLogisticsOccupiedKeys(ignoreLine = null) {
        const keys = new Set();
        const lines = this.gameEngine.state.logisticsLines || [];
        const addKey = (x, y) => keys.add(`${x},${y}`);
        lines.forEach(line => {
            if (ignoreLine && (line.id === ignoreLine.id || line.groupId === ignoreLine.groupId)) return;
            const width = Math.max(1, Number(line.routeWidth) || 1);
            const points = Array.isArray(line.routePoints) && line.routePoints.length >= 2
                ? line.routePoints
                : [{ x: line.x, y: line.y }, { x: line.x, y: line.y }];
            for (let i = 0; i < points.length - 1; i++) {
                const a = this.system.toGrid(points[i].x, points[i].y);
                const b = this.system.toGrid(points[i + 1].x, points[i + 1].y);
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
                this.getFootprintRouter().getGhostOccupiedCells(ghosts, width).forEach(cell => addKey(cell.x, cell.y));
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
            const a = this.system.toGrid(points[i].x, points[i].y);
            const b = this.system.toGrid(points[i + 1].x, points[i + 1].y);
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
            this.getFootprintRouter().getGhostOccupiedCells(ghosts, width).forEach(cell => mark(cell.x, cell.y));
        }
    }

    createRoutingGrid(grid, ignoreLine = null) {
        const expanded = [];
        const routeScale = this.system.getRouteScale();
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

        (this.gameEngine.state.logisticsLines || []).forEach(line => {
            if (ignoreLine && (line.id === ignoreLine.id || line.groupId === ignoreLine.groupId)) return;
            this.markLineOnGrid(routeGrid, line);
        });
        return routeGrid;
    }
}
