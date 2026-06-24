const { test, expect } = require('@playwright/test');

test('合併後再接通的 detached group 會傳播為接通顯示', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const originalLines = GameEngine.state.logisticsLines;
        try {
            GameEngine.state.logisticsLines = [
                {
                    id: 'src_seg',
                    groupId: 'source_group',
                    sourceId: 'warehouse_1',
                    routePoints: [{ x: 100, y: 100 }, { x: 120, y: 100 }],
                    routeWidth: 1
                },
                {
                    id: 'target_seg',
                    groupId: 'target_group',
                    targetId: 'town_center_1',
                    detachedFromGroupId: 'source_group',
                    detachedAtKey: '120,100',
                    routePoints: [{ x: 120, y: 100 }, { x: 140, y: 100 }],
                    routeWidth: 1
                }
            ];

            const connected = conveyorSystem.getLogisticsDisplayConnectedGroupIds(new Set(), GameEngine.state);
            return {
                sourceConnected: connected.has('source_group'),
                targetConnected: connected.has('target_group')
            };
        } finally {
            GameEngine.state.logisticsLines = originalLines;
        }
    });

    expect(result).toEqual({ sourceConnected: true, targetConnected: true });
});

test('靜態物流端口 overlay 同時重畫 source 與 target port cell', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsRenderer } = await import('/src/renderers/logistics_renderer.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const originalState = {
            mapEntities: GameEngine.state.mapEntities,
            logisticsLines: GameEngine.state.logisticsLines
        };
        try {
            GameEngine.state.mapEntities = [
                {
                    id: 'warehouse_1',
                    type1: 'warehouse',
                    x: 100,
                    y: 100,
                    outputTargets: [{
                        id: 'town_center_1',
                        lineId: 'line_group',
                        sourcePort: { x: 100, y: 100, dir: 'right', width: 1 },
                        targetPort: { x: 160, y: 100, dir: 'left', width: 1 }
                    }]
                },
                { id: 'town_center_1', type1: 'town_center', x: 160, y: 100 }
            ];
            GameEngine.state.logisticsLines = [{
                id: 'line_seg',
                groupId: 'line_group',
                sourceId: 'warehouse_1',
                targetId: 'town_center_1',
                sourcePort: { x: 100, y: 100, dir: 'right', width: 1 },
                targetPort: { x: 160, y: 100, dir: 'left', width: 1 },
                routePoints: [{ x: 100, y: 100 }, { x: 160, y: 100 }],
                routeWidth: 1
            }];

            const fillRects = [];
            const graphics = {
                clear() {},
                fillStyle() {},
                lineStyle() {},
                fillRect(x, y, w, h) { fillRects.push({ x, y, w, h }); },
                strokeRect() {}
            };
            const scene = { hexOrRgba: () => ({ color: 0xffffff }) };

            LogisticsRenderer.renderSourcePortCells(graphics, GameEngine.state, scene);
            return fillRects.length;
        } finally {
            GameEngine.state.mapEntities = originalState.mapEntities;
            GameEngine.state.logisticsLines = originalState.logisticsLines;
        }
    });

    expect(result).toBeGreaterThanOrEqual(2);
});

test('物流線存在時只重畫選中建築的橘色端口', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsRenderer } = await import('/src/renderers/logistics_renderer.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const original = {
            mapEntities: GameEngine.state.mapEntities,
            logisticsLines: GameEngine.state.logisticsLines,
            selectedBuildingIds: GameEngine.state.selectedBuildingIds,
            selectedBuildingId: GameEngine.state.selectedBuildingId,
            getEntityConfig: GameEngine.getEntityConfig,
            getFootprint: GameEngine.getFootprint
        };
        try {
            const selectedWarehouse = { id: 'warehouse_1', type1: 'warehouse_test', x: 100, y: 100 };
            const unselectedWarehouse = { id: 'warehouse_2', type1: 'warehouse_test', x: 200, y: 100 };
            GameEngine.getEntityConfig = () => ({
                logistics: { canInput: true, canOutput: true },
                ports: [{ align: 'right', width: 1, count: 1 }]
            });
            GameEngine.getFootprint = () => ({ uw: 4, uh: 4 });
            GameEngine.state.mapEntities = [selectedWarehouse, unselectedWarehouse];
            GameEngine.state.selectedBuildingIds = [selectedWarehouse.id];
            GameEngine.state.selectedBuildingId = selectedWarehouse.id;
            GameEngine.state.logisticsLines = [{
                id: 'line_on_port',
                groupId: 'line_on_port',
                routePoints: [{ x: 240, y: 100 }, { x: 300, y: 100 }],
                routeWidth: 1
            }];

            const fills = [];
            const strokes = [];
            let currentFill = null;
            const graphics = {
                clear() {},
                fillStyle(color, alpha) { currentFill = { color, alpha }; },
                lineStyle(width, color, alpha) { strokes.push({ width, color, alpha }); },
                fillRect(x, y, w, h) { fills.push({ ...currentFill, x, y, w, h }); },
                strokeRect() {}
            };
            const scene = { hexOrRgba: value => ({ color: value === '#00ff44ff' ? 0x00ff44 : 0xffffff }) };
            LogisticsRenderer.renderSourcePortCells(graphics, GameEngine.state, scene);

            const isNear = (rect, x, y) => Math.abs((rect.x + rect.w / 2) - x) < 1 && Math.abs((rect.y + rect.h / 2) - y) < 1;
            return {
                selectedOrange: fills.some(item => item.color === 0xffeb3b && isNear(item, 140, 100)),
                unselectedOrange: fills.some(item => item.color === 0xffeb3b && isNear(item, 240, 100)),
                hasBasePortStroke: strokes.some(item => item.color === 0xf57f17)
            };
        } finally {
            GameEngine.state.mapEntities = original.mapEntities;
            GameEngine.state.logisticsLines = original.logisticsLines;
            GameEngine.state.selectedBuildingIds = original.selectedBuildingIds;
            GameEngine.state.selectedBuildingId = original.selectedBuildingId;
            GameEngine.getEntityConfig = original.getEntityConfig;
            GameEngine.getFootprint = original.getFootprint;
        }
    });

    expect(result).toEqual({ selectedOrange: true, unselectedOrange: false, hasBasePortStroke: true });
});

test('缺少 metadata 但物理連到輸出與輸入 port 的群組仍標示接通', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const original = {
            mapEntities: GameEngine.state.mapEntities,
            logisticsLines: GameEngine.state.logisticsLines,
            getEntityConfig: GameEngine.getEntityConfig,
            getFootprint: GameEngine.getFootprint
        };
        try {
            const source = { id: 'warehouse_1', type1: 'warehouse_test', x: 100, y: 100 };
            const target = { id: 'town_center_1', type1: 'town_center_test', x: 200, y: 100 };
            GameEngine.getEntityConfig = type => type === 'warehouse_test'
                ? { logistics: { canOutput: true }, ports: [{ align: 'right', width: 1, count: 1 }] }
                : { logistics: { canInput: true }, ports: [{ align: 'left', width: 1, count: 1 }] };
            GameEngine.getFootprint = () => ({ uw: 4, uh: 4 });
            GameEngine.state.mapEntities = [source, target];
            GameEngine.state.logisticsLines = [{
                id: 'physical_group_seg',
                groupId: 'physical_group',
                routePoints: [{ x: 140, y: 100 }, { x: 160, y: 100 }],
                routeWidth: 1
            }];

            const connected = conveyorSystem.getLogisticsDisplayConnectedGroupIds(new Set(), GameEngine.state);
            return connected.has('physical_group');
        } finally {
            GameEngine.state.mapEntities = original.mapEntities;
            GameEngine.state.logisticsLines = original.logisticsLines;
            GameEngine.getEntityConfig = original.getEntityConfig;
            GameEngine.getFootprint = original.getFootprint;
        }
    });

    expect(result).toBe(true);
});

test('source port 查詢接受同一 merge component 的 outputTargets lineId', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const original = {
            mapEntities: GameEngine.state.mapEntities,
            logisticsLines: GameEngine.state.logisticsLines,
            logisticsMergeNodes: GameEngine.state.logisticsMergeNodes,
            getEntityConfig: GameEngine.getEntityConfig,
            getFootprint: GameEngine.getFootprint
        };
        try {
            const sourcePort = { x: 140, y: 100, dir: 'right', width: 1, slotIndex: 0, defIndex: 0 };
            const targetPort = { x: 240, y: 100, dir: 'left', width: 1, slotIndex: 0, defIndex: 0 };
            const source = {
                id: 'warehouse_1',
                type1: 'warehouse_test',
                x: 100,
                y: 100,
                outputTargets: [{
                    id: 'town_center_1',
                    lineId: 'source_input_group',
                    sourcePort,
                    targetPort,
                    filter: 'wood'
                }]
            };
            const target = { id: 'town_center_1', type1: 'town_center_test', x: 280, y: 100 };
            GameEngine.getEntityConfig = type => type === 'warehouse_test'
                ? { logistics: { canOutput: true }, ports: [{ align: 'right', width: 1, count: 1 }] }
                : { logistics: { canInput: true }, ports: [{ align: 'left', width: 1, count: 1 }] };
            GameEngine.getFootprint = () => ({ uw: 4, uh: 4 });
            const line = {
                id: 'main_output_seg',
                groupId: 'main_output_group',
                sourceId: source.id,
                sourcePort,
                targetId: target.id,
                targetPort,
                routePoints: [sourcePort, { x: 180, y: 100 }],
                routeWidth: 1
            };
            GameEngine.state.mapEntities = [source, target];
            GameEngine.state.logisticsLines = [
                line,
                {
                    id: 'source_input_seg',
                    groupId: 'source_input_group',
                    routePoints: [{ x: 140, y: 140 }, { x: 180, y: 100 }],
                    routeWidth: 1
                }
            ];
            GameEngine.state.logisticsMergeNodes = [{
                id: 'merge_180_100_main_output_group',
                cellKey: '180,100',
                point: { x: 180, y: 100 },
                outputGroupId: 'main_output_group',
                inputGroupIds: ['source_input_group']
            }];

            const info = conveyorSystem.getLogisticsSourcePortCellInfo(line);
            return {
                hasInfo: !!info,
                rectCenterX: info ? info.rect.x + info.rect.w / 2 : null,
                rectCenterY: info ? info.rect.y + info.rect.h / 2 : null
            };
        } finally {
            GameEngine.state.mapEntities = original.mapEntities;
            GameEngine.state.logisticsLines = original.logisticsLines;
            GameEngine.state.logisticsMergeNodes = original.logisticsMergeNodes;
            GameEngine.getEntityConfig = original.getEntityConfig;
            GameEngine.getFootprint = original.getFootprint;
        }
    });

    expect(result).toEqual({ hasInfo: true, rectCenterX: 140, rectCenterY: 100 });
});

test('source port 查詢接受同一物理 component 的 outputTargets lineId', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const original = {
            mapEntities: GameEngine.state.mapEntities,
            logisticsLines: GameEngine.state.logisticsLines,
            logisticsMergeNodes: GameEngine.state.logisticsMergeNodes,
            getEntityConfig: GameEngine.getEntityConfig,
            getFootprint: GameEngine.getFootprint
        };
        try {
            const sourcePort = { x: 140, y: 100, dir: 'right', width: 1, slotIndex: 0, defIndex: 0 };
            const targetPort = { x: 240, y: 100, dir: 'left', width: 1, slotIndex: 0, defIndex: 0 };
            const source = {
                id: 'warehouse_1',
                type1: 'warehouse_test',
                x: 100,
                y: 100,
                outputTargets: [{
                    id: 'town_center_1',
                    lineId: 'source_group',
                    sourcePort,
                    targetPort,
                    filter: 'stone'
                }]
            };
            const target = { id: 'town_center_1', type1: 'town_center_test', x: 280, y: 100 };
            GameEngine.getEntityConfig = type => type === 'warehouse_test'
                ? { logistics: { canOutput: true }, ports: [{ align: 'right', width: 1, count: 1 }] }
                : { logistics: { canInput: true }, ports: [{ align: 'left', width: 1, count: 1 }] };
            GameEngine.getFootprint = () => ({ uw: 4, uh: 4 });
            const line = {
                id: 'middle_seg',
                groupId: 'middle_group',
                sourceId: source.id,
                sourcePort,
                targetId: target.id,
                targetPort,
                routePoints: [sourcePort, { x: 180, y: 100 }],
                routeWidth: 1
            };
            GameEngine.state.mapEntities = [source, target];
            GameEngine.state.logisticsLines = [
                line,
                {
                    id: 'source_seg',
                    groupId: 'source_group',
                    routePoints: [{ x: 180, y: 100 }, { x: 220, y: 100 }],
                    routeWidth: 1
                }
            ];
            GameEngine.state.logisticsMergeNodes = [];

            const connection = conveyorSystem.getLogisticsSourcePortConnection(line);
            const info = conveyorSystem.getLogisticsSourcePortCellInfo(line);
            return {
                hasConnection: !!connection,
                hasInfo: !!info,
                connFilter: connection?.conn?.filter || null,
                rectCenterX: info ? info.rect.x + info.rect.w / 2 : null,
                rectCenterY: info ? info.rect.y + info.rect.h / 2 : null
            };
        } finally {
            GameEngine.state.mapEntities = original.mapEntities;
            GameEngine.state.logisticsLines = original.logisticsLines;
            GameEngine.state.logisticsMergeNodes = original.logisticsMergeNodes;
            GameEngine.getEntityConfig = original.getEntityConfig;
            GameEngine.getFootprint = original.getFootprint;
        }
    });

    expect(result).toEqual({
        hasConnection: true,
        hasInfo: true,
        connFilter: 'stone',
        rectCenterX: 140,
        rectCenterY: 100
    });
});

test('輸出端口與輸入端口只靠物理相接 group 時不可標示為可運輸接通', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const original = {
            mapEntities: GameEngine.state.mapEntities,
            logisticsLines: GameEngine.state.logisticsLines,
            logisticsMergeNodes: GameEngine.state.logisticsMergeNodes,
            getEntityConfig: GameEngine.getEntityConfig,
            getFootprint: GameEngine.getFootprint
        };
        try {
            const source = { id: 'warehouse_1', type1: 'warehouse_test', x: 100, y: 100 };
            const target = { id: 'town_center_1', type1: 'town_center_test', x: 260, y: 100 };
            GameEngine.getEntityConfig = type => type === 'warehouse_test'
                ? { logistics: { canOutput: true }, ports: [{ align: 'right', width: 1, count: 1 }] }
                : { logistics: { canInput: true }, ports: [{ align: 'left', width: 1, count: 1 }] };
            GameEngine.getFootprint = () => ({ uw: 4, uh: 4 });
            GameEngine.state.mapEntities = [source, target];
            GameEngine.state.logisticsMergeNodes = [];
            GameEngine.state.logisticsLines = [
                {
                    id: 'source_touch_seg',
                    groupId: 'source_touch',
                    routePoints: [{ x: 140, y: 100 }, { x: 180, y: 100 }],
                    routeWidth: 1
                },
                {
                    id: 'target_touch_seg',
                    groupId: 'target_touch',
                    routePoints: [{ x: 180, y: 100 }, { x: 220, y: 100 }],
                    routeWidth: 1
                }
            ];

            const connected = conveyorSystem.getLogisticsDisplayConnectedGroupIds(new Set(), GameEngine.state);
            return {
                sourceTouch: connected.has('source_touch'),
                targetTouch: connected.has('target_touch')
            };
        } finally {
            GameEngine.state.mapEntities = original.mapEntities;
            GameEngine.state.logisticsLines = original.logisticsLines;
            GameEngine.state.logisticsMergeNodes = original.logisticsMergeNodes;
            GameEngine.getEntityConfig = original.getEntityConfig;
            GameEngine.getFootprint = original.getFootprint;
        }
    });

    expect(result).toEqual({ sourceTouch: false, targetTouch: false });
});

test('只碰到同一建築不同輸入輸出端口時不可標示為接通', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const original = {
            mapEntities: GameEngine.state.mapEntities,
            logisticsLines: GameEngine.state.logisticsLines,
            getEntityConfig: GameEngine.getEntityConfig,
            getFootprint: GameEngine.getFootprint
        };
        try {
            const warehouse = { id: 'warehouse_1', type1: 'warehouse_test', x: 100, y: 100 };
            GameEngine.getEntityConfig = () => ({
                logistics: { canInput: true, canOutput: true },
                ports: [
                    { align: 'right', width: 1, count: 1 },
                    { align: 'down', width: 1, count: 1 }
                ]
            });
            GameEngine.getFootprint = () => ({ uw: 4, uh: 4 });
            GameEngine.state.mapEntities = [warehouse];
            GameEngine.state.logisticsLines = [{
                id: 'self_touch_seg',
                groupId: 'self_touch_group',
                routePoints: [{ x: 140, y: 100 }, { x: 100, y: 140 }],
                routeWidth: 1
            }];

            const connected = conveyorSystem.getLogisticsDisplayConnectedGroupIds(new Set(), GameEngine.state);
            return connected.has('self_touch_group');
        } finally {
            GameEngine.state.mapEntities = original.mapEntities;
            GameEngine.state.logisticsLines = original.logisticsLines;
            GameEngine.getEntityConfig = original.getEntityConfig;
            GameEngine.getFootprint = original.getFootprint;
        }
    });

    expect(result).toBe(false);
});

test('同一 group 的中斷碎片分別碰到兩個端口時不可標示為接通', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const original = {
            mapEntities: GameEngine.state.mapEntities,
            logisticsLines: GameEngine.state.logisticsLines,
            getEntityConfig: GameEngine.getEntityConfig,
            getFootprint: GameEngine.getFootprint
        };
        try {
            const source = { id: 'warehouse_1', type1: 'warehouse_test', x: 100, y: 100 };
            const target = { id: 'town_center_1', type1: 'town_center_test', x: 260, y: 100 };
            GameEngine.getEntityConfig = type => type === 'warehouse_test'
                ? { logistics: { canOutput: true }, ports: [{ align: 'right', width: 1, count: 1 }] }
                : { logistics: { canInput: true }, ports: [{ align: 'left', width: 1, count: 1 }] };
            GameEngine.getFootprint = () => ({ uw: 4, uh: 4 });
            GameEngine.state.mapEntities = [source, target];
            GameEngine.state.logisticsLines = [
                {
                    id: 'broken_a',
                    groupId: 'broken_group',
                    routePoints: [{ x: 140, y: 100 }, { x: 160, y: 100 }],
                    routeWidth: 1
                },
                {
                    id: 'broken_b',
                    groupId: 'broken_group',
                    routePoints: [{ x: 220, y: 100 }, { x: 220, y: 100 }],
                    routeWidth: 1
                }
            ];

            const connected = conveyorSystem.getLogisticsDisplayConnectedGroupIds(new Set(), GameEngine.state);
            return connected.has('broken_group');
        } finally {
            GameEngine.state.mapEntities = original.mapEntities;
            GameEngine.state.logisticsLines = original.logisticsLines;
            GameEngine.getEntityConfig = original.getEntityConfig;
            GameEngine.getFootprint = original.getFootprint;
        }
    });

    expect(result).toBe(false);
});

test('merge input 側接通時會反向傳播到 output 與同節點其它 input', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const original = {
            logisticsLines: GameEngine.state.logisticsLines,
            logisticsMergeNodes: GameEngine.state.logisticsMergeNodes
        };
        try {
            const mergePoint = { x: 200, y: 200 };
            GameEngine.state.logisticsLines = [
                {
                    id: 'main_output_seg',
                    groupId: 'main_output',
                    routePoints: [mergePoint, { x: 240, y: 200 }],
                    routeWidth: 1
                },
                {
                    id: 'old_input_seg',
                    groupId: 'old_input',
                    routePoints: [{ x: 200, y: 160 }, mergePoint],
                    routeWidth: 1
                },
                {
                    id: 'new_input_seg',
                    groupId: 'new_input',
                    routePoints: [{ x: 160, y: 200 }, mergePoint],
                    routeWidth: 1
                }
            ];
            GameEngine.state.logisticsMergeNodes = [{
                id: 'merge_200_200_main_output',
                cellKey: '200,200',
                point: mergePoint,
                outputGroupId: 'main_output',
                inputGroupIds: ['old_input', 'new_input']
            }];

            const connected = conveyorSystem.getLogisticsDisplayConnectedGroupIds(new Set(['new_input']), GameEngine.state);
            return {
                mainOutput: connected.has('main_output'),
                oldInput: connected.has('old_input'),
                newInput: connected.has('new_input')
            };
        } finally {
            GameEngine.state.logisticsLines = original.logisticsLines;
            GameEngine.state.logisticsMergeNodes = original.logisticsMergeNodes;
        }
    });

    expect(result).toEqual({ mainOutput: true, oldInput: true, newInput: true });
});

test('新支線接到主線中段時接通狀態會穿過串接 merge node 傳播', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const original = {
            logisticsLines: GameEngine.state.logisticsLines,
            logisticsMergeNodes: GameEngine.state.logisticsMergeNodes
        };
        try {
            const firstMerge = { x: 200, y: 200 };
            const secondMerge = { x: 240, y: 200 };
            GameEngine.state.logisticsLines = [
                {
                    id: 'main_before_seg',
                    groupId: 'main_before',
                    routePoints: [firstMerge, secondMerge],
                    routeWidth: 1
                },
                {
                    id: 'main_after_seg',
                    groupId: 'main_after',
                    routePoints: [secondMerge, { x: 280, y: 200 }],
                    routeWidth: 1
                },
                {
                    id: 'old_branch_seg',
                    groupId: 'old_branch',
                    routePoints: [{ x: 200, y: 160 }, firstMerge],
                    routeWidth: 1
                },
                {
                    id: 'new_branch_seg',
                    groupId: 'new_branch',
                    routePoints: [{ x: 240, y: 240 }, secondMerge],
                    routeWidth: 1
                }
            ];
            GameEngine.state.logisticsMergeNodes = [
                {
                    id: 'merge_200_200_main_before',
                    cellKey: '200,200',
                    point: firstMerge,
                    outputGroupId: 'main_before',
                    inputGroupIds: ['old_branch']
                },
                {
                    id: 'merge_240_200_main_after',
                    cellKey: '240,200',
                    point: secondMerge,
                    outputGroupId: 'main_after',
                    inputGroupIds: ['main_before', 'new_branch']
                }
            ];

            const connected = conveyorSystem.getLogisticsDisplayConnectedGroupIds(new Set(['new_branch']), GameEngine.state);
            return {
                oldBranch: connected.has('old_branch'),
                mainBefore: connected.has('main_before'),
                mainAfter: connected.has('main_after'),
                newBranch: connected.has('new_branch')
            };
        } finally {
            GameEngine.state.logisticsLines = original.logisticsLines;
            GameEngine.state.logisticsMergeNodes = original.logisticsMergeNodes;
        }
    });

    expect(result).toEqual({
        oldBranch: true,
        mainBefore: true,
        mainAfter: true,
        newBranch: true
    });
});

test('輸出支線端點垂直接到已接通主線中段時會註冊合流節點並標示接通', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const original = {
            mapEntities: GameEngine.state.mapEntities,
            logisticsLines: GameEngine.state.logisticsLines,
            logisticsMergeNodes: GameEngine.state.logisticsMergeNodes,
            getEntityConfig: GameEngine.getEntityConfig,
            getFootprint: GameEngine.getFootprint
        };
        try {
            const wh = { id: 'wh', type1: 'warehouse_test', x: 110, y: 110 };
            const tc = { id: 'tc', type1: 'town_center_test', x: 330, y: 110 };
            GameEngine.getEntityConfig = type => type === 'warehouse_test'
                ? { logistics: { canOutput: true }, ports: [{ align: 'right', width: 1, count: 1 }] }
                : { logistics: { canInput: true }, ports: [{ align: 'left', width: 1, count: 1 }] };
            GameEngine.getFootprint = () => ({ uw: 4, uh: 4 });
            GameEngine.state.mapEntities = [wh, tc];
            GameEngine.state.logisticsMergeNodes = [];

            const sourcePort = { x: 110, y: 110, dir: 'right', width: 1, slotIndex: 0, defIndex: 0 };
            const targetPort = { x: 310, y: 110, dir: 'left', width: 1, slotIndex: 0, defIndex: 0 };
            // 主線：sourceId+targetId，已接通
            const mainLine = {
                id: 'main_seg', groupId: 'main',
                sourceId: 'wh', sourcePort,
                targetId: 'tc', targetPort,
                routePoints: [{ x: 110, y: 110 }, { x: 310, y: 110 }],
                routeWidth: 1
            };
            // 灰色輸出支線：sourceId=wh 第二輸出、無 targetId，末端垂直落在主線中段 (210,110)
            const grayLine = {
                id: 'gray_seg', groupId: 'gray',
                sourceId: 'wh', sourcePort,
                routePoints: [{ x: 110, y: 170 }, { x: 210, y: 170 }, { x: 210, y: 110 }],
                routeWidth: 1
            };
            GameEngine.state.logisticsLines = [mainLine, grayLine];

            // 真實合流流程：群組相觸時應註冊合流節點，而非把支線併入主線
            conveyorSystem.mergeConnectedLogisticsGroups('gray');

            const graySeg = conveyorSystem.getLogisticsLinesForState(GameEngine.state)
                .find(l => l.id === 'gray_seg');
            const grayGroupNow = graySeg ? (graySeg.groupId || graySeg.id) : null;
            const connected = conveyorSystem.getLogisticsDisplayConnectedGroupIds(new Set(), GameEngine.state);
            const nodes = GameEngine.state.logisticsMergeNodes || [];

            return {
                mergeNodeRegistered: nodes.some(n =>
                    Array.isArray(n.inputGroupIds) && n.inputGroupIds.includes(grayGroupNow)),
                grayKeptOwnGroup: grayGroupNow === 'gray',
                grayConnected: !!grayGroupNow && connected.has(grayGroupNow)
            };
        } finally {
            GameEngine.state.mapEntities = original.mapEntities;
            GameEngine.state.logisticsLines = original.logisticsLines;
            GameEngine.state.logisticsMergeNodes = original.logisticsMergeNodes;
            GameEngine.getEntityConfig = original.getEntityConfig;
            GameEngine.getFootprint = original.getFootprint;
        }
    });

    expect(result).toEqual({
        mergeNodeRegistered: true,
        grayKeptOwnGroup: true,
        grayConnected: true
    });
});
