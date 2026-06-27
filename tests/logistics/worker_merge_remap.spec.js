const { test, expect } = require('@playwright/test');

// [回歸] Web Worker 模式下,合流交接在 worker 內部完成(換 lineId/routePoints/targetPoint);
// 主執行緒必須收到「重映射」並更新本地 transfer,否則渲染仍沿舊輸入線路徑 → 物品在合流點後消失/卡住。
// 本測驗證:合流過去的物品,其主執行緒 routePoints 會被更新成輸出線,且物品最終入庫。
test('Web Worker:合流交接後主執行緒路線同步更新(否則合流點後消失)', async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => !!(window.GAME_STATE && window.GameEngine && window.PhaserScene), { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const state = window.GAME_STATE;
        const engine = window.GameEngine;
        const sys = engine.workerSystem.logisticsSystem;
        state.isPaused = true;
        window.LOGISTICS_WORKER = true;

        // 幾何:輸入線 gA (500,600)->(600,600) 止於合流點;輸出線 gB (600,600)->(760,600) 至倉庫。
        const merge = { x: 600, y: 600 };
        const whPt = { x: 760, y: 600 };
        const wh = { id: 'wh1', type1: 'warehouse', x: whPt.x, y: whPt.y, storage: {} };
        state.mapEntities = [wh];
        state.logisticsLines = [
            { id: 'a0', groupId: 'gA', order: 0, efficiency: 4, lineType: 'transport_line', sourceId: 'src_a', targetId: null, routePoints: [{ x: 500, y: 600 }, { ...merge }] },
            { id: 'b0', groupId: 'gB', order: 0, efficiency: 4, lineType: 'transport_line', sourceId: 'src_b', targetId: 'wh1', routePoints: [{ ...merge }, { ...whPt }] }
        ];
        state.logisticsMergeNodes = [];
        conveyorSystem.registerLogisticsMergeNode({ inputGroupId: 'gA', outputGroupId: 'gB', point: { ...merge } });

        // 支線物品就緒於合流門口附近
        const N = 6;
        state.activeTransfers = Array.from({ length: N }, (_, i) => ({
            id: `t_${i}`, lineId: 'gA', targetId: null, itemType: 'wood', serialNumber: 1 + i,
            progress: 0.75 - 0.07 * i, sourceId: 'src_a',
            routePoints: [{ x: 500, y: 600 }, { ...merge }],
            targetPoint: { ...merge }
        }));

        const delay = (ms) => new Promise(r => setTimeout(r, ms));
        let workerActive = false;
        let sawRemapToOutput = false;

        for (let tick = 0; tick < 120; tick++) {
            sys.processAutomatedLogistics(state, 0.05);
            await delay(15);
            if (sys._workerBridge) workerActive = true;
            // 任何主執行緒 transfer 換到 gB 即代表 remap 已套用
            for (const t of state.activeTransfers) {
                if (t.lineId === 'gB') {
                    const end = t.routePoints[t.routePoints.length - 1];
                    if (end && Math.abs(end.x - whPt.x) + Math.abs(end.y - whPt.y) < 1) sawRemapToOutput = true;
                }
            }
        }

        const whWood = Number(wh.storage.wood || 0);
        return {
            workerActive,
            sawRemapToOutput,
            startCount: N,
            endCount: state.activeTransfers.length,
            whWood,
            // 殘留在主執行緒、仍掛在舊輸入線 gA 且 progress 卡在 1 的數量(理想為 0)
            stuckOnInput: state.activeTransfers.filter(t => t.lineId === 'gA' && (t.progress || 0) >= 0.999).length
        };
    });

    console.log('WORKER MERGE REMAP:', JSON.stringify(result));
    expect(errors, 'worker 路徑不應有錯誤').toEqual([]);
    expect(result.workerActive, 'worker bridge 應啟用').toBe(true);
    // 關鍵:合流過去的物品,主執行緒路線已同步成輸出線 gB(終點=倉庫)
    expect(result.sawRemapToOutput, '主執行緒應收到合流重映射(換到輸出線)').toBe(true);
    // 應有物品最終入庫(未在合流點/端口堵死消失)
    expect(result.whWood, '合流物品應經輸出線抵達並入庫').toBeGreaterThan(0);
});
