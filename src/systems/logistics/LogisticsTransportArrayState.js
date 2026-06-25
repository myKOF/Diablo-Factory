import { routePointsSignature, routeManhattanLength } from './LogisticsRouteCache.js';

export class LogisticsTransportArrayState {
    constructor(getCellSize = () => 20) {
        this.getCellSize = getCellSize;
    }

    // [效能] 以 routePoints 參照記憶化(見 LogisticsRouteCache),避免每 tick 重建相同字串/長度。
    getRouteKey(points) {
        return routePointsSignature(points);
    }

    getRouteTotalPixels(points) {
        return routeManhattanLength(points);
    }

    hasArrayPosition(transfer) {
        return Number.isFinite(Number(transfer?.transportIndex)) &&
            Number.isFinite(Number(transfer?.transportOffset));
    }

    getTransferDistance(transfer, totalPixels, cellSize = this.getCellSize()) {
        if (!transfer) return 0;
        const safeCellSize = Math.max(1, Number(cellSize) || 20);
        const safeTotal = Math.max(0, Number(totalPixels) || 0);
        if (this.hasArrayPosition(transfer)) {
            const index = Math.max(0, Math.floor(Number(transfer.transportIndex) || 0));
            const offset = Math.max(0, Math.min(1, Number(transfer.transportOffset) || 0));
            return Math.max(0, Math.min(safeTotal, (index + offset) * safeCellSize));
        }
        return Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * safeTotal;
    }

    setTransferDistance(transfer, distance, totalPixels, cellSize = this.getCellSize()) {
        if (!transfer) return transfer;
        const safeCellSize = Math.max(1, Number(cellSize) || 20);
        const safeTotal = Math.max(0, Number(totalPixels) || 0);
        const clampedDistance = Math.max(0, Math.min(Number(distance) || 0, safeTotal));
        let index = Math.floor(clampedDistance / safeCellSize);
        let offset = safeCellSize > 0 ? (clampedDistance - index * safeCellSize) / safeCellSize : 0;
        if (offset >= 1 - 0.000001) {
            index += 1;
            offset = 0;
        }

        transfer.transportIndex = index;
        transfer.transportOffset = Math.max(0, Math.min(1, offset));
        transfer.transportCellSize = safeCellSize;
        transfer.transportDistance = clampedDistance;
        transfer.transportRouteKey = this.getRouteKey(transfer.routePoints);
        transfer.progress = safeTotal > 0 ? clampedDistance / safeTotal : 0;
        return transfer;
    }

    syncTransferFromArrayState(transfer, totalPixels, cellSize = this.getCellSize()) {
        if (!transfer) return transfer;
        const routeKey = this.getRouteKey(transfer.routePoints);
        if (this.hasArrayPosition(transfer) && transfer.transportRouteKey !== routeKey) {
            const distance = this.getTransferDistance(transfer, totalPixels, cellSize);
            return this.setTransferDistance(transfer, distance, totalPixels, cellSize);
        }
        if (!this.hasArrayPosition(transfer)) {
            const distance = this.getTransferDistance(transfer, totalPixels, cellSize);
            return this.setTransferDistance(transfer, distance, totalPixels, cellSize);
        }
        const distance = this.getTransferDistance(transfer, totalPixels, cellSize);
        return this.setTransferDistance(transfer, distance, totalPixels, cellSize);
    }

    advanceTransfer(transfer, distanceDelta, totalPixels, maxAllowedProgress = 1, cellSize = this.getCellSize()) {
        const currentDistance = this.getTransferDistance(transfer, totalPixels, cellSize);
        const maxDistance = Math.max(0, Math.min(1, Number(maxAllowedProgress) || 0)) * Math.max(0, Number(totalPixels) || 0);
        const nextDistance = Math.min(currentDistance + Math.max(0, Number(distanceDelta) || 0), maxDistance);
        return this.setTransferDistance(transfer, nextDistance, totalPixels, cellSize);
    }

    resolveProgress(transfer, points = transfer?.routePoints, cellSize = this.getCellSize()) {
        const total = this.getRouteTotalPixels(points);
        if (total <= 0) return Math.max(0, Math.min(1, Number(transfer?.progress) || 0));
        if (!this.hasArrayPosition(transfer)) return Math.max(0, Math.min(1, Number(transfer?.progress) || 0));
        return this.getTransferDistance(transfer, total, cellSize) / total;
    }
}

export const logisticsTransportArrayState = new LogisticsTransportArrayState();
