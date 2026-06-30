const { test, expect } = require('@playwright/test');

async function loadGame(page) {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 30000 });
}

// 重現實際回報的拓樸(取自 live 狀態 dump):
// 合流輸出群組 G 在 (1250,830) 分叉:G 自己的新尾段續往 (950,870);舊下游被中段延伸切分detach成
// 孤兒群組 O(無 source/target/合流)續往 (990,630)。
// 合流入庫物品(lineId=G)的 routePoints 不得被改寫成走孤兒分叉到 (990,630)(會與 targetPoint 不符而堵死),
// 必須續走 G 自己的尾段到 (950,870)。
test('分叉後合流輸出物品不得被改道走孤兒分叉,須續走輸出群組自身尾段', async ({ page }) => {
    test.setTimeout(60000);
    await loadGame(page);

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { WorkerSystem } = await import('/src/systems/WorkerSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');

        const state = GameEngine.state;
        const originalState = JSON.parse(JSON.stringify(state));
        const prevTile = GameEngine.TILE_SIZE;
        const prevGetCfg = GameEngine.getEntityConfig;
        const prevGetFp = GameEngine.getFootprint;
        const prevPortSlots = window.UIManager?.getBuildingPortSlots;
        const prevGetId = window.UIManager?.getEntityId;

        try {
            GameEngine.TILE_SIZE = 20;
            GameEngine.getFootprint = () => ({ uw: 2, uh: 2, w: 40, h: 40 });
            GameEngine.getEntityConfig = () => ({ logistics: { canOutput: true, canInput: true }, type2: 'storage', need_villagers: 0 });
            if (window.UIManager) {
                window.UIManager.getBuildingPortSlots = (ent) => Array.isArray(ent?.portSlots) ? ent.portSlots : [];
                window.UIManager.getEntityId = (ent) => ent?.id || null;
            }

            const G = 'grp_output';     // 合流輸出群組(切分後保留 id)
            const O = 'grp_orphan';     // 切分後 detach 出的孤兒下游 id
            const I = 'grp_input';
            const seg = (id, groupId, a, b, extra = {}) => ({
                id, groupId, routePoints: [a, b], routeWidth: 1, efficiency: 4, ...extra
            });
            const P = (x, y) => ({ x, y });
            const fmt = (p) => p ? `${Math.round(p.x)},${Math.round(p.y)}` : 'null';

            const lines = [];
            // 輸入線 I: (1170,470) → 合流點 (1250,470)
            for (let x = 1170, o = 0; x < 1250; x += 20, o++) {
                lines.push(seg(`I_${x}`, I, P(x, 470), P(x + 20, 470), { sourceId: 'src', order: o,
                    sourcePort: { x: 1170, y: 470, dir: 'right', width: 1 } }));
            }
            // === 切分前:G 是一條完整線,合流點 (1250,470) → 下 (1250,830) → 左 (990,830) → 上 (990,630) 開放尾 ===
            let go = 0;
            for (let y = 470; y < 830; y += 20) lines.push(seg(`G_v_${y}`, G, P(1250, y), P(1250, y + 20), { order: go++ }));
            const downstreamSegs = [];
            for (let x = 1250; x > 990; x -= 20) { const s = seg(`G_dh_${x}`, G, P(x, 830), P(x - 20, 830), { order: go++ }); lines.push(s); downstreamSegs.push(s); }
            for (let y = 830; y > 630; y -= 20) { const s = seg(`G_dv_${y}`, G, P(990, y), P(990, y - 20), { order: go++ }); lines.push(s); downstreamSegs.push(s); }

            const src = { id: 'src', type1: 'warehouse', x: 1150, y: 470, storage: { wood: 999999 },
                assignedWorkers: [{}, {}, {}, {}, {}], logisticsTimer: 0,
                portSlots: [{ x: 1170, y: 470, dir: 'right', width: 1 }],
                outputTargets: [{ id: null, lineId: I, filter: 'wood', efficiency: 4,
                    sourcePort: { x: 1170, y: 470, dir: 'right', width: 1 },
                    routePoints: [P(1170, 470), P(1250, 470)] }] };
            lines.filter(l => l.groupId === I).forEach(l => { l.sourceId = 'src'; });

            state.mapEntities = [src];
            state.logisticsLines = lines;
            state.activeTransfers = [];
            state.logisticsMergeNodes = [];

            conveyorSystem.registerLogisticsMergeNode({
                inputGroupId: I, outputGroupId: G, point: P(1250, 470),
                inputLine: lines.find(l => l.groupId === I),
                outputLine: lines.find(l => l.groupId === G)
            });

            const worker = new WorkerSystem(state, GameEngine);
            // Phase 1:讓物品上線並合流,部分已流到下游 (路徑止於 990,630)
            for (let i = 0; i < 250; i++) worker.processAutomatedLogistics(state, 0.1);
            const beforeSplit = {};
            (state.activeTransfers || []).filter(t => t.lineId === G).forEach(t => {
                const rp = t.routePoints || []; const k = fmt(rp[rp.length - 1]); beforeSplit[k] = (beforeSplit[k] || 0) + 1;
            });

            // === Phase 2:中段延伸切分 ===
            // 下游段 detach 成孤兒群組 O(無 source/target);G 改接新尾段 (1250,830)→(1250,870)→左→(950,870)
            downstreamSegs.forEach(s => { s.groupId = O; s.sourceId = null; s.targetId = null; s.sourcePort = null; s.targetPort = null; s.targetPoint = null; });
            let nt = 1000;
            for (let y = 830; y < 870; y += 20) lines.push(seg(`G_nt_${y}`, G, P(1250, y), P(1250, y + 20), { order: nt++, targetPoint: P(950, 870) }));
            for (let x = 1250; x > 950; x -= 20) lines.push(seg(`G_nh_${x}`, G, P(x, 870), P(x - 20, 870), { order: nt++, targetPoint: P(950, 870) }));
            // 重新排序兩群組 + 重算端點 + 改道在途物品(真實 submit 流程會做這些)
            conveyorSystem.orderLogisticsSegmentsByDirection(state.logisticsLines.filter(l => l.groupId === G));
            conveyorSystem.orderLogisticsSegmentsByDirection(state.logisticsLines.filter(l => l.groupId === O));
            conveyorSystem.recalculateLogisticsGroupEndpoints(G);
            conveyorSystem.recalculateLogisticsGroupEndpoints(O);
            conveyorSystem.updateActiveTransfersOnLogisticsChange(state, new Set([G, O, I]));

            const gRoute = conveyorSystem.getLogisticsMergeNodeOutputRoute(state.logisticsMergeNodes[0]);
            const gEndAfterSplit = gRoute ? gRoute[gRoute.length - 1] : null;

            // Phase 3:再跑一段
            for (let i = 0; i < 200; i++) worker.processAutomatedLogistics(state, 0.1);

            const afterSplit = {};
            const mism = [];
            (state.activeTransfers || []).forEach(t => {
                const rp = t.routePoints || []; const end = rp[rp.length - 1];
                const key = `${t.lineId}=>${fmt(end)}`;
                afterSplit[key] = (afterSplit[key] || 0) + 1;
                if (end && t.targetPoint && Math.hypot(end.x - t.targetPoint.x, end.y - t.targetPoint.y) > 5) {
                    mism.push({ lineId: t.lineId, routeEnd: fmt(end), targetPoint: fmt(t.targetPoint), progress: +(t.progress||0).toFixed(2) });
                }
            });
            const toOrphanEndCount = (state.activeTransfers || []).filter(t => {
                const rp = t.routePoints || []; const e = rp[rp.length - 1];
                return e && Math.hypot(e.x - 990, e.y - 630) < 5;
            }).length;

            return {
                success: true,
                gEndBeforeReroute: gEndAfterSplit,
                beforeSplit,
                afterSplit,
                routeTargetMismatch: mism.slice(0, 10),
                mismatchCount: mism.length,
                toOrphanEndCount
            };
        } catch (error) {
            return { success: false, error: error.message + '\n' + error.stack };
        } finally {
            GameEngine.TILE_SIZE = prevTile;
            GameEngine.getEntityConfig = prevGetCfg;
            GameEngine.getFootprint = prevGetFp;
            if (window.UIManager && prevPortSlots) window.UIManager.getBuildingPortSlots = prevPortSlots;
            if (window.UIManager && prevGetId) window.UIManager.getEntityId = prevGetId;
            GameEngine.state = originalState;
        }
    });

    expect(result.success, result.error).toBe(true);
    // 合流輸出路由本身應止於新尾段 (950,870)
    expect(result.gEndBeforeReroute, `合流輸出路由未止於新尾段:${JSON.stringify(result)}`).toMatchObject({ x: 950, y: 870 });
    // 任何合流輸出物品都不得被改道走孤兒分叉而止於 (990,630)
    expect(result.toOrphanEndCount, `物品被改道走孤兒分叉:${JSON.stringify(result)}`).toBe(0);
});
