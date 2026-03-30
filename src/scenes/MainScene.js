import { GameEngine } from "../game_systems.js";
import { UI_CONFIG } from "../ui_config.js";
import { CharacterRenderer } from "../character_renderer.js";

export class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        this.entities = new Map(); // 用於跟蹤世界中的實體 (ID -> Sprite)
        this.units = new Map();     // 用於跟蹤單位 (ID -> Sprite)
        this.queueTexts = new Map(); // 用於跟蹤隊列數字 (ID -> Text)
        this.nameLabels = new Map();    // 用於跟蹤名稱標籤 (ID -> Text)
        this.levelLabels = new Map();    // 用於跟蹤等級標籤 (ID -> Text)
        this.resourceLabels = new Map(); // 用於跟蹤數量標籤 (ID -> Text)
        this.gridGraphics = null;
    }

    preload() {
        // 目前沒有外部資產，如果有的話可以在這裡加載
        // 例如: this.load.image('village', 'assets/village.png');
    }

    create() {
        this.cameras.main.setBackgroundColor('rgba(245, 245, 220, 1)');
        
        // 創建格網
        this.gridGraphics = this.add.graphics();
        this.drawGrid();

        // 實體與單位的容器
        this.entityGroup = this.add.group();
        this.unitGroup = this.add.group();
        
        // 預覽配置 (用於建築放置)
        this.placementPreview = this.add.graphics();

        // 相機控制
        this.setupCamera();

        // 設置全局引用
        window.PhaserScene = this;
    }

    setupCamera() {
        const cam = this.cameras.main;
        
        cam.scrollX = 0;
        cam.scrollY = 0;

        let isDragging = false;
        let lastPointer = { x: 0, y: 0 };

        const onDown = (e) => {
            // 只在點擊 Phaser 畫布或其容器時觸發，除非是在 UI 上
            if (e.target.closest('#ui_layer') && !e.target.closest('#context_menu')) {
                // 如果點擊的是 UI 且不是特定的互動區域，通常應該穿過
                // 但為了保險，我們只在點擊目標是畫布時才啟動拖拽
            }
            
            if (e.target.tagName === 'CANVAS') {
                if (window.UIManager && window.UIManager.dragGhost) return;
                isDragging = true;
                lastPointer = { x: e.clientX, y: e.clientY };
            }
        };

        const onMove = (e) => {
            if (isDragging) {
                const dx = e.clientX - lastPointer.x;
                const dy = e.clientY - lastPointer.y;
                
                // 這裡的 dx/dy 是螢幕像素，我們需要根據 Phaser 的縮放比例轉換 (如果有的話)
                // 暫時直接使用，因為 FIT 模式下比例通常是 1:1 或者等比
                cam.scrollX -= dx;
                cam.scrollY -= dy;
                
                lastPointer = { x: e.clientX, y: e.clientY };
            }
        };

        const onUp = () => {
            isDragging = false;
        };

        window.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);

        // 卸載時清理 (雖然在這個場景中不太需要，但這是好習慣)
        this.events.once('shutdown', () => {
            window.removeEventListener('mousedown', onDown);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        });
    }

    drawGrid() {
        const TS = GameEngine.TILE_SIZE;
        const g = this.gridGraphics;
        g.clear();
        g.lineStyle(1, 0x000000, 0.08);

        // 繪製格網 
        for (let x = -2000; x < 4000; x += TS) {
            g.lineBetween(x, -2000, x, 4000);
        }
        for (let y = -2000; y < 4000; y += TS) {
            g.lineBetween(-2000, y, 4000, y);
        }
    }

    update() {
        const state = window.GAME_STATE;
        if (!state) return;

        this.updateEntities(state.mapEntities);
        this.updateUnits(state.units.villagers);
        this.updatePlacementPreview(state);
        
        // 更新 UI 黏性位置 (如果需要的話)
        if (window.UIManager) window.UIManager.updateStickyPositions();
    }

    updateEntities(mapEntities) {
        // 渲染實體 (建築與資源)
        if (!mapEntities) return;

        // 標記目前存在的實體
        const currentIds = new Set();

        mapEntities.forEach((ent, index) => {
            // 使用類型和座標作為臨時 ID (如果實體沒有唯一 ID)
            const id = ent.id || `${ent.type}_${ent.x}_${ent.y}`;
            currentIds.add(id);

            let sprite = this.entities.get(id);
            if (!sprite) {
                sprite = this.add.graphics();
                this.entities.set(id, sprite);
                this.entityGroup.add(sprite);
            }
            
            this.drawEntity(sprite, ent, 1.0);
            sprite.setDepth(10);
            this.updateEntityLabel(id, ent);
        });

        // 刪除不再存在的實體
        for (const [id, sprite] of this.entities.entries()) {
            if (!currentIds.has(id)) {
                sprite.destroy();
                this.entities.delete(id);
                
                // 清理關聯的文字
                if (this.queueTexts.has(id)) {
                    this.queueTexts.get(id).destroy();
                    this.queueTexts.delete(id);
                }
                
                // 清理標籤
                if (this.nameLabels.has(id)) {
                    this.nameLabels.get(id).destroy();
                    this.nameLabels.delete(id);
                }
                if (this.levelLabels.has(id)) {
                    this.levelLabels.get(id).destroy();
                    this.levelLabels.delete(id);
                }
                if (this.resourceLabels.has(id)) {
                    this.resourceLabels.get(id).destroy();
                    this.resourceLabels.delete(id);
                }
            }
        }
    }

    updateEntityLabel(id, ent) {
        const cfg = UI_CONFIG.MapResourceLabels;
        const TS = GameEngine.TILE_SIZE;

        // 1. 名稱標籤 (Name)
        const nameStr = ent.isUnderConstruction ? "施工中" : (ent.name || ent.type);
        let nameTxt = this.nameLabels.get(id);
        if (!nameTxt) {
            nameTxt = this.add.text(ent.x, ent.y, nameStr, {
                font: cfg.name.fontSize,
                fill: cfg.name.color,
                align: 'center'
            }).setOrigin(0.5, 0.5);
            nameTxt.setStroke(cfg.name.outlineColor, cfg.name.outlineWidth);
            this.nameLabels.set(id, nameTxt);
        }
        nameTxt.setText(nameStr);
        nameTxt.setPosition(ent.x, ent.y + (cfg.name.offsetY || 0));
        nameTxt.setVisible(true);
        nameTxt.setDepth(50);

        // 2. 等級標籤 (Level)
        let lvlTxt = this.levelLabels.get(id);
        if (ent.level !== undefined) {
            const levelStr = `Lv.${ent.level}`;
            if (!lvlTxt) {
                lvlTxt = this.add.text(ent.x, ent.y, levelStr, {
                    font: cfg.level.fontSize,
                    fill: cfg.level.color,
                    align: 'center'
                }).setOrigin(0.5, 0.5);
                lvlTxt.setStroke(cfg.level.outlineColor, cfg.level.outlineWidth);
                this.levelLabels.set(id, lvlTxt);
            }
            lvlTxt.setText(levelStr);
            lvlTxt.setPosition(ent.x, ent.y + (cfg.level.offsetY || 0));
            lvlTxt.setVisible(true);
            lvlTxt.setDepth(50);
        } else if (lvlTxt) {
            lvlTxt.setVisible(false);
        }

        // 3. 數量標籤 (Amount)
        let amtTxt = this.resourceLabels.get(id);
        if (ent.amount !== undefined) {
            const amountStr = `(${Math.floor(ent.amount)})`;
            if (!amtTxt) {
                amtTxt = this.add.text(ent.x, ent.y, amountStr, {
                    font: cfg.amount.fontSize,
                    fill: cfg.amount.color,
                    align: 'center'
                }).setOrigin(0.5, 0.5);
                amtTxt.setStroke(cfg.amount.outlineColor, cfg.amount.outlineWidth);
                this.resourceLabels.set(id, amtTxt);
            }
            amtTxt.setText(amountStr);
            amtTxt.setPosition(ent.x, ent.y + (cfg.amount.offsetY || 0));
            amtTxt.setVisible(true);
            amtTxt.setDepth(50);
        } else if (amtTxt) {
            amtTxt.setVisible(false);
        }
    }

    drawEntity(g, ent, alpha) {
        const TS = GameEngine.TILE_SIZE;
        const cfg = GameEngine.state.buildingConfigs[ent.type];
        let uw = 1, uh = 1;
        if (cfg && cfg.size) {
            const match = cfg.size.match(/\{(\d+),(\d+)\}/);
            if (match) { uw = parseInt(match[1]); uh = parseInt(match[2]); }
        }

        g.clear();
        
        // 施工中效果：半透明
        const finalAlpha = ent.isUnderConstruction ? alpha * 0.5 : alpha;
        g.setAlpha(finalAlpha);

        // 選中高亮效果
        const isSelected = window.UIManager && window.UIManager.activeMenuEntity === ent;
        if (isSelected) {
            g.lineStyle(4, 0xffeb3b, 1); // 鮮黃色粗邊框
            g.strokeRect(ent.x - (uw * TS) / 2 - 2, ent.y - (uh * TS) / 2 - 2, uw * TS + 4, uh * TS + 4);
            // 加上外發光感
            g.lineStyle(2, 0xffffff, 0.5);
            g.strokeRect(ent.x - (uw * TS) / 2 - 4, ent.y - (uh * TS) / 2 - 4, uw * TS + 8, uh * TS + 8);
        }
        
        // 建築物主體
        if (ent.type === 'village' || ent.type === 'town_center') {
            g.fillStyle(0x8d6e63, 1);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(1, 0x5d4037, 1);
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'farmhouse') {
            g.fillStyle(0xbcaaa4, 1);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(1, 0x8d6e63, 1);
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            
            // 屋頂
            g.fillStyle(0x795548, 1);
            g.beginPath();
            g.moveTo(ent.x - (uw * TS) / 2 - 5, ent.y - (uh * TS) / 2);
            g.lineTo(ent.x, ent.y - (uh * TS) / 2 - 20);
            g.lineTo(ent.x + (uw * TS) / 2 + 5, ent.y - (uh * TS) / 2);
            g.fillPath();
        } else if (ent.type === 'timber_factory') {
            g.fillStyle(0x388e3c, 1);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x1b5e20, 1);
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'stone_factory') {
            g.fillStyle(0x455a64, 1);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x263238, 1);
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'barn') {
            g.fillStyle(0xa1887f, 1);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x5d4037, 1);
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'farmland') {
            g.fillStyle(0xdce775, 1); // 麥田色
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(1, 0xafb42b, 1);
            // 畫一些簡單的麥穗線條
            for(let i = -1; i <= 1; i++) {
                for(let j = -1; j <= 1; j++) {
                    g.lineBetween(ent.x + i*20, ent.y + j*20 - 10, ent.x + i*20, ent.y + j*20 + 10);
                }
            }
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'campfire') {
            g.fillStyle(0xff5722, 1);
            g.fillCircle(ent.x, ent.y, 15);
        } else if (ent.type.startsWith('tree') || ent.type.startsWith('wood')) {
            g.fillStyle(0x2e7d32, 1);
            g.fillCircle(ent.x, ent.y, 20);
        } else if (ent.type.startsWith('stone')) {
            g.fillStyle(0x757575, 1);
            g.beginPath();
            g.moveTo(ent.x - 20, ent.y + 10);
            g.lineTo(ent.x, ent.y - 15);
            g.lineTo(ent.x + 25, ent.y + 15);
            g.fillPath();
        } else if (ent.type.startsWith('ston')) {
            g.fillStyle(0x757575, 1);
            g.beginPath();
            g.moveTo(ent.x - 15, ent.y + 15);
            g.lineTo(ent.x, ent.y - 15);
            g.lineTo(ent.x + 15, ent.y + 15);
            g.closePath();
            g.fillPath();
        } else if (ent.type.startsWith('food')) {
            g.fillStyle(0xc2185b, 1);
            g.fillCircle(ent.x, ent.y, 18);
        }

        // 施工進度條
        if (ent.isUnderConstruction) {
            this.drawBuildProgressBar(g, ent, uw, uh, TS);
        } else if (ent.type === 'village') {
            // 生產 HUD (僅村莊，且非施工中)
            this.drawProductionHUD(g, ent, uw, uh, TS);
        }
    }

    drawBuildProgressBar(g, ent, uw, uh, TS) {
        const cfg = UI_CONFIG.BuildingProgressBar;
        const progress = ent.buildProgress / (ent.buildTime || 1);
        const bw = (uw * TS) * (cfg.widthScale || 1.0);
        const bh = cfg.height || 8;
        const bx = ent.x - bw / 2;
        const by = ent.y - (uh * TS) / 2 + (cfg.offsetY || -20);

        // 背景
        const bgColor = this.hexOrRgba(cfg.bgColor);
        g.fillStyle(bgColor.color, bgColor.alpha);
        g.fillRect(bx, by, bw, bh);

        // 填充
        const fillColor = this.hexOrRgba(cfg.fillColor);
        g.fillStyle(fillColor.color, fillColor.alpha);
        g.fillRect(bx, by, bw * Math.max(0, Math.min(1, progress)), bh);
        
        // 邊框
        const outlineColor = this.hexOrRgba(cfg.outlineColor);
        g.lineStyle(1, outlineColor.color, outlineColor.alpha);
        g.strokeRect(bx, by, bw, bh);
    }

    // 小工具：解析 hex (#RGB, #RRGGBB, #RRGGBBAA) 或 rgba(r,g,b,a) 字串
    hexOrRgba(str) {
        if (!str) return { color: 0xffffff, alpha: 1 };
        
        // 處理 Hex 格式
        if (str.startsWith('#')) {
            let hex = str.replace('#', '');
            if (hex.length === 3) {
                hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            }
            
            if (hex.length === 8) {
                // RRGGBBAA
                const color = parseInt(hex.substring(0, 6), 16);
                const alpha = parseInt(hex.substring(6, 8), 16) / 255;
                return { color, alpha };
            } else {
                // RRGGBB
                return { color: parseInt(hex, 16), alpha: 1 };
            }
        }
        
        // 處理 RGBA 格式
        if (str.startsWith('rgba')) {
            const m = str.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
            if (m) {
                const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]), a = parseFloat(m[4]);
                return { color: (r << 16) | (g << 8) | b, alpha: a };
            }
        }
        return { color: 0xffffff, alpha: 1 };
    }

    drawProductionHUD(g, ent, uw, uh, TS) {
        const state = window.GAME_STATE;
        const id = ent.id || `${ent.type}_${ent.x}_${ent.y}`;
        
        if (!state || state.villageQueue.length === 0) {
            if (this.queueTexts.has(id)) this.queueTexts.get(id).setVisible(false);
            return;
        }

        const cfg = UI_CONFIG.ProductionHUD;
        const maxPop = GameEngine.getMaxPopulation();
        const isPopFull = state.units.villagers.length >= maxPop;
        const progress = 1.0 - (state.villageProductionTimer / 5);

        const bx = ent.x - (uw * TS) / 2 + 15;
        const by = ent.y + (uh * TS) / 2 - 35;

        // 背景
        g.fillStyle(parseInt(cfg.barBg.replace('#', '0x')) || 0x000000, 0.6);
        g.fillRect(bx + 45, by + 12, 85, 12);

        // 填充
        const fillColor = isPopFull ? 0xf44336 : 0x4caf50;
        g.fillStyle(fillColor, 1);
        g.fillRect(bx + 45, by + 12, 85 * Math.max(0, Math.min(1, progress)), 12);
        
        // 單位圖示
        g.fillStyle(0x311b92, 1);
        g.fillCircle(bx + 15, by + 15, 15);
        g.fillStyle(0x5e35b1, 1);
        g.fillCircle(bx + 15, by + 10, 8);
        
        // 隊列徽章
        g.fillStyle(0xc62828, 1);
        g.fillCircle(bx + 30, by + 5, 8);

        // 隊列數字
        let txt = this.queueTexts.get(id);
        if (!txt) {
            txt = this.add.text(bx + 30, by + 5, state.villageQueue.length, {
                fontSize: '10px',
                fontStyle: 'bold',
                fontFamily: 'Arial',
                color: '#ffffff'
            }).setOrigin(0.5);
            this.queueTexts.set(id, txt);
        }
        txt.setText(state.villageQueue.length);
        txt.setPosition(bx + 30, by + 5);
        txt.setVisible(true);
        txt.setDepth(100); // 確保在其它圖塊上方
    }

    updateUnits(villagers) {
        if (!villagers) return;

        const currentIds = new Set();
        villagers.forEach(v => {
            currentIds.add(v.id);
            let sprite = this.units.get(v.id);
            if (!sprite) {
                sprite = this.add.graphics();
                this.units.set(v.id, sprite);
                this.unitGroup.add(sprite);
            }
            sprite.clear();
            sprite.setDepth(20);
            CharacterRenderer.render(sprite, v.x, v.y, v, this.time.now);
        });

        for (const [id, sprite] of this.units.entries()) {
            if (!currentIds.has(id)) {
                sprite.destroy();
                this.units.delete(id);
            }
        }
    }

    // 單位繪製邏輯已由 CharacterRenderer.js 統一處理


    updatePlacementPreview(state) {
        const g = this.placementPreview;
        g.clear();
        if (state.placingType && state.previewPos) {
            this.drawEntity(g, {
                type: state.placingType,
                x: state.previewPos.x,
                y: state.previewPos.y
            }, 0.5);
        }
    }
}
