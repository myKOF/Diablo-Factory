export class LogisticsLineQuery {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    getRoute(line) {
        if (!line || !Array.isArray(line.routePoints) || line.routePoints.length < 2) return null;
        return {
            points: line.routePoints.map(point => ({ x: point.x, y: point.y })),
            width: Math.max(1, Number(line.routeWidth) || 1)
        };
    }

    getNodePoints(line) {
        const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
        const nodes = [];
        const push = (point) => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            if (!nodes.some(node => Math.hypot(node.x - point.x, node.y - point.y) < 1)) {
                nodes.push({ x: point.x, y: point.y });
            }
        };

        points.forEach(push);
        if (Number.isFinite(line?.x) && Number.isFinite(line?.y)) push({ x: line.x, y: line.y });
        return nodes;
    }

    isPointOnLine(point, line) {
        if (!point || !line) return false;
        const points = Array.isArray(line.routePoints) ? line.routePoints : [];
        if (points.some(routePoint => routePoint && Math.hypot(routePoint.x - point.x, routePoint.y - point.y) < 1)) return true;
        if (Number.isFinite(line.x) && Number.isFinite(line.y) && Math.hypot(line.x - point.x, line.y - point.y) < 1) return true;

        const eps = 1;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const lengthSq = dx * dx + dy * dy;
            if (lengthSq < 0.001) continue;
            const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
            if (t < -0.001 || t > 1.001) continue;
            const projX = a.x + dx * t;
            const projY = a.y + dy * t;
            if (Math.hypot(point.x - projX, point.y - projY) <= eps) return true;
        }
        return false;
    }

    getDirectedCells(line) {
        const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
        if (points.length < 2) return [];
        const TS = this.gameEngine.TILE_SIZE;
        const cells = [];
        const seen = new Set();

        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            if (!a || !b) continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.001) continue;

            const dirX = Math.sign(dx);
            const dirY = Math.sign(dy);
            const steps = Math.max(1, Math.round(dist / TS));
            const stepSize = dist / steps;

            for (let step = 0; step < steps; step++) {
                const px = a.x + (dx / dist) * stepSize * step;
                const py = a.y + (dy / dist) * stepSize * step;
                const snapped = this.system.snapPointToGridCenter({ x: px, y: py });
                const key = `${snapped.x},${snapped.y}`;
                const uniqueKey = `${key}:${dirX},${dirY}`;
                if (seen.has(uniqueKey)) continue;
                seen.add(uniqueKey);
                cells.push({ key, dirX, dirY });
            }
        }

        return cells;
    }
}
