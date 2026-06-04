import { annotateRoutePoints, getCardinalDirection } from './LogisticsGeometry.js';
import { isFinitePoint } from './LogisticsStateGuards.js';

export function findNearestNode(nodes, point) {
    if (!isFinitePoint(point) || !Array.isArray(nodes) || nodes.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    nodes.forEach(node => {
        const dist = Math.hypot(node.x - point.x, node.y - point.y);
        if (dist < bestDist) {
            bestDist = dist;
            best = node;
        }
    });
    return best;
}

export function buildSegmentNodeGraph(segments, { directed = false, tolerance = 2 } = {}) {
    const nodes = [];
    const findOrCreateNode = (point) => {
        if (!isFinitePoint(point)) return null;
        let node = nodes.find(item => Math.hypot(item.x - point.x, item.y - point.y) < tolerance);
        if (!node) {
            node = { x: point.x, y: point.y, edges: [], outEdges: [], inEdges: [] };
            nodes.push(node);
        }
        return node;
    };

    (Array.isArray(segments) ? segments : []).forEach(seg => {
        const points = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
        if (points.length < 2) return;
        for (let i = 0; i < points.length - 1; i++) {
            const from = findOrCreateNode(points[i]);
            const to = findOrCreateNode(points[i + 1]);
            if (!from || !to || from === to) continue;
            if (!from.edges.includes(to)) from.edges.push(to);
            if (!to.edges.includes(from)) to.edges.push(from);
            if (directed) {
                if (!from.outEdges.includes(to)) from.outEdges.push(to);
                if (!to.inEdges.includes(from)) to.inEdges.push(from);
            }
        }
    });

    return {
        nodes,
        sources: directed ? nodes.filter(node => node.inEdges.length === 0) : [],
        sinks: directed ? nodes.filter(node => node.outEdges.length === 0) : []
    };
}

export function findShortestNodePath(nodes, startPt, endPt, { directed = false } = {}) {
    const startNode = findNearestNode(nodes, startPt);
    const endNode = findNearestNode(nodes, endPt);
    if (!startNode || !endNode) return [];
    if (startNode === endNode) return [{ x: startNode.x, y: startNode.y }];

    const queue = [[startNode]];
    const visited = new Set([startNode]);
    while (queue.length > 0) {
        const path = queue.shift();
        const current = path[path.length - 1];
        if (current === endNode) return path.map(node => ({ x: node.x, y: node.y }));

        const edges = directed ? current.outEdges : current.edges;
        edges.forEach(next => {
            if (visited.has(next)) return;
            visited.add(next);
            queue.push([...path, next]);
        });
    }
    return [];
}

export function getReachableNodes(startNode, edgeName, targets = []) {
    if (!startNode) return [];
    const targetSet = new Set(targets);
    const reachable = [];
    const queue = [startNode];
    const visited = new Set([startNode]);
    while (queue.length > 0) {
        const current = queue.shift();
        if (targetSet.has(current)) reachable.push(current);
        (current[edgeName] || []).forEach(next => {
            if (visited.has(next)) return;
            visited.add(next);
            queue.push(next);
        });
    }
    return reachable;
}

export function buildExpandedRouteGraph(segments, tileSize = 20) {
    const makeKey = (point) => `${Math.round(point.x)},${Math.round(point.y)}`;
    const nodes = new Map();
    const edges = new Map();
    const addNode = (point) => {
        if (!isFinitePoint(point)) return null;
        const key = makeKey(point);
        if (!nodes.has(key)) nodes.set(key, { x: Math.round(point.x), y: Math.round(point.y) });
        if (!edges.has(key)) edges.set(key, new Set());
        return key;
    };
    const addEdge = (a, b) => {
        const ak = addNode(a);
        const bk = addNode(b);
        if (!ak || !bk || ak === bk) return;
        edges.get(ak).add(bk);
        edges.get(bk).add(ak);
    };

    (Array.isArray(segments) ? segments : []).forEach(seg => {
        const points = Array.isArray(seg?.routePoints) ? seg.routePoints : [];
        if (points.length < 2) return;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const dir = getCardinalDirection(a, b);
            if (!dir) continue;
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            const steps = Math.max(1, Math.round(dist / tileSize));
            let previousKey = null;
            for (let step = 0; step <= steps; step++) {
                const point = step === steps
                    ? b
                    : { x: a.x + dir.x * tileSize * step, y: a.y + dir.y * tileSize * step };
                const key = addNode(point);
                if (previousKey && key) addEdge(nodes.get(previousKey), nodes.get(key));
                previousKey = key;
            }
        }
    });

    const nearestKey = (ref) => {
        if (!isFinitePoint(ref) || nodes.size === 0) return null;
        let bestKey = null;
        let bestDist = Infinity;
        nodes.forEach((point, key) => {
            const dist = Math.hypot(point.x - ref.x, point.y - ref.y);
            if (dist < bestDist) {
                bestDist = dist;
                bestKey = key;
            }
        });
        return bestKey;
    };

    const findPath = (startKey, endKey) => {
        if (!startKey || !endKey) return null;
        if (startKey === endKey) return [nodes.get(startKey)];
        const queue = [startKey];
        const visited = new Set([startKey]);
        const previous = new Map();
        while (queue.length > 0) {
            const current = queue.shift();
            if (current === endKey) break;
            (edges.get(current) || new Set()).forEach(nextKey => {
                if (visited.has(nextKey)) return;
                visited.add(nextKey);
                previous.set(nextKey, current);
                queue.push(nextKey);
            });
        }
        if (!visited.has(endKey)) return null;
        const keys = [];
        let current = endKey;
        while (current) {
            keys.unshift(current);
            if (current === startKey) break;
            current = previous.get(current);
        }
        return keys[0] === startKey ? keys.map(key => ({ ...nodes.get(key) })) : null;
    };

    const endpointKeys = [...nodes.keys()].filter(key => (edges.get(key)?.size || 0) <= 1);
    const farthestEndpointKey = (fromKey) => {
        const from = nodes.get(fromKey);
        if (!from) return null;
        let bestKey = null;
        let bestDist = -Infinity;
        (endpointKeys.length > 0 ? endpointKeys : [...nodes.keys()]).forEach(key => {
            if (key === fromKey) return;
            const point = nodes.get(key);
            const dist = Math.hypot(point.x - from.x, point.y - from.y);
            if (dist > bestDist) {
                bestDist = dist;
                bestKey = key;
            }
        });
        return bestKey;
    };

    return { nodes, edges, endpointKeys, nearestKey, findPath, farthestEndpointKey };
}

export function buildExpandedRoutePoints(segments, startRef = null, endRef = null, tileSize = 20) {
    const graph = buildExpandedRouteGraph(segments, tileSize);
    if (graph.nodes.size < 2) return null;
    let startKey = graph.nearestKey(startRef);
    let endKey = graph.nearestKey(endRef);
    if (!startKey && graph.endpointKeys.length > 0) startKey = graph.endpointKeys[0];
    if (!endKey && startKey) endKey = graph.farthestEndpointKey(startKey);
    const route = graph.findPath(startKey, endKey);
    if (!Array.isArray(route) || route.length < 2) return null;
    annotateRoutePoints(route);
    return route;
}
