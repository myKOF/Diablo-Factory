import { getLogisticsFootprintRects } from './LogisticsFootprintRects.js';

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
        return getLogisticsFootprintRects(line, this.getTileSize() || 20);
    }
}
