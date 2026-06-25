const { test, expect } = require('@playwright/test');

// P1b 安全網：釘住 getLogisticsMergeAdmissionWinner / commitLogisticsMergeAdmission /
// zipper 狀態機「目前」的可觀察行為。這些是特徵測試(characterization tests)——
// 在現有碼上應全綠；其目的是在後續把裁判重構為「純 decideWinner + commit」時，
// 證明語意未被改變。任一條變紅 = 重構動到了行為，必須停下檢視。
//
// 幾何約定：TILE_SIZE=20、spacing=20。合流點 (100,100)。
//   輸入線 a: (0,100)->(100,100)   total=100，終點=合流點
//   輸入線 b: (100,0)->(100,100)   total=100，終點=合流點
//   輸出線 out: 起點即合流點
// participantCount = 2 inputs + 1 through = 3；through slot index = 2。
test('合流裁判/commit/zipper 狀態機特徵基準', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsMergeNodeRuntime } = await import('/src/systems/logistics/LogisticsMergeNodeRuntime.js?v=' + Date.now());

        const failures = [];
        const check = (cond, label) => { if (!cond) failures.push(label); };
        const eq = (got, want, label) => { if (got !== want) failures.push(`${label}: 期望 ${JSON.stringify(want)}，得到 ${JSON.stringify(got)}`); };

        const INPUT_A_ROUTE = [{ x: 0, y: 100 }, { x: 100, y: 100 }];
        const INPUT_B_ROUTE = [{ x: 100, y: 0 }, { x: 100, y: 100 }];
        // 主線穿越路徑：穿過合流點 (100,100)，合流點位於距離 100 處（route 中段）
        const THROUGH_ROUTE = [{ x: 100, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 300 }];

        function makeTransfer(id, lineId, progress, routePoints) {
            return { id, lineId, progress, routePoints, sourceId: `${lineId}_src`, targetId: null };
        }

        // 每個情境都建立全新的 node + state，避免跨情境因 node 變異而汙染。
        function setup({ activeSlot = 0, transfers = [] } = {}) {
            const node = {
                id: 'mn', outputGroupId: 'out', inputGroupIds: ['a', 'b'],
                point: { x: 100, y: 100 },
                currentActiveSlot: activeSlot, roundRobinIndex: activeSlot
            };
            const state = { logisticsMergeNodes: [node], activeTransfers: transfers };
            const system = {
                ensureLogisticsMergeNodeStore: () => state.logisticsMergeNodes,
                getLogisticsMergeNodeForInputTransfer: (t) => node.inputGroupIds.includes(t.lineId) ? node : null,
                getLogisticsMergeNodeOutputRoute: () => [{ x: 100, y: 100 }, { x: 100, y: 300 }],
                getLogisticsSegmentsByGroupId: () => [{ sourceId: 'merge_output', targetId: 'tgt', efficiency: 4 }]
            };
            const runtime = new LogisticsMergeNodeRuntime(system, () => ({ TILE_SIZE: 20, state }));
            return { node, state, runtime };
        }

        // --- CT1: 兩輸入皆就緒時，依 currentActiveSlot 輪詢選出輸入 winner ---
        {
            const a = makeTransfer('item_a', 'a', 0.98, INPUT_A_ROUTE);
            const b = makeTransfer('item_b', 'b', 0.98, INPUT_B_ROUTE);
            const s0 = setup({ activeSlot: 0, transfers: [a, b] });
            eq(s0.runtime.getLogisticsMergeAdmissionWinner(s0.node, s0.state), 'item_a', 'CT1 slot0→a');
            const s1 = setup({ activeSlot: 1, transfers: [makeTransfer('item_a', 'a', 0.98, INPUT_A_ROUTE), makeTransfer('item_b', 'b', 0.98, INPUT_B_ROUTE)] });
            eq(s1.runtime.getLogisticsMergeAdmissionWinner(s1.node, s1.state), 'item_b', 'CT1 slot1→b');
        }

        // --- CT2: 只有就緒(逼近門口)的輸入才有資格；遠端的不被選 ---
        {
            // a 遠離門口(progress 0.1)、b 就緒；即使 activeSlot=0(指向 a)，也應輪到 b
            const a = makeTransfer('item_a', 'a', 0.1, INPUT_A_ROUTE);
            const b = makeTransfer('item_b', 'b', 0.98, INPUT_B_ROUTE);
            const s = setup({ activeSlot: 0, transfers: [a, b] });
            eq(s.runtime.getLogisticsMergeAdmissionWinner(s.node, s.state), 'item_b', 'CT2 僅就緒者可選');
        }

        // --- CT3: commit 推進 slot(mod 3) 並把輪次交還主線(zipperTurn=main, awaitingMainPass=true) ---
        {
            const a = makeTransfer('item_a', 'a', 0.98, INPUT_A_ROUTE);
            const b = makeTransfer('item_b', 'b', 0.98, INPUT_B_ROUTE);
            const s = setup({ activeSlot: 0, transfers: [a, b] });
            const winner = s.runtime.getLogisticsMergeAdmissionWinner(s.node, s.state);
            s.runtime.commitLogisticsMergeAdmission(s.node, winner, s.state);
            eq(winner, 'item_a', 'CT3 winner=a');
            eq(s.node.currentActiveSlot, 1, 'CT3 commit 後 slot=(0+1)%3');
            eq(s.node.zipperTurn, 'main', 'CT3 commit 後 zipperTurn=main');
            eq(s.node.awaitingMainPass, true, 'CT3 commit 後 awaitingMainPass=true');
            eq(s.node.lastAdmittedTransferId, 'item_a', 'CT3 lastAdmittedTransferId=a');
            eq(s.node.hasCommittedAdmission, true, 'CT3 hasCommittedAdmission');
        }

        // --- CT4: 輪到主線(through slot due)且有就緒穿越車 → winner=null 且 zipper 轉 main/awaiting ---
        {
            const through = makeTransfer('item_main', 'out', 0.35, THROUGH_ROUTE); // distance≈105，合流點在 100 → 視窗內
            const a = makeTransfer('item_a', 'a', 0.98, INPUT_A_ROUTE);
            const s = setup({ activeSlot: 2, transfers: [through, a] }); // slot 2 = through due
            const winner = s.runtime.getLogisticsMergeAdmissionWinner(s.node, s.state);
            eq(winner, null, 'CT4 through due+就緒 → winner=null');
            eq(s.node.zipperTurn, 'main', 'CT4 zipperTurn=main');
            eq(s.node.awaitingMainPass, true, 'CT4 awaitingMainPass=true');
        }

        // --- CT5: 凍結狀態下連續呼叫具冪等性(同一 winner) ---
        {
            const a = makeTransfer('item_a', 'a', 0.98, INPUT_A_ROUTE);
            const b = makeTransfer('item_b', 'b', 0.98, INPUT_B_ROUTE);
            const s = setup({ activeSlot: 0, transfers: [a, b] });
            const w1 = s.runtime.getLogisticsMergeAdmissionWinner(s.node, s.state);
            const w2 = s.runtime.getLogisticsMergeAdmissionWinner(s.node, s.state);
            const w3 = s.runtime.getLogisticsMergeAdmissionWinner(s.node, s.state);
            check(w1 === w2 && w2 === w3, `CT5 冪等：得到 ${w1}/${w2}/${w3}`);
        }

        // --- CT6: 無就緒輸入時 winner=null ---
        {
            const a = makeTransfer('item_a', 'a', 0.1, INPUT_A_ROUTE);
            const b = makeTransfer('item_b', 'b', 0.1, INPUT_B_ROUTE);
            const s = setup({ activeSlot: 0, transfers: [a, b] });
            eq(s.runtime.getLogisticsMergeAdmissionWinner(s.node, s.state), null, 'CT6 無就緒→null');
        }

        return { failures };
    });

    expect(result.failures, JSON.stringify(result.failures, null, 2)).toEqual([]);
});
