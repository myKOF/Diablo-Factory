// [效能] 路徑點衍生值的記憶化快取。
// routePoints 對每個 transfer / line 在其生命週期內不變(所有變更皆為「重新賦值一個新陣列」,
// 而非就地修改),因此以陣列參照為 WeakMap 鍵可自動失效、且 GC 友善零洩漏。
// 這些衍生值(簽章字串、路徑總長)原本在合流/堆積/佇列邏輯裡每 tick 被同一條路徑重算數百次,
// 經 CDP profiling 證實佔 logic 自耗時約 1/3。

const _sigCache = new WeakMap();
const _euclidLenCache = new WeakMap();
const _manhattanLenCache = new WeakMap();

// 路徑簽章:四捨五入後的 "x,y|x,y|..."，供路徑分組 / 比對 / array-state 鍵使用。
export function routePointsSignature(points) {
    if (!Array.isArray(points)) return '';
    const hit = _sigCache.get(points);
    if (hit !== undefined) return hit;
    let sig = '';
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (i) sig += '|';
        sig += `${Math.round(Number(p?.x) || 0)},${Math.round(Number(p?.y) || 0)}`;
    }
    _sigCache.set(points, sig);
    return sig;
}

// 歐氏總長(逐段 hypot)。
export function routeEuclideanLength(points) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    const hit = _euclidLenCache.get(points);
    if (hit !== undefined) return hit;
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (!a || !b) continue;
        total += Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
    }
    _euclidLenCache.set(points, total);
    return total;
}

// (route, point) 投影距離:純函式,結果僅依路徑幾何與查詢點。合流邏輯每 tick 對「同路徑×同合流點」
// 重算數百次(CDP 證實佔比最高),但合流點穩定(格點對齊、數量少)。以 WeakMap<route, Map<pointKey,值>>
// 記憶化:純函式故記憶化永不改變結果;pointKey 用原始座標字串,杜絕不同點被四捨五入混淆。
const _alongCache = new WeakMap();
const _perpCache = new WeakMap();
function _ptKey(point) { return `${point.x},${point.y}`; }

// 沿路徑到 point 投影處的「路徑距離」(等同原 getPathDistanceToPoint)。
export function routeAlongDistanceToPoint(points, point) {
    if (!Array.isArray(points) || points.length < 2 || !point) return 0;
    let inner = _alongCache.get(points);
    const k = _ptKey(point);
    if (inner === undefined) { inner = new Map(); _alongCache.set(points, inner); }
    else { const hit = inner.get(k); if (hit !== undefined) return hit; }
    let bestDist = Infinity, bestPathDist = 0, total = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const lenSq = dx * dx + dy * dy;
        if (lenSq > 0) {
            const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
            const dist = Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
            if (dist < bestDist) { bestDist = dist; bestPathDist = total + len * t; }
        }
        total += len;
    }
    inner.set(k, bestPathDist);
    return bestPathDist;
}

// 點到路徑的最短(垂直)距離(等同原 getPathPointDistance)。
export function routePerpDistanceToPoint(points, point) {
    if (!Array.isArray(points) || points.length < 2 || !point) return Infinity;
    let inner = _perpCache.get(points);
    const k = _ptKey(point);
    if (inner === undefined) { inner = new Map(); _perpCache.set(points, inner); }
    else { const hit = inner.get(k); if (hit !== undefined) return hit; }
    let bestDist = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq <= 0) {
            bestDist = Math.min(bestDist, Math.hypot((point.x || 0) - (a.x || 0), (point.y || 0) - (a.y || 0)));
            continue;
        }
        const t = Math.max(0, Math.min(1, (((point.x || 0) - (a.x || 0)) * dx + ((point.y || 0) - (a.y || 0)) * dy) / lenSq));
        bestDist = Math.min(bestDist, Math.hypot((point.x || 0) - ((a.x || 0) + dx * t), (point.y || 0) - ((a.y || 0) + dy * t)));
    }
    inner.set(k, bestDist);
    return bestDist;
}

// 曼哈頓(正交)總長。
export function routeManhattanLength(points) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    const hit = _manhattanLenCache.get(points);
    if (hit !== undefined) return hit;
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        total += Math.abs((Number(b?.x) || 0) - (Number(a?.x) || 0)) +
            Math.abs((Number(b?.y) || 0) - (Number(a?.y) || 0));
    }
    _manhattanLenCache.set(points, total);
    return total;
}
