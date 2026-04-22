/**
 * 資源管理系統 (ResourceSystem.js)
 * 核心職責：資源數值計算、存款結算、資源搜尋與存放點查詢
 * 遵循微創重構原則：僅搬移純資源層邏輯，不觸及工人狀態機或尋路
 */
export class ResourceSystem {

    /**
     * 資源名稱對照表 (繁體中文)
     * 用於 UI 顯示與日誌輸出
     */
    static RESOURCE_NAMES = {
        gold_ore: "金礦",
        iron_ore: "鐵礦",
        coal: "煤炭",
        magic_herb: "高級草藥",
        wolf_hide: "狼皮",
        bear_pelt: "熊皮",
        wood: "木材",
        stone: "石頭",
        fruit: "水果",
        food: "食物",
        gold_ingots: "金錠",
        healthpotion: "生命藥水",
        soul: "靈魂碎片",
        mana: "法力"
    };

    /**
     * 資源類型數字 → 場景類型名稱 對照表
     * MapDataSystem 使用數字儲存，邏輯層需要字串名稱
     */
    static RESOURCE_TYPE_MAP = {
        1: 'SCENE_WOOD',
        2: 'SCENE_STONE',
        3: 'SCENE_FRUIT',
        4: 'SCENE_GOLD_ORE',
        5: 'SCENE_IRON_ORE',
        6: 'SCENE_COAL',
        7: 'SCENE_MAGIC_HERB',
        8: 'SCENE_WOLF_CORPSE',
        9: 'SCENE_BEAR_CORPSE'
    };

    /**
     * 存入資源至全域倉庫 (純數值操作)
     * @param {Object} state GameEngine.state 引用
     * @param {string} type 資源類型 (如 'wood', 'gold_ore')
     * @param {number} amount 存入量
     * @param {Function} addLog 日誌輸出函數
     */
    static depositResource(state, type, amount, addLog) {
        if (amount <= 0) return; // 防止 0 量存款導致的日誌洪流
        if (typeof type !== 'string') type = 'food'; // 極端防護
        const resKey = type.toLowerCase();

        if (state.resources.hasOwnProperty(resKey)) {
            state.resources[resKey] += amount;
        } else if (resKey === 'food') {
            state.resources.food += amount;
        } else {
            // 自動納入新種類材料
            state.resources[resKey] = (state.resources[resKey] || 0) + amount;
        }
        if (addLog) addLog(`[資源繳庫] 工人存入了 ${amount} 單位的 ${type.toUpperCase()}`, 'TASK');
    }

    /**
     * 尋找最近的存放點 (城鎮中心、各類工廠)
     * @param {Object} state GameEngine.state 引用
     * @param {number} x 工人當前 X 座標
     * @param {number} y 工人當前 Y 座標
     * @param {string} resourceType 資源類型 (用於未來的專用倉庫篩選)
     * @returns {Object|null} 最近的存放建築實體
     */
    static findNearestDepositPoint(state, x, y, resourceType = 'WOOD') {
        const grid = state.spatialGrid;
        const startGx = Math.floor(x / grid.cellSize);
        const startGy = Math.floor(y / grid.cellSize);

        const depositTypes = ['village', 'town_center', 'barn', 'timber_factory', 'stone_factory', 'gold_mining_factory'];

        let nearest = null;
        let minDist = Infinity;

        // 從中心向外搜尋 5 圈 (約 1200 像素半徑)
        for (let r = 0; r <= 5; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const key = `${startGx + dx},${startGy + dy}`;
                    const cell = grid.cells.get(key);
                    if (cell) {
                        cell.forEach(e => {
                            if (e.isUnderConstruction) return;
                            if (depositTypes.includes(e.type)) {
                                const d = Math.hypot(e.x - x, e.y - y);
                                if (d < minDist) { minDist = d; nearest = e; }
                            }
                        });
                    }
                }
            }
            if (nearest) return nearest;
        }

        // 如果附近沒找到，回退到全量搜尋防止 Bug
        state.mapEntities.forEach(e => {
            if (e.isUnderConstruction || !depositTypes.includes(e.type)) return;
            const d = Math.hypot(e.x - x, e.y - y);
            if (d < minDist) { minDist = d; nearest = e; }
        });
        return nearest;
    }

    /**
     * 尋找最近的可採集資源
     * @param {Object} state GameEngine.state 引用
     * @param {number} TILE_SIZE 格子尺寸
     * @param {number} x 搜尋起點 X
     * @param {number} y 搜尋起點 Y
     * @param {string} typeOrName 資源類型 (如 'WOOD', 'SCENE_GOLD_ORE')
     * @param {string} villagerId 工人 ID (保留用)
     * @returns {Object|null} 最近資源的模擬物件
     */
    static findNearestResource(state, TILE_SIZE, x, y, typeOrName, villagerId) {
        if (!state.mapData || !typeOrName) return null;

        // 轉換類型名稱為數字 (1: WOOD, 2: STONE, 3: FOOD, 4: GOLD...)
        let targetType = 0;
        const upper = typeOrName.toUpperCase();
        if (upper === 'WOOD' || upper === 'SCENE_WOOD') targetType = 1;
        else if (upper === 'STONE' || upper === 'SCENE_STONE') targetType = 2;
        else if (upper === 'FOOD' || upper === 'FRUIT' || upper === 'SCENE_FRUIT') targetType = 3;
        else if (upper === 'GOLD' || upper === 'GOLD_ORE' || upper === 'SCENE_GOLD_ORE') targetType = 4;
        else if (upper === 'IRON' || upper === 'IRON_ORE' || upper === 'SCENE_IRON_ORE') targetType = 5;
        else if (upper === 'COAL' || upper === 'SCENE_COAL') targetType = 6;
        else if (upper === 'MAGIC_HERB' || upper === 'SCENE_MAGIC_HERB') targetType = 7;
        else if (upper === 'WOLF' || upper === 'SCENE_WOLF_CORPSE') targetType = 8;
        else if (upper === 'BEAR' || upper === 'SCENE_BEAR_CORPSE') targetType = 9;

        if (targetType === 0) return null;

        const TS = TILE_SIZE;

        // --- 核心優化：優先搜尋建築實體資源 (農田/樹木田) ---
        const entities = state.mapEntities.filter(e =>
            !e.isUnderConstruction && e.amount > 0 &&
            ((targetType === 3 && (e.type === 'farmland' || e.type === 'corpse')) || (targetType === 1 && e.type === 'tree_plantation'))
        );
        if (entities.length > 0) {
            entities.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
            const nearestEnt = entities[0];
            if (Math.hypot(nearestEnt.x - x, nearestEnt.y - y) < 800) {
                return nearestEnt;
            }
        }

        const gx = Math.floor(x / TS);
        const gy = Math.floor(y / TS);

        // 螺旋搜尋 (使用 MapDataSystem)
        for (let r = 0; r <= 80; r++) {
            for (let dy = -r; dy <= r; dy++) {
                const ny = gy + dy;
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const nx = gx + dx;
                    const res = state.mapData.getResource(nx, ny);
                    if (res && res.type === targetType && res.amount > 0) {
                        return {
                            id: `${nx}_${ny}`,
                            x: nx * TS + TS / 2,
                            y: ny * TS + TS / 2,
                            gx: nx,
                            gy: ny,
                            type: upper,
                            resourceType: upper,
                            amount: res.amount
                        };
                    }
                }
            }
        }
        return null;
    }

    /**
     * 取得資源的中文名稱
     * @param {string} key 資源鍵值 (如 'wood', 'gold_ore')
     * @returns {string} 中文名稱或原始鍵值
     */
    static getResourceName(key) {
        return this.RESOURCE_NAMES[String(key).toLowerCase()] || key;
    }

    /**
     * 取得資源類型對照名稱
     * @param {number} typeNum 資源類型數字
     * @returns {string|null} 場景類型名稱
     */
    static getResourceTypeName(typeNum) {
        return this.RESOURCE_TYPE_MAP[typeNum] || null;
    }
}
