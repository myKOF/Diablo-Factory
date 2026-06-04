export class SpatialHashGrid {
    constructor(cellSize = 64, getTileSize = () => 64) {
        this.cellSize = cellSize;
        this.getTileSize = getTileSize;
        this.grid = new Map();
    }

    clear() {
        this.grid.clear();
    }

    _getBucket(x, y) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        return `${cx},${cy}`;
    }

    insert(segment) {
        if (!segment) return;
        const rects = this._getSegmentRects(segment);
        rects.forEach(rect => {
            const minX = rect.x;
            const maxX = rect.x + rect.w;
            const minY = rect.y;
            const maxY = rect.y + rect.h;

            const startCx = Math.floor(minX / this.cellSize);
            const endCx = Math.floor(maxX / this.cellSize);
            const startCy = Math.floor(minY / this.cellSize);
            const endCy = Math.floor(maxY / this.cellSize);

            for (let cx = startCx; cx <= endCx; cx++) {
                for (let cy = startCy; cy <= endCy; cy++) {
                    const key = `${cx},${cy}`;
                    if (!this.grid.has(key)) {
                        this.grid.set(key, new Set());
                    }
                    this.grid.get(key).add(segment);
                }
            }
        });
    }

    getNearby(worldX, worldY) {
        const cx = Math.floor(worldX / this.cellSize);
        const cy = Math.floor(worldY / this.cellSize);
        const results = new Set();

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const key = `${cx + dx},${cy + dy}`;
                const bucket = this.grid.get(key);
                if (bucket) {
                    bucket.forEach(item => results.add(item));
                }
            }
        }
        return results;
    }

    _getSegmentRects(line) {
        const TS = this.getTileSize() || 20;
        const points = Array.isArray(line.routePoints)
            ? line.routePoints.map(p => ({ x: p.x, y: p.y }))
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

                const isHorizontal = Math.abs(dir.x) > Math.abs(dir.y);
                rects.push({
                    x: px - (isHorizontal ? TS / 2 : (width * TS) / 2),
                    y: py - (isHorizontal ? (width * TS) / 2 : TS / 2),
                    w: (isHorizontal ? TS : width * TS),
                    h: (isHorizontal ? width * TS : TS)
                });
            }
        }
        if (!line.targetId && !line.suppressOpenEndpointCell) {
            const end = points[points.length - 1];
            const prev = points[points.length - 2];
            if (end && prev) {
                const dx = end.x - prev.x;
                const dy = end.y - prev.y;
                const dist = Math.hypot(dx, dy);
                if (dist >= 0.001) {
                    const dir = { x: dx / dist, y: dy / dist };
                    const isHorizontal = Math.abs(dir.x) > Math.abs(dir.y);
                    rects.push({
                        x: end.x - (isHorizontal ? TS / 2 : (width * TS) / 2),
                        y: end.y - (isHorizontal ? (width * TS) / 2 : TS / 2),
                        w: (isHorizontal ? TS : width * TS),
                        h: (isHorizontal ? width * TS : TS)
                    });
                }
            }
        }
        return rects;
    }
}
