import { GameEngine } from "../game_systems.js";
import { UI_CONFIG } from "../ui_config.js";
import { CharacterRenderer } from "../character_renderer.js";
import { ResourceRenderer } from "../resource_renderer.js";

export class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        this.entities = new Map(); // ID -> Sprite/Image
        this.units = new Map();     // ID -> Sprite
        this.queueTexts = new Map();
        this.nameLabels = new Map();
        this.levelLabels = new Map();
        this.resourceLabels = new Map();
        this.gridGraphics = null;
    }

    preload() {
        // 目前沒有外部資產，如果有的話可以在這裡加載
        // 例如: this.load.image('village', 'assets/village.png');
    }

    create() {
        // 將 floorColor 正規化為 Phaser 支援的格式
        // Phaser setBackgroundColor 僅支援 #rrggbb（6位）或 rgba()
        // 若使用者填入 8 位元的 #rrggbbaa，自動轉換為 rgba() 避免變成黑色
        const rawFloor = UI_CONFIG.Grid.floorColor || '#f5f5dc';
        let floorColor = rawFloor;
        if (/^#[0-9a-fA-F]{8}$/.test(rawFloor)) {
            const r = parseInt(rawFloor.slice(1, 3), 16);
            const g = parseInt(rawFloor.slice(3, 5), 16);
            const b = parseInt(rawFloor.slice(5, 7), 16);
            const a = (parseInt(rawFloor.slice(7, 9), 16) / 255).toFixed(2);
            floorColor = `rgba(${r},${g},${b},${a})`;
        }
        this.cameras.main.setBackgroundColor(floorColor);

        // 生成所有建築與資源的材質
        this.generateTextures();

        // 創建格網
        this.gridGraphics = this.add.graphics();
        this.drawGrid();

        // 實體與單位的容器
        this.entityGroup = this.add.group();
        this.unitGroup = this.add.group();

        // 預覽配置 (用於建築放置)
        this.placementPreview = this.add.graphics();
        this.placementPreview.setDepth(100);

        // 動態 HUD 繪圖層 (進度條、生產列)
        this.hudGraphics = this.add.graphics();
        this.hudGraphics.setDepth(60);

        // 相機控制
        this.setupCamera();

        // 設置全局引用
        window.PhaserScene = this;
    }

    generateTextures() {
        const TS = GameEngine.TILE_SIZE;
        const graphics = this.make.graphics({ x: 0, y: 0, add: false });

        const createTex = (key, width, height, drawFn) => {
            graphics.clear();
            // 由於 generateTexture 會從 (0,0) 開始截取固定寬高，
            // 我們的繪製邏輯（drawEntity）通常是以中心點為基準，
            // 所以這裡需要傳入一個平移過的 graphics 物件或者在 drawFn 裡處理。
            // 這裡簡單處理：直接在 x+width/2, y+height/2 繪製並對齊。
            drawFn(graphics, width, height);
            graphics.generateTexture(key, width, height);
        };

        // 為了解決 drawEntity 使用中心座標的問題，我們封裝一個中轉函數
        const wrapDraw = (type) => (g, w, h) => {
            // 模擬一個虛擬實體傳給 drawEntity
            const mockEnt = { type, x: w / 2, y: h / 2, isUnderConstruction: false };
            this.drawEntity(g, mockEnt, 1.0);
        };

        // 生成所有建築材質
        const buildingTypes = [
            'village', 'town_center', 'farmhouse', 'timber_factory',
            'stone_factory', 'barn', 'farmland', 'tree_plantation',
            'mage_place', 'swordsman_place', 'archer_place', 'campfire'
        ];

        buildingTypes.forEach(type => {
            const cfg = GameEngine.state.buildingConfigs[type];
            let uw = 1, uh = 1;
            if (cfg && cfg.size) {
                const match = cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
                if (match) { uw = parseInt(match[1]); uh = parseInt(match[2]); }
            }
            createTex(`tex_${type}`, uw * TS + 20, uh * TS + 40, wrapDraw(type));
        });

        // 資源材質 (樹、石、糧) - 由獨立產生器負責
        ResourceRenderer.generateAllTextures(this);

        // 村民材質 (可以根據狀態生成幾種，或使用 tint)
        // 這裡我們先生成基礎外觀
        createTex('tex_villager', 40, 60, (g, w, h) => {
            CharacterRenderer.render(g, w / 2, h / 2 + 10, { state: 'IDLE' }, 0);
        });

        graphics.destroy();
    }

    setupCamera() {
        const cam = this.cameras.main;

        cam.scrollX = 0;
        cam.scrollY = 0;

        let isDragging = false;
        let lastPointer = { x: 0, y: 0 };

        const onDown = (e) => {
            if (e.target.tagName === 'CANVAS') {
                if (window.UIManager && window.UIManager.dragGhost) return;
                if (GameEngine.state.placingType) return;

                isDragging = true;
                lastPointer = { x: e.clientX, y: e.clientY };
            }
        };

        const onMove = (e) => {
            if (isDragging) {
                const dx = e.clientX - lastPointer.x;
                const dy = e.clientY - lastPointer.y;
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

        this.events.once('shutdown', () => {
            window.removeEventListener('mousedown', onDown);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        });
    }

    drawGrid() {
        const TS = GameEngine.TILE_SIZE; // 20px
        const g = this.gridGraphics;
        const cfg = UI_CONFIG.Grid || { mainColor: "#000000", mainAlpha: 0.12, subColor: "#000000", subAlpha: 0.03 };

        // 將 "#rrggbb" 字串格式轉為 Phaser lineStyle 需要的數字格式
        const parseColor = (c) => typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c;

        g.clear();

        // 1. 繪製精細的小格 (20px)
        g.lineStyle(1, parseColor(cfg.subColor), cfg.subAlpha);
        for (let x = -2000; x < 4000; x += TS) {
            if (x % (TS * 4) === 0) continue; // 跳過大格線 (80px)
            g.lineBetween(x, -2000, x, 4000);
        }
        for (let y = -2000; y < 4000; y += TS) {
            if (y % (TS * 4) === 0) continue; // 跳過大格線 (80px)
            g.lineBetween(-2000, y, 4000, y);
        }

        // 2. 繪製主格線 (80px)
        g.lineStyle(1, parseColor(cfg.mainColor), cfg.mainAlpha);
        for (let x = -2000; x < 4000; x += TS * 4) {
            g.lineBetween(x, -2000, x, 4000);
        }
        for (let y = -2000; y < 4000; y += TS * 4) {
            g.lineBetween(-2000, y, 4000, y);
        }
    }

    update() {
        const state = window.GAME_STATE;
        if (!state) return;

        this.updateEntities(state.mapEntities);
        this.updateUnits(state.units.villagers);
        this.updatePlacementPreview(state);
        this.updateDynamicHUD(state.mapEntities);

        if (window.UIManager) window.UIManager.updateStickyPositions();
    }

    updateDynamicHUD(entities) {
        const g = this.hudGraphics;
        g.clear();
        if (!entities) return;

        const TS = GameEngine.TILE_SIZE;
        const cam = this.cameras.main;

        entities.forEach(ent => {
            const margin = 150;
            const isVisible = (ent.x + margin > cam.scrollX && ent.x - margin < cam.scrollX + cam.width &&
                ent.y + margin > cam.scrollY && ent.y - margin < cam.scrollY + cam.height);

            if (!isVisible) return;

            const cfg = GameEngine.getEntityConfig(ent.type);
            let uw = 1, uh = 1;
            if (cfg && cfg.size) {
                const match = cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
                if (match) { uw = parseInt(match[1]); uh = parseInt(match[2]); }
            }

            if (ent.isUnderConstruction) {
                this.drawBuildProgressBar(g, ent, uw, uh, TS);
            } else if (ent.type === 'village' || ent.type === 'town_center') {
                // 每間城鎮中心各自管理自己的隊列，直接顯示
                this.drawProductionHUD(g, ent, uw, uh, TS);
            }
        });
    }

    updateEntities(mapEntities) {
        if (!mapEntities) return;
        const currentIds = new Set();
        const cam = this.cameras.main;

        mapEntities.forEach(ent => {
            const id = ent.id || `${ent.type}_${ent.x}_${ent.y}`;
            currentIds.add(id);

            const margin = 150;
            const isVisible = (ent.x + margin > cam.scrollX && ent.x - margin < cam.scrollX + cam.width &&
                ent.y + margin > cam.scrollY && ent.y - margin < cam.scrollY + cam.height);

            let displayObj = this.entities.get(id);
            if (!displayObj) {
                const textureKey = this.getTextureKey(ent.type);
                if (textureKey && this.textures.exists(textureKey)) {
                    displayObj = this.add.image(ent.x, ent.y, textureKey);
                } else {
                    // 如果沒有預製材質，則使用 Graphics (退路)
                    displayObj = this.add.graphics();
                    this.drawEntity(displayObj, ent, 1.0);
                }
                this.entities.set(id, displayObj);
                this.entityGroup.add(displayObj);
                displayObj.setDepth(10);
            }

            displayObj.setVisible(isVisible);
            if (isVisible) {
                // 僅在位置發生變化或需要更新時設置
                if (displayObj.x !== ent.x || displayObj.y !== ent.y) {
                    displayObj.setPosition(ent.x, ent.y);
                }
                displayObj.setAlpha(ent.isUnderConstruction ? 0.6 : 1.0);

                // 動態縮放資源物件 (僅對影像紋理有效)
                if (displayObj instanceof Phaser.GameObjects.Image) {
                    const cfg = GameEngine.getEntityConfig(ent.type);
                    if (cfg && cfg.model_size) {
                        displayObj.setScale(cfg.model_size.x, cfg.model_size.y);
                    }
                }

                // 動態更新建築進度條 (如果有的話)
                // 注意：這裡如果每個物件都有進度條，可以考慮只在進度變化時重繪
                this.updateEntityLabel(id, ent);
            } else {
                this.hideEntityLabel(id);
            }
        });

        for (const [id, sprite] of this.entities.entries()) {
            if (!currentIds.has(id)) {
                sprite.destroy();
                this.entities.delete(id);

                if (this.queueTexts.has(id)) {
                    this.queueTexts.get(id).destroy();
                    this.queueTexts.delete(id);
                }

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

    hideEntityLabel(id) {
        if (this.nameLabels.has(id)) this.nameLabels.get(id).setVisible(false);
        if (this.levelLabels.has(id)) this.levelLabels.get(id).setVisible(false);
        if (this.resourceLabels.has(id)) this.resourceLabels.get(id).setVisible(false);
        if (this.queueTexts.has(id)) this.queueTexts.get(id).setVisible(false);
    }

    getTextureKey(type) {
        // 精確匹配建築類型（必須在前綴匹配之前，避免 stone_factory 被誤判為石頭資源）
        const mapping = {
            'village': 'tex_village',
            'town_center': 'tex_town_center',
            'farmhouse': 'tex_farmhouse',
            'timber_factory': 'tex_timber_factory',
            'stone_factory': 'tex_stone_factory',
            'barn': 'tex_barn',
            'farmland': 'tex_farmland',
            'tree_plantation': 'tex_tree_plantation',
            'mage_place': 'tex_mage_place',
            'swordsman_place': 'tex_swordsman_place',
            'archer_place': 'tex_archer_place',
            'campfire': 'tex_campfire'
        };

        if (mapping[type]) return mapping[type];

        // 前綴匹配資源類型（僅對非建築的自然資源）
        if (type.startsWith('tree') || type.startsWith('wood')) return 'tex_tree';
        if (type.startsWith('stone')) return 'tex_stone';
        if (type.startsWith('food')) return 'tex_food';

        return null;
    }

    drawEntity(g, ent, alpha) {
        const TS = GameEngine.TILE_SIZE;
        const cfg = GameEngine.getEntityConfig(ent.type);
        let uw = 1, uh = 1;
        if (cfg && cfg.size) {
            const match = cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
            if (match) { uw = parseInt(match[1]); uh = parseInt(match[2]); }
        }

        if (ent.isUnderConstruction) {
            console.log(`[DEBUG] 渲染施工實體: type=${ent.type}, size=${uw}x${uh}, pos=${ent.x},${ent.y}`);
        }

        const finalAlpha = ent.isUnderConstruction ? alpha * 0.5 : alpha;

        const isSelected = window.UIManager && window.UIManager.activeMenuEntity === ent;
        if (isSelected) {
            g.lineStyle(4, 0xffeb3b, 1);
            g.strokeRect(ent.x - (uw * TS) / 2 - 2, ent.y - (uh * TS) / 2 - 2, uw * TS + 4, uh * TS + 4);
            g.lineStyle(2, 0xffffff, 0.5);
            g.strokeRect(ent.x - (uw * TS) / 2 - 4, ent.y - (uh * TS) / 2 - 4, uw * TS + 8, uh * TS + 8);
        }

        if (ent.type === 'village' || ent.type === 'town_center') {
            g.fillStyle(0x8d6e63, finalAlpha);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(1, 0x5d4037, finalAlpha);
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'farmhouse') {
            g.fillStyle(0xbcaaa4, finalAlpha);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(1, 0x8d6e63, finalAlpha);
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);

            g.fillStyle(0x795548, finalAlpha);
            g.beginPath();
            g.moveTo(ent.x - (uw * TS) / 2 - 5, ent.y - (uh * TS) / 2);
            g.lineTo(ent.x, ent.y - (uh * TS) / 2 - 20);
            g.lineTo(ent.x + (uw * TS) / 2 + 5, ent.y - (uh * TS) / 2);
            g.fillPath();
        } else if (ent.type === 'timber_factory') {
            g.fillStyle(0x388e3c, finalAlpha);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x1b5e20, finalAlpha);
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'stone_factory') {
            g.fillStyle(0x455a64, finalAlpha);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x263238, finalAlpha);
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'barn') {
            g.fillStyle(0xa1887f, finalAlpha);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x5d4037, finalAlpha);
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'farmland') {
            g.fillStyle(0xdce775, finalAlpha);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(1, 0xafb42b, finalAlpha);
            // 動態繪製耕地線條
            for (let i = -(uw / 2); i < uw / 2; i += 0.5) {
                g.lineBetween(ent.x + i * TS, ent.y - (uh * TS) / 2 + 5, ent.x + i * TS, ent.y + (uh * TS) / 2 - 5);
            }
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'tree_plantation') {
            g.fillStyle(0x1b5e20, finalAlpha);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x0a3d0d, finalAlpha);
            // 動態分布小樹苗
            const step = TS;
            for (let i = -(uw * TS) / 2 + 10; i < (uw * TS) / 2; i += step) {
                for (let j = -(uh * TS) / 2 + 10; j < (uh * TS) / 2; j += step) {
                    g.fillStyle(0x2e7d32, finalAlpha);
                    g.fillCircle(ent.x + i, ent.y + j, 8);
                }
            }
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'mage_place') {
            g.fillStyle(0x4a148c, finalAlpha);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xe1f5fe, finalAlpha);
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.fillStyle(0xffd600, finalAlpha);
            g.fillCircle(ent.x, ent.y, 20);
        } else if (ent.type === 'swordsman_place') {
            g.fillStyle(0x455a64, finalAlpha);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xf44336, finalAlpha);
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.fillStyle(0xffccbc, finalAlpha);
            g.fillRect(ent.x - 10, ent.y - 10, 20, 20);
        } else if (ent.type === 'archer_place') {
            g.fillStyle(0x795548, finalAlpha);
            g.fillRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xffeb3b, finalAlpha);
            g.strokeRect(ent.x - (uw * TS) / 2, ent.y - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xf44336, finalAlpha);
            g.strokeCircle(ent.x, ent.y, 15);
            g.strokeCircle(ent.x, ent.y, 5);
        } else if (ent.type === 'campfire') {
            g.fillStyle(0xff5722, finalAlpha);
            g.fillCircle(ent.x, ent.y, 15);
        } else if (ent.type.startsWith('tree') || ent.type.startsWith('wood')) {
            g.fillStyle(0x2e7d32, finalAlpha);
            g.fillCircle(ent.x, ent.y, 20);
        } else if (ent.type.startsWith('stone')) {
            g.fillStyle(0x757575, finalAlpha);
            g.beginPath();
            g.moveTo(ent.x - 20, ent.y + 10);
            g.lineTo(ent.x, ent.y - 15);
            g.lineTo(ent.x + 25, ent.y + 15);
            g.fillPath();
        } else if (ent.type.startsWith('food')) {
            g.fillStyle(0xc2185b, finalAlpha);
            g.fillCircle(ent.x, ent.y, 18);
        }
    }

    drawBuildProgressBar(g, ent, uw, uh, TS) {
        const cfg = UI_CONFIG.BuildingProgressBar;
        const progress = ent.buildProgress / (ent.buildTime || 1);

        const overrides = cfg.overrides && cfg.overrides[ent.type] ? cfg.overrides[ent.type] : {};
        const widthScale = overrides.widthScale !== undefined ? overrides.widthScale : (cfg.widthScale || 1.1);

        const bw = (uw * TS) * widthScale;
        const bh = cfg.height || 10;
        const bx = ent.x - bw / 2;
        const by = ent.y + (uh * TS) / 2 + 5;

        const bgColor = this.hexOrRgba(cfg.bgColor);
        g.fillStyle(bgColor.color, bgColor.alpha);
        g.fillRect(bx, by, bw, bh);

        const fillColor = this.hexOrRgba(cfg.fillColor);
        g.fillStyle(fillColor.color, fillColor.alpha);
        g.fillRect(bx, by, bw * Math.max(0, Math.min(1, progress)), bh);

        const outlineColor = this.hexOrRgba(cfg.outlineColor);
        g.lineStyle(1, outlineColor.color, outlineColor.alpha);
        g.strokeRect(bx, by, bw, bh);
    }

    hexOrRgba(str) {
        if (!str) return { color: 0xffffff, alpha: 1 };

        if (str.startsWith('#')) {
            let hex = str.replace('#', '');
            if (hex.length === 3) {
                hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            }

            if (hex.length === 8) {
                const color = parseInt(hex.substring(0, 6), 16);
                const alpha = parseInt(hex.substring(6, 8), 16) / 255;
                return { color, alpha };
            } else {
                return { color: parseInt(hex, 16), alpha: 1 };
            }
        }

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
        const id = ent.id || `${ent.type}_${ent.x}_${ent.y}`;

        // 讀取此城鎮中心自己的隊列
        const queue = ent.queue || [];
        const timer = ent.productionTimer || 0;

        if (queue.length === 0) {
            if (this.queueTexts.has(id)) this.queueTexts.get(id).setVisible(false);
            return;
        }

        const cfg = UI_CONFIG.ProductionHUD;
        const maxPop = GameEngine.getMaxPopulation();
        const isPopFull = GameEngine.state.units.villagers.length >= maxPop;
        const progress = 1.0 - (timer / 5);

        const bx = ent.x - (uw * TS) / 2 + 15;
        const by = ent.y + (uh * TS) / 2 - 35;

        g.fillStyle(parseInt(cfg.barBg.replace('#', '0x')) || 0x000000, 0.6);
        g.fillRect(bx + 45, by + 12, 85, 12);

        const fillColor = isPopFull ? 0xf44336 : 0x4caf50;
        g.fillStyle(fillColor, 1);
        g.fillRect(bx + 45, by + 12, 85 * Math.max(0, Math.min(1, progress)), 12);

        g.fillStyle(0x311b92, 1);
        g.fillCircle(bx + 15, by + 15, 15);
        g.fillStyle(0x5e35b1, 1);
        g.fillCircle(bx + 15, by + 10, 8);

        g.fillStyle(0xc62828, 1);
        g.fillCircle(bx + 30, by + 5, 8);

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
        txt.setText(queue.length);
        txt.setPosition(bx + 30, by + 5);
        txt.setVisible(true);
        txt.setDepth(100);
    }

    updateUnits(villagers) {
        if (!villagers) return;

        const currentIds = new Set();
        const cam = this.cameras.main;

        villagers.forEach(v => {
            currentIds.add(v.id);
            let sprite = this.units.get(v.id);
            if (!sprite) {
                sprite = this.add.graphics();
                this.units.set(v.id, sprite);
                this.unitGroup.add(sprite);
            }

            const isVisible = (v.x + 50 > cam.scrollX && v.x - 50 < cam.scrollX + cam.width &&
                v.y + 50 > cam.scrollY && v.y - 50 < cam.scrollY + cam.height);

            sprite.setVisible(isVisible);
            if (isVisible) {
                sprite.clear();
                sprite.setDepth(20);
                CharacterRenderer.render(sprite, v.x, v.y, v, this.time.now);
            }
        });

        for (const [id, sprite] of this.units.entries()) {
            if (!currentIds.has(id)) {
                sprite.destroy();
                this.units.delete(id);
            }
        }
    }

    updatePlacementPreview(state) {
        const g = this.placementPreview;
        g.clear();

        if (!state.placingType) return;

        // 單個預覽 (Drag/Stamp)
        if (state.previewPos && (state.buildingMode === 'DRAG' || state.buildingMode === 'STAMP' || state.buildingMode === 'NONE')) {
            this.drawEntity(g, {
                type: state.placingType,
                x: state.previewPos.x,
                y: state.previewPos.y
            }, 0.5);
        }

        // 批量預覽 (Line)
        if (state.buildingMode === 'LINE' && state.linePreviewEntities) {
            state.linePreviewEntities.forEach(pos => {
                this.drawEntity(g, {
                    type: state.placingType,
                    x: pos.x,
                    y: pos.y
                }, 0.3); // 拉排預覽稍微淡一點
            });
        }
    }
}
