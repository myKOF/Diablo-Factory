import { UI_CONFIG } from "../ui/ui_config.js";
import { PathfindingSystem } from "./PathfindingSystem.js?v=3";



/**
 * 核心遊戲邏輯系統
 * 處理生產線、資源更新、碰撞、人口上限與 A* 尋路
 */
export class GameEngine {
    static TILE_SIZE = 20; // 基礎座標單位

    static state = {
        resources: { healthPotion: 0, soul: 100, gold: 100, wood: 200, stone: 0, food: 0, mana: 0 },
        buildings: { village: 1, farmhouse: 0 },
        units: { villagers: [], priest: 0, mage: 0, archmage: 0, swordsman: 0, archer: 0 },
        mapEntities: [],
        log: ["暗黑煉金工廠：末日準備中..."],
        npcConfigs: {},
        systemConfig: { village_standby_range: 150, village_standby_speed: 3 },
        resourceConfigs: [],
        buildingConfigs: {},
        placingType: null,
        previewPos: null,
        buildingMode: 'NONE', // 'NONE', 'DRAG', 'STAMP', 'LINE'
        lineStartPos: null,
        linePreviewEntities: [],
        // 生產隊列已移至各城鎮中心實體上 (entity.queue / entity.productionTimer)
        currentGlobalCommand: 'IDLE',
        strings: {}, // 存放從 strings.csv 讀取的訊息資料
        lastMaxPop: 0,
        hasHitPopLimit: false,
        assignmentTimer: 0, // 用於定期分配過載/空閒工人
        spatialGrid: {
            cellSize: 240, // 3個 TILE_SIZE，作為一個搜索區域
            cells: new Map() // key: "gx,gy", value: Set(entity)
        },
        settings: {
            showResourceInfo: true // 預設顯示大地圖資源資訊（名稱、等級、數量）
        },
        idToNameMap: {}, // NPC ID -> NPC Name (用於從 buildings.csv 定義的 ID 找配置)
        renderVersion: 0, // 用於通知渲染器強行刷新
        pathfinding: null, // 尋路系統實例
        selectedUnitIds: [], // 目前選中的單位 ID 列表
        lastSelectedUnitId: null, // 上一次選中的單位 ID (用於雙擊檢測)
        lastSelectionTime: 0 // 上一次選中的時間 (用於雙擊檢測)
    };


    static RESOURCE_NAMES = {
        gold: "黃金",
        wood: "木材",
        stone: "石頭",
        food: "食物",
        healthPotion: "藥水",
        soul: "靈魂"
    };

    static lastTickTime = 0;
    static isStarted = false;

    static async start() {
        if (this.isStarted) return;
        this.isStarted = true;
        window.GAME_STATE = this.state;
        this.setFallbackConfig();
        await Promise.all([
            this.loadNPCConfig(),
            this.loadSystemConfig(),
            this.loadResourceConfig(),
            this.loadBuildingConfig(),
            this.loadStringsConfig()
        ]).catch(e => console.error(e));
        this.state.pathfinding = new PathfindingSystem();
        this.state.pathfinding.tileSize = this.TILE_SIZE;
        this.state.pathfinding.setAcceptableTiles([0]);

        this.generateMap();

        const tc = this.state.mapEntities.find(e => e.id === 'core_village');
        const bx = tc ? tc.x : 960;
        const by = tc ? tc.y : 560;

        // 核心設定：一開始出生的三個市民由城鎮中心下方的三個合適點位出生，避免重疊
        this.spawnNPC('villagers', null, { x: bx - 40, y: by + 110 });
        this.spawnNPC('female villagers', null, { x: bx, y: by + 110 });
        this.spawnNPC('villagers', null, { x: bx + 40, y: by + 110 });

        this.lastTickTime = Date.now();
        this.initBackgroundWorker();
        setInterval(() => this.productionTick(), 1000);

        // UI 更新循環 (10Hz)
        setInterval(() => {
            if (window.UIManager) window.UIManager.updateValues();
        }, 100);
    }


    static initBackgroundWorker() {
        const blob = new Blob([`
            setInterval(() => { self.postMessage('tick'); }, 50); // 降低頻率至 20Hz (50ms)，顯著節省 CPU
        `], { type: "text/javascript" });
        const worker = new Worker(URL.createObjectURL(blob));
        worker.onmessage = () => { this.logicTick(); };
        console.log("背景執行 Worker 已啟動");
    }

    static logicTick() {
        if (this.state.pathfinding) this.state.pathfinding.update();
        const now = Date.now();

        const deltaTime = Math.min((now - this.lastTickTime) / 1000, 0.2);
        this.lastTickTime = now;

        // 處理每間城鎮中心各自的獨立生產隊列
        const maxPop = this.getMaxPopulation();
        const currentPop = this.getCurrentPopulation();
        const isPopFull = currentPop >= maxPop;

        // 偵測人口上限變動（全域一次即可）
        if (this.state.lastMaxPop > 0 && maxPop > this.state.lastMaxPop) {
            this.triggerWarning("3", [maxPop]);
        }
        this.state.lastMaxPop = maxPop;

        // 1.2 建築生產邏輯 (所有具備生產隊列的建築)
        this.state.mapEntities.forEach(ent => {
            if (ent.isUnderConstruction || !ent.queue || ent.queue.length === 0) return;

            // 處理生產計時
            if (ent.productionTimer === undefined) ent.productionTimer = 0;

            if (!isPopFull) {
                ent.productionTimer -= deltaTime;
                this.state.hasHitPopLimit = false;
            } else if (ent.productionTimer <= 0.1) {
                ent.productionTimer = 0;
                if (!this.state.hasHitPopLimit) {
                    this.triggerWarning("2");
                    this.state.hasHitPopLimit = true;
                }
            } else {
                ent.productionTimer -= deltaTime;
            }

            if (ent.productionTimer <= 0 && !isPopFull) {
                const configName = ent.queue.shift();
                const success = GameEngine.spawnNPC(configName, ent);
                // 更新 HUD 進度條與數字
                ent.productionTimer = ent.queue.length > 0 ? 5 : 0;
            }
        });

        this.state.units.villagers.forEach(v => {
            // 閒置村民隨時檢查是否有工作可做，大幅提升反應速度
            if (v.state === 'IDLE') {
                this.assignNextTask(v);
                v.workOffset = null; // 閒置時重置工作偏移
            }
            this.updateVillagerMovement(v, deltaTime);
        });

        // 每秒執行一次工人分配邏輯
        this.state.assignmentTimer += deltaTime;
        if (this.state.assignmentTimer >= 1.0) {
            this.updateWorkerAssignments();
            this.updateSpatialGrid(); // 週期性全量刷新空間格網 (保險起見)
            this.state.assignmentTimer = 0;
        }
    }

    static updateSpatialGrid() {
        const grid = this.state.spatialGrid;
        grid.cells.clear();
        this.state.mapEntities.forEach(ent => {
            const gx = Math.floor(ent.x / grid.cellSize);
            const gy = Math.floor(ent.y / grid.cellSize);
            const key = `${gx},${gy}`;
            // 使用 Set 存儲以確保唯一性，或者 Array 也可以
            if (!grid.cells.has(key)) grid.cells.set(key, []);
            grid.cells.get(key).push(ent);
        });
    }

    /**
     * 根據縮放後的視窗範圍快速獲取可見實體 (空間格網裁切優化)
     */
    static getVisibleEntities(viewX, viewY, viewW, viewH, padding = 100) {
        const grid = this.state.spatialGrid;
        if (!grid || !grid.cells) return this.state.mapEntities;

        const cellSize = grid.cellSize;
        const startGX = Math.floor((viewX - padding) / cellSize);
        const endGX = Math.floor((viewX + viewW + padding) / cellSize);
        const startGY = Math.floor((viewY - padding) / cellSize);
        const endGY = Math.floor((viewY + viewH + padding) / cellSize);

        const visible = [];
        for (let gx = startGX; gx <= endGX; gx++) {
            for (let gy = startGY; gy <= endGY; gy++) {
                const cell = grid.cells.get(`${gx},${gy}`);
                if (cell) {
                    for (const ent of cell) visible.push(ent);
                }
            }
        }
        return visible;
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

    static async loadNPCConfig() {
        try {
            const text = await this.fetchCSVText('/config/npc_data.csv');
            const data = this.parseCSV(text);
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const idxId = headers.indexOf('id'),
                idxName = headers.indexOf('name'),
                idxModel = headers.indexOf('model'),
                idxFightingSpeed = headers.indexOf('fighting_speed'),
                idxIdleSpeed = headers.indexOf('idle_speed'),
                idxColSpeed = headers.indexOf('collection_speed'),
                idxColAmt = headers.indexOf('collection_resource'),
                idxNeed = headers.indexOf('need_resource'),
                idxLv = headers.indexOf('lv'),
                idxHp = headers.indexOf('hp'),
                idxAtk = headers.indexOf('attack'),
                idxAtkSpeed = headers.indexOf('attack_speed'),
                idxRange = headers.indexOf('range'),
                idxType = headers.indexOf('type'),
                idxCamp = headers.indexOf('camp'),
                idxPop = headers.indexOf('population'),
                idxPatrol = headers.indexOf('patrol_range'),
                idxVision = headers.indexOf('field_vision');

            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxName]) continue;
                const name = row[idxName].trim();
                const id = row[idxId] ? row[idxId].trim() : null;

                if (id) this.state.idToNameMap[id] = name;

                this.state.npcConfigs[name] = {
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
                    collection_resource: parseFloat(row[idxColAmt]) || 5,
                    need_resource: row[idxNeed],
                    lv: parseInt(row[idxLv]) || 1,
                    hp: parseInt(row[idxHp]) || 100,
                    attack: parseInt(row[idxAtk]) || 10,
                    attackSpeed: parseFloat(row[idxAtkSpeed]) || 1,
                    range: parseInt(row[idxRange]) || 10,
                    patrol_range: parseFloat(row[idxPatrol]) || 0,
                    field_vision: parseFloat(row[idxVision]) || 15
                };
            }
        } catch (e) { }
    }

    static async loadSystemConfig() {
        try {
            const text = await this.fetchCSVText('/config/system_config.csv');
            const data = this.parseCSV(text);
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const idxType = headers.indexOf('type'), idxValue = headers.indexOf('value');
            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxType]) continue;
                const type = row[idxType].trim();
                const val = row[idxValue].trim();

                if (type === 'default_resource') {
                    // 解析 "{food=100,wood=200,stone=100}"
                    const clean = val.replace(/[\{\}]/g, '');
                    const pairs = clean.split(',');
                    // 先歸零所有資源
                    for (let r in this.state.resources) this.state.resources[r] = 0;
                    pairs.forEach(p => {
                        const [rk, rv] = p.split('=');
                        if (rk && rv) this.state.resources[rk.trim()] = parseInt(rv.trim());
                    });
                } else if (val.includes('*')) {
                    const clean = val.replace(/[\{\}]/g, '');
                    const parts = clean.split('*').map(s => parseInt(s.trim()));
                    if (parts.length === 2) {
                        this.state.systemConfig[type] = { w: parts[0], h: parts[1] };
                    } else {
                        this.state.systemConfig[type] = parts[0] || 0;
                    }
                } else if (val.startsWith('{') && val.includes(',')) {
                    // 解析 "{6,500,30}" 為 [6, 500, 30]
                    const clean = val.replace(/[\{\}]/g, '');
                    const parts = clean.split(',').map(s => parseFloat(s.trim()));
                    this.state.systemConfig[type] = parts;
                } else {
                    const num = parseFloat(val);
                    this.state.systemConfig[type] = isNaN(num) ? val : num;
                }
            }
        } catch (e) { }
    }

    static RESOURCE_NAMES = {
        gold: "黃金", wood: "木材", stone: "石頭", food: "食物",
        healthpotion: "生命藥水", soul: "靈魂碎片", mana: "法力"
    };

    static async loadStringsConfig() {
        try {
            const text = await this.fetchCSVText('config/strings.csv');
            const data = this.parseCSV(text);
            if (data) {
                const { rows, headerIdx, headers } = data;
                const idxId = headers.indexOf('id'), idxMsg = headers.indexOf('message');
                for (let i = headerIdx + 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row[idxId]) this.state.strings[row[idxId].trim()] = row[idxMsg];
                }
            }
            console.log("多語系字串加載成功:", Object.keys(this.state.strings).length);
        } catch (e) { console.error("加載 strings.csv 失敗:", e); }
    }

    static getMessage(id, params = []) {
        let msg = this.state.strings[id];
        if (!msg) return "沒有strings訊息資料";
        params.forEach((p, i) => { msg = msg.replace(`{${i}}`, p); });
        return msg;
    }

    static triggerWarning(id, params = []) {
        // 將參數中的資源關鍵字轉譯為中文
        const translatedParams = params.map(p => {
            const key = String(p).toLowerCase();
            return this.RESOURCE_NAMES[key] || p;
        });
        const msg = this.getMessage(id, translatedParams);
        this.addLog(msg);
        if (window.UIManager) window.UIManager.showWarning(msg);
    }

    static async loadResourceConfig() {
        try {
            const text = await this.fetchCSVText('/config/resources_data.csv');
            const data = this.parseCSV(text);
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const idxName = headers.indexOf('name'), idxModel = headers.indexOf('model'), idxType = headers.indexOf('type');
            const idxYield = headers.indexOf('collection_speed'), idxDensity = headers.indexOf('density');
            const idxLv = headers.indexOf('lv'), idxSize = headers.indexOf('size'), idxModelSize = headers.indexOf('model_size');

            this.state.resourceConfigs = [];
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

                this.state.resourceConfigs.push({
                    name: row[idxName].trim(), model: row[idxModel].trim(), type: row[idxType].trim().toUpperCase(),
                    amount: parseInt(row[idxYield]) || 100, density: parseInt(row[idxDensity]) || 5,
                    lv: parseInt(row[idxLv]) || 1, size: (idxSize !== -1 && row[idxSize]) ? row[idxSize].trim() : '{1,1}',
                    model_size: parsedModelSize
                });
            }
        } catch (e) { }
    }

    static getEntityConfig(type) {
        if (!type) return null;
        if (this.state.buildingConfigs && this.state.buildingConfigs[type]) {
            return this.state.buildingConfigs[type];
        }
        if (this.state.resourceConfigs) {
            const resCfg = this.state.resourceConfigs.find(r => r.model === type);
            if (resCfg) return resCfg;
        }
        return null;
    }

    static async loadBuildingConfig() {
        try {
            const text = await this.fetchCSVText('/config/buildings.csv');
            const data = this.parseCSV(text);
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const idxModel = headers.indexOf('model'),
                idxCol = headers.indexOf('collision'),
                idxSize = headers.indexOf('size'),
                idxPop = headers.indexOf('population'),
                idxNeed = headers.indexOf('need_resource'),
                idxName = headers.find(h => h === 'name' || h === '名稱'),
                idxDesc = headers.find(h => h === 'desc' || h === '描述'), // 建築描述
                idxMax = headers.indexOf('max_count'),
                idxTime = headers.indexOf('building_times'),
                idxProd = headers.indexOf('npc_production'), // ID 列表，如 "{1,2}"
                idxProdType = headers.lastIndexOf('npc_production'); // 生產模式，如 "rand"

            // 轉換為 index
            const hIdx = (h) => headers.indexOf(h);
            const nameIdx = headers.indexOf(idxName);
            const descIdx = headers.indexOf(idxDesc);

            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxModel]) continue;

                // 解析生產清單
                let prodList = [];
                if (row[idxProd]) {
                    const clean = row[idxProd].replace(/[\{\}]/g, '');
                    if (clean) prodList = clean.split(',').map(s => s.trim());
                }

                this.state.buildingConfigs[row[idxModel].trim()] = {
                    name: (nameIdx !== -1 && row[nameIdx]) ? row[nameIdx].trim() : row[idxModel].trim(),
                    desc: (descIdx !== -1 && row[descIdx]) ? row[descIdx].trim() : "",
                    model: row[idxModel].trim(),
                    collision: row[idxCol] === '1',
                    size: row[idxSize] || "{1,1}",
                    population: parseInt(row[idxPop]) || 0,
                    costs: this.parseResourceObject(row[idxNeed]),
                    maxCount: parseInt(row[idxMax]) || 999,
                    buildTime: parseFloat(row[idxTime]) || 5,
                    resourceValue: parseInt(row[headers.indexOf('resource_value')]) || 0,
                    npcProduction: prodList,
                    productionMode: row[idxProdType] || 'normal'
                };
            }
            this.addLog("建築配置表加載成功。");
        } catch (e) { console.error(e); }
    }

    static parseResourceObject(str) {
        const costs = { food: 0, wood: 0, stone: 0, gold: 0 };
        if (!str) return costs;
        const matches = str.matchAll(/(\w+)=(\d+)/g);
        for (const match of matches) {
            const key = match[1].toLowerCase();
            if (costs.hasOwnProperty(key)) costs[key] = parseInt(match[2]);
        }
        return costs;
    }

    static setFallbackConfig() {
        this.state.npcConfigs['villagers'] = { speed: 5.5, collection_speed: 10 };
        this.state.npcConfigs['female villagers'] = { speed: 5.5, collection_speed: 10 };
    }

    static spawnNPC(targetIdOrName, building = null, options = null) {
        // 1. 解析最終配置名稱 (考慮隨機生產)
        let finalConfigName = targetIdOrName;
        if (this.state.idToNameMap[targetIdOrName]) {
            finalConfigName = this.state.idToNameMap[targetIdOrName];
        } else if (building) {
            const bCfg = this.state.buildingConfigs[building.type];
            if (bCfg && bCfg.productionMode === 'rand' && bCfg.npcProduction.length > 0) {
                const randId = bCfg.npcProduction[Math.floor(Math.random() * bCfg.npcProduction.length)];
                finalConfigName = this.state.idToNameMap[randId] || finalConfigName;
            }
        }

        const config = this.state.npcConfigs[finalConfigName] || { speed: 5.5, collection_speed: 10, camp: 'player', population: 1 };

        // 2. 人口上限檢查 (僅限制我方陣營)
        const currentPop = this.getCurrentPopulation();
        const maxPop = this.getMaxPopulation();
        const unitPop = config.population || 1;

        if (config.camp === 'player' && (currentPop + unitPop) > maxPop && this.isStarted) {
            this.addLog(`人口上限已達 (${currentPop}/${maxPop})，不可再生產！`);
            return false;
        }

        // 3. 實例化單位
        let spawnX = building ? building.x : 960 + 120;
        let spawnY = building ? building.y : 560 + 120;

        if (building) {
            // 計算環繞位置：從左下開始，逆時針排列
            const fp = GameEngine.getFootprint(building.type);
            const uw = fp.uw;
            const uh = fp.uh;
            const TS = this.TILE_SIZE;

            if (building.spawnIdx === undefined) building.spawnIdx = 0;
            const idx = building.spawnIdx;
            building.spawnIdx++;

            // 周長 (包含四個角落)
            const perimeter = 2 * (uw + uh) + 4;
            const currentIdx = idx % perimeter;
            const layer = Math.floor(idx / perimeter);
            const R = 1 + layer; // 距離邊緣的層數 (格)

            let tx, ty;
            // 順序：下邊(左->右)、右邊(下->上)、上邊(右->左)、左邊(上->下)
            if (currentIdx <= uw + 1) {
                // 下邊 (包含左右角落)
                let k = currentIdx;
                tx = k - (uw + 1) / 2;
                ty = (uh + 2 * R - 1) / 2;
            } else if (currentIdx <= (uw + 1) + (uh + 1)) {
                // 右邊 (包含右上角落，不包含右下角落以免重疊)
                let k = currentIdx - (uw + 1);
                tx = (uw + 2 * R - 1) / 2;
                ty = (uh + 1) / 2 - k;
            } else if (currentIdx <= (uw + 1) + (uh + 1) + (uw + 1)) {
                // 上邊 (包含左上角落)
                let k = currentIdx - (uw + 1 + uh + 1);
                tx = (uw + 1) / 2 - k;
                ty = -(uh + 2 * R - 1) / 2;
            } else {
                // 左邊 (剩餘部分)
                let k = currentIdx - (uw + 1 + uh + 1 + uw + 1);
                tx = -(uw + 2 * R - 1) / 2;
                ty = -(uh + 1) / 2 + k;
            }
            spawnX = building.x + tx * TS;
            spawnY = building.y + ty * TS;
        }

        if (options && options.x !== undefined) spawnX = options.x;
        if (options && options.y !== undefined) spawnY = options.y;

        const v = {
            id: 'unit_' + Math.random().toString(36).substr(2, 9),
            x: spawnX, y: spawnY,
            spawnX: spawnX, spawnY: spawnY, // 記錄初始位置用於巡邏
            state: 'IDLE', targetId: null, cargo: 0,
            type: config.type === 'villagers' ? 'WOOD' : 'GUARD',
            config: config,
            configName: finalConfigName,
            gatherTimer: 0,
            idleTarget: null,
            waitTimer: 0,
            pathTarget: null,
            hp: config.hp || 100,
            maxHp: config.hp || 100,
            attack: config.attack || 10,
            moveSpeed: config.combatSpeed || config.speed || 5,
            attackSpeed: config.attackSpeed || 1,
            range: config.range || 10,
            field_vision: (config.field_vision !== undefined) ? config.field_vision : 15,
            facing: 1 // 1: 右, -1: 左
        };

        this.state.units.villagers.push(v);
        if (v.config.type === 'villagers') this.assignNextTask(v);

        if (v.state === 'IDLE' && building && building.rallyPoint) {
            // 為集結點計算偏移量，讓單位以 5xN 的方塊形式排列，相隔 1 格 (20px)
            const idx = building.spawnIdx - 1; // 剛才已經 ++ 過了
            const spacing = 20;
            const gridW = 5;
            const offsetX = (idx % gridW - Math.floor(gridW / 2)) * spacing;
            const offsetY = (Math.floor(idx / gridW)) * spacing;

            v.idleTarget = {
                x: building.rallyPoint.x + offsetX,
                y: building.rallyPoint.y + offsetY
            };
        }
        return true;
    }

    static getFootprint(type) {
        const cfg = this.getEntityConfig(type);
        let uw = 1, uh = 1;
        if (cfg && cfg.size) {
            const em = cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
            if (em) { uw = parseInt(em[1]); uh = parseInt(em[2]); }
        }
        return { uw, uh };
    }

    static getMaxPopulation() {
        let total = 0;
        this.state.mapEntities.forEach(ent => {
            if (ent.isUnderConstruction) return;
            const cfg = this.state.buildingConfigs[ent.type];
            if (cfg && cfg.population) total += cfg.population;
        });
        return total || 5;
    }

    /**
     * 計算當前我方陣營總佔用人口 (排除敵方與中立單位)
     */
    static getCurrentPopulation() {
        return (this.state.units.villagers || [])
            .filter(v => v.config && v.config.camp === 'player')
            .reduce((sum, v) => sum + (v.config.population || 1), 0);
    }

    static generateMap() {
        const startT = performance.now();
        this.state.mapEntities = [];

        // 讀取外部參數 (單位皆為像素)
        const mapCfg = this.state.systemConfig.map_size || { w: 3200, h: 2000 };
        const safeCfg = this.state.systemConfig.no_resources_range || { w: 240, h: 240 };

        // 定義地圖格網 (Tiles)
        const TS = this.TILE_SIZE;
        const cols = Math.floor(mapCfg.w / TS);
        const rows = Math.floor(mapCfg.h / TS);

        // 將村莊中心 (960, 560) 近似地圖中央
        const minGX = Math.floor(960 / TS) - Math.floor(cols / 2);
        const minGY = Math.floor(560 / TS) - Math.floor(rows / 2);
        this.state.mapOffset = { x: minGX, y: minGY };

        const occupied = new Uint8Array(cols * rows); // 使用 TypedArray 替代 Set，效能大幅提升

        const getIdx = (gx, gy) => {
            const lx = gx - minGX;
            const ly = gy - minGY;
            if (lx < 0 || lx >= cols || ly < 0 || ly >= rows) return -1;
            return lx + ly * cols;
        };

        const getFootprint = (type) => GameEngine.getFootprint(type);

        const markOccupiedG = (gx, gy, uw, uh) => {
            for (let i = 0; i < uw; i++) {
                for (let j = 0; j < uh; j++) {
                    const idx = getIdx(gx + i, gy + j);
                    if (idx !== -1) occupied[idx] = 1;
                }
            }
        };

        const checkOccupiedG = (gx, gy, uw, uh) => {
            for (let i = 0; i < uw; i++) {
                for (let j = 0; j < uh; j++) {
                    const idx = getIdx(gx + i, gy + j);
                    if (idx === -1 || occupied[idx] === 1) return true;
                }
            }
            return false;
        };

        // 1. 放置核心建築
        const villagePos = { x: 960, y: 560 };
        const villageFP = getFootprint('village');
        const villageCfg = this.state.buildingConfigs['village'] || {};
        this.state.mapEntities.push({
            id: 'core_village',
            type: 'village', x: villagePos.x, y: villagePos.y, name: villageCfg.name || "城鎮中心", queue: [], productionTimer: 0
        });
        const vgx = Math.round((villagePos.x - (villageFP.uw * TS) / 2) / TS);
        const vgy = Math.round((villagePos.y - (villageFP.uh * TS) / 2) / TS);
        markOccupiedG(vgx, vgy, villageFP.uw, villageFP.uh);

        const campfirePos = { x: 1100, y: 640 };
        const campfireFP = getFootprint('campfire');
        this.state.mapEntities.push({
            id: 'core_campfire',
            type: 'campfire', x: campfirePos.x, y: campfirePos.y, name: "小火堆"
        });
        const cgx = Math.round((campfirePos.x - (campfireFP.uw * TS) / 2) / TS);
        const cgy = Math.round((campfirePos.y - (campfireFP.uh * TS) / 2) / TS);
        markOccupiedG(cgx, cgy, campfireFP.uw, campfireFP.uh);

        // 2. 初始化可用位點池 (母空間)
        const pool = [];
        for (let gx = minGX; gx < minGX + cols; gx++) {
            for (let gy = minGY; gy < minGY + rows; gy++) {
                pool.push({ gx, gy });
            }
        }

        // 3. 隨機洗牌位點池 (Fisher-Yates Shuffle)
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = pool[i];
            pool[i] = pool[j];
            pool[j] = temp;
        }

        // 4. 依序放置各類資源
        if (this.state.resourceConfigs.length > 0) {
            this.state.resourceConfigs.forEach(cfg => {
                let count = 0;
                const fp = getFootprint(cfg.model);
                const resCfg = UI_CONFIG.ResourceRenderer;

                for (let i = 0; i < pool.length && count < cfg.density; i++) {
                    const { gx, gy } = pool[i];
                    if (checkOccupiedG(gx, gy, fp.uw, fp.uh)) continue;

                    const w = fp.uw * TS, h = fp.uh * TS;
                    const x = gx * TS + w / 2;
                    const y = gy * TS + h / 2;

                    // 安全區檢查 (根據 no_resources_range 參數)
                    if (Math.abs(x - villagePos.x) < safeCfg.w / 2 && Math.abs(y - villagePos.y) < safeCfg.h / 2) continue;

                    // 隨機視覺差異 (變形與變色)
                    let vScaleX = 1, vScaleY = 1, vTint = 0xffffff;
                    let varCfg = null;
                    if (cfg.model.startsWith('tree') || cfg.model.startsWith('wood')) varCfg = resCfg.Tree.visualVariation;
                    else if (cfg.model.startsWith('stone')) varCfg = resCfg.Rock.visualVariation;
                    else if (cfg.model.startsWith('food')) varCfg = resCfg.BerryBush.visualVariation;

                    if (varCfg) {
                        vScaleX = varCfg.minScale + Math.random() * (varCfg.maxScale - varCfg.minScale);
                        vScaleY = varCfg.minScale + Math.random() * (varCfg.maxScale - varCfg.minScale);
                        const brightness = 1.0 - (Math.random() * varCfg.tintRange);
                        const c = Math.floor(255 * brightness);
                        vTint = (c << 16) | (c << 8) | c;
                    }

                    this.state.mapEntities.push({
                        id: `res_${cfg.type}_${this.state.mapEntities.length}`, // 分配固定唯一 ID
                        type: cfg.model, resourceType: cfg.type, x, y,
                        amount: cfg.amount, level: cfg.lv, name: cfg.name,
                        vScaleX, vScaleY, vTint
                    });

                    markOccupiedG(gx, gy, fp.uw, fp.uh);
                    count++;
                }
                console.log(`地圖生成 - ${cfg.name} 成功放置: ${count}/${cfg.density}`);
            });
        }

        // 5. 隨機生成野外敵人 (enemy1, enemy2) - 使用高效的網格採樣演算法
        ['enemy1', 'enemy2'].forEach(enemyKey => {
            const configTriplet = this.state.systemConfig[enemyKey];
            if (Array.isArray(configTriplet) && configTriplet.length === 3) {
                const [npcID, density, minInterval] = configTriplet;
                const name = this.state.idToNameMap[npcID];
                if (!name) return;

                let count = 0;
                let i = 0;
                // 使用臨時格網記錄同 ID 敵人的間距佔位，避免 N^2 座標比對
                const proximityGrid = new Uint8Array(cols * rows);

                for (i = 0; i < pool.length && count < density; i++) {
                    const { gx, gy } = pool[i];

                    // 1. 基本佔用檢查 (建築/資源)
                    if (checkOccupiedG(gx, gy, 1, 1)) continue;

                    // 2. 同 ID 敵人間距檢查 (查閱 proximityGrid)
                    if (proximityGrid[gy * cols + gx] === 1) continue;

                    const x = gx * TS + TS / 2;
                    const y = gy * TS + TS / 2;

                    // 3. 安全區檢查 (避免離出生點太近)
                    if (Math.abs(x - villagePos.x) < safeCfg.w / 2 && Math.abs(y - villagePos.y) < safeCfg.h / 2) continue;

                    // 正式產出
                    this.spawnNPC(npcID, null, { x, y });

                    // 標記間距範圍 (以當前點為中心，半徑為 minInterval 的區域)
                    const r = Math.ceil(minInterval);
                    if (r > 0) {
                        const r2 = r * r;
                        for (let dy = -r; dy <= r; dy++) {
                            const ny = gy + dy;
                            if (ny < 0 || ny >= rows) continue;
                            for (let dx = -r; dx <= r; dx++) {
                                const nx = gx + dx;
                                if (nx >= 0 && nx < cols && (dx * dx + dy * dy <= r2)) {
                                    proximityGrid[ny * cols + nx] = 1;
                                }
                            }
                        }
                    }
                    count++;
                }
                console.log(`地圖生成 - 敵人 ${name} 成功放置: ${count}/${density} (總嘗試: ${i})`);
            }
        });
        this.updatePathfindingGrid();
        this.updateSpatialGrid();
        console.log(`地圖生成完成 [W:${mapCfg.w} H:${mapCfg.h}]，耗時: ${(performance.now() - startT).toFixed(2)}ms`);
    }

    /**
     * 更新尋路用的格網數據 (將 mapEntities 轉換為 2D 陣列)
     */
    static updatePathfindingGrid() {
        if (!this.state.pathfinding) return;

        const mapCfg = this.state.systemConfig.map_size || { w: 3200, h: 2000 };
        const TS = this.TILE_SIZE;
        const cols = Math.ceil(mapCfg.w / TS);
        const rows = Math.ceil(mapCfg.h / TS);

        // 初始化全 0 (可通行)
        const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

        this.state.mapEntities.forEach(ent => {
            if (ent.isUnderConstruction) return;
            const cfg = this.getEntityConfig(ent.type);
            if (cfg && cfg.collision) {
                const em = cfg.size ? cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/) : null;
                const uw = em ? parseInt(em[1]) : 1, uh = em ? parseInt(em[2]) : 1;

                // 計算左上角座標
                // 正確計算：封鎖建築物理邊界所碰觸到的「所有」格位
                // 核心優化：從 UI_CONFIG 讀取緩衝值，避免單位中心點停在邊緣時視覺重疊
                const collCfg = UI_CONFIG.BuildingCollision || { buffer: 20, feetOffset: 18 };
                const bWidth = uw * TS + collCfg.buffer, bHeight = uh * TS + collCfg.buffer;
                const minX = ent.x - bWidth / 2, minY = ent.y - bHeight / 2;
                const maxX = ent.x + bWidth / 2, maxY = ent.y + bHeight / 2;

                const offset = this.state.mapOffset || { x: 0, y: 0 };
                // 使用 floor/ceil 獲取邊界網格索引
                // 核心修復：為了讓單位看起來是靠「腳部」碰撞，將建築阻礙格網向上偏移
                const FOOT_OFFSET = collCfg.feetOffset;
                const gx1 = Math.floor(minX / TS) - offset.x;
                const gy1 = Math.floor((minY - FOOT_OFFSET) / TS) - offset.y;
                const gx2 = Math.floor((maxX - 0.1) / TS) - offset.x;
                const gy2 = Math.floor((maxY - FOOT_OFFSET - 0.1) / TS) - offset.y;

                for (let tx = gx1; tx <= gx2; tx++) {
                    for (let ty = gy1; ty <= gy2; ty++) {
                        if (ty >= 0 && ty < rows && tx >= 0 && tx < cols) matrix[ty][tx] = 1;
                    }
                }
            }
        });

        this.state.pathfinding.setGrid(matrix);

        // 核心要求：網格更新後，所有正在移動中的單位必須重新計算路徑，以避開剛生成的建築
        this.state.units.villagers.forEach(v => {
            v.fullPath = null;
            v.pathIndex = 0;
            v._lastTargetPos = null; // 強制重置追蹤位置
        });
    }


    // 已刪除原有的 findSafePos (防卡死系統相關代碼)


    static productionTick() {
        if (this.state.buildings.alchemy_lab > 0 && this.state.resources.wood >= 5) {
            this.state.resources.wood -= 5;
            this.state.resources.healthPotion += 5;
        }
    }

    static updateVillagerMovement(v, dt) {
        // 核心邏輯：只有 npc_data 中類型為 'villagers' 的才具備採集與建設能力，非村民僅處理 IDLE 巡邏或集結點移動
        if (v.config.type !== 'villagers') {
            const oldX = v.x, oldY = v.y;
            // 決定移動速度：只有敵人閒逛時使用 idle_speed，其餘情況（如追擊、執行指令）均使用 fighting_speed
            const isEnemyWandering = (v.config.camp === 'enemy' && v.idleTarget);
            const moveBaseSpeed = isEnemyWandering ? (v.config.idle_speed || 2.5) : (v.config.fighting_speed || 5.5);
            const moveSpeed = moveBaseSpeed * 13;
            if (v.idleTarget) {
                v.state = 'MOVING';
                this.moveDetailed(v, v.idleTarget.x, v.idleTarget.y, moveSpeed, dt);
                if (Math.hypot(v.x - v.idleTarget.x, v.y - v.idleTarget.y) < 5) {
                    v.idleTarget = null;
                    v.state = 'IDLE';

                    // 解析巡邏間隔配置 {min,max}，例如 {5,10}
                    let minWait = 3, maxWait = 6;
                    const cfg = this.state.systemConfig.enemy_patrol_time;
                    if (cfg && typeof cfg === 'string') {
                        const match = cfg.match(/\{[ ]*([\d.]+)[ ]*,[ ]*([\d.]+)[ ]*\}/);
                        if (match) {
                            minWait = parseFloat(match[1]);
                            maxWait = parseFloat(match[2]);
                        }
                    } else if (typeof cfg === 'number') {
                        minWait = cfg; maxWait = cfg * 1.5;
                    }

                    v.waitTimer = minWait + Math.random() * (maxWait - minWait);
                }
            } else if (v.state === 'IDLE' && v.config.patrol_range > 0) {
                // 動物或敵人的巡邏邏輯
                if (v.waitTimer > 0) {
                    v.waitTimer -= dt;
                } else {
                    const pr = v.config.patrol_range * this.TILE_SIZE;
                    const angle = Math.random() * Math.PI * 2;
                    const dist = Math.random() * pr;
                    v.idleTarget = {
                        x: (v.spawnX || v.x) + Math.cos(angle) * dist,
                        y: (v.spawnY || v.y) + Math.sin(angle) * dist
                    };
                }
            } else if (v.state === 'MOVING') {
                v.state = 'IDLE';
            }
            // 基礎碰撞處理
            const colliding = this.isColliding(v.x, v.y);
            if (colliding) {
                if (this.isColliding(oldX, oldY) !== colliding) { v.x = oldX; v.y = oldY; }
                else { this.resolveStuck(v); }
            }
            return;
        }

        // 優先前往分派的倉庫，否則前往最近存放點
        if (v.assignedWarehouseId) {
            const w = this.state.mapEntities.find(e => (e.id || `${e.type}_${e.x}_${e.y}`) === v.assignedWarehouseId);
            if (w && !w.isUnderConstruction) { v.targetBase = w; }
            else { v.assignedWarehouseId = null; v.targetBase = this.findNearestDepositPoint(v.x, v.y, v.type) || { x: 960, y: 560 }; }
        } else {
            v.targetBase = this.findNearestDepositPoint(v.x, v.y, v.type) || { x: 960, y: 560 };
        }
        const oldX = v.x, oldY = v.y;

        // 安全機制：如果正在執行特定任務（非閒置），則清除閒逛目標，避免動畫頻率錯誤 (Point 2)
        if (v.state !== 'IDLE' && v.idleTarget) {
            v.idleTarget = null;
        }

        // 決定移動速度：只有敵人閒逛時使用 idle_speed，其餘所有單位與狀態（包含我方工人、戰鬥單位）均使用 fighting_speed
        const isEnemyWandering = (v.config.camp === 'enemy' && v.state === 'IDLE');
        const configSpeed = isEnemyWandering ? (v.config.idle_speed || 2.5) : (v.config.fighting_speed || 5.5);
        const moveSpeed = configSpeed * 13;

        // [TEST] 紀錄狀態變遷 (僅限選中單位)
        const isSelected = GameEngine.state.selectedUnitIds && GameEngine.state.selectedUnitIds.includes(v.id);
        if (isSelected && v._lastRecordedState !== v.state) {
            const msg = `[狀態轉進] ${v.configName}: ${v._lastRecordedState || 'IDLE'} -> ${v.state} (${v.x.toFixed(0)}, ${v.y.toFixed(0)})`;
            console.log(`%c${msg}`, "color: #4fc3f7; font-weight: bold;");
            GameEngine.addLog(msg, 'STATE');
            v._lastRecordedState = v.state;
        }

        switch (v.state) {
            case 'IDLE':
                // 取消工人閒逛設定：若已有目標 (如集結點) 則移動，到達後不再隨機找下一個點
                if (v.idleTarget) {
                    this.moveDetailed(v, v.idleTarget.x, v.idleTarget.y, moveSpeed, dt);
                    if (Math.hypot(v.x - v.idleTarget.x, v.y - v.idleTarget.y) < 5) {
                        v.idleTarget = null;
                        v.isManualCommand = false; // 手動到達預定地後才解除鎖定
                        v.waitTimer = 1 + Math.random() * 2;
                        v.pathTarget = null;
                    }
                }
                break;
            case 'MOVING_TO_RESOURCE':
                let searchX = v.x, searchY = v.y;
                if (v.assignedWarehouseId) {
                    const w = this.state.mapEntities.find(e => (e.id || `${e.type}_${e.x}_${e.y}`) === v.assignedWarehouseId);
                    if (w) { searchX = w.x; searchY = w.y; }
                }
                const target = this.findNearestResource(searchX, searchY, v.type, v.id);
                if (target) {
                    // 針對農田與樹木田，隨機化目標位置以使其待在田內部而非停在邊緣
                    if (!v.workOffset) v.workOffset = { x: 0, y: 0 };
                    if ((target.type === 'farmland' || target.type === 'tree_plantation') && v.workOffset.x === 0) {
                        v.workOffset = {
                            x: (Math.random() - 0.5) * 50,
                            y: (Math.random() - 0.5) * 50
                        };
                    }

                    const tx = target.x + (v.workOffset.x || 0);
                    const ty = target.y + (v.workOffset.y || 0);
                    const dist = Math.hypot(tx - v.x, ty - v.y);

                    if (dist < 15) {
                        v.state = 'GATHERING'; v.targetId = target; v.gatherTimer = 0; v.pathTarget = null;
                    }
                    else { this.moveDetailed(v, tx, ty, moveSpeed, dt); }
                } else { v.state = 'IDLE'; v.pathTarget = null; v.workOffset = null; }
                break;
            case 'GATHERING':
                v.gatherTimer += dt;
                const harvestTime = v.config.collection_speed || 2; // 採集時間 (秒)

                // 核心安全檢查：若採集目標已失蹤，直接中止
                // 如果是特殊任務且無目標，則視為任務完成或失效
                if (!v.targetId) {
                    if (v.gatherTimer > 1.0) { // 給予 1 秒寬限期
                        this.addLog(`[調試] 單位 ${v.configName} 採集目標遺失，強制歸位。`, 'COMMON');
                        v.state = 'IDLE';
                        v.pathTarget = null;
                        v.targetId = null;
                        v.forcedTarget = false;
                    }
                    break;
                }

                if (v.gatherTimer >= harvestTime) {
                    const harvestTotal = v.config.collection_amount || 20; // 每次採集的數量
                    if (v.targetId) {
                        const canTake = Math.min(harvestTotal, v.targetId.amount);
                        v.targetId.amount -= canTake;

                        // 如果是農田或樹木田，直接入庫，不增加負重，不回村中心
                        if (v.targetId.type === 'farmland' || v.targetId.type === 'tree_plantation') {
                            if (v.targetId.type === 'farmland') this.state.resources.food += canTake;
                            else if (v.targetId.type === 'tree_plantation') this.state.resources.wood += canTake;

                            v.cargo = 0;
                            v.gatherTimer = 0; // 重置計時器，原地繼續採集
                            if (v.targetId.amount <= 0) {
                                this.addLog(`${v.targetId.name || '農田'} 已枯竭。`);
                                this.state.mapEntities = this.state.mapEntities.filter(e => e !== v.targetId);
                                v.targetId = null;
                                v.state = 'IDLE';
                                v.pathTarget = null;
                                v.forcedTarget = false;
                            }
                        } else {
                            // 一般資源點，照常運送
                            v.cargo = canTake;
                            if (v.targetId.amount <= 0) {
                                this.state.mapEntities = this.state.mapEntities.filter(e => e !== v.targetId);
                                v.targetId = null;
                                v.forcedTarget = false;
                            }
                            v.state = 'MOVING_TO_BASE';
                            v.pathTarget = null;
                        }
                    } else {
                        // 當採集時間到，目標卻失蹤（保險邏輯）
                        v.state = 'IDLE';
                        v.pathTarget = null;
                    }
                }
                break;
            case 'MOVING_TO_BASE':
                // 安全檢查：若基地已失蹤（如被拆除），尋找下一個最近基地或歸位
                if (!v.targetBase) {
                    const nearestTC = this.state.mapEntities.find(e => e.type === 'town_center' || e.type === 'village');
                    if (nearestTC) {
                        v.targetBase = nearestTC;
                        v.pathTarget = null; // 重尋路
                    } else {
                        v.state = 'IDLE'; v.pathTarget = null;
                    }
                    break;
                }

                const cfgB = this.state.buildingConfigs[v.targetBase.type];
                let depositDist = 60;
                if (cfgB && cfgB.size) {
                    const m = cfgB.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
                    if (m) {
                        const uw = parseInt(m[1]), uh = parseInt(m[2]);
                        depositDist = (Math.max(uw, uh) * this.TILE_SIZE / 2) + 20;
                    }
                }
                const distB = Math.hypot(v.targetBase.x - v.x, v.targetBase.y - v.y);
                if (distB < depositDist) { // 動態交互半徑，確保碰到建築邊緣即可觸發
                    this.depositResource(v.type, v.cargo);
                    v.cargo = 0; v.pathTarget = null;
                    if (v.nextStateAfterDeposit) {
                        v.state = v.nextStateAfterDeposit;
                        v.nextStateAfterDeposit = null;
                    } else if (v.isRecalled) {
                        v.state = 'IDLE'; v.isRecalled = false; v.idleTarget = null;
                    } else {
                        v.state = 'MOVING_TO_RESOURCE';
                    }
                } else {
                    this.moveDetailed(v, v.targetBase.x, v.targetBase.y, moveSpeed, dt);
                }
                break;
            case 'MOVING_TO_CONSTRUCTION':
                if (!v.constructionTarget || !this.state.mapEntities.includes(v.constructionTarget)) {
                    this.restoreVillagerTask(v);
                    return;
                }
                const cfgC = this.state.buildingConfigs[v.constructionTarget.type];
                let interactionDist = 60;
                if (cfgC && cfgC.size) {
                    const m = cfgC.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
                    if (m) {
                        const uw = parseInt(m[1]), uh = parseInt(m[2]);
                        interactionDist = (Math.max(uw, uh) * this.TILE_SIZE / 2) + 20;
                    }
                }
                const distC = Math.hypot(v.constructionTarget.x - v.x, v.constructionTarget.y - v.y);
                if (distC < interactionDist) {
                    v.state = 'CONSTRUCTING';
                    v.pathTarget = null;
                } else {
                    this.moveDetailed(v, v.constructionTarget.x, v.constructionTarget.y, moveSpeed, dt);
                }
                break;
            case 'CONSTRUCTING':
                if (!v.constructionTarget || !this.state.mapEntities.includes(v.constructionTarget)) {
                    this.restoreVillagerTask(v);
                    return;
                }
                v.constructionTarget.buildProgress += dt;
                if (v.constructionTarget.buildProgress >= v.constructionTarget.buildTime) {
                    const finishedBuilding = v.constructionTarget; // 鎖定當前完工建築引用
                    finishedBuilding.isUnderConstruction = false;
                    this.state.renderVersion++; // 通知渲染器刷新
                    const type = finishedBuilding.type;
                    finishedBuilding.name = this.state.buildingConfigs[type].name;

                    // 如果是農田或樹木田，初始化資源量並設為資源節點
                    if (type === 'farmland' || type === 'tree_plantation') {
                        finishedBuilding.resourceType = (type === 'farmland' ? 'FOOD' : 'WOOD');
                        finishedBuilding.amount = this.state.buildingConfigs[type].resourceValue || 500;
                    }

                    if (type === 'farmhouse') this.state.buildings.farmhouse++;
                    this.addLog(`建造完成：${this.state.buildingConfigs[type].name}。`);

                    // 核心要求：建築完工後必須立即更新尋路格網
                    GameEngine.updatePathfindingGrid();

                    // 自動脫困：使用已保存的 finishedBuilding 引用，確保正確推開所有被壓住的人
                    this.state.units.villagers.forEach(vi => {
                        const ignore = [vi.targetId, vi.targetBase].filter(Boolean);
                        if (GameEngine.isColliding(vi.x, vi.y, ignore) === finishedBuilding) {
                            // 觸發防卡死機制
                            GameEngine.resolveStuck(vi);
                        }
                    });
                    // 3. 建造完成後刷新尋路格網數據 (重要!)
                    this.updatePathfindingGrid();

                    // 自動指派後續工作
                    let nextConstruction = null;
                    let minCDist = Infinity;
                    this.state.mapEntities.forEach(e => {
                        if (e.isUnderConstruction && e !== finishedBuilding) {
                            const isClaimed = this.state.units.villagers.some(vi => vi !== v && vi.constructionTarget === e);
                            if (isClaimed) return;
                            const d = Math.hypot(e.x - v.x, e.y - v.y);
                            if (d < minCDist) { minCDist = d; nextConstruction = e; }
                        }
                    });

                    if (nextConstruction) {
                        v.state = 'MOVING_TO_CONSTRUCTION';
                        v.constructionTarget = nextConstruction;
                        v.pathTarget = null;
                        this.addLog(`工人前往建設下一個目標：${nextConstruction.name || nextConstruction.type}。`);
                    } else if (['timber_factory', 'stone_factory', 'barn', 'gold_mining_factory'].includes(type)) {
                        v.assignedWarehouseId = (finishedBuilding.id || `${finishedBuilding.type}_${finishedBuilding.x}_${finishedBuilding.y}`);
                        v.type = (type === 'timber_factory' ? 'WOOD' : (type === 'stone_factory' ? 'STONE' : (type === 'barn' ? 'FOOD' : 'GOLD')));
                        v.state = 'MOVING_TO_RESOURCE';
                        v.targetId = null; v.pathTarget = null; v.prevTask = null; v.constructionTarget = null;
                        this.addLog(`建造者已自動轉為 ${finishedBuilding.name} 的專職員工。`);
                    } else if (type === 'farmland' || type === 'tree_plantation') {
                        v.type = (type === 'farmland' ? 'FOOD' : 'WOOD');
                        v.state = 'MOVING_TO_RESOURCE'; v.targetId = finishedBuilding; v.gatherTimer = 0; v.pathTarget = null; v.prevTask = null; v.constructionTarget = null;
                        v.workOffset = { x: (Math.random() - 0.5) * 50, y: (Math.random() - 0.5) * 50 }; // 立即設定偏移量，確保進入內部
                        this.addLog(`建造者前往${type === 'farmland' ? '農田' : '樹木田'}內部開始工作。`);
                    } else {
                        this.restoreVillagerTask(v);
                        v.constructionTarget = null; // 恢復舊任務後清空工程目標
                    }
                }
                break;
        }

        // 核心碰撞防護：只有在採集或建造「進行中」時才可忽略目標，防止走路穿模進入建築物
        let ignoreEnts = [];
        if (v.state === 'GATHERING' && v.targetId) ignoreEnts.push(v.targetId);
        if (v.state === 'CONSTRUCTING' && v.constructionTarget) ignoreEnts.push(v.constructionTarget);

        const collidingEnt = this.isColliding(v.x, v.y, ignoreEnts);

        if (collidingEnt) {
            // 檢查舊位置是否也在此建築中
            const wasColliding = this.isColliding(oldX, oldY, ignoreEnts);
            if (wasColliding !== collidingEnt) {
                // 如果原本不在這個建築裡面（或是剛從別處撞進來），阻擋
                v.x = oldX; v.y = oldY; v.pathTarget = null;

                // [防卡死強化] 如果被物理碰撞反覆阻擋超過一定次數，視同卡死，強制脫困
                v._stuckFrames = (v._stuckFrames || 0) + 1;
                if (v._stuckFrames > 30) {
                    this.resolveStuck(v);
                    v._stuckFrames = 0;
                }
            } else {
                // 連動脫困邏輯：原就在建築內，可能因為剛蓋好建築被壓住，啟動 8 方向螺旋搜尋脫困
                this.resolveStuck(v);
                v._stuckFrames = 0;
            }
        } else {
            // 沒撞到，重設計數器
            if (Math.hypot(v.x - oldX, v.y - oldY) > 0.1) {
                v._stuckFrames = 0;
            } else if (v.state.startsWith('MOVING')) {
                // 有在動但坐標完全沒變 (可能是被其他邏輯擋到)
                v._stuckFrames = (v._stuckFrames || 0) + 1;
                if (v._stuckFrames > 60) {
                    this.resolveStuck(v);
                    v._stuckFrames = 0;
                }
            }
        }

        if (v.state === 'IDLE' && collidingEnt) v.idleTarget = null;

        // 附近基地即便撞牆也算存款 (加寬範圍至 150)
        if (v.state === 'MOVING_TO_BASE') {
            const cfgB = this.state.buildingConfigs[v.targetBase.type];
            let depositDist = 60;
            if (cfgB && cfgB.size) {
                const m = cfgB.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
                if (m) {
                    const uw = parseInt(m[1]), uh = parseInt(m[2]);
                    depositDist = (Math.max(uw, uh) * this.TILE_SIZE / 2) + 20;
                }
            }
            if (Math.hypot(v.x - v.targetBase.x, v.y - v.targetBase.y) < depositDist) {
                this.depositResource(v.type, v.cargo);
                v.cargo = 0;
                v.pathTarget = null;
                if (v.nextStateAfterDeposit) {
                    v.state = v.nextStateAfterDeposit;
                    v.nextStateAfterDeposit = null;
                } else if (v.isRecalled) {
                    v.state = 'IDLE';
                    v.isRecalled = false;
                    this.assignNextTask(v);
                } else {
                    // 預設想回去採集，但先經過優先級檢查 (優先幫忙建造)
                    v.state = 'MOVING_TO_RESOURCE';
                    this.assignNextTask(v);
                }
            }
        }
    }

    static restoreVillagerTask(v) {
        if (v.prevTask) {
            v.state = v.prevTask.state;
            v.targetId = v.prevTask.targetId;
            v.type = v.prevTask.type;
            v.prevTask = null;
        } else {
            this.assignNextTask(v);
        }
        v.pathTarget = null;
    }

    static assignNextTask(v) {
        // 核心邏輯：只有 npc_data 中類型為 'villagers' 的才具備採集工作能力
        // 手動指令優先：若處於手動命令期間，完全不主動接取新任務
        if (v.config.type !== 'villagers' || v.isRecalled || v.isManualCommand) {
            v.state = 'IDLE';
            return;
        }

        // 1. 優先找「視野內」的待施工建築 (過濾掉已有人在蓋的工地)
        // 視野換算：網格數 * 20 像素 + 80 像素寬容度 (更激進的搜尋)
        const visionPx = ((v.field_vision || 15) * 20) + 80;

        const nextConstruction = this.state.mapEntities.find(e => {
            if (!e || !e.isUnderConstruction) return false;

            // 距離檢查
            const dist = Math.hypot(e.x - v.x, e.y - v.y);
            if (dist > visionPx) return false;

            // 互斥檢查修復：只有當正在有人「前往或正在施工中」才放手
            const hasActiveWorker = this.state.units.villagers.some(vi =>
                vi.id !== v.id &&
                vi.constructionTarget &&
                (vi.constructionTarget === e || vi.constructionTarget.id === e.id) &&
                ['MOVING_TO_CONSTRUCTION', 'CONSTRUCTING'].includes(vi.state)
            );
            return !hasActiveWorker;
        });

        if (nextConstruction) {
            v.state = 'MOVING_TO_CONSTRUCTION';
            v.constructionTarget = nextConstruction;
            v.targetId = null; v.pathTarget = null;
            v.assignedWarehouseId = null;
            return;
        }

        // 2. 各倉庫滿員情況 (優先補滿專職位)
        const warehouses = this.state.mapEntities.filter(e =>
            ['timber_factory', 'stone_factory', 'barn', 'gold_mining_factory'].includes(e.type) && !e.isUnderConstruction
        );

        if (v.assignedWarehouseId) {
            const myW = warehouses.find(e => (e.id || `${e.type}_${e.x}_${e.y}`) === v.assignedWarehouseId);
            if (myW && this.findNearestResource(v.x, v.y, v.type, v.id)) {
                // 如果編制還在且還有資源，繼續工作
                const currentWorkers = this.state.units.villagers.filter(vi => vi !== v && vi.assignedWarehouseId === v.assignedWarehouseId).length;
                if (currentWorkers < (myW.targetWorkerCount || 0)) {
                    v.state = 'MOVING_TO_RESOURCE';
                    v.targetId = null; v.pathTarget = null;
                    return;
                }
            }
            v.assignedWarehouseId = null;
        }

        // 尋找其他有缺額且附近有資源的倉庫
        for (const w of warehouses) {
            const winfo = (w.id || `${w.type}_${w.x}_${w.y}`);
            const count = this.state.units.villagers.filter(vi => vi.assignedWarehouseId === winfo).length;
            if (count < (w.targetWorkerCount || 0)) {
                const resType = (w.type === 'timber_factory' ? 'WOOD' :
                    (w.type === 'stone_factory' ? 'STONE' :
                        (w.type === 'barn' ? 'FOOD' : 'GOLD')));
                if (this.findNearestResource(w.x, w.y, resType, v.id)) {
                    v.assignedWarehouseId = winfo;
                    v.type = resType;
                    v.state = 'MOVING_TO_RESOURCE';
                    v.targetId = null; v.pathTarget = null;
                    return;
                }
            }
        }

        // 3. 通用採集指令
        if (this.state.currentGlobalCommand && this.state.currentGlobalCommand !== 'RETURN') {
            v.type = this.state.currentGlobalCommand;
            if (this.findNearestResource(v.x, v.y, v.type, v.id)) {
                v.state = 'MOVING_TO_RESOURCE';
                v.targetId = null; v.pathTarget = null;
                return;
            }
        }

        // 4. 無事可做，才真正進入閒置
        v.state = 'IDLE';
    }

    static findNearestDepositPoint(x, y, resourceType = 'WOOD') {
        const grid = this.state.spatialGrid;
        const startGx = Math.floor(x / grid.cellSize);
        const startGy = Math.floor(y / grid.cellSize);

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
                            if (e.type === 'village') {
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
        this.state.mapEntities.forEach(e => {
            if (e.isUnderConstruction || e.type !== 'village') return;
            const d = Math.hypot(e.x - x, e.y - y);
            if (d < minDist) { minDist = d; nearest = e; }
        });
        return nearest;
    }

    /**
     * 執行路徑移動邏輯 (非同步尋路)
     * 根據核心協議：效能優化與穩定優先，避免每幀重複 new 物件
     */
    static moveDetailed(v, tx, ty, speed, dt) {
        // 如果目標座標發生顯著變化，重置路徑
        if (!v._lastTargetPos || Math.hypot(v._lastTargetPos.x - tx, v._lastTargetPos.y - ty) > 20) {
            v._lastTargetPos = { x: tx, y: ty };
            v.fullPath = null;
            v.pathIndex = 0;
            v.isFindingPath = false;
        }

        // 核心修正 1：如果目前沒有路徑且也沒在尋路中，發起非同步尋路請求
        if (!v.fullPath && !v.isFindingPath && this.state.pathfinding) {
            const isSelected = GameEngine.state.selectedUnitIds && GameEngine.state.selectedUnitIds.includes(v.id);
            if (isSelected) {
                const msg = `[尋路請求] (${v.x.toFixed(0)}, ${v.y.toFixed(0)}) -> (${tx.toFixed(0)}, ${ty.toFixed(0)})`;
                console.log(`%c${msg}`, "color: #ffeb3b; font-weight: bold;");
                GameEngine.addLog(msg, 'PATH');
            }
            v.isFindingPath = true;
            this.state.pathfinding.findPath(v.x, v.y, tx, ty, (path) => {
                v.isFindingPath = false;
                if (path && path.length > 1) {
                    v.fullPath = path;
                    v.pathIndex = 1; // 跳過起點
                    if (isSelected) {
                        GameEngine.addLog(`[尋路成功] 路徑長度: ${path.length}`, 'PATH');
                    }
                } else {
                    // 尋路失敗，設為空避免重複頻繁請求
                    v.fullPath = [];
                    if (isSelected) {
                        GameEngine.addLog(`[尋路失敗!] 無法到達 (${tx.toFixed(0)}, ${ty.toFixed(0)})`, 'PATH');
                    }
                }
            });
        }

        // 核心優化 2：殘餘距離遞延 (Movement Carry-over)
        let remainingDt = dt;
        let safetyCounter = 0; // 防止無窮迴圈

        while (remainingDt > 0 && safetyCounter < 10) {
            safetyCounter++;
            const moveDist = speed * remainingDt;

            if (v.fullPath && v.pathIndex < v.fullPath.length) {
                const node = v.fullPath[v.pathIndex];
                const dx = node.x - v.x;
                const dy = node.y - v.y;
                const dist = Math.hypot(dx, dy);

                if (dist <= moveDist) {
                    const deltaX = node.x - v.x;
                    if (Math.abs(deltaX) > 0.01) v.facing = deltaX > 0 ? 1 : -1;
                    v.x = node.x;
                    v.y = node.y;
                    v.pathIndex++;
                    remainingDt -= dist / speed;
                } else if (dist > 0.01) {
                    const ratio = moveDist / dist;
                    const deltaX = dx * ratio;
                    v.x += deltaX;
                    v.y += dy * ratio;
                    if (Math.abs(deltaX) > 0.01) v.facing = deltaX > 0 ? 1 : -1;
                    remainingDt = 0;
                } else {
                    v.pathIndex++;
                }
            } else if (!v.isFindingPath) {
                // 只有在非尋路中，才允許最後的直線逼近，避免尋路空窗期滲透進建築
                this.moveTowards(v, tx, ty, speed, remainingDt);
                remainingDt = 0;
            } else {
                remainingDt = 0; // 尋路中禁止移動，保持原地等待
            }
        }
    }

    /**
     * 防卡死螺旋脫困邏輯 (NPC Escape Protocol)
     * 利用 PathfindingSystem 的螺旋搜尋找到最近可用空格並傳送
     */
    static resolveStuck(v) {
        if (!this.state.pathfinding) return;

        const isSelected = GameEngine.state.selectedUnitIds && GameEngine.state.selectedUnitIds.includes(v.id);
        const oldX = v.x, oldY = v.y;

        // 計算當前所在格線座標 (絕對座標)
        const gx = Math.floor(v.x / this.TILE_SIZE);
        const gy = Math.floor(v.y / this.TILE_SIZE);

        // 搜尋最近的空地 (格網索引)
        const nearest = this.state.pathfinding.getNearestWalkableTile(gx, gy, 100, true);

        if (nearest) {
            // 傳送至該格的像素中心
            const targetX = nearest.x * this.TILE_SIZE + this.TILE_SIZE / 2;
            const targetY = nearest.y * this.TILE_SIZE + this.TILE_SIZE / 2;

            // 如果位移非常小 (小於 1px)，表示 getNearest 找到的就是目前位置，但可能因為精度問題微卡
            // 此時稍微隨機偏移一下，協助物理引擎跳出
            if (Math.hypot(targetX - oldX, targetY - oldY) < 1) {
                v.x += (Math.random() - 0.5) * 5;
                v.y += (Math.random() - 0.5) * 5;
            } else {
                v.x = targetX;
                v.y = targetY;
            }

            v.fullPath = null;
            v.pathIndex = 0;
            v.pathTarget = null;
            v._stuckFrames = 0; // 重置計數

            if (isSelected) {
                GameEngine.addLog(`[防卡死修復] 已由 (${oldX.toFixed(0)},${oldY.toFixed(0)}) 移至 (${v.x.toFixed(0)}, ${v.y.toFixed(0)})`, 'PATH');
            }
        } else {
            if (isSelected) {
                GameEngine.addLog(`[防卡死失敗] 100格半徑內找不到脫困空間!`, 'PATH');
            }
        }
    }

    static moveTowards(v, tx, ty, speed, dt) {
        const dx = tx - v.x, dy = ty - v.y;
        const dist = Math.hypot(dx, dy);
        const moveDist = speed * dt;
        if (dist > moveDist) {
            const deltaX = (dx / dist) * moveDist;
            const nextX = v.x + deltaX;
            const nextY = v.y + (dy / dist) * moveDist;
            if (Math.abs(deltaX) > 0.01) {
                v.facing = deltaX > 0 ? 1 : -1;
            }
            v.x = nextX;
            v.y = nextY;
        } else if (dist > 0.1) {
            const deltaX = tx - v.x;
            if (Math.abs(deltaX) > 0.01) {
                v.facing = deltaX > 0 ? 1 : -1;
            }
            v.x = tx; v.y = ty;
        }
    }

    // 已刪除 BFS 版 findNextStep


    // 已刪除原有的 getObstacleGrid


    static isColliding(x, y, ignoreEnts = []) {
        const grid = this.state.spatialGrid;
        if (!grid || !grid.cells) return null;

        const cellSize = grid.cellSize;
        const gx = Math.floor(x / cellSize);
        const gy = Math.floor(y / cellSize);

        // 偵測當前格點週邊的 4 個格子即可（因為單位體積比 cellSize 小得多）
        for (let i = gx - 1; i <= gx + 1; i++) {
            for (let j = gy - 1; j <= gy + 1; j++) {
                const cell = grid.cells.get(`${i},${j}`);
                if (!cell) continue;

                for (const ent of cell) {
                    if (ent.isUnderConstruction) continue;
                    if (ignoreEnts.includes(ent)) continue;

                    const cfg = this.getEntityConfig(ent.type);
                    if (cfg && cfg.collision) {
                        // 快取或即時解析尺寸 (避免 Regex 迴圈消耗)
                        if (!ent._collisionW) {
                            const match = cfg.size ? cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/) : null;
                            const uw = match ? parseInt(match[1]) : 1, uh = match ? parseInt(match[2]) : 1;
                            ent._collisionW = uw * this.TILE_SIZE;
                        }

                        // 從 UI_CONFIG 讀取碰撞調整參數
                        const collCfg = UI_CONFIG.BuildingCollision || { buffer: 20, feetOffset: 18 };
                        const w = ent._collisionW + collCfg.buffer, h = ent._collisionH + collCfg.buffer;
                        const FOOT_OFFSET = collCfg.feetOffset;
                        const logicY = ent.y - FOOT_OFFSET; // 碰撞邏輯中心向上偏移，對齊單位腳部

                        // 精確碰撞矩形檢查 (誤差補償 +/- 1px 避免邊緣抖動)
                        if (x > ent.x - w / 2 + 1 && x < ent.x + w / 2 - 1 && y > logicY - h / 2 + 1 && y < logicY + h / 2 - 1) {
                            return ent;
                        }
                    }
                }
            }
        }
        return null;
    }

    static isAreaClear(x, y, type, tempEntities = []) {
        const cfg = this.getEntityConfig(type);
        if (!cfg) return true;
        const match = cfg.size ? cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/) : null;
        const uw = match ? parseInt(match[1]) : 1, uh = match ? parseInt(match[2]) : 1;
        const w = uw * this.TILE_SIZE, h = uh * this.TILE_SIZE;

        const allToCheck = [...this.state.mapEntities, ...tempEntities];

        const hitEntity = allToCheck.some(ent => {
            const ecfg = this.getEntityConfig(ent.type);
            let ew = this.TILE_SIZE, eh = this.TILE_SIZE;
            if (ecfg) {
                const em = ecfg.size ? ecfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/) : null;
                ew = em ? parseInt(em[1]) * this.TILE_SIZE : this.TILE_SIZE;
                eh = em ? parseInt(em[2]) * this.TILE_SIZE : this.TILE_SIZE;
            }
            return Math.abs(x - ent.x) < (w + ew) / 2 - 5 && Math.abs(y - ent.y) < (h + eh) / 2 - 5;
        });
        return !hitEntity;
    }

    static findNearestResource(x, y, type, villagerId) {
        const grid = this.state.spatialGrid;
        const startGx = Math.floor(x / grid.cellSize);
        const startGy = Math.floor(y / grid.cellSize);

        let nearest = null;
        let minDist = Infinity;

        // 從中心向外搜尋 8 圈 (約 2000 像素半徑)
        for (let r = 0; r <= 8; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const key = `${startGx + dx},${startGy + dy}`;
                    const cell = grid.cells.get(key);
                    if (cell) {
                        cell.forEach(e => {
                            if (e.resourceType === type) {
                                if (e.type === 'farmland' || e.type === 'tree_plantation') {
                                    const isOccupied = this.state.units.villagers.some(v =>
                                        v.id !== villagerId && (v.targetId === e || v.constructionTarget === e)
                                    );
                                    if (isOccupied) return;
                                }
                                const d = Math.hypot(e.x - x, e.y - y);
                                if (d < minDist) { minDist = d; nearest = e; }
                            }
                        });
                    }
                }
            }
            if (nearest) return nearest;
        }
        return null;
    }

    static updateWorkerAssignments() {
        const warehouses = this.state.mapEntities.filter(e =>
            ['timber_factory', 'stone_factory', 'barn', 'gold_mining_factory'].includes(e.type) && !e.isUnderConstruction
        );

        // 1. 回收所有失效倉庫的工人，並收集有效的分配情況
        const warehouseMap = new Map();
        warehouses.forEach(w => warehouseMap.set(w.id || `${w.type}_${w.x}_${w.y}`, { entity: w, workers: [] }));

        this.state.units.villagers.forEach(v => {
            // 核心修復：核心邏輯僅限於我方村民，非我方或非建築工之單位不應持有倉庫 ID
            if (!v.config || v.config.type !== 'villagers' || v.config.camp !== 'player') {
                v.assignedWarehouseId = null;
                return;
            }
            if (v.assignedWarehouseId) {
                const data = warehouseMap.get(v.assignedWarehouseId);
                if (!data) {
                    // 倉庫已消失或施工中，釋放工人
                    v.assignedWarehouseId = null;
                    v.state = 'IDLE';
                } else {
                    data.workers.push(v);
                }
            }
        });

        // 2. 處理每個倉庫的溢出與缺額
        let allIdle = this.state.units.villagers.filter(v =>
            v.config && v.config.type === 'villagers' && v.config.camp === 'player' &&
            v.state === 'IDLE' && !v.assignedWarehouseId && !v.isRecalled && !v.isManualCommand
        );

        // 先釋放溢出的人手，回歸閒置池
        warehouseMap.forEach((data, wid) => {
            const { entity, workers } = data;
            const target = entity.targetWorkerCount || 0;
            if (workers.length > target) {
                const overflow = workers.slice(target);
                overflow.forEach(v => {
                    v.assignedWarehouseId = null;
                    v.targetId = null;
                    v.pathTarget = null;
                    this.assignNextTask(v); // 釋放後立即尋找新高優先級任務
                    if (v.state === 'IDLE') allIdle.push(v);
                });
                data.workers = workers.slice(0, target);
            }
        });

        // 再從閒置池分配缺額 (Round-Robin)
        let needsRefill = true;
        while (needsRefill && allIdle.length > 0) {
            needsRefill = false;
            warehouseMap.forEach((data, wid) => {
                const { entity, workers } = data;
                const target = entity.targetWorkerCount || 0;
                if (workers.length < target && allIdle.length > 0) {
                    const v = allIdle.shift();
                    v.assignedWarehouseId = wid;
                    v.type = (entity.type === 'timber_factory' ? 'WOOD' :
                        (entity.type === 'stone_factory' ? 'STONE' :
                            (entity.type === 'barn' ? 'FOOD' : 'GOLD')));
                    v.state = 'MOVING_TO_RESOURCE';
                    v.targetId = null;
                    v.pathTarget = null;
                    workers.push(v);
                    needsRefill = true;
                }
            });
        }
    }

    static adjustWarehouseWorkers(entity, delta) {
        if (!entity) return;
        entity.targetWorkerCount = Math.max(0, (entity.targetWorkerCount || 0) + delta);
        // 立即觸發一次更新
        this.updateWorkerAssignments();
        if (window.UIManager) window.UIManager.updateValues();
    }

    static depositResource(type, amount) {
        const resKey = type.toLowerCase();
        if (this.state.resources.hasOwnProperty(resKey)) this.state.resources[resKey] += amount;
        else if (type === 'FOOD') this.state.resources.food += amount;
        this.addLog(`存入了 ${amount} 單位的 ${type}。`);
    }

    static setCommand(event, commandType) {
        if (event && event.stopPropagation) event.stopPropagation();

        // 點擊兩次則變為非選取 (IDLE)
        if (this.state.currentGlobalCommand === commandType) {
            this.addLog(`停止全域指令：${this.RESOURCE_NAMES[commandType.toLowerCase()] || commandType}。`);
            this.state.currentGlobalCommand = 'IDLE';
            // 讓受影響的人立即停止手邊的工作回歸閒置
            this.state.units.villagers.forEach(v => {
                if (v.config.type !== 'villagers' || v.assignedWarehouseId) return;
                if (v.state === 'MOVING_TO_CONSTRUCTION' || v.state === 'CONSTRUCTING') return;
                if (v.type === commandType && (v.state === 'MOVING_TO_RESOURCE' || v.state === 'GATHERING' || v.state === 'MOVING_TO_BASE')) {
                    v.state = 'IDLE';
                    v.targetId = null; v.pathTarget = null;
                }
            });
            if (window.UIManager) window.UIManager.updateValues();
            return;
        }

        this.state.currentGlobalCommand = commandType;
        if (commandType === 'RETURN') {
            this.state.units.villagers.forEach(v => {
                if (v.config.type !== 'villagers') return;
                // 正在建造的村民不執行回城指令，除非建造完成
                if (v.state === 'MOVING_TO_CONSTRUCTION' || v.state === 'CONSTRUCTING') return;
                v.state = 'MOVING_TO_BASE'; v.isRecalled = true; v.pathTarget = null;
            });
            if (window.UIManager) window.UIManager.updateValues();
            return;
        }
        this.addLog(`全員動員：開始採集 ${this.RESOURCE_NAMES[commandType.toLowerCase()] || commandType}。`);
        this.state.units.villagers.forEach(v => {
            if (v.config.type !== 'villagers') return;

            // 禁止中斷正在建造中或已分配到特殊田地（農田、樹木田）的工人
            if (v.state === 'CONSTRUCTING' || v.state === 'MOVING_TO_CONSTRUCTION') return;
            if (v.targetId && (v.targetId.type === 'farmland' || v.targetId.type === 'tree_plantation')) return;

            // 只有「通用工人」(沒有被分配到特定採集場) 才受全域指令控制
            if (v.assignedWarehouseId) return;

            const isIdle = v.state === 'IDLE';
            const isVillageWorker = v.targetBase && v.targetBase.type === 'village';

            if (isIdle || isVillageWorker) {
                v.type = commandType;
                v.state = 'MOVING_TO_RESOURCE';
                v.targetId = null;
                v.isRecalled = false;
                v.pathTarget = null;
                v.workOffset = null; // 切換任務時清除偏移量
                // 通用任務一律回傳給城鎮中心處理
                v.targetBase = this.findNearestDepositPoint(v.x, v.y, v.type);
            }
        });
        if (window.UIManager) window.UIManager.updateValues();
    }

    static addToProductionQueue(event, configName, sourceBuilding = null) {
        if (event && event.stopPropagation) event.stopPropagation();

        // 取得點選的建築實體
        const building = sourceBuilding || (window.UIManager && window.UIManager.activeMenuEntity);
        if (!building || !building.queue) {
            this.addLog("此建築無法生產單位！");
            return;
        }

        if (building.queue.length >= 10) {
            this.addLog(`${building.name} 的生產隊伍已滿 (10/10)！`);
            this.triggerWarning("4");
            return;
        }

        // 檢查資源成本
        // 隨機生產模式：成本取列表中的第一個，或可以定義一個平均成本
        // 這裡我們先預設以 configName 直接尋找
        let cfg = this.state.npcConfigs[configName];
        if (!cfg) {
            // 如果是 ID (來自 buildings.csv)
            const name = this.state.idToNameMap[configName];
            if (name) cfg = this.state.npcConfigs[name];
        }

        if (cfg && cfg.costs) {
            for (let r in cfg.costs) {
                if (this.state.resources[r] < cfg.costs[r]) {
                    this.triggerWarning("1", [r.toUpperCase()]);
                    return;
                }
            }
            for (let r in cfg.costs) {
                this.state.resources[r] -= cfg.costs[r];
            }
        }

        building.queue.push(configName);
        if (building.queue.length === 1 && (building.productionTimer || 0) <= 0) {
            building.productionTimer = 5;
        }
        this.addLog(`${building.name} 加入生產隊列：${configName} (${building.queue.length}/10)`);

        if (window.UIManager) window.UIManager.updateValues();
    }

    static addLog(msg, category = 'COMMON') {
        this.state.log.push({ msg, category, id: Date.now() + Math.random() });
        if (this.state.log.length > 100) this.state.log.shift();
    }

    static placeBuilding(type, x, y) {
        const cfg = this.state.buildingConfigs[type];
        if (!cfg) return false;
        const currentCount = this.state.mapEntities.filter(e => e.type === type).length;
        if (cfg.maxCount !== undefined && currentCount >= cfg.maxCount) {
            this.addLog(`建造失敗：${cfg.name} 數量已達上限！`);
            return false;
        }
        // 檢查資源
        for (let r in cfg.costs) {
            if (this.state.resources[r] < cfg.costs[r]) {
                this.triggerWarning("1", [r.toUpperCase()]);
                return false;
            }
        }
        const costs = cfg.costs; const res = this.state.resources;
        if (!this.isAreaClear(x, y, type)) { this.addLog("位置受阻！"); return false; }
        res.food -= costs.food; res.wood -= costs.wood; res.stone -= costs.stone; res.gold -= costs.gold;

        const newBuilding = {
            id: `build_${type}_${x}_${y}_${Date.now()}`,
            type: type, x: x, y: y, name: "施工中",
            isUnderConstruction: true, buildProgress: 0, buildTime: cfg.buildTime,
            targetWorkerCount: ['timber_factory', 'stone_factory', 'barn', 'quarry', 'gold_mining_factory'].includes(type) ? 1 : 0,
            ...(cfg.npcProduction && cfg.npcProduction.length > 0 ? { queue: [], productionTimer: 0 } : {})
        };
        this.state.mapEntities.push(newBuilding);
        this.state.renderVersion++; // 通知渲染器刷新

        // --- NPC 位移修復：如果有村民被壓在剛生成的建築下，將其推開 ---
        const TS = this.TILE_SIZE;
        const match = cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
        const uw = match ? parseInt(match[1]) : 1, uh = match ? parseInt(match[2]) : 1;
        const w = uw * TS, h = uh * TS;
        const bLeft = x - w / 2, bRight = x + w / 2, bTop = y - h / 2, bBottom = y + h / 2;

        // 已移除舊有的 findSafePos (防卡死系統) 邏輯

        // ------------------------------------------------------------

        // 已修復：由村民在 assignNextTask 中依紅圈視野自行「領取」任務
        // 這能解決「遠方村民霸佔任務」導致「身邊村民不蓋房」且「無視紅圈內建築」的問題
        this.addLog(`批次配置成功：${cfg.name} 已加入建造清單。`, 'COMMON');

        this.updatePathfindingGrid(); // 建造完成後刷新格網數據
        this.updateSpatialGrid();
        return true;
    }


    static placeBuildingLine(type, startX, startY, endX, endY) {
        const positions = this.getLinePositions(type, startX, startY, endX, endY);
        const cfg = this.state.buildingConfigs[type];
        if (!cfg || positions.length === 0) return;

        // 預檢總成本與可用性
        let possibleBuildings = [];
        let totalCosts = { food: 0, wood: 0, stone: 0, gold: 0 };

        positions.forEach(pos => {
            if (this.isAreaClear(pos.x, pos.y, type, possibleBuildings)) {
                possibleBuildings.push({ x: pos.x, y: pos.y });
                for (let r in cfg.costs) totalCosts[r] += cfg.costs[r];
            }
        });

        if (possibleBuildings.length === 0) return;

        // 檢查最終資源量
        for (let r in totalCosts) {
            if (this.state.resources[r] < totalCosts[r]) {
                this.triggerWarning("1", [r.toUpperCase()]);
                return;
            }
        }

        // 批量執行
        let count = 0;
        possibleBuildings.forEach(pos => {
            if (this.placeBuilding(type, pos.x, pos.y)) count++;
        });
        if (count > 0) this.addLog(`批次建造：${cfg.name} x${count}。`);
    }

    static getLinePositions(type, startX, startY, endX, endY) {
        const TS = this.TILE_SIZE;
        const cfg = this.state.buildingConfigs[type];
        if (!cfg) return [];
        const match = cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
        const uw = match ? parseInt(match[1]) : 1, uh = match ? parseInt(match[2]) : 1;

        // 為了讓拉排更直覺，我們強迫它沿著主軸線排列
        const dx = endX - startX, dy = endY - startY;
        const positions = [];

        if (Math.abs(dx) > Math.abs(dy)) {
            // 水平排列
            const step = uw * TS;
            const count = Math.floor(Math.abs(dx) / step) + 1;
            const dir = dx > 0 ? 1 : -1;
            for (let i = 0; i < count; i++) {
                positions.push({ x: startX + i * step * dir, y: startY });
            }
        } else {
            // 垂直排列
            const step = uh * TS;
            const count = Math.floor(Math.abs(dy) / step) + 1;
            const dir = dy > 0 ? 1 : -1;
            for (let i = 0; i < count; i++) {
                positions.push({ x: startX, y: startY + i * step * dir });
            }
        }
        return positions;
    }

    static findNearestAvailableVillager(x, y) {
        let nearest = null;
        let minDist = Infinity;

        // 優先找「真正閒置」且沒被倉庫綁定的村民
        this.state.units.villagers.forEach(v => {
            if (v.state === 'IDLE' && !v.assignedWarehouseId) {
                const dist = Math.hypot(v.x - x, v.y - y);
                if (dist < minDist) { minDist = dist; nearest = v; }
            }
        });

        if (nearest) return nearest;

        // 如果沒有閒置的，再找正在採集一般資源（非農田/倉庫）的村民
        this.state.units.villagers.forEach(v => {
            if (v.state === 'MOVING_TO_CONSTRUCTION' || v.state === 'CONSTRUCTING') return;
            if (v.targetId && v.targetId.type === 'farmland') return;
            if (v.assignedWarehouseId) return;

            const dist = Math.hypot(v.x - x, v.y - y);
            if (dist < minDist) {
                minDist = dist;
                nearest = v;
            }
        });
        return nearest;
    }

    static destroyBuilding(ent) {
        if (!ent) return;
        const cfg = this.state.buildingConfigs[ent.type];
        if (!cfg) return;

        // 1. 返還資源 (50%)
        let refundLog = [];
        for (let r in cfg.costs) {
            const amount = Math.floor(cfg.costs[r] / 2);
            if (amount > 0) {
                this.state.resources[r] += amount;
                refundLog.push(`${amount} 單位 ${this.RESOURCE_NAMES[r] || r}`);
            }
        }

        // 2. 更新狀態計數
        if (ent.type === 'farmhouse') this.state.buildings.farmhouse--;

        // 3. 從地圖移除
        const id = ent.id || `${ent.type}_${ent.x}_${ent.y}`;
        this.state.mapEntities = this.state.mapEntities.filter(e => {
            const eid = e.id || `${e.type}_${e.x}_${e.y}`;
            return eid !== id;
        });

        this.state.renderVersion++; // 通知渲染器刷新

        // 4. 通知日誌
        this.addLog(`銷毀了 ${cfg.name}。返還：${refundLog.join(', ') || '無'}`);

        // 5. 如果有村民正要去這建設/採集，需重置
        this.state.units.villagers.forEach(v => {
            if (v.constructionTarget === ent || v.targetId === ent || v.assignedWarehouseId === id) {
                v.constructionTarget = null;
                v.targetId = null;
                v.assignedWarehouseId = null;
                this.restoreVillagerTask(v);
            }
        });

        if (window.UIManager) {
            window.UIManager.hideContextMenu();
            window.UIManager.updateValues();
        }
        this.updateSpatialGrid();
    }
}
