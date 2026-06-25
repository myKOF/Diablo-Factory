const { test, expect } = require('@playwright/test');

/**
 * 整合層特徵測試：getSelectedGroupDebugRoutePoints 的「續接 / 實體 fallback / 回填」分支。
 *
 * 既有 debug_routes.spec.js 傳 {mapEntities:[]} 且無 logisticsMergeNodes，
 * 故合流續接 while 迴圈、findPhysicalContinuationRoute、getBackfilledRoutes
 * 三條複雜分支在其測試中全部 no-op、未被覆蓋。
 *
 * 本網以「構造 state」直接驅動這三條分支（ensureLogisticsMergeNodeStore 與
 * getStateGroupSegments 皆讀傳入 state），鎖定其輸出不變式，使該 ~370 行
 * 續接器可被安全抽至系統層（搬移前綠 → 搬移後仍綠 = 語義不變）。
 *
 * 不變式（與分支實作細節無關，僅鎖可觀察輸出）：
 *   - 續接後存在一條路線同時含「起點群組遠端」與「續接群組遠端」（證明確實接通）。
 *   - 所有路線相鄰點距離 ≤ 一格（densify 後不得有顯示跳格）。
 */

async function setup(page) {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });
}

// 在頁面內以構造 state 呼叫 getSelectedGroupDebugRoutePoints，回傳路線與 TS
async function runScenario(page, build) {
    return await page.evaluate(async (buildSrc) => {
        const { LogisticsRenderer } = await import('/src/renderers/logistics_renderer.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');
        const TS = GameEngine.TILE_SIZE;
        // eslint-disable-next-line no-new-func
        const buildFn = new Function('TS', `return (${buildSrc})(TS);`);
        const { state, groupKey, groupSegs } = buildFn(TS);
        const routes = LogisticsRenderer.getSelectedGroupDebugRoutePoints(state, groupKey, groupSegs);
        return { TS, routes };
    }, build.toString());
}

function maxJump(route) {
    let m = 0;
    for (let i = 1; i < route.length; i++) {
        m = Math.max(m, Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y));
    }
    return m;
}

function hasPoint(route, x, y) {
    return route.some(p => Math.round(p.x) === Math.round(x) && Math.round(p.y) === Math.round(y));
}

function assertNoJumps(routes, TS) {
    for (const route of routes) {
        expect(maxJump(route), 'debug 路線不得有顯示跳格').toBeLessThanOrEqual(TS + 0.001);
    }
}

test('合流續接：選取輸入群組時路線應穿越合流節點接到輸出群組', async ({ page }) => {
    await setup(page);
    const { TS, routes } = await runScenario(page, (TS) => {
        const inSeg = { id: 'cont_in_s', groupId: 'cont_in', routeWidth: 1, routePoints: [{ x: 0, y: 0 }, { x: 4 * TS, y: 0 }] };
        const outSeg = { id: 'cont_out_s', groupId: 'cont_out', routeWidth: 1, routePoints: [{ x: 4 * TS, y: 0 }, { x: 4 * TS, y: 4 * TS }] };
        return {
            groupKey: 'cont_in',
            groupSegs: [inSeg],
            state: {
                mapEntities: [],
                logisticsLines: [inSeg, outSeg],
                logisticsMergeNodes: [{
                    outputGroupId: 'cont_out', inputGroupIds: ['cont_in'],
                    point: { x: 4 * TS, y: 0 }, x: 4 * TS, y: 0, outputDir: { x: 0, y: 1 }
                }]
            }
        };
    });

    expect(Array.isArray(routes) && routes.length >= 1, '應產生至少一條 debug 路線').toBe(true);
    const stitched = routes.some(r => hasPoint(r, 0, 0) && hasPoint(r, 4 * TS, 4 * TS));
    expect(stitched, '應存在一條路線同時含輸入起點(0,0)與輸出遠端(4TS,4TS)，證明已穿越合流接通').toBe(true);
    assertNoJumps(routes, TS);
});

test('實體 fallback 續接：無合流節點時共線相鄰群組應被接續', async ({ page }) => {
    await setup(page);
    const { TS, routes } = await runScenario(page, (TS) => {
        const seg1 = { id: 'phys_1_s', groupId: 'phys_1', routeWidth: 1, routePoints: [{ x: 0, y: 0 }, { x: 4 * TS, y: 0 }] };
        const seg2 = { id: 'phys_2_s', groupId: 'phys_2', routeWidth: 1, routePoints: [{ x: 4 * TS, y: 0 }, { x: 8 * TS, y: 0 }] };
        return {
            groupKey: 'phys_1',
            groupSegs: [seg1],
            state: { mapEntities: [], logisticsLines: [seg1, seg2], logisticsMergeNodes: [] }
        };
    });

    expect(Array.isArray(routes) && routes.length >= 1, '應產生至少一條 debug 路線').toBe(true);
    const stitched = routes.some(r => hasPoint(r, 0, 0) && hasPoint(r, 8 * TS, 0));
    expect(stitched, '無合流節點時應靠實體 fallback 把共線相鄰群組(0,0)→(8TS,0)接續').toBe(true);
    assertNoJumps(routes, TS);
});

test('回填：選取輸出群組時應回填輸入支線形成貫穿路線', async ({ page }) => {
    await setup(page);
    const { TS, routes } = await runScenario(page, (TS) => {
        const inSeg = { id: 'bf_in_s', groupId: 'bf_in', routeWidth: 1, routePoints: [{ x: 0, y: 0 }, { x: 4 * TS, y: 0 }] };
        const outSeg = { id: 'bf_out_s', groupId: 'bf_out', routeWidth: 1, routePoints: [{ x: 4 * TS, y: 0 }, { x: 4 * TS, y: -4 * TS }] };
        return {
            groupKey: 'bf_out',
            groupSegs: [outSeg],
            state: {
                mapEntities: [],
                logisticsLines: [inSeg, outSeg],
                logisticsMergeNodes: [{
                    outputGroupId: 'bf_out', inputGroupIds: ['bf_in'],
                    point: { x: 4 * TS, y: 0 }, x: 4 * TS, y: 0, outputDir: { x: 0, y: -1 }
                }]
            }
        };
    });

    expect(Array.isArray(routes) && routes.length >= 1, '應產生至少一條 debug 路線').toBe(true);
    const backfilled = routes.some(r => hasPoint(r, 0, 0) && hasPoint(r, 4 * TS, -4 * TS));
    expect(backfilled, '選取輸出群組時應回填輸入支線(0,0)，與輸出遠端(4TS,-4TS)同線貫穿').toBe(true);
    assertNoJumps(routes, TS);
});
