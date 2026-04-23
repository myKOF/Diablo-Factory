/**
 * SynthesisSystem — 流水線加工廠系統
 * 負責處理建築物的配方解析、生產進度更新與產出物結算。
 * 遵循 [架構解耦與防污染搬移協議]，不修改既有 WorkerSystem 或 ResourceSystem。
 */
export class SynthesisSystem {
    /**
     * 1. 解析生產配方字串
     * 格式範例: "{wooden_planks,1,timber_processing_plant.lv=1}|{...}"
     * 回傳: [{ type: 'wooden_planks', amount: 1, reqBuilding: 'timber_processing_plant', reqLv: 1 }]
     */
    /**
     * 解析生產配方字串
     * 格式範例: "{wooden_planks,1,timber_processing_plant.lv=1}|{...}"
     */
    static parseRecipes(rawString) {
        if (!rawString || rawString === '') return [];
        const recipes = [];
        // 支援多組配方，假設以 | 分隔
        const blocks = rawString.split('|');
        blocks.forEach(block => {
            const clean = block.replace(/[\{\}]/g, '').trim();
            if (!clean) return;
            const parts = clean.split(',');
            if (parts.length >= 3) {
                const req = parts[2].trim().split('.lv=');
                recipes.push({
                    type: parts[0].trim(),
                    amount: parseFloat(parts[1].trim()) || 1,
                    reqBuilding: req[0] ? req[0].trim() : '',
                    reqLv: req.length > 1 ? parseInt(req[1]) : 1
                });
            }
        });
        return recipes;
    }

    /**
     * 2. 獲取建築的生產選單 (供 UI 呼叫)
     * 找出該類型建築的所有配方，並標記是否解鎖 (isUnlocked)
     */
    static getBuildingRecipes(state, engine, building) {
        // 1. 從 Config 取得該建築類型設定的 ingredients_production_raw
        const cfg = engine.getEntityConfig(building.type1, building.lv);
        if (!cfg || !cfg.ingredients_production_raw) return [];

        // 2. 解析配方
        const recipes = this.parseRecipes(cfg.ingredients_production_raw);

        // 3. 比對 building.lv 與 reqLv，加入 isUnlocked 標記
        return recipes.map(r => ({
            ...r,
            isUnlocked: building.lv >= r.reqLv
        }));
    }

    /**
     * 3. 設定加工目標
     */
    static setCraftingTarget(state, engine, building, recipe) {
        if (!recipe.isUnlocked) return false;
        building.currentRecipe = recipe;
        building.craftingProgress = 0;
        engine.addLog(`[加工廠] ${building.name || building.type1} 開始生產 ${recipe.type}`);
        return true;
    }

    /**
     * 4. 核心生產循環 (在 GameEngine 的 logicTick 中呼叫)
     */
    static update(state, engine, deltaTime) {
        if (!state.mapEntities) return;

        // 遍歷所有 mapEntities
        state.mapEntities.forEach(ent => {
            // 排除無配方或施工中的建築
            if (!ent.currentRecipe || ent.isUnderConstruction) return;
            
            const cfg = engine.getEntityConfig(ent.type1, ent.lv);
            if (!cfg) return;

            // 計算生產效率 (當前派駐人數 / 需要人數)
            const needVillagers = cfg.need_villagers || 1;
            const currentWorkers = ent.assignedWorkers ? ent.assignedWorkers.length : 0;
            const efficiency = Math.min(1.0, currentWorkers / needVillagers);

            // 若無人派駐，則停止生產
            if (efficiency <= 0) return;

            // 取得配方的生產所需時間 (從 ingredientConfigs 查詢)
            const ingCfg = state.ingredientConfigs ? state.ingredientConfigs[ent.currentRecipe.type] : null;
            const baseTime = ingCfg ? (ingCfg.craftTime || 5) : 5; // 預設 5 秒

            // 增加進度
            if (ent.craftingProgress === undefined) ent.craftingProgress = 0;
            ent.craftingProgress += (deltaTime / baseTime) * efficiency;

            // 產出結算
            if (ent.craftingProgress >= 1.0) {
                ent.craftingProgress = 0;
                // 增加產出物
                if (state.resources[ent.currentRecipe.type] !== undefined) {
                    state.resources[ent.currentRecipe.type] += ent.currentRecipe.amount;
                } else {
                    // 若資源不存在則初始化 (相容性處理)
                    state.resources[ent.currentRecipe.type] = ent.currentRecipe.amount;
                }
                
                // 擴展預留：若有消耗原料的需求，需在此處扣除
            }
        });
    }
}
