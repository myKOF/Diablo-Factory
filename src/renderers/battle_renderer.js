import { UI_CONFIG } from "../ui/ui_config.js";

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
            }).setOrigin(0.5, 0.5).setDepth(200);
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
            // 使用渲染座標進行視覺計算 (rx, ry)，確保血條始終貼合視覺模型
            const rx = unit.renderX !== undefined ? unit.renderX : unit.x;
            const ry = unit.renderY !== undefined ? unit.renderY : unit.y;

            // 受擊計時器
            if (unit.hitTimer === undefined) unit.hitTimer = 0;
            if (unit.hitTimer > 0) unit.hitTimer -= dt;

            // 1. 判斷顯示條件：受擊中 OR 滑鼠懸停 OR 目前選中
            const distToPointer = Math.hypot(rx - pointer.worldX, ry - pointer.worldY);
            const isHovered = distToPointer < 40; 
            const isSelected = selectedIds.includes(unit.id);
            const isTargetedByPlayerArmy = window.GAME_STATE && 
                window.GAME_STATE.units.villagers.some(u => u.targetId === unit.id);

            // 如果符合任一條件（受擊、懸停、選中、正在戰鬥、或是我方單位集火目標），渲染血條
            const isInCombat = (unit.state === 'CHASE' || unit.state === 'ATTACK');
            if (unit.hitTimer > 0 || isHovered || isSelected || isInCombat || isTargetedByPlayerArmy) {
                this.drawHPBar(g, unit, rx, ry);

                // 受擊閃爍紅白框 (受傷回饋，僅在受擊當下瞬間)
                if (unit.hitTimer > (this.hpBarTimer - 0.7)) {
                    g.lineStyle(2, 0xffffff, 0.8);
                    g.strokeCircle(rx, ry, 25);
                }
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
        const bgColor = typeof cfg.bgColor === 'string' ? parseInt(cfg.bgColor.replace('#', ''), 16) : (cfg.bgColor || 0x333333);
        g.fillStyle(bgColor, cfg.bgAlpha || 0.8);
        g.fillRect(x, y, barWidth, barHeight);

        // 2. 繪製填充 (優先根據敵我分類，次之根據血量比例)
        const isEnemy = (unit.config && unit.config.camp === 'enemy') || unit.camp === 'enemy';
        let color = 0x4caf50; // Green

        if (isEnemy) {
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
}
