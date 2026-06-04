export class LogisticsGroupConnectivity {
    constructor(system) {
        this.system = system;
    }

    areTouching(primaryGroupId, secondaryGroupId) {
        if (!primaryGroupId || !secondaryGroupId || primaryGroupId === secondaryGroupId) return false;
        const primaryLines = this.system.getLogisticsSegmentsByGroupId(primaryGroupId);
        const secondaryLines = this.system.getLogisticsSegmentsByGroupId(secondaryGroupId);
        if (!primaryLines.length || !secondaryLines.length) return false;
        const getEndpointDirs = (line) => {
            const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
            if (points.length < 2) return [];
            const start = points[0];
            const end = points[points.length - 1];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const dir = Math.abs(dx) >= Math.abs(dy)
                ? { x: Math.sign(dx) || 1, y: 0 }
                : { x: 0, y: Math.sign(dy) || 1 };
            return [
                { key: `${Math.round(start.x)},${Math.round(start.y)}`, dirX: dir.x, dirY: dir.y, line },
                { key: `${Math.round(end.x)},${Math.round(end.y)}`, dirX: dir.x, dirY: dir.y, line }
            ];
        };
        const isBlockedSplitEndpointTouch = (endpoint, other) => {
            if (!endpoint || !other || endpoint.key !== other.key) return false;
            const endpointLine = endpoint.line || null;
            const otherLine = other.line || null;
            const endpointDetachedFrom = endpointLine?.detachedFromGroupId || null;
            const otherDetachedFrom = otherLine?.detachedFromGroupId || null;
            if (endpointLine?.suppressedOpenEndpointCellKey === endpoint.key) return true;
            if (otherLine?.suppressedOpenEndpointCellKey === other.key) return true;
            if (endpointDetachedFrom === secondaryGroupId && endpointLine?.detachedAtKey === endpoint.key) return true;
            if (otherDetachedFrom === primaryGroupId && otherLine?.detachedAtKey === other.key) return true;
            return false;
        };

        const secondaryEndpoints = new Map();
        secondaryLines.forEach(line => {
            getEndpointDirs(line).forEach(endpoint => {
                if (!secondaryEndpoints.has(endpoint.key)) secondaryEndpoints.set(endpoint.key, []);
                secondaryEndpoints.get(endpoint.key).push(endpoint);
            });
        });

        for (const line of primaryLines) {
            for (const endpoint of getEndpointDirs(line)) {
                const matches = secondaryEndpoints.get(endpoint.key) || [];
                if (matches.some(other =>
                    !isBlockedSplitEndpointTouch(endpoint, other) &&
                    !(other.dirX === -endpoint.dirX && other.dirY === -endpoint.dirY)
                )) {
                    return true;
                }
            }
        }

        const secondaryCells = new Map();
        secondaryLines.forEach(line => {
            this.system.getLogisticsLineDirectedCells(line).forEach(cell => {
                if (!secondaryCells.has(cell.key)) secondaryCells.set(cell.key, []);
                secondaryCells.get(cell.key).push(cell);
            });
        });

        let hasSameDirectionOverlap = false;
        for (const line of primaryLines) {
            const cells = this.system.getLogisticsLineDirectedCells(line);
            for (const cell of cells) {
                const overlaps = secondaryCells.get(cell.key) || [];
                if (overlaps.some(other => other.dirX === -cell.dirX && other.dirY === -cell.dirY)) return false;
                if (overlaps.some(other => other.dirX === cell.dirX && other.dirY === cell.dirY)) hasSameDirectionOverlap = true;
            }
        }
        return hasSameDirectionOverlap;
    }
}
