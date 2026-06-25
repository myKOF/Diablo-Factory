import { isFinitePoint } from './LogisticsStateGuards.js';

export function buildPathMetrics(points) {
    if (!Array.isArray(points) || points.length < 2) return { total: 0, segments: [] };
    let total = 0;
    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (!isFinitePoint(a) || !isFinitePoint(b)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.abs(dx) + Math.abs(dy);
        segments.push({ a, b, dx, dy, len, start: total });
        total += len;
    }
    return { total, segments };
}

// [效能] 預設記憶化快取:路徑度量是 routePoints 的純函式(段長/段資訊只依幾何),
// 但呼叫端多半不傳 cache → 原本每次重建 O(P)。改用 WeakMap(以 points 參照為鍵,自動失效零洩漏),
// 無顯式 cache 時仍跨呼叫/跨幀命中。render 與 logic 的 getPathDistanceToPoint/getPointOnPathByDistance 皆受惠。
const _defaultMetricsCache = new WeakMap();

export function getCachedPathMetrics(points, cache = null) {
    if (!Array.isArray(points)) return buildPathMetrics(points);
    const store = cache || _defaultMetricsCache;
    const cached = store.get(points);
    if (cached) return cached;
    const metrics = buildPathMetrics(points);
    store.set(points, metrics);
    return metrics;
}

export function getPathTotalLength(points, cache = null) {
    return getCachedPathMetrics(points, cache).total;
}

export function getPointOnPathByDistance(points, distance, cache = null) {
    if (!Array.isArray(points) || points.length < 2) return null;
    let remaining = Math.max(0, Number(distance) || 0);
    const segments = getCachedPathMetrics(points, cache).segments;
    for (let i = 0; i < segments.length; i++) {
        const { a, dx, dy, len } = segments[i];
        if (len <= 0) continue;
        if (remaining <= len || i === segments.length - 1) {
            const t = Math.max(0, Math.min(1, remaining / len));
            return {
                x: a.x + dx * t,
                y: a.y + dy * t
            };
        }
        remaining -= len;
    }
    const last = points[points.length - 1];
    return isFinitePoint(last) ? { x: last.x, y: last.y } : null;
}

export function getPointOnPathProgress(points, progress, cache = null) {
    if (!Array.isArray(points) || points.length === 0) return { x: 0, y: 0 };
    if (points.length === 1) return { x: points[0].x, y: points[0].y };
    const total = getPathTotalLength(points, cache);
    if (total <= 0) return { x: points[0].x, y: points[0].y };
    const clamped = Math.max(0, Math.min(1, Number(progress) || 0));
    return getPointOnPathByDistance(points, clamped * total, cache) || { x: points[0].x, y: points[0].y };
}

export function getPathDistanceToPoint(points, point, cache = null) {
    if (!Array.isArray(points) || points.length < 2 || !isFinitePoint(point)) return 0;
    let bestDist = Infinity;
    let bestPathDist = 0;
    const segments = getCachedPathMetrics(points, cache).segments;
    for (let i = 0; i < segments.length; i++) {
        const { a, dx, dy, len, start } = segments[i];
        const lenSq = dx * dx + dy * dy;
        if (lenSq <= 0) continue;
        const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
        const proj = { x: a.x + dx * t, y: a.y + dy * t };
        const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
        if (dist < bestDist) {
            bestDist = dist;
            bestPathDist = start + len * t;
        }
    }
    return bestPathDist;
}

export function getDistanceToPath(points, point, cache = null) {
    if (!Array.isArray(points) || points.length < 2 || !isFinitePoint(point)) return Infinity;
    let bestDist = Infinity;
    const segments = getCachedPathMetrics(points, cache).segments;
    for (let i = 0; i < segments.length; i++) {
        const { a, dx, dy } = segments[i];
        const lenSq = dx * dx + dy * dy;
        if (lenSq <= 0) continue;
        const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
        const proj = { x: a.x + dx * t, y: a.y + dy * t };
        bestDist = Math.min(bestDist, Math.hypot(point.x - proj.x, point.y - proj.y));
    }
    return bestDist;
}

export function pushUniquePoint(points, point, tolerance = 1) {
    if (!isFinitePoint(point)) return false;
    const last = points[points.length - 1];
    if (last && Math.hypot(last.x - point.x, last.y - point.y) <= tolerance) return false;
    points.push({ x: point.x, y: point.y });
    return true;
}
