import { UI_CONFIG } from "../ui/ui_config.js";

/**
 * 獨立的角色繪製與動畫渲染引擎 (純 Canvas API 實作)
 * 不依賴任何外部圖片資產，支援標準 Canvas 2D 與 Phaser Graphics
 */
export class CharacterRenderer {
    /**
     * 繪製角色主入口
     * @param {CanvasRenderingContext2D|Phaser.GameObjects.Graphics} ctx 
     * @param {number x
     * @param {number} y
     * @param {object} unitData
     * @param {number} time
     */
    static render(ctx, x, y, unitData, time) {
        const name = (unitData.configName || "").toLowerCase();
        if (name === 'wolf' || name === 'bear') {
            return this.renderAnimal(ctx, x, y, unitData, time);
        }

        const state = unitData.state || 'IDLE';

        const animationSpeed = 0.01;
        const t = time * animationSpeed;

        const isMoving = state.includes('MOVING'); // 精確判斷是否正在移動
        const isIdle = (state === 'IDLE');

        // 步行動畫：雙腿交替
        let legOffset = 0;
        let bodyBob = 0;
        if (isMoving) {
            legOffset = Math.sin(t * 15) * 8;
            bodyBob = Math.abs(Math.cos(t * 15)) * 4;
        } else if (state === 'CONSTRUCTING' || state === 'GATHERING') {
            bodyBob = Math.sin(t * 10) * 2;
        }

        // 0. 繪製選中光圈 (在最下面)
        if (window.GAME_STATE && window.GAME_STATE.selectedUnitId === unitData.id) {
            this.drawSelectionRing(ctx, x, y, time);
        }

        // 1. 繪製陰影
        this.drawShadow(ctx, x, y);

        // 2. 繪製腿部
        this.renderLegs(ctx, x, y, legOffset);

        // 3. 繪製身體
        const bodyY = y - 25 - bodyBob;
        this.renderBody(ctx, x, bodyY, unitData);

        // 4. 繪製頭部
        this.renderHead(ctx, x, bodyY - 15, unitData);

        // 5. 繪製手臂與工具
        this.renderArmsAndTools(ctx, x, bodyY, unitData, t);

        // 6. 繪製名稱與等級 (極致安全性加固：檢查 unitData 及其 config)
        if (unitData && unitData.config && unitData.config.camp === 'enemy') {
            this.renderNPCLabel(ctx, x, y, unitData, time);
        }
    }

    static drawSelectionRing(ctx, x, y, time) {
        const pulse = (Math.sin(time * 0.01) + 1) / 2; // 0 ~ 1
        const radius = 20 + pulse * 5;
        const alpha = 0.5 + pulse * 0.5;

        if (ctx.lineStyle !== undefined) {
            // Phaser Graphics
            ctx.lineStyle(2, 0x00ffff, alpha);
            ctx.strokeCircle(x, y + 15, radius);
            ctx.fillStyle(0x00ffff, alpha * 0.3);
            ctx.fillCircle(x, y + 15, radius - 2);
        } else {
            // Canvas Context
            ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(x, y + 15, radius, radius * 0.4, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = `rgba(0, 255, 255, ${alpha * 0.3})`;
            ctx.fill();
        }
    }

    static drawShadow(ctx, x, y) {
        if (ctx.fillStyle !== undefined && typeof ctx.fillStyle === 'string') {
            ctx.fillStyle = "rgba(0,0,0,0.2)";
            ctx.beginPath();
            if (ctx.ellipse) ctx.ellipse(x, y + 18, 15, 6, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle(0x000000, 0.2);
            ctx.fillEllipse(x, y + 18, 30, 12);
        }
    }

    static renderLegs(ctx, x, y, offset) {
        this.setCtxStyle(ctx, 0x333333, 1);
        ctx.fillRect(x - 8, y + 5 + offset, 6, 12);
        ctx.fillRect(x + 2, y + 5 - offset, 6, 12);
    }

    static renderBody(ctx, x, y, data) {
        const colors = UI_CONFIG.VillagerColors;
        const parseColor = (c) => {
            const val = parseInt(c.replace('#', '0x').substring(0, 8));
            return isNaN(val) ? 0x1e88e5 : val;
        };

        let clothColor = parseColor(colors.DEFAULT);
        const name = (data.configName || "").toLowerCase();

        // 職業優先配色
        if (name === 'swordsman') {
            clothColor = parseColor(colors.SWORDSMAN);
        } else if (name === 'mage') {
            clothColor = parseColor(colors.MAGE);
        } else if (name === 'archer') {
            clothColor = parseColor(colors.ARCHER);
        } else {
            // 普通單位依據工作狀態配色
            const state = data.state;
            if (state === 'IDLE') {
                clothColor = parseColor(colors.IDLE);
            } else if (state === 'CONSTRUCTING' || state === 'MOVING_TO_CONSTRUCTION') {
                clothColor = parseColor(colors.CONSTRUCTING);
            } else {
                if (data.type === 'WOOD') clothColor = parseColor(colors.WOOD);
                else if (data.type === 'STONE') clothColor = parseColor(colors.STONE);
                else if (data.type === 'FOOD') clothColor = parseColor(colors.FOOD);
                else if (data.type === 'GOLD') clothColor = parseColor(colors.GOLD);
            }
        }

        this.setCtxStyle(ctx, clothColor, 1);
        ctx.fillRect(x - 10, y, 20, 30);

        // 移除身體上方的白色高光效果，以顯示配置的原始純色
        // this.setCtxStyle(ctx, 0xffffff, 0.3);
        // ctx.fillRect(x - 10, y, 20, 4);
    }

    static renderHead(ctx, x, y, data) {
        this.setCtxStyle(ctx, 0xffcc8c, 1);
        ctx.fillRect(x - 8, y, 16, 16);

        const name = (data.configName || "").toLowerCase();

        if (name === 'swordsman') {
            // 劍士：銀白頭盔
            this.setCtxStyle(ctx, 0xe1f5fe, 1);
            ctx.fillRect(x - 9, y - 2, 18, 10);
            this.setCtxStyle(ctx, 0x333333, 1);
            ctx.fillRect(x - 5, y + 4, 10, 2); // 面甲缝隙
        } else if (name === 'mage') {
            // 法師：紫色兜帽
            this.setCtxStyle(ctx, 0x7e57c2, 1);
            ctx.fillRect(x - 10, y - 4, 20, 8);
            ctx.fillRect(x - 10, y + 4, 4, 12);
            ctx.fillRect(x + 6, y + 4, 4, 12);
        } else if (name === 'archer') {
            // 弓箭手：綠色頭帶
            this.setCtxStyle(ctx, 0x2e7d32, 1);
            ctx.fillRect(x - 9, y + 2, 18, 4);
        }

        // 眼睛
        this.setCtxStyle(ctx, 0x333333, 1);
        ctx.fillRect(x - 5, y + 6, 2, 2);
        ctx.fillRect(x + 3, y + 6, 2, 2);

        // 髮型（僅針對普通村民）
        if (name !== 'swordsman' && name !== 'mage') {
            this.setCtxStyle(ctx, 0x4e342e, 1);
            if (data.configName === 'female villagers') {
                ctx.fillRect(x - 10, y - 4, 20, 6);
                ctx.fillRect(x - 10, y + 2, 4, 10);
                ctx.fillRect(x + 6, y + 2, 4, 10);
            } else if (name !== 'archer') {
                ctx.fillRect(x - 9, y - 2, 18, 4);
            }
        }
    }

    static renderArmsAndTools(ctx, x, y, data, t) {
        const state = data.state;
        const name = (data.configName || "").toLowerCase();
        this.setCtxStyle(ctx, 0xffcc8c, 1);

        if (state === 'CONSTRUCTING') {
            const angle = Math.sin(t * 20) * 0.8;
            this.drawTool(ctx, x + 5, y + 15, 'HAMMER', angle);
            // 繪製另一隻手臂
            ctx.fillRect(x - 14, y + 5, 4, 18);
        } else if (state === 'GATHERING') {
            const angle = Math.sin(t * 20) * 0.8;
            const toolType = data.type === 'WOOD' ? 'AXE' : (data.type === 'STONE' || data.type === 'GOLD' ? 'PICKAXE' : 'BASKET');
            this.drawTool(ctx, x + 5, y + 15, toolType, angle);
            // 繪製另一隻手臂
            ctx.fillRect(x - 14, y + 5, 4, 18);
        } else if (name === 'swordsman') {
            const isMoving = state.includes('MOVING');
            const angle = isMoving ? Math.sin(t * 10) * 0.3 : 0.2;
            this.drawTool(ctx, x + 8, y + 15, 'SWORD', angle);
            // 修復：職業單位在 IDLE 時也應該繪製另一隻手臂，以免看起來不協調
            ctx.fillRect(x - 14, y + 5, 4, 18);
        } else if (name === 'mage') {
            const isMoving = state.includes('MOVING');
            // 修復：法師在 IDLE 時法杖應該維持靜止 (垂直)，移動時才晃動
            const angle = isMoving ? Math.sin(t * 5) * 0.1 : 0;
            this.drawTool(ctx, x + 8, y + 15, 'STAFF', angle);
            ctx.fillRect(x - 14, y + 5, 4, 18);
        } else if (name === 'archer') {
            this.drawTool(ctx, x + 8, y + 15, 'BOW', 0);
            ctx.fillRect(x - 14, y + 5, 4, 18);
        } else if (data.cargo > 0) {
            this.setCtxStyle(ctx, 0x795548, 1);
            ctx.fillRect(x - 8, y + 10, 16, 12);
        } else {
            // IDLE 狀態雙臂垂下
            ctx.fillRect(x - 14, y + 5, 4, 18);
            ctx.fillRect(x + 10, y + 5, 4, 18);
        }
    }

    static renderAnimal(ctx, x, y, unitData, time) {
        const name = (unitData.configName || "").toLowerCase();
        const t = time * 0.01;
        const state = unitData.state || 'IDLE';
        const isMoving = state.includes('MOVING');

        // 1. 繪製選中光圈
        if (window.GAME_STATE && window.GAME_STATE.selectedUnitId === unitData.id) {
            this.drawSelectionRing(ctx, x, y, time);
        }

        // 2. 繪製陰影
        this.drawShadow(ctx, x, y);

        if (name === 'wolf') {
            this.renderWolf(ctx, x, y, t, isMoving);
        } else if (name === 'bear') {
            this.renderBear(ctx, x, y, t, isMoving);
        }

        // 3. 繪製名稱與等級 (動物敵人，極致安全性加固：檢查 unitData 及其 config)
        if (unitData && unitData.config && unitData.config.camp === 'enemy') {
            this.renderNPCLabel(ctx, x, y, unitData, time);
        }
    }

    static renderNPCLabel(ctx, x, y, unitData, time) {
        if (!unitData || !unitData.config || !UI_CONFIG.NPCLabel) return;
        
        const config = UI_CONFIG.NPCLabel;
        const npcConfig = unitData.config;
        const name = npcConfig.name || "敵人";
        const lv = npcConfig.lv || 1;
        const label = `${name} (Lv. ${lv})`;

        // 呼吸動畫跟隨
        const isMoving = (unitData.state || 'IDLE').includes('MOVING');
        const t = time * 0.01;
        const breathing = isMoving ? 0 : Math.sin(t * 3) * 3; 

        if (ctx.fillText === undefined) {
             // Phaser Graphics 不支援直接畫 Text，Phaser 控制器會負責建立獨立的 Text 物件
             // 不過在純 Canvas 模式下我們希望直接繪製
             return;
        }

        ctx.font = config.fontSize;
        ctx.textAlign = 'center';

        // 繪製陰影
        ctx.fillStyle = config.shadowColor;
        ctx.fillText(label, x + 1, y + config.offsetY + breathing + 1);

        // 繪製主文字 (鮮紅色)
        ctx.fillStyle = config.enemyColor;
        ctx.fillText(label, x, y + config.offsetY + breathing);
    }

    static renderWolf(ctx, x, y, t, isMoving) {
        const color = 0x78909c; // 狼灰
        const eyeColor = 0xffff00; // 黃眼
        const legOffset = isMoving ? Math.sin(t * 15) * 6 : 0;

        this.setCtxStyle(ctx, color, 1);
        // 腳 (四肢)
        ctx.fillRect(x - 10, y + 5 + legOffset, 4, 8); // 左前
        ctx.fillRect(x + 6, y + 5 - legOffset, 4, 8);  // 右前
        ctx.fillRect(x - 8, y + 2 - legOffset, 4, 8);  // 左後
        ctx.fillRect(x + 4, y + 2 + legOffset, 4, 8);  // 右後

        // 身體
        ctx.fillRect(x - 12, y - 5, 24, 12);
        
        // 呼吸效果 (待機時縮放身體)
        const breathing = isMoving ? 0 : Math.sin(t * 5) * 1.2;
        
        // 頭部
        const headBob = isMoving ? Math.sin(t * 15) * 2 : Math.sin(t * 3) * 1;
        const headX = x + 8;
        const headY = y - 12 + headBob + breathing;
        
        ctx.fillRect(headX, headY, 12, 10); // 狼頭向右
        
        // 耳朵
        ctx.fillRect(headX + 2, headY - 4, 3, 5);
        ctx.fillRect(headX + 7, headY - 4, 3, 5);

        // 眼睛 (偶爾眨眼)
        const isBlinking = !isMoving && (Math.sin(t * 2) > 0.95);
        if (!isBlinking) {
            this.setCtxStyle(ctx, eyeColor, 1);
            ctx.fillRect(headX + 8, headY + 4, 2, 2);
        }
    }

    static renderBear(ctx, x, y, t, isMoving) {
        const color = 0x5d4037; // 棕熊
        const eyeColor = 0x000000;
        const legOffset = isMoving ? Math.sin(t * 10) * 4 : 0;

        this.setCtxStyle(ctx, color, 1);
        // 腳 (粗壯)
        ctx.fillRect(x - 12, y + 8 + legOffset, 6, 10);
        ctx.fillRect(x + 6, y + 8 - legOffset, 6, 10);
        ctx.fillRect(x - 8, y + 5 - legOffset, 6, 10);
        ctx.fillRect(x + 2, y + 5 + legOffset, 6, 10);

        // 呼吸效果 (熊比較壯碩，呼吸更慢)
        const breathing = isMoving ? 0 : Math.sin(t * 3) * 1.5;

        // 身體 (壯碩)
        ctx.fillRect(x - 15, y - 10 - (breathing/2), 30, 20 + breathing);

        // 頭 (圓大)
        const headBob = isMoving ? Math.sin(t * 10) * 1 : Math.cos(t * 2) * 1.5;
        const headX = x + 10;
        const headY = y - 15 + headBob;
        ctx.fillRect(headX, headY, 15, 15);

        // 耳朵 (小而圓)
        ctx.fillRect(headX + 2, headY - 3, 4, 4);
        ctx.fillRect(headX + 9, headY - 3, 4, 4);

        // 眼睛
        this.setCtxStyle(ctx, eyeColor, 1);
        ctx.fillRect(headX + 8, headY + 5, 2, 2);
    }

    static drawTool(ctx, x, y, type, angle) {
        if (type === 'AXE') {
            this.drawRectRotated(ctx, x, y, 0, -15, 3, 20, angle, 0x5d4037);
            this.drawRectRotated(ctx, x, y, 0, -20, 10, 8, angle, 0x9e9e9e);
        } else if (type === 'PICKAXE') {
            this.drawRectRotated(ctx, x, y, 0, -15, 3, 20, angle, 0x5d4037);
            this.drawRectRotated(ctx, x, y, -10, -18, 20, 4, angle, 0x757575);
        } else if (type === 'HAMMER') {
            this.drawRectRotated(ctx, x, y, 0, -15, 4, 25, angle, 0x5d4037);
            this.drawRectRotated(ctx, x, y, -8, -25, 20, 12, angle, 0x424242);
        } else if (type === 'BASKET') {
            this.drawRectRotated(ctx, x, y, -8, 0, 16, 12, angle, 0x8d6e63);
        } else if (type === 'SWORD') {
            this.drawRectRotated(ctx, x, y, 0, -5, 3, 10, angle, 0x795548); // 柄
            this.drawRectRotated(ctx, x, y, -3, -25, 9, 20, angle, 0x90a4ae); // 刃
            this.drawRectRotated(ctx, x, y, -5, -5, 13, 3, angle, 0xffd54f); // 護手
        } else if (type === 'STAFF') {
            this.drawRectRotated(ctx, x, y, 0, -25, 4, 35, angle, 0x5d4037); // 杖身
            this.drawRectRotated(ctx, x, y, -2, -30, 8, 8, angle, 0x4fc3f7); // 寶石
        } else if (type === 'BOW') {
            this.drawRectRotated(ctx, x, y, 0, -20, 3, 30, angle, 0x5d4037); // 弓身
            this.setCtxStyle(ctx, 0xe0e0e0, 0.5);
            // 弦 (簡單直線)
            if (ctx.beginPath) {
                ctx.beginPath();
                ctx.moveTo(x, y - 18);
                ctx.lineTo(x, y + 8);
                ctx.stroke();
            }
        }
    }

    static drawRectRotated(ctx, x, y, rx, ry, rw, rh, angle, color) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const pts = [
            { dx: rx, dy: ry },
            { dx: rx + rw, dy: ry },
            { dx: rx + rw, dy: ry + rh },
            { dx: rx, dy: ry + rh }
        ];

        const rotatedPts = pts.map(p => ({
            px: x + (p.dx * cos - p.dy * sin),
            py: y + (p.dx * sin + p.dy * cos)
        }));

        this.setCtxStyle(ctx, color, 1);
        if (ctx.beginPath) ctx.beginPath();
        if (ctx.moveTo) ctx.moveTo(rotatedPts[0].px, rotatedPts[0].py);
        if (ctx.lineTo) {
            for (let i = 1; i < 4; i++) ctx.lineTo(rotatedPts[i].px, rotatedPts[i].py);
        }
        if (ctx.closePath) ctx.closePath();

        if (ctx.fillPath) ctx.fillPath();
        else if (ctx.fill) ctx.fill();
    }

    static setCtxStyle(ctx, color, alpha) {
        if (ctx.fillStyle !== undefined && typeof ctx.fillStyle === 'string') {
            const r = (color >> 16) & 255;
            const g = (color >> 8) & 255;
            const b = color & 255;
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        } else if (ctx.fillStyle) {
            ctx.fillStyle(color, alpha);
        }
    }
}
