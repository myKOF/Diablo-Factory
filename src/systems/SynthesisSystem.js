import { EffectSystem } from "./EffectSystem.js";

export class SynthesisSystem {
    static resolveBuilding(state, building) {
        if (!building || !state || !Array.isArray(state.mapEntities)) return building || null;
        const buildingId = building.id || `${building.type1}_${building.x}_${building.y}`;
        return state.mapEntities.find(ent => (ent.id || `${ent.type1}_${ent.x}_${ent.y}`) === buildingId) || building;
    }

    static ensureDefaultRecipe(state, engine, building) {
        if (!building || building.currentRecipe || building.isUnderConstruction) return false;
        const recipes = this.getBuildingRecipes(state, engine, building) || [];
        const unlockedRecipes = recipes.filter(r => r.isUnlocked);
        if (unlockedRecipes.length !== 1) return false;

        const defaultRecipe = unlockedRecipes[0];
        building.currentRecipe = defaultRecipe;
        if (building.craftingProgress === undefined) building.craftingProgress = 0;
        if (!building.inputBuffer) building.inputBuffer = {};
        if (!building.outputBuffer) building.outputBuffer = {};
        building._missingRecipeFilterHintLogged = false;

        if (!building._autoRecipeLogKey || building._autoRecipeLogKey !== defaultRecipe.type) {
            building._autoRecipeLogKey = defaultRecipe.type;
            engine.addLog(`[加工廠] ${building.name || building.type1} 只有單一產品，已自動套用生產線：${defaultRecipe.type}`, 'LOGISTICS');
        }
        return true;
    }

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

    static getBuildingRecipes(state, engine, building) {
        // 1. 取得當前建築配置，判斷是否為加工廠 (type2 === 'processing_plant')
        const currentCfg = engine.getEntityConfig(building.type1, building.lv);
        if (!currentCfg) return [];

        const isProcessingPlant = currentCfg.type2 === 'processing_plant';
        let recipes = [];

        if (isProcessingPlant && state.buildingConfigsByType && state.buildingConfigsByType[building.type1]) {
            // [核心修正] 加工廠顯示所有定義的唯一配方，不再按類型去重
            const allLevels = state.buildingConfigsByType[building.type1];
            const recipeMap = new Map(); // 用於去除完全重複的配方定義 (避免 CSV 配置重疊)

            for (let lvKey in allLevels) {
                const lvCfg = allLevels[lvKey];
                if (lvCfg && lvCfg.ingredients_production_raw) {
                    const parsed = this.parseRecipes(lvCfg.ingredients_production_raw);
                    parsed.forEach(r => {
                        // 建立唯一鍵 (類型+產量+需求等級)，確保相同配方不重複，但不同產量/等級的同型材料都會顯示
                        const key = `${r.type}_${r.amount}_${r.reqLv}`;
                        if (!recipeMap.has(key)) {
                            recipeMap.set(key, r);
                        }
                    });
                }
            }
            recipes = Array.from(recipeMap.values());
        } else {
            // 一般建築：僅顯示當前等級配置的配方
            if (currentCfg.ingredients_production_raw) {
                recipes = this.parseRecipes(currentCfg.ingredients_production_raw);
            }
        }

        // 2. 最終處理：按解鎖等級排序，並注入 isUnlocked 狀態
        return recipes.sort((a, b) => a.reqLv - b.reqLv).map(r => ({
            ...r,
            isUnlocked: building.lv >= r.reqLv
        }));
    }

    /**
     * 3. 設定加工目標 (加入隊列)
     */
    static setCraftingTarget(state, engine, building, recipe) {
        if (!recipe.isUnlocked) return false;
        const targetBuilding = this.resolveBuilding(state, building);
        if (!targetBuilding) return false;

        targetBuilding.currentRecipe = recipe;
        targetBuilding.craftingProgress = 0;
        targetBuilding._missingRecipeFilterHintLogged = false;

        // 初始化物流緩衝區
        if (!targetBuilding.inputBuffer) targetBuilding.inputBuffer = {};
        if (!targetBuilding.outputBuffer) targetBuilding.outputBuffer = {};

        engine.addLog(`[加工廠] ${targetBuilding.name} 已設定生產線：${recipe.type} (材料充足即自動運轉)`);
        return true;
    }

    /**
     * 4. 核心生產循環 (在 GameEngine 的 logicTick 中呼叫)
     */
    static update(state, engine, deltaTime) {
        state.mapEntities.forEach(ent => {
            if (ent.isUnderConstruction) return;
            this.ensureDefaultRecipe(state, engine, ent);
            if (!ent.currentRecipe) return;

            const cfg = engine.getEntityConfig(ent.type1 || ent.type, ent.lv);
            if (!cfg) return;

            const needVillagers = cfg.need_villagers || 1;
            const isProcessingPlant = cfg.type2 === 'processing_plant';
            const stationedWorkers = ent.assignedWorkers ? ent.assignedWorkers.length : 0;
            const configuredWorkers = ent.targetWorkerCount || 0;
            const currentWorkers = isProcessingPlant
                ? Math.max(stationedWorkers, configuredWorkers)
                : stationedWorkers;
            const efficiency = Math.min(1.0, currentWorkers / needVillagers);

            if (efficiency <= 0) {
                ent.isCraftingActive = false;
                return;
            }

            if (!ent.inputBuffer) ent.inputBuffer = {};
            if (!ent.outputBuffer) ent.outputBuffer = {};

            const ingCfg = state.ingredientConfigs ? state.ingredientConfigs[ent.currentRecipe.type] : null;
            const baseTime = ingCfg ? (ingCfg.craftTime || 5) : 5;
            const needs = ingCfg ? ingCfg.need_ingredients : {};

            // 1. 自動化檢測：檢查 inputBuffer 中的材料是否足夠
            let hasEnoughIngredients = true;
            let missingIds = [];
            if (needs) {
                for (let r in needs) {
                    if ((ent.inputBuffer[r] || 0) < needs[r]) {
                        hasEnoughIngredients = false;
                        missingIds.push(`${r}:${ent.inputBuffer[r] || 0}/${needs[r]}`);
                        break;
                    }
                }
            }

            // 材料不足時暫停進度條，但不取消配方 (等待物流送達)
            if (!hasEnoughIngredients) {
                ent.isCraftingActive = false;
                const needIds = Object.keys(needs || {});
                const bufferIds = Object.keys(ent.inputBuffer || {}).map(id => `${id}:${ent.inputBuffer[id]}`);
                const debugKey = `${ent.currentRecipe.type}|${missingIds.join(',')}|${bufferIds.join(',')}`;
                if (ent._lastMissingIngredientsLog !== debugKey) {
                    ent._lastMissingIngredientsLog = debugKey;
                    engine.addLog(
                        `[加工廠] ${ent.name || ent.type1} 材料不足：currentRecipeType=${ent.currentRecipe.type}, needIngredientTypes=[${needIds.join(', ') || 'none'}], missing=[${missingIds.join(', ') || 'none'}], inputBufferTypes=[${bufferIds.join(', ') || 'empty'}]`,
                        'LOGISTICS'
                    );
                }
                return;
            }

            ent._lastMissingIngredientsLog = null;

            // 2. 開始自動生產
            ent.isCraftingActive = true;
            if (ent.craftingProgress === undefined) ent.craftingProgress = 0;
            ent.craftingProgress += (deltaTime / baseTime) * efficiency;

            // 3. 生產結算 (無限循環)
            if (ent.craftingProgress >= 1.0) {
                ent.craftingProgress = 0;

                // 扣除輸入緩衝區的原料
                if (needs) {
                    for (let r in needs) {
                        ent.inputBuffer[r] -= needs[r];
                    }
                }
                // 將成品放入輸出緩衝區 (不再直接全域加總)
                const outType = ent.currentRecipe.type;
                ent.outputBuffer[outType] = (ent.outputBuffer[outType] || 0) + ent.currentRecipe.amount;
            }
        });
    }
}
