import { getLogisticsFootprintRects } from './LogisticsFootprintRects.js';

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
        return getLogisticsFootprintRects(line, this.gameEngine.TILE_SIZE, {
            shouldSkipCell: (segment, cellKey) => this.system.isLogisticsDetachedSplitCell(segment, cellKey)
        });
    }
}
