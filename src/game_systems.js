/**
 * 核心遊戲邏輯系統
 * 處理生產線、資源更新、碰撞、人口上限與 A* 尋路
 */
export class GameEngine {
    static TILE_SIZE = 80;

    static state = {
        resources: { healthPotion: 0, soul: 100, gold: 100, wood: 200, stone: 0, food: 0, mana: 0 },
        buildings: { village: 1, farmhouse: 0 },
        units: { villagers: [], priest: 0, mage: 0, archmage: 0 },
        mapEntities: [],
        log: ["暗黑煉金工廠：末日準備中..."],
        npcConfigs: {},
        systemConfig: { village_standby_range: 150, village_standby_speed: 3 },
        resourceConfigs: [],
        buildingConfigs: {},
        placingType: null,
        previewPos: null,
        villageQueue: [],
        villageProductionTimer: 0,
        currentGlobalCommand: 'IDLE',
        strings: {}, // 存放從 strings.csv 讀取的訊息資料
        lastMaxPop: 0, 
        hasHitPopLimit: false,
        assignmentTimer: 0 // 用於定期分配過載/空閒工人
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
        this.generateMap();

        this.spawnVillager('villagers');
        this.spawnVillager('female villagers');
        this.spawnVillager('villagers');

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
            setInterval(() => { self.postMessage('tick'); }, 20); // 提高頻率至 50FPS (20ms)
        `], { type: "text/javascript" });
        const worker = new Worker(URL.createObjectURL(blob));
        worker.onmessage = () => { this.logicTick(); };
        console.log("背景執行 Worker 已啟動");
    }

    static logicTick() {
        const now = Date.now();
        const deltaTime = Math.min((now - this.lastTickTime) / 1000, 0.2);
        this.lastTickTime = now;

        // 處理村民生產隊伍
        if (this.state.villageQueue.length > 0) {
            const maxPop = this.getMaxPopulation();
            const isPopFull = this.state.units.villagers.length >= maxPop;

            // 偵測人口上限變動
            if (this.state.lastMaxPop > 0 && maxPop > this.state.lastMaxPop) {
                this.triggerWarning("3", [maxPop]);
            }
            this.state.lastMaxPop = maxPop;

            if (!isPopFull) {
                this.state.villageProductionTimer -= deltaTime;
                this.state.hasHitPopLimit = false; // 重置提示標記
            } else if (this.state.villageProductionTimer <= 0.1) {
                this.state.villageProductionTimer = 0;
                // 僅在第一次達到上限時提示一次 (或是狀態轉變時)
                if (!this.state.hasHitPopLimit) {
                    this.triggerWarning("2");
                    this.state.hasHitPopLimit = true;
                }
            } else {
                this.state.villageProductionTimer -= deltaTime;
            }

            if (this.state.villageProductionTimer <= 0 && !isPopFull) {
                const configName = this.state.villageQueue.shift();
                const success = this.spawnVillager(configName);
                if (success) {
                    const newV = this.state.units.villagers[this.state.units.villagers.length - 1];
                    // 生產出來的村民預設為 IDLE，讓分配引擎或建造系統優先調度
                    newV.state = 'IDLE';
                    newV.isRecalled = (this.state.currentGlobalCommand === 'RETURN');
                }
                this.state.villageProductionTimer = this.state.villageQueue.length > 0 ? 5 : 0;
            }
        }

        this.state.units.villagers.forEach(v => { this.updateVillagerMovement(v, deltaTime); });

        // 每秒執行一次工人分配邏輯
        this.state.assignmentTimer += deltaTime;
        if (this.state.assignmentTimer >= 1.0) {
            this.updateWorkerAssignments();
            this.state.assignmentTimer = 0;
        }
    }

    static parseCSV(text) {
        const rows = text.split(/\r?\n/).map(row => {
            const matches = row.match(/(".*?"|[^,]+)/g);
            return matches ? matches.map(m => m.replace(/^"|"$/g, '')) : [];
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
            const idxName = headers.indexOf('name'), 
                  idxSpeed = headers.indexOf('speed'), 
                  idxCollect = headers.indexOf('collection_speed'),
                  idxNeed = headers.indexOf('need_resource');
            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxName]) continue;
                this.state.npcConfigs[row[idxName].trim()] = {
                    name: row[idxName].trim(), 
                    speed: parseFloat(row[idxSpeed]) || 5.5, 
                    collection_speed: parseFloat(row[idxCollect]) || 10,
                    collection_amount: parseFloat(row[headers.indexOf('collection_resource')]) || 20,
                    costs: this.parseResourceObject(row[idxNeed])
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
                } else {
                    this.state.systemConfig[type] = parseFloat(val);
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
            const idxName = headers.indexOf('name'), idxModel = headers.indexOf('model'), idxType = headers.indexOf('type'), idxYield = headers.indexOf('collection_speed'), idxDensity = headers.indexOf('density'), idxLv = headers.indexOf('lv');
            this.state.resourceConfigs = [];
            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxName]) continue;
                this.state.resourceConfigs.push({
                    name: row[idxName].trim(), model: row[idxModel].trim(), type: row[idxType].trim().toUpperCase(),
                    amount: parseInt(row[idxYield]) || 100, density: parseInt(row[idxDensity]) || 5,
                    lv: parseInt(row[idxLv]) || 1
                });
            }
        } catch (e) { }
    }

    static async loadBuildingConfig() {
        try {
            const text = await this.fetchCSVText('/config/buildings.csv');
            const data = this.parseCSV(text);
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const idxModel = headers.indexOf('model'), idxCol = headers.indexOf('collision'), idxSize = headers.indexOf('size'), idxPop = headers.indexOf('population'), idxNeed = headers.indexOf('need_resource'), idxName = headers.indexOf('name'), idxMax = headers.indexOf('max_count'), idxTime = headers.indexOf('building_times');
            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxModel]) continue;
                this.state.buildingConfigs[row[idxModel].trim()] = {
                    name: row[idxName] ? row[idxName].trim() : row[idxModel].trim(),
                    model: row[idxModel].trim(),
                    collision: row[idxCol] === '1',
                    size: row[idxSize] || "{1,1}",
                    population: parseInt(row[idxPop]) || 0,
                    costs: this.parseResourceObject(row[idxNeed]),
                    maxCount: parseInt(row[idxMax]) || 999,
                    buildTime: parseFloat(row[idxTime]) || 5,
                    resourceValue: parseInt(row[headers.indexOf('resource_value')]) || 0
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

    static spawnVillager(configName) {
        const currentPop = this.state.units.villagers.length;
        const maxPop = this.getMaxPopulation();
        if (currentPop >= maxPop && this.isStarted) {
            this.addLog(`人口上限已達 (${maxPop})，請建造農舍！`);
            return false;
        }
        let config = this.state.npcConfigs[configName] || { speed: 5.5, collection_speed: 10 };
        this.state.units.villagers.push({
            id: Date.now() + Math.random(), x: 960 + 120, y: 560 + 120,
            state: 'IDLE', targetId: null, cargo: 0, type: 'WOOD', config: config,
            configName: configName, gatherTimer: 0, idleTarget: null, waitTimer: 0, pathTarget: null
        });
        return true;
    }

    static getMaxPopulation() {
        let total = 0;
        this.state.mapEntities.forEach(ent => {
            if (ent.isUnderConstruction) return; // 施工中的建築不提供人口
            const cfg = this.state.buildingConfigs[ent.type];
            if (cfg && cfg.population) total += cfg.population;
        });
        return total || 5;
    }

    static generateMap() {
        this.state.mapEntities = [];
        const occupied = new Set();
        const markOccupied = (x, y, type) => {
            const cfg = this.state.buildingConfigs[type];
            let uw = 1, uh = 1;
            if (cfg) {
                const em = cfg.size.match(/\{(\d+),(\d+)\}/);
                if (em) { uw = parseInt(em[1]); uh = parseInt(em[2]); }
            }
            const w = uw * this.TILE_SIZE, h = uh * this.TILE_SIZE;
            const gx = Math.round((x - w / 2) / this.TILE_SIZE);
            const gy = Math.round((y - h / 2) / this.TILE_SIZE);
            for (let i = 0; i < uw; i++) {
                for (let j = 0; j < uh; j++) occupied.add(`${gx + i},${gy + j}`);
            }
        };

        this.state.mapEntities.push({ type: 'village', x: 960, y: 560, name: "村莊中心" });
        markOccupied(960, 560, 'village');
        this.state.mapEntities.push({ type: 'campfire', x: 1100, y: 640, name: "小火堆" });
        markOccupied(1100, 640, 'campfire');

        if (this.state.resourceConfigs.length > 0) {
            this.state.resourceConfigs.forEach(cfg => {
                let count = 0; let attempts = 0;
                while (count < cfg.density && attempts < 200) {
                    attempts++;
                    const gx = Math.floor(Math.random() * 40 - 20) + 12;
                    const gy = Math.floor(Math.random() * 25 - 12) + 7;
                    if (occupied.has(`${gx},${gy}`)) continue;
                    const x = gx * this.TILE_SIZE + this.TILE_SIZE / 2;
                    const y = gy * this.TILE_SIZE + this.TILE_SIZE / 2;
                    if (Math.abs(x - 960) < 240 && Math.abs(y - 560) < 240) continue;
                    this.state.mapEntities.push({ type: cfg.model, resourceType: cfg.type, x, y, amount: cfg.amount, level: cfg.lv, name: cfg.name });
                    occupied.add(`${gx},${gy}`);
                    count++;
                }
            });
        }
    }

    static findSafePos(x, y) {
        const TS = this.TILE_SIZE;
        const gx = Math.floor(x / TS), gy = Math.floor(y / TS);
        const obstacles = this.getObstacleGrid();
        if (!obstacles.has(`${gx},${gy}`)) return { x, y };
        for (let r = 1; r < 5; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    if (!obstacles.has(`${gx + dx},${gy + dy}`)) {
                        return { x: (gx + dx) * TS + TS / 2, y: (gy + dy) * TS + TS / 2 };
                    }
                }
            }
        }
        return { x, y };
    }

    static productionTick() {
        if (this.state.buildings.alchemy_lab > 0 && this.state.resources.wood >= 5) {
            this.state.resources.wood -= 5;
            this.state.resources.healthPotion += 5;
        }
    }

    static updateVillagerMovement(v, dt) {
        // 優先前往分派的倉庫，否則前往最近存放點
        if (v.assignedWarehouseId) {
            const w = this.state.mapEntities.find(e => (e.id || `${e.type}_${e.x}_${e.y}`) === v.assignedWarehouseId);
            if (w && !w.isUnderConstruction) { v.targetBase = w; }
            else { v.assignedWarehouseId = null; v.targetBase = this.findNearestDepositPoint(v.x, v.y, v.type) || { x: 960, y: 560 }; }
        } else {
            v.targetBase = this.findNearestDepositPoint(v.x, v.y, v.type) || { x: 960, y: 560 };
        }
        const oldX = v.x, oldY = v.y;
        const configSpeed = (v.state === 'IDLE' ? (this.state.systemConfig.village_standby_speed || 3) : (v.config.speed || 5.5));
        const moveSpeed = configSpeed * 13; // 統一係數，並略微調高基礎速度感

        switch (v.state) {
            case 'IDLE':
                const idleRange = this.state.systemConfig.village_standby_range || 150;
                if (!v.idleTarget) {
                    if (v.waitTimer > 0) { v.waitTimer -= dt; return; }
                    const angle = Math.random() * Math.PI * 2, r = Math.random() * idleRange + 120;
                    v.idleTarget = { x: v.targetBase.x + Math.cos(angle) * r, y: v.targetBase.y + Math.sin(angle) * r };
                    v.pathTarget = null;
                }
                this.moveDetailed(v, v.idleTarget.x, v.idleTarget.y, moveSpeed, dt);
                if (Math.hypot(v.x - v.idleTarget.x, v.y - v.idleTarget.y) < 5) {
                    v.idleTarget = null; v.waitTimer = 1 + Math.random() * 2; v.pathTarget = null;
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
                    const dist = Math.hypot(target.x - v.x, target.y - v.y);
                    if (dist < 15) {
                        v.state = 'GATHERING'; v.targetId = target; v.gatherTimer = 0; v.pathTarget = null;
                    }
                    else { this.moveDetailed(v, target.x, target.y, moveSpeed, dt); }
                } else { v.state = 'IDLE'; v.pathTarget = null; }
                break;
            case 'GATHERING':
                v.gatherTimer += dt;
                const harvestTime = v.config.collection_speed || 2; // 採集時間 (秒)
                if (v.gatherTimer >= harvestTime) {
                    const harvestTotal = v.config.collection_amount || 20; // 每次採集的數量
                    if (v.targetId) {
                        const canTake = Math.min(harvestTotal, v.targetId.amount);
                        v.targetId.amount -= canTake;
                        
                        // 如果是農田，直接入庫，不增加負重，不回村中心
                        if (v.targetId.type === 'farmland') {
                            this.state.resources.food += canTake;
                            v.cargo = 0;
                            v.gatherTimer = 0; // 重置計時器，原地繼續採集
                            
                            if (v.targetId.amount <= 0) {
                                this.addLog(`${v.targetId.name || '農田'} 已枯竭。`);
                                this.state.mapEntities = this.state.mapEntities.filter(e => e !== v.targetId);
                                v.targetId = null;
                                v.state = 'IDLE';
                                v.pathTarget = null;
                            }
                        } else {
                            // 一般資源點，照常運送
                            v.cargo = canTake;
                            if (v.targetId.amount <= 0) {
                                this.state.mapEntities = this.state.mapEntities.filter(e => e !== v.targetId);
                                v.targetId = null;
                            }
                            v.state = 'MOVING_TO_BASE';
                            v.pathTarget = null;
                        }
                    }
                }
                break;
            case 'MOVING_TO_BASE':
                const cfgB = this.state.buildingConfigs[v.targetBase.type];
                let depositDist = 60;
                if (cfgB && cfgB.size) {
                    const m = cfgB.size.match(/\{(\d+),(\d+)\}/);
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
                    const m = cfgC.size.match(/\{(\d+),(\d+)\}/);
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
                    v.constructionTarget.isUnderConstruction = false;
                    const type = v.constructionTarget.type;
                    v.constructionTarget.name = this.state.buildingConfigs[type].name;
                    
                    // 如果是農田，初始化資源量並設為資源節點
                    if (type === 'farmland') {
                        v.constructionTarget.resourceType = 'FOOD';
                        v.constructionTarget.amount = this.state.buildingConfigs[type].resourceValue || 500;
                    }

                    if (type === 'farmhouse') this.state.buildings.farmhouse++;
                    this.addLog(`建造完成：${this.state.buildingConfigs[type].name}。`);
                    
                    // 自動指派後續工作：優先尋找下一個「最近」且需建造的目標
                    let nextConstruction = null;
                    let minCDist = Infinity;
                    this.state.mapEntities.forEach(e => {
                        if (e.isUnderConstruction && e !== v.constructionTarget) {
                            const d = Math.hypot(e.x - v.x, e.y - v.y);
                            if (d < minCDist) { minCDist = d; nextConstruction = e; }
                        }
                    });
                    
                    if (nextConstruction) {
                        v.state = 'MOVING_TO_CONSTRUCTION';
                        v.constructionTarget = nextConstruction;
                        v.pathTarget = null;
                        this.addLog(`工人前往建設下一個目標：${nextConstruction.name || nextConstruction.type}。`);
                    } else if (['timber_factory', 'stone_factory', 'barn'].includes(type)) {
                        // 倉庫建造完後，建造者自動轉為該倉庫的專職員工
                        v.assignedWarehouseId = (v.constructionTarget.id || `${v.constructionTarget.type}_${v.constructionTarget.x}_${v.constructionTarget.y}`);
                        v.type = (type === 'timber_factory' ? 'WOOD' : (type === 'stone_factory' ? 'STONE' : 'FOOD'));
                        v.state = 'MOVING_TO_RESOURCE';
                        v.targetId = null; v.pathTarget = null; v.prevTask = null;
                        this.addLog(`建造者已自動轉為 ${v.constructionTarget.name} 的專職員工。`);
                    } else if (type === 'farmland') {
                        // 農田建造完後，建造者直接原地開始採集，佔住坑位
                        v.type = 'FOOD'; v.state = 'GATHERING'; v.targetId = v.constructionTarget; v.gatherTimer = 0; v.pathTarget = null; v.prevTask = null;
                        this.addLog(`建造者 ${cfg.name} 開始原地耕作。`);
                    } else if (type === 'barn') {
                        v.type = 'FOOD'; v.state = 'MOVING_TO_RESOURCE'; v.targetId = null; v.pathTarget = null; v.prevTask = null;
                    } else {
                        this.restoreVillagerTask(v);
                    }
                    v.constructionTarget = null;
                }
                break;
        }

        // 在移動結束後統一檢查碰撞，避免忽快忽慢的跳動
        if (this.isColliding(v.x, v.y)) {
            v.pathTarget = null;
            if (this.isColliding(oldX, oldY)) {
                // 如果舊位置也撞牆，強行找附近的安全點
                const safe = this.findSafePos(v.x, v.y);
                v.x = safe.x; v.y = safe.y;
            } else {
                // 回退到舊位置
                v.x = oldX; v.y = oldY;
            }
            if (v.state === 'IDLE') v.idleTarget = null;
            // 靠近基地即便撞牆也算存款 (加寬範圍至 150)
            if (v.state === 'MOVING_TO_BASE') {
                const cfgB = this.state.buildingConfigs[v.targetBase.type];
                let depositDist = 60;
                if (cfgB && cfgB.size) {
                    const m = cfgB.size.match(/\{(\d+),(\d+)\}/);
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
                    } else {
                        v.state = v.isRecalled ? 'IDLE' : 'MOVING_TO_RESOURCE';
                        v.isRecalled = false;
                    }
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
            v.state = 'IDLE';
        }
        v.pathTarget = null;
    }

    static findNearestDepositPoint(x, y, resourceType = 'WOOD') {
        let nearest = null; let minDist = Infinity;
        const resType = (resourceType || 'WOOD').toUpperCase();

        this.state.mapEntities.forEach(e => {
            if (e.isUnderConstruction) return;

            let isMatch = false;
            // 一般工人只能將資源存放在村莊中心 (village)
            if (e.type === 'village') isMatch = true;

            if (isMatch) {
                const d = Math.hypot(e.x - x, e.y - y);
                if (d < minDist) { minDist = d; nearest = e; }
            }
        });
        return nearest;
    }

    static moveDetailed(v, tx, ty, speed, dt) {
        if (!v.pathTarget || Math.hypot(v.x - v.pathTarget.x, v.y - v.pathTarget.y) < 10) {
            v.pathTarget = this.findNextStep(v.x, v.y, tx, ty);
        }
        this.moveTowards(v, v.pathTarget.x, v.pathTarget.y, speed, dt);
    }

    static moveTowards(v, tx, ty, speed, dt) {
        const dx = tx - v.x, dy = ty - v.y;
        const dist = Math.hypot(dx, dy);
        const moveDist = speed * dt;

        if (dist > moveDist) {
            v.x += (dx / dist) * moveDist;
            v.y += (dy / dist) * moveDist;
        } else if (dist > 0.1) {
            v.x = tx;
            v.y = ty;
        }
    }

    static findNextStep(startX, startY, targetX, targetY) {
        const TS = this.TILE_SIZE;
        const startGX = Math.floor(startX / TS), startGY = Math.floor(startY / TS);
        const targetGX = Math.floor(targetX / TS), targetGY = Math.floor(targetY / TS);
        if (startGX === targetGX && startGY === targetGY) return { x: targetX, y: targetY };

        // 識別目標是否在某個建築物內，如果是，整個建築物都是目標
        const targetCells = new Set();
        const targetEnt = this.state.mapEntities.find(ent => {
            const cfg = this.state.buildingConfigs[ent.type];
            if (!cfg || !cfg.collision) return false;
            const em = cfg.size.match(/\{(\d+),(\d+)\}/);
            const uw = em ? parseInt(em[1]) : 1, uh = em ? parseInt(em[2]) : 1;
            const w = uw * TS, h = uh * TS;
            return targetX > ent.x - w / 2 && targetX < ent.x + w / 2 && targetY > ent.y - h / 2 && targetY < ent.y + h / 2;
        });

        if (targetEnt) {
            const em = this.state.buildingConfigs[targetEnt.type].size.match(/\{(\d+),(\d+)\}/);
            const uw = em ? parseInt(em[1]) : 1, uh = em ? parseInt(em[2]) : 1;
            const tgx = Math.round((targetEnt.x - (uw * TS / 2)) / TS);
            const tgy = Math.round((targetEnt.y - (uh * TS / 2)) / TS);
            for (let i = 0; i < uw; i++) {
                for (let j = 0; j < uh; j++) targetCells.add(`${tgx + i},${tgy + j}`);
            }
        } else {
            targetCells.add(`${targetGX},${targetGY}`);
        }

        const queue = [[startGX, startGY, null]];
        const visited = new Set([`${startGX},${startGY}`]);
        const obstacles = this.getObstacleGrid();

        let iterations = 0;
        while (queue.length > 0 && iterations < 1500) {
            iterations++;
            const [gx, gy, firstStep] = queue.shift();
            if (targetCells.has(`${gx},${gy}`)) {
                const res = firstStep || [gx, gy];
                return { x: res[0] * TS + TS / 2, y: res[1] * TS + TS / 2 };
            }
            const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
            for (const [dx, dy] of neighbors) {
                const nx = gx + dx, ny = gy + dy;
                const key = `${nx},${ny}`;
                if (!visited.has(key) && (!obstacles.has(key) || targetCells.has(key))) {
                    visited.add(key);
                    queue.push([nx, ny, firstStep || [nx, ny]]);
                }
            }
        }
        return { x: targetX, y: targetY };
    }

    static getObstacleGrid() {
        const grid = new Set();
        this.state.mapEntities.forEach(ent => {
            const cfg = this.state.buildingConfigs[ent.type];
            if (cfg && cfg.collision) {
                const em = cfg.size.match(/\{(\d+),(\d+)\}/);
                const uw = em ? parseInt(em[1]) : 1, uh = em ? parseInt(em[2]) : 1;
                const w = uw * this.TILE_SIZE, h = uh * this.TILE_SIZE;
                const gx = Math.round((ent.x - w / 2) / this.TILE_SIZE);
                const gy = Math.round((ent.y - h / 2) / this.TILE_SIZE);
                for (let i = 0; i < uw; i++) {
                    for (let j = 0; j < uh; j++) grid.add(`${gx + i},${gy + j}`);
                }
            }
        });
        return grid;
    }

    static isColliding(x, y) {
        return this.state.mapEntities.some(ent => {
            const cfg = this.state.buildingConfigs[ent.type];
            if (cfg && cfg.collision) {
                const match = cfg.size.match(/\{(\d+),(\d+)\}/);
                const uw = match ? parseInt(match[1]) : 1, uh = match ? parseInt(match[2]) : 1;
                const w = uw * this.TILE_SIZE, h = uh * this.TILE_SIZE;
                return x > ent.x - w / 2 && x < ent.x + w / 2 && y > ent.y - h / 2 && y < ent.y + h / 2;
            }
            return false;
        });
    }

    static isAreaClear(x, y, type) {
        const cfg = this.state.buildingConfigs[type];
        if (!cfg) return true;
        const match = cfg.size.match(/\{(\d+),(\d+)\}/);
        const uw = match ? parseInt(match[1]) : 1, uh = match ? parseInt(match[2]) : 1;
        const w = uw * this.TILE_SIZE, h = uh * this.TILE_SIZE;
        const hitEntity = this.state.mapEntities.some(ent => {
            const ecfg = this.state.buildingConfigs[ent.type];
            let ew = this.TILE_SIZE, eh = this.TILE_SIZE;
            if (ecfg) {
                const em = ecfg.size.match(/\{(\d+),(\d+)\}/);
                ew = em ? parseInt(em[1]) * this.TILE_SIZE : this.TILE_SIZE;
                eh = em ? parseInt(em[2]) * this.TILE_SIZE : this.TILE_SIZE;
            }
            return Math.abs(x - ent.x) < (w + ew) / 2 - 5 && Math.abs(y - ent.y) < (h + eh) / 2 - 5;
        });
        if (hitEntity) return false;
        const hitVillager = this.state.units.villagers.some(v => Math.abs(x - v.x) < w / 2 + 10 && Math.abs(y - v.y) < h / 2 + 10);
        return !hitVillager;
    }

    static findNearestResource(x, y, type, villagerId) {
        let nearest = null; let minDist = Infinity;
        this.state.mapEntities.forEach(e => {
            if (e.resourceType === type) {
                // 如果是農田，檢查是否已有其他工人在目標中 (鎖定坑位)
                if (e.type === 'farmland') {
                    const isOccupied = this.state.units.villagers.some(v => 
                        v.id !== villagerId && (v.targetId === e || v.constructionTarget === e)
                    );
                    if (isOccupied) return; 
                }

                const d = Math.hypot(e.x - x, e.y - y);
                if (d < minDist) { minDist = d; nearest = e; }
            }
        });
        return nearest;
    }

    static updateWorkerAssignments() {
        const warehouses = this.state.mapEntities.filter(e => 
            ['timber_factory', 'stone_factory', 'barn'].includes(e.type) && !e.isUnderConstruction
        );
        
        // 1. 回收所有失效倉庫的工人，並收集有效的分配情況
        const warehouseMap = new Map();
        warehouses.forEach(w => warehouseMap.set(w.id || `${w.type}_${w.x}_${w.y}`, { entity: w, workers: [] }));

        this.state.units.villagers.forEach(v => {
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
        let allIdle = this.state.units.villagers.filter(v => v.state === 'IDLE' && !v.assignedWarehouseId && !v.isRecalled);

        // 先釋放溢出的人手，回歸閒置池
        warehouseMap.forEach((data, wid) => {
            const { entity, workers } = data;
            const target = entity.targetWorkerCount || 0;
            if (workers.length > target) {
                const overflow = workers.slice(target);
                overflow.forEach(v => {
                    v.assignedWarehouseId = null;
                    v.state = 'IDLE';
                    v.targetId = null;
                    v.pathTarget = null;
                    allIdle.push(v);
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
                    v.type = (entity.type === 'timber_factory' ? 'WOOD' : (entity.type === 'stone_factory' ? 'STONE' : 'FOOD'));
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
        this.state.currentGlobalCommand = commandType;
        if (commandType === 'RETURN') {
            this.state.units.villagers.forEach(v => {
                // 正在建造的村民不執行回城指令，除非建造完成
                if (v.state === 'MOVING_TO_CONSTRUCTION' || v.state === 'CONSTRUCTING') return;
                v.state = 'MOVING_TO_BASE'; v.isRecalled = true; v.pathTarget = null;
            });
            if (window.UIManager) window.UIManager.updateValues();
            return;
        }
        this.addLog(`全員動員：開始採集 ${commandType}。`);
        this.state.units.villagers.forEach(v => {
            // 指令影響閒置中的工人，或是以村莊中心 (village) 為放置點的工人
            const isIdle = v.state === 'IDLE';
            const isVillageWorker = v.targetBase && v.targetBase.type === 'village';
            
            if (isIdle || isVillageWorker) {
                // 絕對禁止中斷正在建造中的工人
                if (v.state === 'CONSTRUCTING' || v.state === 'MOVING_TO_CONSTRUCTION') return;
                // 排除農田專員
                if (!isIdle && v.targetId && v.targetId.type === 'farmland') return;
                // 排除倉庫專員
                if (v.assignedWarehouseId) return;

                v.type = commandType; 
                v.state = 'MOVING_TO_RESOURCE'; 
                v.targetId = null; 
                v.isRecalled = false; 
                v.pathTarget = null;
            }
        });
        if (window.UIManager) window.UIManager.updateValues();
    }

    static addToVillageQueue(configName) {
        if (this.state.villageQueue.length >= 10) {
            this.addLog("生產隊伍已滿 (10/10)！");
            this.triggerWarning("4"); // 使用 strings.csv 中的 ID 4: 生產隊列已滿
            return;
        }

        // 檢查資源成本
        const cfg = this.state.npcConfigs[configName];
        if (cfg && cfg.costs) {
            for (let r in cfg.costs) {
                if (this.state.resources[r] < cfg.costs[r]) {
                    this.triggerWarning("1", [r.toUpperCase()]);
                    return;
                }
            }
            // 扣除資源
            for (let r in cfg.costs) {
                this.state.resources[r] -= cfg.costs[r];
            }
        }
        
        this.state.villageQueue.push(configName);
        if (this.state.villageQueue.length === 1 && this.state.villageProductionTimer <= 0) {
            this.state.villageProductionTimer = 5;
        }
        this.addLog(`已加入生產隊列：${configName} (${this.state.villageQueue.length}/10)`);
        
        // 立即刷新 UI
        if (window.UIManager) window.UIManager.updateValues();
    }

    static addLog(msg) {
        this.state.log.push(msg);
        if (this.state.log.length > 100) this.state.log.shift();
    }

    static placeBuilding(type, x, y) {
        const cfg = this.state.buildingConfigs[type];
        if (!cfg) return;
        const currentCount = this.state.mapEntities.filter(e => e.type === type).length;
        if (cfg.maxCount !== undefined && currentCount >= cfg.maxCount) {
            this.addLog(`建造失敗：${cfg.name} 數量已達上限！`);
            return;
        }
        // 檢查資源
        for (let r in cfg.costs) {
            if (this.state.resources[r] < cfg.costs[r]) {
                this.triggerWarning("1", [r.toUpperCase()]);
                return;
            }
        }
        const costs = cfg.costs; const res = this.state.resources;
        if (!this.isAreaClear(x, y, type)) { this.addLog("位置受阻！"); return; }
        res.food -= costs.food; res.wood -= costs.wood; res.stone -= costs.stone; res.gold -= costs.gold;
        
        const newBuilding = { 
            type: type, x: x, y: y, name: "施工中", 
            isUnderConstruction: true, buildProgress: 0, buildTime: cfg.buildTime,
            targetWorkerCount: ['timber_factory', 'stone_factory', 'barn'].includes(type) ? 1 : 0 // 倉庫新建後預設人數為 1
        };
        this.state.mapEntities.push(newBuilding);
        
        // 指派最近的村民
        const builder = this.findNearestAvailableVillager(x, y);
        if (builder) {
            this.addLog(`已指派村民前往建造 ${cfg.name}。`);
            // 保存當前任務
            builder.prevTask = { state: builder.state, targetId: builder.targetId, type: builder.type };
            builder.constructionTarget = newBuilding;
            
            if (builder.state === 'MOVING_TO_BASE' && builder.cargo > 0) {
                builder.nextStateAfterDeposit = 'MOVING_TO_CONSTRUCTION';
            } else {
                builder.state = 'MOVING_TO_CONSTRUCTION';
                builder.pathTarget = null;
            }
        } else {
            this.addLog(`警告：目前沒有空閒村民可以建造 ${cfg.name}！`);
            // 如果沒有村民，暫時還是直接完成，或者維持施工中等村民
        }
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
    }
}
