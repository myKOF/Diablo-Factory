export class LogisticsLineHitTester {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    getLineAt(worldX, worldY) {
        return this.getLinesAt(worldX, worldY)[0] || null;
    }

    getLinesAt(worldX, worldY) {
        const hits = [];
        const nearbyLines = this.system.spatialGrid.getNearby(worldX, worldY);
        nearbyLines.forEach(line => {
            this.getVisibleRects(line).forEach(rect => {
                if (
                    worldX >= rect.x && worldX <= rect.x + rect.w &&
                    worldY >= rect.y && worldY <= rect.y + rect.h
                ) {
                    const cx = rect.x + rect.w / 2;
                    const cy = rect.y + rect.h / 2;
                    hits.push({
                        line: rect.segment || line,
                        distance: Math.hypot(worldX - cx, worldY - cy),
                        isEndpoint: !!rect.isEndpoint,
                        isSourcePortCell: this.system.isLogisticsSourcePortCell(rect.segment || line, worldX, worldY)
                    });
                }
            });
        });
        hits.sort((a, b) =>
            Number(b.isSourcePortCell) - Number(a.isSourcePortCell) ||
            Number(a.isEndpoint) - Number(b.isEndpoint) ||
            a.distance - b.distance ||
            (b.line.createdAt || 0) - (a.line.createdAt || 0)
        );
        return hits.map(hit => hit.line);
    }

    getVisibleRects(line) {
        const TS = this.gameEngine.TILE_SIZE;
        const points = Array.isArray(line.routePoints)
            ? line.routePoints.map(point => ({ x: point.x, y: point.y }))
            : [];
        if (points.length < 2) return [];
        const width = Math.max(1, Math.round(Number(line.routeWidth) || 1));
        const rects = [];
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.001) continue;

            const dir = { x: dx / dist, y: dy / dist };
            const steps = Math.max(1, Math.round(dist / TS));
            const stepSize = dist / steps;

            for (let step = 0; step < steps; step++) {
                const px = a.x + dir.x * stepSize * step;
                const py = a.y + dir.y * stepSize * step;
                const cellKey = `${Math.round(px)},${Math.round(py)}`;
                if (this.system.isLogisticsDetachedSplitCell(line, cellKey)) continue;

                const isHorizontal = Math.abs(dir.x) > Math.abs(dir.y);
                rects.push({
                    x: px - (isHorizontal ? TS / 2 : (width * TS) / 2),
                    y: py - (isHorizontal ? (width * TS) / 2 : TS / 2),
                    w: (isHorizontal ? TS : width * TS),
                    h: (isHorizontal ? width * TS : TS),
                    segment: line,
                    isEndpoint: false
                });
            }
        }
        this.addOpenEndpointRect(line, points, width, rects);
        return rects;
    }

    addOpenEndpointRect(line, points, width, rects) {
        if (line.targetId || line.suppressOpenEndpointCell) return;
        const TS = this.gameEngine.TILE_SIZE;
        const end = points[points.length - 1];
        const prev = points[points.length - 2];
        if (!end || !prev) return;
        const endpointKey = `${Math.round(end.x)},${Math.round(end.y)}`;
        if (this.system.isLogisticsDetachedSplitCell(line, endpointKey)) return;
        const dx = end.x - prev.x;
        const dy = end.y - prev.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.001) return;

        const dir = { x: dx / dist, y: dy / dist };
        const isHorizontal = Math.abs(dir.x) > Math.abs(dir.y);
        rects.push({
            x: end.x - (isHorizontal ? TS / 2 : (width * TS) / 2),
            y: end.y - (isHorizontal ? (width * TS) / 2 : TS / 2),
            w: (isHorizontal ? TS : width * TS),
            h: (isHorizontal ? width * TS : TS),
            segment: line,
            isEndpoint: true
        });
    }
}
