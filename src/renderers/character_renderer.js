import { UI_CONFIG } from "../ui/ui_config.js";

/**
 * 獨立的角色繪製與動畫渲染引擎 (純 Canvas API 實作)
 * 不依賴任何外部圖片資產，支援標準 Canvas 2D 與 Phaser Graphics
 */
export class CharacterRenderer {
    /**
     * 繪製角色主入口
     * @param {CanvasRenderingContext2D|Phaser.GameObjects.Graphics} ctx 
     * @param {number} x
     * @param {number} y
     * @param {object} unitData
     * @param {number} time
     */
    static render(ctx, x, y, unitData, time) {
        const model = unitData.config ? unitData.config.model : "";
        if (model === 'wolf' || model === 'bear') {
            return this.renderAnimal(ctx, x, y, unitData, time);
        }

        const state = unitData.state || 'IDLE';
        const isCombatMove = state === 'MOVE';
        const isMoving = state.includes('MOVING') || isCombatMove; // 精確判斷是否正在移動
        const isWandering = !!unitData.idleTarget && !isCombatMove; // 判斷是否正在閒晃 (排除戰鬥衝刺)

        // 計算動畫頻率與振幅
        const animationSpeed = 0.01;
        const t = time * animationSpeed;

        const anim = UI_CONFIG.Animation || { runningFreq: 15, wanderingFreq: 5, breathingFreq: 1.33, workFreq: 10, armSwingFreqRunning: 10, armSwingFreqWandering: 4 };

        // 步行動畫：雙腿交替
        let legOffset = 0;
        let bodyBob = 0;

        if (state === 'CONSTRUCTING' || state === 'GATHERING' || state === 'ATTACK') {
            // 工作或攻擊狀態：原地站立，身體微晃，但不准有腳步動畫
            bodyBob = Math.sin(t * anim.workFreq) * 2;
            legOffset = 0;
        } else if (isMoving || isWandering) {
            // 精確判斷：如果狀態是前往某地任務，即為跑步，無視殘留的 idleTarget (Point 2)
            const isMissionMove = state.includes('MOVING_TO') || isCombatMove;
            const isRunning = isMissionMove || (isMoving && !isWandering);
            const moveFreq = isRunning ? anim.runningFreq : anim.wanderingFreq;
            legOffset = Math.sin(t * moveFreq) * 8;
            bodyBob = Math.abs(Math.cos(t * moveFreq)) * 4;
        } else {
            // 預設為呼吸效果
            bodyBob = Math.sin(t * anim.breathingFreq) * 1.5;
        }

        // 0. 繪製選中光圈 (在最下面) - 不參與縮放鏡像
        if (window.GAME_STATE && window.GAME_STATE.selectedUnitId === unitData.id) {
            this.drawSelectionRing(ctx, x, y, time);
        }

        // 0.1 繪製視界圈 (紅色線條) - 座標系修正：CSV 數值為網格數，需乘以 20 像素
        if (window.GAME_STATE && window.GAME_STATE.settings.showVisionRange) {
            const visionRadius = (unitData.field_vision || 150) * 20; 
            this.drawVisionRange(ctx, x, y, visionRadius);
        }

        const facing = unitData.facing || 1;
        const needsFlip = facing === -1;

        if (needsFlip) {
            if (ctx.save) {
                ctx.save();
                if (ctx.translateCanvas) {
                    ctx.translateCanvas(x, 0);
                    ctx.scaleCanvas(-1, 1);
                    ctx.translateCanvas(-x, 0);
                } else if (ctx.translate) {
                    ctx.translate(x, 0);
                    ctx.scale(-1, 1);
                    ctx.translate(-x, 0);
                }
            }
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

        if (needsFlip && ctx.restore) {
            ctx.restore();
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

    static drawVisionRange(ctx, x, y, radius) {
        const cfg = UI_CONFIG.VisionRange || { lineColor: "#ff0000", lineAlpha: 0.8, lineWidth: 1.5 };
        const colorHex = parseInt(cfg.lineColor.replace('#', '0x'));
        const alpha = cfg.lineAlpha;

        if (ctx.lineStyle !== undefined) {
            // Phaser Graphics
            ctx.lineStyle(cfg.lineWidth, colorHex, alpha);
            ctx.strokeCircle(x, y, radius);
        } else {
            // Canvas Context
            const r = (colorHex >> 16) & 255;
            const g = (colorHex >> 8) & 255;
            const b = colorHex & 255;
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.lineWidth = cfg.lineWidth;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.stroke();
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
        const state = data.state || 'IDLE';
        const name = (data.configName || "").toLowerCase();
        this.setCtxStyle(ctx, 0xffcc8c, 1);

        const isMoving = state.includes('MOVING');
        const isWandering = !!data.idleTarget;
        
        // 分類判定：如果是工作或攻擊狀態，不計入移動動畫
        const isWorking = (state === 'CONSTRUCTING' || state === 'GATHERING' || state === 'ATTACK');
        const isActuallyMoving = !isWorking && (isMoving || isWandering);
        const isRunning = isActuallyMoving && isMoving && !isWandering;

        // 動畫頻率: 閒逛/奔跑/呼吸 (讀取 UI_CONFIG)
        const anim = UI_CONFIG.Animation || { armSwingFreqRunning: 10, armSwingFreqWandering: 4, breathingFreq: 1.33, workFreq: 10, runningFreq: 15, wanderingFreq: 5 };
        const armFreq = isRunning ? anim.armSwingFreqRunning : (isActuallyMoving ? anim.armSwingFreqWandering : anim.breathingFreq);
        const breatheFreq = anim.breathingFreq;

        if (state === 'CONSTRUCTING') {
            const angle = Math.sin(t * (anim.workFreq * 2)) * 0.8;
            this.drawTool(ctx, x + 5, y + 15, 'HAMMER', angle);
            // 繪製另一隻手臂
            ctx.fillRect(x - 14, y + 5 + Math.sin(t * anim.workFreq) * 2, 4, 18);
        } else if (state === 'GATHERING') {
            const angle = Math.sin(t * (anim.workFreq * 2)) * 0.8;
            const toolType = data.type === 'WOOD' ? 'AXE' : (data.type === 'STONE' || data.type === 'GOLD' ? 'PICKAXE' : 'BASKET');
            this.drawTool(ctx, x + 5, y + 15, toolType, angle);
            // 繪製另一隻手臂
            ctx.fillRect(x - 14, y + 5 + Math.sin(t * anim.workFreq) * 2, 4, 18);
        } else if (name === 'swordsman') {
            const isAttacking = (state === 'ATTACK');
            const angle = isAttacking ? Math.sin(t * anim.workFreq * 2) * 1.2 : (isActuallyMoving ? Math.sin(t * armFreq) * 0.3 : 0.2 + Math.sin(t * breatheFreq) * 0.05);
            this.drawTool(ctx, x + 8, y + 15, 'SWORD', angle);
            ctx.fillRect(x - 14, y + 5 + (isActuallyMoving || isAttacking ? 0 : Math.sin(t * breatheFreq) * 2), 4, 18);
        } else if (name === 'mage') {
            const isAttacking = (state === 'ATTACK');
            const angle = isAttacking ? Math.sin(t * anim.workFreq) * 0.5 : (isActuallyMoving ? Math.sin(t * armFreq) * 0.1 : Math.sin(t * breatheFreq) * 0.05);
            this.drawTool(ctx, x + 8, y + 15, 'STAFF', angle);
            ctx.fillRect(x - 14, y + 5 + (isActuallyMoving || isAttacking ? 0 : Math.sin(t * breatheFreq) * 2), 4, 18);
        } else if (name === 'archer') {
            const isAttacking = (state === 'ATTACK');
            const angle = isAttacking ? Math.sin(t * anim.workFreq) * 0.4 : (isActuallyMoving ? Math.sin(t * armFreq) * 0.1 : Math.sin(t * breatheFreq) * 0.03);
            this.drawTool(ctx, x + 8, y + 15, 'BOW', angle);
            ctx.fillRect(x - 14, y + 5 + (isActuallyMoving || isAttacking ? 0 : Math.sin(t * breatheFreq) * 1), 4, 18);
        } else if (data.cargo > 0) {
            this.setCtxStyle(ctx, 0x795548, 1);
            // 負重搬運時的籃子晃動
            const cargoFreq = isRunning ? anim.runningFreq : (isActuallyMoving ? anim.wanderingFreq : anim.breathingFreq);
            ctx.fillRect(x - 8, y + 10 + Math.sin(t * cargoFreq) * 2, 16, 12);
        } else if (state === 'ATTACK') {
            // 通用攻擊動作（針對村民或其他無特定武器單位）
            const swing = Math.sin(t * anim.workFreq * 1.5) * 10;
            const armAngle = Math.sin(t * anim.workFreq * 2) * 0.5;
            ctx.fillRect(x + 10 + swing, y + 5 + armAngle, 4, 18); // 右手前衝
            ctx.fillRect(x - 14, y + 5 - armAngle, 4, 18);
        } else {
            // IDLE 或 步行狀態的雙臂晃動
            const swingFreq = isActuallyMoving ? armFreq : breatheFreq;
            const idleSwing = Math.sin(t * swingFreq) * 2;
            ctx.fillRect(x - 14, y + 5 + idleSwing, 4, 18);
            ctx.fillRect(x + 10, y + 5 - idleSwing, 4, 18);
        }
    }

    static renderAnimal(ctx, x, y, unitData, time) {
        if (!unitData || !unitData.config) return;
        const model = unitData.config.model;
        const state = (unitData.state || 'IDLE');
        const isMoving = state.includes('MOVING');
        const isWandering = !!unitData.idleTarget;
        const anim = UI_CONFIG.Animation || { runningFreq: 15, wanderingFreq: 5, breathingFreq: 1.33 };
        const t = time * 0.01;

        // 1. 繪製選中光圈 - 不參與縮放鏡像
        if (window.GAME_STATE && window.GAME_STATE.selectedUnitId === unitData.id) {
            this.drawSelectionRing(ctx, x, y, time);
        }

        // 1.1 繪製視界圈 (紅色線條) - 座標系修正
        if (window.GAME_STATE && window.GAME_STATE.settings.showVisionRange) {
            const visionRadius = (unitData.field_vision || 150) * 20;
            this.drawVisionRange(ctx, x, y, visionRadius);
        }

        const facing = (unitData && unitData.facing) || 1;
        const needsFlip = facing === -1;

        if (needsFlip) {
            if (ctx.save) {
                ctx.save();
                if (ctx.translateCanvas) {
                    ctx.translateCanvas(x, 0);
                    ctx.scaleCanvas(-1, 1);
                    ctx.translateCanvas(-x, 0);
                } else if (ctx.translate) {
                    ctx.translate(x, 0);
                    ctx.scale(-1, 1);
                    ctx.translate(-x, 0);
                }
            }
        }

        // 2. 繪製陰影
        this.drawShadow(ctx, x, y);

        // 使用動畫設定 (Point 1)
        const isRunning = isMoving && !isWandering;
        const moveFreq = isRunning ? anim.runningFreq : anim.wanderingFreq;
        const headBobFreq = isRunning ? anim.runningFreq : anim.wanderingFreq;
        const breatheFreq = anim.breathingFreq;

        if (model === 'wolf') {
            this.renderWolf(ctx, x, y, t, unitData, isMoving, moveFreq, headBobFreq, breatheFreq);
        } else if (model === 'bear') {
            this.renderBear(ctx, x, y, t, unitData, isMoving, moveFreq, headBobFreq, breatheFreq);
        }

        if (needsFlip && ctx.restore) {
            ctx.restore();
        }
    }

    static renderWolf(ctx, x, y, t, unitData, isMoving, moveFreq, headBobFreq, breatheFreq) {
        const color = 0x78909c; // 狼灰
        const eyeColor = 0xffff00; // 黃眼
        const isAttacking = unitData.state === 'ATTACK';
        const legOffset = isMoving ? Math.sin(t * moveFreq) * 6 : 0;

        this.setCtxStyle(ctx, color, 1);
        // 腳 (四肢)
        ctx.fillRect(x - 10, y + 5 + legOffset, 4, 8); // 左前
        ctx.fillRect(x + 6, y + 5 - legOffset, 4, 8);  // 右前
        ctx.fillRect(x - 8, y + 2 - legOffset, 4, 8);  // 左後
        ctx.fillRect(x + 4, y + 2 + legOffset, 4, 8);  // 右後

        // 身體
        ctx.fillRect(x - 12, y - 5, 24, 12);

        // 呼吸效果 (待機時縮放身體)
        const breathing = (isMoving || isAttacking) ? 0 : Math.sin(t * breatheFreq * 1.2) * 1.2;

        // 身體前傾效果 (攻擊時向右衝)
        const attackDash = isAttacking ? Math.abs(Math.sin(t * 15)) * 8 : 0;

        // 頭部
        const headBob = isAttacking ? Math.sin(t * 15) * 4 : (isMoving ? Math.sin(t * headBobFreq) * 2 : Math.sin(t * breatheFreq * 0.8) * 1);
        const headX = x + 8 + attackDash;
        const headY = y - 12 + headBob + breathing;

        ctx.fillRect(headX, headY, 12, 10); // 狼頭向右
        
        // 嘴巴 (攻擊時張開)
        if (isAttacking && Math.sin(t * 15) > 0) {
            ctx.fillRect(headX + 8, headY + 6, 6, 4); 
        }

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

    static renderBear(ctx, x, y, t, unitData, isMoving, moveFreq, headBobFreq, breatheFreq) {
        const color = 0x5d4037; // 棕熊
        const eyeColor = 0x000000;
        const isAttacking = unitData.state === 'ATTACK';
        const legOffset = isMoving ? Math.sin(t * moveFreq) * 4 : 0;

        this.setCtxStyle(ctx, color, 1);
        // 腳 (粗壯)
        ctx.fillRect(x - 12, y + 5 + legOffset, 8, 12); // 左前
        ctx.fillRect(x + 4, y + 5 - legOffset, 8, 12);  // 右前
        ctx.fillRect(x - 8, y + 2 - legOffset, 8, 12);  // 左後
        ctx.fillRect(x + 0, y + 2 + legOffset, 8, 12);  // 右後

        // 呼吸效果 (熊比較壯碩，呼吸更慢)
        const breathing = (isMoving || isAttacking) ? 0 : Math.sin(t * breatheFreq * 0.8) * 1.5;

        // 身體前傾效果
        const attackDash = isAttacking ? Math.abs(Math.sin(t * 12)) * 6 : 0;

        // 身體 (壯碩)
        ctx.fillRect(x - 15 + attackDash, y - 10 - (breathing / 2), 30, 20 + breathing);

        // 頭 (圓大)
        const headBob = isAttacking ? Math.sin(t * 12) * 3 : (isMoving ? Math.sin(t * headBobFreq) * 1 : Math.cos(t * breatheFreq * 0.6) * 1.5);
        const headX = x + 10 + attackDash;
        const headY = y - 15 + headBob;
        ctx.fillRect(headX, headY, 15, 15);
        
        // 熊掌擊打動作 (攻擊時)
        if (isAttacking) {
            this.setCtxStyle(ctx, color, 1);
            ctx.fillRect(headX + 10, headY + 10 + Math.sin(t * 12) * 5, 8, 8);
        }

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
