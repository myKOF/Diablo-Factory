/**
 * 視覺特效系統 (EffectSystem.js)
 * 核心職責：管理全域粒子效果、發射器狀態、遠程彈道邏輯
 * 實作受控重構：將視覺邏輯與核心引擎解耦
 */
export class EffectSystem {
    static update(state, dt, TILE_SIZE, onProjectileHit = null) {
        if (!state) return;

        // 1. 更新遠程子彈彈道 (Projectiles)
        this.updateProjectiles(state, dt, TILE_SIZE, onProjectileHit);
    }

    /**
     * 更新遠程子彈彈道
     * @param {Object} state 
     * @param {number} dt 
     * @param {number} TILE_SIZE 
     * @param {Function} onHit 抵達時的回呼函數 (用於執行傷害判定)
     */
    static updateProjectiles(state, dt, TILE_SIZE, onHit) {
        if (!state.projectiles) return;

        for (let i = state.projectiles.length - 1; i >= 0; i--) {
            const p = state.projectiles[i];
            p.progress += dt / Math.max(0.01, p.duration);

            if (p.progress >= 1.0) {
                // 彈道抵達
                if (onHit) {
                    const target = this.findEntityById(p.targetId, state);
                    if (target && target.hp > 0) {
                        onHit(target, p.damage, state, p.attackerId);
                    }
                }
                state.projectiles.splice(i, 1);
            } else {
                const target = this.findEntityById(p.targetId, state);
                const tx = (target && target.hp > 0) ? target.x : p.lastX;
                const ty = (target && target.hp > 0) ? target.y : p.lastY;
                
                p.x = p.startX + (tx - p.startX) * p.progress;
                p.y = p.startY + (ty - p.startY) * p.progress;

                // [特效重構] 處理特定類型的拖尾邏輯 (火球、投石)
                this.updateProjectileEffects(p, dt);
            }
        }
    }

    /**
     * 更新子彈附帶的特效數據 (如煙霧、火花拖尾)
     */
    static updateProjectileEffects(p, dt) {
        if (p.type === 3) {
            // 魔法火球拖尾
            if (!p.history) p.history = [];
            p.history.push({ x: p.x, y: p.y, alpha: 1.0 });
            if (p.history.length > 8) p.history.shift();
            p.history.forEach(h => { h.alpha -= 0.1; });
        } else if (p.type === 4) {
            // 投石車火焰投石
            const cfg = (window.UI_CONFIG && window.UI_CONFIG.effects && window.UI_CONFIG.effects.flamingBoulder) || {
                smoke: { lifespan: 800 }, fire: { lifespan: 400 }
            };

            // 煙霧更新
            if (!p.historySmoke) p.historySmoke = [];
            p.historySmoke.push({ x: p.x, y: p.y, life: cfg.smoke.lifespan, seed: Math.random() });
            for (let i = p.historySmoke.length - 1; i >= 0; i--) {
                p.historySmoke[i].life -= dt * 1000;
                if (p.historySmoke[i].life <= 0) p.historySmoke.splice(i, 1);
            }

            // 火焰更新
            if (!p.historyFire) p.historyFire = [];
            p.historyFire.push({ x: p.x, y: p.y, life: cfg.fire.lifespan, seed: Math.random() });
            for (let i = p.historyFire.length - 1; i >= 0; i--) {
                p.historyFire[i].life -= dt * 1000;
                if (p.historyFire[i].life <= 0) p.historyFire.splice(i, 1);
            }
        }
    }

    /**
     * 當單位受擊時觸發 (視覺回饋)
     */
    static onUnitHit(unit, dmg) {
        if (window.BattleRenderer) {
            window.BattleRenderer.addDamagePopup(unit.x, unit.y, dmg);
        }
    }

    /**
     * 輔助方法：根據 ID 尋找實體
     */
    static findEntityById(id, state) {
        if (!id || !state) return null;
        if (typeof id === 'object') return id;

        return (state.units.villagers || []).find(u => u.id === id) ||
               (state.units.npcs || []).find(u => u.id === id) ||
               (state.mapEntities || []).find(e => e.id === id);
    }
}
