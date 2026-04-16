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
        if (!unitData) return;

        // [核心功能] 屍體渲染優先
        if (unitData.isCorpse) {
            this.renderCorpse(ctx, x, y, unitData);
            return;
        }

        const model = unitData.config ? unitData.config.model : "";
        if (model === 'wolf' || model === 'bear') {
            return this.renderAnimal(ctx, x, y, unitData, time);
        }
        if (model === 'sheep') {
            return this.renderSheep(ctx, x, y, unitData, time);
        }
        if (model === 'catapult') {
            // [新增] 投石車單位渲染
            const isSelected = window.GAME_STATE?.selectedUnitIds?.includes(unitData.id) || false;
            const isHovered = window.GAME_STATE?.hoveredId === unitData.id;
            const isTargeted = window.GAME_STATE?.units?.villagers?.some(u => u.targetId === unitData.id);
            if (isSelected || isHovered || isTargeted) {
                const color = (unitData.camp === 'enemy' || isTargeted) ? 0xf44336 : 0x4caf50;
                this.drawSelectionRing(ctx, x, y, time, color, 30); // 更大的選取圈
            }
            return this.renderCatapult(ctx, x, y, unitData, time);
        }

        const state = unitData.state || 'IDLE';
        const isEnemy = (unitData.config && unitData.config.camp === 'enemy') || unitData.camp === 'enemy';
        const isSelected = window.GAME_STATE?.selectedUnitIds?.includes(unitData.id) || false;
        const isHovered = window.GAME_STATE?.hoveredId === unitData.id;

        const isTargetedByPlayerArmy = window.GAME_STATE?.units?.villagers?.some(u => u.targetId === unitData.id) || false;
        const isRally = !!unitData.isRallyTarget;

        if (isSelected || isHovered || isTargetedByPlayerArmy || isRally) {
            const circleColor = (isEnemy && isTargetedByPlayerArmy) ? 0xf44336 : 0x4caf50;
            this.drawSelectionRing(ctx, x, y, time, circleColor);
        }

        const isCombatMove = state === 'MOVE' || state === 'CHASE';
        // [核心修正] 僅針對「跟隨/追擊」且「無目標座標」的情況停止動畫，避免影響一般任務工人
        const isChaseReached = isCombatMove && !unitData.idleTarget && !unitData.pathTarget && !unitData.fullPath;
        const isMoving = (state.includes('MOVING') || isCombatMove) && !isChaseReached; 
        const isWandering = !!unitData.idleTarget && !isCombatMove; // 判斷是否正在閒晃 (排除戰鬥衝刺)

        // 計算動畫頻率與振幅
        const animationSpeed = 0.01;
        const t = time * animationSpeed;

        const anim = UI_CONFIG.Animation || { runningFreq: 15, wanderingFreq: 5, breathingFreq: 1.33, workFreq: 10, armSwingFreqRunning: 10, armSwingFreqWandering: 4 };

        // 核心修正：判斷是否卡死。若連續多幀無法移動，動畫應切回呼吸而非播放跑步/行走
        const isStuck = unitData._stuckFrames > 5;

        // 步行動畫：雙腿交替
        let legOffset = 0;
        let bodyBob = 0;

        const multiplier = CharacterRenderer.getFreqMultiplier(unitData);
        const combatFreq = anim.workFreq * multiplier;

        if (state === 'CONSTRUCTING' || state === 'GATHERING' || state === 'ATTACK') {
            // 工作或攻擊狀態：原地站立，身體微晃，但不准有腳步動畫
            bodyBob = Math.sin(t * combatFreq) * 2;
            legOffset = 0;
        } else if ((isMoving || isWandering) && !isStuck) {
            // 精確判斷：如果狀態是前往某地任務，即為跑步，無視殘留的 idleTarget (Point 2)
            const isMissionMove = state.includes('MOVING_TO') || isCombatMove;
            const isRunning = isMissionMove || (isMoving && !isWandering);
            const moveFreq = isRunning ? anim.runningFreq : anim.wanderingFreq;
            legOffset = Math.sin(t * moveFreq) * 8;
            bodyBob = Math.abs(Math.cos(t * moveFreq)) * 4;
        } else {
            // 預設為呼吸效果 (包含卡死狀態)
            bodyBob = Math.sin(t * anim.breathingFreq) * 1.5;
        }

        // 0.1 繪製視界圈 (三段切換邏輯)
        const visionMode = (window.GAME_STATE && window.GAME_STATE.settings.showVisionRange) || 0;
        if (visionMode > 0) {
            const isSelected = window.GAME_STATE && window.GAME_STATE.selectedUnitIds && window.GAME_STATE.selectedUnitIds.includes(unitData.id);
            // 模式 1: 僅顯示選中目標 | 模式 2: 顯示所有單位
            if (visionMode === 2 || (visionMode === 1 && isSelected)) {
                const visionRadius = (unitData.field_vision || 150) * 20;
                this.drawVisionRange(ctx, x, y, visionRadius);
            }
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

    static renderCorpse(ctx, x, y, unitData) {
        try {
            const model = (unitData.sourceModel || 'villager').toLowerCase();
            const corpseCfg = UI_CONFIG.CorpseRenderer || {};

            // [極度防禦] 確保 cfg 絕對不為 null/undefined，並帶有合理的預設值
            let cfg = corpseCfg[model] || corpseCfg.default;
            if (!cfg) {
                cfg = { bodyColor: 0x9e9e9e, bodyWidth: 28, bodyHeight: 16, offsetY: 8, rotation: 0.25 };
            }

            // 1. 繪製底部陰影
            this.drawShadow(ctx, x, y);

            // 2. 繪製地面積血 (修正：Phaser 使用 fillCircle)
            this.setCtxStyle(ctx, 0xb71c1c, 0.4);
            if (ctx.fillCircle) {
                ctx.fillCircle(x - 10, y + 6, 5);
                ctx.fillCircle(x + 6, y + 2, 3);
            } else if (ctx.beginPath) {
                ctx.beginPath();
                ctx.arc(x - 10, y + 6, 5, 0, Math.PI * 2);
                ctx.arc(x + 6, y + 2, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            // 3. 繪製屍體主體
            let bodyColor = cfg.bodyColor;
            let bodyWidth = cfg.bodyWidth;
            let bodyHeight = cfg.bodyHeight;

            // Phaser Graphics 不支援 ctx.save/translate 作為座標變換，需手動計算或使用其內部機制
            // 這裡我們偵測是否有 save 方法且非 Phaser Graphics (Phaser Graphics 的 save 是存樣式)
            const isPhaser = !!ctx.batchFillRect || !!ctx.fillEllipse;

            if (!isPhaser && ctx.save) {
                ctx.save();
                ctx.translate(x, y + cfg.offsetY);
                ctx.rotate(cfg.rotation);
                this.setCtxStyle(ctx, bodyColor, 1.0);
                if (ctx.beginPath) {
                    ctx.beginPath();
                    if (ctx.ellipse) ctx.ellipse(0, 0, bodyWidth / 2, bodyHeight / 2, 0, 0, Math.PI * 2);
                    else ctx.rect(-bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight);
                    ctx.fill();
                }
                ctx.restore();
            } else {
                // Phaser Graphics 渲染路徑
                this.setCtxStyle(ctx, bodyColor, 1.0);
                const py = y + cfg.offsetY;
                if (ctx.fillEllipse) {
                    ctx.fillEllipse(x, py, bodyWidth, bodyHeight);
                    // 輪廓線
                    this.setCtxStyle(ctx, 0x000000, 0.3);
                    ctx.strokeEllipse(x, py, bodyWidth, bodyHeight);
                } else {
                    ctx.fillRect(x - bodyWidth / 2, py - bodyHeight / 2, bodyWidth, bodyHeight);
                }

                // 加上一點血跡裝飾
                this.setCtxStyle(ctx, 0xd32f2f, 0.6);
                if (ctx.fillCircle) ctx.fillCircle(x - 5, py - 2, 4);
            }
        } catch (e) {
            if (window.GameEngine) window.GameEngine.addLog(`[渲染錯誤] 屍體繪製異常: ${e.message}`, 'SYSTEM');
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
            if (!c) return 0x1e88e5;
            // 重要：配置檔使用 #RRGGBBAA，若是 8 位則截斷 AA 部分，避免 32bit 位移出錯
            const cleaned = c.replace('#', '0x');
            const val = parseInt(cleaned.length > 8 ? cleaned.substring(0, 8) : cleaned);
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
            const resType = (data.type || "").toUpperCase();
            if (state === 'IDLE') {
                clothColor = parseColor(colors.IDLE);
            } else if (state === 'CONSTRUCTING' || state === 'MOVING_TO_CONSTRUCTION') {
                clothColor = parseColor(colors.CONSTRUCTING);
            } else if (state === 'ATTACK' || state === 'CHASE' || state === 'MOVE') {
                clothColor = parseColor(colors.DEFAULT);
            } else {
                if (resType === 'WOOD') clothColor = parseColor(colors.WOOD);
                else if (resType === 'STONE') clothColor = parseColor(colors.STONE);
                else if (resType === 'FOOD') clothColor = parseColor(colors.FOOD);
                else if (resType === 'GOLD') clothColor = parseColor(colors.GOLD);
                else clothColor = parseColor(colors.DEFAULT);
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
        const multiplier = CharacterRenderer.getFreqMultiplier(data);
        const combatFreq = anim.workFreq * multiplier;

        const armFreq = isRunning ? anim.armSwingFreqRunning : (isActuallyMoving ? anim.armSwingFreqWandering : anim.breathingFreq);
        const breatheFreq = anim.breathingFreq;

        if (state === 'CONSTRUCTING') {
            const angle = Math.sin(t * (combatFreq * 2)) * 0.8;
            this.drawTool(ctx, x + 5, y + 15, 'HAMMER', angle);
            // 繪製另一隻手臂
            ctx.fillRect(x - 14, y + 5 + Math.sin(t * combatFreq) * 2, 4, 18);
        } else if (state === 'GATHERING') {
            const angle = Math.sin(t * (combatFreq * 2)) * 0.8;
            const toolType = data.type === 'WOOD' ? 'AXE' : (data.type === 'STONE' || data.type === 'GOLD' ? 'PICKAXE' : 'BASKET');
            this.drawTool(ctx, x + 5, y + 15, toolType, angle);
            // 繪製另一隻手臂
            ctx.fillRect(x - 14, y + 5 + Math.sin(t * combatFreq) * 2, 4, 18);
        } else if (name === 'swordsman') {
            const isAttacking = (state === 'ATTACK');
            const angle = isAttacking ? Math.sin(t * combatFreq * 2) * 1.2 : (isActuallyMoving ? Math.sin(t * armFreq) * 0.3 : 0.2 + Math.sin(t * breatheFreq) * 0.05);
            this.drawTool(ctx, x + 8, y + 15, 'SWORD', angle);
            ctx.fillRect(x - 14, y + 5 + (isActuallyMoving || isAttacking ? 0 : Math.sin(t * breatheFreq) * 2), 4, 18);
        } else if (name === 'mage') {
            const isAttacking = (state === 'ATTACK');
            const angle = isAttacking ? Math.sin(t * combatFreq) * 0.5 : (isActuallyMoving ? Math.sin(t * armFreq) * 0.1 : Math.sin(t * breatheFreq) * 0.05);
            this.drawTool(ctx, x + 8, y + 15, 'STAFF', angle);
            ctx.fillRect(x - 14, y + 5 + (isActuallyMoving || isAttacking ? 0 : Math.sin(t * breatheFreq) * 2), 4, 18);
        } else if (name === 'archer') {
            const isAttacking = (state === 'ATTACK');
            const angle = isAttacking ? Math.sin(t * combatFreq) * 0.4 : (isActuallyMoving ? Math.sin(t * armFreq) * 0.1 : Math.sin(t * breatheFreq) * 0.03);
            this.drawTool(ctx, x + 8, y + 15, 'BOW', angle);
            ctx.fillRect(x - 14, y + 5 + (isActuallyMoving || isAttacking ? 0 : Math.sin(t * breatheFreq) * 1), 4, 18);
        } else if (data.cargo > 0) {
            const colors = UI_CONFIG.CargoColors || UI_CONFIG.VillagerColors;
            const cargoType = (data.cargoType || data.type || "").toUpperCase();
            const parseColor = (c) => {
                if (!c) return 0x795548;
                const cleaned = c.replace('#', '0x');
                const val = parseInt(cleaned.length > 8 ? cleaned.substring(0, 8) : cleaned);
                return isNaN(val) ? 0x795548 : val;
            };

            let resColor = parseColor(colors.DEFAULT || "#795548");
            if (cargoType === 'WOOD') resColor = parseColor(colors.WOOD);
            else if (cargoType === 'STONE') resColor = parseColor(colors.STONE);
            else if (cargoType === 'FOOD') resColor = parseColor(colors.FOOD);
            ctx.fillRect(x - 8, y + 10 + Math.sin(t * armFreq) * 2, 16, 12);
            // 加入頂部亮邊增加立體感
            this.setCtxStyle(ctx, 0xffffff, 0.3);
            ctx.fillRect(x - 8, y + 10 + Math.sin(t * armFreq) * 2, 16, 3);
        } else if (state === 'ATTACK') {
            // 通用攻擊動作（針對村民或其他無特定武器單位）
            const swing = Math.sin(t * combatFreq * 1.5) * 10;
            const armAngle = Math.sin(t * combatFreq * 2) * 0.5;
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
        const isCombatMove = state === 'CHASE' || state === 'MOVE';
        const isMoving = (state.includes('MOVING') || isCombatMove) && !(unitData._stuckFrames > 5);
        const isWandering = !!unitData.idleTarget && !isCombatMove;
        const anim = UI_CONFIG.Animation || { runningFreq: 15, wanderingFreq: 5, breathingFreq: 1.33 };
        const t = time * 0.01;

        // [渲染核心 5: 選取圈繪製]
        const isEnemy = (unitData.config && unitData.config.camp === 'enemy') || unitData.camp === 'enemy';
        const isNeutral = (unitData.config && unitData.config.camp === 'neutral') || unitData.camp === 'neutral';
        const isSelected = window.GAME_STATE && window.GAME_STATE.selectedUnitIds && window.GAME_STATE.selectedUnitIds.includes(unitData.id);
        const isHovered = window.GAME_STATE && window.GAME_STATE.hoveredId === unitData.id;

        const isTargetedByPlayerArmy = window.GAME_STATE &&
            window.GAME_STATE.units.villagers.some(u => u.targetId === unitData.id);

        if (isSelected || isHovered || isTargetedByPlayerArmy) {
            const circleColor = (isEnemy || isTargetedByPlayerArmy) ? 0xf44336 : 0x4caf50;
            this.drawSelectionRing(ctx, x, y, time, circleColor);
        }

        // 1.1 繪製視界圈 (三段切換邏輯)
        const visionMode = (window.GAME_STATE && window.GAME_STATE.settings.showVisionRange) || 0;
        if (visionMode > 0) {
            const isSelected = window.GAME_STATE && window.GAME_STATE.selectedUnitIds && window.GAME_STATE.selectedUnitIds.includes(unitData.id);
            // 模式 1: 僅顯示選中目標 | 模式 2: 顯示所有單位
            if (visionMode === 2 || (visionMode === 1 && isSelected)) {
                const visionRadius = (unitData.field_vision || 150) * 20;
                this.drawVisionRange(ctx, x, y, visionRadius);
            }
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
        const bodyColor = 0x78909c; // 狼灰
        const accentColor = 0x455a64; // 深灰色裝飾
        const eyeColor = 0xffff00;  // 亮黃眼
        const isAttacking = unitData.state === 'ATTACK';
        const legOffset = isMoving ? Math.sin(t * moveFreq) * 8 : 0;
        const tailWag = Math.sin(t * moveFreq * 1.5) * 15;

        // 1. 繪製陰影 (額外加強)
        this.setCtxStyle(ctx, 0x000000, 0.2);
        if (ctx.fillEllipse) ctx.fillEllipse(x, y + 10, 25, 10);

        // 2. 繪製尾巴 (生動的擺動)
        this.setCtxStyle(ctx, bodyColor, 1);
        this.drawRectRotated(ctx, x - 10, y, -15, -2, 18, 6, (tailWag * Math.PI) / 180, bodyColor);

        // 3. 繪製腿部 (更靈動)
        this.setCtxStyle(ctx, accentColor, 1);
        ctx.fillRect(x - 12, y + 4 + legOffset, 4, 10); // 左前
        ctx.fillRect(x + 8, y + 4 - legOffset, 4, 10);  // 右前
        ctx.fillRect(x - 8, y + 2 - legOffset, 4, 10);  // 左後
        ctx.fillRect(x + 4, y + 2 + legOffset, 4, 10);  // 右後

        // 4. 身體
        this.setCtxStyle(ctx, bodyColor, 1);
        ctx.fillRect(x - 14, y - 8, 28, 14);
        this.setCtxStyle(ctx, accentColor, 0.3); // 背部深色條紋
        ctx.fillRect(x - 14, y - 8, 28, 4);

        // 呼吸與攻擊衝刺
        const breathing = (isMoving || isAttacking) ? 0 : Math.sin(t * breatheFreq * 1.2) * 1.5;
        const multiplier = CharacterRenderer.getFreqMultiplier(unitData);
        const animWorkFreq = (UI_CONFIG.Animation ? UI_CONFIG.Animation.workFreq : 2);
        const atkFreq = animWorkFreq * 5 * multiplier;
        const attackDash = isAttacking ? Math.abs(Math.sin(t * atkFreq)) * 12 : 0;

        // 5. 頭部 (更具侵略性)
        const headBob = isAttacking ? Math.sin(t * atkFreq) * 5 : (isMoving ? Math.sin(t * headBobFreq) * 2 : Math.sin(t * breatheFreq * 0.8) * 1.5);
        const headX = x + 10 + attackDash;
        const headY = y - 14 + headBob + breathing;

        this.setCtxStyle(ctx, bodyColor, 1);
        ctx.fillRect(headX, headY, 16, 12); // 更長的狼吻

        // 尖耳朵
        ctx.fillRect(headX + 2, headY - 6, 3, 7);
        ctx.fillRect(headX + 8, headY - 6, 3, 7);

        // 6. 顯眼的發光眼睛
        this.setCtxStyle(ctx, eyeColor, 1);
        const blink = !isMoving && Math.sin(t * 1.5) > 0.98;
        if (!blink) {
            ctx.fillRect(headX + 11, headY + 3, 3, 3); // 黃光亮點
            this.setCtxStyle(ctx, 0xffffff, 0.8);
            ctx.fillRect(headX + 12, headY + 4, 1, 1); // 瞳孔反光
        }

        // 7. 攻擊時的利齒
        if (isAttacking && Math.sin(t * atkFreq) > 0) {
            this.setCtxStyle(ctx, 0xffffff, 1);
            ctx.fillRect(headX + 10, headY + 8, 4, 4);
        }
    }

    static renderBear(ctx, x, y, t, unitData, isMoving, moveFreq, headBobFreq, breatheFreq) {
        const bodyColor = 0x5d4037; // 棕熊主色
        const noseColor = 0x2d1b14; // 深色鼻子
        const isAttacking = unitData.state === 'ATTACK';
        const legOffset = isMoving ? Math.sin(t * moveFreq) * 5 : 0;

        // 1. 繪製陰影 (熊比較大，陰影也大)
        this.setCtxStyle(ctx, 0x000000, 0.25);
        if (ctx.fillEllipse) ctx.fillEllipse(x, y + 12, 35, 12);

        // 2. 粗壯的腿
        this.setCtxStyle(ctx, bodyColor, 1);
        ctx.fillRect(x - 14, y + 4 + legOffset, 10, 14); // 左前
        ctx.fillRect(x + 6, y + 4 - legOffset, 10, 14);  // 右前
        ctx.fillRect(x - 10, y + 0 - legOffset, 10, 14); // 左後
        ctx.fillRect(x + 2, y + 0 + legOffset, 10, 14);  // 右後

        // 3. 呼吸效果與攻擊衝擊感
        const breathing = (isMoving || isAttacking) ? 0 : Math.sin(t * breatheFreq * 0.7) * 2;
        const multiplier = CharacterRenderer.getFreqMultiplier(unitData);
        const animWorkFreq = (UI_CONFIG.Animation ? UI_CONFIG.Animation.workFreq : 2);
        const atkFreq = animWorkFreq * 4 * multiplier;
        const attackDash = isAttacking ? Math.abs(Math.sin(t * atkFreq)) * 8 : 0;

        // 4. 極其壯碩的身體
        this.setCtxStyle(ctx, bodyColor, 1);
        // 身體由兩塊矩形組成，增加厚實感
        ctx.fillRect(x - 18 + attackDash, y - 12 - breathing, 36, 22 + breathing); // 後軀
        ctx.fillRect(x - 16 + attackDash, y - 18 - breathing, 32, 22 + breathing); // 肩膀隆起

        // 5. 圓大的頭部
        const headBob = isAttacking ? Math.sin(t * atkFreq) * 4 : (isMoving ? Math.sin(t * headBobFreq) * 1.5 : Math.cos(t * breatheFreq * 0.6) * 2);
        const headX = x + 14 + attackDash;
        const headY = y - 20 + headBob;

        ctx.fillRect(headX, headY, 18, 18);

        // 圓耳朵
        ctx.fillRect(headX + 2, headY - 4, 5, 5);
        ctx.fillRect(headX + 11, headY - 4, 5, 5);

        // 6. 鼻子與眼睛 (更顯眼)
        this.setCtxStyle(ctx, noseColor, 1);
        ctx.fillRect(headX + 12, headY + 10, 8, 8); // 熊吻
        this.setCtxStyle(ctx, 0x000000, 1);
        ctx.fillRect(headX + 10, headY + 6, 3, 3); // 眼睛

        // 7. 攻擊利爪 (亮白色)
        if (isAttacking) {
            this.setCtxStyle(ctx, 0xffffff, 0.9);
            const swipe = Math.sin(t * atkFreq) * 8;
            ctx.fillRect(headX + 15, headY + 15 + swipe, 6, 10);
            this.setCtxStyle(ctx, 0x000000, 0.2); // 爪痕陰影
            ctx.fillRect(headX + 22, headY + 18 + swipe, 10, 2);
        }
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

    static renderCatapult(ctx, x, y, unitData, time) {
        const t = time * 0.01;
        const state = unitData.state || 'IDLE';
        const isMoving = state === 'MOVE' || state === 'CHASE' || state.includes('MOVING');
        const isAttacking = state === 'ATTACK';
        const facing = unitData.facing || 1;

        // 1. 繪製陰影
        this.drawShadow(ctx, x, y);

        // 2. 繪製主框架 (木製底盤)
        this.setCtxStyle(ctx, 0x5d4037, 1);
        ctx.fillRect(x - 16, y - 4, 32, 12);
        
        // 3. 繪製輪子 (四個簡單輪子)
        this.setCtxStyle(ctx, 0x3e2723, 1);
        const wheelY = y + 8;
        const wheelBob = isMoving ? Math.sin(t * 10) * 2 : 0;
        
        if (ctx.fillCircle) {
            ctx.fillCircle(x - 12, wheelY + wheelBob, 6);
            ctx.fillCircle(x + 12, wheelY - wheelBob, 6);
            this.setCtxStyle(ctx, 0x5d4037, 1);
            ctx.fillCircle(x - 12, wheelY + wheelBob, 2);
            ctx.fillCircle(x + 12, wheelY - wheelBob, 2);
        } else {
            ctx.fillRect(x - 16, wheelY - 4, 8, 8);
            ctx.fillRect(x + 8, wheelY - 4, 8, 8);
        }

        // 4. 繪製拋石臂架
        this.setCtxStyle(ctx, 0x4e342e, 1);
        ctx.fillRect(x - 2, y - 20, 4, 18);

        // 5. 繪製拋石臂 (Pivot point at x, y-10)
        const armPivotY = y - 10;
        const armAngle = isAttacking ? -0.4 + Math.sin(t * 12) * 0.8 : -0.2;
        this.drawRectRotated(ctx, x, armPivotY, -2, -28, 4, 30, armAngle, 0x5d4037);

        // 6. 繪製投石勺 (前端)
        const armLen = 28;
        const scoopX = x + Math.cos(armAngle - Math.PI / 2) * armLen;
        const scoopY = armPivotY + Math.sin(armAngle - Math.PI / 2) * armLen;
        
        this.setCtxStyle(ctx, 0x3e2723, 1);
        if (ctx.fillCircle) {
            ctx.fillCircle(scoopX, scoopY, 8);
            // 彈藥載入視覺 (如果正在準備投射)
            if (isAttacking && Math.sin(t * 12) < 0) {
                this.setCtxStyle(ctx, 0xffaa00, 1);
                ctx.fillCircle(scoopX, scoopY, 5);
            }
        } else {
            ctx.fillRect(scoopX - 6, scoopY - 6, 12, 12);
        }
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

    static drawSelectionRing(ctx, x, y, time, color = 0x4caf50, customRadius = null) {
        const alpha = 0.8;
        const radius = customRadius || 22;
        // 加入輕微的呼吸律動感，提升質感
        const pulse = Math.sin(time * 0.005) * 2;

        if (ctx.lineStyle !== undefined) {
            // Phaser Graphics 渲染模式
            ctx.lineStyle(2, color, alpha);
            ctx.strokeCircle(x, y + 5, radius + pulse);
            ctx.lineStyle(1, 0xffffff, 0.4);
            ctx.strokeCircle(x, y + 5, radius - 2 + pulse);
        } else {
            // Canvas Context 渲染模式
            const r = (color >> 16) & 255;
            const g = (color >> 8) & 255;
            const b = color & 255;
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y + 5, radius + pulse, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = `rgba(255, 255, 255, 0.4)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(x, y + 5, radius - 2 + pulse, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    static getFreqMultiplier(unitData) {
        if (!unitData) return 1.0;
        const name = (unitData.configName || "").toLowerCase();
        const isEnemy = (unitData.config && unitData.config.camp === 'enemy') || unitData.camp === 'enemy';

        if (isEnemy) return 0.25;
        if (name.includes('villager')) return 0.75;
        // 戰鬥單位：50%
        if (name === 'swordsman' || name === 'mage' || name === 'archer') return 0.5;

        return 1.0;
    }

    static renderSheep(ctx, x, y, unitData, time) {
        // [新實作] 羊的渲染：蓬鬆的白毛身體與灰頭
        const bodyColor = 0xffffff;
        const headColor = 0xbdbdbd;
        const state = unitData.state || 'IDLE';
        const isMoving = state.includes('MOVING') || state === 'MOVE' || state === 'CHASE';
        const t = time * 0.01;
        const anim = UI_CONFIG.Animation || { wanderingFreq: 5, breathingFreq: 1 };
        const moveFreq = anim.wanderingFreq;

        // 1. 繪製陰影
        this.drawShadow(ctx, x, y);

        // 2. 繪製腿 (短小，上移以貼合身體)
        const legOffset = isMoving ? Math.sin(t * moveFreq) * 2 : 0;
        this.setCtxStyle(ctx, 0x333333, 1);
        ctx.fillRect(x - 8, y + 2 + legOffset, 3, 6);
        ctx.fillRect(x - 2, y + 2 - legOffset, 3, 6);
        ctx.fillRect(x + 5, y + 2 + legOffset, 3, 6);
        ctx.fillRect(x + 11, y + 2 - legOffset, 3, 6);

        // 3. 繪製蓬鬆的身體 (多個圓形組合，上移至中心)
        const bob = Math.sin(t * anim.breathingFreq) * 1.5;
        this.setCtxStyle(ctx, bodyColor, 1);
        if (ctx.fillEllipse) {
            ctx.fillEllipse(x, y - 2 + bob, 22, 16);
            ctx.fillCircle(x - 10, y - 5 + bob, 10);
            ctx.fillCircle(x + 10, y - 5 + bob, 10);
            ctx.fillCircle(x, y - 8 + bob, 10);
        } else {
            ctx.fillRect(x - 15, y - 10 + bob, 30, 20);
        }

        // 4. 繪製頭部
        const headX = (unitData.facing || 1) === 1 ? x + 15 : x - 15;
        this.setCtxStyle(ctx, headColor, 1);
        ctx.fillRect(headX - 6, y - 10 + bob, 12, 12);
        // 耳朵
        ctx.fillRect((unitData.facing === 1 ? headX - 7 : headX + 4), y - 8 + bob, 3, 6);

        // 眼睛
        this.setCtxStyle(ctx, 0x000000, 1);
        ctx.fillRect(headX + 2 * (unitData.facing || 1), y - 6 + bob, 2, 2);

        // 5. 選取圈 (依據狀態切換橙色/紅色樣式)
        const isSelected = window.GAME_STATE && window.GAME_STATE.selectedUnitIds && window.GAME_STATE.selectedUnitIds.includes(unitData.id);
        const isHovered = window.GAME_STATE && window.GAME_STATE.hoveredId === unitData.id;
        const isTargetedByPlayerArmy = window.GAME_STATE &&
            window.GAME_STATE.units.villagers.some(u => u.targetId === unitData.id);

        if (isSelected || isHovered || isTargetedByPlayerArmy) {
            const neutralCfg = UI_CONFIG.NeutralSelection || { selectionRingColor: 0xff9100 };
            // 如果正被我方集火，則套用紅框；否則維持中立橘框
            const circleColor = isTargetedByPlayerArmy ? 0xf44336 : neutralCfg.selectionRingColor;
            this.drawSelectionRing(ctx, x, y, time, circleColor);
        }
    }
}
