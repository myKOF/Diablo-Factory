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

        state.logisticsLines = this.cloneValue(snapshot.logisticsLines || []);
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
