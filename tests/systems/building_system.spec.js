const { test, expect } = require('@playwright/test');

// P1#5 回歸覆蓋：BuildingSystem 放置/footprint（先前無任何行為斷言）。
// isAreaClear 為 GameEngine 上的真實碰撞邏輯；因每個 Playwright test 會重載頁面取得
// 全新 GameEngine，於單一 test 內暫時改寫 GameEngine.state 是安全的（測完即隨頁面重置）。
test('BuildingSystem 放置/footprint 行為回歸基準', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { BuildingSystem } = await import('/src/systems/BuildingSystem.js?v=' + Date.now());
        const { GameEngine } = await import('/src/systems/game_systems.js?v=' + Date.now());
        const fails = [];
        const eq = (got, want, label) => { if (got !== want) fails.push(`${label}: 期望 ${JSON.stringify(want)}，得到 ${JSON.stringify(got)}`); };
        const ok = (cond, label) => { if (!cond) fails.push(label); };

        const mkEngine = (over = {}) => ({
            TILE_SIZE: 20, isAreaClear: () => true, addLog: () => {}, triggerWarning: () => {},
            updatePathfindingGrid: () => {}, updateSpatialGrid: () => {}, ...over
        });

        // --- spendResources：可負擔判定 + 倉庫優先扣除 + 全域扣除 ---
        {
            // 不足 → false 且不變動
            const s1 = { resources: { wood: 30 }, mapEntities: [] };
            eq(BuildingSystem.spendResources(s1, { wood: 50 }), false, 'spendResources 不足 → false');
            eq(s1.resources.wood, 30, 'spendResources 不足時不扣');
            // 足夠（純全域）→ true 且扣除
            const s2 = { resources: { wood: 100 }, mapEntities: [] };
            eq(BuildingSystem.spendResources(s2, { wood: 50 }), true, 'spendResources 足夠 → true');
            eq(s2.resources.wood, 50, 'spendResources 全域扣除');
            // 倉庫優先扣（deposit 為雙寫，倉庫存量是全域的子集；扣除保持一致）
            const s3 = { resources: { wood: 100 }, mapEntities: [{ storage: { wood: 40 } }] };
            eq(BuildingSystem.spendResources(s3, { wood: 30 }), true, 'spendResources 有倉庫 → true');
            eq(s3.mapEntities[0].storage.wood, 10, 'spendResources 先扣倉庫存量(40-30)');
            eq(s3.resources.wood, 70, 'spendResources 全域同步扣除(100-30)');
            // 零成本 → 跳過
            const s4 = { resources: { wood: 5 }, mapEntities: [] };
            eq(BuildingSystem.spendResources(s4, { wood: 0 }), true, 'spendResources 零成本 → true 不變');
            eq(s4.resources.wood, 5, 'spendResources 零成本不扣');
        }

        // --- placeBuilding：放置有效性流程 ---
        {
            const baseState = () => ({
                buildingConfigs: {
                    transport_line: { type1: 'transport_line', type2: 'transport_line', model: 'tl', name: 'Line', lv: 1, size: '{1,1}', costs: { wood: 10 }, buildTime: 0 },
                    village: { type1: 'village', model: 'v', name: 'V', lv: 1, size: '{1,1}', costs: {}, maxCount: 1, buildTime: 5 },
                    house: { type1: 'house', model: 'h', name: 'H', lv: 1, size: '{1,1}', costs: { wood: 100 }, buildTime: 5 }
                },
                mapEntities: [], resources: { wood: 50 }, placingRotation: 0, renderVersion: 0,
                units: { villagers: [] }, selectedUnitIds: []
            });

            // 設定不存在 → false
            eq(BuildingSystem.placeBuilding(baseState(), mkEngine(), 'ghost', 0, 0), false, 'placeBuilding 無 config → false');

            // 達數量上限 → false
            const sMax = baseState(); sMax.mapEntities = [{ type1: 'village' }];
            eq(BuildingSystem.placeBuilding(sMax, mkEngine(), 'village', 0, 0), false, 'placeBuilding 達 maxCount → false');
            eq(sMax.mapEntities.length, 1, 'placeBuilding 達上限不新增');

            // 資源不足 → false
            const sCost = baseState(); sCost.resources.wood = 10;
            eq(BuildingSystem.placeBuilding(sCost, mkEngine(), 'house', 0, 0), false, 'placeBuilding 資源不足 → false');
            eq(sCost.mapEntities.length, 0, 'placeBuilding 資源不足不新增');
            eq(sCost.resources.wood, 10, 'placeBuilding 資源不足不扣');

            // 位置受阻 → false（成本不應被扣，因 spendResources 在 isAreaClear 之後）
            const sBlocked = baseState();
            eq(BuildingSystem.placeBuilding(sBlocked, mkEngine({ isAreaClear: () => false }), 'transport_line', 0, 0), false, 'placeBuilding 受阻 → false');
            eq(sBlocked.resources.wood, 50, 'placeBuilding 受阻不扣資源');

            // 成功（瞬建 transport_line）→ true、入列、扣資源、renderVersion++、非施工狀態
            const sOk = baseState();
            eq(BuildingSystem.placeBuilding(sOk, mkEngine(), 'transport_line', 100, 100), true, 'placeBuilding 成功 → true');
            eq(sOk.mapEntities.length, 1, 'placeBuilding 成功入列');
            eq(sOk.mapEntities[0].type1, 'transport_line', 'placeBuilding 實體類型');
            eq(sOk.mapEntities[0].isUnderConstruction, false, 'placeBuilding 瞬建非施工狀態');
            eq(sOk.resources.wood, 40, 'placeBuilding 成功扣資源(50-10)');
            eq(sOk.renderVersion, 1, 'placeBuilding 成功 renderVersion++');
        }

        // --- getLinePositions：沿主軸的 footprint 步進 ---
        {
            const engine = mkEngine();
            const state = {
                buildingConfigs: {
                    transport_line: { type2: 'transport_line', size: '{1,1}' },
                    wall: { type2: 'wall', size: '{1,1}' },
                    big: { type2: 'wall', size: '{2,2}' }
                }
                // buildingSpacing 未定義 → 預設 1
            };
            // 運輸線 spacing=0：(0,0)->(100,0) step=20 → 6 點
            eq(BuildingSystem.getLinePositions(state, engine, 'transport_line', 0, 0, 100, 0).length, 6, 'getLinePositions 運輸線(spacing0) 6 點');
            // 1x1 牆 spacing=1：step=40 → floor(100/40)+1=3 點
            const wallPos = BuildingSystem.getLinePositions(state, engine, 'wall', 0, 0, 100, 0);
            eq(wallPos.length, 3, 'getLinePositions 1x1(spacing1) 3 點');
            eq(wallPos[1].x, 40, 'getLinePositions 步距=40');
            eq(wallPos[1].y, 0, 'getLinePositions 水平軸 y 不變');
            // 垂直：|dy|>|dx| → 沿 y
            const vert = BuildingSystem.getLinePositions(state, engine, 'wall', 0, 0, 0, 100);
            eq(vert.length, 3, 'getLinePositions 垂直 3 點');
            eq(vert[1].y, 40, 'getLinePositions 垂直步距=40');
            // 2x2 spacing=1：step=60 → floor(200/60)+1=4 點
            eq(BuildingSystem.getLinePositions(state, engine, 'big', 0, 0, 200, 0).length, 4, 'getLinePositions 2x2 footprint 步進');
            // start==end → 1 點
            eq(BuildingSystem.getLinePositions(state, engine, 'wall', 50, 50, 50, 50).length, 1, 'getLinePositions 起終同點 → 1 點');
            // 無 config → []
            eq(BuildingSystem.getLinePositions(state, engine, 'ghost', 0, 0, 100, 0).length, 0, 'getLinePositions 無 config → []');
        }

        // --- isAreaClear：真實 footprint 碰撞（暫改 GameEngine.state，測後還原）---
        {
            const snapE = GameEngine.state.mapEntities;
            const snapMd = GameEngine.state.mapData;
            const snapBc = GameEngine.state.buildingConfigs;
            try {
                GameEngine.state.buildingConfigs = { ...(snapBc || {}), tcell: { type1: 'tcell', size: '{1,1}', model: 'tcell' } };
                GameEngine.state.mapData = null; // 略過資源碰撞，專測實體碰撞
                GameEngine.state.mapEntities = [{ type1: 'tcell', x: 100, y: 100, lv: 1 }];
                const TS = GameEngine.TILE_SIZE;
                ok(GameEngine.getEntityConfig('tcell') && GameEngine.getEntityConfig('tcell').size === '{1,1}', 'isAreaClear 前置：注入 config 生效');
                eq(GameEngine.isAreaClear(100, 100, 'tcell'), false, 'isAreaClear 完全重疊 → 阻擋');
                eq(GameEngine.isAreaClear(100 + Math.round(TS * 0.4), 100, 'tcell'), false, 'isAreaClear 過近(<門檻) → 阻擋');
                eq(GameEngine.isAreaClear(100 + TS * 2, 100, 'tcell'), true, 'isAreaClear 隔開足夠 → 放行');
                eq(GameEngine.isAreaClear(800, 800, 'tcell'), true, 'isAreaClear 空曠處 → 放行');
                eq(GameEngine.isAreaClear(100, 100, '__no_such_type__'), true, 'isAreaClear 無 config → 放行(true)');
            } finally {
                GameEngine.state.mapEntities = snapE;
                GameEngine.state.mapData = snapMd;
                GameEngine.state.buildingConfigs = snapBc;
            }
        }

        return { fails };
    });

    expect(result.fails, JSON.stringify(result.fails, null, 2)).toEqual([]);
});
