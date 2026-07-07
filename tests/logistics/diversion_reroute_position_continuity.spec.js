const { test, expect } = require('@playwright/test');

test('中段拉分支重算時在途物品不得被無終點分支搶走', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => !!(window.GAME_STATE && window.GameEngine && window.UIManager), { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { getPointOnPathProgress } = await import('/src/systems/logistics/LogisticsPathMetrics.js');
        const state = window.GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const originalTileSize = window.GameEngine.TILE_SIZE;
        const originalGetId = window.UIManager.getEntityId;
        const originalGetSlots = window.UIManager.getBuildingPortSlots;
        const originalNearestPort = window.UIManager.getNearestPortSlot;
        const originalResolvePort = window.UIManager.resolveCurrentPortSlot;

        const P = (x, y) => ({ x, y });
        const segment = (id, groupId, a, b, extra = {}) => ({
            id,
            groupId,
            routePoints: [a, b],
            routeWidth: 1,
            efficiency: 4,
            lineType: 'transport_line',
            ...extra
        });

        try {
            window.GameEngine.TILE_SIZE = 20;
            window.UIManager.getEntityId = (ent) => ent?.id || null;
            window.UIManager.getBuildingPortSlots = (ent) => Array.isArray(ent?.portSlots) ? ent.portSlots : [];
            window.UIManager.getNearestPortSlot = (ent, x, y) => {
                const slots = window.UIManager.getBuildingPortSlots(ent);
                if (!slots.length) return { x: ent.x, y: ent.y, dir: 'left', width: 1 };
                return slots
                    .slice()
                    .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
            };
            window.UIManager.resolveCurrentPortSlot = (ent, storedPort, x, y) => {
                if (storedPort && Number.isFinite(storedPort.x) && Number.isFinite(storedPort.y)) return storedPort;
                return window.UIManager.getNearestPortSlot(ent, x, y);
            };

            const source = {
                id: 'src',
                type1: 'storehouse',
                x: 100,
                y: 100,
                portSlots: [{ x: 100, y: 100, dir: 'right', width: 1 }]
            };
            const target = {
                id: 'dst',
                type1: 'village',
                x: 400,
                y: 100,
                portSlots: [{ x: 400, y: 100, dir: 'left', width: 1 }]
            };
            const oldRoute = [P(100, 100), P(200, 100), P(300, 100), P(400, 100)];
            state.mapEntities = [source, target];
            state.logisticsLines = [
                segment('main_front', 'main', P(100, 100), P(200, 100), {
                    sourceId: 'src',
                    sourcePort: { x: 100, y: 100, dir: 'right', width: 1 }
                }),
                segment('main_new_branch', 'main', P(200, 100), P(200, 0)),
                segment('detached_a', 'detached', P(200, 100), P(300, 100), {
                    targetId: 'dst',
                    targetPort: { x: 400, y: 100, dir: 'left', width: 1 }
                }),
                segment('detached_b', 'detached', P(300, 100), P(400, 100), {
                    targetId: 'dst',
                    targetPort: { x: 400, y: 100, dir: 'left', width: 1 }
                })
            ];
            state.logisticsMergeNodes = [];
            state.activeTransfers = [{
                id: 'transfer_on_split',
                lineId: 'main',
                sourceId: 'src',
                targetId: 'dst',
                itemType: 'wood',
                progress: 1 / 3,
                routePoints: oldRoute.map(point => ({ ...point })),
                targetPoint: P(400, 100),
                targetPort: { x: 400, y: 100, dir: 'left', width: 1 },
                transportIndex: 5,
                transportOffset: 0
            }];

            const beforePos = getPointOnPathProgress(state.activeTransfers[0].routePoints, state.activeTransfers[0].progress);
            const removed = conveyorSystem.updateActiveTransfersOnLogisticsChange(state, new Set(['main']));
            const afterTransfer = state.activeTransfers[0] || null;
            const afterPos = afterTransfer
                ? getPointOnPathProgress(afterTransfer.routePoints, afterTransfer.progress)
                : null;
            const end = afterTransfer?.routePoints?.[afterTransfer.routePoints.length - 1] || null;
            const logs = (state.log || [])
                .map(entry => String(entry?.message || entry?.msg || entry?.text || ''))
                .filter(message => message.includes('移除退回來源') || message.includes('重算後仍有落差'));

            return {
                activeCount: state.activeTransfers.length,
                removed,
                lineId: afterTransfer?.lineId || null,
                targetId: afterTransfer?.targetId || null,
                beforePos,
                afterPos,
                jump: beforePos && afterPos ? Math.hypot(afterPos.x - beforePos.x, afterPos.y - beforePos.y) : null,
                end,
                targetPoint: afterTransfer?.targetPoint || null,
                logs
            };
        } finally {
            window.GameEngine.TILE_SIZE = originalTileSize;
            window.UIManager.getEntityId = originalGetId;
            window.UIManager.getBuildingPortSlots = originalGetSlots;
            window.UIManager.getNearestPortSlot = originalNearestPort;
            window.UIManager.resolveCurrentPortSlot = originalResolvePort;
            Object.keys(state).forEach(key => delete state[key]);
            Object.assign(state, originalState);
        }
    });

    expect(result.activeCount, JSON.stringify(result)).toBe(1);
    expect(result.removed, JSON.stringify(result)).toEqual([]);
    expect(result.lineId, JSON.stringify(result)).toBe('detached');
    expect(result.targetId, JSON.stringify(result)).toBe('dst');
    expect(result.jump, JSON.stringify(result)).not.toBeNull();
    expect(result.jump, JSON.stringify(result)).toBeLessThanOrEqual(1);
    expect(result.end, JSON.stringify(result)).toEqual({ x: 400, y: 100 });
    expect(result.targetPoint, JSON.stringify(result)).toEqual({ x: 400, y: 100 });
    expect(result.logs, JSON.stringify(result)).toEqual([]);
});
