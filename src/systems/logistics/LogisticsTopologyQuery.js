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
                const outputConnected = connected.has(node.outputGroupId);
                const connectedInputs = node.inputGroupIds.filter(inputGroupId =>
                    inputGroupId &&
                    connected.has(inputGroupId) &&
                    this.system.isLogisticsMergeNodeInputConnectionIntact(node, inputGroupId, state)
                );
                if (!outputConnected && connectedInputs.length > 0) {
                    connected.add(node.outputGroupId);
                    changed = true;
                }
                if (!outputConnected && connectedInputs.length === 0) return;
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
            if (!sourceGroupId || !groupHasSource.has(sourceGroupId)) return;
            if (this.system.isLogisticsDetachedDisplayConnectionIntact(targetGroupId, sourceGroupId, line?.detachedAtKey, state)) {
                connected.add(sourceGroupId);
                connected.add(targetGroupId);
                return;
            }
            const path = this.findLogisticsPhysicalGroupPath(sourceGroupId, targetGroupId, state);
            if (!Array.isArray(path) || path.length === 0) return;
            path.forEach(groupId => connected.add(groupId));
        });
        this.getLogisticsGroupsPhysicallyTouchingPorts(state).forEach(groupId => connected.add(groupId));
        return connected;
    }

    getLogisticsGroupsPhysicallyTouchingPorts(state = GameEngine.state) {
        const connected = new Set();
        if (!window.UIManager) return connected;
        const TS = GameEngine.TILE_SIZE || 20;
        const groups = new Map();
        this.system.getLogisticsLinesForState(state).forEach(line => {
            const groupId = line?.groupId || line?.id || null;
            if (!groupId) return;
            if (!groups.has(groupId)) groups.set(groupId, []);
            groups.get(groupId).push(line);
        });

        const makePortKey = (port, index) => port
            ? `${port.dir || 'port'}:${port.slotIndex ?? port.defIndex ?? index ?? 0}`
            : null;
        const hasPath = (adj, startKey, endKey) => {
            if (!startKey || !endKey || startKey === endKey) return false;
            const queue = [startKey];
            const visited = new Set([startKey]);
            while (queue.length > 0) {
                const current = queue.shift();
                const nextKeys = adj.get(current) || new Set();
                for (const nextKey of nextKeys) {
                    if (nextKey === endKey) return true;
                    if (visited.has(nextKey)) continue;
                    visited.add(nextKey);
                    queue.push(nextKey);
                }
            }
            return false;
        };
        const buildRouteGraph = (segments) => {
            const nodes = new Map();
            const adj = new Map();
            const addNode = (point) => {
                if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
                const key = `${Math.round(point.x)},${Math.round(point.y)}`;
                if (!nodes.has(key)) nodes.set(key, { x: Math.round(point.x), y: Math.round(point.y) });
                if (!adj.has(key)) adj.set(key, new Set());
                return key;
            };
            const addEdge = (a, b) => {
                if (!a || !b || a === b) return;
                if (!adj.has(a)) adj.set(a, new Set());
                if (!adj.has(b)) adj.set(b, new Set());
                adj.get(a).add(b);
                adj.get(b).add(a);
            };
            segments.forEach(line => {
                const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
                for (let i = 0; i < points.length - 1; i++) {
                    const a = points[i];
                    const b = points[i + 1];
                    if (!a || !b) continue;
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < 0.001) {
                        addNode(a);
                        continue;
                    }
                    const steps = Math.max(1, Math.round(dist / TS));
                    let prevKey = null;
                    for (let step = 0; step <= steps; step++) {
                        const ratio = step / steps;
                        const key = addNode({ x: a.x + dx * ratio, y: a.y + dy * ratio });
                        addEdge(prevKey, key);
                        prevKey = key;
                    }
                }
            });
            return { nodes, adj };
        };
        const getPortOwnersNearGraphEndpoints = (graph, wantOutput) => {
            const owners = [];
            const seen = new Set();
            const endpointNodes = Array.from(graph.nodes.entries()).filter(([key]) => {
                const degree = graph.adj.get(key)?.size || 0;
                return degree > 0 && degree <= 1;
            });
            (state.mapEntities || []).forEach(ent => {
                if (!ent || ent.isUnderConstruction) return;
                const cfg = GameEngine.getEntityConfig(ent.type1);
                if (!cfg?.logistics) return;
                if (wantOutput && !cfg.logistics.canOutput) return;
                if (!wantOutput && !cfg.logistics.canInput) return;
                const entityId = window.UIManager.getEntityId?.(ent) || ent.id || `${ent.type1}_${ent.x}_${ent.y}`;
                const ports = window.UIManager.getBuildingPortSlots?.(ent) || [];
                ports.forEach((port, index) => {
                    if (!port || !Number.isFinite(port.x) || !Number.isFinite(port.y)) return;
                    const touchingNodeKeys = endpointNodes
                        .filter(([, cell]) => Math.hypot(cell.x - port.x, cell.y - port.y) <= TS * 0.75)
                        .map(([nodeKey]) => nodeKey);
                    if (touchingNodeKeys.length === 0) return;
                    const portKey = makePortKey(port, index);
                    const key = `${entityId}:${portKey}:${wantOutput ? 'out' : 'in'}`;
                    if (seen.has(key)) return;
                    seen.add(key);
                    owners.push({ id: entityId, portKey, nodeKeys: touchingNodeKeys });
                });
            });
            return owners;
        };

        groups.forEach((segments, groupId) => {
            const graph = buildRouteGraph(segments);
            if (graph.nodes.size === 0) return;
            const sourceOwners = getPortOwnersNearGraphEndpoints(graph, true);
            if (sourceOwners.length === 0) return;
            const targetOwners = getPortOwnersNearGraphEndpoints(graph, false);
            if (targetOwners.length === 0) return;
            const hasCompletePortPath = sourceOwners.some(source => targetOwners.some(target => {
                if (source.id === target.id) return false;
                return source.nodeKeys.some(sourceKey =>
                    target.nodeKeys.some(targetKey => hasPath(graph.adj, sourceKey, targetKey))
                );
            }));
            if (hasCompletePortPath) connected.add(groupId);
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
