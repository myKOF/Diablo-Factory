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

    getMergeGateSpacing() {
        // [緊密不重疊] 間距必須等於完整物品長度（一格），確保最密排列時物品邊緣相接而不重疊。
        return Math.max(1, this.gameEngine.TILE_SIZE || 20);
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

    getMergeWaitQueueState(node, state) {
        const key = this.getMergeNodeKey(node);
        if (!state._logisticsMergeWaitQueues) state._logisticsMergeWaitQueues = {};
        if (!state._logisticsMergeWaitQueues[key]) {
            state._logisticsMergeWaitQueues[key] = { queue: [], incomingQueues: {}, lastServed: null, currentOccupant: null };
        }
        const queueState = state._logisticsMergeWaitQueues[key];
        if (!Array.isArray(queueState.queue)) queueState.queue = [];
        if (!queueState.incomingQueues || typeof queueState.incomingQueues !== 'object') queueState.incomingQueues = {};
        if (!node.incomingQueues || typeof node.incomingQueues !== 'object') node.incomingQueues = queueState.incomingQueues;
        queueState.incomingQueues = node.incomingQueues;
        if (node.lastServed === undefined) node.lastServed = queueState.lastServed || null;
        queueState.lastServed = node.lastServed || null;
        if (node.currentOccupant === undefined) node.currentOccupant = queueState.currentOccupant || null;
        queueState.currentOccupant = node.currentOccupant || null;
        return queueState;
    }

    syncMergeWaitQueue(node, state, slots) {
        const queueState = this.getMergeWaitQueueState(node, state);
        const inputGroupIds = Array.isArray(node?.inputGroupIds) ? node.inputGroupIds : [];
        const readyTransferIdsByLine = new Map();
        if (Array.isArray(state?.activeTransfers)) {
            state.activeTransfers.forEach(transfer => {
                if (!transfer?.id || !inputGroupIds.includes(transfer.lineId)) return;
                const slot = slots.get(transfer.lineId);
                if (slot?.transfer?.id === transfer.id) {
                    readyTransferIdsByLine.set(transfer.lineId, transfer.id);
                }
            });
        }

        inputGroupIds.forEach(groupId => {
            const readyId = readyTransferIdsByLine.get(groupId) || null;
            const currentQueue = Array.isArray(queueState.incomingQueues[groupId])
                ? queueState.incomingQueues[groupId]
                : [];
            queueState.incomingQueues[groupId] = currentQueue.filter(id => id === readyId);
            if (readyId && !queueState.incomingQueues[groupId].includes(readyId)) {
                queueState.incomingQueues[groupId].push(readyId);
            }
        });
        Object.keys(queueState.incomingQueues).forEach(groupId => {
            if (!inputGroupIds.includes(groupId)) delete queueState.incomingQueues[groupId];
        });

        queueState.queue = inputGroupIds.flatMap(groupId => queueState.incomingQueues[groupId] || []);
        node.incomingQueues = queueState.incomingQueues;
        return queueState.queue;
    }

    getQueuedAdmissionSlot(node, state, slots) {
        const queueState = this.getMergeWaitQueueState(node, state);
        const key = this.getMergeNodeKey(node);
        const pendingWinner = state?._logisticsMergeAdmissionWinners?.[key];
        this.syncMergeWaitQueue(node, state, slots);
        if (pendingWinner?.committed === false) {
            const pendingSlot = Array.from(slots.values())
                .find(slot => slot?.transfer?.id === pendingWinner.winnerId) || null;
            const pendingAtGate = pendingSlot &&
                Number(pendingSlot.distance) >= Math.max(0, Number(pendingSlot.total) - 0.5);
            if (pendingAtGate) return { winnerId: pendingWinner.winnerId, slot: pendingSlot };
        }
        // [三線輪詢] queue 僅保留除錯/狀態同步用途；實際 winner 由 currentActiveSlot 決定穩定輪替。
        const slot = this.selectReadyInputSlot(node, slots);
        return { winnerId: slot?.transfer?.id || null, slot: slot || null };
    }

    ensureNodeSchedulerState(node) {
        if (!node || !Array.isArray(node.inputGroupIds) || node.inputGroupIds.length === 0) return;
        const totalSlots = this.getMergeParticipantCount(node);
        if (!Number.isInteger(node.currentActiveSlot)) {
            node.currentActiveSlot = Number.isInteger(node.roundRobinIndex) ? node.roundRobinIndex : 0;
        }
        node.currentActiveSlot = ((node.currentActiveSlot % totalSlots) + totalSlots) % totalSlots;
        node.roundRobinIndex = node.currentActiveSlot;
    }

    getMergeParticipantCount(node) {
        const inputCount = Array.isArray(node?.inputGroupIds) ? node.inputGroupIds.length : 0;
        return inputCount + 1;
    }

    getMergeThroughSlotIndex(node) {
        return Array.isArray(node?.inputGroupIds) ? node.inputGroupIds.length : 0;
    }

    hasStartedRoundRobin(node) {
        if (!node) return false;
        if (node.hasCommittedAdmission === true) return true;
        if (Number.isInteger(node.admissionCommitCount) && node.admissionCommitCount > 0) return true;
        return Number.isInteger(node.currentActiveSlot) && node.currentActiveSlot !== 0;
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
        const totalSlots = this.getMergeParticipantCount(node);
        for (let offset = 0; offset < totalSlots; offset++) {
            const index = (node.currentActiveSlot + offset) % totalSlots;
            if (index >= inputGroupIds.length) continue;
            const groupId = inputGroupIds[index];
            const slot = slots.get(groupId);
            if (slot) return slot;
        }
        return null;
    }

    findReadyThroughTransfer(node, state, spacing = this.getMergeGateSpacing()) {
        if (!node?.outputGroupId || !Array.isArray(state?.activeTransfers)) return null;
        const mergePoint = node.point || { x: node.x, y: node.y };
        let best = null;
        state.activeTransfers.forEach(transfer => {
            if (!transfer || transfer.lineId !== node.outputGroupId || transfer._mergeVisualTurn) return;
            const route = Array.isArray(transfer.routePoints) ? transfer.routePoints : [];
            const total = this.getRouteLength(route);
            if (total <= 0) return;
            const mergeDistance = this.getPathDistanceToPoint(route, mergePoint);
            if (mergeDistance <= 0.1) return;
            const distance = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * total;
            if (distance < mergeDistance - spacing - 0.1) return;
            if (distance > mergeDistance + spacing - 0.1) return;
            if (!best || distance > best.distance) {
                best = { transfer, distance, mergeDistance, total };
            }
        });
        return best;
    }

    isThroughSlotDue(node) {
        this.ensureNodeSchedulerState(node);
        return node.currentActiveSlot === this.getMergeThroughSlotIndex(node);
    }

    getLogisticsMergeAdmissionWinner(node, state = this.gameEngine.state, options = {}) {
        if (!node || !Array.isArray(node.inputGroupIds) || node.inputGroupIds.length === 0) return null;
        const spacing = Number.isFinite(options.spacing) ? options.spacing : (this.gameEngine.TILE_SIZE || 20);
        this.releaseClearedMergeOccupant(node, state, spacing);
        const readyDistanceFromEnd = Number.isFinite(options.readyDistanceFromEnd)
            ? options.readyDistanceFromEnd
            : spacing;
        const slots = this.getReadyInputSlots(node, state, readyDistanceFromEnd);
        const signature = node.inputGroupIds
            .map(groupId => slots.get(groupId)?.transfer?.id || "")
            .join("|");
        const key = this.getMergeNodeKey(node);
        if (!state._logisticsMergeAdmissionWinners) state._logisticsMergeAdmissionWinners = {};
        if (this.isThroughSlotDue(node) && this.findReadyThroughTransfer(node, state, spacing)) {
            state._logisticsMergeAdmissionWinners[key] = {
                signature,
                winnerId: null,
                winnerSlotIndex: this.getMergeThroughSlotIndex(node),
                committed: false
            };
            node.zipperTurn = 'main';
            node.awaitingMainPass = true;
            return null;
        }
        const queuedAdmission = this.getQueuedAdmissionSlot(node, state, slots);
        if (queuedAdmission.winnerId) {
            if (node.awaitingMainPass !== true) {
                node.zipperTurn = 'branch';
            }
            state._logisticsMergeAdmissionWinners[key] = {
                signature,
                winnerId: queuedAdmission.winnerId,
                winnerSlotIndex: Number.isInteger(queuedAdmission.slot?.slotIndex) ? queuedAdmission.slot.slotIndex : -1,
                committed: false
            };
            return queuedAdmission.winnerId;
        }

        const previous = state._logisticsMergeAdmissionWinners[key];
        const previousSlot = previous?.winnerId
            ? Array.from(slots.values()).find(slot => slot?.transfer?.id === previous.winnerId)
            : null;
        if (previous && previous.winnerId) {
            const currentWinnerTransfer = state.activeTransfers.find(t => t && t.id === previous.winnerId);
            if (currentWinnerTransfer && previousSlot) {
                const total = this.getRouteLength(currentWinnerTransfer.routePoints);
                const currentDist = (currentWinnerTransfer.progress || 0) * total;
                const holdDistance = Math.max(0, total - 0.5);
                // [Winner 承諾保護] 僅保護已抵達合流門口的 winner；
                // 停在一格等待區內但尚未到門口的舊 winner 不可卡住已抵達合流點的物品。
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
        if (winnerId && node.awaitingMainPass !== true) {
            node.zipperTurn = 'branch';
        }
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
        node.currentActiveSlot = (safeSlotIndex + 1) % this.getMergeParticipantCount(node);
        node.roundRobinIndex = node.currentActiveSlot;
        node.lastServed = node.inputGroupIds[safeSlotIndex] || null;
        node.hasCommittedAdmission = true;
        node.admissionCommitCount = (Number(node.admissionCommitCount) || 0) + 1;
        node.lastAdmittedTransferId = winnerId;
        // [拉鏈式合流] 支線完成插入後，輪次交還主線穿越車
        node.zipperTurn = 'main';
        node.awaitingMainPass = true;
        const queueState = this.getMergeWaitQueueState(node, state);
        queueState.lastServed = node.lastServed;
        queueState.currentOccupant = {
            transferId: winnerId,
            inputGroupId: node.lastServed,
            outputGroupId: node.outputGroupId
        };
        node.currentOccupant = queueState.currentOccupant;
        if (queueState.queue[0] === winnerId) {
            queueState.queue.shift();
        } else {
            queueState.queue = queueState.queue.filter(id => id !== winnerId);
        }
        if (node.lastServed && Array.isArray(queueState.incomingQueues[node.lastServed])) {
            queueState.incomingQueues[node.lastServed] = queueState.incomingQueues[node.lastServed].filter(id => id !== winnerId);
        }
        if (previous) previous.committed = true;
    }

    commitLogisticsMergeThroughAdmission(node, transferId, state = this.gameEngine.state) {
        if (!node || !transferId) return;
        if (node.lastThroughTransferId === transferId) return;
        node.lastThroughTransferId = transferId;
        
        const throughSlotIndex = this.getMergeThroughSlotIndex(node);
        // [三線輪詢修正] 只有在「真正輪到主線」時，才更新 currentActiveSlot 到下一個支線；
        // 如果是插隊通行（awaitingMainPass 觸發），則保留當前的 currentActiveSlot 不予覆寫，
        // 確保剛才支線 commit 時排定好的下一條支線不會被主線車中途篡改。
        if (node.currentActiveSlot === throughSlotIndex) {
            node.currentActiveSlot = (throughSlotIndex + 1) % this.getMergeParticipantCount(node);
            node.roundRobinIndex = node.currentActiveSlot;
        }

        node.lastServed = node.outputGroupId || null;
        node.awaitingMainPass = false;
        node.zipperTurn = 'branch';
        const queueState = this.getMergeWaitQueueState(node, state);
        queueState.lastServed = node.lastServed;
    }

    // [拉鏈式合流] 計算穿越車（已在輸出線上、尚未通過合流點）的讓行上限距離。
    // 輪到支線時，穿越車停在合流點前一格，讓支線物品插入後形成剛好一格間距；
    // 穿越車通過合流點時將輪次交還支線（zipperTurn），達成 1:1 拉鏈互插、主線全程滿載無碎片間隙。
    getMergeThroughYieldLimit(transfer, state = this.gameEngine.state, spacing = this.getMergeGateSpacing()) {
        if (!transfer?.lineId) return Infinity;
        const nodes = this.system.ensureLogisticsMergeNodeStore(state).filter(node =>
            node && node.outputGroupId === transfer.lineId &&
            Array.isArray(node.inputGroupIds) && node.inputGroupIds.length > 0
        );
        if (!nodes.length) return Infinity;
        const route = Array.isArray(transfer.routePoints) ? transfer.routePoints : [];
        const total = this.getRouteLength(route);
        if (total <= 0) return Infinity;
        const distance = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * total;
        let limit = Infinity;
        nodes.forEach(node => {
            const isLastAdmitted = node.lastAdmittedTransferId === transfer.id;
            const mergePoint = node.point || { x: node.x, y: node.y };
            const mergeDistance = this.getPathDistanceToPoint(route, mergePoint);
            const distFromMerge = distance - mergeDistance;
            if (isLastAdmitted && distFromMerge >= -0.1 && distFromMerge < spacing - 0.1) {
                return;
            }
            if (mergeDistance <= 0.1) {
                if (this.isThroughSlotDue(node)) {
                    if (distance < spacing - 0.1) {
                        this.commitLogisticsMergeThroughAdmission(node, transfer.id, state);
                    }
                    return;
                }
                if (node.lastThroughTransferId === transfer.id && distance < spacing - 0.1) return;
                const winnerId = this.getLogisticsMergeAdmissionWinner(node, state, {
                    spacing,
                    readyDistanceFromEnd: spacing
                });
                if (!winnerId) return;
                limit = Math.min(limit, distance);
                return;
            }
            if (distance >= mergeDistance - 0.1) {
                // 正在通過合流點（一格窗口內）：through 也算一次正式放行，納入三方輪替。
                if (distance - mergeDistance < spacing - 0.1) {
                    this.commitLogisticsMergeThroughAdmission(node, transfer.id, state);
                }
                return;
            }
            if (this.isThroughSlotDue(node)) return;
            const winnerId = this.getLogisticsMergeAdmissionWinner(node, state, {
                spacing,
                readyDistanceFromEnd: spacing
            });
            if (!winnerId) return;
            // 僅在「輪到支線」且支線確實有物品就緒等待時讓行；
            // 初次有支線等待時主線需建立讓行意圖，避免滿載主線永久佔優。
            if (node.zipperTurn !== 'branch') {
                if (node.awaitingMainPass === true) return;
                node.zipperTurn = 'branch';
            }
            // [只停不退] 讓行線為合流點前一格；若已越過讓行線則停在原地
            limit = Math.min(limit, Math.max(distance, mergeDistance - spacing));
        });
        return limit;
    }

    getPathDistanceToPoint(points, point) {
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
    }

    releaseClearedMergeOccupant(node, state, spacing) {
        const queueState = this.getMergeWaitQueueState(node, state);
        const occupant = node.currentOccupant || queueState.currentOccupant || null;
        if (!occupant?.transferId) return false;
        const transfer = Array.isArray(state?.activeTransfers)
            ? state.activeTransfers.find(item => item?.id === occupant.transferId)
            : null;
        if (!transfer || transfer.lineId !== node.outputGroupId) {
            node.currentOccupant = null;
            queueState.currentOccupant = null;
            return true;
        }

        const route = Array.isArray(transfer.routePoints) ? transfer.routePoints : [];
        const total = this.getRouteLength(route);
        if (total <= 0) return false;
        const mergePoint = node.point || { x: node.x, y: node.y };
        const currentDistance = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * total;
        const mergeDistance = this.getPathDistanceToPoint(route, mergePoint);
        // 只要物品已越過合流點，立即釋放佔用鎖定；
        // 實際碰撞防護由 getOutputEntryState 的間距檢查承接，
        // 使「門禁等待」與「下一物品接近」時間重疊，消除串聯延遲。
        if (currentDistance >= mergeDistance - 0.1) {
            node.currentOccupant = null;
            queueState.currentOccupant = null;
            return true;
        }
        return false;
    }

    apply(state = this.gameEngine.state) {
        const nodes = this.system.ensureLogisticsMergeNodeStore(state).filter(node =>
            node && Array.isArray(node.inputGroupIds) && node.inputGroupIds.length > 0 && node.outputGroupId
        );
        if (!nodes.length || !Array.isArray(state?.activeTransfers) || state.activeTransfers.length === 0) return false;
        const minTransferSpacing = this.getMergeGateSpacing();
        const admittedNodeKeys = new Set();

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
        const getOutputEntryState = (candidate, node) => {
            this.releaseClearedMergeOccupant(node, state, minTransferSpacing);
            const outputGroupId = node.outputGroupId;
            const mergePoint = node.point || { x: node.x, y: node.y };
            let occupied = false;
            state.activeTransfers.forEach(other => {
                if (!other || other === candidate || other.lineId !== outputGroupId) return;
                const route = Array.isArray(other.routePoints) ? other.routePoints : [];
                const total = this.getRouteLength(route);
                if (total <= 0) return;
                const otherDist = Math.max(0, Math.min(1, Number(other.progress) || 0)) * total;
                const mergeNodeDistInOther = getPathDistanceToPoint(route, mergePoint);
                const distFromMerge = otherDist - mergeNodeDistInOther;
                const followingMainMayOverlapTurn = node.zipperTurn === 'branch' &&
                    node.awaitingMainPass !== true &&
                    distFromMerge < -0.1;
                // [只停不退] 使用相對距離絕對值，確保合流點前後安全間距內無其他物品佔用
                // [轉彎優先窗口] 輪到支線時，位於合流點前方的直行後車不得阻止 winner 過彎；
                // 轉彎期間允許短暫視覺重疊，後車會由主線讓行/排隊邏輯接續跟上。
                if (Math.abs(distFromMerge) < minTransferSpacing - 0.1 && !followingMainMayOverlapTurn) {
                    occupied = true;
                } else if (node.awaitingMainPass === true && node.zipperTurn !== 'branch' &&
                    distFromMerge <= -(minTransferSpacing + 0.1) && distFromMerge > -minTransferSpacing * 3) {
                    // [防碎片視界] 輪到主線時，三格內有逼近中的來車：禁止插到它前面，
                    // 否則留下的小數間隙因同速永遠無法閉合；等它通過後再緊貼其後插入。
                    // 輪到支線（zipperTurn === 'branch'）時來車必停讓行線，插入必然緊密，無需視界。
                    occupied = true;
                }
            });
            return { occupied };
        };
        const stopBeforeMergePoint = (transfer) => {
            const total = this.getRouteLength(transfer.routePoints);
            if (total <= 0) {
                transfer.progress = 1;
                return;
            }
            const current = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * total;
            const waitDistance = Math.max(0, total - minTransferSpacing);
            // [只停不退] 物品只能停止或前進，嚴禁往回推；已越過等待線者停在原地。
            transfer.progress = Math.max(0, Math.min(1, Math.max(waitDistance, Math.min(current, total)) / total));
        };
        const getMergeAdmissionWinner = (node) => {
            return this.getLogisticsMergeAdmissionWinner(node, state, {
                spacing: minTransferSpacing,
                readyDistanceFromEnd: minTransferSpacing
            });
        };

        const findNodeForTransfer = (transfer) => {
            const node = this.system.getLogisticsMergeNodeForInputTransfer(transfer, state);
            if (!node) return null;
            const total = this.getRouteLength(transfer.routePoints);
            if (total <= 0) return node;
            const distance = Math.max(0, Math.min(1, Number(transfer?.progress) || 0)) * total;
            return distance >= total - minTransferSpacing - 0.1 ? node : null;
        };

        state.activeTransfers.forEach(transfer => {
            const node = findNodeForTransfer(transfer);
            if (!node) return;
            const nodeKey = this.getMergeNodeKey(node);
            if (admittedNodeKeys.has(nodeKey)) {
                stopBeforeMergePoint(transfer);
                transfer.queueBlocked = true;
                delete transfer.blockedOnBrokenLine;
                return;
            }
            const route = this.system.getLogisticsMergeNodeOutputRoute(node);
            if (!Array.isArray(route) || route.length < 2) return;
            const winnerId = getMergeAdmissionWinner(node);
            if (winnerId && transfer.id && transfer.id !== winnerId) {
                stopBeforeMergePoint(transfer);
                transfer.queueBlocked = true;
                delete transfer.blockedOnBrokenLine;
                return;
            }
            const outputEntryState = getOutputEntryState(transfer, node);
            if (outputEntryState.occupied) {
                stopBeforeMergePoint(transfer);
                transfer.queueBlocked = true;
                delete transfer.blockedOnBrokenLine;
                return;
            }
            const inputTotal = this.getRouteLength(transfer.routePoints);
            const inputDistance = Math.max(0, Math.min(1, Number(transfer?.progress) || 0)) * inputTotal;
            // [等速過彎] 必須實際抵達輸入線終點（即合流點）才切換路線，杜絕提前切換造成的瞬移。
            const isAtMergeGate = inputTotal <= 0 || inputDistance >= inputTotal - 0.5;
            if (!isAtMergeGate) {
                delete transfer.queueBlocked;
                delete transfer.blockedOnBrokenLine;
                return;
            }
            const outputSeg = this.system.getLogisticsSegmentsByGroupId(node.outputGroupId)[0] || null;
            const inputGroupId = transfer.lineId;
            const mergePoint = node.point || { x: node.x, y: node.y };
            const inputPoints = Array.isArray(transfer.routePoints) ? transfer.routePoints : [];
            const inputDir = node.inputDirections?.[inputGroupId] || (() => {
                const prev = inputPoints[inputPoints.length - 2];
                const last = inputPoints[inputPoints.length - 1];
                if (!prev || !last) return null;
                return { x: Math.sign(last.x - prev.x), y: Math.sign(last.y - prev.y) };
            })();
            const outputDir = node.outputDir || (() => {
                const first = route[0];
                const next = route[1];
                if (!first || !next) return null;
                return { x: Math.sign(next.x - first.x), y: Math.sign(next.y - first.y) };
            })();
            this.commitLogisticsMergeAdmission(node, transfer.id, state);
            transfer.lineId = node.outputGroupId;
            const virtualTurnRoute = this.buildMergeContinuousTurnRoute(inputPoints, route, mergePoint, inputDir, outputDir);
            if (virtualTurnRoute) {
                const routeLength = this.getRouteLength(virtualTurnRoute);
                const mergeDistance = this.getPathDistanceToPoint(virtualTurnRoute, mergePoint);
                transfer.routePoints = virtualTurnRoute;
                transfer.progress = routeLength > 0 ? Math.max(0, Math.min(1, mergeDistance / routeLength)) : 0;
            } else {
                transfer.routePoints = route.map(point => ({ x: point.x, y: point.y }));
                transfer.progress = 0;
            }
            // 路線已切換，舊路線上的排隊距離殘值必須清除，避免排隊邏輯誤判位置。
            delete transfer._queuedDistance;
            transfer.sourceId = outputSeg?.sourceId || transfer.sourceId || null;
            transfer.targetId = outputSeg?.targetId || null;
            transfer.efficiency = Number(outputSeg?.efficiency) || Number(transfer.efficiency) || 0;
            if (inputDir && outputDir && (inputDir.x !== outputDir.x || inputDir.y !== outputDir.y)) {
                transfer._mergeVisualTurn = {
                    x: mergePoint.x,
                    y: mergePoint.y,
                    outputGroupId: node.outputGroupId,
                    inDir: { x: inputDir.x, y: inputDir.y },
                    outDir: { x: outputDir.x, y: outputDir.y }
                };
            } else {
                delete transfer._mergeVisualTurn;
            }
            delete transfer.blockedOnBrokenLine;
            delete transfer.queueBlocked;
            admittedNodeKeys.add(nodeKey);
            changed = true;
        });

        return changed;
    }

    buildMergeContinuousTurnRoute(inputPoints, outputRoute, mergePoint, inputDir, outputDir) {
        if (!Array.isArray(inputPoints) || inputPoints.length < 2) return null;
        if (!Array.isArray(outputRoute) || outputRoute.length < 2) return null;
        if (!mergePoint || !inputDir || !outputDir) return null;
        if (inputDir.x === outputDir.x && inputDir.y === outputDir.y) return null;
        const inputPrev = inputPoints[inputPoints.length - 2];
        if (!inputPrev) return null;
        const points = [
            { x: inputPrev.x, y: inputPrev.y },
            { x: mergePoint.x, y: mergePoint.y }
        ];
        outputRoute.slice(1).forEach(point => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            const last = points[points.length - 1];
            if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.1) {
                points.push({ x: point.x, y: point.y });
            }
        });
        return points.length >= 2 ? points : null;
    }
}
