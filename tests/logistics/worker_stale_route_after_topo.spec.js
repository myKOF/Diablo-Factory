const { test, expect } = require('@playwright/test');

// [回歸] Web Worker 模式下,合流輸出線被延伸/重塑後,worker 持有的「在途物品舊路線」可能指向
// 已不存在的舊末端。若拓樸變更時主執行緒沒有重算這些路線,worker 會一直沿著失效舊路推進,
// 物品走錯路堵死(關 worker 則正常)。本測驗證:拓樸變更後物品改走現有末端,不走已刪除的舊末端。
test('Web Worker:拓樸變更後在途物品不得續走已刪除的舊末端', async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));

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

        const P = (x, y) => ({ x, y });
        const M = P(1210, 470);
        const seg = (id, groupId, a, b, extra = {}) => ({ id, groupId, order: 0, efficiency: 4,
            lineType: 'transport_line', routePoints: [a, b], ...extra });

        const lines = [];
        lines.push(seg('a0', 'gA', P(1130, 470), M, { sourceId: 'src', targetId: null }));
        // 輸出線 gB(切分前):合流點 -> 下 (1210,830) -> 左 (990,830) -> 上 (990,630) 開放尾
        let o = 0;
        const oldTail = [];
        for (let y = 470; y < 830; y += 20) lines.push(seg(`gb_v_${y}`, 'gB', P(1210, y), P(1210, y + 20), { order: o++ }));
        for (let x = 1210; x > 990; x -= 20) { const s = seg(`gb_dh_${x}`, 'gB', P(x, 830), P(x - 20, 830), { order: o++ }); lines.push(s); oldTail.push(s); }
        for (let y = 830; y > 630; y -= 20) { const s = seg(`gb_dv_${y}`, 'gB', P(990, y), P(990, y - 20), { order: o++ }); lines.push(s); oldTail.push(s); }

        state.mapEntities = [];
        state.logisticsLines = lines;
        state.logisticsMergeNodes = [];
        conveyorSystem.registerLogisticsMergeNode({ inputGroupId: 'gA', outputGroupId: 'gB', point: { ...M } });

        const N = 8;
        state.activeTransfers = Array.from({ length: N }, (_, i) => ({
            id: `t_${i}`, lineId: 'gA', targetId: null, itemType: 'wood', serialNumber: 1 + i,
            progress: 0.55 - 0.05 * i, sourceId: 'src',
            routePoints: [P(1130, 470), { ...M }], targetPoint: { ...M }
        }));

        const delay = (ms) => new Promise(r => setTimeout(r, ms));
        let workerActive = false;
        // Phase 1:讓物品合流到 gB,路線變成止於舊末端 (990,630)
        for (let tick = 0; tick < 30; tick++) {
            sys.processAutomatedLogistics(state, 0.05);
            await delay(12);
            if (sys._workerBridge) workerActive = true;
        }

        // === Phase 2:重塑 gB —— 刪掉舊尾段(讓 990,630 成為「拓樸裡已不存在」的末端),改接新尾段到 (970,850) ===
        const oldIds = new Set(oldTail.map(s => s.id));
        state.logisticsLines = state.logisticsLines.filter(l => !oldIds.has(l.id));
        let nt = 1000;
        for (let y = 830; y < 850; y += 20) state.logisticsLines.push(seg(`gb_nt_${y}`, 'gB', P(1210, y), P(1210, y + 20), { order: nt++, targetPoint: P(970, 850) }));
        for (let x = 1210; x > 970; x -= 20) state.logisticsLines.push(seg(`gb_nh_${x}`, 'gB', P(x, 850), P(x - 20, 850), { order: nt++, targetPoint: P(970, 850) }));
        conveyorSystem.orderLogisticsSegmentsByDirection(state.logisticsLines.filter(l => l.groupId === 'gB'));
        // 注意:此處「故意不呼叫」updateActiveTransfersOnLogisticsChange,模擬 live 中該重算未覆蓋這些在途物品的情況。

        // Phase 3:再跑一段,讓 worker 套用新拓樸
        for (let tick = 0; tick < 70; tick++) {
            sys.processAutomatedLogistics(state, 0.05);
            await delay(12);
        }

        const fmt = (p) => p ? `${Math.round(p.x)},${Math.round(p.y)}` : 'null';
        const dist = {};
        (state.activeTransfers || []).forEach(t => {
            const rp = t.routePoints || []; const e = rp[rp.length - 1];
            dist[`${t.lineId}=>${fmt(e)}`] = (dist[`${t.lineId}=>${fmt(e)}`] || 0) + 1;
        });
        const toOldDeleted = (state.activeTransfers || []).filter(t => {
            const rp = t.routePoints || []; const e = rp[rp.length - 1];
            return e && Math.hypot(e.x - 990, e.y - 630) < 5;
        }).length;

        return { workerActive, activeCount: state.activeTransfers.length, dist, toOldDeleted };
    });

    console.log('WORKER STALE ROUTE:', JSON.stringify(result));
    expect(errors, 'worker 路徑不應有錯誤').toEqual([]);
    expect(result.workerActive, 'worker bridge 應啟用').toBe(true);
    // 不得有物品續走已刪除的舊末端 (990,630)
    expect(result.toOldDeleted, `物品續走已刪除舊末端:${JSON.stringify(result)}`).toBe(0);
});
