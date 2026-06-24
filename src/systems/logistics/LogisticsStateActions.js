export class LogisticsStateActions {
    static cloneValue(value) {
        if (value === undefined) return undefined;
        if (value === null) return null;
        return JSON.parse(JSON.stringify(value));
    }

    static replaceLogisticsLines(state, lines) {
        if (!state) return [];
        state.logisticsLines = this.cloneValue(Array.isArray(lines) ? lines : []);
        return state.logisticsLines;
    }

    static setSelectedLogistics(state, selection = {}) {
        if (!state) return;
        state.selectedLogisticsLineId = selection.lineId ?? null;
        state.selectedLogisticsGroupId = selection.groupId ?? null;
        state.selectedLogisticsClickX = selection.clickX ?? null;
        state.selectedLogisticsClickY = selection.clickY ?? null;
    }

    static upsertTurnArrowOverride(state, override) {
        if (!state || !override) return [];
        if (!Array.isArray(state.logisticsTurnArrowOverrides)) {
            state.logisticsTurnArrowOverrides = [];
        }
        const nextOverride = this.cloneValue(override);
        const overrideKey = nextOverride.overrideKey ||
            `${nextOverride.groupId || "line"}:${nextOverride.cellKey || ""}`;
        nextOverride.overrideKey = overrideKey;
        const index = state.logisticsTurnArrowOverrides.findIndex(item => item?.overrideKey === overrideKey);
        if (index >= 0) {
            state.logisticsTurnArrowOverrides[index] = nextOverride;
        } else {
            state.logisticsTurnArrowOverrides.push(nextOverride);
        }
        return state.logisticsTurnArrowOverrides;
    }

    static removeTurnArrowOverride(state, predicate) {
        if (!state || !Array.isArray(state.logisticsTurnArrowOverrides)) return [];
        const shouldRemove = typeof predicate === "function"
            ? predicate
            : () => false;
        state.logisticsTurnArrowOverrides = state.logisticsTurnArrowOverrides.filter(item => !shouldRemove(item));
        return state.logisticsTurnArrowOverrides;
    }

    static clearSelectedLogisticsIfMatches(state, match = {}) {
        if (!state) return false;
        const lineMatches = !!match.lineId && state.selectedLogisticsLineId === match.lineId;
        const groupMatches = !!match.groupId && state.selectedLogisticsGroupId === match.groupId;
        if (!lineMatches && !groupMatches) return false;
        this.setSelectedLogistics(state, {});
        return true;
    }
}
