export class LogisticsMergeNodeRuntime {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    apply(state = this.gameEngine.state) {
        const nodes = this.system.ensureLogisticsMergeNodeStore(state).filter(node =>
            node && Array.isArray(node.inputGroupIds) && node.inputGroupIds.length > 0 && node.outputGroupId
        );
        if (!nodes.length || !Array.isArray(state?.activeTransfers) || state.activeTransfers.length === 0) return false;
        const TS = this.gameEngine.TILE_SIZE || 20;
        const minTransferSpacing = TS;

        let changed = false;
        const getRouteLength = (route) => {
            if (!Array.isArray(route) || route.length < 2) return 0;
            let total = 0;
            for (let i = 0; i < route.length - 1; i++) {
                const a = route[i];
                const b = route[i + 1];
                if (!a || !b) continue;
                total += Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
            }
            return total;
        };
        const getPathDistanceToPoint = (points, point) => {
            if (!Array.isArray(points) || points.length < 2 || !point) return 0;
            let bestDist = Infinity;
            let bestPathDist = 0;
            let total = 0;
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.hypot(dx, dy);
                const lenSq = dx * dx + dy * dy;
                if (lenSq > 0) {
                    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
                    const proj = { x: a.x + dx * t, y: a.y + dy * t };
                    const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestPathDist = total + len * t;
                    }
                }
                total += len;
            }
            return bestPathDist;
        };
        const isOutputEntryOccupied = (candidate, node) => {
            const outputGroupId = node.outputGroupId;
            const mergePoint = node.point || { x: node.x, y: node.y };
            return state.activeTransfers.some(other => {
                if (!other || other === candidate || other.lineId !== outputGroupId) return false;
                const route = Array.isArray(other.routePoints) ? other.routePoints : [];
                const total = getRouteLength(route);
                if (total <= 0) return false;
                const otherDist = Math.max(0, Math.min(1, Number(other.progress) || 0)) * total;
                const mergeNodeDistInOther = getPathDistanceToPoint(route, mergePoint);
                const distFromMerge = otherDist - mergeNodeDistInOther;
                // [只停不退] 使用相對距離絕對值，確保合流點前後安全間距內無其他物品佔用
                return Math.abs(distFromMerge) < minTransferSpacing - 0.1;
            });
        };
        const stopBeforeMergePoint = (transfer) => {
            const total = getRouteLength(transfer.routePoints);
            if (total <= 0) {
                transfer.progress = 1;
                return;
            }
            const waitDistance = Math.max(0, total - minTransferSpacing);
            transfer.progress = Math.max(0, Math.min(1, waitDistance / total));
        };
        const getMergeAdmissionWinner = (node) => {
            if (!node || !Array.isArray(node.inputGroupIds)) return null;
            const mergePoint = node.point || { x: node.x, y: node.y };
            const key = `${node.outputGroupId || "output"}:${Math.round(mergePoint.x || 0)},${Math.round(mergePoint.y || 0)}`;
            const contendersByLine = new Map();
            state.activeTransfers.forEach(other => {
                if (!other || !node.inputGroupIds.includes(other.lineId)) return;
                if (Number(other.progress) < 0.999) return;
                const route = Array.isArray(other.routePoints) ? other.routePoints : [];
                const total = getRouteLength(route);
                if (total <= 0) return;
                const current = contendersByLine.get(other.lineId);
                const distance = Math.max(0, Math.min(1, Number(other.progress) || 0)) * total;
                if (!current || distance > current.distance || (
                    Math.abs(distance - current.distance) <= 0.1 &&
                    String(other.id || "") < String(current.transfer.id || "")
                )) {
                    contendersByLine.set(other.lineId, { transfer: other, distance });
                }
            });
            const contenders = Array.from(contendersByLine.values())
                .map(item => item.transfer)
                .filter(item => item?.id)
                .sort((a, b) => String(a.id).localeCompare(String(b.id)));
            if (contenders.length <= 1) return contenders[0]?.id || null;
            const signature = contenders.map(item => item.id).join("|");
            if (!state._logisticsMergeAdmissionWinners) state._logisticsMergeAdmissionWinners = {};
            const previous = state._logisticsMergeAdmissionWinners[key];
            if (previous && previous.signature === signature && contenders.some(item => item.id === previous.winnerId)) {
                return previous.winnerId;
            }
            const winner = contenders[Math.floor(Math.random() * contenders.length)];
            state._logisticsMergeAdmissionWinners[key] = { signature, winnerId: winner.id };
            return winner.id;
        };

        const findNodeForTransfer = (transfer) => {
            if (Number(transfer?.progress) < 0.999) return null;
            return this.system.getLogisticsMergeNodeForInputTransfer(transfer, state);
        };

        state.activeTransfers.forEach(transfer => {
            const node = findNodeForTransfer(transfer);
            if (!node) return;
            const route = this.system.getLogisticsMergeNodeOutputRoute(node);
            if (!Array.isArray(route) || route.length < 2) return;
            const winnerId = getMergeAdmissionWinner(node);
            if (winnerId && transfer.id && transfer.id !== winnerId) {
                stopBeforeMergePoint(transfer);
                transfer.queueBlocked = true;
                delete transfer.blockedOnBrokenLine;
                return;
            }
            if (isOutputEntryOccupied(transfer, node)) {
                stopBeforeMergePoint(transfer);
                transfer.queueBlocked = true;
                delete transfer.blockedOnBrokenLine;
                return;
            }
            const outputSeg = this.system.getLogisticsSegmentsByGroupId(node.outputGroupId)[0] || null;
            transfer.lineId = node.outputGroupId;
            transfer.routePoints = route.map(point => ({ x: point.x, y: point.y }));
            transfer.progress = 0;
            transfer.sourceId = outputSeg?.sourceId || transfer.sourceId || null;
            transfer.targetId = outputSeg?.targetId || null;
            transfer.efficiency = Number(outputSeg?.efficiency) || Number(transfer.efficiency) || 0;
            delete transfer.blockedOnBrokenLine;
            delete transfer.queueBlocked;
            changed = true;
        });

        return changed;
    }
}
