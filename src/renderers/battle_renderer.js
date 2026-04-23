import { UI_CONFIG } from "../ui/ui_config.js";
import { BattleSystem } from "../systems/BattleSystem.js";

/**
 * 戰鬥視覺系統 (BattleRenderer.js)
 * 渲染：傷害跳字 (Object Pooling)、血條顯示 (受擊/滑鼠移入時顯示)
 */
export class BattleRenderer {
    static damagePopups = []; // 活躍的傷害跳字
    static popupPool = [];     // 物件池 (用於重複使用傷害跳字標籤)
    static hpBarTimer = 1.5;   // 受擊後顯示血條的時間 (秒)

    static init(scene) {
        this.scene = scene;
        this.popupGroup = this.scene.add.group();

        // 從配置中心讀取顯示計時器
        const cfg = UI_CONFIG.UnitHealthBar || {};
        this.hpBarTimer = cfg.showTimer || 1.5;

        window.BattleRenderer = this; // 全局掛載，便於 BattleSystem 調用
    }

    /**
     * 新增傷害跳字
     * 使用 Object Pooling 提供高效能跳字渲染
     * @param {number} x X 座標
     * @param {number} y Y 座標
     * @param {number} amount 傷害數值
     */
    static addDamagePopup(x, y, amount) {
        if (!this.scene) return;

        let popup;
        if (this.popupPool.length > 0) {
            popup = this.popupPool.pop();
            popup.setActive(true).setVisible(true);
            popup.setPosition(x, y - 20);
        } else {
            popup = this.scene.add.text(x, y - 20, '', {
                font: 'bold 24px Arial',
                fill: '#ff5252',
                stroke: '#000000',
                strokeThickness: 4
            }).setOrigin(0.5, 0.5).setDepth(5000000);
        }

        popup.setText(`-${amount}`);
        popup.setAlpha(1);

        // 動畫：向上漂浮並變透明
        this.scene.tweens.add({
            targets: popup,
            y: y - 80,
            alpha: 0,
            duration: 800,
            ease: 'Cubic.out',
            onComplete: () => {
                popup.setActive(false).setVisible(false);
                this.popupPool.push(popup);
            }
        });
    }

    /**
     * 繪製所有單位的血條與受擊特效
     * 策略：受擊才顯示、滑鼠移入才顯示、或是被選取時常駐顯示
     * @param {CanvasRenderingContext2D} gGraphics (Phaser 這裡傳入的是 Graphics 物件)
     * @param {Array} units 所有戰鬥單位
     * @param {number} dt Delta time
     */
    static renderHPBars(g, units, dt) {
        if (!g || !units) return;
        const scene = this.scene;
        const pointer = scene.input.activePointer;

        // 從全域狀態獲取目前選取 ID 列表
        const selectedIds = window.GAME_STATE ? (window.GAME_STATE.selectedUnitIds || []) : [];

        units.forEach(unit => {
            if (unit.visible === false) return; // [核心新增] 如果單位被標記為不可見（如派駐工廠中），則不渲染血條
            
            // 使用渲染座標進行視覺計算 (rx, ry)，確保血條始終貼合視覺模型
            const rx = unit.renderX !== undefined ? unit.renderX : unit.x;
            const ry = unit.renderY !== undefined ? unit.renderY : unit.y;

            // 受擊計時器
            if (unit.hitTimer === undefined) unit.hitTimer = 0;
            if (unit.hitTimer > 0) unit.hitTimer -= dt;

            // 1. 判斷顯示條件：受擊中 OR 滑鼠懸停 OR 目前選中
            const isHovered = window.GAME_STATE?.hoveredId === unit.id;
            const isSelected = selectedIds.includes(unit.id);
            const isTargetedByPlayerArmy = window.GAME_STATE?.units?.villagers?.some(u => u.targetId === unit.id) || false;

            // 如果符合任一條件（受擊、懸停、選中、正在戰鬥、或是我方單位集火目標），渲染血條
            const isInCombat = (unit.state === 'CHASE' || unit.state === 'ATTACK');
            if (unit.hitTimer > 0 || isHovered || isSelected || isInCombat || isTargetedByPlayerArmy) {
                this.drawHPBar(g, unit, rx, ry);


            }
        });
    }

    /**
     * 繪製單個血條
     */
    static drawHPBar(g, unit, rx, ry) {
        const cfg = UI_CONFIG.UnitHealthBar || { width: 40, height: 6, offsetY: 30 };
        const barWidth = cfg.width;
        const barHeight = cfg.height;
        const x = rx - barWidth / 2;
        const y = ry + cfg.offsetY; // 使用配置偏移，通常為正值 (下方)

        const hpPercent = Math.max(0, unit.hp / (unit.maxHp || 100));

        // 1. 繪製背景
        let bgColorNum = 0x333333;
        if (typeof cfg.bgColor === 'string' && cfg.bgColor.startsWith('#')) {
            const raw = cfg.bgColor.replace('#', '');
            const cleaned = raw.length > 6 ? raw.substring(0, 6) : raw;
            bgColorNum = parseInt(cleaned, 16);
        } else if (typeof cfg.bgColor === 'number') {
            bgColorNum = cfg.bgColor;
        }
        g.fillStyle(bgColorNum, cfg.bgAlpha || 0.8);
        g.fillRect(x, y, barWidth, barHeight);

        // 2. 繪製填充 (優先根據敵我分類，次之根據血量比例)
        const isEnemy = (unit.config && unit.config.camp === 'enemy') || unit.camp === 'enemy';
        const isNeutral = (unit.config && unit.config.camp === 'neutral') || unit.camp === 'neutral';
        const neutralCfg = UI_CONFIG.NeutralSelection || { hpFillColor: "#ff9100" };

        let color = 0x4caf50; // Green

        if (isNeutral) {
            color = this.parseColor(neutralCfg.hpFillColor);
        } else if (isEnemy) {
            color = 0xf44336; // 敵軍統一使用紅色
        } else {
            if (hpPercent < 0.3) color = 0xf44336; // 危險
            else if (hpPercent < 0.6) color = 0xff9800; // 警告
        }

        g.fillStyle(color, 1);
        g.fillRect(x, y, barWidth * hpPercent, barHeight);

        g.lineStyle(1, 0xffffff, 0.3);
        g.strokeRect(x, y, barWidth, barHeight);
    }

    /**
     * 渲染所有遠程子彈
     * @param {Phaser.GameObjects.Graphics} g 
     * @param {Object} state 
     * @param {number} dt 
     */
    static renderProjectiles(g, state, dt) {
        if (!g || !state.projectiles || state.projectiles.length === 0) return;
        const vCfg = BattleSystem.VISUAL_CONFIG;
        if (!vCfg) return;

        state.projectiles.forEach(p => {
            const rx = p.x;
            let ry = p.y;

            if (p.type === 2) {
                // -- 遠程拋物線弓箭 --
                const cfg = vCfg.arrow;
                const arcH = Math.min(cfg.arcHeightMax, p.totalDistance * cfg.arcHeightFactor);
                const offset = Math.sin(Math.PI * p.progress) * arcH;
                ry -= offset;

                // 計算切線方向以旋轉箭身
                const lookAhead = 0.01;
                const nextP = Math.min(1.0, p.progress + lookAhead);
                const target = BattleSystem.findEntityById(p.targetId, state) || { x: p.x, y: p.y };
                const nextX = p.startX + (target.x - p.startX) * nextP;
                const nextY = p.startY + (target.y - p.startY) * nextP - Math.sin(Math.PI * nextP) * arcH;

                const angle = Math.atan2(nextY - ry, nextX - rx);
                const colorNum = this.parseColor(cfg.color);

                g.lineStyle(1, colorNum, 1);
                g.fillStyle(colorNum, 1);

                // 繪製帶旋轉的長方形 (箭身)
                const arrowLen = 14;
                const arrowWid = cfg.size || 2;

                const cos = Math.cos(angle);
                const sin = Math.sin(angle);

                const x1 = rx - cos * arrowLen / 2;
                const y1 = ry - sin * arrowLen / 2;
                const x2 = rx + cos * arrowLen / 2;
                const y2 = ry + sin * arrowLen / 2;

                g.lineStyle(arrowWid, colorNum, 1);
                g.lineBetween(x1, y1, x2, y2);

                // 箭頭 (稍微突出)
                g.fillStyle(colorNum, 1);
                g.fillCircle(x2, y2, arrowWid);
            } else if (p.type === 3) {
                // -- 遠程直線魔法火球 --
                const cfg = vCfg.fireball;
                const size = cfg.sizeBase + Math.sin(Date.now() * 0.01) * 2;

                const glowColor = this.parseColor(cfg.colorGlow);
                const coreColor = this.parseColor(cfg.colorCore);
                const trailColor = this.parseColor(cfg.colorTrail);

                // 繪製拖尾 (由 EffectSystem 更新數據，此處僅負責繪圖)
                if (p.history) {
                    p.history.forEach((h, idx) => {
                        const trailSize = size * (idx / p.history.length);
                        g.fillStyle(trailColor, h.alpha * 0.5);
                        g.fillCircle(h.x + (Math.random() - 0.5) * 3, h.y + (Math.random() - 0.5) * 3, trailSize);
                    });
                }

                // 核心火球
                g.fillStyle(glowColor, 0.8);
                g.fillCircle(rx, ry, size + 2);
                g.fillStyle(coreColor, 1.0);
                g.fillCircle(rx, ry, size);

                // 核心濺射感
                g.fillStyle(0xffffff, 0.5);
                g.fillCircle(rx, ry, size * 0.5);
            } else if (p.type === 4) {
                // -- 遠程投石車拋物線火焰投石 --
                const cfg = UI_CONFIG.effects.flamingBoulder;
                const arrowCfg = vCfg.arrow; // 重用拋物線參數
                const arcH = Math.min(arrowCfg.arcHeightMax * 1.8, p.totalDistance * arrowCfg.arcHeightFactor * 1.5); // 投石車弧度更高
                const offset = Math.sin(Math.PI * (p.progress || 0)) * arcH;
                ry -= offset;

                // 1. 繪製煙霧拖尾 (數據由 EffectSystem 維護)
                if (p.historySmoke) {
                    for (let i = 0; i < p.historySmoke.length; i++) {
                        const s = p.historySmoke[i];
                        const ratio = 1 - (s.life / cfg.smoke.lifespan);
                        const alpha = cfg.smoke.alpha.start * (1 - ratio);
                        const scale = cfg.smoke.scale.start + (cfg.smoke.scale.end - cfg.smoke.scale.start) * ratio;
                        
                        g.fillStyle(this.parseColor(cfg.smoke.tint), alpha);
                        const driftX = Math.sin(ratio * 5 + s.seed) * 10;
                        const driftY = ratio * cfg.smoke.gravityY * 0.5;
                        g.fillCircle(s.x + driftX, s.y + driftY, 12 * scale);
                    }
                }

                // 2. 繪製火焰拖尾 (數據由 EffectSystem 維護)
                if (p.historyFire) {
                    for (let i = 0; i < p.historyFire.length; i++) {
                        const f = p.historyFire[i];
                        const ratio = 1 - (f.life / cfg.fire.lifespan);
                        const alpha = cfg.fire.alpha.start * (1 - ratio);
                        const scale = cfg.fire.scale.start + (cfg.fire.scale.end - cfg.fire.scale.start) * ratio;
                        
                        let color;
                        if (ratio < 0.5) {
                            color = this.lerpColor(cfg.fire.tint[0], cfg.fire.tint[1], ratio * 2);
                        } else {
                            color = this.lerpColor(cfg.fire.tint[1], cfg.fire.tint[2], (ratio - 0.5) * 2);
                        }

                        g.fillStyle(color, alpha);
                        const driftY = ratio * cfg.fire.gravityY * 0.4;
                        g.fillCircle(f.x + (Math.random() - 0.5) * 5, f.y + driftY, 8 * scale);
                    }
                }

                // 3. 核心投出的巨石
                g.fillStyle(0x333333, 1);
                g.fillCircle(rx, ry, 7);
                g.fillStyle(0xff8800, 1); // 表面焦紅
                g.fillCircle(rx, ry, 5);
                g.fillStyle(0xffff00, 0.8); // 核心亮點
                g.fillCircle(rx, ry, 2);
            }
        });
    }

    /**
     * 線性插值顏色
     */
    static lerpColor(c1, c2, r) {
        const r1 = (c1 >> 16) & 255, g1 = (c1 >> 8) & 255, b1 = c1 & 255;
        const r2 = (c2 >> 16) & 255, g2 = (c2 >> 8) & 255, b2 = c2 & 255;
        const rr = r1 + (r2 - r1) * r;
        const rg = g1 + (g2 - g1) * r;
        const rb = b1 + (b2 - b1) * r;
        return (Math.round(rr) << 16) | (Math.round(rg) << 8) | Math.round(rb);
    }

    static parseColor(c) {
        if (typeof c === 'number') return c;
        if (typeof c !== 'string') return 0xffffff;
        let raw = c.replace('#', '');
        if (raw.length > 6) raw = raw.substring(0, 6);
        return parseInt(raw, 16);
    }
}
