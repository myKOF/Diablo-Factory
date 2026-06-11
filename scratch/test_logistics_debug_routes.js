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
const makeSegForGroup = (id, groupId, points) => ({
    id,
    groupId,
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
const detachedLabelKeys = globalThis.LogisticsRenderer.getDebugLabelCellKeys([detachedSplitLine]);
if (detachedLabelKeys.has('300,300')) {
    throw new Error('Detached split cell should not receive a debug label.');
}
if (!detachedLabelKeys.has('320,300')) {
    throw new Error('Detached line should still label the first visible cell after the split.');
}
const detachedDebugRoutes = globalThis.LogisticsRenderer.getSelectedGroupDebugRoutePoints(
    { mapEntities: [] },
    'debug_group',
    [
        detachedSplitLine,
        makeSeg('detached_after_split', [[320, 300], [340, 300]])
    ]
);
if (detachedDebugRoutes.some(route => route.some(point => point.x === 300 && point.y === 300))) {
    throw new Error('Detached split cell should not be included in debug routes.');
}

// --- 測試下游 MergeNode 延伸路徑邏輯 ---
globalThis.conveyorSystem = {
    ensureLogisticsMergeNodeStore: (state) => state.logisticsMergeNodes || [],
    getLogisticsMergeNodeOutputRoute: (node) => {
        if (node.outputGroupId === 'downstream_group') {
            return [{ x: 30, y: 50 }, { x: 30, y: 70 }, { x: 30, y: 90 }];
        }
        return null;
    }
};

const testStateWithMerge = {
    logisticsMergeNodes: [
        {
            outputGroupId: 'downstream_group',
            inputGroupIds: ['debug_group'],
            point: { x: 30, y: 50 }
        }
    ]
};

const mergeDebugRoutes = globalThis.LogisticsRenderer.getSelectedGroupDebugRoutePoints(
    testStateWithMerge,
    'debug_group',
    [
        makeSeg('branch', [[30, 10], [30, 50]])
    ]
);

const branchExtended = mergeDebugRoutes.find(route =>
    route[0]?.x === 30 && route[0]?.y === 10
);

if (!branchExtended) {
    throw new Error('Failed to find branch route in merge test.');
}

const hasExtendedPoints = branchExtended.some(pt => pt.x === 30 && pt.y === 90);
if (!hasExtendedPoints) {
    throw new Error('Debug route was not extended downstream via the MergeNode output route.');
}

globalThis.conveyorSystem = {
    ensureLogisticsMergeNodeStore: (state) => state.logisticsMergeNodes || [],
    getLogisticsMergeNodeOutputRoute: (node) => {
        if (node.outputGroupId === 'downstream_group') {
            return [{ x: 30, y: 50 }, { x: 30, y: 70 }, { x: 30, y: 90 }];
        }
        return null;
    }
};

const threeInputMergeState = {
    logisticsMergeNodes: [
        {
            outputGroupId: 'downstream_group',
            inputGroupIds: ['debug_group', 'second_input_group', 'third_input_group'],
            point: { x: 30, y: 50 }
        }
    ]
};
const thirdInputRoutes = globalThis.LogisticsRenderer.getSelectedGroupDebugRoutePoints(
    threeInputMergeState,
    'third_input_group',
    [
        makeSegForGroup('third_input', 'third_input_group', [[10, 50], [30, 50]])
    ]
);
const thirdInputFullRoute = thirdInputRoutes.find(route =>
    route[0]?.x === 10 &&
    route[0]?.y === 50 &&
    route.some(point => point.x === 30 && point.y === 90)
);
if (!thirdInputFullRoute) {
    throw new Error('The third merge input group should extend to the downstream route.');
}

globalThis.conveyorSystem = {
    ensureLogisticsMergeNodeStore: (state) => state.logisticsMergeNodes || []
};
const mergeStateFallbackRoute = {
    logisticsMergeNodes: [
        {
            outputGroupId: 'state_downstream_group',
            inputGroupIds: ['state_input_group'],
            point: { x: 30, y: 50 }
        }
    ],
    logisticsLines: [
        makeSegForGroup('state_input', 'state_input_group', [[10, 50], [30, 50]]),
        makeSegForGroup('state_downstream', 'state_downstream_group', [[30, 50], [30, 70], [30, 90]])
    ]
};
const mergeStateFallbackRoutes = globalThis.LogisticsRenderer.getSelectedGroupDebugRoutePoints(
    mergeStateFallbackRoute,
    'state_input_group',
    [
        makeSegForGroup('state_input', 'state_input_group', [[10, 50], [30, 50]])
    ]
);
const mergeStateFallbackFullRoute = mergeStateFallbackRoutes.find(route =>
    route[0]?.x === 10 &&
    route[0]?.y === 50 &&
    route.some(point => point.x === 30 && point.y === 90)
);
if (!mergeStateFallbackFullRoute) {
    throw new Error('A connected MergeNode should render downstream route from state logistics lines when system route helpers are unavailable.');
}

globalThis.conveyorSystem = {};
const geometricFallbackState = {
    logisticsMergeNodes: [],
    logisticsLines: [
        makeSegForGroup('third_input_no_node', 'third_input_no_node_group', [[10, 50], [30, 50]]),
        makeSegForGroup('downstream_no_node', 'downstream_no_node_group', [[30, 50], [30, 70], [30, 90]])
    ]
};
const geometricFallbackRoutes = globalThis.LogisticsRenderer.getSelectedGroupDebugRoutePoints(
    geometricFallbackState,
    'third_input_no_node_group',
    [
        makeSegForGroup('third_input_no_node', 'third_input_no_node_group', [[10, 50], [30, 50]])
    ]
);
const geometricFallbackFullRoute = geometricFallbackRoutes.find(route =>
    route[0]?.x === 10 &&
    route[0]?.y === 50 &&
    route.some(point => point.x === 30 && point.y === 90)
);
if (!geometricFallbackFullRoute) {
    throw new Error('A selected route ending exactly on another line should render the downstream debug route.');
}

globalThis.conveyorSystem = {};
const disconnectedGapState = {
    logisticsMergeNodes: [],
    logisticsLines: [
        makeSegForGroup('input_with_gap', 'input_with_gap_group', [[10, 50], [30, 50]]),
        makeSegForGroup('downstream_with_gap', 'downstream_with_gap_group', [[45, 50], [45, 70], [45, 90]])
    ]
};
const disconnectedGapRoutes = globalThis.LogisticsRenderer.getSelectedGroupDebugRoutePoints(
    disconnectedGapState,
    'input_with_gap_group',
    [
        makeSegForGroup('input_with_gap', 'input_with_gap_group', [[10, 50], [30, 50]])
    ]
);
const disconnectedGapFullRoute = disconnectedGapRoutes.find(route =>
    route[0]?.x === 10 &&
    route[0]?.y === 50 &&
    route.some(point => point.x === 45 && point.y === 90)
);
if (disconnectedGapFullRoute) {
    throw new Error('A selected route must not render downstream cells when the next line is separated by a gap.');
}

globalThis.conveyorSystem = {};
const midRouteFallbackState = {
    logisticsMergeNodes: [],
    logisticsLines: [
        makeSegForGroup('third_input_mid', 'third_input_mid_group', [[10, 50], [30, 50]]),
        makeSegForGroup('downstream_mid', 'downstream_mid_group', [[30, 30], [30, 50], [30, 70], [30, 90]])
    ]
};
const midRouteFallbackRoutes = globalThis.LogisticsRenderer.getSelectedGroupDebugRoutePoints(
    midRouteFallbackState,
    'third_input_mid_group',
    [
        makeSegForGroup('third_input_mid', 'third_input_mid_group', [[10, 50], [30, 50]])
    ]
);
const midRouteFallbackFullRoute = midRouteFallbackRoutes.find(route =>
    route[0]?.x === 10 &&
    route[0]?.y === 50 &&
    route.some(point => point.x === 30 && point.y === 90)
);
if (!midRouteFallbackFullRoute) {
    throw new Error('A selected route ending on the middle of a downstream route should render from the junction to the downstream end.');
}
if (midRouteFallbackFullRoute?.some(point => point.x === 30 && point.y === 30)) {
    throw new Error('Middle-route fallback should not prepend upstream cells before the junction.');
}

globalThis.conveyorSystem = {};
const branchChoiceFallbackState = {
    logisticsMergeNodes: [],
    logisticsLines: [
        makeSegForGroup('input_from_left', 'input_from_left_group', [[10, 50], [30, 50]]),
        makeSegForGroup('wrong_straight', 'wrong_straight_group', [[30, 50], [50, 50]]),
        makeSegForGroup('correct_down', 'correct_down_group', [[30, 50], [30, 70], [30, 90]])
    ]
};
const branchChoiceRoutes = globalThis.LogisticsRenderer.getSelectedGroupDebugRoutePoints(
    branchChoiceFallbackState,
    'input_from_left_group',
    [
        makeSegForGroup('input_from_left', 'input_from_left_group', [[10, 50], [30, 50]])
    ]
);
const branchChoiceRoute = branchChoiceRoutes.find(route =>
    route[0]?.x === 10 &&
    route[0]?.y === 50 &&
    route.some(point => point.x === 30 && point.y === 90)
);
if (!branchChoiceRoute) {
    throw new Error('Fallback should choose the downstream turn route when a straight-through branch also touches the junction.');
}
if (branchChoiceRoute.some(point => point.x === 50 && point.y === 50)) {
    throw new Error('Fallback should not choose the straight branch when a turn output leaves the same junction.');
}

globalThis.conveyorSystem = {
    ensureLogisticsMergeNodeStore: (state) => state.logisticsMergeNodes || [],
    getLogisticsMergeNodeOutputRoute: () => [{ x: 30, y: 50 }, { x: 50, y: 50 }]
};
const outputDirPreferredState = {
    logisticsMergeNodes: [
        {
            outputGroupId: 'dir_preferred_output',
            inputGroupIds: ['dir_preferred_input'],
            point: { x: 30, y: 50 },
            outputDir: { x: 0, y: 1 }
        }
    ],
    logisticsLines: [
        makeSegForGroup('dir_preferred_input', 'dir_preferred_input', [[10, 50], [30, 50]]),
        makeSegForGroup('dir_preferred_wrong', 'dir_preferred_output', [[30, 50], [50, 50]]),
        makeSegForGroup('dir_preferred_down', 'dir_preferred_output', [[30, 50], [30, 70], [30, 90]])
    ]
};
const outputDirPreferredRoutes = globalThis.LogisticsRenderer.getSelectedGroupDebugRoutePoints(
    outputDirPreferredState,
    'dir_preferred_input',
    [
        makeSegForGroup('dir_preferred_input', 'dir_preferred_input', [[10, 50], [30, 50]])
    ]
);
const outputDirPreferredRoute = outputDirPreferredRoutes.find(route =>
    route[0]?.x === 10 &&
    route[0]?.y === 50 &&
    route.some(point => point.x === 30 && point.y === 90)
);
if (!outputDirPreferredRoute) {
    throw new Error('Merge debug route should prefer the candidate whose first step matches node.outputDir.');
}
if (outputDirPreferredRoute.some(point => point.x === 50 && point.y === 50)) {
    throw new Error('Merge debug route should not follow an output candidate that conflicts with node.outputDir.');
}

const mergeTurnNode = {
    outputGroupId: 'merge_visual_output',
    inputGroupIds: ['merge_visual_input'],
    point: { x: 20, y: 0 },
    outputDir: { x: 0, y: 1 },
    inputDirections: {
        merge_visual_input: { x: 1, y: 0 }
    }
};
globalThis.conveyorSystem = {
    getLogisticsMergeNodeForInputTransfer: (transfer) =>
        transfer?.lineId === 'merge_visual_input' ? mergeTurnNode : null,
    getLogisticsMergeNodeOutputRoute: () => [{ x: 20, y: 0 }, { x: 20, y: 40 }]
};
const mergeInputVisualPoint = globalThis.LogisticsRenderer.getPointOnMergeTransferPath(
    [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    1,
    { lineId: 'merge_visual_input' },
    {}
);
const expectedMergeInputVirtualPath = globalThis.LogisticsRenderer.buildMergeInputVirtualTurnPath(
    [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    { x: 20, y: 0 },
    { x: 0, y: 1 }
);
const expectedMergeSwitchPoint = globalThis.LogisticsRenderer.getPointOnVirtualTransferPathByDistance(
    expectedMergeInputVirtualPath,
    GameEngine.TILE_SIZE,
    {}
);
if (
    !mergeInputVisualPoint ||
    Math.hypot(
        mergeInputVisualPoint.x - expectedMergeSwitchPoint.x,
        mergeInputVisualPoint.y - expectedMergeSwitchPoint.y
    ) > 0.1
) {
    throw new Error('Merge input transfer should advance through the rounded turn at the original movement speed.');
}
const mergeOutputTransfer = {
    lineId: 'merge_visual_output',
    _mergeVisualTurn: {
        x: 20,
        y: 0,
        inDir: { x: 1, y: 0 },
        outDir: { x: 0, y: 1 }
    }
};
const mergeOutputVisualPoint = globalThis.LogisticsRenderer.getPointOnMergeTransferPath(
    [{ x: 20, y: 0 }, { x: 20, y: 40 }],
    0,
    mergeOutputTransfer,
    {}
);
if (
    !mergeOutputVisualPoint ||
    Math.hypot(
        mergeOutputVisualPoint.x - expectedMergeSwitchPoint.x,
        mergeOutputVisualPoint.y - expectedMergeSwitchPoint.y
    ) > 0.1
) {
    throw new Error('Merge output transfer should continue from the same rounded turn distance as the input switch point.');
}

globalThis.conveyorSystem = {
    ensureLogisticsMergeNodeStore: (state) => state.logisticsMergeNodes || [],
    getLogisticsMergeNodeOutputRoute: (node) => {
        if (node.outputGroupId === 'downstream_group') {
            return [{ x: 30, y: 50 }, { x: 30, y: 70 }, { x: 30, y: 90 }];
        }
        return null;
    },
    getLogisticsSegmentsByGroupId: (groupId) => {
        if (groupId === 'debug_group') {
            return [makeSegForGroup('input_branch', 'debug_group', [[30, 10], [30, 50]])];
        }
        if (groupId === 'downstream_group') {
            return [makeSegForGroup('downstream', 'downstream_group', [[30, 50], [30, 70], [30, 90]])];
        }
        return [];
    }
};

const outputSelectedRoutes = globalThis.LogisticsRenderer.getSelectedGroupDebugRoutePoints(
    testStateWithMerge,
    'downstream_group',
    [
        makeSegForGroup('downstream', 'downstream_group', [[30, 50], [30, 70], [30, 90]])
    ]
);

const outputFullRoute = outputSelectedRoutes.find(route =>
    route[0]?.x === 30 &&
    route[0]?.y === 10 &&
    route.some(point => point.x === 30 && point.y === 90)
);
if (!outputFullRoute) {
    throw new Error('Selecting the merge output group should still render the full input-to-output debug route.');
}

console.log('Logistics debug route rendering test passed.');
