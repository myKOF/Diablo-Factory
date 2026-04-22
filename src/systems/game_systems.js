import { UI_CONFIG } from "../ui/ui_config.js";
import { EffectSystem } from "./EffectSystem.js";
import { PathfindingSystem } from "./PathfindingSystem.js?v=3";
import { BattleSystem } from "./BattleSystem.js";
import { MapDataSystem } from "./MapDataSystem.js";
import { ResourceSystem } from "./ResourceSystem.js";



import { WorkerSystem } from "./WorkerSystem.js";


/**
 * 核心遊戲邏輯系統 (System Manager)
 * 現在作為中央管理器，協調 WorkerSystem, ResourceSystem, EffectSystem 與 BattleSystem。
 * 處理資料讀取、全局狀態維護與系統間的調用同步。
 */
export class GameEngine {
    static TILE_SIZE = 20; // 基礎座標單位

    static state = {
        resources: { fruit: 0, wood: 0, stone: 0, gold_ore: 0, iron_ore: 0, coal: 0, magic_herb: 0, wolf_hide: 0, bear_pelt: 0, gold_ingots: 0, healthpotion: 0, soul: 100, mana: 0 },
        buildings: { village: 1, farmhouse: 0 },
        units: { villagers: [], npcs: [], priest: 0, mage: 0, archmage: 0, swordsman: 0, archer: 0 },
        mapEntities: [],
        log: ["暗黑煉金工廠：末日準備中..."],
        npcConfigs: {},
        systemConfig: { village_standby_range: 150, village_standby_speed: 3 },
        resourceConfigs: [],
        buildingConfigs: {},
        placingType: null,
        previewPos: null,
        buildingMode: 'NONE', // 'NONE', 'DRAG', 'STAMP', 'LINE'
        buildingSpacing: 1, // [新功能] 建築批量放置間距
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
            showResourceInfo: true, // 預設顯示大地圖資源資訊（名稱、等級、數量）
            showVisionRange: 0      // 預設關閉視野圈 (0: 關閉, 1: 僅選中, 2: 全部)
        },
        globalConstructionOrder: 1, // [新協定] 建築施工序列號，從小到大依次建造
        idToNameMap: {}, // NPC ID -> NPC Name (用於從 buildings.csv 定義的 ID 找配置)
        renderVersion: 0, // 用於通知渲染器強行刷新
        pathfinding: null, // 尋路系統實例
        selectedUnitIds: [], // 目前選中的單位 ID 列表
        selectedBuildingIds: [], // 目前選中的建築 ID 列表
        selectedResourceId: null, // 目前選中的資源 ID (gx_gy)
        projectiles: [], // [新協定] 存放活躍中的遠程子彈
        lastSelectedUnitId: null, // 上一次選中的單位 ID (用於雙擊檢測)
        lastSelectedBuildingId: null, // 上一次選中的建築 ID (用於雙擊檢測)
        lastSelectionTime: 0, // 上一次選中的時間 (用於雙擊檢測)
        mapData: null, // 大地圖數據系統實例 (Uint16Array)
        initialResourceKeys: [] // [新功能] 記錄初始資源鍵值，供 UI 動態顯示
    };

    // 系統實例
    static workerSystem = null;


    // 資源名稱對照表已遷移至 ResourceSystem.RESOURCE_NAMES
    static get RESOURCE_NAMES() { return ResourceSystem.RESOURCE_NAMES; }

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
            this.loadStringsConfig(),
            this.loadIngredientConfig()
        ]).catch(e => console.error(e));

        // 尋路系統初始化
        this.state.pathfinding = new PathfindingSystem();
        this.state.pathfinding.tileSize = this.TILE_SIZE;
        this.state.pathfinding.setAcceptableTiles([0]);

        // [核心重構] 初始化子系統
        this.workerSystem = new WorkerSystem(this.state, this);

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

        // UI 更新循迴已移至 MainScene.js update() 以達成 60FPS 同步
    }


    static initBackgroundWorker() {
        const blob = new Blob([`
            setInterval(() => { self.postMessage('tick'); }, 20); // 提高頻率至 50Hz (20ms) 以確保動畫平滑
        `], { type: "text/javascript" });
        const worker = new Worker(URL.createObjectURL(blob));
        worker.onmessage = () => { this.logicTick(); };
        console.log("背景執行 Worker 已啟動");
    }

    static logicTick() {
        try {
            if (this.state.pathfinding) this.state.pathfinding.update();
            const now = Date.now();

            const deltaTime = Math.min((now - this.lastTickTime) / 1000, 0.2);
            this.lastTickTime = now;

            // 1. 戰鬥系統更新
            if (typeof BattleSystem !== 'undefined') {
                BattleSystem.update(this.state, deltaTime, this.TILE_SIZE);
            }

            // 2. 特效與彈道系統更新
            if (typeof EffectSystem !== 'undefined') {
                EffectSystem.update(this.state, deltaTime, this.TILE_SIZE, BattleSystem?.applyDamage?.bind(BattleSystem));
            }

            // 3. 處理建築生產與升級邏輯 (Manager 職責)
            this.updateBuildingsLogic(deltaTime);

            // 4. 工人系統更新 (尋路、移動、任務分配)
            if (this.workerSystem) {
                this.workerSystem.update(deltaTime);
            }

        } catch (err) {
            console.error("Logic Loop Error:", err);
            this.addLog(`[系統錯誤] 邏輯循環異常: ${err.message}`, 'SYSTEM');
        }
    }

    /**
     * 建築邏輯更新：處理生產隊列與升級進度
     */
    static updateBuildingsLogic(deltaTime) {
        const maxPop = this.getMaxPopulation();
        let currentPopCount = this.getCurrentPopulation();
        let anyFoundBlocked = false;

        if (this.state.lastMaxPop > 0 && maxPop > this.state.lastMaxPop) {
            this.triggerWarning("3", [maxPop]);
        }
        this.state.lastMaxPop = maxPop;

        this.state.mapEntities.forEach(ent => {
            // 集結點追蹤
            if (ent.rallyPoint && ent.rallyPoint.targetId && ent.rallyPoint.targetType === 'UNIT') {
                const target = this.state.units.villagers.find(u => u.id === ent.rallyPoint.targetId);
                if (target && target.hp > 0) {
                    ent.rallyPoint.x = target.x;
                    ent.rallyPoint.y = target.y;
                } else {
                    ent.rallyPoint.targetId = null;
                    ent.rallyPoint.targetType = 'GROUND';
                }
            }

            // 升級邏輯
            if (ent.isUpgrading) {
                if (ent.upgradeProgress === undefined) ent.upgradeProgress = 0;
                ent.upgradeProgress += deltaTime / ent.upgradeTime;
                if (ent.upgradeProgress >= 1.0) {
                    ent.isUpgrading = false;
                    ent.upgradeProgress = 0;
                    ent.lv = (ent.lv || 1) + 1;
                    const newCfg = this.getBuildingConfig(ent.type, ent.lv);
                    if (newCfg) {
                        ent.name = newCfg.name;
                        ent.model = newCfg.model;
                    }
                    this.addLog(`${ent.name} 升級成功！目前等級：${ent.lv}`);
                    this.triggerWarning("upgrade_success", [ent.name, ent.lv]);
                    if (window.UIManager) {
                        window.UIManager.showWarning(`${ent.name} 升級至 ${ent.lv} 級！`);
                        window.UIManager.updateValues(true);
                        if (window.UIManager.activeMenuEntity === ent) window.UIManager.showContextMenu(ent);
                    }
                    this.state.renderVersion++;
                }
                return;
            }

            // 生產隊列邏輯
            if (ent.isUnderConstruction || !ent.queue || ent.queue.length === 0) return;

            const nextConfigName = ent.queue[0];
            let nextCfg = this.state.npcConfigs[nextConfigName];
            if (!nextCfg) {
                const mappedName = this.state.idToNameMap[nextConfigName];
                if (mappedName) nextCfg = this.state.npcConfigs[mappedName];
            }
            const unitPop = nextCfg ? (nextCfg.population || 1) : 1;
            const canSpawnPossible = (currentPopCount + unitPop) <= maxPop;

            if (ent.productionTimer === undefined) ent.productionTimer = 0;
            if (ent.productionTimer > 0) {
                ent.productionTimer -= deltaTime;
                if (ent.productionTimer < 0) ent.productionTimer = 0;
            }

            if (ent.productionTimer <= 0) {
                if (!canSpawnPossible) {
                    anyFoundBlocked = true;
                } else {
                    if (GameEngine.spawnNPC(nextConfigName, ent)) {
                        ent.queue.shift();
                        currentPopCount += unitPop;
                        ent.productionTimer = ent.queue.length > 0 ? 5 : 0;
                    }
                }
            }
        });

        if (anyFoundBlocked) {
            if (!this.state.hasHitPopLimit) {
                this.triggerWarning("2");
                this.state.hasHitPopLimit = true;
            }
        } else {
            this.state.hasHitPopLimit = false;
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

    /**
     * 解析 "{food=100,wood=200}" 格式為成本對象 {food: 100, wood: 200, ...}
     */
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

    static async loadNPCConfig() {
        try {
            const text = await this.fetchCSVText('config/npc_data.csv');
            const data = this.parseCSV(text);
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
                    costs: this.parseResourceCosts(row[idxNeed]),
                    produce_resource: this.parseResourceCosts(row[idxProduce])
                };

                // 解析物理尺寸 {寬,高} 或 {寬*高}
                if (idxPixelSize !== -1 && row[idxPixelSize]) {
                    const val = row[idxPixelSize].trim();
                    const m1 = val.match(/\{[ ]*(\d+)[ ]*[\*,][ ]*(\d+)[ ]*\}/);
                    if (m1) {
                        this.state.npcConfigs[name].pixel_size = { w: parseInt(m1[1]), h: parseInt(m1[2]) };
                    } else {
                        const m2 = val.match(/\{[ ]*(\d+)[ ]*\}/);
                        if (m2) {
                            const n = parseInt(m2[1]);
                            this.state.npcConfigs[name].pixel_size = { w: n, h: n };
                        }
                    }
                }
            }
        } catch (e) { }
    }

    static async loadSystemConfig() {
        try {
            const text = await this.fetchCSVText('config/system_config.csv');
            console.log("--- [DEBUG] system_config.csv RAW TEXT ---");
            console.log(text.substring(0, 200) + "..."); 
            const data = this.parseCSV(text);
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
                    const costs = this.parseResourceCosts(val);
                    console.log("--- [DEBUG] 已讀取初始資源配置:", costs);
                    
                    // 先歸零所有資源 (保持物件引用)
                    if (this.state.resources) {
                        for (let r in this.state.resources) this.state.resources[r] = 0;
                    } else {
                        this.state.resources = {};
                    }
                    
                    // 記錄初始資源鍵值，供 UI 動態顯示
                    const keys = Object.keys(costs);
                    this.state.initialResourceKeys = keys.slice(0, 6);
                    console.log("--- [DEBUG] UI 顯示鍵值:", this.state.initialResourceKeys);
                    
                    // 套用初始資源
                    keys.forEach(rk => {
                        this.state.resources[rk] = costs[rk];
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

    // 資源名稱對照表已統一於 ResourceSystem.RESOURCE_NAMES

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
            const text = await this.fetchCSVText('config/resources_data.csv');
            const data = this.parseCSV(text);
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const findHIdx = (key) => headers.findIndex(h => h.toLowerCase().trim() === key.toLowerCase());
            const idxName = findHIdx('name'), idxModel = findHIdx('model'), idxType = findHIdx('type');
            const idxColRes = findHIdx('collection_resource'), idxIngredients = findHIdx('ingredients'), idxDensity = findHIdx('density');
            const idxLv = findHIdx('lv'), idxSize = findHIdx('size'), idxModelSize = findHIdx('model_size'), idxPixelSize = findHIdx('pixel_size');

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
                    parsedIngredients = this.parseResourceCosts(row[idxIngredients]);
                    totalAmount = Object.values(parsedIngredients).reduce((acc, val) => acc + val, 0);
                }

                this.state.resourceConfigs.push({
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

    static async loadIngredientConfig() {
        try {
            const text = await this.fetchCSVText('config/Ingredients.csv');
            const data = this.parseCSV(text);
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const findHIdx = (key) => headers.findIndex(h => h.toLowerCase().trim() === key.toLowerCase());
            const idxId = findHIdx('id'), idxName = findHIdx('name'), idxIcon = findHIdx('icon');
            const idxType = findHIdx('type'), idxLv = findHIdx('lv');
            const idxNeed = findHIdx('need_ingredients'), idxStack = findHIdx('stack');

            this.state.ingredientConfigs = {};
            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxId] || !row[idxType]) continue;
                
                const id = parseInt(row[idxId]);
                const type = row[idxType].trim();
                
                this.state.ingredientConfigs[type] = {
                    id: id,
                    name: row[idxName] ? row[idxName].trim() : type,
                    icon: row[idxIcon] ? row[idxIcon].trim() : '',
                    type: type,
                    lv: parseInt(row[idxLv]) || 1,
                    need_ingredients: this.parseResourceCosts(row[idxNeed] || ''),
                    stack: parseInt(row[idxStack]) || 1000
                };
            }
            console.log("材料需求表加載成功:", Object.keys(this.state.ingredientConfigs).length);
        } catch (e) { console.error("加載 Ingredients.csv 失敗:", e); }
    }

    static getEntityConfig(type, lv = 1) {
        if (!type) return null;
        if (this.state.buildingConfigsByType && this.state.buildingConfigsByType[type]) {
            return this.state.buildingConfigsByType[type][lv] || this.state.buildingConfigsByType[type][1];
        }
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
            const text = await this.fetchCSVText('config/buildings.csv');
            const data = this.parseCSV(text);
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const hIdx = (key) => headers.findIndex(h => h.toLowerCase().trim() === key.toLowerCase());

            const idxModel = hIdx('model'),
                idxType = hIdx('type'),
                idxCol = hIdx('collision'),
                idxSize = hIdx('size'),
                idxPop = hIdx('population'),
                idxName = headers.find(h => h === 'name' || h === '名稱'),
                idxDesc = headers.find(h => h === 'desc' || h === '描述'),
                idxMax = hIdx('max_count'),
                idxProd = hIdx('npc_production'), // ID 列表
                idxProdType = (hIdx('npc_production_type') !== -1) ? hIdx('npc_production_type') : headers.lastIndexOf('npc_production'),
                idxResourceValue = hIdx('resource_value');

            console.log(`[CSV載入] 建築配置欄位索引結果:`, { model: idxModel, type: idxType, prod: idxProd, prodType: idxProdType });

            // 轉換為 index (使用上方載入時定義的健壯版 hIdx)
            const nameIdx = headers.indexOf(idxName);
            const descIdx = headers.indexOf(idxDesc);

            const idxLv = hIdx('lv'),
                idxUnlock = hIdx('build_unlock'),
                idxUpgradeIngredients = hIdx('upgrade_need_ingredients'),
                idxUpgradeTimes = hIdx('upgrade_times');

            this.state.buildingConfigs = {}; // 舊格式相容 (儲存各 modellv1 作為基礎)
            this.state.buildingConfigsByType = {}; // 新增：按類型與等級分組

            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxModel]) continue;

                const model = row[idxModel].trim();
                const type = row[idxType] ? row[idxType].trim() : model;
                const lv = parseInt(row[idxLv]) || 1;

                // 解析生產清單
                let prodList = [];
                if (row[idxProd]) {
                    const clean = row[idxProd].replace(/[\{\}]/g, '');
                    if (clean) prodList = clean.split(',').map(s => s.trim());
                }

                const resValCosts = this.parseResourceCosts(row[idxResourceValue]);
                const cfg = {
                    name: (nameIdx !== -1 && row[nameIdx]) ? row[nameIdx].trim() : model,
                    desc: (descIdx !== -1 && row[descIdx]) ? row[descIdx].trim() : "",
                    model: model,
                    type: type,
                    lv: lv,
                    collision: row[idxCol] === '1',
                    size: row[idxSize] || "{1,1}",
                    population: parseInt(row[idxPop]) || 0,
                    costs: this.parseResourceCosts(row[idxUpgradeIngredients]),
                    maxCount: parseInt(row[idxMax]) || 999,
                    buildTime: parseFloat(row[idxUpgradeTimes]) || 5,
                    resourceValue: resValCosts.food || resValCosts.wood || resValCosts.stone || resValCosts.gold_ore || 0,
                    npcProduction: prodList,
                    productionMode: (row[idxProdType] || 'normal').toLowerCase().trim(),
                    // 升級與解鎖相關
                    buildUnlock: row[idxUnlock] || "{0}",
                    upgradeTime: parseFloat(row[idxUpgradeTimes]) || 0
                };

                // 按類型等級儲存
                if (!this.state.buildingConfigsByType[type]) this.state.buildingConfigsByType[type] = {};
                this.state.buildingConfigsByType[type][lv] = cfg;

                // 為了相容舊邏輯，buildingConfigs 以 model 為 key，但只存 LV1 (用於新蓋建築)
                if (lv === 1 || !this.state.buildingConfigs[model]) {
                    this.state.buildingConfigs[model] = cfg;
                }
            }
            this.addLog("建築配置表加載成功。");
        } catch (e) { console.error(e); }
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
            const bCfg = this.getBuildingConfig(building.type, building.lv || 1);
            if (bCfg && bCfg.productionMode === 'rand' && bCfg.npcProduction && bCfg.npcProduction.length > 0) {
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
            if (building.spawnIdx === undefined) building.spawnIdx = 0;
            const fp = GameEngine.getFootprint(building.type);
            const perimeter = 2 * (fp.uw + fp.uh) + 4;

            // [核心修復] 動態起始點：若設有集結點，尋找距離集結點最近的周長點作為起始索引
            let bestIdx = 0;
            if (building.rallyPoint) {
                let minDistSq = Infinity;
                for (let i = 0; i < perimeter; i++) {
                    const p = GameEngine.getBuildingPerimeterPos(building, i, 1);
                    const dSq = (p.x - building.rallyPoint.x) ** 2 + (p.y - building.rallyPoint.y) ** 2;
                    if (dSq < minDistSq) {
                        minDistSq = dSq;
                        bestIdx = i;
                    }
                }
            }

            const idx = bestIdx + building.spawnIdx;
            building.spawnIdx++;

            const currentIdx = idx % perimeter;
            const layer = Math.floor(idx / perimeter);
            const R = 1 + layer; // 距離邊緣的層數 (格)

            const pos = GameEngine.getBuildingPerimeterPos(building, currentIdx, R);
            spawnX = pos.x;
            spawnY = pos.y;
        }

        if (options && options.x !== undefined) spawnX = options.x;
        if (options && options.y !== undefined) spawnY = options.y;

        const v = {
            id: 'unit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
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
            attack_type: config.attack_type || 1,
            field_vision: (config.field_vision !== undefined) ? config.field_vision : 15,
            initiative_attack: (config.initiative_attack !== undefined) ? config.initiative_attack : 1,
            facing: 1, // 1: 右, -1: 左
            isPlayerLocked: false, // [新協定] 玩家指令鎖定旗標，啟動時屏蔽系統自動化
            // 物理碰撞尺寸 (寬, 高)
            width: config.pixel_size ? config.pixel_size.w : 20,
            height: config.pixel_size ? config.pixel_size.h : 20,
            produce_resource: config.produce_resource || null
        };

        // 根據陣營將單位推入對應的列表中 (村民 vs NPC/敵人)
        if (config.camp === 'enemy' || config.camp === 'neutral') {
            if (!this.state.units.npcs) this.state.units.npcs = [];
            this.state.units.npcs.push(v);
        } else {
            this.state.units.villagers.push(v);
        }

        // [集結點邏輯] 核心協定：新生單位優先執行建築物預設的集結指令（鎖定狀態），若無指令才進入自動分派
        if (building && building.rallyPoint) {
            const rp = building.rallyPoint;
            const isVillager = v.config.type === 'villagers';

            // 1. 尋找集結點鎖定的目標旗標實體
            let targetEnt = null;
            if (rp.targetId) {
                // [核心修正] 區分 網格型資源 (res_) 與 實體型資源 (corpse_ / buildings)
                if (rp.targetType === 'RESOURCE' && rp.targetId.startsWith('res_')) {
                    const parts = rp.targetId.split('_');
                    const gx = parseInt(parts[1]), gy = parseInt(parts[2]);
                    const res = this.state.mapData.getResource(gx, gy);
                    if (res && res.type !== 0) {
                        targetEnt = {
                            id: rp.targetId, gx, gy,
                            x: gx * this.TILE_SIZE + this.TILE_SIZE / 2,
                            y: gy * this.TILE_SIZE + this.TILE_SIZE / 2,
                            type: 'RESOURCE',
                            resourceType: ['NONE', 'WOOD', 'STONE', 'FOOD', 'GOLD'][res.type]
                        };
                    }
                } else {
                    // 從單位或地圖實體(包含屍體)中尋找
                    targetEnt = this.state.units.villagers.find(u => u.id === rp.targetId) ||
                        this.state.mapEntities.find(e => (e.id || `${e.type}_${e.x}_${e.y}`) === rp.targetId);
                }
            }

            // 2. 根據目標實體類型決定初始行為
            if (targetEnt && isVillager) {
                if (targetEnt.hp !== undefined) {
                    // [核心修正] 如果集結點鎖定的是單位 (無論敵友)，設為追隨/追擊模式
                    v.state = 'CHASE';
                    v.targetId = targetEnt.id;
                    v.isPlayerLocked = true;
                    const camp = targetEnt.camp || (targetEnt.config && targetEnt.config.camp) || 'player';
                    GameEngine.addLog(`[集結] 已鎖定目標 ${targetEnt.configName || '單位'}(${camp}) 進行追隨。`);
                } else if (targetEnt.isUnderConstruction) {
                    v.state = 'MOVING_TO_CONSTRUCTION';
                    v.constructionTarget = targetEnt;
                    v.isPlayerLocked = true;
                    GameEngine.addLog(`[集結] 已自動指派至建造任務。`);
                } else if (targetEnt.type === 'RESOURCE' || targetEnt.type === 'corpse') {
                    // [核心修正] 支援屍體集結連動
                    v.state = 'MOVING_TO_RESOURCE';
                    v.targetId = targetEnt;
                    v.type = targetEnt.resourceType || targetEnt.resType; // 核心支援不同欄位名
                    v.isPlayerLocked = true;
                    GameEngine.addLog(`[集結] 已自動指派至採集 ${targetEnt.name || '資源'}。`);
                } else if (['farmland', 'tree_plantation'].includes(targetEnt.type)) {
                    v.state = 'MOVING_TO_RESOURCE';
                    v.targetId = targetEnt;
                    v.type = (targetEnt.type === 'farmland' ? 'FOOD' : 'WOOD');
                    v.isPlayerLocked = true;
                    GameEngine.addLog(`[集結] 已加入資源田作業。`);
                } else if (['timber_factory', 'stone_factory', 'barn', 'gold_mining_factory'].includes(targetEnt.type)) {
                    // [核心修復] 先設定歸屬，再增加需求，確保自動化邏輯不會搶先指派其它人。
                    v.assignedWarehouseId = targetEnt.id || `${targetEnt.type}_${targetEnt.x}_${targetEnt.y}`;
                    this.adjustWarehouseWorkers(targetEnt, 1);
                    v.type = (targetEnt.type === 'timber_factory' ? 'WOOD' :
                        (targetEnt.type === 'stone_factory' ? 'STONE' :
                            (targetEnt.type === 'barn' ? 'FOOD' : 'GOLD')));
                    v.state = 'MOVING_TO_RESOURCE';
                    v.isPlayerLocked = true; // [核心修復] 鎖定狀態防止出生瞬間被 assignNextTask 覆蓋
                    GameEngine.addLog(`[集結] 已加入 ${targetEnt.name || targetEnt.type} 採集隊列。`);
                } else if (targetEnt.hp !== undefined && (targetEnt.config.camp === 'enemy' || targetEnt.camp === 'enemy')) {
                    v.state = 'CHASE';
                    v.targetId = targetEnt.id;
                    v.isPlayerLocked = true;
                    GameEngine.addLog(`[集結] 正在追擊鎖定的敵軍！`);
                } else {
                    v.idleTarget = this.findAvailableRallySpot(rp);
                    v._isRallyMovement = true;
                }
            } else if (targetEnt && !isVillager) {
                const targetCamp = (targetEnt.config && targetEnt.config.camp) || targetEnt.camp || 'neutral';
                if (targetEnt.hp !== undefined && (targetCamp === 'enemy' || targetCamp === 'neutral')) {
                    v.state = 'CHASE';
                    v.targetId = targetEnt.id;
                    GameEngine.addLog(`[集結] 戰鬥單位正在攻擊目標 (${targetCamp === 'neutral' ? '中立物種' : '敵對目標'})！`);
                } else {
                    v.idleTarget = this.findAvailableRallySpot(rp);
                    v._isRallyMovement = true;
                }
            } else {
                const spot = this.findAvailableRallySpot(rp);
                v.idleTarget = spot;
                v._isRallyMovement = true;
            }
        }

        // 僅在無明確集結指令時，才進入自動分派系統
        if (v.state === 'IDLE' && v.config.type === 'villagers') {
            this.assignNextTask(v);
        }
        return true;
    }

    /**
     * [核心協定] 在集結點周圍尋找空位 (優先填充中心)
     * @param {Object} rallyPoint 原始集結點座標
     */
    static findAvailableRallySpot(rallyPoint) {
        const spacing = 25;
        const goldenAngle = 137.508 * (Math.PI / 180);
        const claimedSpots = [];

        // 1. 收集所有相關單位的目標或現有位置
        this.state.units.villagers.forEach(v => {
            if (v._isRallyMovement && v.idleTarget) {
                // 如果目標點就在這個集結點附近，視為已佔用
                if (Math.hypot(v.idleTarget.x - rallyPoint.x, v.idleTarget.y - rallyPoint.y) < 200) {
                    claimedSpots.push(v.idleTarget);
                }
            } else if (v.state === 'IDLE' && !v.idleTarget) {
                // 如果已經停在這個集結點附近，也視為已佔用
                if (Math.hypot(v.x - rallyPoint.x, v.y - rallyPoint.y) < 150) {
                    claimedSpots.push({ x: v.x, y: v.y });
                }
            }
        });

        // 2. 從中心向外依照螺旋尋找第一個空位
        for (let idx = 0; idx < 100; idx++) {
            const r = spacing * Math.sqrt(idx);
            const theta = idx * goldenAngle;
            const tx = rallyPoint.x + Math.cos(theta) * r;
            const ty = rallyPoint.y + Math.sin(theta) * r;

            // 判點此位置是否與已有單位重疊 (判定半徑略小於 spacing 以保持緊湊)
            const isOccupied = claimedSpots.some(s => Math.hypot(s.x - tx, s.y - ty) < 18);
            if (!isOccupied) return { x: tx, y: ty };
        }
        return { x: rallyPoint.x, y: rallyPoint.y };
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

    /**
     * [核心協議] 獲取建築周邊指定索引的物理座標
     * @param {Object} building 建築實體
     * @param {number} currentIdx 周長索引 (0 ~ perimeter-1)
     * @param {number} R 擴展層數 (1 為緊貼建築邊緣外一圈)
     */
    static getBuildingPerimeterPos(building, currentIdx, R = 1) {
        const fp = GameEngine.getFootprint(building.type);
        const uw = fp.uw, uh = fp.uh;
        const TS = this.TILE_SIZE;
        let tx, ty;

        // [核心修復] 週邊座標計算應以「物理中心」為準 (考慮 feetOffset)，確保生成的單位不會壓在碰撞盒邊界上導致移動失敗
        const collCfg = UI_CONFIG.BuildingCollision || { buffer: 10, feetOffset: 8 };
        const footY = collCfg.feetOffset || 0;

        // 順序：下邊(左->右)、右邊(下->上)、上邊(右->左)、左邊(上->下)
        if (currentIdx <= uw + 1) {
            let k = currentIdx;
            tx = k - (uw + 1) / 2;
            ty = (uh + 2 * R - 1) / 2;
        } else if (currentIdx <= (uw + 1) + (uh + 1)) {
            let k = currentIdx - (uw + 1);
            tx = (uw + 2 * R - 1) / 2;
            ty = (uh + 1) / 2 - k;
        } else if (currentIdx <= (uw + 1) + (uh + 1) + (uw + 1)) {
            let k = currentIdx - (uw + 1 + uh + 1);
            tx = (uw + 1) / 2 - k;
            ty = -(uh + 2 * R - 1) / 2;
        } else {
            let k = currentIdx - (uw + 1 + uh + 1 + uw + 1);
            tx = -(uw + 2 * R - 1) / 2;
            ty = -(uh + 1) / 2 + k;
        }
        return { x: building.x + tx * TS, y: building.y - footY + ty * TS };
    }

    static getBuildingConfig(type, lv) {
        if (!this.state.buildingConfigsByType || !this.state.buildingConfigsByType[type]) return null;
        return this.state.buildingConfigsByType[type][lv] || null;
    }

    static isUpgradeUnlocked(entity, nextCfg) {
        if (!nextCfg) return { unlocked: false, reason: "已達最高等級", requirement: null };
        const unlockStr = nextCfg.buildUnlock;
        if (!unlockStr || unlockStr === "{0}") return { unlocked: true, requirement: null };

        // 解析 {village.lv=2}
        const match = unlockStr.match(/\{([^.]+)\.lv=(\d+)\}/);
        if (match) {
            const targetType = match[1];
            const targetLv = parseInt(match[2]);
            // 檢查我方是否已有該等級的建築
            const hasRequirement = this.state.mapEntities.some(ent => {
                const entType = ent.type;
                // [修復] 只要目前等級夠，不論是否正在升級都算符合條件
                return entType === targetType && ent.lv >= targetLv && !ent.isUnderConstruction;
            });

            const reqText = `需 ${this.state.buildingConfigs[targetType]?.name || targetType} ${targetLv} 級`;
            return {
                unlocked: hasRequirement,
                reason: hasRequirement ? "" : reqText,
                requirement: { text: reqText, satisfied: hasRequirement }
            };
        }
        return { unlocked: true, requirement: null };
    }

    static startUpgrade(event, entity) {
        if (event && event.stopPropagation) event.stopPropagation();
        if (entity.isUpgrading || entity.isUnderConstruction) return;

        const currentCfg = this.getBuildingConfig(entity.type, entity.lv);
        const nextCfg = this.getBuildingConfig(entity.type, entity.lv + 1);

        if (!nextCfg) {
            this.addLog("已達最高等級！");
            return;
        }

        const unlockStatus = this.isUpgradeUnlocked(entity, nextCfg);
        if (!unlockStatus.unlocked) {
            this.addLog(`未滿足升級條件：${unlockStatus.reason}`);
            return;
        }

        // 檢查資源 (使用下一等級的 cost)
        const nextCosts = nextCfg.costs || {};
        for (let r in nextCosts) {
            const cost = nextCosts[r];
            if ((this.state.resources[r] || 0) < cost) {
                this.triggerWarning("1", [r.toUpperCase()]);
                return;
            }
        }

        // 扣除資源
        for (let r in nextCosts) {
            this.state.resources[r] -= nextCosts[r];
        }

        entity.isUpgrading = true;
        entity.upgradeProgress = 0;
        entity.upgradeTime = nextCfg.upgradeTime || 10;
        this.addLog(`開始升級 ${currentCfg.name} 到 ${entity.lv + 1} 級，預計耗時 ${entity.upgradeTime} 秒。`);
        if (window.UIManager) {
            window.UIManager.updateValues(true);
            window.UIManager.showContextMenu(entity);
        }
    }

    static cancelUpgrade(event, entity) {
        if (event && event.stopPropagation) event.stopPropagation();
        if (!entity || !entity.isUpgrading) return;

        // 返還資源 (100% 返還)
        const nextCfg = this.getBuildingConfig(entity.type, entity.lv + 1);
        const costs = nextCfg?.costs || {};
        for (let r in costs) {
            if (this.state.resources.hasOwnProperty(r)) {
                this.state.resources[r] += costs[r];
            }
        }

        entity.isUpgrading = false;
        entity.upgradeProgress = 0;

        this.addLog(`${currentCfg.name || entity.type} 升級已取消，資源已退還。`);
        if (window.UIManager) {
            window.UIManager.showWarning("升級已取消，資源已全額退還");
            window.UIManager.showContextMenu(entity);
        }
    }

    static getMaxPopulation() {
        let total = 0;
        this.state.mapEntities.forEach(ent => {
            if (ent.isUnderConstruction) return;
            // 升級中的建築依然提供人口上限？通常是。
            const cfg = this.getBuildingConfig(ent.type, ent.lv);
            if (cfg && cfg.population) total += cfg.population;
        });
        return total || 5;
    }

    /**
     * 計算當前我方陣營總佔用人口 (排除敵方與中立單位)
     */
    static getCurrentPopulation() {
        if (!this.state.units || !this.state.units.villagers) return 0;
        let pop = 0;
        const list = this.state.units.villagers;
        for (let i = 0; i < list.length; i++) {
            const v = list[i];
            if (v && v.config && v.config.camp === 'player') {
                // 強制轉換為數字，防止 CSV 讀取時產生的潛在字串加法問題
                const p = parseInt(v.config.population) || 1;
                pop += p;
            }
        }
        return pop;
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
        const mapOffset = { x: minGX, y: minGY };
        this.state.mapOffset = mapOffset;

        // 初始化 大地圖數據系統 (Uint16Array)
        this.state.mapData = new MapDataSystem(cols, rows, mapOffset);

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
            model: 'village',
            type: 'village',
            lv: 1,
            x: villagePos.x, y: villagePos.y, name: villageCfg.name || "城鎮中心", queue: [], productionTimer: 0
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

        // 4. 依序放置各類資源 (寫入 TypedArray)
        if (this.state.resourceConfigs.length > 0) {
            this.state.resourceConfigs.forEach(cfg => {
                let count = 0;
                const fp = getFootprint(cfg.model);
                const resCfg = UI_CONFIG.ResourceRenderer;

                // 資源模型映射 (1: Tree, 2: Stone, 3: Food/Fruit, 4: Gold, 5: Iron, 6: Coal...)
                let typeNum = 0;
                const upperType = (cfg.type || "").toUpperCase();
                if (upperType === 'SCENE_WOOD') typeNum = 1;
                else if (upperType === 'SCENE_STONE') typeNum = 2;
                else if (upperType === 'SCENE_FRUIT') typeNum = 3;
                else if (upperType === 'SCENE_GOLD_MINE' || upperType === 'SCENE_GOLD_ORE') typeNum = 4;
                else if (upperType === 'SCENE_IRON_MINE' || upperType === 'SCENE_IRON_ORE') typeNum = 5;
                else if (upperType === 'SCENE_COAL_MINE' || upperType === 'SCENE_COAL_ORE' || upperType === 'SCENE_COAL') typeNum = 6;
                else if (upperType === 'SCENE_MAGIC_HERB') typeNum = 7;
                else if (upperType === 'SCENE_WOLF_CORPSE') typeNum = 8;
                else if (upperType === 'SCENE_BEAR_CORPSE') typeNum = 9;
                else if (upperType === 'SCENE_CRYSTAL_MINE' || upperType === 'SCENE_CRYSTAL_ORE') typeNum = 10;
                else if (upperType === 'SCENE_COPPER_MINE' || upperType === 'SCENE_COPPER_ORE') typeNum = 11;
                else if (upperType === 'SCENE_SILVER_MINE' || upperType === 'SCENE_SILVER_ORE') typeNum = 12;
                else if (upperType === 'SCENE_MITHRIL_MINE' || upperType === 'SCENE_MITHRIL_ORE') typeNum = 13;

                for (let i = 0; i < pool.length && count < cfg.density; i++) {
                    const { gx, gy } = pool[i];
                    if (checkOccupiedG(gx, gy, fp.uw, fp.uh)) continue;

                    const w = fp.uw * TS, h = fp.uh * TS;
                    const x = gx * TS + w / 2;
                    const y = gy * TS + h / 2;

                    // 安全區檢查 (根據 no_resources_range 參數)
                    if (Math.abs(x - villagePos.x) < safeCfg.w / 2 && Math.abs(y - villagePos.y) < safeCfg.h / 2) continue;

                    // 記錄資源至 MapDataSystem (取代 mapEntities 物件)
                    this.state.mapData.setResource(gx, gy, typeNum, cfg.amount, cfg.lv || 1);

                    // 儲存視覺變量 (Tint/ScaleIndex)
                    let vTint = 0xffffff;
                    let vScale = 100; // 1.0 進位縮放 (用 8bit 存)
                    let varCfg = null;
                    const uType = (cfg.type || "").toUpperCase();
                    if (uType === 'SCENE_WOOD') varCfg = resCfg.Tree.visualVariation;
                    else if (uType === 'SCENE_STONE') varCfg = resCfg.Rock.visualVariation;
                    else if (uType === 'SCENE_FRUIT') varCfg = resCfg.BerryBush.visualVariation;
                    else if (uType === 'SCENE_GOLD_MINE' || uType === 'SCENE_GOLD_ORE') varCfg = resCfg.GoldMine.visualVariation;
                    else if (uType === 'SCENE_IRON_MINE' || uType === 'SCENE_IRON_ORE') varCfg = resCfg.IronMine.visualVariation;
                    else if (uType === 'SCENE_COAL_MINE' || uType === 'SCENE_COAL_ORE' || uType === 'SCENE_COAL') varCfg = resCfg.CoalMine.visualVariation;
                    else if (uType === 'SCENE_MAGIC_HERB') varCfg = resCfg.RareHerb.visualVariation;
                    else if (uType === 'SCENE_WOLF_CORPSE') varCfg = resCfg.WolfCorpse.visualVariation;
                    else if (uType === 'SCENE_BEAR_CORPSE') varCfg = resCfg.BearCorpse.visualVariation;
                    else if (uType === 'SCENE_CRYSTAL_MINE' || uType === 'SCENE_CRYSTAL_ORE') varCfg = resCfg.CrystalMine.visualVariation;
                    else if (uType === 'SCENE_COPPER_MINE' || uType === 'SCENE_COPPER_ORE') varCfg = resCfg.CopperMine.visualVariation;
                    else if (uType === 'SCENE_SILVER_MINE' || uType === 'SCENE_SILVER_ORE') varCfg = resCfg.SilverMine.visualVariation;
                    else if (uType === 'SCENE_MITHRIL_MINE' || uType === 'SCENE_MITHRIL_ORE') varCfg = resCfg.MithrilMine.visualVariation;

                    if (varCfg) {
                        const brightness = 1.0 - (Math.random() * varCfg.tintRange);
                        const c = Math.floor(255 * brightness);
                        vTint = (c << 16) | (c << 8) | c;

                        // 計算隨機縮放 (minScale ~ maxScale)
                        const randomScale = varCfg.minScale + Math.random() * (varCfg.maxScale - varCfg.minScale);
                        vScale = Math.floor(randomScale * 100);
                    }

                    const idx = this.state.mapData.getIndex(gx, gy);
                    if (idx !== -1) {
                        // 存入 Tint (24bit) 與 ScaleFactor (8bit)
                        // vScale 最大 255 (即 2.55倍)，一般夠用
                        this.state.mapData.variationGrid[idx] = (vScale << 24) | vTint;
                    }

                    markOccupiedG(gx, gy, fp.uw, fp.uh);
                    count++;
                }
                console.log(`地圖生成 - ${cfg.name} 成功放置: ${count}/${cfg.density} (存入 TypedArray)`);
            });
        }

        // 5. 隨機生成野外敵人與中立生物 (enemy1, enemy2, neutral1) - 使用高效的網格採樣演算法
        ['enemy1', 'enemy2', 'neutral1'].forEach(npcKey => {
            const configTriplet = this.state.systemConfig[npcKey];
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

                    // 1b. 資源網格檢查：確認該格沒有資源節點 (樹木、石頭等)
                    if (this.state.mapData) {
                        const resData = this.state.mapData.getResource(gx, gy);
                        if (resData && resData.type !== 0) continue;
                    }

                    // 2. 同 ID 敵人間距檢查 (查閱 proximityGrid)
                    const pIdx = getIdx(gx, gy);
                    if (pIdx === -1 || proximityGrid[pIdx] === 1) continue;

                    const x = gx * TS + TS / 2;
                    const y = gy * TS + TS / 2;

                    // 3. 安全區檢查 (避免離村莊中心太近)
                    const npcSafe = this.state.systemConfig.no_npc_range || 300;
                    const distCheck = typeof npcSafe === 'object' ?
                        (Math.abs(x - villagePos.x) < npcSafe.w / 2 && Math.abs(y - villagePos.y) < npcSafe.h / 2) :
                        (Math.hypot(x - villagePos.x, y - villagePos.y) < npcSafe);

                    if (distCheck) continue;

                    // 4. 額外檢查：確保周圍至少有一格可行走（不會被完全包圍而無法閒逛）
                    let hasWalkableNeighbor = false;
                    for (let dx = -1; dx <= 1 && !hasWalkableNeighbor; dx++) {
                        for (let dy = -1; dy <= 1 && !hasWalkableNeighbor; dy++) {
                            if (dx === 0 && dy === 0) continue;
                            const nx = gx + dx, ny = gy + dy;
                            if (!checkOccupiedG(nx, ny, 1, 1)) {
                                const nRes = this.state.mapData ? this.state.mapData.getResource(nx, ny) : null;
                                if (!nRes || nRes.type === 0) hasWalkableNeighbor = true;
                            }
                        }
                    }
                    if (!hasWalkableNeighbor) continue;

                    // 正式產出
                    this.spawnNPC(npcID, null, { x, y });

                    // 標記間距範圍 (以當前點為中心，半徑為 minInterval 的區域)
                    // [使用者要求] 維持格數單位進行計算
                    const r = Math.ceil(minInterval);
                    if (r > 0) {
                        const r2 = r * r;
                        for (let dy = -r; dy <= r; dy++) {
                            const ny = gy + dy;
                            if (ny < minGY || ny >= minGY + rows) continue;
                            for (let dx = -r; dx <= r; dx++) {
                                const nx = gx + dx;
                                if (nx >= minGX && nx < minGX + cols) {
                                    const distSq = (dx * dx + dy * dy);
                                    if (distSq <= r2) {
                                        const nIdx = getIdx(nx, ny);
                                        if (nIdx !== -1) proximityGrid[nIdx] = 1;
                                    }
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

        // 1. 注入建築物碰撞 (mapEntities)
        this.state.mapEntities.forEach(ent => {
            if (ent.isUnderConstruction) return;
            const cfg = this.getEntityConfig(ent.type);
            if (cfg && cfg.collision) {
                const em = cfg.size ? cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/) : null;
                const uw = em ? parseInt(em[1]) : 1, uh = em ? parseInt(em[2]) : 1;

                // 計算左上角座標
                // 正確計算：封鎖建築物理邊界所碰觸到的「所有」格位
                // 核心優化：從 UI_CONFIG 讀取緩衝值，避免單位中心點停在邊緣時視覺重疊
                const collCfg = UI_CONFIG.BuildingCollision || { buffer: 10, feetOffset: 8 };
                // 核心同步：確保尋路格網的封鎖範圍與物理碰撞 (isColliding) 一致
                // 使用玩家設置的碰撞寬度 10px (worker 寬度) 作為計算基準
                const unitWidthDefault = 10;
                const effBuffer = Math.max(unitWidthDefault / 2, (collCfg.buffer || 0) / 2);
                const bWidth = uw * TS + effBuffer * 2, bHeight = uh * TS + effBuffer * 2;

                const minX = ent.x - bWidth / 2, minY = ent.y - bHeight / 2;
                const maxX = ent.x + bWidth / 2, maxY = ent.y + bHeight / 2;

                const offset = this.state.mapOffset || { x: 0, y: 0 };
                const FOOT_OFFSET = collCfg.feetOffset || 8;
                // 寬鬆係數 (shrink)：數值越大，寻路越寬鬆。設為 6 可確保在 10px buffer 下仍能穿過 1 格寬的空隙
                const shrink = 6;
                const gx1 = Math.max(0, Math.floor((minX + shrink) / TS) - offset.x);
                const gy1 = Math.max(0, Math.floor((minY - FOOT_OFFSET + shrink) / TS) - offset.y);
                const gx2 = Math.min(cols - 1, Math.floor((maxX - shrink - 0.1) / TS) - offset.x);
                const gy2 = Math.min(rows - 1, Math.floor((maxY - FOOT_OFFSET - shrink - 0.1) / TS) - offset.y);

                for (let tx = gx1; tx <= gx2; tx++) {
                    for (let ty = gy1; ty <= gy2; ty++) {
                        if (ty >= 0 && ty < rows && tx >= 0 && tx < cols) matrix[ty][tx] = 1;
                    }
                }
            }
        });

        // 2. 注入資源碰撞 (MapDataSystem)
        if (this.state.mapData) {
            const typeMap = { 
                1: 'SCENE_WOOD', 
                2: 'SCENE_STONE', 
                3: 'SCENE_FRUIT', 
                4: 'SCENE_GOLD_MINE',
                5: 'SCENE_IRON_MINE',
                6: 'SCENE_COAL_MINE',
                7: 'SCENE_MAGIC_HERB',
                8: 'SCENE_WOLF_CORPSE',
                9: 'SCENE_BEAR_CORPSE',
                10: 'SCENE_CRYSTAL_MINE',
                11: 'SCENE_COPPER_MINE',
                12: 'SCENE_SILVER_MINE',
                13: 'SCENE_MITHRIL_MINE'
            };
            for (let i = 0; i < this.state.mapData.totalTiles; i++) {
                const typeNum = this.state.mapData.typeGrid[i];
                if (typeNum !== 0) {
                    const level = this.state.mapData.levelGrid[i] || 1;
                    const typeName = typeMap[typeNum];
                    // 根據型別與等級尋找配置
                    const cfg = this.state.resourceConfigs.find(c => c.type === typeName && c.lv === level);

                    const gx = i % this.state.mapData.cols;
                    const gy = Math.floor(i / this.state.mapData.cols);

                    if (cfg && cfg.pixel_size) {
                        const rx = gx * TS + TS / 2, ry = gy * TS + TS / 2;
                        const pw = cfg.pixel_size.w, ph = cfg.pixel_size.h;

                        // 計算受影響的格位範圍 (基於視覺中心)
                        const minGx = Math.floor((rx - pw / 2) / TS);
                        const maxGx = Math.floor((rx + pw / 2 - 0.1) / TS);
                        const minGy = Math.floor((ry - ph / 2) / TS);
                        const maxGy = Math.floor((ry + ph / 2 - 0.1) / TS);

                        for (let ty = minGy; ty <= maxGy; ty++) {
                            for (let tx = minGx; tx <= maxGx; tx++) {
                                if (ty >= 0 && ty < rows && tx >= 0 && tx < cols) {
                                    matrix[ty][tx] = 1;
                                }
                            }
                        }
                    } else {
                        matrix[gy][gx] = 1;
                    }
                }
            }
        }

        this.state.pathfinding.setGrid(matrix);

        // 核心要求：網格更新後，所有正在移動中的單位必須重新計算路徑，以避開剛生成的建築
        const allUnitsForPath = [...this.state.units.villagers, ...(this.state.units.npcs || [])];
        allUnitsForPath.forEach(v => {
            v.fullPath = null;
            v.pathIndex = 0;
            v.isFindingPath = false; // [修復] 同步重置尋路狀態，防止單位因 isFindingPath 鎖死而維持直線行走
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

    // --- 子系統代理方法 (Proxies) ---
    // 保持原有 API 名稱，內部調用實例化的子系統

    static updateVillagerMovement(v, dt) {
        if (this.workerSystem) this.workerSystem.updateVillagerMovement(v, dt);
    }


    static restoreVillagerTask(v) {
        if (this.workerSystem) this.workerSystem.restoreVillagerTask(v);
    }

    static assignNextTask(v, keepCurrentIfNoneFound = false) {
        if (this.workerSystem) this.workerSystem.assignNextTask(v, keepCurrentIfNoneFound);
    }


    /**
     * [核心修復] 讓工人在當前工地完成後，自動尋找下一個可連動的建設工地。
     * 支援多人協作，確保選中的工人群組能集體移動並分攤接下來的建設任務 (Chain-tasking)。
     */
    static assignNextConstructionTask(v) {
        return this.workerSystem ? this.workerSystem.assignNextConstructionTask(v) : false;
    }


    // 存放點查詢已遷移至 ResourceSystem.findNearestDepositPoint
    static findNearestDepositPoint(x, y, resourceType = 'WOOD') {
        return ResourceSystem.findNearestDepositPoint(this.state, x, y, resourceType);
    }

    /**
     * 執行路徑移動邏輯 (非同步尋路)
     * 根據核心協議：效能優化與穩定優先，避免每幀重複 new 物件
     */
    static moveDetailed(v, tx, ty, speed, dt, ignoreEnts = []) {
        if (this.workerSystem) this.workerSystem.moveDetailed(v, tx, ty, speed, dt, ignoreEnts);
    }

    static resolveStuck(v) {
        if (this.workerSystem) this.workerSystem.resolveStuck(v);
    }

    static moveTowards(v, tx, ty, speed, dt, ignoreEnts = []) {
        if (this.workerSystem) this.workerSystem.moveTowards(v, tx, ty, speed, dt, ignoreEnts);
    }


    // 已刪除 BFS 版 findNextStep


    // 已刪除原有的 getObstacleGrid


    /**
     * 精確碰撞偵測 (Physics Collision Check)
     * @param {number} x
     * @param {number} y
     * @param {Array} ignoreEnts
     * @param {number} unitW 單位寬度 (像素)
     * @param {number} unitH 單位高度 (像素)
     */
    static isColliding(x, y, ignoreEnts = [], unitW = 0, unitH = 0) {
        return this.workerSystem ? this.workerSystem.isColliding(x, y, ignoreEnts, unitW, unitH) : null;
    }


    static isAreaClear(x, y, type, tempEntities = []) {
        const cfg = this.getEntityConfig(type);
        if (!cfg) return true;
        const match = cfg.size ? cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/) : null;
        const uw = match ? parseInt(match[1]) : 1, uh = match ? parseInt(match[2]) : 1;
        const w = uw * this.TILE_SIZE, h = uh * this.TILE_SIZE;

        // 1. 檢查建築與實體碰撞
        const allToCheck = [...this.state.mapEntities, ...tempEntities];
        const hitEntity = allToCheck.some(ent => {
            const ecfg = this.getEntityConfig(ent.type, ent.lv || 1);
            let ew = this.TILE_SIZE, eh = this.TILE_SIZE;
            if (ecfg) {
                const em = ecfg.size ? ecfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/) : null;
                ew = em ? parseInt(em[1]) * this.TILE_SIZE : this.TILE_SIZE;
                eh = em ? parseInt(em[2]) * this.TILE_SIZE : this.TILE_SIZE;
            }
            return Math.abs(x - ent.x) < (w + ew) / 2 - 5 && Math.abs(y - ent.y) < (h + eh) / 2 - 5;
        });
        if (hitEntity) return false;

        // 2. 檢查資源碰撞 (MapDataSystem)
        if (this.state.mapData) {
            const TS = this.TILE_SIZE;
            const startGX = Math.floor((x - w / 2 + 5) / TS);
            const endGX = Math.floor((x + w / 2 - 5) / TS);
            const startGY = Math.floor((y - h / 2 + 5) / TS);
            const endGY = Math.floor((y + h / 2 - 5) / TS);

            const typeMap = { 
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
            for (let gy = startGY; gy <= endGY; gy++) {
                for (let gx = startGX; gx <= endGX; gx++) {
                    const res = this.state.mapData.getResource(gx, gy);
                    if (res && res.amount > 0) {
                        const typeName = typeMap[res.type];
                        const rcfg = this.state.resourceConfigs.find(c => c.type === typeName && c.lv === (res.level || 1));

                        // 如果資源有定義 pixel_size，進行精確碰撞檢查
                        if (rcfg && rcfg.pixel_size) {
                            const rx = gx * TS + TS / 2, ry = gy * TS + TS / 2;
                            const rw = rcfg.pixel_size.w, rh = rcfg.pixel_size.h;
                            if (Math.abs(x - rx) < (w + rw) / 2 - 5 && Math.abs(y - ry) < (h + rh) / 2 - 5) {

                                return false;
                            }
                        } else {
                            // 預設佔用整格格子
                            return false;
                        }
                    }
                }
            }
        }

        return true;
    }

    // 資源搜尋已遷移至 ResourceSystem.findNearestResource
    static findNearestResource(x, y, typeOrName, villagerId) {
        return ResourceSystem.findNearestResource(this.state, this.TILE_SIZE, x, y, typeOrName, villagerId);
    }

    /**
     * [核心協定] 尋找最適合的建設工地 (智慧分配系統)
     * @param {Object} v 單位物件
     * @param {Array} projects 待建工地列表 (已排序)
     */
    static findBestConstructionProject(v, projects) {
        return this.workerSystem ? this.workerSystem.findBestConstructionProject(v, projects) : null;
    }



    static updateWorkerAssignments() {
        if (this.workerSystem) this.workerSystem.updateWorkerAssignments();
    }


    static adjustWarehouseWorkers(entity, delta) {
        if (this.workerSystem) this.workerSystem.adjustWarehouseWorkers(entity, delta);
    }


    // 資源存款已遷移至 ResourceSystem.depositResource
    static depositResource(type, amount) {
        ResourceSystem.depositResource(this.state, type, amount, this.addLog.bind(this));
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

        // 取得主要建築實體 (如果是從 UI 點擊)
        const activeBuilding = sourceBuilding || (window.UIManager && window.UIManager.activeMenuEntity);
        if (!activeBuilding || !activeBuilding.queue) {
            this.addLog("此建築無法生產單位！");
            return;
        }

        // 判斷是否為多選模式且選中多個同類型建築
        const isMultiSelect = this.state.selectedBuildingIds && this.state.selectedBuildingIds.length > 1;
        let targets = [activeBuilding];

        if (isMultiSelect) {
            targets = this.state.mapEntities.filter(e =>
                this.state.selectedBuildingIds.includes(e.id || `${e.type}_${e.x}_${e.y}`) &&
                e.type === activeBuilding.type &&
                !e.isUnderConstruction
            );
        }

        // 對每個目標建築執行生產邏輯
        targets.forEach(target => {
            this._executeSingleProduction(configName, target);
        });

        if (window.UIManager) window.UIManager.updateValues(true);
    }

    /**
     * 執行單一建築的生產指令
     * 會根據建築等級自動匹配對應的單位等級
     */
    static _executeSingleProduction(clickedConfigId, building) {
        if (!building || !building.queue) return;

        if (building.queue.length >= 10) {
            this.addLog(`${building.name} 的生產隊伍已滿 (10/10)！`);
            return;
        }

        // [關鍵] 根據建築等級調整產出的單位編號 (例如 A 生產 Lv1, B 生產 Lv2)
        const finalConfigId = this.resolveAppropriateUnitId(clickedConfigId, building);

        // 檢查該建築是否真的被允許生產此單位 (或此種類型)
        const bCfg = this.getBuildingConfig(building.type, building.lv || 1);
        if (!bCfg || !bCfg.npcProduction) return;

        // 如果不是 RANDOM，則檢查 finalConfigId 是否在該等級建築的產出清單中
        if (finalConfigId !== 'RANDOM') {
            const finalCfg = this.state.npcConfigs[finalConfigId] || this.state.npcConfigs[this.state.idToNameMap[finalConfigId]];
            const finalType = finalCfg ? finalCfg.type : null;

            const isAllowed = bCfg.npcProduction.some(id => {
                const name = this.state.idToNameMap[id] || id;
                const cfg = this.state.npcConfigs[name] || this.state.npcConfigs[id];
                return id == finalConfigId || (cfg && finalType && cfg.type === finalType);
            });
            if (!isAllowed) {
                console.warn(`[生產跳過] ${building.name} (Lv.${building.lv}) 不支援生產 ${finalConfigId} (類型: ${finalType})`);
                return;
            }
        }

        // 檢查資源成本
        let costConfigId = finalConfigId;
        if (finalConfigId === 'RANDOM') {
            costConfigId = bCfg.npcProduction[0];
        }

        let cfg = this.state.npcConfigs[costConfigId] || this.state.npcConfigs[this.state.idToNameMap[costConfigId]];
        if (!cfg) {
            console.error(`[生產] 找不到配置 (用於計費): ${costConfigId}`);
            return;
        }

        if (cfg.costs) {
            for (let r in cfg.costs) {
                const cost = cfg.costs[r];
                if (cost > 0) {
                    const current = this.state.resources[r.toLowerCase()] || 0;
                    if (current < cost) {
                        this.triggerWarning("1", [r.toUpperCase()]);
                        return; // 只要有一項不夠就停止該建築生產
                    }
                }
            }
            // 扣錢
            for (let r in cfg.costs) {
                const cost = cfg.costs[r];
                if (cost > 0) {
                    this.state.resources[r.toLowerCase()] -= cost;
                }
            }
        }

        building.queue.push(finalConfigId);
        if (building.queue.length === 1 && (building.productionTimer || 0) <= 0) {
            building.productionTimer = 5;
        }
        this.addLog(`${building.name} 加入生產隊列：${finalConfigId} (${building.queue.length}/10)`);
    }

    /**
     * 根據建築等級解析最適合的單位 ID
     * 邏輯：找到與 clickedConfigId 同類型且等級不高於建築等級的最高級單位
     */
    static resolveAppropriateUnitId(clickedId, building) {
        // 先獲取原始點擊單位的配置，以得知其「類型」 (swordsman, mage, etc.)
        let baseCfg = this.state.npcConfigs[clickedId];
        if (!baseCfg) {
            const name = this.state.idToNameMap[clickedId];
            if (name) baseCfg = this.state.npcConfigs[name];
        }

        if (!baseCfg || clickedId === 'RANDOM') return clickedId;

        const unitType = baseCfg.type;
        const bLv = building.lv || 1;

        // 在所有 NPC 配置中尋找：
        // 1. 類型相同
        // 2. 等級 <= 建築等級
        // 3. 取等級最高的一個
        let bestId = clickedId;
        let bestLv = baseCfg.lv || 1;

        for (const name in this.state.npcConfigs) {
            const cfg = this.state.npcConfigs[name];
            if (cfg.type === unitType && cfg.lv <= bLv) {
                if (cfg.lv > bestLv) {
                    bestLv = cfg.lv;
                    bestId = cfg.id || name;
                }
            }
        }

        return bestId;
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
            if ((this.state.resources[r] || 0) < cfg.costs[r]) {
                this.triggerWarning("1", [r.toUpperCase()]);
                return false;
            }
        }
        if (!this.isAreaClear(x, y, type)) { this.addLog("位置受阻！"); return false; }

        // 扣額
        for (let r in cfg.costs) {
            if (this.state.resources.hasOwnProperty(r)) {
                this.state.resources[r] -= cfg.costs[r];
            }
        }

        const newBuilding = {
            id: `build_${type}_${x}_${y}_${Date.now()}`,
            model: cfg.model,
            type: cfg.type,
            lv: cfg.lv || 1,
            x: x, y: y, name: "待施工",
            isUnderConstruction: true, buildProgress: 0,
            buildTime: Math.max(1, cfg.buildTime || 5), // 防止 0 或 NaN
            amount: cfg.resourceValue || 0,
            maxAmount: cfg.resourceValue || 0,
            isResource: (type === 'farmland' || type === 'tree_plantation'),
            targetWorkerCount: (type === 'farmland' || type === 'tree_plantation') ? 1 : (['timber_factory', 'stone_factory', 'barn', 'quarry', 'gold_mining_factory'].includes(type) ? 1 : 0),
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

        // [新協定] 既然是「先選人再蓋房」，放置後不應彈出選取框 (保持選取工人而非建築)
        const selIds = this.state.selectedUnitIds || [];
        const selectedVillagers = this.state.units.villagers.filter(v => selIds.includes(v.id) && v.config.type === 'villagers');

        // [優先級分配] 依照放置順序遞增分配序列號，工人應由小到大建造
        newBuilding.priority = this.state.globalConstructionOrder++;

        if (selectedVillagers.length > 0) {
            // [多人協作] 指派中選中的工人前往此工地。
            // 為了達成「人多於房全上」的要求：
            // 如果只有一個工地（即非 LINE 模式），所有選中的工人（不論是否忙碌）都應前往支援，
            // 除非他們正背著重物（MOVING_TO_BASE）則完成後再去。

            const isLineMode = this.state.buildingMode === 'LINE';

            if (isLineMode) {
                // 批次模式下，為了分配均勻，我們只挑選「完全沒事」的人去負責這棟
                const candidate = selectedVillagers.find(v => !v.constructionTarget);
                if (candidate) {
                    candidate.state = 'MOVING_TO_CONSTRUCTION';
                    candidate.constructionTarget = newBuilding;
                    candidate.targetId = null;
                    candidate.pathTarget = null;
                    candidate.isPlayerLocked = true;
                    this.addLog(`[分配] 工人 ${candidate.id.substr(-4)} 負責 P:${newBuilding.priority} 單點施工。`);
                }
            } else {
                // 單一建築模式下，所有選取的工人一併前往，支援多人同時建造
                let count = 0;
                selectedVillagers.forEach(v => {
                    // 如果工人已經在蓋「另一棟」建築，為了效率先讓其完工
                    if (v.constructionTarget && v.constructionTarget !== newBuilding) {
                        // 雖然不切換，但日誌或 Debug 可以看到他仍在原本的任務上。
                        // 當他完工時，會自動找 priority 下一棟 (即 newBuilding)。
                        return;
                    }

                    // 如果不是在回城的命脈任務中，直接切換到建築狀態
                    if (v.state === 'IDLE' || v.state === 'GATHERING' || v.state === 'MOVING_TO_RESOURCE' || v.state === 'MOVING' || v.state === 'MOVING_TO_CONSTRUCTION') {
                        v.state = 'MOVING_TO_CONSTRUCTION';
                        v.constructionTarget = newBuilding;
                        v.targetId = null;
                        v.pathTarget = null;
                        v.isPlayerLocked = true;
                        count++;
                    } else if (v.state === 'MOVING_TO_BASE') {
                        // 正在回城的，就把下次任務設為此建築
                        v.nextStateAfterDeposit = 'MOVING_TO_CONSTRUCTION';
                        v.nextTargetAfterDeposit = newBuilding;
                    }
                });
                if (count > 0) this.addLog(`[協作] ${count} 位工人前往支援 P:${newBuilding.priority} 建築。`);
                else this.addLog(`[排隊] 選中的工人正在忙碌，隨後將自動處理 P:${newBuilding.priority}。`);
                console.log(`[協作派發] 單獨模型指派 ${count}/${selectedVillagers.length} 位。`);
            }
        } else {
            this.addLog(`${cfg.name} 已放置 (待建序列 P:${newBuilding.priority})。`, 'COMMON');
        }

        this.state.selectedBuildingId = null;
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
        if (count > 0) {
            this.addLog(`批次建造：${cfg.name} x${count}。`);
            // [多人協作] 批次放置後，讓所有「依然空閒」的選中工人尋找最適合的工地支援 (分攤剩餘勞動力)
            const selIds = this.state.selectedUnitIds || [];
            const remainingFree = this.state.units.villagers.filter(v => selIds.includes(v.id) && !v.constructionTarget && v.config?.type === 'villagers');
            if (remainingFree.length > 0) {
                const projects = this.state.mapEntities.filter(e => e && e.isUnderConstruction).sort((a, b) => (a.priority || 0) - (b.priority || 0));
                remainingFree.forEach(v => {
                    const best = GameEngine.findBestConstructionProject(v, projects);
                    if (best) {
                        v.state = 'MOVING_TO_CONSTRUCTION';
                        v.constructionTarget = best;
                        v.targetId = null; v.pathTarget = null;
                        v.isPlayerLocked = true;
                    }
                });
                this.addLog(`[協作] ${remainingFree.length} 位剩餘工人已分派至待建工地。`);
            }
        }
    }

    static getLinePositions(type, startX, startY, endX, endY) {
        const TS = this.TILE_SIZE;
        const cfg = this.state.buildingConfigs[type];
        if (!cfg) return [];
        const match = cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
        const uw = match ? parseInt(match[1]) : 1, uh = match ? parseInt(match[2]) : 1;

        const spacing = this.state.buildingSpacing !== undefined ? this.state.buildingSpacing : 1;

        // 為了讓拉排更直覺，我們強迫它沿著主軸線排列
        const dx = endX - startX, dy = endY - startY;
        const positions = [];

        if (Math.abs(dx) > Math.abs(dy)) {
            // 水平排列
            const step = (uw + spacing) * TS;
            const count = Math.floor(Math.abs(dx) / step) + 1;
            const dir = dx > 0 ? 1 : -1;
            for (let i = 0; i < count; i++) {
                positions.push({ x: startX + i * step * dir, y: startY });
            }
        } else {
            // 垂直排列
            const step = (uh + spacing) * TS;
            const count = Math.floor(Math.abs(dy) / step) + 1;
            const dir = dy > 0 ? 1 : -1;
            for (let i = 0; i < count; i++) {
                positions.push({ x: startX, y: startY + i * step * dir });
            }
        }
        return positions;
    }

    static findNearestAvailableVillager(x, y) {
        return this.workerSystem ? this.workerSystem.findNearestAvailableVillager(x, y) : null;
    }


    static destroyBuilding(ent) {
        if (!ent) return;
        const cfg = this.state.buildingConfigs[ent.type];
        if (!cfg) return;

        // 1. 返還資源 (50%)
        let refundLog = [];
        for (let r in cfg.costs) {
            const refundRate = ent.isUnderConstruction ? 1.0 : 0.5;
            const amount = Math.floor(cfg.costs[r] * refundRate);
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
        const actionName = ent.isUnderConstruction ? "取消施工" : "銷毀";
        this.addLog(`${actionName}了 ${cfg.name}。返還：${refundLog.join(', ') || '無'}`);

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
