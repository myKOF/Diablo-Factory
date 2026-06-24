import { ConveyorRouter } from '../ConveyorRouter.js';

const router = new ConveyorRouter([], 0, 0);

function getDirection(a, b) {
    if (!a || !b) return { x: 1, y: 0 };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { x: 1, y: 0 };
    return Math.abs(dx) >= Math.abs(dy)
        ? { x: Math.sign(dx) || 1, y: 0 }
        : { x: 0, y: Math.sign(dy) || 1 };
}

function pushFootprintRects(rects, point, dir, width, tileSize, line, options = {}) {
    const align = tileSize / 2;
    const gx = Math.round(point.x / align);
    const gy = Math.round(point.y / align);
    const cells = router.getGhostOccupiedCells([{
        x: gx,
        y: gy,
        dirIn: dir,
        dirOut: dir
    }], width);

    cells.forEach(cell => {
        const cellKey = `${Math.round(cell.x * align)},${Math.round(cell.y * align)}`;
        if (typeof options.shouldSkipCell === 'function' && options.shouldSkipCell(line, cellKey)) return;
        rects.push({
            x: cell.x * align - tileSize / 2,
            y: cell.y * align - tileSize / 2,
            w: tileSize,
            h: tileSize,
            segment: line,
            isEndpoint: !!options.isEndpoint
        });
    });
}

export function getLogisticsFootprintRects(line, tileSize, options = {}) {
    const TS = tileSize || 20;
    const points = Array.isArray(line?.routePoints)
        ? line.routePoints.map(point => ({ x: point.x, y: point.y }))
        : [];
    if (points.length < 2) return [];

    const width = Math.max(1, Math.round(Number(line.routeWidth) || 1));
    const rects = [];

    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.001) continue;

        const dir = getDirection(a, b);
        const steps = Math.max(1, Math.round(dist / TS));
        const stepSize = dist / steps;

        for (let step = 0; step < steps; step++) {
            pushFootprintRects(rects, {
                x: a.x + (dx / dist) * stepSize * step,
                y: a.y + (dy / dist) * stepSize * step
            }, dir, width, TS, line, options);
        }
    }

    if (!line.targetId && !line.suppressOpenEndpointCell) {
        const end = points[points.length - 1];
        const prev = points[points.length - 2];
        if (end && prev) {
            const dir = getDirection(prev, end);
            pushFootprintRects(rects, end, dir, width, TS, line, {
                ...options,
                isEndpoint: true
            });
        }
    }

    return rects;
}
