import { GameEngine } from '../game_systems.js';

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

        // T 字接合：一個群組的端點正好落在另一個群組某線段的「中段」(非端點)，
        // 例如支線垂直接入主線中段。此時兩端點不重合、接觸方向垂直(既非同向亦非反向)，
        // 上方的端點對端點與下方的同向重疊判定都不會命中。若不在此辨識，
        // mergeConnectedGroups 不會嘗試註冊合流節點，支線會被誤判為未接通(灰色)。
        const onSegmentTolerance = Math.max(1, (GameEngine.TILE_SIZE || 20) * 0.25);
        const sharedEndpointTolerance = Math.max(1, (GameEngine.TILE_SIZE || 20) * 0.5);
        const endpointLandsOnOtherInterior = (lines, otherLines) => {
            for (const line of lines) {
                const pts = Array.isArray(line?.routePoints) ? line.routePoints : [];
                if (pts.length < 2) continue;
                for (const ep of [pts[0], pts[pts.length - 1]]) {
                    if (!ep || !Number.isFinite(ep.x) || !Number.isFinite(ep.y)) continue;
                    for (const other of otherLines) {
                        const opts = Array.isArray(other?.routePoints) ? other.routePoints : [];
                        for (let i = 0; i < opts.length - 1; i++) {
                            const a = opts[i];
                            const b = opts[i + 1];
                            if (!this.system.isPointOnSegment(ep, a, b, onSegmentTolerance)) continue;
                            // 端點重合的情況已由上方端點對端點判定處理，這裡只取真正的中段接觸
                            const nearA = Math.hypot(ep.x - a.x, ep.y - a.y) <= sharedEndpointTolerance;
                            const nearB = Math.hypot(ep.x - b.x, ep.y - b.y) <= sharedEndpointTolerance;
                            if (nearA || nearB) continue;
                            return true;
                        }
                    }
                }
            }
            return false;
        };
        if (endpointLandsOnOtherInterior(primaryLines, secondaryLines)) return true;
        if (endpointLandsOnOtherInterior(secondaryLines, primaryLines)) return true;

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
