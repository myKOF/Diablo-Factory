const { test, expect } = require('@playwright/test');

// P1#5 回歸覆蓋：ResourceSystem（先前無任何行為斷言）。
// 斷言「領域上應為真」的行為，而非照抄實作；若日後改壞這些不變量即會變紅。
test('ResourceSystem 行為回歸基準', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { ResourceSystem } = await import('/src/systems/ResourceSystem.js?v=' + Date.now());
        const fails = [];
        const eq = (got, want, label) => { if (got !== want) fails.push(`${label}: 期望 ${JSON.stringify(want)}，得到 ${JSON.stringify(got)}`); };
        const ok = (cond, label) => { if (!cond) fails.push(label); };

        // --- depositResource：數值累加 + 零/負量守衛 + 自動建立新種類 ---
        {
            const state = { resources: { wood: 100 } };
            ResourceSystem.depositResource(state, 'wood', 50, null);
            eq(state.resources.wood, 150, 'depositResource 累加既有');
            ResourceSystem.depositResource(state, 'stone', 30, null);
            eq(state.resources.stone, 30, 'depositResource 自動建立新種類');
            ResourceSystem.depositResource(state, 'wood', 0, null);
            eq(state.resources.wood, 150, 'depositResource 零量不變（防日誌洪流）');
            ResourceSystem.depositResource(state, 'wood', -10, null);
            eq(state.resources.wood, 150, 'depositResource 負量不變');
        }

        // --- canBuildingAcceptResource：supportMap / 子字串 / 配方輸入 / 守衛 ---
        {
            const state = { ingredientConfigs: {} };
            const engine = { getEntityConfig: () => null };
            ok(ResourceSystem.canBuildingAcceptResource(state, engine, { type1: 'warehouse' }, 'WOOD') === true, 'warehouse 接受 ALL');
            ok(ResourceSystem.canBuildingAcceptResource(state, engine, { type1: 'timber_factory' }, 'WOOD') === true, 'timber_factory 接受 WOOD');
            ok(ResourceSystem.canBuildingAcceptResource(state, engine, { type1: 'barn' }, 'WOOD') === false, 'barn 拒絕 WOOD');
            ok(ResourceSystem.canBuildingAcceptResource(state, engine, { type1: 'gold_mining_factory' }, 'GOLD_ORE') === true, 'gold_mining_factory 子字串接受 GOLD_ORE');
            ok(ResourceSystem.canBuildingAcceptResource(state, engine, null, 'WOOD') === false, 'null building 拒絕');
            ok(ResourceSystem.canBuildingAcceptResource(state, engine, { type1: 'warehouse', isUnderConstruction: true }, 'WOOD') === false, '施工中拒絕');
            ok(ResourceSystem.canBuildingAcceptResource(state, engine, { type1: 'warehouse' }, null) === false, '無 resourceType 拒絕');

            const procEngine = { getEntityConfig: () => ({ logistics: { canInput: true }, type2: 'processing_plant' }) };
            const procState = { ingredientConfigs: { plank: { need_ingredients: { log: 2 } } } };
            const procBuilding = { type1: 'timber_processing_plant', currentRecipe: { type: 'plank' } };
            ok(ResourceSystem.canBuildingAcceptResource(procState, procEngine, procBuilding, 'log') === true, '加工廠依配方接受原料 log');
            ok(ResourceSystem.canBuildingAcceptResource(procState, procEngine, procBuilding, 'stone') === false, '加工廠拒絕非配方原料 stone');
            ok(ResourceSystem.canBuildingAcceptResource(procState, procEngine, { type1: 'timber_processing_plant' }, 'log') === false, '加工廠無 currentRecipe 時拒絕');
        }

        // --- depositResourceToBuilding：入庫雙寫 / 採集輸出緩衝 / 拒絕 / 守衛 ---
        {
            const state = { resources: {}, ingredientConfigs: {} };
            const engine = { getEntityConfig: () => null };
            const wh = { type1: 'warehouse', name: '倉' };
            eq(ResourceSystem.depositResourceToBuilding(state, engine, wh, 'wood', 20, null), true, '入庫回傳 true');
            eq(wh.storage.wood, 20, '入庫寫入 building.storage');
            eq(state.resources.wood, 20, '入庫同步寫入 state.resources（雙寫）');

            eq(ResourceSystem.depositResourceToBuilding(state, engine, { type1: 'barn' }, 'wood', 5, null), false, 'barn 拒絕 wood → false');
            eq(ResourceSystem.depositResourceToBuilding(state, engine, null, 'wood', 5, null), false, 'null building → false');
            eq(ResourceSystem.depositResourceToBuilding(state, engine, wh, 'wood', 0, null), false, '零量 → false');

            const gEngine = { getEntityConfig: () => ({ type2: 'gathering' }) };
            const farm = { type1: 'farmland' };
            eq(ResourceSystem.depositResourceToBuilding(state, gEngine, farm, 'food', 7, null), true, '採集輸出回傳 true');
            eq(farm.outputBuffer.food, 7, '採集輸出寫入 outputBuffer（不入全域倉）');
            eq(state.resources.food, undefined, '採集輸出不污染 state.resources');
        }

        // --- getBuildingStorage：懶初始化 ---
        {
            const b = { type1: 'warehouse' };
            const s = ResourceSystem.getBuildingStorage(b);
            ok(s && typeof s === 'object' && b.storage === s, 'getBuildingStorage 懶初始化並掛回 building');
            eq(Object.keys(ResourceSystem.getBuildingStorage(null)).length, 0, 'null building 回傳空物件');
        }

        // --- getResourceTypeName：數字→場景名稱對照 ---
        {
            eq(ResourceSystem.getResourceTypeName(1), 'SCENE_WOOD', 'type 1 → SCENE_WOOD');
            eq(ResourceSystem.getResourceTypeName(4), 'SCENE_GOLD_MINE', 'type 4 → SCENE_GOLD_MINE');
            eq(ResourceSystem.getResourceTypeName(999), null, '未知 type → null');
        }

        return { fails };
    });

    expect(result.fails, JSON.stringify(result.fails, null, 2)).toEqual([]);
});
