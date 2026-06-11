export class LogisticsMergeNodeRuntime {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    getRouteLength(route) {
        if (!Array.isArray(route) || route.length < 2) return 0;
        let total = 0;
        for (let i = 0; i < route.length - 1; i++) {
            const a = route[i];
            const b = route[i + 1];
            if (!a || !b) continue;
            total += Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
        }
        return total;
    }

    getCardinalDirection(from, to) {
        if (this.system && typeof this.system.getCardinalDirection === 'function') {
            return this.system.getCardinalDirection(from, to);
        }
        if (!from || !to) return null;
        const dx = (to.x || 0) - (from.x || 0);
        const dy = (to.y || 0) - (from.y || 0);
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
        return Math.abs(dx) >= Math.abs(dy)
            ? { x: Math.sign(dx) || 1, y: 0 }
            : { x: 0, y: Math.sign(dy) || 1 };
    }

    getMergeNodeKey(node) {
        const mergePoint = node?.point || { x: node?.x, y: node?.y };
        return `${node?.outputGroupId || "output"}:${Math.round(mergePoint?.x || 0)},${Math.round(mergePoint?.y || 0)}`;
    }

    ensureNodeSchedulerState(node) {
        if (!node || !Array.isArray(node.inputGroupIds) || node.inputGroupIds.length === 0) return;
        const totalSlots = node.inputGroupIds.length;
        if (!Number.isInteger(node.currentActiveSlot)) {
            node.currentActiveSlot = Number.isInteger(node.roundRobinIndex) ? node.roundRobinIndex : 0;
        }
        node.currentActiveSlot = ((node.currentActiveSlot % totalSlots) + totalSlots) % totalSlots;
        node.roundRobinIndex = node.currentActiveSlot;
    }

    hasStartedRoundRobin(node) {
        if (!node) return false;
        if (node.hasCommittedAdmission === true) return true;
        if (Number.isInteger(node.admissionCommitCount) && node.admissionCommitCount > 0) return true;
        return Number.isInteger(node.currentActiveSlot) && node.currentActiveSlot !== 0;
    }

    compareReadySlots(a, b) {
        const distanceDelta = (b?.distance || 0) - (a?.distance || 0);
        if (Math.abs(distanceDelta) > 0.1) return distanceDelta;
        const serialA = Number(a?.transfer?.serialNumber);
        const serialB = Number(b?.transfer?.serialNumber);
        if (Number.isFinite(serialA) && Number.isFinite(serialB) && serialA !== serialB) {
            return serialA - serialB;
        }
        if (Number.isFinite(serialA) !== Number.isFinite(serialB)) {
            return Number.isFinite(serialA) ? -1 : 1;
        }
        return String(a?.transfer?.id || "").localeCompare(String(b?.transfer?.id || ""));
    }

    getReadyInputSlots(node, state, readyDistanceFromEnd) {
        const slots = new Map();
        if (!node || !Array.isArray(node.inputGroupIds) || !Array.isArray(state?.activeTransfers)) return slots;
        state.activeTransfers.forEach(transfer => {
            if (!transfer || !node.inputGroupIds.includes(transfer.lineId)) return;
            const route = Array.isArray(transfer.routePoints) ? transfer.routePoints : [];
            const total = this.getRouteLength(route);
            if (total <= 0) return;
            const distance = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * total;
            if (distance < total - readyDistanceFromEnd - 0.1) return;
            const current = slots.get(transfer.lineId);
            if (!current || distance > current.distance || (
                Math.abs(distance - current.distance) <= 0.1 &&
                String(transfer.id || "") < String(current.transfer.id || "")
            )) {
                const slotIndex = node.inputGroupIds.indexOf(transfer.lineId);
                slots.set(transfer.lineId, { transfer, distance, total, slotIndex });
            }
        });
        return slots;
    }

    selectReadyInputSlot(node, slots) {
        this.ensureNodeSchedulerState(node);
        const inputGroupIds = Array.isArray(node?.inputGroupIds) ? node.inputGroupIds : [];
        if (inputGroupIds.length === 0 || slots.size === 0) return null;

        if (!this.hasStartedRoundRobin(node)) {
            return Array.from(slots.values()).sort((a, b) => this.compareReadySlots(a, b))[0] || null;
        }

        const start = Number.isInteger(node.currentActiveSlot) ? node.currentActiveSlot : 0;
        for (let attempt = 0; attempt < inputGroupIds.length; attempt++) {
            const slotIndex = (start + attempt) % inputGroupIds.length;
            const candidate = slots.get(inputGroupIds[slotIndex]);
            if (candidate) return candidate;
        }
        return null;
    }

    getLogisticsMergeAdmissionWinner(node, state = this.gameEngine.state, options = {}) {
        if (!node || !Array.isArray(node.inputGroupIds) || node.inputGroupIds.length === 0) return null;
        const spacing = Number.isFinite(options.spacing) ? options.spacing : (this.gameEngine.TILE_SIZE || 20);
        const readyDistanceFromEnd = Number.isFinite(options.readyDistanceFromEnd)
            ? options.readyDistanceFromEnd
            : spacing;
        const slots = this.getReadyInputSlots(node, state, readyDistanceFromEnd);
        const signature = node.inputGroupIds
            .map(groupId => slots.get(groupId)?.transfer?.id || "")
            .join("|");
        const key = this.getMergeNodeKey(node);
        if (!state._logisticsMergeAdmissionWinners) state._logisticsMergeAdmissionWinners = {};
        const previous = state._logisticsMergeAdmissionWinners[key];
        const previousSlot = previous?.winnerId
            ? Array.from(slots.values()).find(slot => slot?.transfer?.id === previous.winnerId)
            : null;
        if (previous && previous.winnerId) {
            const currentWinnerTransfer = state.activeTransfers.find(t => t && t.id === previous.winnerId);
            if (currentWinnerTransfer && previousSlot) {
                const total = this.getRouteLength(currentWinnerTransfer.routePoints);
                const currentDist = (currentWinnerTransfer.progress || 0) * total;
                const holdDistance = Math.max(0, total - readyDistanceFromEnd - 0.1);
                // [Winner 承諾保護] 僅保護仍符合本次 ready 門檻的 winner；避免等待線上的舊 winner 卡住已到達合流點的物品。
                if (total > 0 && currentDist >= holdDistance) {
                    return previous.winnerId;
                }
            }
        }
        if (previous && previous.signature === signature && previous.winnerId && previousSlot) {
            return previous.winnerId;
        }

        const winnerSlot = this.selectReadyInputSlot(node, slots);
        const winnerId = winnerSlot?.transfer?.id || null;
        state._logisticsMergeAdmissionWinners[key] = {
            signature,
            winnerId,
            winnerSlotIndex: Number.isInteger(winnerSlot?.slotIndex) ? winnerSlot.slotIndex : -1,
            committed: false
        };
        return winnerId;
    }

    commitLogisticsMergeAdmission(node, winnerId, state = this.gameEngine.state) {
        if (!node || !winnerId || !Array.isArray(node.inputGroupIds) || node.inputGroupIds.length === 0) return;
        const key = this.getMergeNodeKey(node);
        const previous = state?._logisticsMergeAdmissionWinners?.[key] || null;
        if (previous?.committed === true && previous?.winnerId === winnerId) return;
        const slotIndex = Number.isInteger(previous?.winnerSlotIndex) && previous.winnerSlotIndex >= 0
            ? previous.winnerSlotIndex
            : node.inputGroupIds.findIndex(groupId => {
                return state.activeTransfers?.some(transfer => transfer?.id === winnerId && transfer.lineId === groupId);
            });
        const safeSlotIndex = slotIndex >= 0 ? slotIndex : 0;
        node.currentActiveSlot = (safeSlotIndex + 1) % node.inputGroupIds.length;
        node.roundRobinIndex = node.currentActiveSlot;
        node.hasCommittedAdmission = true;
        node.admissionCommitCount = (Number(node.admissionCommitCount) || 0) + 1;
        if (previous) previous.committed = true;
    }

    apply(state = this.gameEngine.state) {
        const nodes = this.system.ensureLogisticsMergeNodeStore(state).filter(node =>
            node && Array.isArray(node.inputGroupIds) && node.inputGroupIds.length > 0 && node.outputGroupId
        );
        if (!nodes.length || !Array.isArray(state?.activeTransfers) || state.activeTransfers.length === 0) return false;
        const TS = this.gameEngine.TILE_SIZE || 20;
        const minTransferSpacing = TS;

        let changed = false;
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
                const total = this.getRouteLength(route);
                if (total <= 0) return false;
                const otherDist = Math.max(0, Math.min(1, Number(other.progress) || 0)) * total;
                const mergeNodeDistInOther = getPathDistanceToPoint(route, mergePoint);
                const distFromMerge = otherDist - mergeNodeDistInOther;
                // [只停不退] 使用相對距離絕對值，確保合流點前後安全間距內無其他物品佔用
                return Math.abs(distFromMerge) < minTransferSpacing - 0.1;
            });
        };
        const stopBeforeMergePoint = (transfer) => {
            const total = this.getRouteLength(transfer.routePoints);
            if (total <= 0) {
                transfer.progress = 1;
                return;
            }
            const waitDistance = Math.max(0, total - minTransferSpacing);
            transfer.progress = Math.max(0, Math.min(1, waitDistance / total));
        };
        const getMergeAdmissionWinner = (node) => {
            return this.getLogisticsMergeAdmissionWinner(node, state, {
                spacing: minTransferSpacing,
                readyDistanceFromEnd: 0.1
            });
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
            const inputRoute = Array.isArray(transfer.routePoints) ? transfer.routePoints : [];
            const mergePoint = node.point || { x: node.x, y: node.y };
            const inputDir = inputRoute.length >= 2
                ? this.getCardinalDirection(inputRoute[inputRoute.length - 2], inputRoute[inputRoute.length - 1])
                : null;
            const outputDir = node.outputDir || (Array.isArray(route) && route.length >= 2
                ? this.getCardinalDirection(route[0], route[1])
                : null);
            this.commitLogisticsMergeAdmission(node, transfer.id, state);
            transfer.lineId = node.outputGroupId;
            transfer.routePoints = route.map(point => ({ x: point.x, y: point.y }));
            transfer.progress = 0;
            transfer.sourceId = outputSeg?.sourceId || transfer.sourceId || null;
            transfer.targetId = outputSeg?.targetId || null;
            transfer.efficiency = Number(outputSeg?.efficiency) || Number(transfer.efficiency) || 0;
            if (mergePoint && inputDir && outputDir) {
                transfer._mergeVisualTurn = {
                    x: mergePoint.x,
                    y: mergePoint.y,
                    inDir: { x: inputDir.x, y: inputDir.y },
                    outDir: { x: outputDir.x, y: outputDir.y }
                };
            } else {
                delete transfer._mergeVisualTurn;
            }
            delete transfer.blockedOnBrokenLine;
            delete transfer.queueBlocked;
            changed = true;
        });

        return changed;
    }
}
