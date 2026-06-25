const { test, expect } = require('@playwright/test');

// 驗證 worker 安全的 LogisticsSimContext facade 與主執行緒 conveyorSystem 在相同輸入下,
// 跑相同的 runLogisticsKinematics 會產生「完全一致」的模擬結果(位置/限制/佇列/抵達)。
// 這證明 worker 計算核心正確,無需實機。

test('LogisticsSimContext 與 conveyorSystem 運動學結果逐 tick 等價', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => !!(window.GAME_STATE && window.GameEngine && window.PhaserScene), { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { runLogisticsKinematics } = await import('/src/systems/logistics/LogisticsKinematics.js');
        const { LogisticsSimContext } = await import('/src/systems/logistics/LogisticsSimContext.js');
        const { conveyorSystem } = await import('/src/systems/logistics/../ConveyorSystem.js');
        const { logisticsTransportArrayState } = await import('/src/systems/logistics/LogisticsTransportArrayState.js');
        const GE = window.GameEngine;

        function serpentine(P, x0, y0) { const pts = []; let x = x0, y = y0; for (let i = 0; i < P; i++) { pts.push({ x, y }); if (i % 2 === 0) y += 200; else x += 40; if (i % 4 === 3) y -= 200; } return pts; }
        const MAIN = serpentine(20, 600, 400); const mp = MAIN[10];
        const BRANCH = [{ x: mp.x - 300, y: mp.y }, { x: mp.x, y: mp.y }];
        function buildState() {
            const lines = [];
            for (let i = 0; i < MAIN.length - 1; i++) lines.push({ id: `m_${i}`, groupId: 'main', order: i, efficiency: 4, lineType: 'transport_line', routePoints: [{ ...MAIN[i] }, { ...MAIN[i + 1] }] });
            lines.push({ id: 'b0', groupId: 'branch', order: 0, efficiency: 4, lineType: 'transport_line', routePoints: BRANCH.map(p => ({ ...p })) });
            const nodes = [{ id: 'mg', nodeId: 'mg', type: 'logistics_merge', cellKey: `${Math.round(mp.x)},${Math.round(mp.y)}`, x: mp.x, y: mp.y, point: { x: mp.x, y: mp.y }, inputGroupIds: ['branch'], outputGroupId: 'main', inputDirections: {}, currentActiveSlot: 0, roundRobinIndex: 0 }];
            const N = 60;
            const transfers = Array.from({ length: N }, (_, i) => (i % 5 === 0)
                ? { id: `br_${i}`, lineId: 'branch', itemType: 'wood', serialNumber: 1 + i, progress: (i / N) % 1, routePoints: BRANCH.map(p => ({ ...p })) }
                : { id: `mn_${i}`, lineId: 'main', itemType: 'wood', serialNumber: 1 + i, progress: (i / N) % 1, routePoints: MAIN.map(p => ({ ...p })) });
            return { logisticsLines: lines, logisticsMergeNodes: nodes, activeTransfers: transfers, mapEntities: [], resources: {} };
        }

        const stateA = buildState(); // conveyorSystem 路徑
        const stateB = buildState(); // SimContext 路徑
        const simCtx = new LogisticsSimContext(() => ({ TILE_SIZE: 20, state: stateB, getEntityConfig: () => null }));

        const snap = (s) => s.activeTransfers.map(t => `${t.id}:${(t.progress || 0).toFixed(5)}:${(t.maxAllowedProgress ?? 1).toFixed(5)}:${t.queueBlocked ? 1 : 0}:${Number(t.transportIndex) || 0}:${(Number(t.transportOffset) || 0).toFixed(3)}`).join('|');

        const prevGEState = GE.state;
        const diffs = [];
        try {
            for (let tick = 0; tick < 12; tick++) {
                // A: conveyorSystem(需 GameEngine.state 指向 stateA 供其預設參數)
                GE.state = stateA;
                const rA = runLogisticsKinematics({ simSystem: conveyorSystem, engine: GE, transportArrayState: logisticsTransportArrayState }, stateA, 0.05);
                // B: SimContext facade
                const rB = runLogisticsKinematics({ simSystem: simCtx, engine: { TILE_SIZE: 20, state: stateB, getEntityConfig: () => null }, transportArrayState: logisticsTransportArrayState }, stateB, 0.05);

                const sa = snap(stateA), sb = snap(stateB);
                const arrA = (rA.arrivals || []).map(a => a.id).sort().join(',');
                const arrB = (rB.arrivals || []).map(a => a.id).sort().join(',');
                if (sa !== sb || arrA !== arrB) {
                    diffs.push({ tick, arrA, arrB, lenA: stateA.activeTransfers.length, lenB: stateB.activeTransfers.length,
                        firstDiff: (() => { const A = sa.split('|'), B = sb.split('|'); for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) return { i, a: A[i], b: B[i] }; return null; })() });
                    if (diffs.length >= 3) break;
                }
            }
        } finally {
            GE.state = prevGEState;
        }
        return { diffs, finalLen: stateA.activeTransfers.length };
    });

    if (result.diffs.length) console.log('EQUIVALENCE DIFFS:', JSON.stringify(result.diffs, null, 2));
    expect(result.diffs, 'SimContext 與 conveyorSystem 結果應逐 tick 完全一致').toEqual([]);
});
