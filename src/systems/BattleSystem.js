import { UI_CONFIG } from "../ui/ui_config.js";

/**
 * 獨立戰鬥系統 Alpha 版 (BattleSystem.js)
 * 核心邏輯：陣營識別、自動索敵、攻擊循環、尋路追擊、分時掃描優化
 */
export class BattleSystem {
    static get VISUAL_CONFIG() {
        return UI_CONFIG.Combat;
    }

    static scanInterval = BattleSystem.VISUAL_CONFIG.scanInterval;
    static scanTimer = 0;
    static debugMode = true;

    /**
     * 主更新循環
     */
    static update(state, dt, TILE_SIZE) {
        if (!state || !state.units) return;

        try {
            // 0. 重置渲染旗標 (集結點高亮)
            const allUnits = [...(state.units.villagers || []), ...(state.units.npcs || [])];
            allUnits.forEach(u => u.isRallyTarget = false);

            this.scanTimer += dt;
            const shouldScan = this.scanTimer >= this.scanInterval;
            if (shouldScan) this.scanTimer = 0;

            // 1. 處理所有活著的單位 (村民與 NPC 並列處理)
            const villagers = state.units.villagers || [];
            const npcs = state.units.npcs || [];
            const allAliveUnits = [...villagers, ...npcs].filter(u => u && u.hp > 0);

            allAliveUnits.forEach(unit => {
                this.processCombat(unit, dt, state, TILE_SIZE, shouldScan);
            });

            // 2. 更新遠程子彈
            this.updateProjectiles(state, dt, TILE_SIZE);

            // 3. 清理死亡單位並產生屍體
            this.cleanupDeadUnits(state);

        } catch (error) {
            console.error("[BATTLE SYSTEM CRASH]:", error);
            if (state.addLog) state.addLog(`[系統錯誤] 戰鬥邏輯異常: ${error.message}`, 'SYSTEM');
        }
    }

    static processCombat(unit, dt, state, TILE_SIZE, shouldScan) {
        // [核心修正] 如果單位處於採集或前往資源狀態，完全跳過戰鬥邏輯，防止其攻擊屍體
        if (unit.state === 'GATHERING' || unit.state === 'MOVING_TO_RESOURCE') {
            return;
        }

        // 1. 自動索敵 (如果是手動強制集火，除非目標死亡否則不換目標)
        if (!unit.isPlayerLocked && (shouldScan || !unit.targetId)) {
            this.autoSeeking(unit, state, TILE_SIZE);
        }

        if (!unit.targetId || typeof unit.targetId === 'object') {
            if (unit.state === 'ATTACK' || unit.state === 'CHASE') {
                // 如果是手動設定的單位追隨點，但目標丟失，退回 IDLE
                unit.state = 'IDLE';
                unit.isPlayerLocked = false;
            }
            return;
        }

        const target = this.findEntityById(unit.targetId, state);
        // [核心修正] 如果目標不存在或已是資源點，則解除鎖定。如果是友軍單位則允許跟隨 (HP可無效或存續)。
        if (!target || target.isCorpse) {
            unit.targetId = null;
            if (unit.state === 'ATTACK' || unit.state === 'CHASE') {
                unit.state = 'IDLE';
                unit.isPlayerLocked = false;
            }
            return;
        }

        const dist = this.getDist(unit, target);
        const baseRange = (unit.range || (unit.config && unit.config.range) || 1.5);
        const range = baseRange * TILE_SIZE;

        if (unit.state === 'CHASE') {
            if (unit.chaseFrame === undefined) unit.chaseFrame = 0;
            unit.chaseFrame++;
            const unitCamp = unit.camp || (unit.config && unit.config.camp) || 'player';
            const targetCamp = target.camp || (target.config && target.config.camp) || 'player';
            const isEnemy = unitCamp !== targetCamp && targetCamp !== 'neutral';

            // [優化] 跟隨距離：友軍跟隨保持在大約 80px (1.5 - 2 格) 的舒適距離，不用貼死
            const stopRange = isEnemy ? range : Math.max(range, 80);

            if (dist <= stopRange) {
                if (isEnemy && target.hp > 0) {
                    unit.state = 'ATTACK';
                    unit.pathTarget = null;
                    unit.idleTarget = null;
                    unit.chaseFrame = 0;
                } else {
                    // 友軍或已死目標：保持 CHASE 狀態但停止移動 (達到跟隨距離)
                    unit.idleTarget = null;
                    unit.pathTarget = null;
                    // [視覺] 標記目標為集結點，供渲染器畫出綠圈
                    if (!isEnemy) target.isRallyTarget = true;
                }
            } else if (dist > stopRange && (unit.chaseFrame >= 15 || !unit.idleTarget)) {
                // [核心修正] 只有距離大於停止距離時，才允許更新/重設 idleTarget，避免動畫殘留
                unit.idleTarget = { x: target.x, y: target.y };
                unit.chaseFrame = 0;
                // [視覺] 長距離移動中也標記，確保視覺連貫
                if (!isEnemy) target.isRallyTarget = true;
            }
        } else if (unit.state === 'ATTACK') {
            if (dist > range * 1.5) {
                unit.state = 'CHASE';
                unit.chaseFrame = 10;
            } else {
                if (unit.attackTimer === undefined) unit.attackTimer = 0;
                unit.attackTimer -= dt;
                if (unit.attackTimer <= 0) {
                    this.performAttack(unit, target, state);
                    const atkSpeed = unit.attackSpeed || (unit.config && unit.config.attackSpeed) || 1;
                    unit.attackTimer = 1 / Math.max(0.1, atkSpeed);
                }
            }
        } else if (unit.targetId) {
            if (dist > range) {
                unit.state = 'CHASE';
                unit.chaseFrame = 10;
            } else {
                unit.state = 'ATTACK';
                // [日誌項] 開始攻擊目標
                if (typeof GameEngine !== 'undefined' && !unit._lastLogAttack) {
                    const target = this.findEntityById(unit.targetId, state);
                    if (target) {
                        GameEngine.addLog(`[戰鬥資訊] 攻擊目標：${unit.configName || '單位'} 正在攻擊 ${target.name || target.type} (目標座標: ${Math.round(target.x)}, ${Math.round(target.y)})`, 'BATTLE');
                        unit._lastLogAttack = unit.targetId;
                    }
                }
            }
        }
    }

    static autoSeeking(unit, state, TILE_SIZE) {
        if (!unit.config) return;

        const isInitiative = unit.initiative_attack !== undefined ?
            Number(unit.initiative_attack) === 1 :
            (unit.config.camp === 'enemy');

        if (!isInitiative) return;

        const camp = unit.config.camp || 'player';
        let nearestEnemy = null;
        let minDist = (unit.field_vision || 15) * TILE_SIZE;

        const allPotentialTargets = [
            ...(state.units.villagers || []),
            ...(state.units.npcs || []),
            ...(state.mapEntities ? state.mapEntities.filter(e => e.hp !== undefined) : [])
        ];

        allPotentialTargets.forEach(target => {
            // [修正] 確保索敵目標有 HP 且不是屍體
            if (target === unit || !(target.hp > 0) || target.isCorpse) return;
            const targetCamp = (target.config && target.config.camp) || target.camp || 'neutral';
            if (targetCamp === camp || targetCamp === 'neutral') return;

            const d = this.getDist(unit, target);
            if (d < minDist) {
                minDist = d;
                nearestEnemy = target;
            }
        });

        if (nearestEnemy) {
            unit.targetId = nearestEnemy.id;
            unit.state = 'CHASE';
        }
    }

    static performAttack(attacker, target, state) {
        const attackType = attacker.attack_type || (attacker.config && attacker.config.attack_type) || 1;
        const dmg = attacker.attack || (attacker.config && attacker.config.attack) || 10;

        if (attackType === 1) {
            this.applyDamage(target, dmg, state, attacker.id);
        } else {
            if (!state.projectiles) state.projectiles = [];
            const p = {
                id: 'proj_' + Date.now() + Math.random(),
                type: attackType,
                attackerId: attacker.id,
                targetId: target.id,
                x: attacker.x,
                y: attacker.y,
                startX: attacker.x,
                startY: attacker.y,
                damage: dmg,
                speed: attackType === 2 ? (this.VISUAL_CONFIG.arrow?.speed || 400) : (this.VISUAL_CONFIG.fireball?.speed || 300),
                lastX: target.x,
                lastY: target.y,
                progress: 0,
                duration: 0
            };
            const dist = Math.hypot(target.x - attacker.x, target.y - attacker.y);
            p.duration = dist / p.speed;
            state.projectiles.push(p);
        }
    }

    static applyDamage(target, dmg, state, attackerId = null) {
        // [核心防護] 確保不會對屍體或無效目標造成傷害與跳字
        if (!target || !(target.hp > 0) || target.isCorpse) return;

        target.hp -= dmg;
        target.hitTimer = 1.0;

        if (window.BattleRenderer) {
            window.BattleRenderer.addDamagePopup(target.x, target.y, dmg);
        }

        if (target.hp > 0 && !target.targetId && attackerId) {
            target.targetId = attackerId;
            target.state = 'CHASE';
            target.chaseFrame = 10;
        }

        // [核心追蹤] 幫助排查死亡延遲問題
        if (target.hp <= 0 && typeof GameEngine !== 'undefined') {
            GameEngine.addLog(`[生命值歸零] ${target.configName || '目標'} HP 已耗盡`, 'BATTLE');
        }
    }

    static updateProjectiles(state, dt, TILE_SIZE) {
        if (!state.projectiles) return;

        for (let i = state.projectiles.length - 1; i >= 0; i--) {
            const p = state.projectiles[i];
            p.progress += dt / Math.max(0.01, p.duration);

            if (p.progress >= 1.0) {
                const target = this.findEntityById(p.targetId, state);
                if (target && target.hp > 0) {
                    this.applyDamage(target, p.damage, state, p.attackerId);
                }
                state.projectiles.splice(i, 1);
            } else {
                const target = this.findEntityById(p.targetId, state);
                const tx = (target && target.hp > 0) ? target.x : p.lastX;
                const ty = (target && target.hp > 0) ? target.y : p.lastY;
                p.x = p.startX + (tx - p.startX) * p.progress;
                p.y = p.startY + (ty - p.startY) * p.progress;
            }
        }
    }

    static cleanupDeadUnits(state) {
        if (!state || !state.units) return;
        const categories = ['villagers', 'npcs'];
        categories.forEach(cat => {
            const list = state.units[cat];
            if (!Array.isArray(list)) return;

            for (let i = list.length - 1; i >= 0; i--) {
                const u = list[i];
                if (u && u.hp <= 0) {
                    const deadId = u.id;
                    const produce = u.produce_resource || (u.config && u.config.produce_resource);

                    if (produce) {
                        const corpse = this.spawnCorpse(u, state);
                        if (corpse) {
                            // 轉移攻擊該單位的工人的目標 + 招募周圍閒置工人一同採集 (核心修復：擴大採集隊伍)
                            state.units.villagers.forEach(v => {
                                const vTarget = v.targetId;
                                const isTargetingMe = (vTarget === deadId) || (vTarget && typeof vTarget === 'object' && vTarget.id === deadId);
                                const isNearbyIdle = v.state === 'IDLE' && this.getDist(v, u) < 200; // 招募周圍 200px 內的閒置工人

                                if (isTargetingMe || isNearbyIdle) {
                                    v.targetId = corpse.id; // 改為追蹤新的屍體 ID
                                    v.type = corpse.resType;
                                    v.state = 'MOVING_TO_RESOURCE';
                                    v.pathTarget = null;
                                    v.isPlayerLocked = true;
                                    if (typeof GameEngine !== 'undefined') {
                                        const logRes = isTargetingMe ? `[採集轉移] ${v.configName || '工人'} 已轉為採集 ${corpse.name}` : `[採集支援] ${v.configName || '工人'} 已加入採集 ${corpse.name}`;
                                        GameEngine.addLog(logRes, 'TASK');
                                    }
                                }
                            });
                        }
                    }

                    if (typeof GameEngine !== 'undefined') {
                        GameEngine.addLog(`[單位死亡] ${u.configName || '單位'} 已倒下`, 'BATTLE');
                    }

                    if (state.selectedUnitIds) {
                        const sIdx = state.selectedUnitIds.indexOf(deadId);
                        if (sIdx !== -1) state.selectedUnitIds.splice(sIdx, 1);
                    }
                    if (state.renderVersion !== undefined) state.renderVersion++;
                    state.needsGridUpdate = true; // [核心優化] 強制即時重新計算空間網格，確保屍體立即出現

                    if (typeof GameEngine !== 'undefined') {
                        GameEngine.addLog(`[戰鬥資訊] 目標死亡：${u.configName || '單位'} 已倒下，產生屍體中...`, 'SYSTEM');
                    }

                    list.splice(i, 1);
                }
            }
        });
    }

    static spawnCorpse(unit, state) {
        const produce = unit.produce_resource || (unit.config && unit.config.produce_resource);
        if (!produce) return null;

        const resEntry = Object.entries(produce).find(([k, v]) => v > 0);
        if (!resEntry) return null;

        const [rType, rAmount] = resEntry;
        const corpseId = `corpse_${unit.id}_${Date.now()}`;

        const corpse = {
            id: corpseId,
            x: unit.x || 0,
            y: unit.y || 0,
            type: 'corpse',
            resType: rType.toUpperCase(),
            amount: rAmount,
            maxAmount: rAmount,
            name: `${unit.configName || '單位'}的屍體`,
            isCorpse: true,
            sourceModel: unit.model || (unit.config && unit.config.model) || 'villager',
            resourceType: rType.toUpperCase()
        };

        if (!state.mapEntities) state.mapEntities = [];
        state.mapEntities.push(corpse);
        if (typeof GameEngine !== 'undefined') {
            GameEngine.addLog(`[戰鬥資訊] 屍體產生狀態：是否產生屍體（是） | 座標: ${Math.round(corpse.x)}, ${Math.round(corpse.y)} | 資源: ${corpse.resType} x${corpse.amount}`, 'SYSTEM');
        }
        return corpse;
    }

    static findEntityById(id, state) {
        if (!id || !state) return null;
        if (typeof id === 'object') return id;

        return (state.units.villagers || []).find(u => u.id === id) ||
            (state.units.npcs || []).find(u => u.id === id) ||
            (state.mapEntities || []).find(e => e.id === id);
    }

    static getDist(a, b) {
        if (!a || !b) return 999999;
        return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
    }
}
