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
        lastMaxPop: 0, // 追蹤上次的人口上限
        hasHitPopLimit: false // 追蹤是否已經提示過人口已滿
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
    }

    static initBackgroundWorker() {
        const blob = new Blob([`
            setInterval(() => { self.postMessage('tick'); }, 50);
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
                    if (this.state.currentGlobalCommand === 'RETURN') {
                        newV.state = 'MOVING_TO_BASE'; newV.isRecalled = true;
                    } else if (this.state.currentGlobalCommand === 'IDLE') {
                        newV.state = 'IDLE';
                    } else {
                        newV.type = this.state.currentGlobalCommand;
                        newV.state = 'MOVING_TO_RESOURCE';
                    }
                }
                this.state.villageProductionTimer = this.state.villageQueue.length > 0 ? 5 : 0;
            }
        }

        this.state.units.villagers.forEach(v => { this.updateVillagerMovement(v, deltaTime); });
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

    static async loadNPCConfig() {
        try {
            const response = await fetch('/config/npc_data.csv?v=' + Date.now());
            const data = this.parseCSV(await response.text());
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
                    costs: this.parseResourceObject(row[idxNeed])
                };
            }
        } catch (e) { }
    }

    static async loadSystemConfig() {
        try {
            const response = await fetch('/config/system_config.csv?v=' + Date.now());
            const data = this.parseCSV(await response.text());
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
            const resp = await fetch('config/strings.csv?v=' + Date.now());
            const buffer = await resp.arrayBuffer();
            let text;
            
            try {
                // 嘗試以 UTF-8 嚴格模式編碼 (fatal: true 會在遇到非 UTF-8 字元時拋出錯誤)
                text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
                console.log("CSV 成功以 UTF-8 模式加載");
            } catch (e) {
                // 如果拋出錯誤，則強制使用 Big5 (繁體中文 ANSI)
                console.warn("UTF-8 驗證失敗，切換至 Big5 編碼系統...");
                text = new TextDecoder("big5").decode(buffer);
            }

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
            const response = await fetch('/config/resources_data.csv?v=' + Date.now());
            const data = this.parseCSV(await response.text());
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
            const response = await fetch('/config/buildings.csv?v=' + Date.now());
            const data = this.parseCSV(await response.text());
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const idxModel = headers.indexOf('model'), idxCol = headers.indexOf('collision'), idxSize = headers.indexOf('size'), idxPop = headers.indexOf('population'), idxNeed = headers.indexOf('need_resource'), idxName = headers.indexOf('name'), idxMax = headers.indexOf('max_count');
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
                    maxCount: parseInt(row[idxMax]) || 999
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
        v.targetBase = this.findNearestDepositPoint(v.x, v.y) || { x: 960, y: 560 };
        const oldX = v.x, oldY = v.y;
        const moveSpeed = (v.config.speed || 5.5) * 10;

        if (this.isColliding(v.x, v.y)) {
            const safe = this.findSafePos(v.x, v.y);
            v.x = safe.x; v.y = safe.y;
            v.pathTarget = null;
        }

        switch (v.state) {
            case 'IDLE':
                const idleSpeed = (this.state.systemConfig.village_standby_speed || 3) * 10;
                const idleRange = this.state.systemConfig.village_standby_range || 150;
                if (!v.idleTarget) {
                    if (v.waitTimer > 0) { v.waitTimer -= dt; return; }
                    const angle = Math.random() * Math.PI * 2, r = Math.random() * idleRange + 120;
                    v.idleTarget = { x: v.targetBase.x + Math.cos(angle) * r, y: v.targetBase.y + Math.sin(angle) * r };
                    v.pathTarget = null;
                }
                this.moveDetailed(v, v.idleTarget.x, v.idleTarget.y, idleSpeed, dt);
                if (Math.hypot(v.x - v.idleTarget.x, v.y - v.idleTarget.y) < 5) {
                    v.idleTarget = null; v.waitTimer = 1 + Math.random() * 2; v.pathTarget = null;
                }
                break;
            case 'MOVING_TO_RESOURCE':
                const target = this.findNearestResource(v.x, v.y, v.type);
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
                const harvestTime = v.config.collection_speed || 2; // 假設採集時間
                if (v.gatherTimer >= harvestTime) {
                    const harvestTotal = 20; // 每次採集的數量
                    if (v.targetId) {
                        const canTake = Math.min(harvestTotal, v.targetId.amount);
                        v.targetId.amount -= canTake;
                        v.cargo = canTake;
                        if (v.targetId.amount <= 0) {
                            this.state.mapEntities = this.state.mapEntities.filter(e => e !== v.targetId);
                            v.targetId = null;
                        }
                    }
                    v.state = 'MOVING_TO_BASE';
                    v.pathTarget = null;
                }
                break;
            case 'MOVING_TO_BASE':
                const distB = Math.hypot(v.targetBase.x - v.x, v.targetBase.y - v.y);
                if (distB < 140) { // 增加交互半徑至 140，確保大建築物邊緣也能觸發
                    this.depositResource(v.type, v.cargo);
                    v.cargo = 0; v.pathTarget = null;
                    if (v.isRecalled) { v.state = 'IDLE'; v.isRecalled = false; v.idleTarget = null; }
                    else { v.state = 'MOVING_TO_RESOURCE'; }
                } else {
                    this.moveDetailed(v, v.targetBase.x, v.targetBase.y, moveSpeed, dt);
                }
                break;
        }

        if (this.isColliding(v.x, v.y)) {
            v.pathTarget = null;
            if (this.isColliding(oldX, oldY)) {
                const safe = this.findSafePos(v.x, v.y);
                v.x = safe.x; v.y = safe.y;
                v.pathTarget = null;
            } else {
                v.x = oldX; v.y = oldY;
            }
            if (v.state === 'IDLE') v.idleTarget = null;
            // 靠近基地即便撞牆也算存款 (加寬範圍至 150)
            if (v.state === 'MOVING_TO_BASE' && Math.hypot(v.x - v.targetBase.x, v.y - v.targetBase.y) < 150) {
                this.depositResource(v.type, v.cargo);
                v.cargo = 0; v.state = v.isRecalled ? 'IDLE' : 'MOVING_TO_RESOURCE'; v.isRecalled = false; v.pathTarget = null;
            }
        }
    }

    static findNearestDepositPoint(x, y) {
        let nearest = null; let minDist = Infinity;
        this.state.mapEntities.forEach(e => {
            if (e.type === 'village' || e.type === 'warehouse') {
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
        const dx = tx - v.x, dy = ty - v.y, dist = Math.hypot(dx, dy);
        if (dist > 1) {
            v.x += (dx / dist) * speed * dt;
            v.y += (dy / dist) * speed * dt;
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

    static findNearestResource(x, y, type) {
        let nearest = null; let minDist = Infinity;
        this.state.mapEntities.forEach(e => {
            if (e.resourceType === type) {
                const d = Math.hypot(e.x - x, e.y - y);
                if (d < minDist) { minDist = d; nearest = e; }
            }
        });
        return nearest;
    }

    static depositResource(type, amount) {
        const resKey = type.toLowerCase();
        if (this.state.resources.hasOwnProperty(resKey)) this.state.resources[resKey] += amount;
        else if (type === 'FOOD') this.state.resources.food += amount;
        this.addLog(`存入了 ${amount} 單位的 ${type}。`);
    }

    static setCommand(commandType) {
        this.state.currentGlobalCommand = commandType;
        if (commandType === 'RETURN') {
            this.state.units.villagers.forEach(v => { v.state = 'MOVING_TO_BASE'; v.isRecalled = true; v.pathTarget = null; });
            // UI 更新循環 (提高頻率至 10Hz 以實現即時反饋)
            setInterval(() => {
                if (window.UIManager) window.UIManager.updateValues();
            }, 100);
            return;
        }
        this.addLog(`全員動員：開始採集 ${commandType}。`);
        this.state.units.villagers.forEach(v => { v.type = commandType; v.state = 'MOVING_TO_RESOURCE'; v.targetId = null; v.isRecalled = false; v.pathTarget = null; });
        
        // 立即刷新 UI
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
        this.state.mapEntities.push({ type: type, x: x, y: y, name: "新建建築" });
        if (type === 'farmhouse') this.state.buildings.farmhouse++;
        this.addLog(`建造成功：${cfg.name}。`);
    }
}
