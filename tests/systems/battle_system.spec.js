const { test, expect } = require('@playwright/test');

// P1#5 回歸覆蓋：BattleSystem（先前無任何行為斷言）。
// 斷言「領域上應為真」的戰鬥不變量（陣營識別、索敵、傷害、反擊、清屍），
// 而非照抄實作；若日後改壞這些不變量即會變紅。
// 註：頁面已載入 → window.GameEngine 存在，BattleSystem 內部對 GameEngine.addLog
// 的呼叫（清屍/生屍/HP歸零等日誌）會無害執行，刻意不去 stub。
test('BattleSystem 行為回歸基準', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { BattleSystem } = await import('/src/systems/BattleSystem.js?v=' + Date.now());
        const fails = [];
        const eq = (got, want, label) => { if (got !== want) fails.push(`${label}: 期望 ${JSON.stringify(want)}，得到 ${JSON.stringify(got)}`); };
        const ok = (cond, label) => { if (!cond) fails.push(label); };

        const TILE = 20;
        // 提供乾淨的 state 外殼（每次呼叫都是新的，避免互相污染）
        const mkState = (over = {}) => ({
            units: { villagers: [], npcs: [] },
            mapEntities: [],
            projectiles: [],
            selectedUnitIds: [],
            renderVersion: 0,
            ...over
        });

        // --- getDist：歐氏距離 + 缺參數退回哨兵值 ---
        {
            eq(BattleSystem.getDist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5, 'getDist 3-4-5 直角三角形 → 5');
            eq(BattleSystem.getDist({}, {}), 0, 'getDist 缺座標視為 (0,0) → 0');
            eq(BattleSystem.getDist(null, { x: 1, y: 1 }), 999999, 'getDist 任一方為 null → 哨兵 999999');
            eq(BattleSystem.getDist({ x: 1, y: 1 }, null), 999999, 'getDist 另一方為 null → 哨兵 999999');
        }

        // --- findEntityById：跨三類查找 / 物件直通 / 單位尊重 visible!==false ---
        {
            const v = { id: 'v1', visible: true };
            const n = { id: 'n1' };
            const m = { id: 'm1' };
            const state = mkState({ units: { villagers: [v], npcs: [n] }, mapEntities: [m] });
            ok(BattleSystem.findEntityById('v1', state) === v, 'findEntityById 命中村民');
            ok(BattleSystem.findEntityById('n1', state) === n, 'findEntityById 命中 NPC');
            ok(BattleSystem.findEntityById('m1', state) === m, 'findEntityById 命中地圖實體');
            eq(BattleSystem.findEntityById('nope', state), undefined, 'findEntityById 查無 → undefined');
            const obj = { id: 'whatever' };
            ok(BattleSystem.findEntityById(obj, state) === obj, 'findEntityById 物件參數直通回傳自身');
            eq(BattleSystem.findEntityById(null, state), null, 'findEntityById null id → null');
            // 隱形單位視為不可定位（已撤離/淡出）。以「可見對照組」隔離出可見性才是判別依據，
            // 而非單純查無（避免假陽性：被刪除的單位也會查無）。
            const ghost = { id: 'g1', visible: false };
            const seen = { id: 'g2', visible: true };
            const sGhost = mkState({ units: { villagers: [ghost, seen], npcs: [] } });
            ok(BattleSystem.findEntityById('g2', sGhost) === seen, 'findEntityById 可見單位可被定位（對照組）');
            eq(BattleSystem.findEntityById('g1', sGhost), undefined, 'findEntityById 隱形單位不可被定位（可見性為判別依據）');
        }

        // --- applyDamage：扣血 / 受擊計時 / 免疫(死亡/屍體/隱形) / 反擊 ---
        {
            // 正常扣血並標記受擊
            const t1 = { hp: 100, x: 10, y: 10 };
            BattleSystem.applyDamage(t1, 30, mkState(), null);
            eq(t1.hp, 70, 'applyDamage 扣血(100-30)');
            ok(t1.hitTimer > 0, 'applyDamage 設定受擊閃爍計時(>0；不綁定確切時長常數)');

            // 反擊：存活、原本無目標、有 attackerId → 鎖定攻擊者並進入 CHASE
            const t2 = { hp: 100, x: 0, y: 0, state: 'IDLE' };
            BattleSystem.applyDamage(t2, 10, mkState(), 'atkX');
            eq(t2.targetId, 'atkX', 'applyDamage 受擊反擊：鎖定攻擊者為目標');
            eq(t2.state, 'CHASE', 'applyDamage 受擊反擊：進入 CHASE 追擊');

            // 已有目標者不被搶奪（不覆蓋既有交戰意圖）
            const t3 = { hp: 100, x: 0, y: 0, targetId: 'existing', state: 'ATTACK' };
            BattleSystem.applyDamage(t3, 10, mkState(), 'atkX');
            eq(t3.targetId, 'existing', 'applyDamage 已有目標時不被攻擊者搶奪');

            // 致死一擊不會觸發反擊（hp<=0 後不應再追擊）
            const t4 = { hp: 5, x: 0, y: 0, state: 'IDLE', configName: 'D' };
            BattleSystem.applyDamage(t4, 50, mkState(), 'atkX');
            ok(t4.hp <= 0, 'applyDamage 致死扣血至非正');
            eq(t4.targetId, undefined, 'applyDamage 致死不觸發反擊鎖定');

            // 免疫：已死亡 / 屍體 / 隱形目標完全不受影響
            const dead = { hp: 0, x: 0, y: 0 };
            BattleSystem.applyDamage(dead, 10, mkState(), 'atkX');
            eq(dead.hp, 0, 'applyDamage 對已死目標無效');
            const corpse = { hp: 50, isCorpse: true, x: 0, y: 0 };
            BattleSystem.applyDamage(corpse, 10, mkState(), 'atkX');
            eq(corpse.hp, 50, 'applyDamage 對屍體無效');
            const inv = { hp: 50, visible: false, x: 0, y: 0 };
            BattleSystem.applyDamage(inv, 10, mkState(), 'atkX');
            eq(inv.hp, 50, 'applyDamage 對隱形目標無效');
        }

        // --- buildScanTargets：依 config.camp||camp 分桶；中立丟棄；屍體/死/隱形地圖實體排除 ---
        {
            const pUnit = { id: 'p', hp: 10, config: { camp: 'player' } };       // 玩家單位（config 優先）
            const eUnit = { id: 'e', hp: 10, camp: 'enemy' };                    // 敵方單位（裸 camp）
            const nUnit = { id: 'n', hp: 10, camp: 'neutral' };                  // 中立單位（應丟棄）
            const eBuild = { id: 'eb', hp: 100, camp: 'enemy' };                 // 敵方建築
            const corpseEnt = { id: 'c', hp: 100, camp: 'enemy', isCorpse: true };// 敵方屍體（排除）
            const deadEnt = { id: 'd', hp: 0, camp: 'enemy' };                    // 死亡實體（排除）
            const invEnt = { id: 'i', hp: 100, camp: 'enemy', visible: false };   // 隱形實體（排除）
            const state = mkState({ mapEntities: [eBuild, corpseEnt, deadEnt, invEnt] });

            const byCamp = BattleSystem.buildScanTargets([pUnit, eUnit, nUnit], state);
            ok(byCamp.player.includes(pUnit), 'buildScanTargets 玩家桶含玩家單位');
            ok(byCamp.enemy.includes(eUnit), 'buildScanTargets 敵方桶含敵方單位');
            ok(!byCamp.player.includes(nUnit) && !byCamp.enemy.includes(nUnit), 'buildScanTargets 中立不入任何桶');
            ok(byCamp.enemy.includes(eBuild), 'buildScanTargets 敵方桶含敵方建築');
            ok(!byCamp.enemy.includes(corpseEnt), 'buildScanTargets 排除屍體地圖實體');
            ok(!byCamp.enemy.includes(deadEnt), 'buildScanTargets 排除死亡地圖實體');
            ok(!byCamp.enemy.includes(invEnt), 'buildScanTargets 排除隱形地圖實體');
            eq(byCamp.enemy.length, 2, 'buildScanTargets 敵方桶僅有效單位+建築 2 筆');
        }

        // --- autoSeeking：主動單位鎖定視野內最近敵人；被動/同陣營/中立不索敵 ---
        {
            // 主動玩家單位（initiative_attack=1），視野內有兩個敵人，應鎖定較近者
            const seeker = { id: 's', x: 0, y: 0, config: { camp: 'player' }, initiative_attack: 1, field_vision: 15 };
            const near = { id: 'near', x: 40, y: 0, hp: 10, camp: 'enemy' };
            const far = { id: 'far', x: 200, y: 0, hp: 10, camp: 'enemy' };
            const scan = { player: [], enemy: [near, far] };
            BattleSystem.autoSeeking(seeker, mkState(), TILE, scan);
            eq(seeker.targetId, 'near', 'autoSeeking 主動單位鎖定最近敵人');
            eq(seeker.state, 'CHASE', 'autoSeeking 鎖定後進入 CHASE');

            // 被動單位（initiative_attack=0）即使有敵人在側也不主動索敵
            const passive = { id: 'pv', x: 0, y: 0, config: { camp: 'player' }, initiative_attack: 0, field_vision: 15 };
            BattleSystem.autoSeeking(passive, mkState(), TILE, { player: [], enemy: [near] });
            eq(passive.targetId, undefined, 'autoSeeking 被動單位不主動索敵');

            // 視野外敵人（>field_vision*TILE）不被鎖定
            const seeker2 = { id: 's2', x: 0, y: 0, config: { camp: 'player' }, initiative_attack: 1, field_vision: 1 };
            const outOfRange = { id: 'oor', x: 500, y: 0, hp: 10, camp: 'enemy' };
            BattleSystem.autoSeeking(seeker2, mkState(), TILE, { player: [], enemy: [outOfRange] });
            eq(seeker2.targetId, undefined, 'autoSeeking 視野外敵人不被鎖定');

            // 無 config 的單位直接略過（無法判定陣營）
            const noConf = { id: 'nc', x: 0, y: 0, initiative_attack: 1, field_vision: 15 };
            BattleSystem.autoSeeking(noConf, mkState(), TILE, { player: [], enemy: [near] });
            eq(noConf.targetId, undefined, 'autoSeeking 無 config 不索敵');
        }

        // --- processCombat：狀態機（採集跳過 / ATTACK→CHASE / 失標→IDLE / 攻擊節奏）---
        {
            // 採集中單位完全跳過戰鬥（不應攻擊資源/屍體）
            const gather = { state: 'GATHERING', targetId: 'x', hp: 10 };
            BattleSystem.processCombat(gather, 0.1, mkState(), TILE, false, null);
            eq(gather.targetId, 'x', 'processCombat 採集中跳過、不更動目標');
            eq(gather.state, 'GATHERING', 'processCombat 採集中保持 GATHERING');

            // 目標遺失（findEntityById 查無）且處於 ATTACK → 退回 IDLE 並解除玩家鎖定
            const lost = { state: 'ATTACK', targetId: 'gone', isPlayerLocked: true, x: 0, y: 0 };
            BattleSystem.processCombat(lost, 0.1, mkState(), TILE, false, null);
            eq(lost.targetId, null, 'processCombat 目標遺失 → 清空 targetId');
            eq(lost.state, 'IDLE', 'processCombat 目標遺失 → 退回 IDLE');
            eq(lost.isPlayerLocked, false, 'processCombat 目標遺失 → 解除玩家鎖定');

            // 目標變屍體 → 同樣解除並退回 IDLE（不打屍體）
            const corpseTgt = { id: 'ct', hp: 50, isCorpse: true, x: 0, y: 0 };
            const onCorpse = { state: 'ATTACK', targetId: 'ct', isPlayerLocked: true, x: 0, y: 0 };
            BattleSystem.processCombat(onCorpse, 0.1, mkState({ mapEntities: [corpseTgt] }), TILE, false, null);
            eq(onCorpse.state, 'IDLE', 'processCombat 目標成屍體 → 退回 IDLE');
            eq(onCorpse.targetId, null, 'processCombat 目標成屍體 → 清空 targetId');

            // ATTACK 中但目標跑遠（dist > range*1.5）→ 轉 CHASE
            // range = baseRange(1.5)*TILE(20)=30, range*1.5=45；目標放在 100 觸發
            const tgtFar = { id: 'tf', hp: 100, camp: 'enemy', x: 100, y: 0 };
            const chaser = { id: 'ch', state: 'ATTACK', targetId: 'tf', camp: 'player', x: 0, y: 0 };
            BattleSystem.processCombat(chaser, 0.1, mkState({ units: { villagers: [chaser], npcs: [tgtFar] } }), TILE, false, null);
            eq(chaser.state, 'CHASE', 'processCombat ATTACK 中目標超出 range*1.5 → 轉 CHASE');

            // ATTACK 節奏（近戰 attack_type=1）：attackTimer 倒數歸零後造成傷害並重設計時
            const enemyTgt = { id: 'et', hp: 100, camp: 'enemy', x: 5, y: 0 };
            const meleeAtk = { id: 'ma', state: 'ATTACK', targetId: 'et', camp: 'player', x: 0, y: 0, attack: 25, attack_type: 1, attackSpeed: 2 };
            const sMelee = mkState({ units: { villagers: [meleeAtk], npcs: [enemyTgt] } });
            BattleSystem.processCombat(meleeAtk, 0.1, sMelee, TILE, false, null); // attackTimer:0→-0.1→<=0 觸發攻擊
            eq(enemyTgt.hp, 75, 'processCombat 近戰攻擊命中造成傷害(100-25)');
            ok(meleeAtk.attackTimer > 0, 'processCombat 攻擊後重設攻擊計時(>0 進入冷卻)');

            // ATTACK 節奏（遠程 attack_type=2）：應推入一枚投射物，而非直接扣血
            const rangedTgt = { id: 'rt', hp: 100, camp: 'enemy', x: 5, y: 0 };
            const rangedAtk = { id: 'ra', state: 'ATTACK', targetId: 'rt', camp: 'player', x: 0, y: 0, attack: 25, attack_type: 2, attackSpeed: 1 };
            const sRanged = mkState({ units: { villagers: [rangedAtk], npcs: [rangedTgt] } });
            BattleSystem.processCombat(rangedAtk, 0.1, sRanged, TILE, false, null);
            eq(sRanged.projectiles.length, 1, 'processCombat 遠程攻擊推入一枚投射物');
            eq(rangedTgt.hp, 100, 'processCombat 遠程攻擊當下不直接扣血（由投射物命中再結算）');
            eq(sRanged.projectiles[0].damage, 25, 'processCombat 投射物攜帶攻擊者傷害值');
        }

        // --- clearUnitAsTarget：解除追擊死者的單位 + 過濾指向死者的投射物 ---
        {
            // hunter 帶有指向死者的陳舊尋路資料，須一併清除（完整斷開對死者的所有引用）
            const hunter = { id: 'h', targetId: 'victim', state: 'ATTACK', isPlayerLocked: true, pathTarget: { x: 1 }, fullPath: [{ x: 1 }], attackTimer: 5 };
            const bystander = { id: 'b', targetId: 'other', state: 'ATTACK' };
            const proj1 = { id: 'p1', targetId: 'victim' };
            const proj2 = { id: 'p2', targetId: 'other' };
            const state = mkState({ units: { villagers: [hunter], npcs: [bystander] }, projectiles: [proj1, proj2] });
            BattleSystem.clearUnitAsTarget('victim', state);
            eq(hunter.targetId, null, 'clearUnitAsTarget 追死者者清空 targetId');
            eq(hunter.state, 'IDLE', 'clearUnitAsTarget 追死者者退回 IDLE');
            eq(hunter.isPlayerLocked, false, 'clearUnitAsTarget 追死者者解除玩家鎖定');
            eq(hunter.pathTarget, null, 'clearUnitAsTarget 清除指向死者的陳舊 pathTarget');
            eq(hunter.fullPath, null, 'clearUnitAsTarget 清除指向死者的陳舊 fullPath');
            eq(hunter.attackTimer, 0, 'clearUnitAsTarget 重置 attackTimer');
            eq(bystander.targetId, 'other', 'clearUnitAsTarget 不影響追別人者');
            eq(state.projectiles.length, 1, 'clearUnitAsTarget 過濾掉飛向死者的投射物');
            ok(state.projectiles[0].id === 'p2', 'clearUnitAsTarget 保留飛向他人的投射物');
        }

        // --- releaseDeadWorkerAssignment：自建築移除工人並遞減目標人數（地板 0）---
        {
            const building = { id: 'bld', assignedWorkers: ['w1', 'w2'], targetWorkerCount: 2 };
            const worker = { id: 'w1', assignedWarehouseId: 'bld' };
            const state = mkState({ mapEntities: [building] });
            BattleSystem.releaseDeadWorkerAssignment(worker, state);
            ok(!building.assignedWorkers.includes('w1'), 'releaseDeadWorkerAssignment 自指派名單移除死亡工人');
            eq(building.targetWorkerCount, 1, 'releaseDeadWorkerAssignment 目標人數遞減(2→1)');

            // 目標人數已為 0 時遞減不應變負（地板 0）
            const b0 = { id: 'b0', assignedWorkers: [], targetWorkerCount: 0 };
            BattleSystem.releaseDeadWorkerAssignment({ id: 'w9', assignedWarehouseId: 'b0' }, mkState({ mapEntities: [b0] }));
            eq(b0.targetWorkerCount, 0, 'releaseDeadWorkerAssignment 目標人數地板為 0（不為負）');
        }

        // --- spawnCorpse：產出資源者 → 屍體實體；resType 大寫；無產出 → null ---
        {
            const unit = { id: 'u1', x: 12, y: 34, configName: '礦工', produce_resource: { gold_ore: 3 } };
            const state = mkState();
            const corpse = BattleSystem.spawnCorpse(unit, state);
            ok(!!corpse, 'spawnCorpse 可產出資源者 → 產生屍體');
            eq(corpse.isCorpse, true, 'spawnCorpse 標記 isCorpse=true');
            eq(corpse.resType, 'GOLD_ORE', 'spawnCorpse resType 一律大寫');
            eq(corpse.amount, 3, 'spawnCorpse 帶入資源數量');
            eq(corpse.x, 12, 'spawnCorpse 沿用單位座標 x');
            eq(corpse.y, 34, 'spawnCorpse 沿用單位座標 y');
            ok(state.mapEntities.includes(corpse), 'spawnCorpse 屍體推入 mapEntities');

            // 無 produce_resource → 不產屍體
            eq(BattleSystem.spawnCorpse({ id: 'u2', x: 0, y: 0 }, mkState()), null, 'spawnCorpse 無產出設定 → null');
            // produce 全為 0 → 視為無有效資源 → null
            eq(BattleSystem.spawnCorpse({ id: 'u3', x: 0, y: 0, produce_resource: { wood: 0 } }, mkState()), null, 'spawnCorpse 產出數量為 0 → null');
        }

        // --- cleanupDeadUnits：移除死者 / 旗標推進 / 清選取 / 依產出生屍 ---
        {
            const deadProducer = { id: 'dp', hp: 0, x: 1, y: 1, configName: '礦工', produce_resource: { stone: 2 } };
            const deadPlain = { id: 'dx', hp: 0, x: 2, y: 2, configName: '士兵' }; // 無產出 → 不生屍
            const alive = { id: 'al', hp: 50 };
            const state = mkState({
                units: { villagers: [deadProducer, alive], npcs: [deadPlain] },
                selectedUnitIds: ['dp', 'al'],
                renderVersion: 5
            });
            BattleSystem.cleanupDeadUnits(state);

            ok(!state.units.villagers.some(u => u.id === 'dp'), 'cleanupDeadUnits 移除死亡生產者');
            ok(!state.units.npcs.some(u => u.id === 'dx'), 'cleanupDeadUnits 移除死亡士兵');
            ok(state.units.villagers.some(u => u.id === 'al'), 'cleanupDeadUnits 保留存活單位');
            ok(state.renderVersion > 5, 'cleanupDeadUnits 推進 renderVersion 觸發重繪');
            eq(state.needsGridUpdate, true, 'cleanupDeadUnits 標記需重算空間網格');
            ok(!state.selectedUnitIds.includes('dp'), 'cleanupDeadUnits 自選取清單剔除死者');
            ok(state.selectedUnitIds.includes('al'), 'cleanupDeadUnits 保留存活者於選取清單');

            // 僅可產出資源者留下屍體；純戰鬥單位不生屍
            const corpses = state.mapEntities.filter(e => e.isCorpse);
            eq(corpses.length, 1, 'cleanupDeadUnits 僅生產者死亡留下屍體（1 具）');
            eq(corpses[0].resType, 'STONE', 'cleanupDeadUnits 生屍資源型別大寫');
        }

        return { fails };
    });

    expect(result.fails, JSON.stringify(result.fails, null, 2)).toEqual([]);
});