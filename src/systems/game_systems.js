import { UI_CONFIG } from "../ui/ui_config.js";
import { PathfindingSystem } from "./PathfindingSystem.js?v=3";
import { BattleSystem } from "./BattleSystem.js";
import { MapDataSystem } from "./MapDataSystem.js";



/**
 * 核心遊戲邏輯系統
 * 處理生產線、資源更新、碰撞、人口上限與 A* 尋路
 */
export class GameEngine {
    static TILE_SIZE = 20; // 基礎座標單位

    static state = {
        resources: { healthpotion: 0, soul: 100, gold: 100, wood: 200, stone: 0, food: 0, mana: 0 },
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
            showResourceInfo: true, // 預設顯示大地圖資源資訊（名稱、等級、數量）
            showVisionRange: 0      // 預設關閉視野圈 (0: 關閉, 1: 僅選中, 2: 全部)
        },
        globalConstructionOrder: 1, // [新協定] 建築施工序列號，從小到大依次建造
        idToNameMap: {}, // NPC ID -> NPC Name (用於從 buildings.csv 定義的 ID 找配置)
        renderVersion: 0, // 用於通知渲染器強行刷新
        pathfinding: null, // 尋路系統實例
        selectedUnitIds: [], // 目前選中的單位 ID 列表
        selectedResourceId: null, // 目前選中的資源 ID (gx_gy)
        lastSelectedUnitId: null, // 上一次選中的單位 ID (用於雙擊檢測)
        lastSelectionTime: 0, // 上一次選中的時間 (用於雙擊檢測)
        mapData: null // 大地圖數據系統實例 (Uint16Array)
    };


    static RESOURCE_NAMES = {
        gold: "黃金",
        wood: "木材",
        stone: "石頭",
        food: "食物",
        healthpotion: "生命藥水",
        soul: "靈魂碎片",
        mana: "法力"
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

            // 核心戰鬥系統更新
            if (typeof BattleSystem !== 'undefined') {
                BattleSystem.update(this.state, deltaTime, this.TILE_SIZE);
            }

            // 處理每間城鎮中心各自的獨立生產隊列
            const maxPop = this.getMaxPopulation();
            const currentPop = this.getCurrentPopulation();
            const isPopFull = currentPop >= maxPop;

            // 偵測人口上限變動（全域一次即可）
            if (this.state.lastMaxPop > 0 && maxPop > this.state.lastMaxPop) {
                this.triggerWarning("3", [maxPop]);
            }
            this.state.lastMaxPop = maxPop;

            // 1.2 建築生產與升級邏輯
            this.state.mapEntities.forEach(ent => {
                // 處理升級進度
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
                            // 如果有其它需要更新的屬性可以在此更新
                        }
                        this.addLog(`${ent.name} 升級成功！目前等級：${ent.lv}`);
                        this.triggerWarning("upgrade_success", [ent.name, ent.lv]); // 需要在 strings.csv 或程式碼中處理訊息
                        if (window.UIManager) {
                            window.UIManager.showWarning(`${ent.name} 升級至 ${ent.lv} 級！`);
                            window.UIManager.updateValues(true);
                            // [修復] 升級完成後重新刷新選單以隱藏進度條並恢復生產按鈕
                            if (window.UIManager.activeMenuEntity === ent) {
                                window.UIManager.showContextMenu(ent);
                            }
                        }
                        this.state.renderVersion++;
                    }
                    return; // 升級中不執行生產
                }

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

            const selectedIds = new Set(this.state.selectedUnitIds || []);
            const sortedVillagers = [...this.state.units.villagers].sort((a, b) => {
                const aS = selectedIds.has(a.id) ? 1 : 0;
                const bS = selectedIds.has(b.id) ? 1 : 0;
                return bS - aS; // 選中的在前
            });

            sortedVillagers.forEach(v => {
                // [新協定] 本循環不再自動呼叫工人去建築。所有建築任務必須由玩家點擊觸發。
                // 這裡僅負責更新移動位置等物理行為。
                this.updateVillagerMovement(v, deltaTime);
            });

            // 每秒執行一次工人分配邏輯
            this.state.assignmentTimer += deltaTime;
            if (this.state.assignmentTimer >= 1.0) {
                this.updateWorkerAssignments();
                this.updateSpatialGrid(); // 週期性全量刷新空間格網 (保險起見)
                this.state.assignmentTimer = 0;
            }
        } catch (err) {
            console.error("Logic Loop Error:", err);
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
        const costs = { food: 0, wood: 0, stone: 0, gold: 0, soul: 0, mana: 0, healthpotion: 0 };
        if (!str || typeof str !== 'string' || !str.includes('=')) return costs;
        const clean = str.replace(/[\{\}"']/g, '').trim();
        const pairs = clean.split(',');
        pairs.forEach(p => {
            const [rk, rv] = p.split('=');
            if (rk && rv) {
                const key = rk.trim().toLowerCase();
                const amount = parseInt(rv.trim());
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
                idxColAmt = hIdx('collection_resource'),
                idxNeed = hIdx('need_resource'),
                idxLv = hIdx('lv'),
                idxHp = hIdx('hp'),
                idxAtk = hIdx('attack'),
                idxAtkSpeed = hIdx('attack_speed'),
                idxRange = hIdx('range'),
                idxType = hIdx('type'),
                idxCamp = hIdx('camp'),
                idxPop = hIdx('population'),
                idxPatrol = hIdx('patrol_range'),
                idxVision = hIdx('field_vision'),
                idxInitiative = hIdx('initiative_attack'),
                idxPixelSize = hIdx('pixel_size');

            console.log(`[CSV載入] NPC配置欄位索引結果:`, { id: idxId, name: idxName, need: idxNeed, size: idxPixelSize });


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
                    field_vision: parseFloat(row[idxVision]) || 15,
                    initiative_attack: parseInt(row[idxInitiative]) !== undefined ? parseInt(row[idxInitiative]) : 1,
                    need_resource: row[idxNeed],
                    costs: this.parseResourceCosts(row[idxNeed])
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
            const data = this.parseCSV(text);
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const hIdx = (key) => headers.findIndex(h => h.toLowerCase().trim() === key.toLowerCase());
            const idxType = hIdx('type'), idxValue = hIdx('value');
            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxType]) continue;
                const type = row[idxType].trim();
                const val = row[idxValue].trim();

                if (type === 'default_resource') {
                    // 解析 "{food=100,wood=200,stone=100}"
                    const costs = this.parseResourceCosts(val);
                    // 先歸零所有資源
                    for (let r in this.state.resources) this.state.resources[r] = 0;
                    // 套用初始資源
                    Object.entries(costs).forEach(([rk, rv]) => {
                        if (this.state.resources.hasOwnProperty(rk)) {
                            this.state.resources[rk] = rv;
                        }
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
            const text = await this.fetchCSVText('config/resources_data.csv');
            const data = this.parseCSV(text);
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const findHIdx = (key) => headers.findIndex(h => h.toLowerCase().trim() === key.toLowerCase());
            const idxName = findHIdx('name'), idxModel = findHIdx('model'), idxType = findHIdx('type');
            const idxYield = findHIdx('collection_speed'), idxDensity = findHIdx('density');
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

                this.state.resourceConfigs.push({
                    name: row[idxName].trim(), model: row[idxModel].trim(), type: row[idxType].trim().toUpperCase(),
                    amount: parseInt(row[idxYield]) || 100, density: parseInt(row[idxDensity]) || 5,
                    lv: parseInt(row[idxLv]) || 1, size: (idxSize !== -1 && row[idxSize]) ? row[idxSize].trim() : '{1,1}',
                    model_size: parsedModelSize,
                    pixel_size: pixelSize
                });
            }
        } catch (e) { }
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
                idxNeed = hIdx('need_resource'),
                idxName = headers.find(h => h === 'name' || h === '名稱'),
                idxDesc = headers.find(h => h === 'desc' || h === '描述'),
                idxMax = hIdx('max_count'),
                idxTime = hIdx('building_times'),
                idxProd = hIdx('npc_production'), // ID 列表
                idxProdType = (hIdx('npc_production_type') !== -1) ? hIdx('npc_production_type') : headers.lastIndexOf('npc_production'),
                idxResourceValue = hIdx('resource_value');

            console.log(`[CSV載入] 建築配置欄位索引結果:`, { model: idxModel, type: idxType, need: idxNeed, prod: idxProd, prodType: idxProdType });

            // 轉換為 index (使用上方載入時定義的健壯版 hIdx)
            const nameIdx = headers.indexOf(idxName);
            const descIdx = headers.indexOf(idxDesc);

            const idxLv = hIdx('lv'),
                idxUnlock = hIdx('build_unlock'),
                idxUpgradeResources = hIdx('upgrade_need_resources'),
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

                const cfg = {
                    name: (nameIdx !== -1 && row[nameIdx]) ? row[nameIdx].trim() : model,
                    desc: (descIdx !== -1 && row[descIdx]) ? row[descIdx].trim() : "",
                    model: model,
                    type: type,
                    lv: lv,
                    collision: row[idxCol] === '1',
                    size: row[idxSize] || "{1,1}",
                    population: parseInt(row[idxPop]) || 0,
                    costs: this.parseResourceCosts(row[idxNeed]),
                    maxCount: parseInt(row[idxMax]) || 999,
                    buildTime: parseFloat(row[idxTime]) || 5,
                    resourceValue: (idxResourceValue !== -1 && row[idxResourceValue]) ? parseInt(row[idxResourceValue]) : 0,
                    npcProduction: prodList,
                    productionMode: (row[idxProdType] || 'normal').toLowerCase().trim(),
                    // 升級相關
                    buildUnlock: row[idxUnlock] || "{0}",
                    upgradeResources: this.parseResourceCosts(row[idxUpgradeResources]),
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
            initiative_attack: (config.initiative_attack !== undefined) ? config.initiative_attack : 1,
            facing: 1, // 1: 右, -1: 左
            isPlayerLocked: false, // [新協定] 玩家指令鎖定旗標，啟動時屏蔽系統自動化
            // 物理碰撞尺寸 (寬, 高)
            width: config.pixel_size ? config.pixel_size.w : 20,
            height: config.pixel_size ? config.pixel_size.h : 20
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
        return { x: building.x + tx * TS, y: building.y + ty * TS };
    }

    static getBuildingConfig(type, lv) {
        if (!this.state.buildingConfigsByType || !this.state.buildingConfigsByType[type]) return null;
        return this.state.buildingConfigsByType[type][lv] || null;
    }

    static isUpgradeUnlocked(entity, nextCfg) {
        if (!nextCfg) return { unlocked: false, reason: "已達最高等級" };
        const unlockStr = nextCfg.buildUnlock;
        if (!unlockStr || unlockStr === "{0}") return { unlocked: true };

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
            if (!hasRequirement) {
                return { unlocked: false, reason: `需 ${this.state.buildingConfigs[targetType]?.name || targetType} 達到 ${targetLv} 級` };
            }
        }
        return { unlocked: true };
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

        // 檢查資源
        for (let r in currentCfg.upgradeResources) {
            const cost = currentCfg.upgradeResources[r];
            if ((this.state.resources[r] || 0) < cost) {
                this.triggerWarning("1", [r.toUpperCase()]);
                return;
            }
        }

        // 扣除資源
        for (let r in currentCfg.upgradeResources) {
            this.state.resources[r] -= currentCfg.upgradeResources[r];
        }

        entity.isUpgrading = true;
        entity.upgradeProgress = 0;
        entity.upgradeTime = currentCfg.upgradeTime || 10;
        this.addLog(`開始升級 ${currentCfg.name} 到 ${entity.lv + 1} 級，預計耗時 ${entity.upgradeTime} 秒。`);
        if (window.UIManager) {
            window.UIManager.updateValues(true);
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

                // 資源模型映射 (1: Tree, 2: Stone, 3: Food, 4: Gold)
                let typeNum = 0;
                if (cfg.type === 'WOOD') typeNum = 1;
                else if (cfg.type === 'STONE') typeNum = 2;
                else if (cfg.type === 'FOOD') typeNum = 3;
                else if (cfg.type === 'GOLD') typeNum = 4;

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
                    if (cfg.type === 'WOOD') varCfg = resCfg.Tree.visualVariation;
                    else if (cfg.type === 'STONE') varCfg = resCfg.Rock.visualVariation;
                    else if (cfg.type === 'FOOD') varCfg = resCfg.BerryBush.visualVariation;

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
                    const pIdx = getIdx(gx, gy);
                    if (pIdx === -1 || proximityGrid[pIdx] === 1) continue;

                    const x = gx * TS + TS / 2;
                    const y = gy * TS + TS / 2;

                    // 3. 安全區檢查 (避免離出生點太近)
                    if (Math.abs(x - villagePos.x) < safeCfg.w / 2 && Math.abs(y - villagePos.y) < safeCfg.h / 2) continue;

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
            const typeMap = { 1: 'WOOD', 2: 'STONE', 3: 'FOOD', 4: 'GOLD' };
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
            // 決定移動速度：只有敵人閒逛（IDLE/MOVING 狀態）時使用 idle_speed，追擊或對戰時均使用 fighting_speed
            const isEnemyWandering = (v.config.camp === 'enemy' && (v.state === 'IDLE' || v.state === 'MOVING'));
            const moveBaseSpeed = isEnemyWandering ? (v.config.idle_speed || 2.5) : (v.config.fighting_speed || 5.5);
            const moveSpeed = moveBaseSpeed * 13;
            if (v.idleTarget) {
                // 只有在非戰鬥狀態下才切換為 MOVING，防止覆蓋 CHASE/ATTACK
                if (v.state !== 'CHASE' && v.state !== 'ATTACK' && v.state !== 'GATHERING') v.state = 'MOVING';
                this.moveDetailed(v, v.idleTarget.x, v.idleTarget.y, moveSpeed, dt);
                if (Math.hypot(v.x - v.idleTarget.x, v.y - v.idleTarget.y) < 5) {
                    v.idleTarget = null;
                    if (v.state === 'MOVING') v.state = 'IDLE';

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

        // 核心碰撞防護：只有在採集或建造「進行中」時才可忽略目標，防止走路穿模進入建築物
        // 核心修復：必須在 switch 之前定義，否則 moveDetailed 調用時會 ReferenceError
        let ignoreEnts = [v];
        if ((v.state === 'GATHERING' || v.state === 'MOVING_TO_RESOURCE') && v.targetId) ignoreEnts.push(v.targetId);
        if ((v.state === 'CONSTRUCTING' || v.state === 'MOVING_TO_CONSTRUCTION') && v.constructionTarget) ignoreEnts.push(v.constructionTarget);
        if (v.state === 'MOVING_TO_BASE' && v.targetBase) ignoreEnts.push(v.targetBase);


        // 安全機制：如果正在執行特定任務（非閒置且非追擊），則清除閒逛目標，避免動畫頻率錯誤 (Point 2)
        if (v.state !== 'IDLE' && v.state !== 'CHASE' && v.idleTarget) {
            v.idleTarget = null;
        }

        // 決定移動速度：只有敵人閒逛時使用 idle_speed，其餘所有單位與狀態（包含我方工人、戰鬥單位）均使用 fighting_speed
        const isEnemyWandering = (v.config.camp === 'enemy' && (v.state === 'IDLE' || v.state === 'MOVING'));
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

        // 核心防卡死補強：如果累積卡死幀數過多 (約 1.5 - 2 秒)，強制執行脫困
        if (v._stuckFrames > 100) {
            this.resolveStuck(v);
        }

        switch (v.state) {
            case 'IDLE':
                if (v.idleTarget) {
                    this.moveDetailed(v, v.idleTarget.x, v.idleTarget.y, moveSpeed, dt, ignoreEnts);
                    if (Math.hypot(v.x - v.idleTarget.x, v.y - v.idleTarget.y) < 5) {
                        v.idleTarget = null;
                        v.isPlayerLocked = false;
                        v.waitTimer = 1 + Math.random() * 2;
                        v.pathTarget = null;
                    }
                }
                break;
            case 'CHASE':
                if (v.idleTarget) {
                    this.moveDetailed(v, v.idleTarget.x, v.idleTarget.y, moveSpeed, dt, ignoreEnts);
                }
                break;
            case 'ATTACK':
                v.pathTarget = null;
                v.fullPath = null;
                break;
            case 'MOVING_TO_RESOURCE':
                let searchX = v.x, searchY = v.y;
                if (v.assignedWarehouseId) {
                    const w = this.state.mapEntities.find(e => (e.id || `${e.type}_${e.x}_${e.y}`) === v.assignedWarehouseId);
                    if (w) { searchX = w.x; searchY = w.y; }
                }

                // 核心修復：如果已有指定目標 (手動指令)，優先前往該目標，而非自動搜尋最近
                let target = v.targetId;
                if (!target || target.gx === undefined) {
                    target = this.findNearestResource(searchX, searchY, v.type, v.id);
                } else {
                    // 檢查指定目標是否還有效 (MapData)
                    const res = this.state.mapData.getResource(target.gx, target.gy);
                    if (!res || res.amount <= 0) target = this.findNearestResource(searchX, searchY, v.type, v.id);
                }

                if (target) {
                    if (!v.gatherPoint || v._lastTargetId !== (target.id || `${target.gx}_${target.gy}`)) {
                        v._lastTargetId = (target.id || `${target.gx}_${target.gy}`);

                        if (target.type === 'farmland' || target.type === 'tree_plantation') {
                            v.gatherPoint = {
                                x: target.x + (Math.random() - 0.5) * 50,
                                y: target.y + (Math.random() - 0.5) * 50
                            };
                        } else {
                            // 自然資源：以資源為中心，建立周圍點環繞，並朝工人當時來的方向偏移
                            let rRadius = 25; // 預設互動半徑
                            const rCfg = this.state.resourceConfigs.find(c => c.type === (target.resourceType || target.type));
                            if (rCfg && rCfg.pixel_size) {
                                rRadius = (Math.max(rCfg.pixel_size.w, rCfg.pixel_size.h) / 2) + 15;
                            }

                            // 工人相對於資源的角度
                            let baseAngle = Math.atan2(v.y - target.y, v.x - target.x);
                            // 讓工人們在 +- 80度 內隨機散開
                            baseAngle += (Math.random() - 0.5) * 2.8;

                            v.gatherPoint = {
                                x: target.x + Math.cos(baseAngle) * rRadius,
                                y: target.y + Math.sin(baseAngle) * rRadius
                            };
                        }
                    }

                    const distToGather = Math.hypot(v.gatherPoint.x - v.x, v.gatherPoint.y - v.y);
                    if (distToGather < 15) {
                        if (v.cargo > 0) {
                            // [核心修復] 到達資源點才發現有物資，先回去放，並將當前目標存入快取
                            v.nextStateAfterDeposit = 'MOVING_TO_RESOURCE';
                            v.nextTargetAfterDeposit = target;
                            v.nextTypeAfterDeposit = v.type;
                            v.state = 'MOVING_TO_BASE';
                            v.pathTarget = null;
                            v.gatherPoint = null;
                        } else {
                            v.state = 'GATHERING'; v.targetId = target; v.gatherTimer = 0; v.pathTarget = null;
                            v.gatherPoint = null; // 重置讓下次回來可重新分配位置
                        }
                    } else {
                        this.moveDetailed(v, v.gatherPoint.x, v.gatherPoint.y, moveSpeed, dt, ignoreEnts);
                    }
                } else { v.state = 'IDLE'; v.pathTarget = null; v.gatherPoint = null; v.workOffset = null; }
                break;
            case 'GATHERING':
                v.gatherTimer += dt;
                const harvestTime = v.config.collection_speed || 2; // 採集時間 (秒)

                // 核心安全檢查：若採集目標已失蹤，直接中止
                if (!v.targetId) {
                    v.state = 'IDLE';
                    v.pathTarget = null;
                    v.isPlayerLocked = false; // [新協定] 目標消失，重置玩家鎖定
                    break;
                }

                if (v.gatherTimer >= harvestTime) {
                    const harvestTotal = v.config.collection_resource || 20; // 每次採集的數量 (修正欄位名)

                    // 區分是「區塊型資源 (MapData)」還是「實體型資源 (如農田)」
                    if (v.targetId.gx !== undefined && v.targetId.gy !== undefined) {
                        // 1. 區塊型資源採集 (MapDataSystem)
                        const consumed = this.state.mapData.consumeResource(v.targetId.gx, v.targetId.gy, harvestTotal);
                        v.cargo = consumed;
                        v.cargoType = v.type; // [修正] 明確記錄身上背的是什麼資源類型
                        this.state.renderVersion++; // [核心修復] 通知渲染層數據已變動，強行刷新標籤與資源狀態

                        if (consumed <= 0) {
                            // 資源已枯竭(被搶先採完)，自動尋找附近的同類資源
                            v.targetId = null;
                            v.gatherPoint = null;
                            v.state = 'MOVING_TO_RESOURCE';
                        } else {
                            v.state = 'MOVING_TO_BASE';
                        }
                        v.pathTarget = null;
                        v.gatherTimer = 0;
                    } else if (this.state.mapEntities.includes(v.targetId)) {
                        // 2. 實體型資源採集 (如農田/樹木田)
                        const canTake = Math.min(harvestTotal, v.targetId.amount);
                        v.targetId.amount -= canTake;

                        // 農田類直接入庫
                        if (v.targetId.type === 'farmland') this.state.resources.food += canTake;
                        else if (v.targetId.type === 'tree_plantation') this.state.resources.wood += canTake;

                        v.cargo = 0;
                        v.cargoType = null;
                        v.gatherTimer = 0;
                        if (v.targetId.amount <= 0) {
                            this.addLog(`${v.targetId.name || '資源點'} 已枯竭。`);
                            this.state.mapEntities = this.state.mapEntities.filter(e => e !== v.targetId);
                            v.targetId = null;
                            v.gatherPoint = null;
                            v.state = 'MOVING_TO_RESOURCE';
                            v.pathTarget = null;
                        }
                    } else {
                        // 目標無效
                        v.state = 'IDLE';
                        v.pathTarget = null;
                        v.targetId = null;
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
                let depositDist = 25; // 使用具體停靠點，互動距離可以縮短
                let uw = 1, uh = 1;
                if (cfgB && cfgB.size) {
                    const m = cfgB.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
                    if (m) {
                        uw = parseInt(m[1]);
                        uh = parseInt(m[2]);
                    }
                }

                // 為了讓工人平均分佈在建築周圍的 16 個停靠點
                const baseId = v.targetBase.id || `${v.targetBase.type}_${v.targetBase.x}_${v.targetBase.y}`;
                if (!v.depositPoint || v._lastBaseId !== baseId) {
                    v._lastBaseId = baseId;
                    const pts = [];
                    const w = uw * this.TILE_SIZE + 20; // 擴大 10 像素半徑避免判定在牆內
                    const h = uh * this.TILE_SIZE + 20;
                    const bx = v.targetBase.x;
                    const by = v.targetBase.y;

                    const steps = 4;
                    for (let i = 0; i < steps; i++) pts.push({ x: bx - w / 2 + (w / steps) * i, y: by - h / 2 });
                    for (let i = 0; i < steps; i++) pts.push({ x: bx + w / 2, y: by - h / 2 + (h / steps) * i });
                    for (let i = 0; i < steps; i++) pts.push({ x: bx + w / 2 - (w / steps) * i, y: by + h / 2 });
                    for (let i = 0; i < steps; i++) pts.push({ x: bx - w / 2, y: by + h / 2 - (h / steps) * i });

                    let nearestPt = { x: bx, y: by };
                    let minDistSq = Infinity;
                    for (const p of pts) {
                        const dSq = (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
                        if (dSq < minDistSq) {
                            minDistSq = dSq;
                            nearestPt = p;
                        }
                    }

                    if (!v.workOffset) {
                        const idNumInv = parseInt((v.id || "0").replace(/[^0-9]/g, '')) || 0;
                        const angleInv = (idNumInv * 137.5) * (Math.PI / 180);
                        v.workOffset = { x: Math.cos(angleInv) * 15, y: Math.sin(angleInv) * 15 };
                    }
                    v.depositPoint = {
                        x: nearestPt.x + v.workOffset.x,
                        y: nearestPt.y + v.workOffset.y
                    };
                }

                const distB = Math.hypot(v.depositPoint.x - v.x, v.depositPoint.y - v.y);
                if (distB < depositDist) {
                    this.depositResource(v.cargoType || v.type, v.cargo);
                    v.cargo = 0; v.cargoType = null; v.pathTarget = null;
                    v.depositPoint = null; v._lastBaseId = null; // 重置狀態
                    if (v.nextStateAfterDeposit) {
                        v.state = v.nextStateAfterDeposit;
                        v.nextStateAfterDeposit = null;
                        if (v.nextTypeAfterDeposit) { v.type = v.nextTypeAfterDeposit; v.nextTypeAfterDeposit = null; }
                        if (v.nextTargetAfterDeposit) { v.targetId = v.nextTargetAfterDeposit; v.nextTargetAfterDeposit = null; }
                    } else if (v.isRecalled) {
                        v.state = 'IDLE'; v.isRecalled = false; v.idleTarget = null;
                    } else {
                        v.state = 'MOVING_TO_RESOURCE';
                    }
                } else {
                    this.moveDetailed(v, v.depositPoint.x, v.depositPoint.y, moveSpeed, dt, ignoreEnts);
                }
                break;
            case 'MOVING_TO_CONSTRUCTION':
                // [核心協議] 如果建築已被他人完成 (或消失)，立即改為尋找下一個任務
                if (!v.constructionTarget || !this.state.mapEntities.includes(v.constructionTarget) || !v.constructionTarget.isUnderConstruction) {
                    v.constructionTarget = null;
                    v.pathTarget = null;
                    // [核心修復] 嘗試尋找下一個工地，否則回歸通用分配
                    if (!GameEngine.assignNextConstructionTask(v)) {
                        this.assignNextTask(v);
                    }
                    return;
                }

                // [核心優化] 邊緣分佈邏輯：根據接近方向分配到建築的四條邊上
                const idNumC = parseInt((v.id || "0").replace(/[^0-9]/g, '')) || 0;
                const fpC = GameEngine.getFootprint(v.constructionTarget.type);
                const halfWC = (fpC.uw * this.TILE_SIZE) / 2;
                const halfHC = (fpC.uh * this.TILE_SIZE) / 2;

                const dxC = v.x - v.constructionTarget.x;
                const dyC = v.y - v.constructionTarget.y;
                let txC = v.constructionTarget.x, tyC = v.constructionTarget.y;

                if (Math.abs(dxC) > Math.abs(dyC)) {
                    txC = dxC > 0 ? (v.constructionTarget.x + halfWC + 10) : (v.constructionTarget.x - halfWC - 10);
                    const spreadY = (idNumC % 5 - 2) * (halfHC * 0.7);
                    tyC = v.constructionTarget.y + spreadY;
                } else {
                    tyC = dyC > 0 ? (v.constructionTarget.y + halfHC + 10) : (v.constructionTarget.y - halfHC - 10);
                    const spreadX = (idNumC % 5 - 2) * (halfWC * 0.7);
                    txC = v.constructionTarget.x + spreadX;
                }

                const distC = Math.hypot(txC - v.x, tyC - v.y);
                if (distC < 25) {
                    v.state = 'CONSTRUCTING';
                    v.pathTarget = null;
                } else {
                    this.moveDetailed(v, txC, tyC, moveSpeed, dt, ignoreEnts);
                }
                break;
            case 'CONSTRUCTING':
                if (!v.constructionTarget || !this.state.mapEntities.includes(v.constructionTarget) || !v.constructionTarget.isUnderConstruction) {
                    v.constructionTarget = null;
                    // [核心修復] 嘗試尋找下一個工地，否則回歸舊任務或閒置
                    if (!GameEngine.assignNextConstructionTask(v)) {
                        this.restoreVillagerTask(v);
                    }
                    return;
                }

                // [狀態更名] 只要開始施工，名稱改為「施工中」
                v.constructionTarget.name = "施工中";
                v.constructionTarget.buildProgress += dt;

                // [核心修復] 直接提供 fallback 並預留計算有效性
                const targetBuildTime = Math.max(0.1, v.constructionTarget.buildTime || 5);

                if (v.constructionTarget.buildProgress >= targetBuildTime) {
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

                    // [新協定] 建造完成後不再自動尋找下一個工地。工人應進入閒置或恢復舊任務。
                    if (['timber_factory', 'stone_factory', 'barn', 'gold_mining_factory'].includes(type)) {
                        v.assignedWarehouseId = (finishedBuilding.id || `${finishedBuilding.type}_${finishedBuilding.x}_${finishedBuilding.y}`);
                        v.type = (type === 'timber_factory' ? 'WOOD' : (type === 'stone_factory' ? 'STONE' : (type === 'barn' ? 'FOOD' : 'GOLD')));
                        v.state = 'MOVING_TO_RESOURCE';
                        v.targetId = null; v.pathTarget = null; v.prevTask = null; v.constructionTarget = null;
                        this.addLog(`建造者已自動轉為 ${finishedBuilding.name} 的專職員工。`);
                    } else if (type === 'farmland' || type === 'tree_plantation') {
                        v.type = (type === 'farmland' ? 'FOOD' : 'WOOD');
                        v.state = 'MOVING_TO_RESOURCE'; v.targetId = finishedBuilding; v.gatherTimer = 0; v.pathTarget = null; v.prevTask = null; v.constructionTarget = null;
                        v.workOffset = { x: (Math.random() - 0.5) * 50, y: (Math.random() - 0.5) * 50 };
                        this.addLog(`建造者前往${type === 'farmland' ? '農田' : '樹木田'}內部開始工作。`);
                    } else {
                        // [核心修補] 統一調用續建邏輯，確保所有選中的工人群組能集體執行連續建造
                        if (!GameEngine.assignNextConstructionTask(v)) {
                            this.restoreVillagerTask(v);
                            v.constructionTarget = null;
                            this.addLog(`建造清單已清空，回歸原位。`);
                        }
                    }
                }
                break;
        }

        // 核心碰撞防護
        const collidingEnt = this.isColliding(v.x, v.y, ignoreEnts, v.width, v.height);

        if (collidingEnt) {
            const wasColliding = this.isColliding(oldX, oldY, ignoreEnts);
            if (wasColliding !== collidingEnt) {
                v.x = oldX; v.y = oldY; v.pathTarget = null;
                v._stuckFrames = (v._stuckFrames || 0) + 1;
                if (v._stuckFrames > 12) {
                    this.resolveStuck(v);
                    v._stuckFrames = 0;
                }
            } else {
                this.resolveStuck(v);
                v._stuckFrames = 0;
            }
        } else {
            if (Math.hypot(v.x - oldX, v.y - oldY) > 0.1) {
                v._stuckFrames = 0;
            } else if (v.state.startsWith('MOVING')) {
                v._stuckFrames = (v._stuckFrames || 0) + 1;
                if (v._stuckFrames > 15) {
                    this.resolveStuck(v);
                    v._stuckFrames = 0;
                }
            }
        }

        if (v.state === 'IDLE' && collidingEnt) {
            v.idleTarget = null;
            v.isPlayerLocked = false; // [新協定] 撞牆且 IDLE 時釋放鎖定
        }

        // 附近基地即便撞牆也算存款 (加寬範圍至 150)
        if (v.state === 'MOVING_TO_BASE' && v.targetBase) {
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
                    v.state = 'IDLE'; v.isRecalled = false; this.assignNextTask(v);
                } else {
                    v.state = 'MOVING_TO_RESOURCE';
                    // 手動指令保護
                    if (v.isPlayerLocked && v.targetId) { v.pathTarget = null; return; }
                    v.isPlayerLocked = false;
                    this.assignNextTask(v);
                }
            }
        }
    }

    static restoreVillagerTask(v) {
        v.isPlayerLocked = false; // [核心修復] 任務歸位時應解除玩家鎖定
        if (v.prevTask) {
            v.state = v.prevTask.state;
            v.targetId = v.prevTask.targetId;
            v.type = v.prevTask.type;
            v.prevTask = null;
        } else {
            v.state = 'IDLE'; // [核心修復] 先強制歸位到 IDLE，確保通過 assignNextTask 的 busy 檢查
            this.assignNextTask(v);
        }
        v.pathTarget = null;
    }

    static assignNextTask(v, keepCurrentIfNoneFound = false) {
        // 核心邏輯：只有 npc_data 中類型為 'villagers' 的才具備採集工作能力
        if (v.config.type !== 'villagers' || v.isRecalled) {
            v.state = 'IDLE';
            return;
        }

        const isSelected = (this.state.selectedUnitIds || []).includes(v.id);

        // 手動指令連動保護：若已有手動任務且正在執行中，不要進入自動分配邏輯重置為 IDLE
        // [呼叫優化] 選中者無視此保護，強制檢查是否有建設任務需求
        if (!isSelected && v.isPlayerLocked && (v.state.startsWith('MOVING_TO') || v.state === 'GATHERING' || v.state === 'CONSTRUCTING')) {
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

    /**
     * [核心修復] 讓工人在當前工地完成後，自動尋找下一個可連動的建設工地。
     * 支援多人協作，確保選中的工人群組能集體移動並分攤接下來的建設任務 (Chain-tasking)。
     */
    static assignNextConstructionTask(v) {
        if (!v || v.config?.type !== 'villagers') return false;

        // 依照序號續建，擴大至 2 倍視野範圍以增加連動感 (約 600px)
        const visionRadius = (v.field_vision || 15) * this.TILE_SIZE * 2;
        const projects = this.state.mapEntities.filter(e =>
            e && e.isUnderConstruction && Math.hypot(v.x - e.x, v.y - e.y) <= visionRadius
        );

        if (projects.length === 0) return false;

        // 優先考慮優先級 (priority)
        projects.sort((a, b) => (a.priority || 0) - (b.priority || 0));

        // 採用多人協作分配邏輯：優先找無人的工地，其次找人數最少的
        const nextTarget = GameEngine.findBestConstructionProject(v, projects);

        if (nextTarget) {
            v.constructionTarget = nextTarget;
            v.state = 'MOVING_TO_CONSTRUCTION';
            v.pathTarget = null;
            v.isPlayerLocked = true; // 延續玩家的指令鏈鎖定
            this.addLog(`[連動] ${v.configName || '工人'} 已自動前往下一個工地。`);
            return true;
        }
        return false;
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
    static moveDetailed(v, tx, ty, speed, dt, ignoreEnts = []) {
        // 核心優化：平滑尋路偵測 (不立即清空舊路徑以防止抖動)
        const targetDist = !v._lastRequestedTarget ? 999 : Math.hypot(v._lastRequestedTarget.x - tx, v._lastRequestedTarget.y - ty);

        if (targetDist > 15 && !v.isFindingPath && this.state.pathfinding) {
            v._lastRequestedTarget = { x: tx, y: ty };
            v.isFindingPath = true;

            const isSelected = GameEngine.state.selectedUnitIds && GameEngine.state.selectedUnitIds.includes(v.id);
            if (isSelected) {
                GameEngine.addLog(`[重新尋路] 距離目標: ${targetDist.toFixed(0)}`, 'PATH');
            }

            this.state.pathfinding.findPath(v.x, v.y, tx, ty, (path) => {
                v.isFindingPath = false;
                if (path && path.length > 1) {
                    v.fullPath = path;
                    v.pathIndex = 1; // 已拿到新路徑，此處才真正替換
                } else if (!v.fullPath) {
                    v.fullPath = []; // 徹底失敗且原本就沒路徑時才完全停止
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
                    const nextX = v.x + dx * ratio;
                    const nextY = v.y + dy * ratio;

                    // 物理安全性要求：路徑段落中也加入碰撞檢查，防止在新舊尋路交替時穿牆
                    const fullIgnore = [v, ...ignoreEnts];
                    if (!this.isColliding(nextX, nextY, fullIgnore)) {
                        v.x = nextX;
                        v.y = nextY;
                        if (Math.abs(dx) > 0.01) v.facing = dx > 0 ? 1 : -1;
                        v._stuckFrames = 0; // 移動成功，重置計數
                    } else {
                        // 若段落也被意外阻礙，跳過一步並增加卡死計數
                        v._stuckFrames = (v._stuckFrames || 0) + 1;
                        v.fullPath = null;
                        v.isFindingPath = false;
                        v._lastRequestedTarget = null;
                    }
                    remainingDt = 0;
                } else {
                    v.pathIndex++;
                }
            } else {
                // 如果沒有路徑或是正在尋路中，執行直線逼近 (moveTowards 本身帶有碰撞檢查)
                this.moveTowards(v, tx, ty, speed, remainingDt, ignoreEnts);
                remainingDt = 0;
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
            // 傳送至該格的像素中心，並加入微小隨機量打破路徑循環
            v.x = nearest.x * this.TILE_SIZE + this.TILE_SIZE / 2 + (Math.random() - 0.5) * 4;
            v.y = nearest.y * this.TILE_SIZE + this.TILE_SIZE / 2 + (Math.random() - 0.5) * 4;

            // 重要：脫困時重設所有移動指令與緩存，強迫重新思考
            v.fullPath = null;
            v.pathIndex = 0;
            v.pathTarget = null;
            v._lastRequestedTarget = null;
            v.isFindingPath = false;
            v._stuckFrames = 0; // 重置計數

            if (isSelected) {
                GameEngine.addLog(`[防卡死修復] 已由 (${oldX.toFixed(0)},${oldY.toFixed(0)}) 移至 (${v.x.toFixed(0)}, ${v.y.toFixed(0)})`, "PATH");
            }
        } else {
            if (isSelected) {
                GameEngine.addLog(`[防卡死失敗] 100格半徑內找不到脫困空間!`, 'PATH');
            }
        }
    }

    static moveTowards(v, tx, ty, speed, dt, ignoreEnts = []) {
        const dx = tx - v.x, dy = ty - v.y;
        const dist = Math.hypot(dx, dy);
        const moveDist = speed * dt;

        if (dist > 0.1) {
            const ratio = Math.min(1, moveDist / dist);
            const nextX = v.x + dx * ratio;
            const nextY = v.y + dy * ratio;

            // 物理限制：直線移動過程中若遇到碰撞，必須停下，杜絕穿模
            const fullIgnore = [v, ...ignoreEnts];
            if (!this.isColliding(nextX, nextY, fullIgnore)) {
                if (Math.abs(dx) > 0.1) v.facing = dx > 0 ? 1 : -1;
                v.x = nextX;
                v.y = nextY;
                v._stuckFrames = 0; // 移動成功，重置
            } else {
                // 如果直线走不通，增加卡死計數並重置路徑
                v._stuckFrames = (v._stuckFrames || 0) + 1;
                v.fullPath = null;
                v.isFindingPath = false;
            }
        }
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
        const grid = this.state.spatialGrid;
        if (!grid || !grid.cells) return null;

        const cellSize = grid.cellSize;
        const gx = Math.floor(x / cellSize);
        const gy = Math.floor(y / cellSize);

        // 偵測當前格點週邊的 4 個格子即可（因為單位體積比 cellSize 小得多）
        // 1. 檢測建築 (spatialGrid)
        for (let i = gx - 1; i <= gx + 1; i++) {
            for (let j = gy - 1; j <= gy + 1; j++) {
                const cell = grid.cells.get(`${i},${j}`);
                if (!cell) continue;

                for (const ent of cell) {
                    if (ent.isUnderConstruction) continue;
                    if (ignoreEnts.includes(ent)) continue;

                    const cfg = this.getEntityConfig(ent.type);
                    if (cfg && cfg.collision) {
                        if (!ent._collisionW) {
                            const match = cfg.size ? cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/) : null;
                            const uw = match ? parseInt(match[1]) : 1, uh = match ? parseInt(match[2]) : 1;
                            ent._collisionW = uw * this.TILE_SIZE;
                            ent._collisionH = uh * this.TILE_SIZE;
                        }

                        const collCfg = UI_CONFIG.BuildingCollision || { buffer: 10, feetOffset: 8 };
                        const effBufferW = Math.max(unitW / 2, (collCfg.buffer || 0) / 2);
                        const effBufferH = Math.max(unitH / 2, (collCfg.buffer || 0) / 2);

                        const w = ent._collisionW + effBufferW * 2, h = ent._collisionH + effBufferH * 2;
                        const FOOT_OFFSET = collCfg.feetOffset || 8;
                        const logicY = ent.y - FOOT_OFFSET;

                        if (x > ent.x - w / 2 + 0.1 && x < ent.x + w / 2 - 0.1 && y > logicY - h / 2 + 0.1 && y < logicY + h / 2 - 0.1) {
                            return ent;
                        }
                    }
                }
            }
        }

        // 2. 檢測資源 (MapDataSystem)
        if (this.state.mapData) {
            const TS = this.TILE_SIZE;
            const searchGx = Math.floor(x / TS);
            const searchGy = Math.floor(y / TS);
            const typeMap = { 1: 'WOOD', 2: 'STONE', 3: 'FOOD', 4: 'GOLD' };

            // 搜尋週邊格子，判斷物理尺寸 (pixel_size) 是否碰撞
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const gx = searchGx + dx, gy = searchGy + dy;
                    const res = this.state.mapData.getResource(gx, gy);
                    if (res) {
                        const level = this.state.mapData.levelGrid[this.state.mapData.getIndex(gx, gy)] || 1;
                        const cfg = this.state.resourceConfigs.find(c => c.type === typeMap[res.type] && c.lv === level);

                        if (cfg && cfg.pixel_size) {
                            const rx = gx * TS + TS / 2, ry = gy * TS + TS / 2;
                            const pw = cfg.pixel_size.w, ph = cfg.pixel_size.h;
                            if (x > rx - pw / 2 && x < rx + pw / 2 && y > ry - ph / 2 && y < ry + ph / 2) {
                                // 修正：如果此資源格是當前單位的目標，則忽略碰撞，否則會發生「抵達前就撞上自己想採取的資源」而卡死。
                                const isTarget = ignoreEnts && ignoreEnts.some(ign =>
                                    ign && (ign.gx === gx && ign.gy === gy) || ign.id === `${gx}_${gy}`
                                );

                                if (!isTarget) {
                                    return { type: 'resource', gx, gy };
                                }
                            }
                        } else {
                            // 預設 1x1 碰撞
                            if (gx === searchGx && gy === searchGy) {
                                const isTarget = ignoreEnts && ignoreEnts.some(ign =>
                                    ign && (ign.gx === gx && ign.gy === gy) || ign.id === `${gx}_${gy}`
                                );
                                if (!isTarget) {
                                    return { type: 'resource', gx, gy };
                                }
                            }
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

            const typeMap = { 1: 'WOOD', 2: 'STONE', 3: 'FOOD', 4: 'GOLD' };
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

    static findNearestResource(x, y, typeOrName, villagerId) {
        if (!this.state.mapData) return null;

        // 轉換類型名稱為數字 (1: WOOD, 2: STONE, 3: FOOD, 4: GOLD)
        let targetType = 0;
        const upper = typeOrName.toUpperCase();
        if (upper === 'WOOD') targetType = 1;
        else if (upper === 'STONE') targetType = 2;
        else if (upper === 'FOOD') targetType = 3;
        else if (upper === 'GOLD') targetType = 4;

        if (targetType === 0) return null;

        const TS = this.TILE_SIZE;
        const gx = Math.floor(x / TS);
        const gy = Math.floor(y / TS);

        // 螺旋搜尋 (使用 MapDataSystem)
        for (let r = 0; r <= 80; r++) { // 從 0 核心格點開始搜尋，避免漏掉足下資源
            // 這裡為了效能，我們簡化搜尋，直接在 MapDataSystem 的格網中遍歷周邊
            for (let dy = -r; dy <= r; dy++) {
                const ny = gy + dy;
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const nx = gx + dx;
                    const res = this.state.mapData.getResource(nx, ny);
                    if (res && res.type === targetType && res.amount > 0) {
                        // 回傳一個模擬物件，兼容舊邏輯中的 targetId / target
                        return {
                            id: `${nx}_${ny}`, // 修正 ID 格式以匹配 MainScene
                            x: nx * TS + TS / 2,
                            y: ny * TS + TS / 2,
                            gx: nx,
                            gy: ny,
                            type: upper, // 這裡回傳 string 格式
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
     * [核心協定] 尋找最適合的建設工地 (智慧分配系統)
     * @param {Object} v 單位物件
     * @param {Array} projects 待建工地列表 (已排序)
     */
    static findBestConstructionProject(v, projects) {
        if (!projects || projects.length === 0) return null;

        // 1. 優先尋找完全「無人負責」的工地 (按優先級)
        const unassigned = projects.find(p => !this.state.units.villagers.some(other => other.constructionTarget === p));
        if (unassigned) return unassigned;

        // 2. 若全都有人，則尋找「參與人數最少」的工地進行支援
        // 為了確保效率，我們計算每間工地的當前負責人數
        let bestTarget = projects[0];
        let minWorkers = Infinity;

        projects.forEach(p => {
            // 計算目前已被指派到此工地的工傷人數
            const workerCount = this.state.units.villagers.filter(other => other.constructionTarget === p).length;
            if (workerCount < minWorkers) {
                minWorkers = workerCount;
                bestTarget = p;
            } else if (workerCount === minWorkers) {
                // 如果人數相同，則選優先級較高 (priority 較小) 的
                if ((p.priority || 0) < (bestTarget.priority || 0)) {
                    bestTarget = p;
                }
            }
        });

        return bestTarget;
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
            v.state === 'IDLE' && !v.assignedWarehouseId && !v.isRecalled && !v.isPlayerLocked
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
        let costConfigName = configName;
        if (configName === 'RANDOM' && building) {
            const bCfg = this.getBuildingConfig(building.type, building.lv || 1);
            if (bCfg && bCfg.npcProduction && bCfg.npcProduction.length > 0) {
                costConfigName = bCfg.npcProduction[0];
            }
        }

        let cfg = this.state.npcConfigs[costConfigName];
        if (!cfg) {
            const name = this.state.idToNameMap[costConfigName];
            if (name) cfg = this.state.npcConfigs[name];
        }

        if (!cfg) {
            console.error(`[生產] 找不到配置 (用於計費): ${costConfigName}`);
            return;
        }

        if (cfg.costs) {
            console.log(`[生產預檢] 項目: ${cfg.name}, 成本物件:`, cfg.costs);
            for (let r in cfg.costs) {
                const cost = cfg.costs[r];
                if (cost > 0) {
                    const current = this.state.resources[r.toLowerCase()] || 0;
                    if (current < cost) {
                        console.warn(`[生產攔截] 資源不足: ${r}, 需要 ${cost}, 目前 ${current}`);
                        this.triggerWarning("1", [r.toUpperCase()]);
                        return;
                    }
                }
            }
            // 扣額 (必須先通過上方的全部檢查)
            for (let r in cfg.costs) {
                const cost = cfg.costs[r];
                if (cost > 0) {
                    this.state.resources[r.toLowerCase()] -= cost;
                    console.log(`[生產扣費] ${r}: -${cost}, 剩餘: ${this.state.resources[r.toLowerCase()]}`);
                }
            }
        }

        building.queue.push(configName);
        if (building.queue.length === 1 && (building.productionTimer || 0) <= 0) {
            building.productionTimer = 5;
        }
        this.addLog(`${building.name} 加入生產隊列：${configName} (${building.queue.length}/10)`);

        if (window.UIManager) window.UIManager.updateValues(true);
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
