export class ConfigManager {
    /**
     * 泛用陣列解析器：將 "{1, 2, 3}" 或 "{wood, stone}" 轉換為真正的陣列
     */
    static parseBracketArray(str) {
        if (!str || typeof str !== 'string') return [];
        const cleanStr = str.replace(/[{}]/g, '').trim();
        if (!cleanStr) return [];
        return cleanStr.split(',').map(s => {
            const val = s.trim(); const num = parseFloat(val); return isNaN(num) ? val : num;
        });
    }

    static setFallbackConfig(state) {
        state.npcConfigs['villagers'] = { speed: 5.5, collection_speed: 10 };
        state.npcConfigs['female villagers'] = { speed: 5.5, collection_speed: 10 };
    }

    static parseCSV(text) {
        const rows = text.split(/\r?\n/).map(row => {
            const arr = [];
            let current = "";
            let inQuotes = false;
            for (let i = 0; i < row.length; i++) {
                const char = row[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    arr.push(current.trim());
                    current = "";
                } else {
                    current += char;
                }
            }
            arr.push(current.trim());
            // 移除前後引號並加入 trim()
            return arr.map(m => m.replace(/^"|"$/g, '').trim());
        }).filter(r => r.length > 1);
        if (rows.length < 2) return null;
        let headerIdx = rows.findIndex(r => r.some(cell => {
            const c = cell.toLowerCase().trim();
            return c === 'name' || c === 'id' || c === 'type';
        }));
        return { rows, headerIdx, headers: rows[headerIdx].map(h => h.trim().toLowerCase()) };
    }

    static async fetchCSVText(url) {
        try {
            const resp = await fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now());
            const buffer = await resp.arrayBuffer();
            try {
                // 優先使用 UTF-8 嚴格模式
                return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
            } catch (e) {
                // 失敗則回退至 Big5
                console.warn(`UTF-8 解碼失敗 (${url})，切換至 Big5...`);
                return new TextDecoder("big5").decode(buffer);
            }
        } catch (e) {
            console.error(`讀取 CSV 失敗 (${url}):`, e);
            return null;
        }
    }

    static parseResourceCosts(str) {
        const costs = {};
        if (!str || typeof str !== 'string' || !str.includes('=')) return costs;
        const clean = str.replace(/[\{\}"']/g, '').trim();
        const pairs = clean.split(',');
        pairs.forEach(p => {
            const [rk, rv] = p.split('=');
            if (rk && rv) {
                const key = rk.trim().toLowerCase();
                const amount = parseFloat(rv.trim());
                if (!isNaN(amount)) costs[key] = amount;
            }
        });
        return costs;
    }
    
    static async loadNPCConfig(state) {
        try {
            const text = await ConfigManager.fetchCSVText('config/npc_data.csv');
            const data = ConfigManager.parseCSV(text);
            if (!data) return;
            const { rows, headerIdx, headers } = data;

            const hIdx = (key) => headers.findIndex(h => h.toLowerCase().trim() === key.toLowerCase());

            const idxId = hIdx('id'),
                idxName = hIdx('name'),
                idxModel = hIdx('model'),
                idxFightingSpeed = hIdx('fighting_speed'),
                idxIdleSpeed = hIdx('idle_speed'),
                idxColSpeed = hIdx('collection_speed'),
                idxNeed = hIdx('need_resource'),
                idxLv = hIdx('lv'),
                idxHp = hIdx('hp'),
                idxAtk = hIdx('attack'),
                idxAtkSpeed = hIdx('attack_speed'),
                idxRange = hIdx('range'),
                idxColRes = hIdx('collection_resource'),
                idxAttackType = hIdx('attack_type'),
                idxType = hIdx('type'),
                idxCamp = hIdx('camp'),
                idxPop = hIdx('population'),
                idxPatrol = hIdx('patrol_range'),
                idxVision = hIdx('field_vision'),
                idxInitiative = hIdx('initiative_attack'),
                idxPixelSize = hIdx('pixel_size'),
                idxProduce = hIdx('produce_resource');

            console.log(`[CSV載入] NPC配置欄位索引結果:`, { id: idxId, name: idxName, need: idxNeed, size: idxPixelSize, attackType: idxAttackType });


            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxName]) continue;
                const name = row[idxName].trim();
                const id = row[idxId] ? row[idxId].trim() : null;

                if (id) state.idToNameMap[id] = name;

                state.npcConfigs[name] = {
                    id: id,
                    name: name,
                    model: row[idxModel] ? row[idxModel].trim() : 'villager',
                    type: row[idxType] ? row[idxType].trim() : 'other',
                    camp: (row[idxCamp] && row[idxCamp].trim()) || 'player',
                    population: parseInt(row[idxPop]) || 1,
                    fighting_speed: parseFloat(row[idxFightingSpeed]) || 5.5,
                    combatSpeed: parseFloat(row[idxFightingSpeed]) || 5.5, // 備援欄位：兼容 spawnNPC 的調用
                    idle_speed: parseFloat(row[idxIdleSpeed]) || 2.5,
                    collection_speed: parseFloat(row[idxColSpeed]) || 3,
                    collection_resource: parseInt(row[idxColRes]) || 1,
                    need_resource: row[idxNeed],
                    lv: parseInt(row[idxLv]) || 1,
                    hp: parseInt(row[idxHp]) || 100,
                    attack: parseInt(row[idxAtk]) || 10,
                    attackSpeed: parseFloat(row[idxAtkSpeed]) || 1,
                    range: parseInt(row[idxRange]) || 10,
                    attack_type: parseInt(row[idxAttackType]) || (name === 'mage' ? 3 : (name === 'archer' ? 2 : 1)),
                    patrol_range: parseFloat(row[idxPatrol]) || 0,
                    field_vision: parseFloat(row[idxVision]) || 15,
                    initiative_attack: parseInt(row[idxInitiative]) !== undefined ? parseInt(row[idxInitiative]) : 1,
                    need_resource: row[idxNeed],
                    costs: ConfigManager.parseResourceCosts(row[idxNeed]),
                    produce_resource: ConfigManager.parseResourceCosts(row[idxProduce])
                };

                // 解析物理尺寸 {寬,高} 或 {寬*高}
                if (idxPixelSize !== -1 && row[idxPixelSize]) {
                    const arr = this.parseBracketArray(row[idxPixelSize].replace(/\*/g, ','));
                    if (arr.length >= 2) {
                        state.npcConfigs[name].pixel_size = { w: parseInt(arr[0]), h: parseInt(arr[1]) };
                    } else if (arr.length === 1) {
                        const n = parseInt(arr[0]);
                        state.npcConfigs[name].pixel_size = { w: n, h: n };
                    }
                }
            }
        } catch (e) { }
    }

    static async loadSystemConfig(state) {
        try {
            const text = await ConfigManager.fetchCSVText('config/system_config.csv');
            console.log("--- [DEBUG] system_config.csv RAW TEXT ---");
            console.log(text.substring(0, 200) + "..."); 
            const data = ConfigManager.parseCSV(text);
            if (!data) {
                console.warn("無法解析 system_config.csv");
                return;
            }
            const { rows, headerIdx, headers } = data;
            const hIdx = (key) => headers.findIndex(h => h.toLowerCase().trim() === key.toLowerCase());
            const idxType = hIdx('type'), idxValue = hIdx('value');
            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxType]) continue;
                const type = row[idxType].trim().toLowerCase();
                const val = row[idxValue].trim();

                if (type === 'default_resource') {
                    // 解析 "{food=100,wood=200,stone=100}"
                    const costs = ConfigManager.parseResourceCosts(val);
                    console.log("--- [DEBUG] 已讀取初始資源配置:", costs);
                    
                    // 先歸零所有資源 (保持物件引用)
                    if (state.resources) {
                        for (let r in state.resources) state.resources[r] = 0;
                    } else {
                        state.resources = {};
                    }
                    
                    // 記錄初始資源鍵值，供 UI 動態顯示
                    const keys = Object.keys(costs);
                    state.initialResourceKeys = keys.slice(0, 6);
                    console.log("--- [DEBUG] UI 顯示鍵值:", state.initialResourceKeys);
                    
                    // 套用初始資源
                    keys.forEach(rk => {
                        state.resources[rk] = costs[rk];
                    });
                } else if (val.includes('*')) {
                    const parts = this.parseBracketArray(val.replace(/\*/g, ','));
                    if (parts.length === 2) {
                        state.systemConfig[type] = { w: parts[0], h: parts[1] };
                    } else {
                        state.systemConfig[type] = parts[0] || 0;
                    }
                } else if (val.startsWith('{') && val.includes(',')) {
                    state.systemConfig[type] = this.parseBracketArray(val);
                } else {
                    const num = parseFloat(val);
                    state.systemConfig[type] = isNaN(num) ? val : num;
                }
            }
        } catch (e) { }
    }

    static async loadStringsConfig(state) {
        try {
            const text = await ConfigManager.fetchCSVText('config/strings.csv');
            const data = ConfigManager.parseCSV(text);
            if (data) {
                const { rows, headerIdx, headers } = data;
                const idxId = headers.indexOf('id'), idxMsg = headers.indexOf('message');
                for (let i = headerIdx + 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row[idxId]) state.strings[row[idxId].trim()] = row[idxMsg];
                }
            }
            console.log("多語系字串加載成功:", Object.keys(state.strings).length);
        } catch (e) { console.error("加載 strings.csv 失敗:", e); }
    }

    static async loadResourceConfig(state) {
        try {
            const text = await ConfigManager.fetchCSVText('config/resources_data.csv');
            const data = ConfigManager.parseCSV(text);
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const findHIdx = (key) => headers.findIndex(h => h.toLowerCase().trim() === key.toLowerCase());
            const idxName = findHIdx('name'), idxModel = findHIdx('model'), idxType = findHIdx('type');
            const idxColRes = findHIdx('collection_resource'), idxIngredients = findHIdx('ingredients'), idxDensity = findHIdx('density');
            const idxLv = findHIdx('lv'), idxSize = findHIdx('size'), idxModelSize = findHIdx('model_size'), idxPixelSize = findHIdx('pixel_size');

            state.resourceConfigs = [];
            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxName]) continue;

                let parsedModelSize = { x: 1.0, y: 1.0 };
                if (idxModelSize !== -1 && row[idxModelSize]) {
                    const val = row[idxModelSize].trim();
                    const match = val.match(/\{[ ]*([0-9.]+)[ ]*[\*x][ ]*([0-9.]+)[ ]*\}/);
                    if (match) {
                        parsedModelSize = { x: parseFloat(match[1]), y: parseFloat(match[2]) };
                    } else {
                        const m2 = val.match(/\{[ ]*([0-9.]+)[ ]*\}/);
                        if (m2) {
                            const num = parseFloat(m2[1]);
                            if (!isNaN(num)) parsedModelSize = { x: num, y: num };
                        } else {
                            const num = parseFloat(val);
                            if (!isNaN(num)) parsedModelSize = { x: num, y: num };
                        }
                    }
                }

                let pixelSize = { w: 20, h: 20 };
                if (idxPixelSize !== -1 && row[idxPixelSize]) {
                    const val = row[idxPixelSize].trim();
                    const m1 = val.match(/\{[ ]*(\d+)[ ]*[\*,x][ ]*(\d+)[ ]*\}/);
                    if (m1) {
                        pixelSize = { w: parseInt(m1[1]), h: parseInt(m1[2]) };
                    } else {
                        const m2 = val.match(/\{[ ]*(\d+)[ ]*\}/);
                        if (m2) {
                            const n = parseInt(m2[1]);
                            pixelSize = { w: n, h: n };
                        }
                    }
                }

                let parsedIngredients = {};
                let totalAmount = 100;
                if (idxIngredients !== -1 && row[idxIngredients]) {
                    parsedIngredients = ConfigManager.parseResourceCosts(row[idxIngredients]);
                    totalAmount = Object.values(parsedIngredients).reduce((acc, val) => acc + val, 0);
                }

                state.resourceConfigs.push({
                    name: row[idxName].trim(), model: row[idxModel].trim(), type: row[idxType].trim().toUpperCase(),
                    amount: totalAmount, 
                    ingredients: parsedIngredients,
                    collection_resource: parseInt(row[idxColRes]) || 5,
                    density: parseInt(row[idxDensity]) || 5,
                    lv: parseInt(row[idxLv]) || 1, size: (idxSize !== -1 && row[idxSize]) ? row[idxSize].trim() : '{1,1}',
                    model_size: parsedModelSize,
                    pixel_size: pixelSize
                });
            }
        } catch (e) { }
    }

    static async loadIngredientConfig(state) {
        try {
            const text = await ConfigManager.fetchCSVText('config/Ingredients.csv');
            const data = ConfigManager.parseCSV(text);
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const findHIdx = (key) => headers.findIndex(h => h.toLowerCase().trim() === key.toLowerCase());
            const idxId = findHIdx('id'), idxName = findHIdx('name'), idxIcon = findHIdx('icon');
            const idxType = findHIdx('type'), idxLv = findHIdx('lv');
            const idxNeed = findHIdx('need_ingredients'), idxStack = findHIdx('stack');
            const idxProductionTimes = findHIdx('production_times');

            state.ingredientConfigs = {};
            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxId] || !row[idxType]) continue;
                
                const id = parseInt(row[idxId]);
                const type = row[idxType].trim();
                
                const productionTime = parseFloat(row[idxProductionTimes]);

                state.ingredientConfigs[type] = {
                    id: id,
                    name: row[idxName] ? row[idxName].trim() : type,
                    icon: row[idxIcon] ? row[idxIcon].trim() : '',
                    type: type,
                    lv: parseInt(row[idxLv]) || 1,
                    need_ingredients: ConfigManager.parseResourceCosts(row[idxNeed] || ''),
                    stack: parseInt(row[idxStack]) || 1000,
                    production_times: isNaN(productionTime) ? 5 : productionTime,
                    craftTime: isNaN(productionTime) ? 5 : productionTime
                };
            }
            console.log("材料需求表加載成功:", Object.keys(state.ingredientConfigs).length);
        } catch (e) { console.error("加載 Ingredients.csv 失敗:", e); }
    }

    static async loadBuildingConfig(state) {
        try {
            const text = await ConfigManager.fetchCSVText('config/buildings.csv');
            const data = ConfigManager.parseCSV(text);
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const hIdx = (key) => headers.findIndex(h => h.toLowerCase().trim() === key.toLowerCase());

            const idxModel = hIdx('model'),
                idxType1 = hIdx('type1'),
                idxCol = hIdx('collision'),
                idxSize = hIdx('size'),
                idxPop = hIdx('population'),
                idxName = headers.find(h => h === 'name' || h === '名稱'),
                idxDesc = headers.find(h => h === 'desc' || h === '描述'),
                idxMax = hIdx('max_count'),
                idxProd = hIdx('npc_production'), // ID 列表
                idxProdType = (hIdx('npc_production_type') !== -1) ? hIdx('npc_production_type') : headers.lastIndexOf('npc_production'),
                idxResourceValue = hIdx('resource_value'),
                idxNeedVillagers = hIdx('need_villagers'),
                idxType2 = hIdx('type2'),
                idxIngredientsProd = hIdx('ingredients_production'),
                idxProductionPlace = hIdx('production_place');

            console.log(`[CSV載入] 建築配置欄位索引結果:`, { model: idxModel, type1: idxType1, prod: idxProd, prodType: idxProdType });

            // 轉換為 index (使用上方載入時定義的健壯版 hIdx)
            const nameIdx = headers.indexOf(idxName);
            const descIdx = headers.indexOf(idxDesc);

            const idxLv = hIdx('lv'),
                idxUnlock = hIdx('build_unlock'),
                idxUpgradeIngredients = hIdx('upgrade_need_ingredients'),
                idxUpgradeTimes = hIdx('upgrade_times');

            state.buildingConfigs = {}; // 舊格式相容 (儲存各 modellv1 作為基礎)
            state.buildingConfigsByType = {}; // 新增：按類型與等級分組

            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxModel]) continue;

                const model = row[idxModel].trim();
                const type1 = row[idxType1] ? row[idxType1].trim() : model;
                const lv = parseInt(row[idxLv]) || 1;

                const idxProdPlace = hIdx('production_place');
                let logistics = { canInput: false, canOutput: false };
                if (idxProdPlace !== -1 && row[idxProdPlace]) {
                    const arr = this.parseBracketArray(row[idxProdPlace]);
                    if (arr.length >= 2) { logistics.canInput = arr[0] === 1; logistics.canOutput = arr[1] === 1; }
                }

                // 解析生產清單
                const prodList = this.parseBracketArray(row[idxProd]);

                const resValCosts = ConfigManager.parseResourceCosts(row[idxResourceValue]);
                const cfg = {
                    name: (nameIdx !== -1 && row[nameIdx]) ? row[nameIdx].trim() : model,
                    desc: (descIdx !== -1 && row[descIdx]) ? row[descIdx].trim() : "",
                    model: model,
                    type1: type1,
                    type2: row[idxType2] ? row[idxType2].trim() : "Other",
                    lv: lv,
                    collision: row[idxCol] === '1',
                    size: row[idxSize] || "{1,1}",
                    population: parseInt(row[idxPop]) || 0,
                    costs: ConfigManager.parseResourceCosts(row[idxUpgradeIngredients]),
                    maxCount: parseInt(row[idxMax]) || 999,
                    buildTime: parseFloat(row[idxUpgradeTimes]) || 5,
                    resourceValue: resValCosts.food || resValCosts.wood || resValCosts.stone || resValCosts.gold_ore || 0,
                    npcProduction: prodList,
                    productionMode: (row[idxProdType] || 'normal').toLowerCase().trim(),
                    logistics: logistics,
                    // 升級與解鎖相關
                    buildUnlock: row[idxUnlock] || "{0}",
                    upgradeTime: parseFloat(row[idxUpgradeTimes]) || 0,
                    need_villagers: (idxNeedVillagers !== -1 && row[idxNeedVillagers]) ? parseInt(row[idxNeedVillagers]) : 0,
                    ingredients_production_raw: (idxIngredientsProd !== -1 && row[idxIngredientsProd]) ? row[idxIngredientsProd].trim() : ""
                };

                // 按類型等級儲存
                if (!state.buildingConfigsByType[type1]) state.buildingConfigsByType[type1] = {};
                state.buildingConfigsByType[type1][lv] = cfg;

                // 為了相容舊邏輯，buildingConfigs 以 model 為 key，但只存 LV1 (用於新蓋建築)
                if (lv === 1 || !state.buildingConfigs[model]) {
                    state.buildingConfigs[model] = cfg;
                }
            }
            console.log("建築配置表加載成功。");
        } catch (e) { console.error(e); }
    }

    static async loadAllConfigs(state) {
        await Promise.all([
            this.loadNPCConfig(state),
            this.loadSystemConfig(state),
            this.loadResourceConfig(state),
            this.loadBuildingConfig(state),
            this.loadStringsConfig(state),
            this.loadIngredientConfig(state)
        ]).catch(e => console.error(e));
    }
}
