const { test, expect } = require('@playwright/test');

test('物流 Debug 路線與渲染軌跡計算測試', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsRenderer } = await import('/src/renderers/logistics_renderer.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');
        
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

        const routes = LogisticsRenderer.getSelectedGroupDebugRoutePoints(
            { mapEntities: [] },
            'debug_group',
            segments
        );

        if (!Array.isArray(routes) || routes.length < 3) {
            return { success: false, error: `Expected debug routes count >= 3, got ${routes.length}` };
        }

        for (const route of routes) {
            for (let i = 1; i < route.length; i++) {
                const dist = Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
                if (dist > GameEngine.TILE_SIZE + 0.001) {
                    return { success: false, error: `Debug route contains a display jump of ${dist}px` };
                }
            }
        }

        const hasDetachedRoute = routes.some(route =>
            route.some(point => point.x === 100 && point.y === 100) &&
            route.some(point => point.x === 120 && point.y === 100)
        );
        if (!hasDetachedRoute) {
            return { success: false, error: 'Detached component was not rendered as its own debug route' };
        }

        return { success: true };
    });

    expect(result.success).toBe(true);
});
