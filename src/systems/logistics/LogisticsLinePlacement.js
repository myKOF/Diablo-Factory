export class LogisticsLinePlacement {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    placeSegments({ lines, segments, groupId, splitOnBlockedOverlap = false }) {
        const occupied = new Map();
        const occupiedTileCenters = new Map();
        const sameGroup = (seg) => !!seg && ((seg.groupId === groupId) || (seg.id === groupId));
        const sameRoute = (a, b) => {
            const ap = Array.isArray(a?.routePoints) ? a.routePoints : [];
            const bp = Array.isArray(b?.routePoints) ? b.routePoints : [];
            if (ap.length < 2 || bp.length < 2) return false;
            return (ap[0].x === bp[0].x && ap[0].y === bp[0].y && ap[1].x === bp[1].x && ap[1].y === bp[1].y)
                || (ap[0].x === bp[1].x && ap[0].y === bp[1].y && ap[1].x === bp[0].x && ap[1].y === bp[0].y);
        };
        const getSegmentTileKeys = (seg) => {
            const points = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
            if (points.length < 2) return [];
            const TS = this.gameEngine.TILE_SIZE;
            const eps = 0.001;
            const keys = new Set();
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                if (!a || !b) continue;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                if (dist < eps) continue;
                const dirX = dx / dist;
                const dirY = dy / dist;
                const steps = Math.max(1, Math.round(dist / TS));
                const stepSize = dist / steps;
                for (let step = 0; step < steps; step++) {
                    const px = a.x + dirX * stepSize * step;
                    const py = a.y + dirY * stepSize * step;
                    const snapped = this.system.snapPointToGridCenter({ x: px, y: py });
                    keys.add(`${snapped.x},${snapped.y}`);
                }
            }
            return Array.from(keys);
        };
        const getSegmentEndpointTileKeys = (seg) => {
            const points = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
            if (points.length < 2) return [];
            return [
                this.system.snapPointToGridCenter(points[0]),
                this.system.snapPointToGridCenter(points[points.length - 1])
            ].map(point => `${point.x},${point.y}`);
        };
        const isLineEndpointKey = (line, key) => {
            const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
            if (points.length < 2) return false;
            const start = this.system.snapPointToGridCenter(points[0]);
            const end = this.system.snapPointToGridCenter(points[points.length - 1]);
            return key === `${start.x},${start.y}` || key === `${end.x},${end.y}`;
        };
        lines.forEach(item => {
            this.system.getLogisticsSegmentOccupiedKeys(item).forEach(key => {
                if (key && !occupied.has(key)) occupied.set(key, item);
            });
            getSegmentTileKeys(item).forEach(key => {
                if (item?.detachedFromGroupId === groupId && item?.detachedAtKey === key) return;
                if (!occupiedTileCenters.has(key)) occupiedTileCenters.set(key, []);
                occupiedTileCenters.get(key).push(item);
            });
        });

        const additions = [];
        const overlapMergeGroupIds = new Set();
        const blockedOverlapGroupIds = new Set();
        const getLineGroupId = (line) => line?.groupId || line?.id || null;
        const collectSameDirectionOverlapGroups = (segment) => {
            const groupIds = new Set();
            this.system.getLogisticsLineDirectedCells(segment).forEach(cell => {
                const hits = occupiedTileCenters.get(cell.key) || [];
                hits.forEach(hit => {
                    const hitGroupId = getLineGroupId(hit);
                    if (!hitGroupId || hitGroupId === groupId) return;
                    if (this.system.isProcessingMerge === true) {
                        blockedOverlapGroupIds.add(hitGroupId);
                        return;
                    }
                    const hitCells = this.system.getLogisticsLineDirectedCells(hit).filter(hitCell => hitCell.key === cell.key);
                    const hasOppositeDirection = hitCells.some(hitCell =>
                        hitCell.dirX === -cell.dirX &&
                        hitCell.dirY === -cell.dirY
                    );
                    if (hasOppositeDirection) {
                        blockedOverlapGroupIds.add(hitGroupId);
                        groupIds.delete(hitGroupId);
                        return;
                    }
                    const matchesDirection = hitCells.some(hitCell => hitCell.dirX === cell.dirX && hitCell.dirY === cell.dirY);
                    if (matchesDirection) groupIds.add(hitGroupId);
                });
            });
            return groupIds;
        };
        segments.forEach(segment => {
            const keys = this.system.getLogisticsSegmentOccupiedKeys(segment);
            const segmentTileKeys = getSegmentTileKeys(segment);
            if (!keys.length) return;
            const alreadySameRoute = lines.some(item => sameGroup(item) && sameRoute(item, segment));
            if (alreadySameRoute) return;
            const sameDirectionOverlapGroupIds = collectSameDirectionOverlapGroups(segment);
            const endpointBlockedByOtherInterior = splitOnBlockedOverlap && getSegmentEndpointTileKeys(segment).some((key) => {
                const hits = occupiedTileCenters.get(key) || [];
                return hits.some(hit => {
                    const hitGroupId = getLineGroupId(hit);
                    return !!hitGroupId && hitGroupId !== groupId && !isLineEndpointKey(hit, key);
                });
            });
            if (endpointBlockedByOtherInterior) {
                sameDirectionOverlapGroupIds.forEach(id => overlapMergeGroupIds.add(id));
                return;
            }
            const overlapsOccupiedLine = keys.some((key) => !!occupied.get(key));
            if (overlapsOccupiedLine) {
                sameDirectionOverlapGroupIds.forEach(id => overlapMergeGroupIds.add(id));
                return;
            }
            const centerBlockedByOccupiedLine = segmentTileKeys.some((key) => {
                const hits = occupiedTileCenters.get(key) || [];
                return hits.length > 0;
            });
            if (centerBlockedByOccupiedLine) {
                sameDirectionOverlapGroupIds.forEach(id => overlapMergeGroupIds.add(id));
                return;
            }
            keys.forEach(key => occupied.set(key, segment));
            segmentTileKeys.forEach(key => {
                if (!occupiedTileCenters.has(key)) occupiedTileCenters.set(key, []);
                occupiedTileCenters.get(key).push(segment);
            });
            additions.push(segment);
        });
        return {
            additions,
            occupied,
            mergedLines: lines.concat(additions),
            overlapMergeGroupIds,
            blockedOverlapGroupIds
        };
    }
}
