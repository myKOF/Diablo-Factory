import { UI_CONFIG } from "../ui/ui_config.js";
import { EffectSystem } from "./EffectSystem.js";
import { PathfindingSystem } from "./PathfindingSystem.js?v=3";
import { BattleSystem } from "./BattleSystem.js";
import { MapDataSystem } from "./MapDataSystem.js";
import { ResourceSystem } from "./ResourceSystem.js";



import { WorkerSystem } from "./WorkerSystem.js";
import { MapGenerator } from "./MapGenerator.js";
import { ConfigManager } from "./ConfigManager.js";
import { BuildingSystem } from "./BuildingSystem.js";
import { SynthesisSystem } from "./SynthesisSystem.js";




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
            showVisionRange: 0,     // 預設關閉視野圈 (0: 關閉, 1: 僅選中, 2: 全部)
            rightClickDrag: true    // 預設開啟右鍵拖拽
        },
        globalConstructionOrder: 1, // [新協定] 建築施工序列號，從小到大依次建造
        idToNameMap: {}, // NPC ID -> NPC Name (用於從 buildings.csv 定義的 ID 找配置)
        renderVersion: 0, // 用於通知渲染器強行刷新
        pathfinding: null, // 尋路系統實例
        selectedUnitIds: [], // 目前選中的單位 ID 列表
        selectedBuildingIds: [], // 目前選中的建築 ID 列表
        selectedResourceId: null, // 目前選中的資源 ID (gx_gy)
        selectedLogisticsLineId: null, // 目前選中的物流線實體 ID
        logisticsLines: [], // 已實體化的物流線段物件；每筆代表一個網格長度，並以 groupId 串成完整路線
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
        ConfigManager.setFallbackConfig(this.state);
        await ConfigManager.loadAllConfigs(this.state);

        // 尋路系統初始化
        this.state.pathfinding = new PathfindingSystem();
        this.state.pathfinding.tileSize = this.TILE_SIZE;
        this.state.pathfinding.setAcceptableTiles([0]);

        // [核心重構] 初始化子系統
        this.workerSystem = new WorkerSystem(this.state, this);

        MapGenerator.generateMap(this.state, this);

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
            if (typeof SynthesisSystem !== 'undefined') { SynthesisSystem.update(this.state, this, deltaTime); }

            // 4. 工人系統更新 (尋路、移動、任務分配)
            if (this.workerSystem) {
                this.workerSystem.update(deltaTime);
            }

        } catch (err) {
            console.error("Logic Loop Error:", err);
            this.addLog(`[系統錯誤] 邏輯循環異常: ${err.message}`, 'SYSTEM');
        }
    }

    static updateBuildingsLogic(deltaTime) { BuildingSystem.updateBuildingsLogic(this.state, this, deltaTime); }
    static startUpgrade(event, entity) { BuildingSystem.startUpgrade(this.state, this, event, entity); }
    static cancelUpgrade(event, entity) { BuildingSystem.cancelUpgrade(this.state, this, event, entity); }
    static addToProductionQueue(event, configName, sourceBuilding = null) { BuildingSystem.addToProductionQueue(this.state, this, event, configName, sourceBuilding); }
    static placeBuilding(type1, x, y) { return BuildingSystem.placeBuilding(this.state, this, type1, x, y); }
    static placeBuildingLine(type1, startX, startY, endX, endY) { BuildingSystem.placeBuildingLine(this.state, this, type1, startX, startY, endX, endY); }
    static getLinePositions(type1, startX, startY, endX, endY) { return BuildingSystem.getLinePositions(this.state, this, type1, startX, startY, endX, endY); }
    static destroyBuilding(ent) { BuildingSystem.destroyBuilding(this.state, this, ent); }
    static _executeSingleProduction(clickedConfigId, building) { BuildingSystem._executeSingleProduction(this.state, this, clickedConfigId, building); }
    static resolveAppropriateUnitId(clickedId, building) { return BuildingSystem.resolveAppropriateUnitId(this.state, this, clickedId, building); }


    static updateSpatialGrid() {
        MapGenerator.updateSpatialGrid(this.state, this);
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



    /**
     * 解析 "{food=100,wood=200}" 格式為成本對象 {food: 100, wood: 200, ...}
     */



    // 資源名稱對照表已統一於 ResourceSystem.RESOURCE_NAMES


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



    static getEntityConfig(type1, lv = 1) {
        if (!type1) return null;
        if (this.state.buildingConfigsByType && this.state.buildingConfigsByType[type1]) {
            return this.state.buildingConfigsByType[type1][lv] || this.state.buildingConfigsByType[type1][1];
        }
        if (this.state.buildingConfigs && this.state.buildingConfigs[type1]) {
            return this.state.buildingConfigs[type1];
        }
        if (this.state.resourceConfigs) {
            const resCfg = this.state.resourceConfigs.find(r => r.model === type1);
            if (resCfg) return resCfg;
        }
        return null;
    }




    static spawnNPC(targetIdOrName, building = null, options = null) {
        // 1. 解析最終配置名稱 (考慮隨機生產)
        let finalConfigName = targetIdOrName;
        if (this.state.idToNameMap[targetIdOrName]) {
            finalConfigName = this.state.idToNameMap[targetIdOrName];
        } else if (building) {
            const bCfg = this.getBuildingConfig(building.type1, building.lv || 1);
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
            if (building.rallyPoint) {
                const pos = GameEngine.getBuildingExitPointToward(building, building.rallyPoint);
                spawnX = pos.x;
                spawnY = pos.y;
            } else {
                const fp = GameEngine.getFootprint(building.type1);
                const perimeter = 2 * (fp.uw + fp.uh) + 4;
                const idx = building.spawnIdx;
                building.spawnIdx++;

                const currentIdx = idx % perimeter;
                const layer = Math.floor(idx / perimeter);
                const R = 1 + layer; // 距離邊緣的層數 (格)

                const pos = GameEngine.getBuildingPerimeterPos(building, currentIdx, R);
                spawnX = pos.x;
                spawnY = pos.y;
            }
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
            collection_resource: config.collection_resource || 1,
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
            v.rallySourceBuildingId = building.id || `${building.type1}_${building.x}_${building.y}`;

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
                            type1: 'RESOURCE',
                            resourceType: ['NONE', 'WOOD', 'STONE', 'FOOD', 'GOLD', 'IRON', 'COAL', 'MAGIC_HERB', 'WOLF', 'BEAR'][res.type]
                        };
                    }
                } else {
                    // 從單位或地圖實體(包含屍體)中尋找
                    targetEnt = this.state.units.villagers.find(u => u.id === rp.targetId) ||
                        this.state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === rp.targetId);
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
                } else if (this.isAssignableRallyBuilding(targetEnt)) {
                    const handled = this.workerSystem && this.workerSystem.handleWorkerCommand(v, targetEnt);
                    if (handled && v.assignedWarehouseId) {
                        v.isPlayerLocked = true;
                        GameEngine.addLog(`[集結] 已自動派駐至 ${targetEnt.name || targetEnt.type1}。`);
                    } else {
                        v.idleTarget = this.findAvailableRallySpot(this.resolveRallyStandPoint(rp, targetEnt, v));
                        v._isRallyMovement = true;
                        v.isPlayerLocked = true;
                    }
                } else if (targetEnt.type1 === 'RESOURCE' || targetEnt.type1 === 'corpse') {
                    // [核心修正] 支援屍體集結連動
                    v.state = 'MOVING_TO_RESOURCE';
                    v.targetId = targetEnt;
                    v.type = targetEnt.resourceType || targetEnt.resType; // 核心支援不同欄位名
                    v.isPlayerLocked = true;
                    GameEngine.addLog(`[集結] 已自動指派至採集 ${targetEnt.name || '資源'}。`);
                } else if (['farmland', 'tree_plantation'].includes(targetEnt.type1)) {
                    v.state = 'MOVING_TO_RESOURCE';
                    v.targetId = targetEnt;
                    v.type = (targetEnt.type1 === 'farmland' ? 'FOOD' : 'WOOD');
                    v.isPlayerLocked = true;
                    GameEngine.addLog(`[集結] 已加入資源田作業。`);
                } else if (['timber_factory', 'stone_factory', 'barn', 'gold_mining_factory'].includes(targetEnt.type1)) {
                    // [核心修復] 先設定歸屬，再增加需求，確保自動化邏輯不會搶先指派其它人。
                    v.assignedWarehouseId = targetEnt.id || `${targetEnt.type1}_${targetEnt.x}_${targetEnt.y}`;
                    this.adjustWarehouseWorkers(targetEnt, 1);
                    v.type = (targetEnt.type1 === 'timber_factory' ? 'WOOD' :
                        (targetEnt.type1 === 'stone_factory' ? 'STONE' :
                            (targetEnt.type1 === 'barn' ? 'FOOD' : 'GOLD')));
                    v.state = 'MOVING_TO_RESOURCE';
                    v.isPlayerLocked = true; // [核心修復] 鎖定狀態防止出生瞬間被 assignNextTask 覆蓋
                    GameEngine.addLog(`[集結] 已加入 ${targetEnt.name || targetEnt.type1} 採集隊列。`);
                } else if (targetEnt.hp !== undefined && (targetEnt.config.camp === 'enemy' || targetEnt.camp === 'enemy')) {
                    v.state = 'CHASE';
                    v.targetId = targetEnt.id;
                    v.isPlayerLocked = true;
                    GameEngine.addLog(`[集結] 正在追擊鎖定的敵軍！`);
                } else {
                    v.idleTarget = this.findAvailableRallySpot(this.resolveRallyStandPoint(rp, targetEnt, v));
                    v._isRallyMovement = true;
                    v.isPlayerLocked = true;
                }
            } else if (targetEnt && !isVillager) {
                const targetCamp = (targetEnt.config && targetEnt.config.camp) || targetEnt.camp || 'neutral';
                if (targetEnt.hp !== undefined && (targetCamp === 'enemy' || targetCamp === 'neutral')) {
                    v.state = 'CHASE';
                    v.targetId = targetEnt.id;
                    GameEngine.addLog(`[集結] 戰鬥單位正在攻擊目標 (${targetCamp === 'neutral' ? '中立物種' : '敵對目標'})！`);
                } else {
                    v.idleTarget = this.findAvailableRallySpot(this.resolveRallyStandPoint(rp, targetEnt, v));
                    v._isRallyMovement = true;
                    v.isPlayerLocked = true;
                }
            } else {
                const spot = this.findAvailableRallySpot(this.resolveRallyStandPoint(rp, targetEnt, v));
                v.idleTarget = spot;
                v._isRallyMovement = true;
                v.isPlayerLocked = true;
            }
        }

        // 僅在無明確集結指令時，才進入自動分派系統
        if (v.state === 'IDLE' && v.config.type === 'villagers') {
            this.assignNextTask(v);
        }
        return true;
    }

    static isAssignableRallyBuilding(entity) {
        if (!entity || entity.isUnderConstruction || !entity.type1) return false;
        const cfg = this.getBuildingConfig(entity.type1, entity.lv || 1);
        return !!(cfg && (cfg.need_villagers > 0 || (cfg.logistics && (cfg.logistics.canInput || cfg.logistics.canOutput))));
    }

    static resolveRallyStandPoint(rallyPoint, targetEnt = null, unit = null) {
        if (!rallyPoint) return { x: 0, y: 0 };
        const isBuildingTarget = targetEnt && rallyPoint.targetType === 'BUILDING' && targetEnt.type1 !== 'corpse';
        if (!isBuildingTarget) return rallyPoint;

        return GameEngine.getBuildingExitPointToward(
            targetEnt,
            unit ? { x: unit.x, y: unit.y } : rallyPoint,
            18
        );
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

    static getFootprint(lookupType1) {
        // [核心優先級] 1. 優先從 UI_CONFIG 讀取手動調整的長寬
        if (UI_CONFIG.BuildingPanel && UI_CONFIG.BuildingPanel.list) {
            const uiCfg = UI_CONFIG.BuildingPanel.list.find(item => item.id === lookupType1);
            if (uiCfg && uiCfg.width && uiCfg.height) {
                return { uw: uiCfg.width, uh: uiCfg.height };
            }
        }

        // 2. 回退至從 CSV 配置讀取
        const cfg = this.getEntityConfig(lookupType1);
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
        const fp = GameEngine.getFootprint(building.type1);
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

    /**
     * 取得建築朝指定目標方向的出口點，讓集結出生位置固定在合理的邊界上。
     */
    static getBuildingExitPointToward(building, target, outwardOffset = 8) {
        if (!building || !target) return { x: building ? building.x : 0, y: building ? building.y : 0 };

        const fp = GameEngine.getFootprint(building.type1);
        const TS = this.TILE_SIZE;
        const collCfg = UI_CONFIG.BuildingCollision || { feetOffset: 8 };
        const footY = collCfg.feetOffset || 0;
        const centerX = building.x;
        const centerY = building.y - footY;
        const halfW = Math.max(TS / 2, (fp.uw * TS) / 2);
        const halfH = Math.max(TS / 2, (fp.uh * TS) / 2);
        let dx = target.x - centerX;
        let dy = target.y - centerY;

        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
            return GameEngine.getBuildingPerimeterPos(building, 0, 1);
        }

        const tx = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Infinity;
        const ty = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Infinity;
        const t = Math.min(tx, ty);
        const len = Math.hypot(dx, dy) || 1;

        return {
            x: centerX + dx * t + (dx / len) * outwardOffset,
            y: centerY + dy * t + (dy / len) * outwardOffset
        };
    }

    static getBuildingConfig(type1, lv) {
        if (!this.state.buildingConfigsByType || !this.state.buildingConfigsByType[type1]) return null;
        return this.state.buildingConfigsByType[type1][lv] || null;
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
                const entType1 = ent.type1;
                // [修復] 只要目前等級夠，不論是否正在升級都算符合條件
                return entType1 === targetType && ent.lv >= targetLv && !ent.isUnderConstruction;
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



    static getMaxPopulation() {
        let total = 0;
        this.state.mapEntities.forEach(ent => {
            if (ent.isUnderConstruction) return;
            // 升級中的建築依然提供人口上限？通常是。
            const cfg = this.getBuildingConfig(ent.type1, ent.lv);
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
        MapGenerator.generateMap(this.state, this);
    }


    /**
     * 更新尋路用的格網數據 (將 mapEntities 轉換為 2D 陣列)
     */
    static updatePathfindingGrid() {
        MapGenerator.updatePathfindingGrid(this.state, this);
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


    static isAreaClear(x, y, type1, tempEntities = []) {
        const cfg = this.getEntityConfig(type1);
        if (!cfg) return true;
        const match = cfg.size ? cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/) : null;
        const uw = match ? parseInt(match[1]) : 1, uh = match ? parseInt(match[2]) : 1;
        const w = uw * this.TILE_SIZE, h = uh * this.TILE_SIZE;

        // 1. 檢查建築與實體碰撞
        const allToCheck = [...this.state.mapEntities, ...tempEntities];
        const hitEntity = allToCheck.some(ent => {
            const ecfg = this.getEntityConfig(ent.type1, ent.lv || 1);
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
    static depositResource(type1, amount) {
        ResourceSystem.depositResource(this.state, type1, amount, this.addLog.bind(this));
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
            if (v.targetId && (v.targetId.type1 === 'farmland' || v.targetId.type1 === 'tree_plantation')) return;

            // 只有「通用工人」(沒有被分配到特定採集場) 才受全域指令控制
            if (v.assignedWarehouseId) return;

            const isIdle = v.state === 'IDLE';
            const isVillageWorker = v.targetBase && v.targetBase.type1 === 'village';

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



    static addLog(msg, category = 'COMMON') {
        this.state.log.push({ msg, category, id: Date.now() + Math.random() });
        if (this.state.log.length > 100) this.state.log.shift();
    }



    static findNearestAvailableVillager(x, y) {
        return this.workerSystem ? this.workerSystem.findNearestAvailableVillager(x, y) : null;
    }



}
