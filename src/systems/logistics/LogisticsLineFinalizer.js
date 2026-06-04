export class LogisticsLineFinalizer {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    finalizeBuild(context) {
        const {
            groupId,
            mergedGroupId,
            affectedGroupIds,
            conn,
            additions,
            segments,
            occupied
        } = context;

        const postBuildSegs = (this.gameEngine.state.logisticsLines || []).filter(
            line => line && (line.groupId === mergedGroupId || line.id === mergedGroupId)
        );
        if (postBuildSegs.length > 0) {
            this.system.orderLogisticsSegmentsByDirection(postBuildSegs);
        }

        if (conn && mergedGroupId !== groupId) {
            conn.lineId = mergedGroupId;
        }
        this.system.recalculateLogisticsGroupEndpoints(mergedGroupId);
        this.system.rebuildSpatialHashGrid();
        this.system.updateActiveTransfersOnLogisticsChange(this.gameEngine.state, affectedGroupIds);
        return additions[additions.length - 1] ||
            segments.map(segment => occupied.get(this.system.getLogisticsSegmentOccupyKey(segment))).filter(Boolean).pop() ||
            this.system.getLogisticsLineById(mergedGroupId) ||
            null;
    }
}
