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

    // [建造卡頓根因] 相位計時實測:整個拖曳建造 ~200ms 卡頓的 ~90% 在本函式(每次 ~90-100ms,
    // startDrag 與 submitDrag 的 revalidate 各跑一次),且成本與新線長短無關——是「全地圖格網逐格
    // 展開 + 再整份冗餘複製」的固定成本。三層優化,語意完全等價:
    //   ①基底展開格網以 (pathfinding.grid 參照, routeScale) 快取——只有建築增減換新 grid 才重建;
    //   ②成品格網以 (grid, logisticsLines 參照+長度, ignoreLine 群組) memo——同一次拖曳
    //     startDrag→submitDrag 兩次呼叫參數相同,第二次直接重用(建造會 replaceLogisticsLines
    //     換陣列參照,自然失效)。router 對格網的臨時改寫(起訖點鬆綁)皆成對還原,重用安全;
    //   ③展開改為預配置陣列逐格寫入,並只在產出成品時做一次行複製。
    createRoutingGrid(grid, ignoreLine = null) {
        const routeScale = this.system.getRouteScale();
        const lines = this.gameEngine.state.logisticsLines || [];
        const ignoreKey = ignoreLine ? String(ignoreLine.groupId || ignoreLine.id || '') : '';
        const memo = this._routingGridMemo;
        if (memo &&
            memo.grid === grid &&
            memo.routeScale === routeScale &&
            memo.lines === lines &&
            memo.linesLen === lines.length &&
            memo.ignoreKey === ignoreKey) {
            return memo.result;
        }

        let base = this._baseGridCache;
        if (!base || base.grid !== grid || base.routeScale !== routeScale) {
            const expanded = [];
            for (let y = 0; y < grid.length; y++) {
                const srcRow = grid[y];
                const expandedRow = new Array(srcRow.length * routeScale);
                for (let x = 0; x < srcRow.length; x++) {
                    const v = srcRow[x];
                    for (let r = 0; r < routeScale; r++) expandedRow[x * routeScale + r] = v;
                }
                // 同一來源列的 routeScale 份內容相同,共用參照;產出成品時的行複製會各自分離。
                for (let row = 0; row < routeScale; row++) expanded.push(expandedRow);
            }
            base = { grid, routeScale, expanded };
            this._baseGridCache = base;
        }

        const routeGrid = base.expanded.map(row => row.slice());
        lines.forEach(line => {
            if (ignoreLine && (line.id === ignoreLine.id || line.groupId === ignoreLine.groupId)) return;
            this.markLineOnGrid(routeGrid, line);
        });
        this._routingGridMemo = { grid, routeScale, lines, linesLen: lines.length, ignoreKey, result: routeGrid };
        return routeGrid;
    }
}
