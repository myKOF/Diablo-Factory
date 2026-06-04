import { GameEngine } from '../game_systems.js';

export class LogisticsTopologyQuery {
    constructor(system) {
        this.system = system;
    }

    areLogisticsGroupsLinkedByMergeNode(groupA, groupB, state = GameEngine.state) {
        if (!groupA || !groupB || groupA === groupB) return false;
        return this.system.ensureLogisticsMergeNodeStore(state).some(node => {
            if (!node || !Array.isArray(node.inputGroupIds) || !node.outputGroupId) return false;
            const aInputs = node.inputGroupIds.includes(groupA);
            const bInputs = node.inputGroupIds.includes(groupB);
            return (node.outputGroupId === groupA && bInputs) ||
                (node.outputGroupId === groupB && aInputs) ||
                (aInputs && bInputs);
        });
    }

    areLogisticsGroupsInSameMergeComponent(groupA, groupB, state = GameEngine.state) {
        if (!groupA || !groupB || groupA === groupB) return false;
        return this.system.getLogisticsMergeConnectedGroupIds(groupA, state).has(groupB);
    }

    getLogisticsGroupsConnectedThroughMergeNodes(baseConnectedGroupIds, state = GameEngine.state) {
        const connected = new Set(baseConnectedGroupIds || []);
        let changed = true;
        while (changed) {
            changed = false;
            this.system.ensureLogisticsMergeNodeStore(state).forEach(node => {
                if (!node || !node.outputGroupId || !Array.isArray(node.inputGroupIds)) return;
                if (!connected.has(node.outputGroupId)) return;
                node.inputGroupIds.forEach(inputGroupId => {
                    if (!inputGroupId || connected.has(inputGroupId)) return;
                    if (!this.system.isLogisticsMergeNodeInputConnectionIntact(node, inputGroupId, state)) return;
                    connected.add(inputGroupId);
                    changed = true;
                });
            });
        }
        return connected;
    }

    getLogisticsPhysicalGroupGraph(state = GameEngine.state) {
        const groupIds = [...new Set(this.system.getLogisticsLinesForState(state)
            .map(line => line?.groupId || line?.id || null)
            .filter(Boolean))];
        const adjacency = new Map(groupIds.map(groupId => [groupId, new Set()]));

        for (let i = 0; i < groupIds.length; i++) {
            for (let j = i + 1; j < groupIds.length; j++) {
                const a = groupIds[i];
                const b = groupIds[j];
                if (!this.system.areLogisticsGroupsTouching(a, b)) continue;
                adjacency.get(a).add(b);
                adjacency.get(b).add(a);
            }
        }

        return { groupIds, adjacency };
    }

    getLogisticsPhysicalGroupComponents(state = GameEngine.state) {
        const { groupIds, adjacency } = this.getLogisticsPhysicalGroupGraph(state);
        const visited = new Set();
        const components = [];
        groupIds.forEach(groupId => {
            if (visited.has(groupId)) return;
            const queue = [groupId];
            const members = new Set([groupId]);
            visited.add(groupId);
            while (queue.length > 0) {
                const current = queue.shift();
                (adjacency.get(current) || new Set()).forEach(next => {
                    if (visited.has(next)) return;
                    visited.add(next);
                    members.add(next);
                    queue.push(next);
                });
            }
            components.push(members);
        });
        return components;
    }

    findLogisticsPhysicalGroupPath(startGroupId, endGroupId, state = GameEngine.state) {
        if (!startGroupId || !endGroupId) return null;
        const { adjacency } = this.getLogisticsPhysicalGroupGraph(state);
        if (!adjacency.has(startGroupId) || !adjacency.has(endGroupId)) return null;
        if (startGroupId === endGroupId) return [startGroupId];

        const queue = [startGroupId];
        const visited = new Set([startGroupId]);
        const previous = new Map();
        while (queue.length > 0) {
            const current = queue.shift();
            const nextGroups = adjacency.get(current) || new Set();
            for (const next of nextGroups) {
                if (visited.has(next)) continue;
                visited.add(next);
                previous.set(next, current);
                if (next === endGroupId) {
                    const path = [endGroupId];
                    let step = endGroupId;
                    while (previous.has(step)) {
                        step = previous.get(step);
                        path.push(step);
                    }
                    return path.reverse();
                }
                queue.push(next);
            }
        }
        return null;
    }

    getLogisticsPortConnectedPhysicalGroupIds(state = GameEngine.state) {
        const connected = new Set();
        const lines = this.system.getLogisticsLinesForState(state);
        const groupHasSource = new Set();
        lines.forEach(line => {
            const groupId = line?.groupId || line?.id || null;
            if (groupId && line.sourceId) groupHasSource.add(groupId);
        });

        lines.forEach(line => {
            const targetGroupId = line?.groupId || line?.id || null;
            if (!targetGroupId || !line.targetId) return;
            if (line.sourceId) {
                connected.add(targetGroupId);
                return;
            }

            const sourceGroupId = line.detachedFromGroupId || null;
            if (!sourceGroupId || !this.system.isDeletedGapContinuationLine(line) || !groupHasSource.has(sourceGroupId)) return;
            if (this.system.isLogisticsDetachedDisplayConnectionIntact(targetGroupId, sourceGroupId, line?.detachedAtKey, state)) {
                connected.add(sourceGroupId);
                connected.add(targetGroupId);
                return;
            }
            const path = this.findLogisticsPhysicalGroupPath(sourceGroupId, targetGroupId, state);
            if (!Array.isArray(path) || path.length === 0) return;
            path.forEach(groupId => connected.add(groupId));
        });
        return connected;
    }

    getLogisticsDisplayConnectedGroupIds(baseConnectedGroupIds, state = GameEngine.state) {
        const connected = new Set(baseConnectedGroupIds || []);
        this.getLogisticsPortConnectedPhysicalGroupIds(state).forEach(groupId => connected.add(groupId));
        let changed = true;
        while (changed) {
            changed = false;
            this.getLogisticsGroupsConnectedThroughMergeNodes(connected, state).forEach(groupId => {
                if (!groupId || connected.has(groupId)) return;
                connected.add(groupId);
                changed = true;
            });
            const lines = this.system.getLogisticsLinesForState(state);
            lines.forEach(line => {
                const groupId = line?.groupId || line?.id || null;
                const detachedFromGroupId = line?.detachedFromGroupId || null;
                if (!groupId || !detachedFromGroupId) return;
                if (!this.system.isDeletedGapContinuationLine(line)) return;
                if (!this.system.isLogisticsDetachedDisplayConnectionIntact(groupId, detachedFromGroupId, line?.detachedAtKey, state)) return;
                if (connected.has(groupId) && !connected.has(detachedFromGroupId)) {
                    connected.add(detachedFromGroupId);
                    changed = true;
                }
                if (connected.has(detachedFromGroupId) && !connected.has(groupId)) {
                    connected.add(groupId);
                    changed = true;
                }
            });
        }
        return connected;
    }
}
