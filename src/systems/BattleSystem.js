import { GameEngine } from './game_systems.js';

/**
 * 獨立戰鬥系統 Alpha 版 (BattleSystem.js)
 * 核心邏輯：陣營識別、自動索敵、攻擊循環、尋路追擊、分時掃描優化
 */
export class BattleSystem {
    static scanInterval = 0.3; // 每 0.3 秒掃描一次敵人 (約每秒 3 次)
    static scanTimer = 0;

    /**
     * 更新戰鬥邏輯
     * @param {number} dt Delta time in seconds
     */
    static update(dt) {
        const units = GameEngine.state.units.villagers;
        if (!units || units.length === 0) return;

        this.scanTimer += dt;
        const shouldScan = this.scanTimer >= this.scanInterval;
        if (shouldScan) this.scanTimer = 0;

        units.forEach(unit => {
            if (unit.hp <= 0) return;

            // 1. 自動索敵 (分時優化)
            if (shouldScan || !unit.targetId) {
                this.autoSeeking(unit);
            }

            // 2. 戰鬥循環與尋路追擊
            this.processCombat(unit, dt);
        });
        
        // 3. 死亡清理 (Death Cleanup)
        this.cleanupDeadUnits();
    }

    /**
     * 自動索敵：根據陣營偵測視野內最近的敵人
     */
    static autoSeeking(unit) {
        // 讀取主動攻擊設定：0 = 被動，1 = 主動
        const isInitiative = Number(unit.initiative_attack) === 1;
        
        // 如果是被動單位且目前沒有目標，則不主動索敵
        if (!isInitiative && !unit.targetId) {
            return;
        }

        // 如果已經有目標且目標還活著，則不需要重新索敵
        let currentTarget = this.findEntityById(unit.targetId);
        if (currentTarget && currentTarget.hp > 0 && this.getDist(unit, currentTarget) <= unit.field_vision * GameEngine.TILE_SIZE) {
            return; 
        }

        const camp = unit.config.camp;
        let nearestEnemy = null;
        let minDist = unit.field_vision * GameEngine.TILE_SIZE;

        const allPotentialTargets = [
            ...GameEngine.state.units.villagers,
            ...GameEngine.state.mapEntities.filter(e => e.hp !== undefined) // 包含有血條的採集物或建築
        ];

        allPotentialTargets.forEach(target => {
            if (target === unit || target.hp <= 0) return;
            
            // 陣營判斷：不攻擊同陣營 (player vs enemy)
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
        }
    }

    /**
     * 處理攻擊循環與尋路追擊
     */
    static processCombat(unit, dt) {
        if (!unit.targetId) {
            // 如果沒目標且在攻擊狀態，重置回閒置
            if (unit.state === 'ATTACK') unit.state = 'IDLE';
            return;
        }

        const target = this.findEntityById(unit.targetId);
        if (!target || target.hp <= 0) {
            unit.targetId = null;
            unit.state = 'IDLE';
            return;
        }

        const dist = this.getDist(unit, target);
        const range = (unit.range || 1.5) * GameEngine.TILE_SIZE;

        if (dist <= range) {
            // 進入攻擊範圍：停下並攻擊
            unit.state = 'ATTACK';
            unit.pathTarget = null; // 停止移動
            
            if (unit.attackTimer === undefined) unit.attackTimer = 0;
            unit.attackTimer -= dt;

            if (unit.attackTimer <= 0) {
                this.performAttack(unit, target);
                // 重設冷卻：1 / 攻速
                const atkSpeed = unit.attackSpeed || 1;
                unit.attackTimer = 1 / atkSpeed;
            }
        } else if (dist <= unit.field_vision * GameEngine.TILE_SIZE) {
            // 目標在視野內但在範圍外：追擊
            unit.state = 'MOVE';
            
            // 尋路整合：如果目標移動了，重新呼叫尋路 (約每秒更新一次路徑以節省效能)
            if (!unit.lastRetargetTime) unit.lastRetargetTime = 0;
            unit.lastRetargetTime += dt;
            
            if (unit.lastRetargetTime >= 0.5 || !unit.pathTarget) {
                unit.idleTarget = { x: target.x, y: target.y };
                unit.lastRetargetTime = 0;
            }
        } else {
            // 目標跟丟
            unit.targetId = null;
            unit.state = 'IDLE';
        }
    }

    /**
     * 執行攻擊並扣血
     */
    static performAttack(attacker, target) {
        const dmg = attacker.attack || 10;
        target.hp -= dmg;
        
        // 視覺標記：受擊時間 (用於血條顯示與 Damage Popup)
        target.hitTimer = 1.0; 
        
        // 觸發傷害跳字
        if (window.BattleRenderer) {
            window.BattleRenderer.addDamagePopup(target.x, target.y, dmg);
        }

        // 反擊邏輯 (Retaliation)：受擊者若無目標且具備戰鬥屬性，自動鎖定攻擊者
        if (target.hp > 0 && !target.targetId && target.initiative_attack !== undefined) {
            target.targetId = attacker.id;
        }

        // console.log(`[Battle] ${attacker.id} 攻擊 ${target.id}, 造成 ${dmg} 傷害, 剩餘 HP: ${target.hp}`);
    }

    /**
     * 死亡清理：移除 HP <= 0 的單位
     */
    static cleanupDeadUnits() {
        const units = GameEngine.state.units.villagers;
        const deadIndices = [];
        for (let i = units.length - 1; i >= 0; i--) {
            if (units[i].hp <= 0) {
                // 如果是玩家選中的，取消選取
                if (GameEngine.state.selectedUnitId === units[i].id) {
                    GameEngine.state.selectedUnitId = null;
                }
                units.splice(i, 1);
            }
        }
    }

    // Helper Functions
    static getDist(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    static findEntityById(id) {
        if (!id) return null;
        return GameEngine.state.units.villagers.find(u => u.id === id) ||
               GameEngine.state.mapEntities.find(e => e.id === id);
    }
}
