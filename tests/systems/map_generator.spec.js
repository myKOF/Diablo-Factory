const { test, expect } = require('@playwright/test');

// P1#5 回歸覆蓋：MapGenerator（先前無任何行為斷言）。
// generateMap 內含 Math.random / performance.now / 大量 console.log，故僅斷言
// 「不論亂數如何都應成立」的結構性不變量；空間網格與尋路網格部分為純函式/確定性，可精確斷言。
// 斷言「領域上應為真」的行為，而非照抄實作；若日後改壞這些不變量即會變紅。
test('MapGenerator 行為回歸基準', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { MapGenerator } = await import('/src/systems/MapGenerator.js?v=' + Date.now());
        const fails = [];
        const eq = (got, want, label) => { if (got !== want) fails.push(`${label}: 期望 ${JSON.stringify(want)}，得到 ${JSON.stringify(got)}`); };
        const ok = (cond, label) => { if (!cond) fails.push(label); };

        // --- updateSpatialGrid：純函式，依 cellSize 將實體分桶 ---
        // 領域不變量：每次重建必先清空（grid 反映「當下」實體分佈）；
        // 同一格內的實體共享同一桶陣列；不同格分屬不同鍵；分桶鍵為 floor(x/cellSize),floor(y/cellSize)。
        {
            const stale = { id: 'STALE' };
            const grid = { cells: new Map([['9,9', [stale]]]), cellSize: 100 };
            const a = { id: 'a', x: 10, y: 10 };   // 桶 0,0
            const b = { id: 'b', x: 90, y: 90 };   // 桶 0,0（與 a 同格）
            const c = { id: 'c', x: 250, y: 30 };  // 桶 2,0
            const state = { spatialGrid: grid, mapEntities: [a, b, c] };
            MapGenerator.updateSpatialGrid(state, {});

            ok(!grid.cells.has('9,9'), 'updateSpatialGrid 重建前先清空舊鍵');
            ok(!Array.from(grid.cells.values()).flat().includes(stale), 'updateSpatialGrid 過期實體不殘留於任何桶（全面清空，非僅刪鍵）');
            ok(grid.cells.has('0,0'), 'updateSpatialGrid 建立 0,0 桶');
            ok(grid.cells.has('2,0'), 'updateSpatialGrid 建立 2,0 桶');
            eq(grid.cells.size, 2, 'updateSpatialGrid 桶數 = 不同格數');
            const cell00 = grid.cells.get('0,0');
            eq(cell00.length, 2, 'updateSpatialGrid 同格實體共享同桶');
            ok(cell00.includes(a) && cell00.includes(b), 'updateSpatialGrid 同格收錄 a、b');
            const cell20 = grid.cells.get('2,0');
            eq(cell20.length, 1, 'updateSpatialGrid 不同格分屬不同桶');
            ok(cell20[0] === c, 'updateSpatialGrid 2,0 桶收錄 c');

            // 邊界：座標恰落於格邊（x=100 → 桶 1）；確認用 floor 分桶
            const edge = { id: 'edge', x: 100, y: 0 };
            MapGenerator.updateSpatialGrid({ spatialGrid: grid, mapEntities: [edge] }, {});
            ok(grid.cells.has('1,0') && !grid.cells.has('0,0'), 'updateSpatialGrid x=100 落入桶 1,0（floor 分桶）');
        }

        // --- updatePathfindingGrid：確定性（無亂數）。建築/施工/單位狀態重置 ---
        {
            // 共用：200x200 地圖、TS=20 → cols=rows=10。mapOffset 為 0 簡化座標換算。
            const mkUnit = () => ({ fullPath: [{ x: 1 }, { x: 2 }], pathIndex: 3, isFindingPath: true, _lastTargetPos: { x: 9 } });

            // (a) 早退：無 state.pathfinding 不應拋錯、不應有副作用
            {
                let threw = false;
                try {
                    MapGenerator.updatePathfindingGrid(
                        { systemConfig: { map_size: { w: 200, h: 200 } }, mapEntities: [], units: { villagers: [], npcs: [] } },
                        { TILE_SIZE: 20, getEntityConfig: () => null }
                    );
                } catch (e) { threw = true; }
                ok(!threw, 'updatePathfindingGrid 無 pathfinding 時安全早退（不拋錯）');
            }

            // (b) 主路徑：碰撞建築封格、施工建築略過、非碰撞建築不封格、單位尋路狀態重置
            {
                const collBuilding = { type1: 'wall', x: 50, y: 50, isUnderConstruction: false };
                const ghostBuilding = { type1: 'wall', x: 150, y: 150, isUnderConstruction: true }; // 施工中
                const nonColl = { type1: 'flower', x: 150, y: 50, isUnderConstruction: false };     // 無碰撞
                const u1 = mkUnit(), u2 = mkUnit(), npc1 = mkUnit();
                const state = {
                    pathfinding: { setGrid(m) { this.grid = m; } },
                    mapOffset: { x: 0, y: 0 },
                    mapData: null,
                    systemConfig: { map_size: { w: 200, h: 200 } },
                    resourceConfigs: [],
                    mapEntities: [collBuilding, ghostBuilding, nonColl],
                    units: { villagers: [u1, u2], npcs: [npc1] }
                };
                const engine = {
                    TILE_SIZE: 20,
                    getEntityConfig: (type) => {
                        if (type === 'wall') return { collision: true, size: '{1,1}' };
                        if (type === 'flower') return { collision: false, size: '{1,1}' };
                        return null;
                    }
                };
                MapGenerator.updatePathfindingGrid(state, engine);

                // 矩陣形狀：rows x cols = 10 x 10，且確實傳給 setGrid
                ok(Array.isArray(state.pathfinding.grid), 'updatePathfindingGrid 產生矩陣並交付 setGrid');
                eq(state.pathfinding.grid.length, 10, 'updatePathfindingGrid 矩陣 rows = ceil(h/TS)');
                eq(state.pathfinding.grid[0].length, 10, 'updatePathfindingGrid 矩陣 cols = ceil(w/TS)');
                const m = state.pathfinding.grid;

                // 碰撞建築足跡確被封鎖：以建築中心格為錨，確認其鄰近 3x3 區內至少有一格=1。
                // 不照抄 buffer/feetOffset/shrink 常數所決定的「精確」封鎖格（那會 gild 實作細節），
                // 只錨定「碰撞建築會封鎖其足跡所在區域」這一領域真相，對常數微調具韌性。
                const bcx = Math.floor(50 / 20), bcy = Math.floor(50 / 20); // 碰撞建築 (50,50) → 中心格 (2,2)
                let blockedNearBuilding = false;
                for (let ty = bcy - 1; ty <= bcy + 1 && !blockedNearBuilding; ty++)
                    for (let tx = bcx - 1; tx <= bcx + 1 && !blockedNearBuilding; tx++)
                        if (m[ty] && m[ty][tx] === 1) blockedNearBuilding = true;
                ok(blockedNearBuilding, 'updatePathfindingGrid 碰撞建築足跡所在區域被封鎖(=1)');
                const blocked = m.reduce((s, row) => s + row.reduce((a, v) => a + v, 0), 0);
                ok(blocked >= 1, 'updatePathfindingGrid 至少封鎖一格');

                // 施工中建築自身足跡格不應被封鎖（直擊其格位以真正證明 isUnderConstruction 被略過：
                // 若改為已完工碰撞建築，同位置必被封）。ghost(150,150) → 格 (7,7)。
                eq(m[7][7], 0, 'updatePathfindingGrid 施工中建築「自身足跡格」不封鎖（略過 isUnderConstruction）');
                // 非碰撞建築自身足跡格不封鎖。flower(150,50) → 格 col7,row2。
                eq(m[2][7], 0, 'updatePathfindingGrid 非碰撞建築不封鎖足跡');

                // 所有單位（含 npc）的尋路狀態被強制重置，避免沿用過期路徑撞上新建築
                [u1, u2, npc1].forEach((u, i) => {
                    eq(u.fullPath, null, `updatePathfindingGrid 單位${i} fullPath 重置為 null`);
                    eq(u.pathIndex, 0, `updatePathfindingGrid 單位${i} pathIndex 重置為 0`);
                    eq(u.isFindingPath, false, `updatePathfindingGrid 單位${i} isFindingPath 重置為 false`);
                    eq(u._lastTargetPos, null, `updatePathfindingGrid 單位${i} _lastTargetPos 重置為 null`);
                });
            }

            // (c) 無建築時為全 0（全可通行）；缺 npcs 陣列也不拋錯
            {
                const state = {
                    pathfinding: { setGrid(m) { this.grid = m; } },
                    mapOffset: { x: 0, y: 0 },
                    mapData: null,
                    systemConfig: { map_size: { w: 200, h: 200 } },
                    resourceConfigs: [],
                    mapEntities: [],
                    units: { villagers: [] } // 無 npcs 鍵
                };
                let threw = false;
                try { MapGenerator.updatePathfindingGrid(state, { TILE_SIZE: 20, getEntityConfig: () => null }); }
                catch (e) { threw = true; }
                ok(!threw, 'updatePathfindingGrid 缺 npcs 陣列不拋錯');
                const allZero = state.pathfinding.grid.every(row => row.every(v => v === 0));
                ok(allZero, 'updatePathfindingGrid 無碰撞物時矩陣全 0（全可通行）');
            }

            // (d) 非整除維度：尋路矩陣維度必須與 generateMap/mapData 同一公式（floor），
            //     兩者才能以同一 mapOffset 疊合而不產生幽靈邊緣格。199/20 → floor=9。
            {
                const state = {
                    pathfinding: { setGrid(m) { this.grid = m; } },
                    mapOffset: { x: 0, y: 0 },
                    mapData: null,
                    systemConfig: { map_size: { w: 199, h: 199 } },
                    resourceConfigs: [],
                    mapEntities: [],
                    units: { villagers: [], npcs: [] }
                };
                MapGenerator.updatePathfindingGrid(state, { TILE_SIZE: 20, getEntityConfig: () => null });
                eq(state.pathfinding.grid.length, 9, 'updatePathfindingGrid 非整除高度 rows=floor(199/20)=9（與 generateMap 同公式）');
                eq(state.pathfinding.grid[0].length, 9, 'updatePathfindingGrid 非整除寬度 cols=floor(199/20)=9（與 generateMap 同公式）');
            }
        }

        // --- getGridDimensions：地圖網格維度的「單一真實來源」（generateMap 與 updatePathfindingGrid 共用）---
        // 領域不變量：維度公式只能有一處定義，否則兩網格在非整除地圖會分歧。採 floor（對齊權威 mapData）。
        {
            const dvz = MapGenerator.getGridDimensions({ systemConfig: { map_size: { w: 3200, h: 2000 } } }, { TILE_SIZE: 20 });
            eq(dvz.cols, 160, 'getGridDimensions 整除寬度 cols=160');
            eq(dvz.rows, 100, 'getGridDimensions 整除高度 rows=100');
            const nd = MapGenerator.getGridDimensions({ systemConfig: { map_size: { w: 199, h: 159 } } }, { TILE_SIZE: 20 });
            eq(nd.cols, 9, 'getGridDimensions 非整除寬度 cols=floor(199/20)=9');
            eq(nd.rows, 7, 'getGridDimensions 非整除高度 rows=floor(159/20)=7');
            const def = MapGenerator.getGridDimensions({ systemConfig: {} }, { TILE_SIZE: 20 });
            eq(def.cols, 160, 'getGridDimensions 缺 map_size → 預設寬 3200 → cols=160');
            eq(def.rows, 100, 'getGridDimensions 缺 map_size → 預設高 2000 → rows=100');
        }

        // --- generateMap：最小確定性子集（resourceConfigs=[] 且無 NPC 鍵 → 僅放 3 核心建築）---
        // 不斷言任何依賴亂數的座標；僅斷言結構性不變量：核心實體齊備、倉庫初始庫存正確播種、地圖數據系統就緒。
        {
            const state = {
                systemConfig: { map_size: { w: 400, h: 400 }, no_resources_range: { w: 240, h: 240 } },
                buildingConfigsByType: {},
                resourceConfigs: [],
                resources: { wood: 50, stone: 0, food: 12 }, // stone=0 不應入倉
                units: { villagers: [], npcs: [] },
                idToNameMap: {}
            };
            let spawnNPCCalls = 0;
            const engine = {
                TILE_SIZE: 20,
                getFootprint: () => ({ uw: 2, uh: 2 }),
                getEntityConfig: () => null,
                spawnNPC: () => { spawnNPCCalls++; },
                updatePathfindingGrid: () => {},
                updateSpatialGrid: () => {}
            };
            MapGenerator.generateMap(state, engine);

            const byId = id => state.mapEntities.find(e => e.id === id);
            const village = byId('core_village');
            const storehouse = byId('core_storehouse');
            const campfire = byId('core_campfire');

            // 1) 三核心建築齊備且僅有此三者（無資源、無 NPC 配置）
            eq(state.mapEntities.length, 3, 'generateMap 無資源/NPC 時僅 3 核心實體');
            ok(!!village, 'generateMap 放置 core_village');
            ok(!!storehouse, 'generateMap 放置 core_storehouse');
            ok(!!campfire, 'generateMap 放置 core_campfire');
            eq(village.type1, 'village', 'generateMap core_village type1');
            eq(storehouse.type1, 'storehouse', 'generateMap core_storehouse type1');
            eq(campfire.type1, 'campfire', 'generateMap core_campfire type1');

            // 2) 主倉庫指標指向核心倉庫（其他系統據此尋找全域倉）
            eq(state.mainWarehouseId, 'core_storehouse', 'generateMap 設定 mainWarehouseId=core_storehouse');

            // 3) 倉庫初始庫存：僅播種 state.resources 中 >0 的種類（領域：0/負量不佔倉位）
            eq(storehouse.storage.wood, 50, 'generateMap 倉庫播種 wood=50');
            eq(storehouse.storage.food, 12, 'generateMap 倉庫播種 food=12');
            ok(!('stone' in storehouse.storage), 'generateMap 倉庫不播種數量為 0 的 stone');
            // 一般化：倉庫的每個庫存鍵都必須對應 state.resources 中量 > 0 的資源（不只抽查 stone）
            ok(Object.keys(storehouse.storage).every(k => state.resources[k] > 0),
                'generateMap 倉庫僅播種來源量 > 0 的資源（庫存鍵皆有正來源量）');

            // 4) 地圖偏移為數值座標（供尋路/資源格網座標換算）
            ok(state.mapOffset && Number.isFinite(state.mapOffset.x) && Number.isFinite(state.mapOffset.y),
                'generateMap mapOffset 為有限數值座標');

            // 5) 大地圖數據系統就緒（以結構鴨子型別斷言，避免 import 快取破壞造成的 class 身分分歧）
            //    維度符合 floor(map/TS)，並具備資源網格與查詢介面。
            ok(state.mapData && typeof state.mapData.getResource === 'function', 'generateMap 建立可查詢的大地圖數據系統');
            ok(state.mapData.typeGrid instanceof Uint16Array, 'generateMap mapData 以 TypedArray 儲存資源類型網格');
            eq(state.mapData.cols, 20, 'generateMap mapData.cols = floor(w/TS)=20');
            eq(state.mapData.rows, 20, 'generateMap mapData.rows = floor(h/TS)=20');
            eq(state.mapData.totalTiles, state.mapData.cols * state.mapData.rows, 'generateMap mapData.totalTiles = cols*rows（為計算值而非硬編常數）');

            // 6) 無 NPC 配置 → 不召喚任何 NPC（避免空配置誤觸生成）
            eq(spawnNPCCalls, 0, 'generateMap 無 enemy/neutral 配置時不召喚 NPC');

            // 7) 重新生成會重建 mapEntities（不累加殘留），體現「重生即重置」
            MapGenerator.generateMap(state, engine);
            eq(state.mapEntities.length, 3, 'generateMap 重生時重置 mapEntities（不累加）');
        }

        // --- 跨方法一致性不變量：尋路碰撞矩陣維度 == 權威 mapData 網格維度 ---
        // 兩者以同一 mapOffset 疊合同一座標空間；維度分歧會在非整除地圖產生「幽靈邊緣格」
        // （尋路可走、但無對應地圖資料）。用非整除地圖驅動 generateMap→updatePathfindingGrid 全流程驗證。
        {
            const state = {
                systemConfig: { map_size: { w: 199, h: 159 }, no_resources_range: { w: 40, h: 40 } }, // 皆非 TS(20) 整除
                buildingConfigsByType: {}, resourceConfigs: [], resources: {},
                units: { villagers: [], npcs: [] }, idToNameMap: {},
                pathfinding: { setGrid(m) { this.grid = m; } }
            };
            const engine = {
                TILE_SIZE: 20,
                getFootprint: () => ({ uw: 1, uh: 1 }),
                getEntityConfig: () => null,
                spawnNPC: () => {},
                updatePathfindingGrid: (s, e) => MapGenerator.updatePathfindingGrid(s, e), // 走真實實作
                updateSpatialGrid: () => {}
            };
            MapGenerator.generateMap(state, engine);
            eq(state.pathfinding.grid.length, state.mapData.rows, '一致性：尋路矩陣 rows == mapData.rows（兩網格同尺寸，無幽靈邊緣）');
            eq(state.pathfinding.grid[0].length, state.mapData.cols, '一致性：尋路矩陣 cols == mapData.cols（兩網格同尺寸，無幽靈邊緣）');
        }

        return { fails };
    });

    expect(result.fails, JSON.stringify(result.fails, null, 2)).toEqual([]);
});
