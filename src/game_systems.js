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
        previewPos: null
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
            this.loadBuildingConfig()
        ]).catch(e => console.error(e));
        this.generateMap();

        this.spawnVillager('villagers');
        this.spawnVillager('female villagers');
        this.spawnVillager('villagers');

        this.lastTickTime = Date.now();
        this.gameLoop();
        setInterval(() => this.productionTick(), 1000);
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
            const idxName = headers.indexOf('name'), idxSpeed = headers.indexOf('speed'), idxCollect = headers.indexOf('collection_speed');
            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxName]) continue;
                this.state.npcConfigs[row[idxName].trim()] = {
                    name: row[idxName].trim(), speed: parseFloat(row[idxSpeed]) || 5.5, collection_speed: parseFloat(row[idxCollect]) || 10
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
                if (row[idxType]) this.state.systemConfig[row[idxType].trim()] = parseFloat(row[idxValue]);
            }
        } catch (e) { }
    }

    static async loadResourceConfig() {
        try {
            const response = await fetch('/config/resources_data.csv?v=' + Date.now());
            const data = this.parseCSV(await response.text());
            if (!data) return;
            const { rows, headerIdx, headers } = data;
            const idxName = headers.indexOf('name'), idxModel = headers.indexOf('model'), idxType = headers.indexOf('type'), idxYield = headers.indexOf('collection_speed'), idxDensity = headers.indexOf('density');
            this.state.resourceConfigs = [];
            for (let i = headerIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[idxName]) continue;
                this.state.resourceConfigs.push({
                    name: row[idxName].trim(), model: row[idxModel].trim(), type: row[idxType].trim().toUpperCase(), amount: parseInt(row[idxYield]) || 100, density: parseInt(row[idxDensity]) || 5
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
            const gx = Math.round((x - (uw % 2 === 0 ? 0 : this.TILE_SIZE/2)) / this.TILE_SIZE);
            const gy = Math.round((y - (uh % 2 === 0 ? 0 : this.TILE_SIZE/2)) / this.TILE_SIZE);
            for (let i = 0; i < uw; i++) {
                for (let j = 0; j < uh; j++) {
                    occupied.add(`${gx + i},${gy + j}`);
                }
            }
        };

        this.state.mapEntities.push({ type: 'village', x: 960, y: 560, name: "村莊中心" });
        markOccupied(960, 560, 'village');
        this.state.mapEntities.push({ type: 'campfire', x: 1000, y: 600, name: "小火堆" });
        markOccupied(1000, 600, 'campfire');

        if (this.state.resourceConfigs.length > 0) {
            this.state.resourceConfigs.forEach(cfg => {
                let count = 0;
                let attempts = 0;
                while (count < cfg.density && attempts < 200) {
                    attempts++;
                    const gx = Math.floor(Math.random() * 40 - 20) + 12;
                    const gy = Math.floor(Math.random() * 25 - 12) + 7;
                    if (occupied.has(`${gx},${gy}`)) continue;

                    const x = gx * this.TILE_SIZE + this.TILE_SIZE / 2;
                    const y = gy * this.TILE_SIZE + this.TILE_SIZE / 2;
                    if (Math.abs(x - 960) < 240 && Math.abs(y - 560) < 240) continue;

                    this.state.mapEntities.push({ type: cfg.model, resourceType: cfg.type, x, y, amount: cfg.amount, name: cfg.name });
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
        
        // 螺旋搜索最近的空位
        for (let r = 1; r < 5; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    if (!obstacles.has(`${gx + dx},${gy + dy}`)) {
                        return { x: (gx + dx) * TS + TS/2, y: (gy + dy) * TS + TS/2 };
                    }
                }
            }
        }
        return { x, y };
    }

    static gameLoop() {
        const now = Date.now();
        const deltaTime = Math.min((now - this.lastTickTime) / 1000, 0.1);
        this.lastTickTime = now;
        this.state.units.villagers.forEach(v => { this.updateVillagerMovement(v, deltaTime); });
        requestAnimationFrame(() => this.gameLoop());
    }

    static productionTick() {
        if (this.state.buildings.alchemy_lab > 0 && this.state.resources.wood >= 5) {
            this.state.resources.wood -= 5;
            this.state.resources.healthPotion += 5;
        }
    }

    static updateVillagerMovement(v, dt) {
        const basePos = { x: 960, y: 560 };
        const oldX = v.x, oldY = v.y;
        const moveSpeed = (v.config.speed || 5.5) * 10;
        
        switch (v.state) {
            case 'IDLE':
                const idleSpeed = (this.state.systemConfig.village_standby_speed || 3) * 10;
                const idleRange = this.state.systemConfig.village_standby_range || 150;
                if (!v.idleTarget) {
                    if (v.waitTimer > 0) { v.waitTimer -= dt; return; }
                    const angle = Math.random() * Math.PI * 2, r = Math.random() * idleRange + 120;
                    v.idleTarget = { x: basePos.x + Math.cos(angle) * r, y: basePos.y + Math.sin(angle) * r };
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
                if (v.gatherTimer >= (v.config.collection_speed || 10)) {
                    v.cargo += 10; v.state = 'MOVING_TO_BASE'; v.pathTarget = null;
                    if (v.targetId) {
                        v.targetId.amount -= 1;
                        if (v.targetId.amount <= 0) {
                            this.state.mapEntities = this.state.mapEntities.filter(e => e !== v.targetId);
                            v.targetId = null;
                        }
                    }
                }
                break;
            case 'MOVING_TO_BASE':
                const distB = Math.hypot(basePos.x - v.x, basePos.y - v.y);
                if (distB < 100) {
                    this.depositResource(v.type, v.cargo);
                    v.cargo = 0; v.pathTarget = null;
                    if (v.isRecalled) { v.state = 'IDLE'; v.isRecalled = false; v.idleTarget = null; }
                    else { v.state = 'MOVING_TO_RESOURCE'; }
                } else {
                    this.moveDetailed(v, basePos.x, basePos.y, moveSpeed, dt);
                }
                break;
        }
        
        if (this.isColliding(v.x, v.y)) {
            // 如果回到舊位子還是撞（表示被關在裡面了），找安全出口
            if (this.isColliding(oldX, oldY)) {
                const safe = this.findSafePos(v.x, v.y);
                v.x = safe.x; v.y = safe.y;
                v.pathTarget = null;
            } else {
                v.x = oldX; v.y = oldY;
            }

            if (v.state === 'IDLE') v.idleTarget = null;
            // 靠近基地即便撞牆也算存款
            if (v.state === 'MOVING_TO_BASE' && Math.hypot(v.x - basePos.x, v.y - basePos.y) < 140) {
                this.depositResource(v.type, v.cargo);
                v.cargo = 0; v.state = v.isRecalled ? 'IDLE' : 'MOVING_TO_RESOURCE'; v.isRecalled = false; v.pathTarget = null;
            }
        }
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

        const queue = [[startGX, startGY, null]]; 
        const visited = new Set([`${startGX},${startGY}`]);
        const obstacles = this.getObstacleGrid();

        let iterations = 0;
        while (queue.length > 0 && iterations < 1500) {
            iterations++;
            const [gx, gy, firstStep] = queue.shift();
            if (gx === targetGX && gy === targetGY) {
                const res = firstStep || [targetGX, targetGY];
                return { x: res[0] * TS + TS / 2, y: res[1] * TS + TS / 2 };
            }
            const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
            for (const [dx, dy] of neighbors) {
                const nx = gx + dx, ny = gy + dy;
                const key = `${nx},${ny}`;
                // 關鍵修正：如果是目標格子，即便是有障礙物也允許進入，這樣才能「觸碰」到建築物
                const isTargetNode = (nx === targetGX && ny === targetGY);
                if (!visited.has(key) && (!obstacles.has(key) || isTargetNode)) {
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
                const gx = Math.round((ent.x - (uw % 2 === 0 ? 0 : this.TILE_SIZE/2)) / this.TILE_SIZE);
                const gy = Math.round((ent.y - (uh % 2 === 0 ? 0 : this.TILE_SIZE/2)) / this.TILE_SIZE);
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
        if (commandType === 'RETURN') {
            this.state.units.villagers.forEach(v => { v.state = 'MOVING_TO_BASE'; v.isRecalled = true; v.pathTarget = null; });
            return;
        }
        this.addLog(`全員動員：開始採集 ${commandType}。`);
        this.state.units.villagers.forEach(v => { v.type = commandType; v.state = 'MOVING_TO_RESOURCE'; v.targetId = null; v.isRecalled = false; v.pathTarget = null; });
    }

    static addLog(msg) {
        this.state.log.push(msg);
        if (this.state.log.length > 10) this.state.log.shift();
    }

    static placeBuilding(type, x, y) {
        const cfg = this.state.buildingConfigs[type];
        if (!cfg) return;
        const currentCount = this.state.mapEntities.filter(e => e.type === type).length;
        if (cfg.maxCount !== undefined && currentCount >= cfg.maxCount) {
            this.addLog(`建造失敗：${cfg.name} 數量已達上限！`);
            return;
        }
        const costs = cfg.costs; const res = this.state.resources; const missing = [];
        if (costs.food > res.food) missing.push(`食物`);
        if (costs.wood > res.wood) missing.push(`木材`);
        if (costs.stone > res.stone) missing.push(`石頭`);
        if (costs.gold > res.gold) missing.push(`黃金`);
        if (missing.length > 0) { this.addLog(`資源不足：缺少 ${missing.join('、')}！`); return; }
        if (!this.isAreaClear(x, y, type)) { this.addLog("位置受阻！"); return; }
        res.food -= costs.food; res.wood -= costs.wood; res.stone -= costs.stone; res.gold -= costs.gold;
        this.state.mapEntities.push({ type: type, x: x, y: y, name: "新建建築" });
        if (type === 'farmhouse') this.state.buildings.farmhouse++;
        this.addLog(`建造成功：${cfg.name}。`);
    }
}
