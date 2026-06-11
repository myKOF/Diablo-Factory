export class LogisticsUndoStore {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    cloneValue(value) {
        if (value === undefined) return undefined;
        if (value === null) return null;
        return JSON.parse(JSON.stringify(value));
    }

    getTransferItemType(transfer) {
        const rawType = transfer?.itemType || transfer?.type || transfer?.resourceType || transfer?.filter || null;
        return rawType ? String(rawType).trim().toLowerCase() : null;
    }

    getEntityCapacity(entity, keys) {
        for (const key of keys) {
            const value = Number(entity?.[key]);
            if (Number.isFinite(value) && value >= 0) return value;
        }
        return Infinity;
    }

    getStoredTotal(store) {
        if (!store || typeof store !== 'object') return 0;
        return Object.values(store).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    }

    getLineGroupId(line) {
        return line?.groupId || line?.id || null;
    }

    getPointSignature(point) {
        if (!point) return 'null';
        const x = Number.isFinite(Number(point.x)) ? Math.round(Number(point.x) * 100) / 100 : 'x';
        const y = Number.isFinite(Number(point.y)) ? Math.round(Number(point.y) * 100) / 100 : 'y';
        return `${x},${y}`;
    }

    getLineSignature(line) {
        const points = Array.isArray(line?.routePoints)
            ? line.routePoints.map(point => this.getPointSignature(point)).join('>')
            : `${this.getPointSignature({ x: line?.x, y: line?.y })}`;
        return [
            line?.id || '',
            this.getLineGroupId(line) || '',
            line?.sourceId || '',
            line?.targetId || '',
            Number.isFinite(Number(line?.routeWidth)) ? Number(line.routeWidth) : '',
            Number.isFinite(Number(line?.order)) ? Number(line.order) : '',
            Number.isFinite(Number(line?.splitSequenceOrder)) ? Number(line.splitSequenceOrder) : '',
            points
        ].join('|');
    }

    getGroupSignatures(lines) {
        const signatures = new Map();
        (lines || []).forEach(line => {
            const groupId = this.getLineGroupId(line);
            if (!groupId) return;
            if (!signatures.has(groupId)) signatures.set(groupId, []);
            signatures.get(groupId).push(this.getLineSignature(line));
        });
        signatures.forEach((items, groupId) => {
            signatures.set(groupId, items.sort().join('||'));
        });
        return signatures;
    }

    getChangedLogisticsGroupIds(beforeLines, afterLines) {
        const before = this.getGroupSignatures(beforeLines);
        const after = this.getGroupSignatures(afterLines);
        const changed = new Set();
        before.forEach((signature, groupId) => {
            if ((before.get(groupId) || '') !== (after.get(groupId) || '')) changed.add(groupId);
        });
        return changed;
    }

    getPathTotalLength(points) {
        if (!Array.isArray(points) || points.length < 2) return 0;
        let total = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            if (!a || !b) continue;
            total += Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
        }
        return total;
    }

    getPointOnPathProgress(points, progress) {
        if (!Array.isArray(points) || points.length === 0) return null;
        if (points.length === 1) return { x: points[0].x || 0, y: points[0].y || 0 };

        const total = this.getPathTotalLength(points);
        if (total <= 0) return { x: points[0].x || 0, y: points[0].y || 0 };

        let remaining = Math.max(0, Math.min(1, Number(progress) || 0)) * total;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            if (!a || !b) continue;
            const ax = Number(a.x) || 0;
            const ay = Number(a.y) || 0;
            const bx = Number(b.x) || 0;
            const by = Number(b.y) || 0;
            const length = Math.hypot(bx - ax, by - ay);
            if (length <= 0) continue;
            if (remaining <= length) {
                const ratio = remaining / length;
                return {
                    x: ax + (bx - ax) * ratio,
                    y: ay + (by - ay) * ratio
                };
            }
            remaining -= length;
        }

        const last = points[points.length - 1];
        return { x: last.x || 0, y: last.y || 0 };
    }

    getDistanceToSegment(point, a, b) {
        if (!point || !a || !b) return Infinity;
        const px = Number(point.x) || 0;
        const py = Number(point.y) || 0;
        const ax = Number(a.x) || 0;
        const ay = Number(a.y) || 0;
        const bx = Number(b.x) || 0;
        const by = Number(b.y) || 0;
        const dx = bx - ax;
        const dy = by - ay;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq <= 0) return Math.hypot(px - ax, py - ay);
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
        return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    }

    getDistanceToLineRoute(point, line) {
        const points = Array.isArray(line?.routePoints) && line.routePoints.length >= 2
            ? line.routePoints
            : [{ x: line?.x, y: line?.y }, { x: line?.x, y: line?.y }];
        let best = Infinity;
        for (let i = 0; i < points.length - 1; i++) {
            best = Math.min(best, this.getDistanceToSegment(point, points[i], points[i + 1]));
        }
        return best;
    }

    isTransferStillOnRestoredLine(transfer, lines) {
        if (!transfer || !Array.isArray(lines) || lines.length === 0) return false;
        if (!Array.isArray(transfer.routePoints) || transfer.routePoints.length < 2) return false;

        const position = this.getPointOnPathProgress(transfer.routePoints, transfer.progress);
        if (!position) return false;

        const tileSize = this.gameEngine?.TILE_SIZE || 20;
        const tolerance = tileSize * 0.35;
        return lines.some(line => this.getDistanceToLineRoute(position, line) <= tolerance);
    }

    returnTransferToSource(transfer, entities, getEntityId) {
        const sourceId = transfer?.sourceId || null;
        const itemType = this.getTransferItemType(transfer);
        if (!sourceId || !itemType) return false;

        const source = entities.find(ent => sourceId && getEntityId(ent) === sourceId) || null;
        if (!source) return false;

        const amount = Math.max(1, Math.floor(Number(transfer.amount ?? transfer.quantity ?? 1) || 1));
        const isStorageSource = !!source.storage || ['warehouse', 'storehouse', 'barn', 'town_center', 'village'].includes(source.type1);
        const storeKey = isStorageSource ? 'storage' : 'outputBuffer';
        const capacityKeys = isStorageSource
            ? ['storageCapacity', 'capacity']
            : ['outputCapacity', 'bufferCapacity', 'storageCapacity', 'capacity'];

        if (!source[storeKey]) source[storeKey] = {};
        const capacity = this.getEntityCapacity(source, capacityKeys);
        if (this.getStoredTotal(source[storeKey]) + amount > capacity) return false;

        source[storeKey][itemType] = (source[storeKey][itemType] || 0) + amount;
        return true;
    }

    cleanupInvalidActiveTransfers(state, entities, getEntityId, changedGroupIds = null) {
        if (!Array.isArray(state.activeTransfers) || state.activeTransfers.length === 0) return;

        const validGroupIds = new Set();
        const linesByGroupId = new Map();
        (state.logisticsLines || []).forEach(line => {
            if (!line) return;
            const groupId = this.getLineGroupId(line);
            if (groupId) {
                validGroupIds.add(groupId);
                if (!linesByGroupId.has(groupId)) linesByGroupId.set(groupId, []);
                linesByGroupId.get(groupId).push(line);
            }
            if (line.id) validGroupIds.add(line.id);
        });

        state.activeTransfers = state.activeTransfers.filter(transfer => {
            const lineId = transfer?.lineId || null;
            if (!lineId) return true;
            if (changedGroupIds?.has(lineId)) {
                if (this.isTransferStillOnRestoredLine(transfer, linesByGroupId.get(lineId) || [])) return true;
                this.returnTransferToSource(transfer, entities, getEntityId);
                return false;
            }
            if (validGroupIds.has(lineId)) return true;
            this.returnTransferToSource(transfer, entities, getEntityId);
            return false;
        });
    }

    capture(state) {
        const ui = window.UIManager || null;
        const getEntityId = (ent) => {
            if (!ent) return null;
            if (ui && typeof ui.getEntityId === 'function') return ui.getEntityId(ent);
            return ent.id || null;
        };
        const activeLine = ui?.activeLogisticsLine || null;
        const activeConnection = ui?.activeLogisticsConnection || null;
        return {
            logisticsLines: this.cloneValue(state.logisticsLines || []),
            logisticsMergeNodes: this.cloneValue(state.logisticsMergeNodes || []),
            logisticsTurnArrowOverrides: this.cloneValue(state.logisticsTurnArrowOverrides || []),
            resources: this.cloneValue(state.resources || {}),
            selectedLogisticsLineId: state.selectedLogisticsLineId || null,
            selectedLogisticsGroupId: state.selectedLogisticsGroupId || null,
            selectedLogisticsClickX: state.selectedLogisticsClickX ?? null,
            selectedLogisticsClickY: state.selectedLogisticsClickY ?? null,
            activeLogisticsLineKey: activeLine ? (this.system.getLogisticsLineSelectionKey(activeLine) || activeLine.id || null) : null,
            activeLogisticsConnection: activeConnection ? {
                sourceId: getEntityId(activeConnection.source),
                targetId: activeConnection.targetId ?? null,
                lineId: activeConnection.lineId ?? null,
                groupId: activeConnection.groupId ?? null
            } : null,
            mapEntityOutputTargets: (state.mapEntities || []).map((ent, index) => ({
                index,
                id: getEntityId(ent),
                hadOutputTargets: Object.prototype.hasOwnProperty.call(ent, 'outputTargets'),
                outputTargets: this.cloneValue(ent?.outputTargets || [])
            }))
        };
    }

    record(snapshot, state) {
        const entry = snapshot || this.capture(state);
        if (!entry) return false;
        this.system.logisticsBuildUndoStack.push(entry);
        while (this.system.logisticsBuildUndoStack.length > this.system.maxLogisticsBuildUndoSteps) {
            this.system.logisticsBuildUndoStack.shift();
        }
        return true;
    }

    restore(snapshot, state) {
        if (!snapshot || !state) return false;
        const ui = window.UIManager || null;
        const getEntityId = (ent) => {
            if (!ent) return null;
            if (ui && typeof ui.getEntityId === 'function') return ui.getEntityId(ent);
            return ent.id || null;
        };

        const previousLogisticsLines = this.cloneValue(state.logisticsLines || []);
        const restoredLogisticsLines = this.cloneValue(snapshot.logisticsLines || []);
        const changedGroupIds = this.getChangedLogisticsGroupIds(previousLogisticsLines, restoredLogisticsLines);

        state.logisticsLines = restoredLogisticsLines;
        state.logisticsMergeNodes = this.cloneValue(snapshot.logisticsMergeNodes || []);
        state.logisticsTurnArrowOverrides = this.cloneValue(snapshot.logisticsTurnArrowOverrides || []);
        state.resources = this.cloneValue(snapshot.resources || {});
        state.selectedLogisticsLineId = snapshot.selectedLogisticsLineId || null;
        state.selectedLogisticsGroupId = snapshot.selectedLogisticsGroupId || null;
        state.selectedLogisticsClickX = snapshot.selectedLogisticsClickX ?? null;
        state.selectedLogisticsClickY = snapshot.selectedLogisticsClickY ?? null;

        const entities = Array.isArray(state.mapEntities) ? state.mapEntities : [];
        (snapshot.mapEntityOutputTargets || []).forEach(saved => {
            const ent = entities.find(item => saved.id && getEntityId(item) === saved.id) || entities[saved.index] || null;
            if (!ent) return;
            if (saved.hadOutputTargets) {
                ent.outputTargets = this.cloneValue(saved.outputTargets || []);
            } else {
                delete ent.outputTargets;
            }
        });
        this.cleanupInvalidActiveTransfers(state, entities, getEntityId, changedGroupIds);

        if (ui) {
            ui.activeLogisticsLine = snapshot.activeLogisticsLineKey
                ? this.system.getLogisticsLineById(snapshot.activeLogisticsLineKey)
                : null;
            const active = snapshot.activeLogisticsConnection || null;
            if (active) {
                const source = entities.find(ent => active.sourceId && getEntityId(ent) === active.sourceId) || null;
                const outputTargets = Array.isArray(source?.outputTargets) ? source.outputTargets : [];
                const conn = outputTargets.find(item =>
                    item &&
                    ((active.lineId && item.lineId === active.lineId) ||
                        (active.groupId && item.lineId === active.groupId) ||
                        (active.targetId && item.id === active.targetId))
                ) || null;
                ui.activeLogisticsConnection = {
                    source,
                    targetId: active.targetId,
                    lineId: active.lineId,
                    groupId: active.groupId,
                    conn
                };
            } else {
                ui.activeLogisticsConnection = null;
            }
        }

        this.system.rebuildSpatialHashGrid();
        return true;
    }

    undoLast(state) {
        if (this.system.activeDrag) return false;
        const snapshot = this.system.logisticsBuildUndoStack.pop();
        if (!snapshot) return false;
        const restored = this.restore(snapshot, state);
        if (restored) {
            this.gameEngine.addLog(`[物流] 已復原上一筆物流線建造。`, 'LOGISTICS');
        }
        return restored;
    }
}
