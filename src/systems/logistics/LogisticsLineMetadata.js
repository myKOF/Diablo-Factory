export class LogisticsLineMetadata {
    applySplitSequenceStart(segments, existingGroupSegments) {
        const extendsSplitSequence = existingGroupSegments.some(line => Number.isFinite(line?.splitSequenceOrder));
        const splitSequenceStart = extendsSplitSequence
            ? Math.max(...existingGroupSegments.map(line => Number.isFinite(line?.splitSequenceOrder) ? line.splitSequenceOrder : (Number(line?.order) || 0))) + 1
            : null;
        if (!Number.isFinite(splitSequenceStart)) return;
        segments.forEach((segment, index) => {
            segment.splitSequenceOrder = splitSequenceStart + index;
        });
    }

    syncGroupSegments(context) {
        const {
            mergedLines,
            groupId,
            canonicalSourceId,
            targetId,
            cleanTargetPoint,
            routeWidth,
            lineType,
            efficiency,
            cleanSourcePort,
            cleanTargetPort,
            conn,
            filter
        } = context;

        mergedLines.forEach((seg) => {
            if (!seg) return;
            const sameGroup = (seg.groupId === groupId) || (seg.id === groupId);
            if (!sameGroup) return;
            seg.groupId = groupId;
            seg.sourceId = canonicalSourceId;
            seg.targetId = targetId;
            seg.targetPoint = targetId ? null : cleanTargetPoint;
            seg.routeWidth = Math.max(1, Number(routeWidth) || 1);
            seg.lineType = lineType || seg.lineType || 'transport_line';
            seg.efficiency = Number(efficiency) || Number(seg.efficiency) || 0;
            if (cleanSourcePort) seg.sourcePort = cleanSourcePort;
            if (cleanTargetPort) seg.targetPort = cleanTargetPort;
            if (!conn) seg.filter = filter || null;
            else if (seg.isSourcePortCell || seg.sourcePortCellKey) seg.filter = null;
        });
    }

    syncConnection(context) {
        const {
            conn,
            groupId,
            gridPoints,
            routeWidth,
            lineType,
            efficiency,
            cleanSourcePort,
            cleanTargetPort
        } = context;
        if (!conn) return;
        conn.lineId = groupId;
        conn.routePoints = gridPoints.map(p => ({ x: p.x, y: p.y }));
        conn.routeWidth = Math.max(1, Number(routeWidth) || 1);
        conn.lineType = lineType || 'transport_line';
        conn.efficiency = Number(efficiency) || 0;
        conn.sourcePort = cleanSourcePort;
        conn.targetPort = cleanTargetPort;
    }
}
