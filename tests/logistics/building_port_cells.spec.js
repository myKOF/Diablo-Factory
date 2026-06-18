const { test, expect } = require('@playwright/test');

test('建築物流線只能從端口格起拖且只能精準連到端口格', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { UIManager } = await import('/src/ui/ui.js');
        const { LogisticsUI } = await import('/src/ui/LogisticsUI.js');
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const original = {
            mapEntities: GameEngine.state.mapEntities,
            selectedBuildingIds: GameEngine.state.selectedBuildingIds,
            selectedBuildingId: GameEngine.state.selectedBuildingId,
            buildingMode: GameEngine.state.buildingMode,
            placingType: GameEngine.state.placingType,
            buildingConfigs: GameEngine.state.buildingConfigs,
            logisticsLines: GameEngine.state.logisticsLines,
            logisticsDragLine: GameEngine.state.logisticsDragLine,
            pathfinding: GameEngine.state.pathfinding,
            getWorldPoint: UIManager.getWorldPoint,
            getEntityConfig: GameEngine.getEntityConfig,
            getFootprint: GameEngine.getFootprint
        };

        try {
            const source = { id: 'source_building', type1: 'test_source', x: 100, y: 100 };
            const target = { id: 'target_building', type1: 'test_target', x: 220, y: 100 };
            const configs = {
                test_source: { logistics: { canOutput: true }, ports: [{ align: 'right', width: 1, count: 1 }] },
                test_target: { logistics: { canInput: true }, ports: [{ align: 'left', width: 1, count: 1 }] }
            };

            GameEngine.getEntityConfig = (type) => configs[type] || null;
            GameEngine.getFootprint = () => ({ uw: 4, uh: 4 });
            GameEngine.state.mapEntities = [source, target];
            GameEngine.state.logisticsLines = [];
            GameEngine.state.selectedBuildingIds = [source.id];
            GameEngine.state.selectedBuildingId = source.id;
            GameEngine.state.buildingMode = 'NONE';
            GameEngine.state.placingType = null;
            GameEngine.state.logisticsDragLine = null;
            LogisticsUI.potentialLogisticsDrag = null;
            LogisticsUI.isLogisticsDragging = false;
            UIManager.getWorldPoint = (clientX, clientY) => ({ x: clientX, y: clientY });

            const fakeEvent = (x, y) => ({
                button: 0,
                clientX: x,
                clientY: y,
                target: { closest: () => null }
            });

            UIManager.handleWorldMouseDown(fakeEvent(source.x, source.y));
            const centerStartedDrag = !!LogisticsUI.potentialLogisticsDrag;
            LogisticsUI.potentialLogisticsDrag = null;

            const sourcePort = UIManager.getBuildingPortSlots(source)[0];
            UIManager.handleWorldMouseDown(fakeEvent(sourcePort.x, sourcePort.y));
            const portStartedDrag = !!LogisticsUI.potentialLogisticsDrag;
            const startedPort = LogisticsUI.potentialLogisticsDrag?.sourcePort || null;
            LogisticsUI.potentialLogisticsDrag = null;

            conveyorSystem.activeDrag = {
                sourceEntity: source,
                sourcePort,
                isLineExtension: false,
                targetBuilding: null,
                targetPort: null
            };

            const centerTarget = conveyorSystem.dragSession.resolveDragTarget(target.x, target.y);
            const targetPort = UIManager.getBuildingPortSlots(target)[0];
            const exactTarget = conveyorSystem.dragSession.resolveDragTarget(targetPort.x, targetPort.y);
            conveyorSystem.cancelDrag();

            GameEngine.state.selectedBuildingIds = [];
            GameEngine.state.selectedBuildingId = null;
            GameEngine.state.buildingMode = 'STAMP';
            GameEngine.state.placingType = 'transport_line';
            GameEngine.state.buildingConfigs = {
                ...(GameEngine.state.buildingConfigs || {}),
                transport_line: { type2: 'transport_line' }
            };
            GameEngine.state.pathfinding = { grid: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] };
            UIManager.handleWorldMouseDown(fakeEvent(sourcePort.x, sourcePort.y));
            UIManager.handleWorldMouseMove(fakeEvent(sourcePort.x + 30, sourcePort.y));
            const buildModePortStartedDrag = LogisticsUI.isLogisticsDragging === true;
            LogisticsUI.cancelLogisticsDrag();

            GameEngine.state.buildingMode = 'STAMP';
            GameEngine.state.placingType = 'transport_line';
            UIManager.handleWorldMouseDown(fakeEvent(20, 20));
            UIManager.handleWorldMouseMove(fakeEvent(60, 20));
            const buildModeGroundStartedDrag = LogisticsUI.isLogisticsDragging === true;
            LogisticsUI.cancelLogisticsDrag();

            return {
                success: !centerStartedDrag &&
                    portStartedDrag &&
                    !!startedPort &&
                    centerTarget.port === null &&
                    centerTarget.building === null &&
                    exactTarget.port?.dir === 'left' &&
                    exactTarget.building?.id === target.id &&
                    buildModePortStartedDrag &&
                    !buildModeGroundStartedDrag,
                centerStartedDrag,
                portStartedDrag,
                centerTargetHasPort: !!centerTarget.port,
                centerTargetHasBuilding: !!centerTarget.building,
                exactTargetDir: exactTarget.port?.dir || null,
                buildModePortStartedDrag,
                buildModeGroundStartedDrag
            };
        } finally {
            GameEngine.state.mapEntities = original.mapEntities;
            GameEngine.state.selectedBuildingIds = original.selectedBuildingIds;
            GameEngine.state.selectedBuildingId = original.selectedBuildingId;
            GameEngine.state.buildingMode = original.buildingMode;
            GameEngine.state.placingType = original.placingType;
            GameEngine.state.buildingConfigs = original.buildingConfigs;
            GameEngine.state.logisticsLines = original.logisticsLines;
            GameEngine.state.logisticsDragLine = original.logisticsDragLine;
            GameEngine.state.pathfinding = original.pathfinding;
            UIManager.getWorldPoint = original.getWorldPoint;
            GameEngine.getEntityConfig = original.getEntityConfig;
            GameEngine.getFootprint = original.getFootprint;
            LogisticsUI.potentialLogisticsDrag = null;
            LogisticsUI.isLogisticsDragging = false;
            conveyorSystem.cancelDrag();
        }
    });

    expect(result.success, JSON.stringify(result)).toBe(true);
});
