
/**
 * 獨立戰鬥系統 Alpha 版 (BattleSystem.js)
 * 核心邏輯：陣營識別、自動索敵、攻擊循環、尋路追擊、分時掃描優化
 */
export class BattleSystem {
    static scanInterval = 0.3; 
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

        this.cleanupDeadUnits(state);
    }

    static processCombat(unit, dt, state, TILE_SIZE, shouldScan) {
        // 1. 自動索敵
        if (shouldScan || !unit.targetId) {
            this.autoSeeking(unit, state, TILE_SIZE);
        }

        if (!unit.targetId || typeof unit.targetId === 'object') {
            if (unit.state === 'ATTACK' || unit.state === 'CHASE') unit.state = 'IDLE';
            return;
        }

        const target = this.findEntityById(unit.targetId, state);
        if (!target || target.hp <= 0) {
            unit.targetId = null;
            if (unit.state === 'ATTACK' || unit.state === 'CHASE') unit.state = 'IDLE';
            return;
        }

        const dist = this.getDist(unit, target);
        // 優化射程：如果是近戰 (range < 2)，提供約單位體積一半的緩衝，防止擠壓重疊
        const baseRange = (unit.range || (unit.config && unit.config.range) || 1.5);
        const rangeBuffer = (baseRange < 2) ? TILE_SIZE * 0.9 : 0; // 近戰增加約 1 格的緩衝，讓他們站在邊緣
        const range = baseRange * TILE_SIZE + rangeBuffer;

        if (unit.state === 'CHASE') {
            if (unit.chaseFrame === undefined) unit.chaseFrame = 0;
            unit.chaseFrame++;

            if (dist <= range) {
                unit.state = 'ATTACK';
                unit.idleTarget = null;
                unit.pathTarget = null;
                unit.chaseFrame = 0;
            } else if (unit.chaseFrame >= 10 || !unit.idleTarget) {
                // 追擊目標：稍微繞開中心點，防止路徑重疊衝突
                const idNum = parseInt(unit.id.replace(/[^0-9]/g, '')) || 0;
                const angle = (idNum % 12) * (Math.PI / 6); 
                const offsetDist = range * 0.9; // 改為 90% 的射程，停在邊緣，不擠入中心
                unit.idleTarget = {
                    x: target.x + Math.cos(angle) * offsetDist,
                    y: target.y + Math.sin(angle) * offsetDist
                };
                unit.chaseFrame = 0;
            }
        } else if (unit.state === 'ATTACK') {
            // 追逐緩衝區 (Hysteresis Buffer): 離開射程 1.5 倍以上才重新變回 CHASE，防止閃頻
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
            // 基礎狀態判斷，確保一旦有了目標就啟動追擊
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
        const isInitiative = unit.initiative_attack !== undefined ? Number(unit.initiative_attack) === 1 : (unit.config.camp === 'enemy');

        // 非主動攻擊單位：只有在「原本目標已消失且現在處於戰鬥狀態下」才重新鎖定最近敵人
        if (!isInitiative) {
            const currentTarget = this.findEntityById(unit.targetId, state);
            const isTargetEnemy = currentTarget && ((currentTarget.config && currentTarget.config.camp === 'enemy') || currentTarget.camp === 'enemy');
            if (!isTargetEnemy) return; // 沒受到威脅就不掃描
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
            // 核心修復：一旦鎖定新目標，立即切換至 CHASE 狀態，讓 GameEngine 發動移動邏輯
            unit.state = 'CHASE';
            unit.chaseFrame = 10; 
            this.logToScreen(state, `[戰鬥] ${unit.configName}(${unit.id.substr(-3)}) 鎖定目標: ${nearestEnemy.configName || nearestEnemy.id}`);
        }
    }

    static performAttack(attacker, target, state) {
        const dmg = attacker.attack || (attacker.config && attacker.config.attack) || 10;
        target.hp -= dmg;
        target.hitTimer = 1.0;

        if (window.BattleRenderer) {
            window.BattleRenderer.addDamagePopup(target.x, target.y, dmg);
        }

        // 被打的一方若無目標且非中立陣營，則自動反擊 (Retaliate)
        if (target.hp > 0 && !target.targetId) {
            const targetCamp = (target.config && target.config.camp) || target.camp || 'neutral';
            if (targetCamp !== 'neutral') {
                target.targetId = attacker.id;
                target.state = 'CHASE';
                target.chaseFrame = 10;
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
