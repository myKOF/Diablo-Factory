const fs = require('fs');
const path = require('path');

globalThis.GameEngine = { TILE_SIZE: 20, state: {} };
globalThis.UI_CONFIG = {};
globalThis.conveyorSystem = {};

let rendererCode = fs.readFileSync(path.join(__dirname, '../src/renderers/logistics_renderer.js'), 'utf8');
rendererCode = rendererCode
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&')
    .replace(/export class LogisticsRenderer/, 'globalThis.LogisticsRenderer = class LogisticsRenderer');
eval(rendererCode);

const makeSeg = (id, points) => ({
    id,
    groupId: 'debug_group',
    routePoints: points.map(([x, y]) => ({ x, y })),
    routeWidth: 1
});

const segments = [
    makeSeg('trunk_a', [[10, 10], [30, 10]]),
    makeSeg('trunk_b', [[30, 10], [50, 10]]),
    makeSeg('branch', [[30, 10], [30, 50]]),
    makeSeg('detached', [[100, 100], [120, 100]])
];

const routes = globalThis.LogisticsRenderer.getSelectedGroupDebugRoutePoints(
    { mapEntities: [] },
    'debug_group',
    segments
);

if (!Array.isArray(routes) || routes.length < 3) {
    throw new Error(`Expected debug routes to stay split by graph edges, got ${routes.length}`);
}

routes.forEach((route, routeIndex) => {
    for (let i = 1; i < route.length; i++) {
        const dist = Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
        if (dist > GameEngine.TILE_SIZE + 0.001) {
            throw new Error(`Debug route ${routeIndex} contains a display jump of ${dist}px`);
        }
    }
});

const hasDetachedRoute = routes.some(route =>
    route.some(point => point.x === 100 && point.y === 100) &&
    route.some(point => point.x === 120 && point.y === 100)
);
if (!hasDetachedRoute) {
    throw new Error('Detached component was not rendered as its own debug route.');
}

const branchRoute = routes.find(route =>
    route[0]?.x === 30 && route[0]?.y === 10 &&
    route.some(point => point.x === 30 && point.y === 50)
);
if (!branchRoute) {
    throw new Error('Branch route was not emitted from the extension point.');
}
const branchEnd = branchRoute[branchRoute.length - 1];
if (branchEnd.x !== 30 || branchEnd.y !== 50) {
    throw new Error('Branch route numbering direction is reversed.');
}

const labelKeys = globalThis.LogisticsRenderer.getDebugLabelCellKeys([
    makeSeg('single_cell', [[200, 200], [220, 200]])
]);
if (!labelKeys.has('200,200') || !labelKeys.has('220,200')) {
    throw new Error('Debug labels should include the occupied cell and open terminal endpoint.');
}

const detachedSplitLine = {
    ...makeSeg('detached_split', [[300, 300], [320, 300]]),
    detachedFromGroupId: 'source_group',
    detachedAtKey: '300,300'
};
if (!globalThis.LogisticsRenderer.isDetachedSplitCell(detachedSplitLine, '300,300')) {
    throw new Error('Detached split cell should be recognized for arrow suppression.');
}
if (globalThis.LogisticsRenderer.isDetachedSplitCell(detachedSplitLine, '320,300')) {
    throw new Error('Only the detached split cell should suppress arrows.');
}
const detachedArrowSkipKeys = globalThis.LogisticsRenderer.getDetachedSplitArrowCellKeys([detachedSplitLine]);
if (!detachedArrowSkipKeys.has('300,300')) {
    throw new Error('Detached split arrow skip keys should include detachedAtKey.');
}

console.log('Logistics debug route rendering test passed.');
