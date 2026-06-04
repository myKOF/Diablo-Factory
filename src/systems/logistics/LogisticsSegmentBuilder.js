export class LogisticsSegmentBuilder {
    constructor(getGameEngine) {
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    snapPointToGridCenter(point) {
        const TS = this.gameEngine.TILE_SIZE;
        const align = TS;
        return {
            x: Math.floor(point.x / align) * align + align / 2,
            y: Math.floor(point.y / align) * align + align / 2
        };
    }

    makeLogisticsLineId(sourceId, targetId = null, targetPoint = null) {
        const targetKey = targetId || `${Math.round(targetPoint?.x || 0)}_${Math.round(targetPoint?.y || 0)}`;
        return `logistics_${sourceId}_${targetKey}_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000).toString(36)}`;
    }

    buildGridRoutePoints(points) {
        if (!Array.isArray(points) || points.length < 2) return [];
        const TS = this.gameEngine.TILE_SIZE;
        const align = TS / 2;
        const snapped = points.map(p => this.snapPointToGridCenter(p));
        const route = [];
        const push = (p) => {
            const last = route[route.length - 1];
            if (!last || last.x !== p.x || last.y !== p.y) route.push({ x: p.x, y: p.y });
        };

        push(snapped[0]);
        for (let i = 1; i < snapped.length; i++) {
            const last = route[route.length - 1];
            const next = snapped[i];
            if (!last || (last.x === next.x && last.y === next.y)) continue;
            if (last.x !== next.x && last.y !== next.y) {
                push({ x: next.x, y: last.y });
            }
            push(next);
        }

        const expanded = [];
        const pushExpanded = (p) => {
            const last = expanded[expanded.length - 1];
            if (!last || last.x !== p.x || last.y !== p.y) expanded.push({ x: p.x, y: p.y });
        };
        pushExpanded(route[0]);
        for (let i = 1; i < route.length; i++) {
            const a = expanded[expanded.length - 1];
            const b = route[i];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const steps = Math.max(Math.abs(dx), Math.abs(dy)) / align;
            const sx = Math.sign(dx) * align;
            const sy = Math.sign(dy) * align;
            for (let step = 1; step <= steps; step++) {
                pushExpanded({ x: a.x + sx * step, y: a.y + sy * step });
            }
        }
        return expanded;
    }

    buildLogisticsSegments(groupId, sourceId, targetId, targetPoint, gridPoints, routeWidth, sourcePort, targetPort, filter, lineType = 'transport_line', efficiency = 0) {
        if (!Array.isArray(gridPoints) || gridPoints.length < 2) return [];
        const TS = this.gameEngine.TILE_SIZE;
        const align = TS / 2;
        const segments = [];
        let i = 0;
        while (i < gridPoints.length - 1) {
            const start = gridPoints[i];
            const next = gridPoints[Math.min(i + 1, gridPoints.length - 1)];
            const targetEnd = gridPoints[Math.min(i + 2, gridPoints.length - 1)];
            const dirX = Math.sign(next.x - start.x);
            const dirY = Math.sign(next.y - start.y);
            const nextDirX = Math.sign(targetEnd.x - next.x);
            const nextDirY = Math.sign(targetEnd.y - next.y);
            const canUseTargetEnd = i + 2 < gridPoints.length &&
                dirX === nextDirX &&
                dirY === nextDirY;
            const segmentEnd = canUseTargetEnd ? targetEnd : next;
            const dx = segmentEnd.x - start.x;
            const dy = segmentEnd.y - start.y;
            let end = segmentEnd;
            if (canUseTargetEnd && Math.hypot(dx, dy) < TS - 0.001) {
                end = {
                    x: start.x + dirX * TS,
                    y: start.y + dirY * TS
                };
            }
            if (start.x === end.x && start.y === end.y) {
                i += 1;
                continue;
            }
            const centerX = (start.x + end.x) / 2;
            const centerY = (start.y + end.y) / 2;
            const gx = Math.round(centerX / align);
            const gy = Math.round(centerY / align);
            const startGx = Math.round(start.x / align);
            const startGy = Math.round(start.y / align);
            const endGx = Math.round(end.x / align);
            const endGy = Math.round(end.y / align);
            const tDirSignX = Math.sign(next.x - start.x);
            const tDirSignY = Math.sign(next.y - start.y);
            const rawAngle = Math.atan2(tDirSignY, tDirSignX) * 180 / Math.PI;
            const dir = Math.round(((rawAngle % 360) + 360) % 360);
            const isSourcePortCell = segments.length === 0 &&
                sourcePort &&
                Number.isFinite(sourcePort.x) &&
                Number.isFinite(sourcePort.y) &&
                Math.hypot(start.x - sourcePort.x, start.y - sourcePort.y) <= (this.gameEngine.TILE_SIZE || 20) * 1.1;
            segments.push({
                id: `${groupId}_seg_${gx}_${gy}_${i}`,
                groupId,
                type: 'logistics_segment',
                sourceId,
                targetId,
                targetPoint: targetId ? null : targetPoint,
                gridX: gx,
                gridY: gy,
                startGx,
                startGy,
                endGx,
                endGy,
                dir,
                alignUnit: 0.5,
                x: centerX,
                y: centerY,
                routePoints: [{ x: start.x, y: start.y }, { x: end.x, y: end.y }],
                routeWidth: Math.max(1, Number(routeWidth) || 1),
                lineType,
                efficiency: Number(efficiency) || 0,
                sourcePort,
                targetPort,
                filter: filter || null,
                isSourcePortCell,
                sourcePortCellKey: isSourcePortCell ? `${Math.round(start.x)},${Math.round(start.y)}` : null,
                prevId: null,
                nextId: null,
                order: i,
                createdAt: Date.now()
            });
            i += canUseTargetEnd ? 2 : 1;
        }
        for (let i = 0; i < segments.length; i++) {
            segments[i].prevId = i > 0 ? segments[i - 1].id : null;
            segments[i].nextId = i < segments.length - 1 ? segments[i + 1].id : null;

            const prevSeg = i > 0 ? segments[i - 1] : null;
            const nextSeg = i < segments.length - 1 ? segments[i + 1] : null;
            const isCorner = (prevSeg && prevSeg.dir !== segments[i].dir) ||
                (nextSeg && nextSeg.dir !== segments[i].dir);
            segments[i].isCorner = !!isCorner;
        }
        return segments;
    }
}
