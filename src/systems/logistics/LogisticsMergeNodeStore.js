import { GameEngine } from '../game_systems.js';

export class LogisticsMergeNodeStore {
    constructor(system) {
        this.system = system;
    }

    getMergeDirectionTolerance() {
        return Math.max(1, (GameEngine.TILE_SIZE || 20) * 0.75);
    }

    isPointNear(a, b, tolerance = this.getMergeDirectionTolerance()) {
        return !!a && !!b &&
            Number.isFinite(a.x) &&
            Number.isFinite(a.y) &&
            Number.isFinite(b.x) &&
            Number.isFinite(b.y) &&
            Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
    }

    getCandidateLines(groupId, preferredLine = null) {
        const lines = [];
        if (preferredLine) lines.push(preferredLine);
        this.system.getLogisticsSegmentsByGroupId(groupId).forEach(line => {
            if (line && !lines.includes(line)) lines.push(line);
        });
        return lines;
    }

    canLineEnterMergePoint(line, point) {
        const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
        if (points.length < 2) return false;
        return this.isPointNear(points[points.length - 1], point);
    }

    canLineLeaveMergePoint(line, point) {
        const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
        if (points.length < 2) return false;
        const tolerance = this.getMergeDirectionTolerance();

        for (let i = 0; i < points.length - 1; i++) {
            const start = points[i];
            const end = points[i + 1];
            if (!this.system.isPointOnSegment(point, start, end, tolerance)) continue;

            if (this.isPointNear(point, end, tolerance)) {
                if (i >= points.length - 2) return false;
                return !this.isPointNear(end, points[i + 2], 0.1);
            }

            return !this.isPointNear(point, end, 0.1);
        }

        return false;
    }

    canRegisterMergeDirection({ inputGroupId, outputGroupId, point, inputLine = null, outputLine = null }) {
        const inputLines = this.getCandidateLines(inputGroupId, inputLine);
        const outputLines = this.getCandidateLines(outputGroupId, outputLine);
        if (inputLines.length === 0 || outputLines.length === 0) return false;
        return inputLines.some(line => this.canLineEnterMergePoint(line, point)) &&
            outputLines.some(line => this.canLineLeaveMergePoint(line, point));
    }

    ensureLogisticsMergeNodeStore(state = GameEngine.state) {
        if (!state) return [];
        if (!Array.isArray(state.logisticsMergeNodes)) state.logisticsMergeNodes = [];
        return state.logisticsMergeNodes;
    }

    registerLogisticsMergeNode({ inputGroupId, outputGroupId, point, inputLine = null, outputLine = null }) {
        if (!inputGroupId || !outputGroupId || inputGroupId === outputGroupId || !point) return null;
        const nodes = this.system.ensureLogisticsMergeNodeStore();
        const snapped = this.system.snapPointToGridCenter(point);
        if (!this.canRegisterMergeDirection({ inputGroupId, outputGroupId, point: snapped, inputLine, outputLine })) return null;
        const cellKey = `${Math.round(snapped.x)},${Math.round(snapped.y)}`;
        const edges = new Map();
        const allGroups = new Set();

        nodes.forEach(node => {
            if (node && node.cellKey === cellKey) {
                allGroups.add(node.outputGroupId);
                (node.inputGroupIds || []).forEach(inputId => {
                    edges.set(inputId, node.outputGroupId);
                    allGroups.add(inputId);
                });
            }
        });

        edges.set(inputGroupId, outputGroupId);
        allGroups.add(inputGroupId);
        allGroups.add(outputGroupId);

        const findUltimate = (groupId) => {
            let current = groupId;
            const visited = new Set();
            while (edges.has(current)) {
                if (visited.has(current)) break;
                visited.add(current);
                current = edges.get(current);
            }
            return current;
        };

        const ultimateOutputGroupId = findUltimate(outputGroupId);
        const ultimateInputGroupIds = new Set();
        allGroups.forEach(groupId => {
            if (groupId !== ultimateOutputGroupId) ultimateInputGroupIds.add(groupId);
        });

        const filteredNodes = nodes.filter(node => !node || node.cellKey !== cellKey);
        nodes.length = 0;
        filteredNodes.forEach(node => nodes.push(node));

        const node = {
            id: `merge_${cellKey}_${ultimateOutputGroupId}`,
            nodeId: `merge_${cellKey}_${ultimateOutputGroupId}`,
            type: 'logistics_merge',
            cellKey,
            x: snapped.x,
            y: snapped.y,
            point: { x: snapped.x, y: snapped.y },
            inputGroupIds: [...ultimateInputGroupIds],
            outputGroupId: ultimateOutputGroupId,
            roundRobinIndex: 0
        };
        nodes.push(node);

        const inputDir = this.system.getLogisticsLineDirectionAtPoint(inputLine, snapped);
        const outputDir = this.system.getLogisticsLineDirectionAtPoint(outputLine, snapped);
        if (inputDir) {
            node.inputDirections = node.inputDirections || {};
            node.inputDirections[inputGroupId] = inputDir;
        }
        if (outputDir) node.outputDir = outputDir;

        this.system.getLogisticsSegmentsByGroupId(inputGroupId).forEach(line => this.system.clearSuppressedLogisticsConnectionCell(line, snapped));
        this.system.getLogisticsSegmentsByGroupId(outputGroupId).forEach(line => this.system.clearSuppressedLogisticsConnectionCell(line, snapped));
        this.system.reassignDeletedGapContinuationToMergeInput(inputGroupId, outputGroupId, snapped);
        return node;
    }

    reassignDeletedGapContinuationToMergeInput(inputGroupId, outputGroupId, point) {
        if (!inputGroupId || !outputGroupId || !point) return false;
        const inputHasSource = this.system.getLogisticsSegmentsByGroupId(inputGroupId).some(line => !!line?.sourceId);
        if (!inputHasSource) return false;
        const outputLines = this.system.getLogisticsSegmentsByGroupId(outputGroupId);
        const continuationLines = outputLines.filter(line => line?.detachedByDeletedGap === true && line?.targetId && !line?.sourceId);
        if (continuationLines.length === 0) return false;
        const connectionKey = `${Math.round(point.x)},${Math.round(point.y)}`;
        let changed = false;
        continuationLines.forEach(line => {
            line.detachedFromGroupId = inputGroupId;
            line.detachedAtKey = connectionKey;
            changed = true;
        });
        return changed;
    }

    getLogisticsMergeNodeOutputRoute(node) {
        if (!node?.outputGroupId) return null;
        const point = node.point || { x: node.x, y: node.y };
        const segments = this.system.getLogisticsSegmentsByGroupId(node.outputGroupId);
        if (!segments.length || !point) return null;

        const ordered = this.system.orderLogisticsSegmentsByDirection(segments);
        let startIndex = -1;
        let startPoint = null;
        for (let i = 0; i < ordered.length; i++) {
            const points = Array.isArray(ordered[i]?.routePoints) ? ordered[i].routePoints : [];
            for (let p = 0; p < points.length - 1; p++) {
                if (this.system.isPointOnSegment(point, points[p], points[p + 1], GameEngine.TILE_SIZE * 0.35)) {
                    startIndex = i;
                    startPoint = { x: point.x, y: point.y };
                    break;
                }
            }
            if (startIndex >= 0) break;
        }

        if (startIndex < 0) {
            const fallback = this.system.getLogisticsGroupRoutePoints(node.outputGroupId);
            return Array.isArray(fallback) && fallback.length >= 2 ? fallback : null;
        }

        const route = [];
        const pushPoint = (p) => {
            if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
            const last = route[route.length - 1];
            if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.1) {
                route.push({ x: p.x, y: p.y });
            }
        };

        for (let i = startIndex; i < ordered.length; i++) {
            const points = Array.isArray(ordered[i]?.routePoints) ? ordered[i].routePoints : [];
            if (points.length < 2) continue;
            if (i === startIndex) {
                const segStart = points[0];
                const segEnd = points[points.length - 1];
                const distToStart = Math.hypot(point.x - segStart.x, point.y - segStart.y);
                const distToEnd = Math.hypot(point.x - segEnd.x, point.y - segEnd.y);
                if (distToEnd < 1 && i < ordered.length - 1) {
                    pushPoint(segEnd);
                } else if (distToStart < 1) {
                    points.forEach(pushPoint);
                } else {
                    pushPoint(startPoint);
                    pushPoint(segEnd);
                }
            } else {
                points.forEach(pushPoint);
            }
        }

        if (route.length < 2) return null;
        return route;
    }

    getLogisticsMergeNodeForInputTransfer(transfer, state = GameEngine.state) {
        const lineId = transfer?.lineId || null;
        if (!lineId) return null;
        const route = Array.isArray(transfer.routePoints) ? transfer.routePoints : [];
        const endPoint = route[route.length - 1] || null;
        const TS = GameEngine.TILE_SIZE || 20;
        return this.system.ensureLogisticsMergeNodeStore(state).find(node => {
            if (!node || !Array.isArray(node.inputGroupIds) || !node.inputGroupIds.includes(lineId)) return false;
            if (!node.outputGroupId) return false;
            if (!this.system.isLogisticsMergeNodeInputConnectionIntact(node, lineId, state)) return false;
            const p = node.point || { x: node.x, y: node.y };
            if (!this.canRegisterMergeDirection({
                inputGroupId: lineId,
                outputGroupId: node.outputGroupId,
                point: p
            })) {
                return false;
            }
            if (!endPoint) return true;
            return p && Math.hypot(endPoint.x - p.x, endPoint.y - p.y) <= TS * 0.75;
        }) || null;
    }

    isLogisticsMergeInputTransfer(transfer, state = GameEngine.state) {
        return !!this.getLogisticsMergeNodeForInputTransfer(transfer, state);
    }
}
