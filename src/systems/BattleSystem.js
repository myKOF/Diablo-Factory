import { UI_CONFIG } from "../ui/ui_config.js";
/**
 * 獨立戰鬥系統 Alpha 版 (BattleSystem.js)
 * 核心邏輯：陣營識別、自動索敵、攻擊循環、尋路追擊、分時掃描優化
 */
export class BattleSystem {
    // 戰鬥表現相關參數 (已根據 [核心規約] 移至 ui_config.js 統一管理)
    static get VISUAL_CONFIG() {
        return UI_CONFIG.Combat;
    }

    static scanInterval = BattleSystem.VISUAL_CONFIG.scanInterval;
    static scanTimer = 0;
    static debugMode = true;

    static update(state, dt, TILE_SIZE) {
        if (!state || !state.units) return;
        const units = state.units.villagers;
        if (!units || units.length === 0) return;

        this.scanTimer += dt;
        const shouldScan = this.scanTimer >= this.scanInterval;
        if (shouldScan) this.scanTimer = 0;

        units.forEach(unit => {
            if (unit.hp <= 0) return;
            this.processCombat(unit, dt, state, TILE_SIZE, shouldScan);
        });

        // 更新遠程子彈邏輯
        this.updateProjectiles(state, dt, TILE_SIZE);

        this.cleanupDeadUnits(state);
    }

    static processCombat(unit, dt, state, TILE_SIZE, shouldScan) {
        // 1. 自動索敵 (如果是手動強制集火，除非目標死亡否則不換目標)
        // [新協定] 系統自動化僅在非玩家鎖定狀態下觸發
        if (!unit.isPlayerLocked && (shouldScan || !unit.targetId)) {
            this.autoSeeking(unit, state, TILE_SIZE);
        }

        if (!unit.targetId || typeof unit.targetId === 'object') {
            if (unit.state === 'ATTACK' || unit.state === 'CHASE') {
                unit.state = 'IDLE';
                unit.isPlayerLocked = false; // [新協定] 目標消失，重置玩家鎖定
            }
            unit.forceFocus = false;
            return;
        }

        const target = this.findEntityById(unit.targetId, state);
        if (!target || target.hp <= 0) {
            unit.targetId = null;
            unit.forceFocus = false;
            if (unit.state === 'ATTACK' || unit.state === 'CHASE') {
                unit.state = 'IDLE';
                unit.isPlayerLocked = false; // [新協定] 目標已死亡，重置玩家鎖定
            }
            return;
        }

        const dist = this.getDist(unit, target);
        // 優化射程：近戰時增加體積緩衝，讓雙方不擠入同一格子
        const baseRange = (unit.range || (unit.config && unit.config.range) || 1.5);
        const rangeBuffer = (baseRange < 2) ? TILE_SIZE * 0.9 : 0;
        const range = baseRange * TILE_SIZE + rangeBuffer;

        if (unit.state === 'CHASE') {
            if (unit.chaseFrame === undefined) unit.chaseFrame = 0;
            unit.chaseFrame++;

            // 直奔目標，進入射程即停
            if (dist <= range) {
                unit.state = 'ATTACK';
                unit.idleTarget = null;
                unit.pathTarget = null;
                unit.chaseFrame = 0;
            } else if (unit.chaseFrame >= 15 || !unit.idleTarget) {
                // [協議簡化] 不再進行複雜包圍計算，直接鎖定目標中心點
                unit.idleTarget = { x: target.x, y: target.y };
                unit.chaseFrame = 0;
            }
        } else if (unit.state === 'ATTACK') {
            if (dist > range * 1.5) {
                unit.state = 'CHASE';
                unit.chaseFrame = 10;
            } else {
                // [本地避讓] 僅在定點重合時，作極小幅度的位置微調
                if (shouldScan) {
                    const neighbors = state.units.villagers.filter(u => u !== unit && u.hp > 0 && u.state === 'ATTACK' && this.getDist(unit, u) < 10);
                    if (neighbors.length > 0) {
                        const angle = Math.atan2(unit.y - neighbors[0].y, unit.x - neighbors[0].x) + (Math.random() - 0.5);
                        unit.idleTarget = { x: unit.x + Math.cos(angle) * 15, y: unit.y + Math.sin(angle) * 15 };
                        unit.state = 'CHASE';
                        unit.chaseFrame = 5; // 快速反應
                        return;
                    }
                }

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
            }
        }
    }

    static autoSeeking(unit, state, TILE_SIZE) {
        if (!unit.config) return;

        // 【核心優化】對玩家手動目標實例集火保護
        if (unit.forceFocus && unit.targetId) {
            const currentManualTarget = this.findEntityById(unit.targetId, state);
            if (currentManualTarget && currentManualTarget.hp > 0) return; // 除非目標消失，否則不切換
        }

        const isInitiative = unit.initiative_attack !== undefined ? Number(unit.initiative_attack) === 1 : (unit.config.camp === 'enemy');

        if (!isInitiative) {
            const currentTarget = this.findEntityById(unit.targetId, state);
            const isTargetEnemy = currentTarget && ((currentTarget.config && currentTarget.config.camp === 'enemy') || currentTarget.camp === 'enemy');
            if (!isTargetEnemy) return;
        }

        let currentTarget = this.findEntityById(unit.targetId, state);
        if (currentTarget && currentTarget.hp > 0 && this.getDist(unit, currentTarget) <= (unit.field_vision || 15) * TILE_SIZE) return;

        const camp = unit.config.camp || 'player';
        let nearestEnemy = null;
        let minDist = (unit.field_vision || 15) * TILE_SIZE;

        const allPotentialTargets = [
            ...(state.units.villagers || []),
            ...(state.mapEntities ? state.mapEntities.filter(e => e.hp !== undefined) : [])
        ];

        allPotentialTargets.forEach(target => {
            if (target === unit || target.hp <= 0) return;
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
            unit.chaseFrame = 10;
            unit.forceFocus = false; // 自動索敵拿到的目標不具備強制鎖定屬性，可隨距離變換
            this.logToScreen(state, `[戰鬥] ${unit.configName} 鎖定目標: ${nearestEnemy.configName || nearestEnemy.id}`);
        }
    }

    static performAttack(attacker, target, state) {
        const attackType = attacker.attack_type || 1;
        const dmg = attacker.attack || (attacker.config && attacker.config.attack) || 10;

        if (attackType === 1) {
            // 近戰：立刻結算
            this.applyDamage(target, dmg, state);
        } else {
            // 遠程：發射子彈
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
                target: target,
                damage: dmg,
                speed: attackType === 2 ? this.VISUAL_CONFIG.arrow.speed : this.VISUAL_CONFIG.fireball.speed,
                progress: 0,
                duration: 0,
                totalDistance: Math.hypot(target.x - attacker.x, target.y - attacker.y)
            };

            // 計算預估飛行時間
            p.duration = p.totalDistance / p.speed;
            state.projectiles.push(p);
        }
    }

    static applyDamage(target, dmg, state) {
        target.hp -= dmg;
        target.hitTimer = 1.0;

        if (window.BattleRenderer) {
            window.BattleRenderer.addDamagePopup(target.x, target.y, dmg);
        }

        if (target.hp > 0 && !target.targetId) {
            // [新協定] 如果目標單位正處於玩家指令鎖定中，則被攻擊時不自動反擊，以免打斷玩家指令
            if (target.isPlayerLocked) {
                return;
            }

            const targetCamp = (target.config && target.config.camp) || target.camp || 'neutral';
            if (targetCamp !== 'neutral') {
                target.targetId = null; // 先重置
                // 這裡會由 autoSeeking 下一次掃描時處理，或者立刻給予反擊目標
                // 為了反應即時，這裡可以直接設定
                // 但需要注意 attacker 可能已死
            }
        }
    }

    static updateProjectiles(state, dt, TILE_SIZE) {
        if (!state.projectiles) return;

        for (let i = state.projectiles.length - 1; i >= 0; i--) {
            const p = state.projectiles[i];
            p.progress += dt / Math.max(0.01, p.duration);

            if (p.progress >= 1.0) {
                // 命中目標
                const target = this.findEntityById(p.targetId, state);
                if (target && target.hp > 0) {
                    this.applyDamage(target, p.damage, state);

                    // 如果目標原本沒目標，且受擊，觸發反擊邏輯 (同 applyDamage 內)
                    if (!target.targetId && !target.isPlayerLocked) {
                        target.targetId = p.attackerId;
                        target.state = 'CHASE';
                        target.chaseFrame = 10;
                    }
                }
                state.projectiles.splice(i, 1);
            } else {
                // 更新子彈實時位置 (追蹤移動中的目標)
                const target = this.findEntityById(p.targetId, state);
                if (target) {
                    // 子彈朝向目標移動
                    const curX = p.startX + (target.x - p.startX) * p.progress;
                    const curY = p.startY + (target.y - p.startY) * p.progress;
                    p.x = curX;
                    p.y = curY;
                } else {
                    // 目標消失，子彈繼續飛往最後已知點後消失 (簡單處理：直接消失)
                    state.projectiles.splice(i, 1);
                }
            }
        }
    }

    static cleanupDeadUnits(state) {
        const units = state.units.villagers;
        for (let i = units.length - 1; i >= 0; i--) {
            if (units[i].hp <= 0) {
                const deadId = units[i].id;
                if (state.selectedUnitIds) {
                    const idx = state.selectedUnitIds.indexOf(deadId);
                    if (idx !== -1) state.selectedUnitIds.splice(idx, 1);
                }
                units.splice(i, 1);
                this.logToScreen(state, `[戰鬥] 單位死亡: ${deadId}`);
            }
        }
    }

    static logToScreen(state, msg) {
        if (!state) return;
        if (typeof window !== 'undefined' && window.GameEngine) {
            window.GameEngine.addLog(msg, 'SYSTEM');
        }
    }

    static getDist(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    static findEntityById(id, state) {
        if (!id || !state) return null;
        if (typeof id === 'object') return id;
        return (state.units.villagers || []).find(u => u.id === id) ||
            (state.mapEntities ? state.mapEntities.filter(e => e.id === id)[0] : null);
    }
}
