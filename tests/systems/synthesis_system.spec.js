const { test, expect } = require('@playwright/test');

// P1#5 回歸覆蓋：SynthesisSystem（先前無任何行為斷言）。
test('SynthesisSystem 行為回歸基準', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { SynthesisSystem } = await import('/src/systems/SynthesisSystem.js?v=' + Date.now());
        const fails = [];
        const eq = (got, want, label) => { if (got !== want) fails.push(`${label}: 期望 ${JSON.stringify(want)}，得到 ${JSON.stringify(got)}`); };
        const ok = (cond, label) => { if (!cond) fails.push(label); };

        // --- parseRecipes：純字串解析 ---
        {
            eq(SynthesisSystem.parseRecipes('').length, 0, 'parseRecipes 空字串 → []');
            eq(SynthesisSystem.parseRecipes(null).length, 0, 'parseRecipes null → []');
            const one = SynthesisSystem.parseRecipes('{wooden_planks,2,timber_processing_plant.lv=3}');
            eq(one.length, 1, 'parseRecipes 單組長度');
            eq(one[0].type, 'wooden_planks', 'parseRecipes type');
            eq(one[0].amount, 2, 'parseRecipes amount');
            eq(one[0].reqBuilding, 'timber_processing_plant', 'parseRecipes reqBuilding');
            eq(one[0].reqLv, 3, 'parseRecipes reqLv');
            eq(SynthesisSystem.parseRecipes('{a,1,b.lv=1}|{c,5,d.lv=2}').length, 2, 'parseRecipes 多組以 | 分隔');
            eq(SynthesisSystem.parseRecipes('{iron_bar,1,smelting_plant}')[0].reqLv, 1, 'parseRecipes 缺 .lv= 預設 reqLv=1');
            eq(SynthesisSystem.parseRecipes('{a,xyz,b.lv=1}')[0].amount, 1, 'parseRecipes 非數字 amount 退回 1');
            eq(SynthesisSystem.parseRecipes('{a,1}').length, 0, 'parseRecipes 欄位不足(<3)略過');
        }

        // --- getBuildingRecipes：依等級注入 isUnlocked 並按 reqLv 排序 ---
        {
            const engine = { getEntityConfig: () => ({ type2: 'factory', ingredients_production_raw: '{b,1,_.lv=3}|{a,1,_.lv=1}' }) };
            const recipes = SynthesisSystem.getBuildingRecipes({}, engine, { type1: 'factory', lv: 2 });
            eq(recipes.length, 2, 'getBuildingRecipes 數量');
            eq(recipes[0].reqLv, 1, 'getBuildingRecipes 依 reqLv 升冪排序');
            eq(recipes[0].isUnlocked, true, 'lv2 解鎖 reqLv1');
            eq(recipes[1].isUnlocked, false, 'lv2 未解鎖 reqLv3');
            eq(SynthesisSystem.getBuildingRecipes({}, { getEntityConfig: () => null }, { type1: 'x', lv: 1 }).length, 0, '無 config → []');
        }

        // --- resolveBuilding：以 id / type1_x_y 對應 state.mapEntities 中的活實體 ---
        {
            const live = { id: 'b1', type1: 'tp', x: 1, y: 2, tag: 'LIVE' };
            const state = { mapEntities: [live] };
            ok(SynthesisSystem.resolveBuilding(state, { id: 'b1' }) === live, 'resolveBuilding 依 id 命中活實體');
            const live2 = { type1: 'tp', x: 5, y: 6, tag: 'LIVE2' };
            const state2 = { mapEntities: [live2] };
            ok(SynthesisSystem.resolveBuilding(state2, { type1: 'tp', x: 5, y: 6 }) === live2, 'resolveBuilding 依 type1_x_y 命中');
            const stale = { id: 'ghost' };
            ok(SynthesisSystem.resolveBuilding(state, stale) === stale, 'resolveBuilding 找不到 → 退回原參數');
        }

        // --- setCraftingTarget：鎖定配方拒絕，解鎖配方設定 ---
        {
            const engine = { addLog: () => {} };
            const b = { id: 'b1', type1: 'tp', name: '廠' };
            const state = { mapEntities: [b] };
            eq(SynthesisSystem.setCraftingTarget(state, engine, b, { type: 'plank', isUnlocked: false }), false, '鎖定配方 → false');
            eq(SynthesisSystem.setCraftingTarget(state, engine, b, { type: 'plank', amount: 5, isUnlocked: true }), true, '解鎖配方 → true');
            eq(b.currentRecipe.type, 'plank', 'setCraftingTarget 設定 currentRecipe');
            eq(b.craftingProgress, 0, 'setCraftingTarget 重置進度');
            ok(b.inputBuffer && b.outputBuffer, 'setCraftingTarget 初始化緩衝區');
        }

        // --- update：核心生產循環 ---
        {
            const engine = { getEntityConfig: () => ({ type2: 'processing_plant' }), addLog: () => {} };
            const ingredientConfigs = { plank: { production_times: 2.0, need_ingredients: { log: 3 } } };

            // (a) 有工人 + 材料足 + 進度跨越 1.0 → 產出一批、扣料、進度歸零
            const ent = { type1: 'tp', lv: 1, currentRecipe: { type: 'plank', amount: 5 }, craftingProgress: 0.9, inputBuffer: { log: 10 }, outputBuffer: {}, assignedWorkers: ['w1'] };
            const stateA = { mapEntities: [ent], ingredientConfigs };
            SynthesisSystem.update(stateA, engine, 0.3); // 0.9 + 0.3/2.0 = 1.05 → 觸發
            eq(ent.outputBuffer.plank, 5, 'update 產出 amount 進 outputBuffer');
            eq(ent.inputBuffer.log, 7, 'update 扣除 need_ingredients(10-3)');
            eq(ent.craftingProgress, 0, 'update 產出後進度歸零');
            eq(ent.isCraftingActive, true, 'update 生產中 isCraftingActive=true');

            // (b) 無工人 → 暫停、不前進
            const ent2 = { type1: 'tp', lv: 1, currentRecipe: { type: 'plank', amount: 5 }, craftingProgress: 0.5, inputBuffer: { log: 10 }, outputBuffer: {}, assignedWorkers: [], targetWorkerCount: 0 };
            SynthesisSystem.update({ mapEntities: [ent2], ingredientConfigs }, engine, 0.3);
            eq(ent2.craftingProgress, 0.5, 'update 無工人時進度不前進');
            eq(ent2.isCraftingActive, false, 'update 無工人 isCraftingActive=false');

            // (c) 材料不足 → 暫停、不扣料、不產出
            const ent3 = { type1: 'tp', lv: 1, currentRecipe: { type: 'plank', amount: 5 }, craftingProgress: 0.95, inputBuffer: { log: 2 }, outputBuffer: {}, assignedWorkers: ['w1'] };
            SynthesisSystem.update({ mapEntities: [ent3], ingredientConfigs }, engine, 0.3);
            eq(ent3.inputBuffer.log, 2, 'update 材料不足不扣料');
            eq(ent3.outputBuffer.plank, undefined, 'update 材料不足不產出');
            eq(ent3.isCraftingActive, false, 'update 材料不足 isCraftingActive=false');
        }

        return { fails };
    });

    expect(result.fails, JSON.stringify(result.fails, null, 2)).toEqual([]);
});
