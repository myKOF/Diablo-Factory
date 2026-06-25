import { UI_CONFIG } from "../../ui/ui_config.js";
import { ResourceSystem } from "../ResourceSystem.js";
import { conveyorSystem } from "../ConveyorSystem.js";
import { routePointsSignature, routeAlongDistanceToPoint } from "./LogisticsRouteCache.js";
import { LogisticsTransportArrayState } from "./LogisticsTransportArrayState.js";

function annotateRoutePoints(points) {
    if (!Array.isArray(points) || points.length < 3) return;
    const getCardinalDir = (from, to) => {
        if (!from || !to) return null;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
        if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx) || 1, y: 0 };
        return { x: 0, y: Math.sign(dy) || 1 };
    };
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        const inDir = getCardinalDir(prev, curr);
        const outDir = getCardinalDir(curr, next);
        if (inDir && outDir && (inDir.x !== outDir.x || inDir.y !== outDir.y)) {
            curr.isCorner = true;
        }
    }
}


/**
 * 物流運輸系統 (LogisticsTransferSystem.js)
 * 核心職責：自動物流發料、在途物品推進、合流/回壓裁決、物流線路徑點幾何計算。
 * 由 WorkerSystem 持有並於每幀透過 update(dt) 驅動。
 * 遵循微創重構原則：自 WorkerSystem 原封不動搬移，未修改任何演算法邏輯。
 */
export class LogisticsTransferSystem {
    constructor(state, engineContext) {
        this.state = state;
        this.engine = engineContext;
        this.transportArrayState = new LogisticsTransportArrayState(() => this.engine?.TILE_SIZE || 20);
    }

    update(dt) {
        if (conveyorSystem && typeof conveyorSystem.update === 'function') {
            conveyorSystem.update(dt);
        }
        this.processAutomatedLogistics(window.GAME_STATE || this.engine.state, dt);
    }

    getLogisticsLinePoints(source, target) {
        if (!source || !target) return null;
        const sourceId = source.id || `${source.type1}_${source.x}_${source.y}`;
        const targetId = target.id || `${target.type1}_${target.x}_${target.y}`;
        const directConn = Array.isArray(source.outputTargets)
            ? source.outputTargets.find(conn => conn && conn.id === targetId)
            : null;

        if (directConn) {
            const transferRoute = (conveyorSystem && typeof conveyorSystem.getConnectionTransferRoute === 'function')
                ? conveyorSystem.getConnectionTransferRoute(source, target, directConn)
                : null;
            let routePoints = transferRoute && Array.isArray(transferRoute.points) && transferRoute.points.length >= 2
                ? transferRoute.points.map(p => ({ x: p.x, y: p.y }))
                : (!directConn.lineId && Array.isArray(directConn.routePoints) && directConn.routePoints.length >= 2
                    ? directConn.routePoints.map(p => ({ x: p.x, y: p.y }))
                    : null);
            if (Array.isArray(routePoints) && routePoints.length >= 2) {
                return {
                    start: { ...routePoints[0] },
                    end: { ...routePoints[routePoints.length - 1] },
                    points: routePoints,
                    sourceId,
                    targetId
                };
            }
            if (directConn.lineId) return null;
        }

        let sx = source.x;
        let sy = source.y;
        let ex = target.x;
        let ey = target.y;
        const isReciprocal = target.outputTargets && target.outputTargets.find(conn => conn.id === sourceId);

        if (isReciprocal) {
            const dx = ex - sx;
            const dy = ey - sy;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
                const cfg = UI_CONFIG.LogisticsSystem || {};
                const offset = cfg.lineOffset || 10;
                const nx = -dy / dist;
                const ny = dx / dist;
                sx += nx * offset;
                sy += ny * offset;
                ex += nx * offset;
                ey += ny * offset;
            }
        }

        const start = this.getBuildingLineExitPoint(source, { x: sx, y: sy }, { x: ex, y: ey });
        const end = this.getBuildingLineExitPoint(target, { x: ex, y: ey }, { x: sx, y: sy });
        return { start, end, points: [start, end], sourceId, targetId };
    }

    normalizeTransferRoutePoints(source, target, routePoints) {
        if (!Array.isArray(routePoints) || routePoints.length < 2) return routePoints;
        const points = [];
        routePoints.forEach(point => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            const last = points[points.length - 1];
            if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.5) {
                points.push({ x: point.x, y: point.y });
            }
        });
        if (points.length < 2) return points;
        if (!source && !target) return points;

        const distance = (entity, point) => Math.hypot((entity.x || 0) - point.x, (entity.y || 0) - point.y);
        const first = points[0];
        const last = points[points.length - 1];

        let directScore = 0;
        let reverseScore = 0;
        if (source && target) {
            directScore = distance(source, first) + distance(target, last);
            reverseScore = distance(source, last) + distance(target, first);
        } else if (source) {
            directScore = distance(source, first);
            reverseScore = distance(source, last);
        } else if (target) {
            directScore = distance(target, last);
            reverseScore = distance(target, first);
        }
        return reverseScore < directScore ? points.reverse() : points;
    }

    formatTransferPoint(point) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return "null";
        return `(${Math.round(point.x)},${Math.round(point.y)})`;
    }

    logTransferRouteDebug(source, target, conn, itemType, rawRoutePoints, routePoints) {
        if (!this.engine || typeof this.engine.addLog !== 'function' || !conn) return;
        const now = Date.now();
        const key = `${conn.lineId || conn.id || 'no-line'}:${itemType || 'item'}`;
        conn._transferRouteDebugAt = conn._transferRouteDebugAt || {};
        if (conn._transferRouteDebugAt[key] && now - conn._transferRouteDebugAt[key] < 2500) return;
        conn._transferRouteDebugAt[key] = now;

        const first = Array.isArray(routePoints) ? routePoints[0] : null;
        const last = Array.isArray(routePoints) ? routePoints[routePoints.length - 1] : null;
        const rawFirst = Array.isArray(rawRoutePoints) ? rawRoutePoints[0] : null;
        const rawLast = Array.isArray(rawRoutePoints) ? rawRoutePoints[rawRoutePoints.length - 1] : null;
        const routeHead = Array.isArray(routePoints)
            ? routePoints.slice(0, 4).map(point => this.formatTransferPoint(point)).join(">")
            : "null";
        const dist = (entity, point) => entity && point
            ? Math.round(Math.hypot((entity.x || 0) - point.x, (entity.y || 0) - point.y))
            : "n/a";
        this.engine.addLog(
            `[DEBUG] Transfer route ${String(itemType || '').toUpperCase()} ` +
            `source=${this.formatTransferPoint(source)} target=${this.formatTransferPoint(target)} ` +
            `first=${this.formatTransferPoint(first)} last=${this.formatTransferPoint(last)} ` +
            `rawFirst=${this.formatTransferPoint(rawFirst)} rawLast=${this.formatTransferPoint(rawLast)} ` +
            `sourcePort=${this.formatTransferPoint(conn.sourcePort)} targetPort=${this.formatTransferPoint(conn.targetPort)} ` +
            `distSF=${dist(source, first)} distSL=${dist(source, last)} points=${Array.isArray(routePoints) ? routePoints.length : 0} ` +
            `head=${routeHead}`,
            'LOGISTICS'
        );
    }

    getOrderedLogisticsSegmentRoutePoints(lineId, source = null, target = null) {
        if (!lineId || !Array.isArray(this.state?.logisticsLines)) return null;
        const TS = 20;
        const segments = this.state.logisticsLines.filter(line =>
            line && (line.groupId === lineId || line.id === lineId) &&
            Array.isArray(line.routePoints) && line.routePoints.length >= 1
        );
        if (segments.length < 2) return null;

        const ordered = [...segments].sort((a, b) => {
            const timeA = a?.createdAt || 0;
            const timeB = b?.createdAt || 0;
            if (timeA !== timeB) return timeA - timeB;
            const orderA = Number.isFinite(a?.order) ? a.order : 0;
            const orderB = Number.isFinite(b?.order) ? b.order : 0;
            if (orderA !== orderB) return orderA - orderB;
            return String(a?.id || "").localeCompare(String(b?.id || ""));
        });

        const points = [];
        const pushPoint = (point) => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            const last = points[points.length - 1];
            if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.5) {
                points.push({ x: point.x, y: point.y });
            }
        };

        // Keep active transfer positions aligned with the logistics position list.
        // Segment endpoints may include construction handles past a merged corner.
        ordered.forEach(seg => pushPoint(seg.routePoints[0]));

        const lastSeg = ordered[ordered.length - 1];
        const lastEndpoint = lastSeg?.routePoints?.[lastSeg.routePoints.length - 1];
        if (lastEndpoint) pushPoint(lastEndpoint);

        // [修正] 連續性檢查改為驗證相鄰線段首尾相接，而非比較稀疏節點間距。
        // 舊檢查比較的是各線段起點(+最後終點)組成的稀疏骨架，只要任一線段長度
        // 超過 1.75 格，相鄰骨架點間距就會 > TS*1.75 而被誤判為斷裂並回傳 null。
        // 這會讓合流切分後的上游 group(含多格線段)拿不到「止於合流點」的正確路徑，
        // 派發改走跨越合流點的完整路徑而無法被 admit，造成上游回堵堵死。
        for (let i = 0; i < ordered.length - 1; i++) {
            const aPts = ordered[i]?.routePoints;
            const bPts = ordered[i + 1]?.routePoints;
            const aEnd = Array.isArray(aPts) && aPts.length ? aPts[aPts.length - 1] : null;
            const bStart = Array.isArray(bPts) && bPts.length ? bPts[0] : null;
            if (!aEnd || !bStart) return null;
            if (Math.hypot(aEnd.x - bStart.x, aEnd.y - bStart.y) > TS * 1.75) {
                return null;
            }
        }

        const normalizedPoints = this.normalizeTransferRoutePoints(source, target, points);
        if (Array.isArray(normalizedPoints)) {
            annotateRoutePoints(normalizedPoints);
        }
        return Array.isArray(normalizedPoints) && normalizedPoints.length >= 2 ? normalizedPoints : null;
    }

    getItemTransferRoutePoints(source, target, conn) {
        if (!source || !target || !conn?.lineId || !Array.isArray(this.state.logisticsLines)) return null;
        const TS = 20;
        const segments = this.state.logisticsLines.filter(line =>
            line && (line.groupId === conn.lineId || line.id === conn.lineId) &&
            Array.isArray(line.routePoints) && line.routePoints.length >= 2
        );
        if (segments.length === 0) return null;

        const nodeKey = (point) => `${Math.round(point.x)},${Math.round(point.y)}`;
        const nodes = new Map();
        const edges = new Map();
        const addNode = (point) => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
            const key = nodeKey(point);
            if (!nodes.has(key)) nodes.set(key, { x: Math.round(point.x), y: Math.round(point.y) });
            if (!edges.has(key)) edges.set(key, []);
            return key;
        };
        const addEdge = (a, b) => {
            const ak = addNode(a);
            const bk = addNode(b);
            if (!ak || !bk || ak === bk) return;
            const weight = Math.hypot(nodes.get(bk).x - nodes.get(ak).x, nodes.get(bk).y - nodes.get(ak).y) || 0.001;
            edges.get(ak).push({ key: bk, weight });
            edges.get(bk).push({ key: ak, weight });
        };

        segments.forEach(seg => {
            const points = seg.routePoints;
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                if (!a || !b) continue;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 0.001) continue;
                const steps = Math.max(1, Math.round(dist / TS));
                let prev = null;
                for (let step = 0; step <= steps; step++) {
                    const point = step === steps
                        ? b
                        : { x: a.x + (dx / steps) * step, y: a.y + (dy / steps) * step };
                    const key = addNode(point);
                    if (prev && key) addEdge(nodes.get(prev), nodes.get(key));
                    prev = key;
                }
            }
        });
        if (nodes.size < 2) return null;

        const getEntityPorts = (entity) => {
            if (window.UIManager && typeof window.UIManager.getBuildingPortSlots === 'function') {
                const ports = window.UIManager.getBuildingPortSlots(entity);
                if (Array.isArray(ports) && ports.length > 0) return ports;
            }
            const fp = this.engine.getFootprint(entity.type1 || entity.type) || { uw: 3, uh: 3 };
            const halfW = ((fp.uw || 3) * TS) / 2;
            const halfH = ((fp.uh || 3) * TS) / 2;
            return [
                { x: entity.x, y: entity.y - halfH, dir: 'up' },
                { x: entity.x, y: entity.y + halfH, dir: 'down' },
                { x: entity.x - halfW, y: entity.y, dir: 'left' },
                { x: entity.x + halfW, y: entity.y, dir: 'right' }
            ];
        };
        const isPortNearEntity = (entity, port) => {
            if (!entity || !port || !Number.isFinite(port.x) || !Number.isFinite(port.y)) return false;
            const ports = getEntityPorts(entity);
            if (ports.some(entityPort => Math.hypot(entityPort.x - port.x, entityPort.y - port.y) <= TS * 0.75)) return true;

            const fp = this.engine.getFootprint(entity.type1 || entity.type) || { uw: 3, uh: 3 };
            const halfW = ((fp.uw || 3) * TS) / 2;
            const halfH = ((fp.uh || 3) * TS) / 2;
            const dx = Math.max(Math.abs(port.x - entity.x) - halfW, 0);
            const dy = Math.max(Math.abs(port.y - entity.y) - halfH, 0);
            return Math.hypot(dx, dy) <= TS * 0.75;
        };
        const nearestNode = (point) => {
            let best = null;
            let bestDist = Infinity;
            nodes.forEach((node, key) => {
                const dist = Math.hypot(node.x - point.x, node.y - point.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = { key, point: node, dist };
                }
            });
            return best;
        };
        const getCandidates = (entity, storedPort = null) => {
            const ports = [];
            if (storedPort && storedPort.sourceType !== 'logistics_line' &&
                Number.isFinite(storedPort.x) && Number.isFinite(storedPort.y) &&
                isPortNearEntity(entity, storedPort)) {
                ports.push(storedPort);
            }
            ports.push(...getEntityPorts(entity));

            const byKey = new Map();
            ports.forEach(port => {
                const nearest = nearestNode(port);
                if (!nearest || nearest.dist > TS * 1.25) return;
                const existing = byKey.get(nearest.key);
                if (!existing || nearest.dist < existing.dist) {
                    byKey.set(nearest.key, {
                        key: nearest.key,
                        anchor: { x: port.x, y: port.y },
                        dist: nearest.dist
                    });
                }
            });
            return [...byKey.values()].sort((a, b) => a.dist - b.dist);
        };

        const sourceCandidates = getCandidates(source, conn.sourcePort);
        const targetCandidates = getCandidates(target, conn.targetPort);
        if (sourceCandidates.length === 0 || targetCandidates.length === 0) return null;

        const orderedSegmentRoutePoints = this.getOrderedLogisticsSegmentRoutePoints(conn.lineId, source, target);
        if (Array.isArray(orderedSegmentRoutePoints) && orderedSegmentRoutePoints.length >= 2) {
            return orderedSegmentRoutePoints;
        }

        const findPath = (startKey, endKey) => {
            const distances = new Map([[startKey, 0]]);
            const previous = new Map();
            const open = new Set(nodes.keys());

            while (open.size > 0) {
                let current = null;
                let bestDistance = Infinity;
                open.forEach(key => {
                    const dist = distances.get(key) ?? Infinity;
                    if (dist < bestDistance) {
                        bestDistance = dist;
                        current = key;
                    }
                });
                if (!current || bestDistance === Infinity) break;
                open.delete(current);
                if (current === endKey) break;
                (edges.get(current) || []).forEach(edge => {
                    if (!open.has(edge.key)) return;
                    const nextDistance = bestDistance + edge.weight;
                    if (nextDistance < (distances.get(edge.key) ?? Infinity)) {
                        distances.set(edge.key, nextDistance);
                        previous.set(edge.key, current);
                    }
                });
            }

            if (!distances.has(endKey)) return null;
            const keys = [];
            let current = endKey;
            while (current) {
                keys.unshift(current);
                if (current === startKey) break;
                current = previous.get(current);
            }
            return keys[0] === startKey ? { keys, distance: distances.get(endKey) } : null;
        };

        let bestPath = null;
        sourceCandidates.forEach(sourceCandidate => {
            targetCandidates.forEach(targetCandidate => {
                const path = findPath(sourceCandidate.key, targetCandidate.key);
                if (!path) return;
                const score = path.distance + sourceCandidate.dist + targetCandidate.dist;
                if (!bestPath || score < bestPath.score) {
                    bestPath = { ...path, score, sourceAnchor: sourceCandidate.anchor, targetAnchor: targetCandidate.anchor };
                }
            });
        });
        if (!bestPath || !Array.isArray(bestPath.keys) || bestPath.keys.length < 2) {
            // 降級方案：使用端點追蹤法（與渲染器一致）
            const sortedSegs = [];
            const remaining = [...segments];
            let current = remaining.sort((a, b) => (a.order || 0) - (b.order || 0))[0];

            if (current) {
                sortedSegs.push(current);
                remaining.splice(remaining.indexOf(current), 1);

                while (remaining.length > 0) {
                    const lastSeg = sortedSegs[sortedSegs.length - 1];
                    const lastEp = lastSeg.routePoints?.[lastSeg.routePoints.length - 1] || { x: lastSeg.x, y: lastSeg.y };

                    let nextIndex = -1;
                    let minEdgeDist = 15; // 容許 15 像素內的偏差

                    for (let i = 0; i < remaining.length; i++) {
                        const rSeg = remaining[i];
                        const rSp = rSeg.routePoints?.[0] || { x: rSeg.x, y: rSeg.y };
                        const dist = Math.hypot(lastEp.x - rSp.x, lastEp.y - rSp.y);
                        if (dist < minEdgeDist) {
                            minEdgeDist = dist;
                            nextIndex = i;
                        }
                    }

                    if (nextIndex !== -1) {
                        sortedSegs.push(remaining[nextIndex]);
                        remaining.splice(nextIndex, 1);
                    } else {
                        remaining.sort((a, b) => (a.order || 0) - (b.order || 0));
                        sortedSegs.push(remaining[0]);
                        remaining.splice(0, 1);
                    }
                }
            }

            const points = [];
            const pushPoint = (point) => {
                if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
                const last = points[points.length - 1];
                if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.5) {
                    points.push({ x: point.x, y: point.y });
                }
            };

            sortedSegs.forEach(seg => {
                if (Array.isArray(seg.routePoints)) {
                    if (seg.routePoints.length > 0) pushPoint(seg.routePoints[0]);
                }
            });

            if (points.length >= 2) {
                const normalizedPoints = this.normalizeTransferRoutePoints(source, target, points);
                return normalizedPoints.length >= 2 ? normalizedPoints : null;
            }
            return null;
        }

        const points = [];
        const pushPoint = (point) => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            const last = points[points.length - 1];
            if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.5) {
                points.push({ x: point.x, y: point.y });
            }
        };
        pushPoint(bestPath.sourceAnchor);
        bestPath.keys.forEach(key => pushPoint(nodes.get(key)));
        pushPoint(bestPath.targetAnchor);
        const normalizedPoints = this.normalizeTransferRoutePoints(source, target, points);
        return normalizedPoints.length >= 2 ? normalizedPoints : null;
    }

    createActiveTransfer(state, source, conn, itemType) {
        if (!source || !conn || !itemType) return null;
        const sourceId = source.id || `${source.type1}_${source.x}_${source.y}`;
        const target = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === conn.id);
        const orderedLineRoute = conn.lineId
            ? this.getOrderedLogisticsSegmentRoutePoints(conn.lineId, source, target)
            : null;
        const transferVisualRoute = target && conn.lineId && (!Array.isArray(orderedLineRoute) || orderedLineRoute.length < 2)
            ? this.getItemTransferRoutePoints(source, target, conn)
            : null;
        const route = (!Array.isArray(transferVisualRoute) || transferVisualRoute.length < 2) && target
            ? this.getLogisticsLinePoints(source, target)
            : null;
        const rawRoutePoints = Array.isArray(orderedLineRoute) && orderedLineRoute.length >= 2
            ? orderedLineRoute.map(point => ({ x: point.x, y: point.y }))
            : Array.isArray(transferVisualRoute) && transferVisualRoute.length >= 2
                ? transferVisualRoute.map(point => ({ x: point.x, y: point.y }))
                : (Array.isArray(route?.points) && route.points.length >= 2
                    ? route.points.map(point => ({ x: point.x, y: point.y }))
                    : (Array.isArray(conn.routePoints) && conn.routePoints.length >= 2
                        ? conn.routePoints.map(point => ({ x: point.x, y: point.y }))
                        : null));
        const routePoints = this.normalizeTransferRoutePoints(source, target, rawRoutePoints);
        if (routePoints) {
            annotateRoutePoints(routePoints);
        }
        // this.logTransferRouteDebug(source, target, conn, itemType, rawRoutePoints, routePoints);
        const transferId = `transfer_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000).toString(36)}`;

        // [新增] 自動設定追蹤目標
        if (state && !state.trackedTransferId) {
            state.trackedTransferId = transferId;
            if (this.engine && typeof this.engine.addLog === 'function') {
                this.engine.addLog(`[追蹤] 開始追蹤物品 ${itemType}`, 'LOGISTICS');
            }
        }

        return {
            id: transferId,
            lastSegment: -1, // 初始化區段紀錄
            sourceId,
            targetId: conn.id,
            itemType,
            progress: 0,
            transportIndex: 0,
            transportOffset: 0,
            transportCellSize: this.engine?.TILE_SIZE || 20,
            lineId: conn.lineId || null,
            efficiency: Number(conn.efficiency) || 0,
            routePoints
        };
    }

    assignTransferSerial(state, transfer) {
        if (!state || !transfer || transfer.serialNumber) return transfer;
        const nextSerial = Number.isFinite(Number(state.nextTransferSerial))
            ? Math.max(1, Math.floor(Number(state.nextTransferSerial)))
            : 1;
        transfer.serialNumber = nextSerial;
        state.nextTransferSerial = nextSerial + 1;
        return transfer;
    }

    getBuildingLineExitPoint(building, from, to) {
        if (!building || !from || !to) return from;
        const fp = this.engine.getFootprint(building.type1 || building.type);
        const collisionCfg = UI_CONFIG.BuildingCollision || {};
        const clearance = Math.max(18, (collisionCfg.buffer || 10) + 10);
        const halfW = (fp.uw * 20) / 2 + clearance;
        const halfH = (fp.uh * 20) / 2 + clearance;
        const centerY = building.y - (collisionCfg.feetOffset || 0);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const candidates = [];

        if (Math.abs(dx) > 0.001) {
            candidates.push((building.x - halfW - from.x) / dx);
            candidates.push((building.x + halfW - from.x) / dx);
        }
        if (Math.abs(dy) > 0.001) {
            candidates.push((centerY - halfH - from.y) / dy);
            candidates.push((centerY + halfH - from.y) / dy);
        }

        const valid = candidates
            .filter(t => t >= 0 && t <= 1)
            .map(t => ({ x: from.x + dx * t, y: from.y + dy * t, t }))
            .filter(p =>
                p.x >= building.x - halfW - 0.5 &&
                p.x <= building.x + halfW + 0.5 &&
                p.y >= centerY - halfH - 0.5 &&
                p.y <= centerY + halfH + 0.5
            )
            .sort((a, b) => a.t - b.t);

        if (valid.length === 0) return from;
        const p = valid[0];
        const len = Math.hypot(dx, dy) || 1;
        return {
            x: p.x - (dx / len) * 2,
            y: p.y - (dy / len) * 2
        };
    }

    processAutomatedLogistics(state, deltaTime) {
        // [效能] 開啟計算快取窗口：本方法同步執行期間不變更線段與合流拓樸，
        // 讓內部大量的合流查詢（getSegmentsByGroupId、拓樸有效性檢查）由逐 transfer×逐子步 O(總線段數) 降為查表。
        if (conveyorSystem && typeof conveyorSystem.beginLogisticsComputeCache === 'function') {
            conveyorSystem.beginLogisticsComputeCache();
        }
        try {
            return this._processAutomatedLogisticsImpl(state, deltaTime);
        } finally {
            if (conveyorSystem && typeof conveyorSystem.endLogisticsComputeCache === 'function') {
                conveyorSystem.endLogisticsComputeCache();
            }
        }
    }

    _processAutomatedLogisticsImpl(state, deltaTime) {
        if (!state.activeTransfers) state.activeTransfers = [];
        // [固定子步長] 物品移動與合流放行對 tick 粗細極度敏感：每 tick 位移 = 速度×dt，
        // dt 過大時 winner 過衝合流閘門，留下永不閉合的碎片間隙（5Hz→56%、20Hz→83% 滿載）。
        // 把「移動+合流」這段切成固定 stepDt 子步長，與外部 tick 率脫鉤；建築發料仍用完整 deltaTime。
        let stepDt = deltaTime;
        const addTransportLog = (message) => {
            if (this.engine && typeof this.engine.addLog === 'function') {
                this.engine.addLog(message, 'LOGISTICS');
            }
        };
        const getEntityLabel = (ent) => ent ? (ent.name || ent.type1 || ent.type || '未知建築') : '未知目標';
        const getTransferRouteText = (transfer) => {
            const count = Array.isArray(transfer?.routePoints) ? transfer.routePoints.length : 0;
            return count >= 2 ? `路徑 ${count} 點` : '未取得繪製路徑點';
        };

        // 1. 推進正在運輸中的物品
        const getTransferSpeed = (transfer) => {
            const groupId = transfer?.lineId;
            const line = groupId && Array.isArray(state.logisticsLines)
                ? state.logisticsLines.find(item => item && (item.groupId === groupId || item.id === groupId) && Number(item.efficiency) > 0)
                : null;
            const cfg = this.engine ? this.engine.getEntityConfig(line?.lineType || 'transport_line', 1) : null;
            return Math.max(0.1, Number(line?.efficiency) || Number(transfer?.efficiency) || Number(cfg?.efficiency) || 4);
        };
        const getTransferRouteMetrics = (transfer) => {
            const points = transfer?.routePoints;
            if (!Array.isArray(points) || points.length < 2) {
                return { totalPixels: 0, totalTiles: 1 };
            }
            if (transfer._logicRouteMetricsPoints === points && transfer._logicRouteMetrics) {
                return transfer._logicRouteMetrics;
            }
            const key = points.map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join("|");
            if (transfer._logicRouteMetricsKey === key && transfer._logicRouteMetrics) {
                transfer._logicRouteMetricsPoints = points;
                return transfer._logicRouteMetrics;
            }

            let total = 0;
            for (let j = 0; j < points.length - 1; j++) {
                const segLen = Math.abs(points[j + 1].x - points[j].x) + Math.abs(points[j + 1].y - points[j].y);
                total += segLen;
            }

            const metrics = { totalPixels: total, totalTiles: Math.max(1, total / 20) };
            transfer._logicRouteMetricsPoints = points;
            transfer._logicRouteMetricsKey = key;
            transfer._logicRouteMetrics = metrics;
            return metrics;
        };
        const getCellSize = () => this.engine?.TILE_SIZE || 20;
        const getTransferDistance = (transfer) => {
            const metrics = getTransferRouteMetrics(transfer);
            return this.transportArrayState.getTransferDistance(transfer, metrics.totalPixels, getCellSize());
        };
        const syncTransferArrayPosition = (transfer) => {
            const metrics = getTransferRouteMetrics(transfer);
            this.transportArrayState.syncTransferFromArrayState(transfer, metrics.totalPixels, getCellSize());
        };
        const setTransferDistance = (transfer, distance) => {
            const metrics = getTransferRouteMetrics(transfer);
            this.transportArrayState.setTransferDistance(transfer, distance, metrics.totalPixels, getCellSize());
        };
        const getStorageAmount = (ent, itemType) => {
            const key = String(itemType || '').toLowerCase();
            return (ent?.storage && Number(ent.storage[key])) || 0;
        };
        const removeFromWarehouseStorage = (ent, itemType, amount = 1) => {
            if (!ent || !itemType || amount <= 0) return false;
            const key = String(itemType).toLowerCase();
            if (!ent.storage) ent.storage = {};
            if ((ent.storage[key] || 0) < amount) return false;
            ent.storage[key] -= amount;
            if (ent.storage[key] <= 0) delete ent.storage[key];
            if (state.resources) {
                state.resources[key] = Math.max(0, (state.resources[key] || 0) - amount);
            }
            return true;
        };
        const getTransferPathKey = (transfer) => {
            const signature = getTransferRouteSignature(transfer);
            if (signature && (routeSignatureLineIds.get(signature)?.size || 0) > 1) {
                return `route:${signature}`;
            }
            if (transfer?.lineId) return `line:${transfer.lineId}`;
            const points = transfer?.routePoints || [];
            const first = points[0];
            const last = points[points.length - 1];
            return [
                "route",
                first ? `${Math.round(first.x)},${Math.round(first.y)}` : "start",
                last ? `${Math.round(last.x)},${Math.round(last.y)}` : "end"
            ].join("|");
        };
        const getTransferRouteSignature = (transfer) => {
            const points = transfer?.routePoints || [];
            if (!Array.isArray(points) || points.length < 2) return null;
            return routePointsSignature(points); // [效能] 以路徑參照記憶化
        };
        const routeSignatureLineIds = new Map();
        (state.activeTransfers || []).forEach(transfer => {
            const signature = getTransferRouteSignature(transfer);
            if (!signature) return;
            if (!routeSignatureLineIds.has(signature)) routeSignatureLineIds.set(signature, new Set());
            routeSignatureLineIds.get(signature).add(transfer.lineId || "");
        });
        const canStartTransfer = (transfer) => {
            if (!transfer || !Array.isArray(transfer.routePoints) || transfer.routePoints.length < 2) return true;
            const key = getTransferPathKey(transfer);
            const totalLength = getTransferRouteMetrics(transfer).totalPixels;
            if (totalLength <= 0) return true;
            const cellSize = this.engine?.TILE_SIZE || 20;
            return !state.activeTransfers.some(active => {
                if (!active || active.id === transfer.id) return false;
                if (!Array.isArray(active.routePoints) || active.routePoints.length < 2) return false;
                const samePathKey = getTransferPathKey(active) === key;
                const sameRouteSignature = getTransferRouteSignature(active) &&
                    getTransferRouteSignature(active) === getTransferRouteSignature(transfer);
                if (!samePathKey && !sameRouteSignature) return false;
                const activeTotal = getTransferRouteMetrics(active).totalPixels || totalLength;
                const activeDistance = this.transportArrayState.getTransferDistance(active, activeTotal, cellSize);
                return activeDistance < cellSize;
            });
        };
        // [效能] 記憶化(見 LogisticsRouteCache);物流路徑為正交,逐段 |dx|+|dy| 與 hypot 相同。
        const getPathDistanceToPoint = routeAlongDistanceToPoint;
        // [效能] getLogisticsMergeNodeForInputTransfer 每次都要掃 nodes×lines（getSegmentsByGroupId
        // 與 doesLogisticsGroupContainConnectionPoint 皆為 O(lines)），但合流拓樸與各 transfer 路徑在
        // 單次 processAutomatedLogistics 內不變（applyLogisticsMergeNodes 只動排程狀態、不動拓樸）。
        // 於本次呼叫記憶化，杜絕「排序比較器 / 逐 transfer / 逐子步長」造成的 O(n×nodes×lines) 重複掃描。
        const _mergeNodeCache = new Map();
        const getMergeNodeForTransfer = (transfer) => {
            if (!transfer) return null;
            if (_mergeNodeCache.has(transfer)) return _mergeNodeCache.get(transfer);
            const node = (conveyorSystem && typeof conveyorSystem.getLogisticsMergeNodeForInputTransfer === 'function')
                ? conveyorSystem.getLogisticsMergeNodeForInputTransfer(transfer, state)
                : null;
            _mergeNodeCache.set(transfer, node);
            return node;
        };
        const _mergeOutputCache = new Map();
        const isMergeOutputTransferCached = (transfer) => {
            const lineId = transfer?.lineId || null;
            if (!lineId || !Array.isArray(state.logisticsMergeNodes)) return false;
            if (_mergeOutputCache.has(transfer)) return _mergeOutputCache.get(transfer);
            const result = state.logisticsMergeNodes.some(node => node?.outputGroupId === lineId);
            _mergeOutputCache.set(transfer, result);
            return result;
        };
        const getMergeAdmissionWinner = (node, spacing) => {
            if (!node || !Array.isArray(node.inputGroupIds)) return null;
            if (conveyorSystem && typeof conveyorSystem.getLogisticsMergeAdmissionWinner === 'function') {
                return conveyorSystem.getLogisticsMergeAdmissionWinner(node, state, {
                    spacing,
                    readyDistanceFromEnd: spacing
                });
            }
            return null;
        };
        const getMergeInputMaxDistance = (transfer, totalLength, spacing) => {
            if (!conveyorSystem || typeof conveyorSystem.getLogisticsMergeNodeForInputTransfer !== 'function') {
                return totalLength;
            }
            const node = getMergeNodeForTransfer(transfer);
            if (!node || !node.outputGroupId) return totalLength;
            const mergePoint = node.point || { x: node.x, y: node.y };

            const winnerId = getMergeAdmissionWinner(node, spacing);
            const isWinner = winnerId && transfer.id && transfer.id === winnerId;
            // [非勝者等待線] 與 LogisticsTransferQueues 一致：未取得路權前一律停在合流點前一格，
            // 杜絕貼隊推進造成的相位損失與重疊。
            if (!isWinner) {
                return Math.max(0, totalLength - spacing);
            }

            let requiredWait = 0;
            state.activeTransfers.forEach(other => {
                if (!other || other === transfer) return;
                if (other.lineId !== node.outputGroupId) return;
                if (!Array.isArray(other.routePoints) || other.routePoints.length < 2) return;
                const otherMetrics = getTransferRouteMetrics(other);
                const otherTotal = otherMetrics.totalPixels;
                if (otherTotal <= 0) return;
                const otherDistanceNow = this.transportArrayState.getTransferDistance(other, otherTotal, getCellSize());
                const otherMaxAllowed = other.maxAllowedProgress !== undefined ? other.maxAllowedProgress : 1.0;
                const otherMaxDistance = otherMaxAllowed * otherTotal;
                const otherQueueHeld = other.queueBlocked === true && otherDistanceNow >= otherMaxDistance - 0.0001;
                const projectedDistance = otherQueueHeld
                    ? otherDistanceNow
                    : Math.min(otherMaxDistance, otherDistanceNow + stepDt * getTransferSpeed(other) * getCellSize());
                const mergeDistance = getPathDistanceToPoint(other.routePoints, mergePoint);
                const distFromMerge = projectedDistance - mergeDistance;
                const followingMainMayOverlapTurn = node.zipperTurn === 'branch' &&
                    node.awaitingMainPass !== true &&
                    distFromMerge < -0.01;
                if (Math.abs(distFromMerge) < spacing - 0.1 && !followingMainMayOverlapTurn) {
                    // [緊密放行] 勝者隨前車逐步跟進保持一格間距。
                    const followGap = distFromMerge >= 0
                        ? Math.max(0, spacing - distFromMerge)
                        : spacing;
                    requiredWait = Math.max(requiredWait, followGap);
                } else if (node.awaitingMainPass === true && node.zipperTurn !== 'branch' &&
                    distFromMerge <= -(spacing + 0.1) && distFromMerge > -spacing * 3) {
                    // [防碎片視界] 輪到主線時，三格內有逼近中的來車：於等待線候命，禁止插它前面。
                    requiredWait = Math.max(requiredWait, spacing);
                }
            });
            if (requiredWait > 0) return Math.max(0, totalLength - requiredWait);
            return totalLength;
        };

        // [固定子步長] 把「回壓佇列→堆積限制→移動→合流放行」整段以固定 stepDt 重複推進，
        // 使每子步位移 ≤ 一個合理格分數，合流閘門維持細粒度，不受外部 tick 粗細影響。
        const LOGISTICS_SUB_DT = 0.0167; // ~60Hz 等效粒度，間距收斂到 1 格/93% 滿載
        // [效能/防死亡螺旋] 子步數封頂。正常 dt≈0.05 本來就只需 3 步，封頂 4 步在正常遊玩完全不觸發；
        // 僅當主執行緒忙碌使 logicTick 延遲、deltaTime 逼近上限(0.2)時生效，避免單 tick 做 12× 工作而
        // 超過 tick 間隔(50ms)造成 tick 堆積→render 飢餓→deltaTime 更大的正反饋永久卡死。封頂後即使延遲
        // 也只是子步略粗(極端時 stepDt≈0.05/20Hz)，物品稍慢但合流不重疊，且 logic 成本有界可自動恢復。
        const MAX_LOGISTICS_SUBSTEPS = 4;
        const subSteps = Math.min(MAX_LOGISTICS_SUBSTEPS, Math.max(1, Math.ceil(deltaTime / LOGISTICS_SUB_DT - 1e-6)));
        stepDt = deltaTime / subSteps;
        for (let _subStep = 0; _subStep < subSteps; _subStep++) {
            state.activeTransfers.forEach(syncTransferArrayPosition);

            // [效能] 開啟 winner 快取窗口：本子步從此處(位置已同步)到移動迴圈前位置維持不變，
            // 期間 getLogisticsMergeThroughYieldLimit / getMergeInputMaxDistance 會對同一節點重複求 winner。
            if (conveyorSystem && typeof conveyorSystem.beginMergeWinnerCache === 'function') {
                conveyorSystem.beginMergeWinnerCache();
            }

            if (conveyorSystem && typeof conveyorSystem.applyBlockedTransferQueues === 'function') {
                conveyorSystem.applyBlockedTransferQueues(state);
            }

            // ==========================================
            // [新增] 計算每條物流線上物品的最大允許進度以實現堆積 (Backpressure & Stacking)
            // ==========================================
            const transfersByPath = new Map();
            state.activeTransfers.forEach(t => {
                if (!t) return;
                const key = getTransferPathKey(t);
                if (!transfersByPath.has(key)) {
                    transfersByPath.set(key, []);
                }
                transfersByPath.get(key).push(t);
            });

            const cellSize = getCellSize();

            // [效能] 走本次呼叫的記憶化快取，避免每子步重複做 O(nodes×lines) 的合流節點掃描。
            const isMergeInputTransfer = (transfer) => !!getMergeNodeForTransfer(transfer);
            const isMergeOutputTransfer = (transfer) => isMergeOutputTransferCached(transfer);

            Array.from(transfersByPath.entries()).sort(([, a], [, b]) => {
                const aIsMergeInput = a.some(isMergeInputTransfer);
                const bIsMergeInput = b.some(isMergeInputTransfer);
                return Number(aIsMergeInput) - Number(bIsMergeInput);
            }).forEach(([pathKey, groupTransfers]) => {
                // [對齊最長主線] 與 LogisticsTransferQueues 一致：
                // 尋找組內最長路徑作為基準路徑 (canonical)，並以此計算對齊後的距離進行排序與 Stacking 計算，
                // 避免轉彎車剛合流到 output 路線時，因 progress 重置為 0 被誤判在直行後車的後方而產生煞車。
                const canonical = groupTransfers.reduce((best, transfer) => {
                    const len = getTransferRouteMetrics(transfer).totalPixels;
                    return len > best.length ? { points: transfer.routePoints, length: len } : best;
                }, { points: null, length: 0 });

                const useCanonical = groupTransfers.length > 1 && canonical.length > 0 && groupTransfers.some(transfer => {
                    const points = transfer.routePoints || [];
                    const canonicalPoints = canonical.points || [];
                    if (points.length !== canonicalPoints.length) return true;
                    return points.some((point, index) => {
                        const other = canonicalPoints[index];
                        return !other || Math.hypot(point.x - other.x, point.y - other.y) > 0.1;
                    });
                });

                const getPointOnPathByDistance = (pts, distance) => {
                    if (!Array.isArray(pts) || pts.length < 2) return null;
                    let remaining = Math.max(0, Number(distance) || 0);
                    for (let i = 0; i < pts.length - 1; i++) {
                        const a = pts[i];
                        const b = pts[i + 1];
                        const dx = b.x - a.x;
                        const dy = b.y - a.y;
                        const len = Math.abs(dx) + Math.abs(dy); // 正交物流路徑長度
                        if (len <= 0) continue;
                        if (remaining <= len || i === pts.length - 2) {
                            const t = Math.max(0, Math.min(1, remaining / len));
                            return { x: a.x + dx * t, y: a.y + dy * t };
                        }
                        remaining -= len;
                    }
                    const last = pts[pts.length - 1];
                    return last ? { x: last.x, y: last.y } : null;
                };

                const distanceCache = new Map();
                const getDistance = (transfer) => {
                    if (distanceCache.has(transfer)) return distanceCache.get(transfer);
                    const total = getTransferRouteMetrics(transfer).totalPixels;
                    const distance = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * total;
                    const resolved = useCanonical
                        ? getPathDistanceToPoint(canonical.points, getPointOnPathByDistance(transfer.routePoints, distance))
                        : distance;
                    distanceCache.set(transfer, resolved);
                    return resolved;
                };

                // 排序：若是 useCanonical，以對齊後的 canonical 距離由大到小排序，否則依 progress 排序
                groupTransfers.sort((a, b) => {
                    const da = getDistance(a);
                    const db = getDistance(b);
                    if (Math.abs(db - da) > 0.0001) return db - da;
                    return String(a.id).localeCompare(String(b.id));
                });

                let prevMaxCanonicalDist = Infinity;
                for (let j = 0; j < groupTransfers.length; j++) {
                    const t = groupTransfers[j];
                    const metrics = getTransferRouteMetrics(t);
                    const totalLength = metrics.totalPixels;
                    if (totalLength <= 0) {
                        t.maxAllowedProgress = 1.0;
                        continue;
                    }

                    const isMergeInput = isMergeInputTransfer(t);
                    const isBreakpoint = !t.targetId && !isMergeInput;
                    if (isMergeInput) {
                        delete t.queueBlocked;
                        delete t.blockedOnBrokenLine;
                    }

                    // 動態判定末端堆積限制：
                    // 若末端點鄰近另一群組的線段起始點（表示是刪除後形成的斷點間隙），
                    // 物品停在倒數第二格（totalLength - cellSize），否則停在自然終點（totalLength）。
                    let dist_pn = totalLength;
                    if (isBreakpoint) {
                        const bpts = t.routePoints;
                        if (Array.isArray(bpts) && bpts.length >= 2) {
                            const lastPt = bpts[bpts.length - 1];
                            const tLineId = t.lineId;
                            const isGapEndpoint = (state.logisticsLines || []).some(seg => {
                                if (!seg) return false;
                                const segGroupId = seg.groupId || seg.id;
                                if (segGroupId === tLineId) return false;
                                const segPts = Array.isArray(seg.routePoints) ? seg.routePoints : [];
                                if (segPts.length < 1) return false;
                                const segStart = segPts[0];
                                return segStart && Math.hypot(segStart.x - lastPt.x, segStart.y - lastPt.y) <= cellSize * 1.5;
                            });
                            if (isGapEndpoint) {
                                dist_pn = totalLength - cellSize;
                            }
                        }
                    }

                    const startDistOnCanonical = useCanonical
                        ? getPathDistanceToPoint(canonical.points, t.routePoints[0])
                        : 0;

                    // [緊密不重疊] 主線與一般線統一使用完整物品長度作為間距，嚴防重疊。
                    let spacing = cellSize;
                    const desired = (t.progress || 0) * totalLength;

                    let maxDist = totalLength;
                    if (j === 0) {
                        if (isBreakpoint) {
                            maxDist = dist_pn;
                        } else if (isMergeInput) {
                            maxDist = Math.min(totalLength, getMergeInputMaxDistance(t, totalLength, cellSize));
                        } else {
                            maxDist = totalLength;
                        }
                    } else {
                        const frontItem = groupTransfers[j - 1];
                        const frontCanonicalDist = getDistance(frontItem);
                        const physicalLimitCanonical = Math.max(startDistOnCanonical, Math.min(frontCanonicalDist, prevMaxCanonicalDist) - spacing);

                        let limitCanonical = startDistOnCanonical + totalLength;
                        if (desired <= dist_pn) {
                            const targetLimitCanonical = startDistOnCanonical + dist_pn;
                            if (frontCanonicalDist > targetLimitCanonical || prevMaxCanonicalDist > targetLimitCanonical) {
                                limitCanonical = Math.min(targetLimitCanonical, physicalLimitCanonical);
                            } else {
                                limitCanonical = physicalLimitCanonical;
                            }
                        } else {
                            limitCanonical = physicalLimitCanonical;
                        }
                        // 將 canonical 座標系的限制還原至物品局部座標系的 maxDist
                        maxDist = Math.max(0, limitCanonical - startDistOnCanonical);
                    }

                    // [拉鏈式合流] 主線穿越車在輪到支線時於合流點前一格讓行（對佇列中任何位置的穿越車皆適用）
                    if (isMergeOutputTransfer(t) && conveyorSystem &&
                        typeof conveyorSystem.getLogisticsMergeThroughYieldLimit === 'function') {
                        const yieldLimit = conveyorSystem.getLogisticsMergeThroughYieldLimit(t, state, cellSize);
                        if (Number.isFinite(yieldLimit)) {
                            maxDist = Math.min(maxDist, yieldLimit);
                        }
                    }

                    prevMaxCanonicalDist = startDistOnCanonical + maxDist;
                    t.maxAllowedProgress = maxDist / totalLength;
                    if (isMergeInput) {
                        t.queueBlocked = maxDist < totalLength - 0.1 && desired >= maxDist - 0.1;
                    }
                }
            });

            // [效能] 關閉 winner 快取窗口：移動迴圈即將改變 transfer 位置，apply() 等後續階段需重算最新 winner。
            if (conveyorSystem && typeof conveyorSystem.endMergeWinnerCache === 'function') {
                conveyorSystem.endMergeWinnerCache();
            }

            for (let i = state.activeTransfers.length - 1; i >= 0; i--) {
                let t = state.activeTransfers[i];
                const maxAllowed = t.maxAllowedProgress !== undefined ? t.maxAllowedProgress : 1.0;
                const queueHeld = t.queueBlocked === true && t.progress >= maxAllowed - 0.0001;

                if (!queueHeld && t.progress < maxAllowed) {
                    const metrics = getTransferRouteMetrics(t);
                    const distanceDelta = stepDt * getTransferSpeed(t) * getCellSize();
                    this.transportArrayState.advanceTransfer(t, distanceDelta, metrics.totalPixels, maxAllowed, getCellSize());
                } else if (t.progress > maxAllowed) {
                    // 移動階段只標記阻塞；最終佔位由 LogisticsTransferQueues 統一裁決。
                    t.queueBlocked = true;
                }

                if (t._mergeVisualTurn && Array.isArray(t.routePoints) && t.routePoints.length >= 2) {
                    const turnPoint = { x: Number(t._mergeVisualTurn.x), y: Number(t._mergeVisualTurn.y) };
                    if (Number.isFinite(turnPoint.x) && Number.isFinite(turnPoint.y)) {
                        const metrics = getTransferRouteMetrics(t);
                        const currentDistance = Math.max(0, Math.min(1, Number(t.progress) || 0)) * metrics.totalPixels;
                        const mergeDistance = getPathDistanceToPoint(t.routePoints, turnPoint);
                        if (currentDistance > mergeDistance + cellSize + 0.1) {
                            delete t._mergeVisualTurn;
                        }
                    } else {
                        delete t._mergeVisualTurn;
                    }
                }

                // [新增] 追蹤邏輯
                if (state && state.trackedTransferId === t.id) {
                    const points = t.routePoints;
                    if (Array.isArray(points) && points.length >= 2) {
                        let totalLength = 0;
                        const segmentLengths = [];
                        for (let j = 0; j < points.length - 1; j++) {
                            const dx = points[j + 1].x - points[j].x;
                            const dy = points[j + 1].y - points[j].y;
                            const len = Math.hypot(dx, dy);
                            segmentLengths.push(len);
                            totalLength += len;
                        }

                        let remain = t.progress * totalLength;
                        let currentSegment = 0;
                        for (let j = 0; j < segmentLengths.length; j++) {
                            if (remain <= segmentLengths[j]) {
                                currentSegment = j;
                                break;
                            }
                            remain -= segmentLengths[j];
                            currentSegment = j; // fallback
                        }

                        if (t.lastSegment !== currentSegment) {
                            for (let seg = t.lastSegment + 1; seg <= currentSegment; seg++) {
                                const p1 = points[seg];
                                const p2 = points[seg + 1] || p1;
                                if (this.engine && typeof this.engine.addLog === 'function') {
                                    this.engine.addLog(`${t.itemType} 由位置${seg}(${Math.round(p1.x)},${Math.round(p1.y)})移動至位置${seg + 1}(${Math.round(p2.x)},${Math.round(p2.y)})`, 'LOGISTICS');
                                }
                            }
                            t.lastSegment = currentSegment;
                        }
                    }
                }

                if (t.progress >= 1) {
                    if (t.targetId) {
                        let target = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === t.targetId);
                        if (target) {
                            const tType = target.type1 || target.type;
                            const deposited = ResourceSystem.depositResourceToBuilding(state, this.engine, target, t.itemType, 1, null);
                            if (!deposited && !['warehouse', 'storehouse', 'barn', 'town_center', 'village'].includes(tType)) {
                                if (!target.inputBuffer) target.inputBuffer = {};
                                target.inputBuffer[t.itemType] = (target.inputBuffer[t.itemType] || 0) + 1;
                            }
                            if (window.UIManager) window.UIManager.updateValues(true);
                            // addTransportLog(`[物流] ${String(t.itemType).toUpperCase()} 已送達 ${getEntityLabel(target)}。`);
                        }
                        if (state && state.trackedTransferId === t.id) {
                            state.trackedTransferId = null; // 釋放追蹤
                            if (this.engine && typeof this.engine.addLog === 'function') {
                                this.engine.addLog(`[追蹤] 物品 ${t.itemType} 已送達目的地。`, 'LOGISTICS');
                            }
                        }
                        state.activeTransfers.splice(i, 1);
                    } else {
                        setTransferDistance(t, getTransferRouteMetrics(t).totalPixels);
                    }
                }
            }

            if (conveyorSystem && typeof conveyorSystem.applyLogisticsMergeNodes === 'function') {
                conveyorSystem.applyLogisticsMergeNodes(state);
            }

        } // ── 固定子步長迴圈結束 ──

        // 2. 讓滿足工人條件的建築自動發送物品
        state.mapEntities.forEach(ent => {
            if (!ent.outputTargets || ent.outputTargets.length === 0) return;

            const cfg = this.engine ? this.engine.getEntityConfig(ent.type1, ent.lv) : null;
            const needWorkers = cfg ? (cfg.need_villagers || 0) : 0;
            const currentWorkers = ent.assignedWorkers ? ent.assignedWorkers.length : 0;
            const isWarehouse = ['warehouse', 'storehouse', 'barn', 'town_center', 'village'].includes(ent.type1);



            // 修正規則：不再因為工人不足而停擺。
            // 1 名工人是 1 倍效率，N 名工人是 N 倍效率。
            const efficiency = Math.max(0, currentWorkers);

            const itemDispatchInterval = 2; // 基準：1 名工人每 2 秒發送一個物品。
            ent.logisticsTimer = (ent.logisticsTimer || 0) + deltaTime * efficiency;
            if (ent.logisticsTimer >= itemDispatchInterval) {
                let itemSpawned = false;

                const outputTargets = Array.isArray(ent.outputTargets) ? ent.outputTargets : [];
                const startIndex = outputTargets.length > 0
                    ? Math.max(0, Math.floor(Number(ent.nextLogisticsOutputTargetIndex) || 0)) % outputTargets.length
                    : 0;

                for (let offset = 0; offset < outputTargets.length; offset++) {
                    if (itemSpawned) break; // 一次 tick 只發送一個物品，依序分配
                    const connIndex = (startIndex + offset) % outputTargets.length;
                    const conn = outputTargets[connIndex];

                    if (isWarehouse) {
                        if (conn.filter) {
                            if (this.engine && typeof this.engine.addLog === 'function' && !ent._debugLogged) {
                                this.engine.addLog(`[DEBUG] Warehouse checking: ${conn.filter}, value: ${getStorageAmount(ent, conn.filter)}`, 'LOGISTICS');
                                ent._debugLogged = true;
                            }
                            if (getStorageAmount(ent, conn.filter) >= 1) {
                                const transfer = this.createActiveTransfer(state, ent, conn, conn.filter);
                                if (!transfer) continue;
                                if (!canStartTransfer(transfer)) continue;
                                if (!removeFromWarehouseStorage(ent, conn.filter, 1)) continue;
                                if (window.UIManager) window.UIManager.updateValues(true);
                                this.assignTransferSerial(state, transfer);
                                state.activeTransfers.push(transfer);
                                itemSpawned = true;
                                ent.nextLogisticsOutputTargetIndex = (connIndex + 1) % outputTargets.length;
                                const target = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === conn.id);
                                // addTransportLog(`[物流] ${getEntityLabel(ent)} -> ${getEntityLabel(target)} 開始輸送 ${String(conn.filter).toUpperCase()}（${getTransferRouteText(transfer)}）。`);
                            }
                        }
                    } else if (ent.outputBuffer) {
                        for (let resType in ent.outputBuffer) {
                            if (ent.outputBuffer[resType] >= 1 && conn.filter === resType) {
                                const transfer = this.createActiveTransfer(state, ent, conn, resType);
                                if (!transfer) continue;
                                if (!canStartTransfer(transfer)) continue;
                                ent.outputBuffer[resType] -= 1;
                                if (window.UIManager) window.UIManager.updateValues(true);
                                this.assignTransferSerial(state, transfer);
                                state.activeTransfers.push(transfer);
                                itemSpawned = true;
                                ent.nextLogisticsOutputTargetIndex = (connIndex + 1) % outputTargets.length;
                                const target = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === conn.id);
                                // addTransportLog(`[物流] ${getEntityLabel(ent)} -> ${getEntityLabel(target)} 開始輸送 ${String(resType).toUpperCase()}（${getTransferRouteText(transfer)}）。`);
                                break;
                            }
                        }
                    }
                }

                if (itemSpawned) {
                    ent.logisticsTimer = Math.max(0, ent.logisticsTimer - itemDispatchInterval);
                }
            }
        });

    }
}
