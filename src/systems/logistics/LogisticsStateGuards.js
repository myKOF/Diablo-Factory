export function isFinitePoint(point) {
    return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function getArrayField(owner, key) {
    return Array.isArray(owner?.[key]) ? owner[key] : [];
}

export function getLogisticsLines(state) {
    return getArrayField(state, 'logisticsLines');
}

export function getActiveTransfers(state) {
    return getArrayField(state, 'activeTransfers');
}

export function getMapEntities(state) {
    return getArrayField(state, 'mapEntities');
}

export function getRoutePoints(owner) {
    return getArrayField(owner, 'routePoints').filter(isFinitePoint);
}

export function hasUsableRoute(owner) {
    return getRoutePoints(owner).length >= 2;
}
