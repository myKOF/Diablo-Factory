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
     * 遵循「受擊才顯示」及「滑鼠移入才顯示」策略，保持 Canvas 效能
     * @param {CanvasRenderingContext2D} g (Phaser 這裡傳入的是 Graphics 物件)
     * @param {Array} units 所有戰鬥單位
     * @param {number} dt Delta time
     */
    static renderHPBars(g, units, dt) {
        if (!g || !units) return;
        const scene = this.scene;
        const pointer = scene.input.activePointer;

        units.forEach(unit => {
            // 受擊計時器
            if (unit.hitTimer === undefined) unit.hitTimer = 0;
            if (unit.hitTimer > 0) unit.hitTimer -= dt;

            // 判斷是否懸停
            const distToPointer = Math.hypot(unit.x - pointer.worldX, unit.y - pointer.worldY);
            const isHovered = distToPointer < 40; // 40px 容錯範圍

            // 僅在受擊或懸停時渲染血條
            if (unit.hitTimer > 0 || isHovered) {
                this.drawHPBar(g, unit);

                // 受擊閃爍紅白框 (受傷回饋)
                if (unit.hitTimer > 0.8) {
                    g.lineStyle(2, 0xffffff, 0.8);
                    g.strokeCircle(unit.x, unit.y, 25);
                }
            }
        });
    }

    /**
     * 繪製單個血條
     */
    static drawHPBar(g, unit) {
        const barWidth = 40;
        const barHeight = 6;
        const x = unit.x - barWidth / 2;
        const y = unit.y - 45; // 位於單位頭部上方

        const hpPercent = Math.max(0, unit.hp / (unit.maxHp || 100));

        // 1. 背景條 (深灰/黑)
        g.fillStyle(0x333333, 0.8);
        g.fillRect(x, y, barWidth, barHeight);

        // 2. 生命值顏色 (根據血量比例切換：綠 -> 橘 -> 紅)
        let color = 0x4caf50; // Green
        if (hpPercent < 0.3) color = 0xf44336; // Red
        else if (hpPercent < 0.6) color = 0xff9800; // Orange

        // 3. 繪製當前生命 (附帶發光效果)
        g.fillStyle(color, 1);
        g.fillRect(x, y, barWidth * hpPercent, barHeight);

        // 4. 外框 (白/亮灰)
        g.lineStyle(1, 0xffffff, 0.3);
        g.strokeRect(x, y, barWidth, barHeight);
    }
}
