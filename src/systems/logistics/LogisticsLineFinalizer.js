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

        // [分叉缺口修補] 中段延伸切分時,新尾段接回主幹的連接段會與「剛 detach 的孤兒分支」在分叉格重疊,
        // 被 placeSegments 當作跨群組重疊而跳過,使輸出群組在分叉格斷成兩截(主幹↛新尾段,相距 1~2 格)。
        // 串接式路由會跳過缺口,但有向圖路由(rerouter / worker)跨不過 → 物品到不了新尾段、走錯路堵死
        // (關 worker 看似正常)。此處於建造收尾偵測群組有序鏈中「正交、共線、1~2.5 格」的缺口並補一段橋接,
        // 還原連通性。正常建造無缺口時為 no-op。
        this.repairLogisticsGroupChainGaps(mergedGroupId);

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

    repairLogisticsGroupChainGaps(mergedGroupId) {
        const state = this.gameEngine.state;
        if (!mergedGroupId || !Array.isArray(state?.logisticsLines)) return;
        const TS = this.gameEngine.TILE_SIZE || 20;
        const groupSegs = () => state.logisticsLines.filter(l => l && (l.groupId === mergedGroupId || l.id === mergedGroupId));
        const segs = groupSegs();
        if (segs.length < 2) return;
        const ordered = this.system.orderLogisticsSegmentsByDirection(segs);
        const cardinalDir = (a, b) => {
            if (!a || !b) return null;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null;
            return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
        };
        const bridges = [];
        for (let i = 0; i < ordered.length - 1; i++) {
            const aPts = Array.isArray(ordered[i]?.routePoints) ? ordered[i].routePoints : [];
            const bPts = Array.isArray(ordered[i + 1]?.routePoints) ? ordered[i + 1].routePoints : [];
            if (aPts.length < 2 || bPts.length < 2) continue;
            const aEnd = aPts[aPts.length - 1];
            const bStart = bPts[0];
            const dx = bStart.x - aEnd.x;
            const dy = bStart.y - aEnd.y;
            const gap = Math.hypot(dx, dy);
            // 僅補「正交、共線(與前段同向)、超過 1 格但不超過約 2.5 格」的缺口,避免誤接分支或遠端
            if (gap <= TS * 0.5 || gap > TS * 2.5) continue;
            if (Math.abs(dx) > 1 && Math.abs(dy) > 1) continue;
            const bridgeDir = cardinalDir(aEnd, bStart);
            const aDir = cardinalDir(aPts[aPts.length - 2], aEnd);
            if (!bridgeDir || !aDir || bridgeDir.x !== aDir.x || bridgeDir.y !== aDir.y) continue;
            const proto = ordered[i];
            const id = `${mergedGroupId}_gapbridge_${Math.round(aEnd.x)}_${Math.round(aEnd.y)}_${Math.round(bStart.x)}_${Math.round(bStart.y)}`;
            if (segs.some(l => l.id === id) || bridges.some(b => b.id === id)) continue;
            bridges.push({
                id,
                groupId: mergedGroupId,
                routePoints: [{ x: aEnd.x, y: aEnd.y }, { x: bStart.x, y: bStart.y }],
                routeWidth: proto.routeWidth || 1,
                efficiency: proto.efficiency || 0,
                lineType: proto.lineType || 'transport_line',
                sourceId: null,
                targetId: null,
                createdAt: Date.now()
            });
        }
        if (bridges.length === 0) return;
        bridges.forEach(b => state.logisticsLines.push(b));
        this.system.orderLogisticsSegmentsByDirection(groupSegs());
    }
}
