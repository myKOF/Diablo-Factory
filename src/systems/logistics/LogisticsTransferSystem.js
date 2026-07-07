import { UI_CONFIG } from "../../ui/ui_config.js";
import { ResourceSystem } from "../ResourceSystem.js";
import { conveyorSystem } from "../ConveyorSystem.js";
import { routePointsSignature } from "./LogisticsRouteCache.js";
import { LogisticsTransportArrayState } from "./LogisticsTransportArrayState.js";
import { runLogisticsKinematics } from "./LogisticsKinematics.js";
import { LogisticsWorkerBridge } from "./LogisticsWorkerBridge.js";

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

        const ordered = conveyorSystem && typeof conveyorSystem.orderLogisticsSegmentsByDirection === 'function'
            ? conveyorSystem.orderLogisticsSegmentsByDirection(segments)
            : [...segments].sort((a, b) => {
                const orderA = Number.isFinite(a?.splitSequenceOrder)
                    ? a.splitSequenceOrder
                    : (Number.isFinite(a?.order) ? a.order : 0);
                const orderB = Number.isFinite(b?.splitSequenceOrder)
                    ? b.splitSequenceOrder
                    : (Number.isFinite(b?.order) ? b.order : 0);
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

        ordered.forEach(seg => {
            if (!Array.isArray(seg.routePoints)) return;
            seg.routePoints.forEach(pushPoint);
        });

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

    // [送達防呆] 由路線終點反查目的地建築 id。線端點解析(LogisticsEndpointResolver)在某些情況
    // (例如密排長蛇線 orderByDirection 跨相鄰平行列短路、或終點落在端口配對門檻外)可能讓 conn.id=null,
    // 導致發出的 transfer.targetId=null → 被當成「斷點」停在終點不入庫(產率 0、物品堆滿帶子)。
    // 此處僅在 conn.id 失效時兜底:找路線終點附近(canInput 端口或建築本體)的建築。找不到則維持 null
    // (真正的斷點線),不會誤綁。
    _resolveTargetIdFromRouteEnd(state, endPoint, sourceId) {
        if (!endPoint || !Array.isArray(state.mapEntities)) return null;
        const TS = this.engine?.TILE_SIZE || 20;
        const tol = TS * 1.5;
        const entId = (e) => e.id || `${e.type1}_${e.x}_${e.y}`;
        let bestId = null;
        let bestDist = tol;
        for (const ent of state.mapEntities) {
            if (!ent || ent.isUnderConstruction || entId(ent) === sourceId) continue;
            const cfg = this.engine?.getEntityConfig ? this.engine.getEntityConfig(ent.type1) : null;
            if (!cfg || !cfg.logistics || !cfg.logistics.canInput) continue;
            const ports = (typeof window !== 'undefined' && window.UIManager?.getBuildingPortSlots)
                ? (window.UIManager.getBuildingPortSlots(ent) || [])
                : [];
            let md = Infinity;
            for (const p of ports) {
                if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
                const d = Math.abs(p.x - endPoint.x) + Math.abs(p.y - endPoint.y);
                if (d < md) md = d;
            }
            if (md <= tol && md < bestDist) { bestDist = md; bestId = entId(ent); }
        }
        return bestId;
    }

    // [多端口入庫補判] 見呼叫處說明。回傳「已抵達目標建築某 input 端口、但未被 kinematics 判定抵達」的物品,
    // 並將其移出 activeTransfers(交由呼叫端統一入庫)。
    collectTargetPortArrivals(state, alreadyArrived) {
        if (!Array.isArray(state?.activeTransfers) || state.activeTransfers.length === 0) return [];
        const TS = this.engine?.TILE_SIZE || 20;
        const arrivedIds = new Set((alreadyArrived || []).map(a => a && a.id).filter(Boolean));
        const getEntId = (e) => e ? (e.id || `${e.type1}_${e.x}_${e.y}`) : null;
        const routeLength = (points) => {
            if (!Array.isArray(points) || points.length < 2) return 0;
            let total = 0;
            for (let i = 1; i < points.length; i++) {
                total += Math.abs((points[i].x || 0) - (points[i - 1].x || 0)) +
                    Math.abs((points[i].y || 0) - (points[i - 1].y || 0));
            }
            return total;
        };
        const extra = [];
        for (let i = state.activeTransfers.length - 1; i >= 0; i--) {
            const t = state.activeTransfers[i];
            if (!t || !t.id || !t.targetId || arrivedIds.has(t.id)) continue;
            const rp = Array.isArray(t.routePoints) ? t.routePoints : null;
            const endPt = rp && rp.length >= 2 ? rp[rp.length - 1] : null;
            if (!endPt) continue;
            const tp = t.targetPoint;
            const ent = (state.mapEntities || []).find(e => getEntId(e) === t.targetId);
            if (!ent || ent.isUnderConstruction) continue;
            const ports = window.UIManager?.getBuildingPortSlots?.(ent) || [];
            const endAtTargetPoint = !!tp &&
                (Math.abs(endPt.x - tp.x) + Math.abs(endPt.y - tp.y)) <= TS * 1.5;
            const atPort = ports.some(p => p && Math.hypot((p.x || 0) - endPt.x, (p.y || 0) - endPt.y) <= TS * 1.1);
            if (!atPort && !endAtTargetPoint) continue;
            const progress = Number(t.progress) || 0;
            const maxAllowed = Number.isFinite(Number(t.maxAllowedProgress)) ? Number(t.maxAllowedProgress) : 1;
            const total = routeLength(rp);
            const heldAtTerminalGate = total > 0 &&
                progress >= maxAllowed - 0.0001 &&
                (1 - maxAllowed) * total <= TS + 0.1;
            if (progress < 0.999 && !heldAtTerminalGate) continue;
            extra.push({ id: t.id, targetId: t.targetId, itemType: t.itemType, transfer: t });
            state.activeTransfers.splice(i, 1);
        }
        return extra;
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

        // [送達防呆] conn.id 失效(null 或指向不存在建築)時,由路線終點兜底反查目的地,避免 targetId=null
        // 讓物品被當成斷點堆死在終點不入庫。解析成功則寫回 conn.id,後續同線發料免再掃描、亦修復連線綁定。
        const endPoint = (Array.isArray(routePoints) && routePoints.length >= 2)
            ? routePoints[routePoints.length - 1] : null;
        let resolvedTargetId = conn.id || null;
        const targetValid = resolvedTargetId &&
            state.mapEntities.some(e => e && (e.id || `${e.type1}_${e.x}_${e.y}`) === resolvedTargetId);
        if (!targetValid && endPoint) {
            const fallbackId = this._resolveTargetIdFromRouteEnd(state, endPoint, sourceId);
            if (fallbackId) {
                resolvedTargetId = fallbackId;
                conn.id = fallbackId;
            }
        }

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
            targetId: resolvedTargetId,
            itemType,
            progress: 0,
            transportIndex: 0,
            transportOffset: 0,
            transportCellSize: this.engine?.TILE_SIZE || 20,
            lineId: conn.lineId || null,
            efficiency: Number(conn.efficiency) || 0,
            routePoints,
            // [斷線防護] 記下「目標端口」座標(路線終點)。抵達判定時據此確認路線終點仍在目標端口,
            // 避免線被切斷後路線止於斷點卻被誤判已送達而讓物品憑空消失。
            targetPoint: (Array.isArray(routePoints) && routePoints.length >= 2)
                ? { x: routePoints[routePoints.length - 1].x, y: routePoints[routePoints.length - 1].y }
                : null,
            targetPort: conn.targetPort
                ? { x: conn.targetPort.x, y: conn.targetPort.y, dir: conn.targetPort.dir, width: conn.targetPort.width }
                : null
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
            // [效能] transfer 僅在此(20Hz)移動/增減,但渲染跑 60Hz。遞增版本號讓 render 端只在真正變動時
            // 才重畫 transfer 層(sprite 為世界座標,相機移動由 Phaser 處理、不需重畫),省去重複的位置計算。
            state.logisticsTransferVersion = (state.logisticsTransferVersion || 0) + 1;
        }
    }

    // [Web Worker] 依旗標延遲建立/拆除運動學 worker。預設關閉。
    // 啟用方式(會持久化,重整後保留):console 執行 setLogisticsWorker(true) / setLogisticsWorker(false)。
    // 或一次性:window.LOGISTICS_WORKER = true(不持久化)。
    _maybeInitWorker() {
        if (typeof window !== 'undefined') {
            // 首次:提供持久化開關 + 由 localStorage 還原偏好
            if (typeof window.setLogisticsWorker !== 'function') {
                window.setLogisticsWorker = (on) => {
                    window.LOGISTICS_WORKER = !!on;
                    try { localStorage.setItem('LOGISTICS_WORKER', on ? '1' : '0'); } catch (e) { }
                    return `物流 Web Worker: ${on ? '啟用' : '停用'}(已記住)`;
                };
            }
            // [TEMP-DIAG][worker 內部狀態追查] console 執行 setLogisticsWorkerLineDiag() (不帶參數,預設
            // 監控全部物流線)開啟後,worker 每步結束會逐線檢查「凍結物品數」是否變化,一有變化就把該線
            // 前幾筆完整欄位(含 worker 內部才有的 _queuedDistance/transportIndex/transportOffset)
            // 寫進遊戲內日誌(分類 LOGISTICS,見 _logWorkerDiagEvent),可被錄製功能一併收進匯出腳本。
            // 若只想鎖定一條線降低量,傳入該 lineId:setLogisticsWorkerLineDiag('該lineId')。
            // 執行 setLogisticsWorkerLineDiag(false) 關閉。
            if (typeof window.setLogisticsWorkerLineDiag !== 'function') {
                window.setLogisticsWorkerLineDiag = (lineId = '*') => {
                    if (!this._workerBridge) return '尚未啟用 Web Worker(setLogisticsWorker(true) 先開)';
                    if (!lineId) {
                        this._workerBridge.setDiagLineId(null);
                        return '[WORKER診斷] 已關閉';
                    }
                    this._workerBridge.setDiagLineId(lineId);
                    return lineId === '*' ? '[WORKER診斷] 開始追蹤全部物流線' : `[WORKER診斷] 開始追蹤 lineId=${lineId}`;
                };
            }
            // [TEMP-DIAG] console 執行 dumpLogisticsWorkerDiag() 一次性把 worker 緩衝區內容印出來
            // (不即時洗版;async,執行後結果會印在 console,也存於 window.__logisticsWorkerDiagDump)。
            if (typeof window.dumpLogisticsWorkerDiag !== 'function') {
                window.dumpLogisticsWorkerDiag = async () => {
                    if (!this._workerBridge) return '尚未啟用 Web Worker(setLogisticsWorker(true) 先開)';
                    const entries = await this._workerBridge.requestDiagDump();
                    window.__logisticsWorkerDiagDump = entries;
                    console.log('[WORKER診斷-DUMP] 共 ' + entries.length + ' 筆', JSON.stringify(entries, null, 2));
                    return `共 ${entries.length} 筆,已印出並存於 window.__logisticsWorkerDiagDump`;
                };
            }
            // [TEMP-DIAG] 實機堵點一次性快照。console 執行 await dumpLogisticsStuckDiag()
            // 會輸出接近終點/排隊中的 transfer、目標端口命中、線段 metadata 與 worker 診斷摘要。
            if (typeof window.dumpLogisticsStuckDiag !== 'function') {
                window.dumpLogisticsStuckDiag = async () => {
                    const state = window.GAME_STATE || this.state;
                    const TS = this.engine?.TILE_SIZE || 20;
                    const getId = (ent) => window.UIManager?.getEntityId?.(ent) || ent?.id || null;
                    const point = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
                        ? { x: Math.round(p.x), y: Math.round(p.y) }
                        : null;
                    const dist = (a, b) => a && b ? Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0)) : Infinity;
                    const routeTotal = (route) => {
                        if (!Array.isArray(route) || route.length < 2) return 0;
                        let total = 0;
                        for (let i = 1; i < route.length; i++) {
                            total += Math.abs((route[i].x || 0) - (route[i - 1].x || 0)) +
                                Math.abs((route[i].y || 0) - (route[i - 1].y || 0));
                        }
                        return total;
                    };
                    const pointAtDistance = (route, distance) => {
                        if (!Array.isArray(route) || route.length === 0) return null;
                        let remaining = Math.max(0, Number(distance) || 0);
                        for (let i = 1; i < route.length; i++) {
                            const a = route[i - 1];
                            const b = route[i];
                            const len = Math.abs((b.x || 0) - (a.x || 0)) + Math.abs((b.y || 0) - (a.y || 0));
                            if (remaining <= len || i === route.length - 1) {
                                const t = len > 0 ? Math.max(0, Math.min(1, remaining / len)) : 0;
                                return {
                                    x: (a.x || 0) + ((b.x || 0) - (a.x || 0)) * t,
                                    y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * t
                                };
                            }
                            remaining -= len;
                        }
                        return route[route.length - 1] || null;
                    };
                    const portsOf = (ent) => window.UIManager?.getBuildingPortSlots?.(ent) || [];
                    const lineGroups = new Map();
                    for (const line of (state.logisticsLines || [])) {
                        const gid = line?.groupId || line?.id || null;
                        if (!gid) continue;
                        if (!lineGroups.has(gid)) lineGroups.set(gid, []);
                        lineGroups.get(gid).push(line);
                    }
                    const entityById = new Map((state.mapEntities || []).map(ent => [getId(ent), ent]));
                    const outputTargets = [];
                    for (const ent of (state.mapEntities || [])) {
                        for (const conn of (ent.outputTargets || [])) {
                            outputTargets.push({
                                sourceId: getId(ent),
                                id: conn?.id || null,
                                lineId: conn?.lineId || null,
                                sourcePort: point(conn?.sourcePort),
                                targetPort: point(conn?.targetPort),
                                routeEnd: Array.isArray(conn?.routePoints) && conn.routePoints.length
                                    ? point(conn.routePoints[conn.routePoints.length - 1])
                                    : null
                            });
                        }
                    }
                    const transferReports = (state.activeTransfers || [])
                        .filter(t => {
                            const progress = Number(t?.progress) || 0;
                            const maxAllowed = t?.maxAllowedProgress !== undefined ? Number(t.maxAllowedProgress) : 1;
                            return progress >= 0.95 ||
                                t?.queueBlocked === true ||
                                Math.abs(progress - maxAllowed) < 0.0001;
                        })
                        .map(t => {
                            const route = Array.isArray(t.routePoints) ? t.routePoints : [];
                            const routeEnd = route.length >= 2 ? route[route.length - 1] : null;
                            const totalPixels = routeTotal(route);
                            const hasArrayPosition = Number.isFinite(Number(t.transportIndex)) &&
                                Number.isFinite(Number(t.transportOffset));
                            const currentDistance = hasArrayPosition
                                ? Math.max(0, Math.min(totalPixels,
                                    (Math.max(0, Math.floor(Number(t.transportIndex) || 0)) +
                                        Math.max(0, Math.min(1, Number(t.transportOffset) || 0))) * TS))
                                : Math.max(0, Math.min(1, Number(t.progress) || 0)) * totalPixels;
                            const maxAllowedDistance = Math.max(0, Math.min(1, Number(t.maxAllowedProgress ?? 1))) * totalPixels;
                            const currentPoint = pointAtDistance(route, currentDistance);
                            const target = entityById.get(t.targetId || null) || null;
                            const targetPorts = portsOf(target);
                            const nearestTargetPort = targetPorts
                                .map(port => ({ port, distance: dist(port, routeEnd) }))
                                .sort((a, b) => a.distance - b.distance)[0] || null;
                            const targetPointDistance = dist(routeEnd, t.targetPoint);
                            const targetPortDistance = dist(routeEnd, t.targetPort);
                            const reachedTargetPoint = !t.targetPoint || targetPointDistance <= TS * 1.5;
                            const reachedTargetPort = !!t.targetPort && targetPortDistance <= TS * 1.5;
                            const reachedTarget = reachedTargetPoint || reachedTargetPort;
                            const terminalGateArrival = !!t.targetId && reachedTarget && totalPixels > 0 &&
                                currentDistance >= totalPixels - TS - 0.1;
                            const groupLines = lineGroups.get(t.lineId || '') || [];
                            return {
                                id: t.id,
                                itemType: t.itemType || null,
                                lineId: t.lineId || null,
                                sourceId: t.sourceId || null,
                                targetId: t.targetId || null,
                                progress: Number((Number(t.progress) || 0).toFixed(4)),
                                maxAllowedProgress: t.maxAllowedProgress ?? null,
                                queueBlocked: t.queueBlocked === true,
                                transportIndex: t.transportIndex ?? null,
                                transportOffset: t.transportOffset ?? null,
                                transportDistance: Math.round(currentDistance),
                                totalPixels: Math.round(totalPixels),
                                distanceToEnd: Math.round(Math.max(0, totalPixels - currentDistance)),
                                maxAllowedDistance: Math.round(maxAllowedDistance),
                                maxAllowedDistanceToEnd: Math.round(Math.max(0, totalPixels - maxAllowedDistance)),
                                currentPoint: point(currentPoint),
                                currentToTargetPointDistance: Number.isFinite(dist(currentPoint, t.targetPoint))
                                    ? Math.round(dist(currentPoint, t.targetPoint))
                                    : null,
                                routeLen: route.length,
                                routeStart: point(route[0]),
                                routeEnd: point(routeEnd),
                                targetPoint: point(t.targetPoint),
                                targetPort: point(t.targetPort),
                                targetPointDistance: Number.isFinite(targetPointDistance) ? Math.round(targetPointDistance) : null,
                                targetPortDistance: Number.isFinite(targetPortDistance) ? Math.round(targetPortDistance) : null,
                                reachedTargetPoint,
                                reachedTargetPort,
                                reachedTarget,
                                terminalGateArrival,
                                targetPortCount: targetPorts.length,
                                nearestTargetPort: nearestTargetPort ? point(nearestTargetPort.port) : null,
                                nearestTargetPortDistance: nearestTargetPort ? Math.round(nearestTargetPort.distance) : null,
                                atAnyTargetPort: !!nearestTargetPort && nearestTargetPort.distance <= TS * 1.1,
                                relevantMergeNodes: (state.logisticsMergeNodes || [])
                                    .filter(node => node && (node.outputGroupId === t.lineId ||
                                        (Array.isArray(node.inputGroupIds) && node.inputGroupIds.includes(t.lineId))))
                                    .map(node => ({
                                        id: node.id || null,
                                        outputGroupId: node.outputGroupId || null,
                                        inputGroupIds: Array.isArray(node.inputGroupIds) ? node.inputGroupIds.slice() : [],
                                        point: point(node.point || { x: node.x, y: node.y }),
                                        currentActiveSlot: node.currentActiveSlot ?? null,
                                        roundRobinIndex: node.roundRobinIndex ?? null,
                                        zipperTurn: node.zipperTurn || null,
                                        awaitingMainPass: node.awaitingMainPass === true,
                                        lastAdmittedTransferId: node.lastAdmittedTransferId || null,
                                        lastThroughTransferId: node.lastThroughTransferId || null
                                    })),
                                lineSegmentCount: groupLines.length,
                                lineSegments: groupLines.slice(0, 12).map(line => {
                                    const pts = Array.isArray(line.routePoints) ? line.routePoints : [];
                                    return {
                                        id: line.id || null,
                                        groupId: line.groupId || null,
                                        sourceId: line.sourceId || null,
                                        targetId: line.targetId || null,
                                        sourcePort: point(line.sourcePort),
                                        targetPort: point(line.targetPort),
                                        targetPoint: point(line.targetPoint),
                                        start: point(pts[0]),
                                        end: point(pts[pts.length - 1])
                                    };
                                }),
                                matchingOutputTargets: outputTargets.filter(conn => conn.lineId === t.lineId || conn.id === t.targetId)
                            };
                        });
                    const workerEntries = this._workerBridge && typeof this._workerBridge.requestDiagDump === 'function'
                        ? await this._workerBridge.requestDiagDump()
                        : [];
                    const report = {
                        time: new Date().toISOString(),
                        workerActive: !!this._workerBridge,
                        activeTransfers: (state.activeTransfers || []).length,
                        nearEndOrBlockedTransfers: transferReports,
                        counts: {
                            noTargetId: transferReports.filter(t => !t.targetId).length,
                            targetPointMismatch: transferReports.filter(t => t.targetPoint && !t.reachedTargetPoint).length,
                            atPortButNotReachedTargetPoint: transferReports.filter(t => t.atAnyTargetPort && !t.reachedTargetPoint).length,
                            noLineSegments: transferReports.filter(t => t.lineSegmentCount === 0).length
                        },
                        outputTargets,
                        workerDiagTail: workerEntries.slice(-20)
                    };
                    window.__logisticsStuckDiag = report;
                    console.log('[物流堵點診斷]', JSON.stringify(report, null, 2));
                    return report;
                };
            }
            // [診斷] 在真實場景量測產率衰減來源。console 執行 logiDiag()(預設取樣 6 秒),
            // 結束後印出:發料率/入庫率(每秒)、在途數量趨勢、凍結(progress 多秒未動)數、
            // worker 落後(pendingDt/inFlight)、平均沿線間距。用以區分:worker 落後 / 凍結孤兒 / 變疏 / 欠發。
            if (typeof window.logiDiag !== 'function') {
                window.logiDiag = (secs = 6) => {
                    const sys = this;
                    const state = window.GAME_STATE;
                    if (!state) return '無 GAME_STATE';
                    const sampleProgress = () => {
                        const m = new Map();
                        for (const t of (state.activeTransfers || [])) if (t && t.id) m.set(t.id, t.progress || 0);
                        return m;
                    };
                    const startDelivered = sys._diagDelivered || 0;
                    const startDispatched = sys._diagDispatched || 0;
                    const t0 = performance.now();
                    const progAt0 = sampleProgress();
                    const activeSeries = [];
                    const tickT = setInterval(() => { activeSeries.push((state.activeTransfers || []).length); }, 500);
                    console.log(`[logiDiag] 取樣 ${secs}s...`);
                    setTimeout(() => {
                        clearInterval(tickT);
                        const dtSec = (performance.now() - t0) / 1000;
                        const delivered = (sys._diagDelivered || 0) - startDelivered;
                        const dispatched = (sys._diagDispatched || 0) - startDispatched;
                        const progAt1 = sampleProgress();
                        // 凍結:取樣前後都存在、progress 完全沒變、且未在合流門口被正當卡住(maxAllowedProgress>progress)
                        let frozen = 0, persisted = 0;
                        for (const t of (state.activeTransfers || [])) {
                            if (!t || !t.id || !progAt0.has(t.id)) continue;
                            persisted++;
                            const p0 = progAt0.get(t.id), p1 = t.progress || 0;
                            const max = t.maxAllowedProgress !== undefined ? t.maxAllowedProgress : 1;
                            if (Math.abs(p1 - p0) < 1e-6 && p1 < 0.999 && p1 < max - 1e-4 && t.queueBlocked !== true) frozen++;
                        }
                        // 平均沿線間距(以 lineId 分組,取相鄰 progress*routeLen 差)
                        const byLine = new Map();
                        for (const t of (state.activeTransfers || [])) {
                            if (!t || !t.lineId || !Array.isArray(t.routePoints) || t.routePoints.length < 2) continue;
                            let len = 0; for (let i = 1; i < t.routePoints.length; i++) len += Math.abs(t.routePoints[i].x - t.routePoints[i - 1].x) + Math.abs(t.routePoints[i].y - t.routePoints[i - 1].y);
                            if (!byLine.has(t.lineId)) byLine.set(t.lineId, []);
                            byLine.get(t.lineId).push((t.progress || 0) * len);
                        }
                        let gapSum = 0, gapN = 0;
                        for (const arr of byLine.values()) { arr.sort((a, b) => a - b); for (let i = 1; i < arr.length; i++) { gapSum += arr[i] - arr[i - 1]; gapN++; } }
                        // [入庫=0 診斷] 為何抵達不入庫:統計接近終點(progress≥0.99)、無 targetId、終點偏離 targetPoint 的數量。
                        const cell = this.engine?.TILE_SIZE || 20;
                        let nearEnd = 0, noTargetId = 0, tpMismatch = 0, sample = null;
                        for (const t of (state.activeTransfers || [])) {
                            if (!t) continue;
                            if (!t.targetId) noTargetId++;
                            const p = t.progress || 0;
                            if (p >= 0.99) {
                                nearEnd++;
                                const rp = t.routePoints;
                                const endPt = Array.isArray(rp) && rp.length >= 2 ? rp[rp.length - 1] : null;
                                const tp = t.targetPoint;
                                const reached = !tp || (endPt && (Math.abs(endPt.x - tp.x) + Math.abs(endPt.y - tp.y)) <= cell * 1.5);
                                if (tp && !reached) tpMismatch++;
                                if (!sample) sample = {
                                    progress: +p.toFixed(3), targetId: t.targetId || null, lineId: t.lineId || null,
                                    endPt: endPt ? { x: Math.round(endPt.x), y: Math.round(endPt.y) } : null,
                                    targetPoint: tp ? { x: Math.round(tp.x), y: Math.round(tp.y) } : null,
                                    reached: !!reached, queueBlocked: t.queueBlocked === true,
                                    maxAllowed: +(t.maxAllowedProgress !== undefined ? t.maxAllowedProgress : 1).toFixed(3)
                                };
                            }
                        }
                        const br = sys._workerBridge;
                        const report = {
                            worker: !!br,
                            活躍: (state.activeTransfers || []).length,
                            活躍趨勢: activeSeries,
                            發料每秒: +(dispatched / dtSec).toFixed(2),
                            入庫每秒: +(delivered / dtSec).toFixed(2),
                            凍結數: frozen,
                            取樣存活數: persisted,
                            worker_pendingDt: br ? +(br._pendingDt || 0).toFixed(3) : null,
                            worker_inFlight: br ? br.inFlight : null,
                            worker單步ms: br ? +(br._stepTimeEma || 0).toFixed(1) : null,
                            worker計算ms: br ? +(br._computeMsEma || 0).toFixed(1) : null,
                            worker位置落後ms: br ? +(br.getPositionLagSeconds(0) * 1000).toFixed(0) : null,
                            待消費抵達佇列: br ? (br._arrivalQueue ? br._arrivalQueue.length : 0) : null,
                            平均間距px: gapN ? +(gapSum / gapN).toFixed(1) : 0,
                            cellSize: this.engine?.TILE_SIZE || 20,
                            接近終點數: nearEnd,
                            無targetId數: noTargetId,
                            終點偏離targetPoint數: tpMismatch,
                            卡終點樣本: sample
                        };
                        console.log('[logiDiag] 結果:', JSON.stringify(report, null, 2));
                        window.__logiDiagLast = report;
                    }, secs * 1000);
                    return `[logiDiag] 量測中,請維持遊戲運行 ${secs} 秒,結果將印在 console(也存於 window.__logiDiagLast)`;
                };
            }
            if (window.LOGISTICS_WORKER === undefined) {
                // [效能] 非測試環境(無 navigator.webdriver 且無 ?test 參數)預設啟用 Web Worker
                const isTest = typeof navigator !== 'undefined' &&
                    (navigator.webdriver || (typeof window !== 'undefined' && window.location && window.location.search.includes('test')));
                window.LOGISTICS_WORKER = !isTest;
                try {
                    const saved = localStorage.getItem('LOGISTICS_WORKER');
                    if (saved === '0') window.LOGISTICS_WORKER = false;
                    else if (saved === '1') window.LOGISTICS_WORKER = true;
                } catch (e) { }
            }
        }
        const want = typeof window !== 'undefined' && window.LOGISTICS_WORKER === true && typeof Worker !== 'undefined';
        if (want && !this._workerBridge) {
            try {
                const url = new URL('./logistics.worker.js', import.meta.url);
                this._workerBridge = new LogisticsWorkerBridge(url);
                this._workerBridge.onDiagEvent = (entry) => this._logWorkerDiagEvent(entry);
                if (this.engine && typeof this.engine.addLog === 'function') this.engine.addLog('[物流] Web Worker 運動學已啟用', 'SYSTEM');
            } catch (err) {
                console.error('[物流] Web Worker 啟用失敗,回退主執行緒同步:', err);
                this._workerBridge = null;
                if (typeof window !== 'undefined') window.LOGISTICS_WORKER = false;
            }
        } else if (!want && this._workerBridge) {
            this._workerBridge.dispose();
            this._workerBridge = null;
        }
    }

    // [TEMP-DIAG] 把 worker 即時轉發的診斷事件(setLogisticsWorkerLineDiag 追蹤中才會產生,量少)
    // 轉成可讀文字寫入遊戲內日誌系統(分類 LOGISTICS)。這樣勾選「物流訊息」錄製時,
    // 診斷資料會隨錄製檔案一併匯出,不必再手動跑 dumpLogisticsWorkerDiag() 來回貼log。
    _logWorkerDiagEvent(entry) {
        if (!entry || !this.engine || typeof this.engine.addLog !== 'function') return;
        let msg;
        if (entry.kind === 'topology') {
            const parts = Array.isArray(entry.changed)
                ? entry.changed.map(c => `${c.lineId}:${c.segCountBefore}→${c.segCountAfter}`)
                : [];
            msg = `[WORKER診斷] 拓樸變更 段數異動[${parts.join(', ')}] 總線段=${entry.totalLinesAfter} ` +
                `合流節點=${entry.mergeNodesAfter} epoch=${entry.topoEpoch}`;
        } else if (entry.kind === 'frozenChange') {
            const sample = Array.isArray(entry.sample) ? entry.sample.slice(0, 2) : [];
            msg = `[WORKER診斷] line=${entry.lineId} 凍結物品數 ${entry.frozenCountBefore}→${entry.frozenCountNow}(共${entry.itemCount}件) seq=${entry.seq}` +
                (sample.length ? ` ${JSON.stringify(sample)}` : '');
        } else if (entry.kind === 'readdMismatch' || entry.kind === 'freshAddMismatch') {
            const label = entry.kind === 'readdMismatch' ? '重送' : '首次新增';
            msg = `[WORKER診斷] worker ${label}落差 id=${entry.id} lineId=${entry.lineId} progress=${entry.newProgress} ` +
                `落差 ${entry.oldMismatch === null ? '(無舊值)' : entry.oldMismatch + 'px'}→${entry.newMismatch}px ` +
                `舊(end=${JSON.stringify(entry.oldEnd)},target=${JSON.stringify(entry.oldTargetPoint)}) ` +
                `新(end=${JSON.stringify(entry.newEnd)},target=${JSON.stringify(entry.newTargetPoint)})`;
        } else {
            msg = `[WORKER診斷] ${JSON.stringify(entry)}`;
        }
        this.engine.addLog(msg, 'LOGISTICS');
    }

    // [C: 密度上限] 在途物品上限(0=不限)。可持久化調整:console 執行 setMaxActiveTransfers(n)。
    // 預設 700(維持 worker 接近即時、源頭不塞車);想要更多物品可調高(較卡),想更順可調低。
    _getMaxActiveTransfers() {
        if (typeof window === 'undefined') return 0;
        if (typeof window.setMaxActiveTransfers !== 'function') {
            window.setMaxActiveTransfers = (n) => {
                window.MAX_ACTIVE_TRANSFERS = Math.max(0, Math.floor(Number(n) || 0));
                try { localStorage.setItem('MAX_ACTIVE_TRANSFERS', String(window.MAX_ACTIVE_TRANSFERS)); } catch (e) { }
                return `物品上限: ${window.MAX_ACTIVE_TRANSFERS || '不限'}(已記住)`;
            };
        }
        if (window.MAX_ACTIVE_TRANSFERS === undefined) {
            let v = 0; // 預設不限(滿載產線應保持滿載;真正解法是讓 sim 夠快,而非限流)。需要時自行 setMaxActiveTransfers(n)。
            try { const s = localStorage.getItem('MAX_ACTIVE_TRANSFERS'); if (s !== null) v = Math.max(0, parseInt(s, 10) || 0); } catch (e) { }
            window.MAX_ACTIVE_TRANSFERS = v;
        }
        return Number(window.MAX_ACTIVE_TRANSFERS) || 0;
    }

    // [拓樸變更範圍偵測] 依 groupId 彙總每條物流線段的輕量簽章(id/點數/起訖點/來源目標)+ 該群組目前的
    // 線段數,供上方逐 tick 比對「這次拓樸變更實際改到了哪些群組」以及「是否有群組被切分(線段數變少)」。
    _computeLogisticsGroupSigMap(state) {
        const map = new Map();
        for (const line of (state.logisticsLines || [])) {
            if (!line) continue;
            const gid = line.groupId || line.id;
            if (!gid) continue;
            const rp = Array.isArray(line.routePoints) ? line.routePoints : null;
            const rpLen = rp ? rp.length : 0;
            const first = rpLen ? `${rp[0].x},${rp[0].y}` : '';
            const last = rpLen ? `${rp[rpLen - 1].x},${rp[rpLen - 1].y}` : '';
            const seg = `${line.id || ''}:${rpLen}:${first}:${last}:${line.targetId || ''}:${line.sourceId || ''}`;
            const entry = map.get(gid);
            if (entry) { entry.sig += `|${seg}`; entry.segCount++; }
            else map.set(gid, { sig: seg, segCount: 1 });
        }
        return map;
    }

    _processAutomatedLogisticsImpl(state, deltaTime) {
        if (!state.activeTransfers) state.activeTransfers = [];

        // [建造瞬移防護] 建造/刪除物流線的那一幀主執行緒被同步建造流程阻塞 200~400ms,下一個 logic tick
        // 的 deltaTime 暴增(引擎上限 0.2s),模擬以粗步長一次補齊 → 全線物品同幀前跳數格(甚至一步跨過
        // 抵達閘門直接入庫),渲染插值遇 >5% 進度跳變會直接吸附 → 使用者看到「拉分支瞬間物品瞬移/消失」。
        // 對策:偵測到物流線段數變化(建造/刪除)的這個 tick,把 dt 鉗制回名目步長——被丟棄的是「卡頓那
        // 一幀的補償時間」,僅建造當下一次;物品從原位置以正常速度繼續,符合「拓樸變更不得改變物品當下
        // 位置」的不變量。持續高負載下的 worker 粗步長補償(bridge._pendingDt)不受影響。
        const logisticsLinesLen = Array.isArray(state.logisticsLines) ? state.logisticsLines.length : 0;
        if (this._lastLogisticsLinesLen !== undefined && logisticsLinesLen !== this._lastLogisticsLinesLen) {
            deltaTime = Math.min(deltaTime, 0.05);
            if (this._workerBridge && Number.isFinite(this._workerBridge._pendingDt)) {
                this._workerBridge._pendingDt = Math.min(this._workerBridge._pendingDt, 0.05);
            }
        }
        this._lastLogisticsLinesLen = logisticsLinesLen;

        // [Web Worker] 運動學來源:
        //   預設(旗標關閉)→ 主執行緒就地同步跑 runLogisticsKinematics(已驗證、零延遲)。
        //   啟用 worker(window.LOGISTICS_WORKER=true)→ 套用 worker 上一批結果(1-tick 延遲),
        //   昂貴計算移出主執行緒並行。抵達終點者皆由下方統一就地入庫。
        this._maybeInitWorker();
        let arrivals;
        if (this._workerBridge) {
            arrivals = this._workerBridge.pullResult(state);
            // [TEMP-DIAG] 每 tick(不侷限在拓樸變更後的 20-tick 重算視窗內)直接掃一次主執行緒自己的
            // activeTransfers,找 routePoints 末端跟 targetPoint 對不上的項目——因為凍結物品往往是在
            // 拓樸變更後「過了好幾秒、進度推進到終點附近」才顯現落差,遠超過 20-tick(=1 秒)視窗,
            // 之前把診斷放在視窗內導致永遠看不到。每個 id 只記第一次發現,避免每 tick 重複洗版。
            if (window.LOGISTICS_WORKER === true && this.engine && typeof this.engine.addLog === 'function') {
                if (!this._diagReportedMismatchIds) this._diagReportedMismatchIds = new Set();
                const TS = this.engine?.TILE_SIZE || 20;
                for (const t of state.activeTransfers) {
                    if (!t || !t.id || this._diagReportedMismatchIds.has(t.id)) continue;
                    const end = Array.isArray(t.routePoints) && t.routePoints.length ? t.routePoints[t.routePoints.length - 1] : null;
                    const tp = t.targetPoint;
                    const md = (end && tp) ? Math.hypot((end.x || 0) - tp.x, (end.y || 0) - tp.y) : 0;
                    if (md > TS * 1.5) {
                        this._diagReportedMismatchIds.add(t.id);
                        this.engine.addLog(
                            `[WORKER診斷] 主執行緒側落差(每tick掃描) id=${t.id} lineId=${t.lineId} 落差=${Math.round(md)}px progress=${(+t.progress || 0).toFixed(4)} routeEnd=${JSON.stringify(end)} targetPoint=${JSON.stringify(tp)}`,
                            'LOGISTICS'
                        );
                    }
                }
            }
            // [拓樸變更重新路由] worker 持有在途物品的「權威路線」;線段被延伸/重塑/刪除後,這些 routePoints
            // 可能指向已不存在的舊末端而失效。主執行緒在 build/delete 時的重算未必涵蓋所有在途物品
            // (例如合流輸出群組的已合流物品),而 worker 自身不會重算 → 物品沿失效舊路推進、走錯路堵死
            // (關 worker 則正常)。解法:於本 tick 偵測拓樸簽章變動時,先在主執行緒重算全部在途路線
            // (沿用已驗證的 rerouter),稍後 pushStep 的 _maybeSyncTopology 會以同一簽章把修正後的路線重送 worker。
            if (typeof this._workerBridge._topologySignature === 'function') {
                const topoSig = this._workerBridge._topologySignature(state);
                // [拓樸變更範圍偵測] 每個 tick 都取樣一次逐群組簽章,而非只在偵測到變動的那個 tick 才取樣,
                // 否則變動當下(baseline 尚未建立)那一拍會被誤判成「什麼都沒變」而漏掉真正改到的群組
                // (例如斷點延伸接通端口的那個 tick)。上一拍快照永遠是這一拍 diff 的正確基準。
                const newGroupSig = this._computeLogisticsGroupSigMap(state);
                const changedGroupIds = new Set();
                // [分叉/切分保護] 中段延伸從既有(可能已合流)群組拉出新分支時,舊群組會被 detach 成孤兒群組
                // (線段數變少)。這類「群組被切分」在 live 拖曳+真實 worker 時序下是已知的多步 timing race
                // (見 memory: logistics-worker-split-reroute-bug、對話「Logistics line routing issue」——
                // 三個 headless 重現皆正確改線、抓不到 live 才會壞的案例,故無法只靠精準 diff 保證修到)。
                // 偵測到任何群組線段數變少(切分/detach 的訊號)時,保守退回舊有的「全地圖不篩選」重算/重送,
                // 犧牲一次 0.5~1 秒的全域延遲(僅切分當下這一次,非每次建線都觸發),換取不比切分修復前更差。
                let splitDetected = false;
                if (this._lastLogisticsGroupSig) {
                    const prev = this._lastLogisticsGroupSig;
                    for (const gid of new Set([...prev.keys(), ...newGroupSig.keys()])) {
                        const prevEntry = prev.get(gid);
                        const newEntry = newGroupSig.get(gid);
                        if ((prevEntry?.sig) !== (newEntry?.sig)) changedGroupIds.add(gid);
                        if (prevEntry && (newEntry?.segCount || 0) < prevEntry.segCount) splitDetected = true;
                    }
                }
                this._lastLogisticsGroupSig = newGroupSig;

                if (this._lastWorkerTopoSig !== undefined && this._lastWorkerTopoSig !== topoSig) {
                    // worker 結果延遲一拍:在它收到新拓樸前的空窗會以舊拓樸把正在合流的物品 remap 到舊輸出路線
                    // (指向已切離的舊下游)。單拍重算來不及涵蓋這批殘留,故開一段視窗持續清理。
                    this._workerRerouteCountdown = 20;
                    this._workerRerouteBlanket = false;
                }
                if (splitDetected) this._workerRerouteBlanket = true;
                this._lastWorkerTopoSig = topoSig;
                if (this._workerRerouteCountdown > 0) {
                    this._workerRerouteCountdown--;
                    // [範圍收斂] 過去以 null(=全地圖不篩選)呼叫 updateActiveTransfersOnLogisticsChange,
                    // 導致建造/刪除任一物流線(即使與其他物品的路線完全無關)都會讓地圖上「所有」在途物品
                    // 連續 20 tick 被重新計算並從 sentIds 移除強制重送 worker——包含已抵達終點正等待 worker
                    // 確認入庫的物品,其 worker 端權威 progress 被主執行緒的舊快照覆蓋,表現為「隨便建一條
                    // 無關的線,所有物品送達終點後都會多停約 0.5~1 秒才消失」。
                    // 改為只對「本次拓樸變更真正改動到的群組」(changedGroupIds,見上方逐 tick 偵測)
                    // +「合流節點輸入/輸出群組」做這個修補;真正無關的線與物品完全不受影響。
                    // 「本次改動到的群組」涵蓋斷點延伸後接通目標端口這類情境——物品在斷點卡住時 lineId 對應
                    // 舊(較短)路線,延伸/接通後同一 groupId 的線段簽章(端點/點數)改變會被偵測為「已改動」,
                    // 物品的 sentIds 因而被清除以重送修正後路線,否則物品的主執行緒路線雖已被
                    // LogisticsLineFinalizer 修好,worker 端仍持有舊路線副本、永遠算不到新終點 → 物品在端口前
                    // 堵死不入庫。
                    //
                    // [分叉/切分逃生艙] 但若本次(或本視窗內任一 tick)偵測到群組被切分(splitDetected/
                    // _workerRerouteBlanket),精準 diff 不足以信任——這正是「中段延伸 fork」已知的多步
                    // timing race(worker 合流 remap 跟切分動作之間的時序競態,3 個 headless 重現皆無法
                    // 重現、只在 live 拖曳+真實 worker 時序下出現,見對話「Logistics line routing issue」)。
                    // 此時退回舊有全地圖不篩選行為,不比修這個 bug 之前更差。
                    const affectedGroupIds = this._workerRerouteBlanket
                        ? null
                        : new Set(changedGroupIds);
                    // [合流競態保護] worker 結果延遲一拍:在它收到新拓樸前的空窗會以舊拓樸把正在合流的物品
                    // remap 到舊輸出路線(指向已切離的舊下游)。這與該群組「本身簽章是否變動」無關(問題在
                    // 時序競態),故合流節點涉及的群組無論是否偵測到變動都持續納入,直到倒數視窗結束。
                    if (affectedGroupIds) {
                        for (const n of (state.logisticsMergeNodes || [])) {
                            if (!n) continue;
                            if (n.outputGroupId) affectedGroupIds.add(n.outputGroupId);
                            if (Array.isArray(n.inputGroupIds)) n.inputGroupIds.forEach(id => id && affectedGroupIds.add(id));
                        }
                    }
                    if (affectedGroupIds === null || affectedGroupIds.size > 0) {
                        // [根因修正] rerouter 找不到有效路線時會把物品從 state.activeTransfers 移除退款,
                        // 但 worker 端的 byId 副本從未被告知——變成永遠留在 worker 排隊間距計算裡的「幽靈
                        // 物品」,卡在移除當下的 progress 擋住後車,且完全不出現在主執行緒資料裡讓人查不到。
                        // 這裡把 rerouter 回報的已移除 id 轉告 workerBridge 一併清除。
                        const removedByRerouter = conveyorSystem.updateActiveTransfersOnLogisticsChange(state, affectedGroupIds);
                        if (Array.isArray(removedByRerouter) && removedByRerouter.length && typeof this._workerBridge.removeTransfers === 'function') {
                            this._workerBridge.removeTransfers(removedByRerouter);
                        }
                        // rerouter 只改主執行緒 routePoints;sentIds 僅在拓樸變更時清除,否則修正後路線不會重送 worker。
                        // 視窗內把「路線屬於本次改動群組」(或逃生艙下的全部)的物品從 sentIds 移除以強制重送。
                        const sent = this._workerBridge.sentIds;
                        if (sent && typeof sent.delete === 'function') {
                            for (const t of state.activeTransfers) {
                                if (!t || !t.id) continue;
                                if (affectedGroupIds === null || (t.lineId && affectedGroupIds.has(t.lineId))) {
                                    sent.delete(t.id);
                                }
                            }
                        }
                    }
                }
            }
        } else {
            arrivals = runLogisticsKinematics(
                { simSystem: conveyorSystem, engine: this.engine, transportArrayState: this.transportArrayState },
                state,
                deltaTime
            ).arrivals;
        }

        // [多端口入庫補判] kinematics 的抵達判定只比對單一 targetPoint。大型建築有多個 input 端口時,
        // 物品可能停在「另一個合法端口」(route-end 落在有效端口卻 ≠ targetPoint,例如改拉線後 targetPoint 殘留
        // 指向舊端口)→ 永遠判定未抵達、堵在終點擋住後車。主執行緒(有建築資料)在此補判:progress≈1、
        // 有 targetId、route-end 落在目標建築任一 input 端口 → 視為抵達入庫。斷點(非端口)不會誤判,故仍保有斷線防護。
        const portArrivals = this.collectTargetPortArrivals(state, arrivals);
        if (portArrivals.length) {
            if (this._workerBridge && typeof this._workerBridge.removeTransfers === 'function') {
                this._workerBridge.removeTransfers(portArrivals.map(a => a.id));
            }
            arrivals = arrivals.concat(portArrivals);
        }

        // 入庫(主執行緒專屬:存入建築 / 扣資源 / 更新 UI)。kinematics 已將抵達者移出 activeTransfers。
        for (let a = 0; a < arrivals.length; a++) {
            const arrival = arrivals[a];
            const target = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === arrival.targetId);
            if (target) {
                const tType = target.type1 || target.type;
                const deposited = ResourceSystem.depositResourceToBuilding(state, this.engine, target, arrival.itemType, 1, null);
                if (!deposited && !['warehouse', 'storehouse', 'barn', 'town_center', 'village'].includes(tType)) {
                    if (!target.inputBuffer) target.inputBuffer = {};
                    target.inputBuffer[arrival.itemType] = (target.inputBuffer[arrival.itemType] || 0) + 1;
                }
                if (window.UIManager) window.UIManager.updateValues(true);
            }
            this._diagDelivered = (this._diagDelivered || 0) + 1; // [診斷] 入庫計數(logiDiag 讀)
            if (state && state.trackedTransferId === arrival.id) {
                state.trackedTransferId = null;
                if (this.engine && typeof this.engine.addLog === 'function') {
                    this.engine.addLog(`[追蹤] 物品 ${arrival.itemType} 已送達目的地。`, 'LOGISTICS');
                }
            }
        }

        // ── 以下為「建築自動發料(dispatch)」所需的輔助;與 kinematics 內部同名輔助為純函式,共享 transfer 上的快取 ──
        const getEntityLabel = (ent) => ent ? (ent.name || ent.type1 || ent.type || '未知建築') : '未知目標';
        const getTransferRouteText = (transfer) => {
            const count = Array.isArray(transfer?.routePoints) ? transfer.routePoints.length : 0;
            return count >= 2 ? `路徑 ${count} 點` : '未取得繪製路徑點';
        };
        const addTransportLog = (message) => {
            if (this.engine && typeof this.engine.addLog === 'function') this.engine.addLog(message, 'LOGISTICS');
        };
        const getCellSize = () => this.engine?.TILE_SIZE || 20;
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
            if (state.resources) state.resources[key] = Math.max(0, (state.resources[key] || 0) - amount);
            return true;
        };
        const getTransferRouteMetrics = (transfer) => {
            const points = transfer?.routePoints;
            if (!Array.isArray(points) || points.length < 2) return { totalPixels: 0, totalTiles: 1 };
            if (transfer._logicRouteMetricsPoints === points && transfer._logicRouteMetrics) return transfer._logicRouteMetrics;
            const key = routePointsSignature(points);
            if (transfer._logicRouteMetricsKey === key && transfer._logicRouteMetrics) {
                transfer._logicRouteMetricsPoints = points;
                return transfer._logicRouteMetrics;
            }
            let total = 0;
            for (let j = 0; j < points.length - 1; j++) total += Math.abs(points[j + 1].x - points[j].x) + Math.abs(points[j + 1].y - points[j].y);
            const metrics = { totalPixels: total, totalTiles: Math.max(1, total / 20) };
            transfer._logicRouteMetricsPoints = points;
            transfer._logicRouteMetricsKey = key;
            transfer._logicRouteMetrics = metrics;
            return metrics;
        };
        const getTransferRouteSignature = (transfer) => {
            const points = transfer?.routePoints || [];
            if (!Array.isArray(points) || points.length < 2) return null;
            return routePointsSignature(points);
        };
        const routeSignatureLineIds = new Map();
        (state.activeTransfers || []).forEach(transfer => {
            const signature = getTransferRouteSignature(transfer);
            if (!signature) return;
            if (!routeSignatureLineIds.has(signature)) routeSignatureLineIds.set(signature, new Set());
            routeSignatureLineIds.get(signature).add(transfer.lineId || "");
        });
        const getTransferPathKey = (transfer) => {
            const signature = getTransferRouteSignature(transfer);
            if (signature && (routeSignatureLineIds.get(signature)?.size || 0) > 1) return `route:${signature}`;
            if (transfer?.lineId) return `line:${transfer.lineId}`;
            const points = transfer?.routePoints || [];
            const first = points[0];
            const last = points[points.length - 1];
            return ["route", first ? `${Math.round(first.x)},${Math.round(first.y)}` : "start",
                last ? `${Math.round(last.x)},${Math.round(last.y)}` : "end"].join("|");
        };
        // [發料防稀疏] worker 模式下主執行緒位置落後 worker 一段時間,直接拿落後位置判斷起點是否淨空,
        // 會把領頭物品誤判為仍在起點附近 → 發料太晚 → 間距 = cell + lag×速度,且隨 worker 落後加大而變疏。
        // 故把物品位置依「落後秒數」投影到當下再比較。
        // [防過量發料反饋] 但投影量必須設上限!否則 worker 過載時 lag↑ → 投影過頭 → 發料更積極 →
        // 物品更多 → worker 更慢 → lag 更大 …形成正反饋,間距被壓到 < cell(實測 1200 物品時 12.5px)、
        // 發料飆到 >5/s、移動降到 1/3、FPS 腰斬。上限取約 2.4 個 tick(0.12s,實測健康負載 lag≈0.11s):
        // 正常負載照常補償(間距=cell);過載時 lag 被夾住 → 發料自動節流讓 worker 追上,而非越發越多。
        const MAX_DISPATCH_LAG_PROJECTION = 0.12;
        const positionLagSeconds = this._workerBridge
            ? Math.min(MAX_DISPATCH_LAG_PROJECTION, this._workerBridge.getPositionLagSeconds(deltaTime))
            : 0;
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
                const projectedDistance = activeDistance +
                    positionLagSeconds * (Number(active.efficiency) || 4) * cellSize;
                return projectedDistance < cellSize;
            });
        };

        // 2. 讓滿足工人條件的建築自動發送物品
        // [C: 密度上限/發料回壓] 在途物品達上限時暫停發料(源頭物資/outputBuffer 留存等待,不遺失),
        // 避免發料速率快過 worker 移動速率造成源頭塞車(內圈密外圈疏)與體感卡頓。上限維持 worker 接近即時。
        // 可調且持久化:console 執行 setMaxActiveTransfers(n)(0=不限);預設見下。
        const _maxActive = this._getMaxActiveTransfers();
        if (_maxActive > 0 && state.activeTransfers.length >= _maxActive) {
            // 達上限:本 tick 不發料(已在途者照常推進/抵達,count 降回上限下時自動恢復發料)。
        } else
            state.mapEntities.forEach(ent => {
                if (!ent.outputTargets || ent.outputTargets.length === 0) return;

                const cfg = this.engine ? this.engine.getEntityConfig(ent.type1, ent.lv) : null;
                const needWorkers = cfg ? (cfg.need_villagers || 0) : 0;
                const currentWorkers = ent.assignedWorkers ? ent.assignedWorkers.length : 0;
                const isWarehouse = ['warehouse', 'storehouse', 'barn', 'town_center', 'village'].includes(ent.type1);



                // 修正規則：若建築需要工人，則必須有工人進駐才有物流效率。
                // 若建築不需要工人 (need_villagers 未設定或為 0)，則預設效率為 1。
                const efficiency = needWorkers > 0 ? currentWorkers : 1;
                
                if (efficiency <= 0) return; // 沒有效率即不發料

                const itemDispatchInterval = 2; // 基準：1 名工人每 2 秒發送一個物品。
                ent.logisticsTimer = (ent.logisticsTimer || 0) + deltaTime * efficiency;
                // [防爆發] 計時器上限 = 一個發送間隔。否則帶子滿載期間發料被 canStartTransfer 擋住時,
                // 計時器會無上限累積「發料額度」;一旦起點鬆動就連續每 tick 補發 → 發料速率瞬間衝高再回落
                // (使用者觀察到的「逐步衝快又降下」震盪之一)。夾上限後:阻塞解除只補發一個,之後回正常節奏。
                if (ent.logisticsTimer > itemDispatchInterval) ent.logisticsTimer = itemDispatchInterval;
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
                                    this._diagDispatched = (this._diagDispatched || 0) + 1; // [診斷]
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
                                    this._diagDispatched = (this._diagDispatched || 0) + 1; // [診斷]
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

        // [Web Worker] dispatch 完成後,把本 tick 的新增/移除送交 worker 計算下一批運動學(結果於後續 tick 套用)。
        if (this._workerBridge) {
            this._workerBridge.pushStep(state, deltaTime, this.engine?.TILE_SIZE || 20);
        }
    }
}
