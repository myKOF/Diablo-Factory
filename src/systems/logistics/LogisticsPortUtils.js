export function cloneLogisticsPort(port) {
    if (!port) return null;
    const cloned = {
        dir: port.dir,
        slotIndex: port.slotIndex,
        defIndex: port.defIndex,
        width: Math.max(1, Number(port.width) || 1)
    };
    if (Number.isFinite(port.x)) cloned.x = port.x;
    if (Number.isFinite(port.y)) cloned.y = port.y;
    if (port.sourceType) cloned.sourceType = port.sourceType;
    return cloned;
}

export function hasLogisticsPortPosition(port) {
    return !!port && Number.isFinite(port.x) && Number.isFinite(port.y);
}
