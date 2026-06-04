export class LogisticsLineStore {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    ensure() {
        const state = this.gameEngine.state;
        if (!Array.isArray(state.logisticsLines)) state.logisticsLines = [];
        return state.logisticsLines;
    }

    getForState(state) {
        return Array.isArray(state?.logisticsLines) ? state.logisticsLines : this.ensure();
    }

    getById(lineId) {
        return this.ensure().find(line =>
            line.id === lineId ||
            line.groupId === lineId ||
            this.system.getLogisticsLineSelectionKey(line) === lineId
        ) || null;
    }

    getSegmentsByGroupId(groupId) {
        return this.ensure()
            .filter(line => line.groupId === groupId || line.id === groupId)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
    }
}
