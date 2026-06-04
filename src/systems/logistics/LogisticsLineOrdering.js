export class LogisticsLineOrdering {
    constructor(getGameEngine) {
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    orderByDirection(segments) {
        if (!Array.isArray(segments) || segments.length <= 1) {
            if (Array.isArray(segments) && segments.length === 1) {
                segments[0].order = 0;
                segments[0].splitSequenceOrder = 0;
            }
            return Array.isArray(segments) ? [...segments] : [];
        }

        const TS = this.gameEngine.TILE_SIZE || 20;
        const align = TS / 2;
        const getSequenceOrder = (seg) => Number.isFinite(seg?.splitSequenceOrder)
            ? seg.splitSequenceOrder
            : (Number.isFinite(seg?.order) ? seg.order : 0);
        const getCoords = (seg) => {
            if (Number.isFinite(seg?.startGx) && Number.isFinite(seg?.startGy) &&
                Number.isFinite(seg?.endGx) && Number.isFinite(seg?.endGy)) {
                return { startGx: seg.startGx, startGy: seg.startGy, endGx: seg.endGx, endGy: seg.endGy };
            }
            const points = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
            const start = points[0] || { x: seg?.x || 0, y: seg?.y || 0 };
            const end = points[points.length - 1] || start;
            return {
                startGx: Math.round(start.x / align),
                startGy: Math.round(start.y / align),
                endGx: Math.round(end.x / align),
                endGy: Math.round(end.y / align)
            };
        };
        const coordKey = (gx, gy) => gx + "," + gy;
        const directionOf = (seg) => {
            const c = getCoords(seg);
            return {
                x: Math.sign(c.endGx - c.startGx),
                y: Math.sign(c.endGy - c.startGy)
            };
        };
        const sortStable = (list) => [...list].sort((a, b) =>
            getSequenceOrder(a) - getSequenceOrder(b) ||
            String(a.id || "").localeCompare(String(b.id || ""))
        );

        const byStart = new Map();
        const byEnd = new Map();
        const addEndpoint = (map, key, seg) => {
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(seg);
        };
        segments.forEach(seg => {
            const c = getCoords(seg);
            addEndpoint(byStart, coordKey(c.startGx, c.startGy), seg);
            addEndpoint(byEnd, coordKey(c.endGx, c.endGy), seg);
        });

        const offsets = [
            [0, 0],
            [-1, 0], [1, 0], [0, -1], [0, 1],
            [-1, -1], [-1, 1], [1, -1], [1, 1],
            [-2, 0], [2, 0], [0, -2], [0, 2],
            [-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2],
            [-2, -2], [-2, 2], [2, -2], [2, 2]
        ];

        const countIncoming = (seg) => {
            const c = getCoords(seg);
            let count = 0;
            offsets.forEach(([dx, dy]) => {
                (byEnd.get(coordKey(c.startGx + dx, c.startGy + dy)) || []).forEach(candidate => {
                    if (candidate !== seg) count++;
                });
            });
            return count;
        };

        const ordered = [];
        const remaining = new Set(segments);
        let current = sortStable(segments).find(seg => countIncoming(seg) === 0) || sortStable(segments)[0];

        const pickNext = (seg) => {
            const c = getCoords(seg);
            const currentDir = directionOf(seg);
            const candidates = [];
            offsets.forEach(([dx, dy], offsetIndex) => {
                (byStart.get(coordKey(c.endGx + dx, c.endGy + dy)) || []).forEach(candidate => {
                    if (!remaining.has(candidate) || candidate === seg) return;
                    const candidateDir = directionOf(candidate);
                    if (currentDir.x === -candidateDir.x && currentDir.y === -candidateDir.y) return;
                    const distance = Math.hypot(dx, dy);
                    const turnPenalty = currentDir.x === candidateDir.x && currentDir.y === candidateDir.y ? 0 : 0.25;
                    candidates.push({ candidate, score: distance + turnPenalty, offsetIndex });
                });
            });
            candidates.sort((a, b) =>
                a.score - b.score ||
                a.offsetIndex - b.offsetIndex ||
                getSequenceOrder(a.candidate) - getSequenceOrder(b.candidate) ||
                String(a.candidate.id || "").localeCompare(String(b.candidate.id || ""))
            );
            return candidates[0]?.candidate || null;
        };

        while (current && remaining.has(current)) {
            ordered.push(current);
            remaining.delete(current);
            current = pickNext(current);
        }

        if (remaining.size > 0) {
            sortStable([...remaining]).forEach(seg => ordered.push(seg));
        }

        for (let i = 0; i < ordered.length; i++) {
            ordered[i].prevId = i > 0 ? ordered[i - 1].id : null;
            ordered[i].nextId = i < ordered.length - 1 ? ordered[i + 1].id : null;
            ordered[i].order = i;
            ordered[i].splitSequenceOrder = i;

            const prevSeg = i > 0 ? ordered[i - 1] : null;
            const nextSeg = i < ordered.length - 1 ? ordered[i + 1] : null;
            const isCorner = (prevSeg && prevSeg.dir !== ordered[i].dir) ||
                (nextSeg && nextSeg.dir !== ordered[i].dir);
            ordered[i].isCorner = !!isCorner;
        }

        return ordered;
    }
}
