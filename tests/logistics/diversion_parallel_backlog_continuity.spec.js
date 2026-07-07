const { test, expect } = require('@playwright/test');

test('同群組新增平行路徑時回堵物品不得從舊線瞬移到新線', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => !!(window.GAME_STATE && window.GameEngine && window.UIManager), { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { getPointOnPathProgress } = await import('/src/systems/logistics/LogisticsPathMetrics.js');
        const { logisticsTransportArrayState } = await import('/src/systems/logistics/LogisticsTransportArrayState.js');
        const state = window.GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const originalTileSize = window.GameEngine.TILE_SIZE;
        const originalGetId = window.UIManager.getEntityId;
        const originalGetSlots = window.UIManager.getBuildingPortSlots;
        const originalNearestPort = window.UIManager.getNearestPortSlot;
        const originalResolvePort = window.UIManager.resolveCurrentPortSlot;

        const P = (x, y) => ({ x, y });
        const segment = (id, a, b, extra = {}) => ({
            id,
            groupId: 'main',
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
                x: 0,
                y: 0,
                portSlots: [{ x: 0, y: 0, dir: 'down', width: 1 }]
            };
            const target = {
                id: 'dst',
                type1: 'warehouse',
                x: 100,
                y: 200,
                portSlots: [{ x: 100, y: 200, dir: 'left', width: 1 }]
            };
            const sourcePort = { x: 0, y: 0, dir: 'down', width: 1 };
            const targetPort = { x: 100, y: 200, dir: 'left', width: 1 };
            const oldRoute = [P(0, 0), P(0, 200), P(100, 200)];

            const oldSegments = [];
            for (let y = 0; y < 200; y += 20) {
                oldSegments.push(segment(`old_vertical_${y}`, P(0, y), P(0, y + 20), {
                    sourceId: y === 0 ? 'src' : null,
                    sourcePort: y === 0 ? sourcePort : null,
                    targetId: 'dst',
                    targetPort
                }));
            }
            for (let x = 0; x < 100; x += 20) {
                oldSegments.push(segment(`old_bottom_${x}`, P(x, 200), P(x + 20, 200), {
                    targetId: 'dst',
                    targetPort
                }));
            }

            state.mapEntities = [source, target];
            state.logisticsLines = [
                // 新增的平行路徑刻意先出現在陣列中；舊程式會以 source->sink 最短路徑選到它。
                segment('new_top', P(0, 0), P(40, 0), { sourceId: 'src', sourcePort }),
                segment('new_vertical', P(40, 0), P(40, 200)),
                segment('new_bottom', P(40, 200), P(100, 200), { targetId: 'dst', targetPort }),
                ...oldSegments
            ];
            state.logisticsMergeNodes = [];
            state.activeTransfers = [100, 120, 140].map((y, idx) => {
                const progress = y / 300;
                const transfer = {
                    id: `blocked_${idx}`,
                    lineId: 'main',
                    sourceId: 'src',
                    targetId: 'dst',
                    itemType: 'wood',
                    progress,
                    routePoints: oldRoute.map(point => ({ ...point })),
                    targetPoint: P(100, 200),
                    sourcePort,
                    targetPort,
                    efficiency: 4
                };
                logisticsTransportArrayState.setTransferDistance(transfer, y, 300, 20);
                return transfer;
            });

            const before = state.activeTransfers.map(transfer => ({
                id: transfer.id,
                pos: getPointOnPathProgress(transfer.routePoints, transfer.progress)
            }));

            const removed = conveyorSystem.updateActiveTransfersOnLogisticsChange(state, new Set(['main']));

            const after = state.activeTransfers.map(transfer => ({
                id: transfer.id,
                lineId: transfer.lineId,
                pos: getPointOnPathProgress(transfer.routePoints, transfer.progress),
                route: transfer.routePoints.map(point => ({ x: point.x, y: point.y }))
            }));
            const jumps = before.map(beforeItem => {
                const afterItem = after.find(item => item.id === beforeItem.id);
                if (!afterItem) return null;
                return {
                    id: beforeItem.id,
                    dx: afterItem.pos.x - beforeItem.pos.x,
                    dy: afterItem.pos.y - beforeItem.pos.y,
                    distance: Math.hypot(afterItem.pos.x - beforeItem.pos.x, afterItem.pos.y - beforeItem.pos.y),
                    before: beforeItem.pos,
                    after: afterItem.pos,
                    route: afterItem.route
                };
            });

            return {
                activeCount: state.activeTransfers.length,
                removed,
                jumps,
                after
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

    expect(result.activeCount, JSON.stringify(result)).toBe(3);
    expect(result.removed, JSON.stringify(result)).toEqual([]);
    result.jumps.forEach(jump => {
        expect(jump, JSON.stringify(result)).not.toBeNull();
        expect(jump.distance, JSON.stringify(jump)).toBeLessThanOrEqual(1);
        expect(Math.abs(jump.after.x), JSON.stringify(jump)).toBeLessThanOrEqual(1);
    });
});
