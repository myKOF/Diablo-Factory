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
     * 3. 設定加工目標 (加入隊列)
     */
    static setCraftingTarget(state, engine, building, recipe) {
        if (!recipe.isUnlocked) return false;
        
        // 初始化隊列
        if (!building.recipeQueue) building.recipeQueue = [];
        
        // 加入隊列 (深拷貝配方物件)
        building.recipeQueue.push({ ...recipe });
        
        // 若當前沒有正在生產，則立即開始
        if (!building.currentRecipe) {
            building.currentRecipe = building.recipeQueue.shift();
            building.craftingProgress = 0;
        }
        
        engine.addLog(`[加工廠] ${building.name || building.type1} 已加入隊列：${recipe.type} (當前隊列：${building.recipeQueue.length})`);
        return true;
    }

    /**
     * 4. 核心生產循環 (在 GameEngine 的 logicTick 中呼叫)
     */
    static update(state, engine, deltaTime) {
        if (!state.mapEntities) return;

        state.mapEntities.forEach(ent => {
            if (!ent.currentRecipe || ent.isUnderConstruction) return;
            
            const cfg = engine.getEntityConfig(ent.type1, ent.lv);
            if (!cfg) return;

            const needVillagers = cfg.need_villagers || 1;
            const currentWorkers = ent.assignedWorkers ? ent.assignedWorkers.length : 0;
            const efficiency = Math.min(1.0, currentWorkers / needVillagers);

            if (efficiency <= 0) return;

            const ingCfg = state.ingredientConfigs ? state.ingredientConfigs[ent.currentRecipe.type] : null;
            const baseTime = ingCfg ? (ingCfg.craftTime || 5) : 5;

            if (ent.craftingProgress === undefined) ent.craftingProgress = 0;
            ent.craftingProgress += (deltaTime / baseTime) * efficiency;

            if (ent.craftingProgress >= 1.0) {
                ent.craftingProgress = 0;
                if (state.resources[ent.currentRecipe.type] !== undefined) {
                    state.resources[ent.currentRecipe.type] += ent.currentRecipe.amount;
                } else {
                    state.resources[ent.currentRecipe.type] = ent.currentRecipe.amount;
                }

                // 處理隊列：從隊列中提取下一個任務
                if (ent.recipeQueue && ent.recipeQueue.length > 0) {
                    ent.currentRecipe = ent.recipeQueue.shift();
                } else {
                    // 若無隊列，則清空當前生產，停止工作
                    ent.currentRecipe = null;
                }
            }
        });
    }
}
