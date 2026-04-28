import { UI_CONFIG } from "../ui/ui_config.js";
import { MapDataSystem } from "./MapDataSystem.js";

export class MapGenerator {
    static updateSpatialGrid(state, engine) {
        const grid = state.spatialGrid;
        grid.cells.clear();
        state.mapEntities.forEach(ent => {
            const gx = Math.floor(ent.x / grid.cellSize);
            const gy = Math.floor(ent.y / grid.cellSize);
            const key = `${gx},${gy}`;
            // 使用 Set 存儲以確保唯一性，或者 Array 也可以
            if (!grid.cells.has(key)) grid.cells.set(key, []);
            grid.cells.get(key).push(ent);
        });
    }

    static generateMap(state, engine) {
        const startT = performance.now();
        state.mapEntities = [];

        // 讀取外部參數 (單位皆為像素)
        const mapCfg = state.systemConfig.map_size || { w: 3200, h: 2000 };
        const safeCfg = state.systemConfig.no_resources_range || { w: 240, h: 240 };

        // 定義地圖格網 (Tiles)
        const TS = engine.TILE_SIZE;
        const cols = Math.floor(mapCfg.w / TS);
        const rows = Math.floor(mapCfg.h / TS);

        // 將村莊中心 (960, 560) 近似地圖中央
        const minGX = Math.floor(960 / TS) - Math.floor(cols / 2);
        const minGY = Math.floor(560 / TS) - Math.floor(rows / 2);
        const mapOffset = { x: minGX, y: minGY };
        state.mapOffset = mapOffset;

        // 初始化 大地圖數據系統 (Uint16Array)
        state.mapData = new MapDataSystem(cols, rows, mapOffset);

        const occupied = new Uint8Array(cols * rows); // 使用 TypedArray 替代 Set，效能大幅提升

        const getIdx = (gx, gy) => {
            const lx = gx - minGX;
            const ly = gy - minGY;
            if (lx < 0 || lx >= cols || ly < 0 || ly >= rows) return -1;
            return lx + ly * cols;
        };

        const getFootprint = (type) => engine.getFootprint(type);

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
        const villagePos = { x: 970, y: 570 }; // 從 960, 560 移動到中心點 970, 570
        const villageFP = getFootprint('village');
        const villageCfg = (state.buildingConfigsByType['village'] && state.buildingConfigsByType['village'][1]) || {};
        state.mapEntities.push({
            id: 'core_village',
            model: 'village',
            type1: 'village',
            lv: 1,
            x: villagePos.x, y: villagePos.y, name: villageCfg.name || "城鎮中心", queue: [], productionTimer: 0
        });
        const vgx = Math.round((villagePos.x - (villageFP.uw * TS) / 2) / TS);
        const vgy = Math.round((villagePos.y - (villageFP.uh * TS) / 2) / TS);
        markOccupiedG(vgx, vgy, villageFP.uw, villageFP.uh);

        const storehousePos = { x: villagePos.x, y: villagePos.y - 180 };
        const storehouseFP = getFootprint('storehouse');
        const storehouseCfg = (state.buildingConfigsByType['storehouse'] && state.buildingConfigsByType['storehouse'][1]) || {};
        const initialStorage = {};
        Object.keys(state.resources || {}).forEach(key => {
            const amount = state.resources[key] || 0;
            if (amount > 0) initialStorage[key] = amount;
        });
        state.mapEntities.push({
            id: 'core_storehouse',
            model: 'storehouse',
            type1: 'storehouse',
            lv: 1,
            x: storehousePos.x,
            y: storehousePos.y,
            name: storehouseCfg.name || "資源倉庫",
            storage: initialStorage,
            targetWorkerCount: 0
        });
        state.mainWarehouseId = 'core_storehouse';
        const sgx = Math.round((storehousePos.x - (storehouseFP.uw * TS) / 2) / TS);
        const sgy = Math.round((storehousePos.y - (storehouseFP.uh * TS) / 2) / TS);
        markOccupiedG(sgx, sgy, storehouseFP.uw, storehouseFP.uh);

        const campfirePos = { x: 1110, y: 650 }; // 同步對齊中心
        const campfireFP = getFootprint('campfire');
        state.mapEntities.push({
            id: 'core_campfire',
            type1: 'campfire', x: campfirePos.x, y: campfirePos.y, name: "小火堆"
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
        if (state.resourceConfigs.length > 0) {
            state.resourceConfigs.forEach(cfg => {
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
                    state.mapData.setResource(gx, gy, typeNum, cfg.amount, cfg.lv || 1);

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

                    const idx = state.mapData.getIndex(gx, gy);
                    if (idx !== -1) {
                        // 存入 Tint (24bit) 與 ScaleFactor (8bit)
                        // vScale 最大 255 (即 2.55倍)，一般夠用
                        state.mapData.variationGrid[idx] = (vScale << 24) | vTint;
                    }

                    markOccupiedG(gx, gy, fp.uw, fp.uh);
                    count++;
                }
                console.log(`地圖生成 - ${cfg.name} 成功放置: ${count}/${cfg.density} (存入 TypedArray)`);
            });
        }

        // 5. 隨機生成野外敵人與中立生物 (enemy1, enemy2, neutral1) - 使用高效的網格採樣演算法
        ['enemy1', 'enemy2', 'neutral1'].forEach(npcKey => {
            const configTriplet = state.systemConfig[npcKey];
            if (Array.isArray(configTriplet) && configTriplet.length === 3) {
                const [npcID, density, minInterval] = configTriplet;
                const name = state.idToNameMap[npcID];
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
                    if (state.mapData) {
                        const resData = state.mapData.getResource(gx, gy);
                        if (resData && resData.type !== 0) continue;
                    }

                    // 2. 同 ID 敵人間距檢查 (查閱 proximityGrid)
                    const pIdx = getIdx(gx, gy);
                    if (pIdx === -1 || proximityGrid[pIdx] === 1) continue;

                    const x = gx * TS + TS / 2;
                    const y = gy * TS + TS / 2;

                    // 3. 安全區檢查 (避免離村莊中心太近)
                    const npcSafe = state.systemConfig.no_npc_range || 300;
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
                                const nRes = state.mapData ? state.mapData.getResource(nx, ny) : null;
                                if (!nRes || nRes.type === 0) hasWalkableNeighbor = true;
                            }
                        }
                    }
                    if (!hasWalkableNeighbor) continue;

                    // 正式產出
                    engine.spawnNPC(npcID, null, { x, y });

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
        engine.updatePathfindingGrid(state, engine);
        engine.updateSpatialGrid(state, engine);
        console.log(`地圖生成完成 [W:${mapCfg.w} H:${mapCfg.h}]，耗時: ${(performance.now() - startT).toFixed(2)}ms`);
    }

    static updatePathfindingGrid(state, engine) {
        if (!state.pathfinding) return;

        const mapCfg = state.systemConfig.map_size || { w: 3200, h: 2000 };
        const TS = engine.TILE_SIZE;
        const cols = Math.ceil(mapCfg.w / TS);
        const rows = Math.ceil(mapCfg.h / TS);

        // 初始化全 0 (可通行)
        const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

        // 1. 注入建築物碰撞 (mapEntities)
        state.mapEntities.forEach(ent => {
            if (ent.isUnderConstruction) return;
            const cfg = engine.getEntityConfig(ent.type1);
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

                const offset = state.mapOffset || { x: 0, y: 0 };
                const FOOT_OFFSET = collCfg.feetOffset || 8;
                // 寬鬆係數 (shrink)：調高至 8，確保物流線在靠近建築邊緣時不會被誤判為碰撞
                const shrink = 8;
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
        if (state.mapData) {
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
            for (let i = 0; i < state.mapData.totalTiles; i++) {
                const typeNum = state.mapData.typeGrid[i];
                if (typeNum !== 0) {
                    const level = state.mapData.levelGrid[i] || 1;
                    const typeName = typeMap[typeNum];
                    // 根據型別與等級尋找配置
                    const cfg = state.resourceConfigs.find(c => c.type === typeName && c.lv === level);

                    const gx = i % state.mapData.cols;
                    const gy = Math.floor(i / state.mapData.cols);

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

        state.pathfinding.setGrid(matrix);

        // 核心要求：網格更新後，所有正在移動中的單位必須重新計算路徑，以避開剛生成的建築
        const allUnitsForPath = [...state.units.villagers, ...(state.units.npcs || [])];
        allUnitsForPath.forEach(v => {
            v.fullPath = null;
            v.pathIndex = 0;
            v.isFindingPath = false; // [修復] 同步重置尋路狀態，防止單位因 isFindingPath 鎖死而維持直線行走
            v._lastTargetPos = null; // 強制重置追蹤位置
        });
    }
}
