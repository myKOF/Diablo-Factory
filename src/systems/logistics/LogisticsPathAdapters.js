import { GameEngine } from '../game_systems.js';

function samePoint(a, b) {
    return a && b && a.x === b.x && a.y === b.y;
}

export class LogisticsPathAdapters {
    constructor(system) {
        this.system = system;
    }

    getPortAnchorGrid(port, portGrid) {
        if (!port || !port.dir || !portGrid) return portGrid;
        if (port.sourceType === "logistics_line") return portGrid;
        const dir = this.system.router.getDirectionVector(port.dir);
        const routeScale = this.system.getRouteScale();
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

        return path;
    }

    dedupeExtensionStart(path) {
        const activeDrag = this.system.activeDrag;
        if (!activeDrag?.isLineExtension || !activeDrag?.sourceLine || !Array.isArray(path) || path.length < 2) {
            return path;
        }
        const sourceLine = activeDrag.sourceLine;
        const groupId = sourceLine.groupId || sourceLine.id;
        const lines = (GameEngine.state.logisticsLines || []).filter(line => line && (line.groupId === groupId || line.id === groupId));
        if (lines.length === 0) return path;

        const occupied = new Set();
        lines.forEach(line => {
            const route = Array.isArray(line.routePoints) ? line.routePoints : [];
            for (let i = 0; i < route.length - 1; i++) {
                const a = this.system.toGrid(route[i].x, route[i].y);
                const b = this.system.toGrid(route[i + 1].x, route[i + 1].y);
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
        // 保留原始物流線 anchor，讓分支延伸共享真實圖節點。
        return [path[0], ...path.slice(firstOpenIndex)];
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
            const bendA = { x: e1.x, y: s1.y };
            const bendB = { x: s1.x, y: e1.y };
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

}
