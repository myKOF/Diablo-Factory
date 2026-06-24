export class LogisticsSourcePortQuery {
    constructor(system, getGameEngine) {
        this.system = system;
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    getConnection(line) {
        if (!line) return null;
        const groupId = line.groupId || line.id || null;
        const sourceId = line.sourceId || null;
        if (!groupId || !sourceId) return null;
        const sourceEnt = (this.gameEngine.state.mapEntities || []).find(ent =>
            ent && window.UIManager?.getEntityId?.(ent) === sourceId
        );
        if (!sourceEnt || !Array.isArray(sourceEnt.outputTargets)) return null;
        const linePort = line.sourcePort || null;
        const samePort = (conn) => {
            if (!linePort || !conn?.sourcePort) return true;
            if (Number.isFinite(linePort.x) && Number.isFinite(linePort.y) &&
                Number.isFinite(conn.sourcePort.x) && Number.isFinite(conn.sourcePort.y)) {
                return Math.hypot(linePort.x - conn.sourcePort.x, linePort.y - conn.sourcePort.y) <= (this.gameEngine.TILE_SIZE || 20) * 0.75;
            }
            return (linePort.dir || null) === (conn.sourcePort.dir || null) &&
                (linePort.slotIndex ?? linePort.defIndex ?? null) === (conn.sourcePort.slotIndex ?? conn.sourcePort.defIndex ?? null);
        };
        const belongsToSameLogisticsComponent = (lineId) => {
            if (!lineId) return false;
            if (lineId === groupId) return true;
            return this.system.areLogisticsGroupsInSameMergeComponent?.(lineId, groupId, this.gameEngine.state) === true;
        };
        const belongsToSamePhysicalComponent = (lineId) => {
            if (!lineId) return false;
            if (lineId === groupId) return true;
            const path = this.system.findLogisticsPhysicalGroupPath?.(lineId, groupId, this.gameEngine.state);
            return Array.isArray(path) && path.length > 0;
        };
        const conn = sourceEnt.outputTargets.find(item =>
            item &&
            (belongsToSameLogisticsComponent(item.lineId) || belongsToSamePhysicalComponent(item.lineId)) &&
            samePort(item)
        ) || null;
        return conn ? { source: sourceEnt, conn } : null;
    }

    getCellInfo(line) {
        if (!line || !this.getConnection(line)) return null;
        const points = Array.isArray(line.routePoints) ? line.routePoints : [];
        if (points.length < 2) return null;
        const sourcePort = line.sourcePort || null;
        if (!sourcePort || !Number.isFinite(sourcePort.x) || !Number.isFinite(sourcePort.y)) return null;
        const TS = this.gameEngine.TILE_SIZE || 20;
        const endpoints = [
            { point: points[0], neighbor: points[1] },
            { point: points[points.length - 1], neighbor: points[points.length - 2] }
        ].filter(item => item.point && item.neighbor);
        let portCell = null;
        let bestDist = Infinity;
        endpoints.forEach(item => {
            const dist = Math.hypot(item.point.x - sourcePort.x, item.point.y - sourcePort.y);
            if (dist <= TS * 1.1 && dist < bestDist) {
                bestDist = dist;
                portCell = item;
            }
        });
        if (!portCell) return null;

        const width = Math.max(1, Math.round(Number(line.routeWidth) || 1));
        const rect = {
            x: portCell.point.x - (TS * width) / 2,
            y: portCell.point.y - TS / 2,
            w: TS * width,
            h: TS
        };
        const next = portCell.neighbor;
        const horizontal = Math.abs((next?.x || portCell.point.x) - portCell.point.x) >= Math.abs((next?.y || portCell.point.y) - portCell.point.y);
        if (!horizontal) {
            rect.x = portCell.point.x - TS / 2;
            rect.y = portCell.point.y - (TS * width) / 2;
            rect.w = TS;
            rect.h = TS * width;
        }
        return {
            point: { x: portCell.point.x, y: portCell.point.y },
            neighbor: { x: next.x, y: next.y },
            sourcePort,
            rect,
            horizontal
        };
    }

    isSourcePortCell(line, worldX, worldY) {
        const info = this.getCellInfo(line);
        if (!info) return false;
        const rect = info.rect;
        return worldX >= rect.x && worldX <= rect.x + rect.w &&
            worldY >= rect.y && worldY <= rect.y + rect.h;
    }

    getHitAt(worldX, worldY) {
        const line = this.system.getLogisticsLinesAt(worldX, worldY).find(hit =>
            this.isSourcePortCell(hit, worldX, worldY)
        );
        if (!line) return null;
        const portConn = this.getConnection(line);
        if (!portConn) return null;
        return { line, source: portConn.source, conn: portConn.conn };
    }
}
