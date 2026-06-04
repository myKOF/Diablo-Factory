export class LogisticsLineMergeCoordinator {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    mergeOverlaps(context) {
        const {
            groupId,
            overlapMergeGroupIds,
            blockedOverlapGroupIds,
            allowGroupMerge
        } = context;
        let mergedGroupId = groupId;
        const affectedGroupIds = new Set([groupId]);
        const previousAffectedGroupIds = this.system._affectedLogisticsGroupIds;
        this.system._affectedLogisticsGroupIds = affectedGroupIds;
        try {
            if (allowGroupMerge) {
                overlapMergeGroupIds.forEach(otherGroupId => {
                    if (!otherGroupId || otherGroupId === mergedGroupId) return;
                    if (blockedOverlapGroupIds.has(otherGroupId)) return;
                    if (this.system.areLogisticsGroupsInSameMergeComponent(mergedGroupId, otherGroupId)) return;
                    affectedGroupIds.add(otherGroupId);
                    mergedGroupId = this.mergeGroups(mergedGroupId, otherGroupId) || mergedGroupId;
                    affectedGroupIds.add(mergedGroupId);
                });
                mergedGroupId = this.mergeConnectedGroups(mergedGroupId) || mergedGroupId;
                affectedGroupIds.add(mergedGroupId);
            } else {
                overlapMergeGroupIds.forEach(otherGroupId => {
                    if (otherGroupId) affectedGroupIds.add(otherGroupId);
                });
            }
        } finally {
            this.system._affectedLogisticsGroupIds = previousAffectedGroupIds;
        }
        return { mergedGroupId, affectedGroupIds };
    }

    mergeConnectedGroups(groupId) {
        if (this.system.isProcessingMerge === true) {
            return groupId;
        }

        let activeGroupId = groupId;
        if (!activeGroupId) return null;

        let merged = true;
        while (merged) {
            merged = false;
            const otherGroupIds = [...new Set(this.system.ensureLogisticsLineStore()
                .map(line => line?.groupId || line?.id)
                .filter(id => id && id !== activeGroupId))];

            for (const otherGroupId of otherGroupIds) {
                if (!this.system.areLogisticsGroupsTouching(activeGroupId, otherGroupId)) continue;
                if (this.system.areLogisticsGroupsInSameMergeComponent(activeGroupId, otherGroupId)) continue;
                activeGroupId = this.mergeGroups(activeGroupId, otherGroupId);
                merged = true;
                break;
            }
        }
        return activeGroupId;
    }

    getDeletedGapContinuationRelation(groupAId, groupBId, state = this.gameEngine.state) {
        if (!groupAId || !groupBId || groupAId === groupBId) return null;
        const lines = this.system.getLogisticsLinesForState(state);
        const groupALines = lines.filter(line => line && (line.groupId || line.id) === groupAId);
        const groupBLines = lines.filter(line => line && (line.groupId || line.id) === groupBId);
        const findRelation = (canonicalGroupId, continuationGroupId, continuationLines) => {
            const continuation = continuationLines.filter(line =>
                line?.detachedByDeletedGap === true &&
                line?.detachedFromGroupId === canonicalGroupId
            );
            if (continuation.length === 0) return null;
            return {
                canonicalGroupId,
                continuationGroupId,
                detachKeys: [...new Set(continuation.map(line => line.detachedAtKey).filter(Boolean))]
            };
        };
        return findRelation(groupAId, groupBId, groupBLines) ||
            findRelation(groupBId, groupAId, groupALines);
    }

    reconnectDeletedGapContinuationGroups(groupAId, groupBId, state = this.gameEngine.state) {
        const relation = this.getDeletedGapContinuationRelation(groupAId, groupBId, state);
        if (!relation) return null;
        const { canonicalGroupId, continuationGroupId, detachKeys } = relation;
        const detachKeySet = new Set(detachKeys);
        const mergedGroupId = this.mergeGroups(canonicalGroupId, continuationGroupId) || canonicalGroupId;

        this.system.getLogisticsSegmentsByGroupId(mergedGroupId).forEach(line => {
            if (detachKeySet.has(line?.suppressedOpenEndpointCellKey)) {
                delete line.suppressOpenEndpointCell;
                delete line.suppressedOpenEndpointCellKey;
            }
            if (line?.detachedByDeletedGap === true &&
                (line.detachedFromGroupId === canonicalGroupId || line.detachedFromGroupId === mergedGroupId)) {
                delete line.detachedByDeletedGap;
                delete line.detachedFromGroupId;
                delete line.detachedAtKey;
            }
        });

        const nodes = this.system.ensureLogisticsMergeNodeStore(state);
        nodes.forEach(node => {
            if (!node) return;
            if (node.outputGroupId === continuationGroupId) node.outputGroupId = mergedGroupId;
            if (node.outputGroupId === canonicalGroupId) node.outputGroupId = mergedGroupId;
            if (Array.isArray(node.inputGroupIds)) {
                node.inputGroupIds = [...new Set(node.inputGroupIds
                    .map(id => id === continuationGroupId || id === canonicalGroupId ? mergedGroupId : id)
                    .filter(id => id && id !== node.outputGroupId))];
            }
        });
        state.logisticsMergeNodes = nodes.filter(node =>
            node && node.outputGroupId && Array.isArray(node.inputGroupIds) && node.inputGroupIds.length > 0
        );

        this.system.orderLogisticsSegmentsByDirection(this.system.getLogisticsSegmentsByGroupId(mergedGroupId));
        this.system.recalculateLogisticsGroupEndpoints(mergedGroupId);
        return mergedGroupId;
    }

    mergeGroups(primaryGroupId, secondaryGroupId) {
        if (this.system.isProcessingMerge === true) {
            return primaryGroupId;
        }
        if (!primaryGroupId || !secondaryGroupId || primaryGroupId === secondaryGroupId) return primaryGroupId || secondaryGroupId || null;
        if (this.system.areLogisticsGroupsInSameMergeComponent(primaryGroupId, secondaryGroupId)) return primaryGroupId;
        if (this.system._affectedLogisticsGroupIds) {
            this.system._affectedLogisticsGroupIds.add(primaryGroupId);
            this.system._affectedLogisticsGroupIds.add(secondaryGroupId);
        }
        const lines = this.system.ensureLogisticsLineStore();
        const primaryLines = lines.filter(line => line && (line.groupId === primaryGroupId || line.id === primaryGroupId));
        const secondaryLines = lines.filter(line => line && (line.groupId === secondaryGroupId || line.id === secondaryGroupId));
        if (primaryLines.length === 0 || secondaryLines.length === 0) return primaryGroupId;

        const hasPortPosition = (port) => port && Number.isFinite(port.x) && Number.isFinite(port.y);
        const primaryMeta = primaryLines.find(line => line && (line.sourceId || line.targetId || line.sourcePort || line.targetPort)) || primaryLines[0];
        const secondaryMeta = secondaryLines.find(line => line && (line.sourceId || line.targetId || line.sourcePort || line.targetPort)) || secondaryLines[0];
        let canonicalSourceId = primaryMeta?.sourceId || secondaryMeta?.sourceId || null;
        let canonicalTargetId = primaryMeta?.targetId || secondaryMeta?.targetId || null;
        let canonicalSourcePort = [primaryMeta?.sourcePort, secondaryMeta?.sourcePort].find(hasPortPosition) || null;
        let canonicalTargetPort = [primaryMeta?.targetPort, secondaryMeta?.targetPort].find(hasPortPosition) || null;
        let filter = primaryMeta?.filter || secondaryMeta?.filter || null;

        (this.gameEngine.state.mapEntities || []).forEach(ent => {
            if (!Array.isArray(ent.outputTargets)) return;
            const sourceId = window.UIManager.getEntityId(ent);
            ent.outputTargets.forEach(conn => {
                if (!conn) return;
                if (conn.lineId !== primaryGroupId && conn.lineId !== secondaryGroupId) return;
                conn.lineId = primaryGroupId;
                canonicalSourceId = sourceId || canonicalSourceId;
                canonicalTargetId = conn.id || canonicalTargetId;
                canonicalSourcePort = hasPortPosition(conn.sourcePort) ? conn.sourcePort : canonicalSourcePort;
                canonicalTargetPort = hasPortPosition(conn.targetPort) ? conn.targetPort : canonicalTargetPort;
                filter = conn.filter || filter;
            });
        });

        [...primaryLines, ...secondaryLines].forEach(line => {
            line.groupId = primaryGroupId;
            if (canonicalSourceId) line.sourceId = canonicalSourceId;
            if (canonicalTargetId) line.targetId = canonicalTargetId;
            if (hasPortPosition(canonicalSourcePort)) line.sourcePort = canonicalSourcePort;
            if (hasPortPosition(canonicalTargetPort)) line.targetPort = canonicalTargetPort;
            if (filter) line.filter = filter;
        });

        const allMergedSegs = lines.filter(line => line && line.groupId === primaryGroupId);
        if (allMergedSegs.length > 0) {
            this.system.orderLogisticsSegmentsByDirection(allMergedSegs);
        }

        if (this.gameEngine.state.selectedLogisticsGroupId === secondaryGroupId) {
            this.gameEngine.state.selectedLogisticsGroupId = primaryGroupId;
        }
        this.system.recalculateLogisticsGroupEndpoints(primaryGroupId);
        return primaryGroupId;
    }
}
