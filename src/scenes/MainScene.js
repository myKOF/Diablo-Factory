import { GameEngine } from "../systems/game_systems.js";
import { UI_CONFIG } from "../ui/ui_config.js";
import { CharacterRenderer } from "../renderers/character_renderer.js";
import { ResourceRenderer } from "../renderers/resource_renderer.js";
import { BattleRenderer } from "../renderers/battle_renderer.js";
import { InputSystem } from "../systems/InputSystem.js";

export class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        this.entities = new Map(); // ID -> Sprite/Image
        this.units = new Map();     // ID -> Sprite
        this.queueTexts = new Map();
        this.nameLabels = new Map();
        this.levelLabels = new Map();
        this.resourceLabels = new Map();
        this.productIconBadges = new Map();
        this.unitIconTexts = new Map();
        this.emitters = new Map(); // ID -> ParticleEmitter
        this.occupancyHuds = new Map(); // ID -> Graphics
        this.gridGraphics = null;
        this.marqueeGraphics = null; // 框選圖形界面
        this.targetGraphics = null;  // 尋路目標提示層
        this.selectionStartPos = null; // 框選起始位置 (世界座標)
        this.clickEffects = [];      // 點擊反饋效果列表
        this.lastRenderVersion = 0;
        this.isMouseIn = false;      // 追蹤滑鼠是否在遊戲畫面內
        this.hasMouseEnteredGame = false; // 追蹤滑鼠是否曾真實進入過遊戲 (防止刷新後的 0,0 漂移)
        this.inputSystem = null; // 在 create 中初始化
    }

    hexToCssRgba(hex, alpha) {
        if (!hex || !hex.startsWith('#')) return hex;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha || 1})`;
    }

    preload() {
        // 目前沒有外部資產，如果有的話可以在這裡加載
        // 例如: this.load.image('village', 'assets/village.png');
        if (UI_CONFIG.Grid && UI_CONFIG.Grid.useTexture && UI_CONFIG.Grid.texture) {
            this.load.image('ground_texture', UI_CONFIG.Grid.texture);
        }
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

        window.PhaserScene = this;

        // 創建地表情境 (使用 AI 生成的無縫貼圖)
        if (UI_CONFIG.Grid && UI_CONFIG.Grid.useTexture) {
            const TS = GameEngine.TILE_SIZE;
            const mapCfg = (GameEngine.state.systemConfig && GameEngine.state.systemConfig.map_size) || { w: 7500, h: 7500 };
            const cols = Math.floor(mapCfg.w / TS);
            const rows = Math.floor(mapCfg.h / TS);
            const minGX = Math.floor(960 / TS) - Math.floor(cols / 2);
            const minGY = Math.floor(560 / TS) - Math.floor(rows / 2);
            const boundsW = cols * TS;
            const boundsH = rows * TS;
            const centerX = minGX * TS + boundsW / 2;
            const centerY = minGY * TS + boundsH / 2;

            this.backgroundSprite = this.add.tileSprite(centerX, centerY, boundsW, boundsH, 'ground_texture');
            this.backgroundSprite.setDepth(-10000); // 確保在最底層

            // 應用自訂參數
            const gridCfg = UI_CONFIG.Grid;
            if (gridCfg.textureAlpha !== undefined) this.backgroundSprite.setAlpha(gridCfg.textureAlpha);
            if (gridCfg.textureScale !== undefined) this.backgroundSprite.setTileScale(gridCfg.textureScale);
            if (gridCfg.textureTint) {
                const tintInt = typeof gridCfg.textureTint === 'string' ?
                    parseInt(gridCfg.textureTint.replace('#', ''), 16) : gridCfg.textureTint;
                this.backgroundSprite.setTint(tintInt);
            }
        }

        // 創建格網
        this.gridGraphics = this.add.graphics();
        this.drawGrid();

        // 實體與單位的容器
        this.entityGroup = this.add.group();
        this.unitGroup = this.add.group();

        // 效能協議：為資源實作物業層級的物件池渲染優化
        // 考量到資源物件有模型縮放 (model_size) 與視覺變形需求，改用 Image 對象池而非 Blitter。
        // Phaser 在幾千個 Image 下效能依然強勁。
        this.resourceBobs = new Map(); // 格網鍵值 (gx_gy) -> { type, bob, lv }
        this.resourcePools = {
            'tree': [], 'stone': [], 'food': [], 'gold_ore': [],
            'iron_ore': [], 'coal': [], 'magic_herb': [],
            'crystal_ore': [], 'copper_ore': [], 'silver_ore': [], 'mithril_ore': [],
            'wolf_corpse': [], 'bear_corpse': []
        };
        // 建立專用群組
        this.resourceGroup = this.add.group();

        // 預覽配置 (用於建築放置)
        this.placementPreview = this.add.graphics();
        this.placementPreview.setDepth(2000000);

        // 動態 HUD 繪圖層 (進度條、生產列)
        this.hudGraphics = this.add.graphics();
        this.hudGraphics.setDepth(2500000);

        // 選取高亮層
        this.selectionGraphics = this.add.graphics();
        this.selectionGraphics.setDepth(15); // 置於地表（單位與建築之下）以避免遮擋前景單位

        // 框選 marquee 層
        this.marqueeGraphics = this.add.graphics();
        this.marqueeGraphics.setDepth(3000000); // 置頂顯示

        // 尋路目標提示層 (位於單位之下)
        this.targetGraphics = this.add.graphics();
        this.targetGraphics.setDepth(10); // 確保在所有實體之下 (depth 以 Y 為準)

        if (!this.logisticsGraphics) {
            this.logisticsGraphics = this.add.graphics();
            const logCfg = UI_CONFIG.LogisticsSystem || { depth: 150 };
            this.logisticsGraphics.setDepth(logCfg.depth);
        }

        // 相機控制
        this.lastCamX = -9999;
        this.lastCamY = -9999;
        this.isDragging = false;
        this.lastVisibleEntities = [];        // 精確追蹤滑鼠進入/離開狀態
        this.input.on('pointerover', () => {
            this.isMouseIn = true;
            this.hasMouseEnteredGame = true; // 只要進入過就視為有效
        });
        this.input.on('pointerout', () => {
            this.isMouseIn = false;
            this.updateEdgeCursor(0, 0);
        });
        this.pendingVisibleEntities = true; // 強制首幀加載
        this.inputSystem = new InputSystem(this);
        this.setupCamera();

        // 設置全局引用
        window.PhaserScene = this;
        BattleRenderer.init(this);

        // RTS 核心設定：禁用右鍵選單
        if (this.input && this.input.mouse) {
            this.input.mouse.disableContextMenu();
        }

        // 邊緣捲動輔助：追蹤鼠標是否在視窗內
        this.isMouseIn = true;
        this.input.on('gameout', () => { this.isMouseIn = false; });
        this.input.on('gameover', () => { this.isMouseIn = true; });
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

        // 為了解決 drawEntity 使用相對座標 (0,0) 的問題，我們在繪製材質時先進行位移
        const wrapDraw = (type) => (g, w, h) => {
            // 將畫筆移到材質中心
            g.save();
            g.translateCanvas && g.translateCanvas(w / 2, h / 2); // 部分 Phaser 版本支援
            // 如果不支援 translateCanvas，可以手動在 drawEntity 傳入偏移，但這裡我們統一用 mockEnt 傳達意圖 (雖然現在 drawEntity 忽略它)
            // 修正：手動偏移才是最穩定的
            this.drawEntity(g, { type1: type, isUnderConstruction: false }, 1.0);
            g.restore();
        };

        // 生成所有建築材質
        const buildingTypes = [
            'village', 'town_center', 'farmhouse', 'timber_factory',
            'stone_factory', 'barn', 'gold_mining_factory', 'farmland', 'tree_plantation',
            'mage_place', 'swordsman_place', 'archer_place', 'campfire',
            // [核心對齊] 新合成工廠統一進入貼圖生成序列
            'timber_processing_plant', 'smelting_plant', 'stone_processing_plant', 'tank_workshop',
            'storehouse'
        ];

        buildingTypes.forEach(type => {
            const cfg = GameEngine.getEntityConfig(type);
            const { uw, uh } = this.getFootprint(cfg);
            createTex(`tex_${type}`, uw * TS + 20, uh * TS + 40, wrapDraw(type));
        });

        // 資源材質 (樹、石、糧) - 由獨立產生器負責
        ResourceRenderer.generateAllTextures(this);

        // 村民材質 (可以根據狀態生成幾種，或使用 tint)
        createTex('tex_villager', 40, 60, (g, w, h) => {
            CharacterRenderer.render(g, w / 2, h / 2 + 10, { state: 'IDLE' }, 0);
        });

        // 生成火粒子貼圖：中心較亮，向外擴散的小圓
        createTex('fire_particle', 32, 32, (g, w, h) => {
            g.fillStyle(0xffffff, 1);
            g.fillCircle(w / 2, h / 2, 8);
        });

        graphics.destroy();
    }

    setupCamera() {
        const cam = this.cameras.main;
        let lastPointer = { x: 0, y: 0 };
        this.isDragging = false;
        this.cameraKeys = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });

        const cancelMiddleDrag = () => {
            this.isMiddleDragging = false;
            this.dragStartPos = null;
        };

        // 核心設定：地圖範圍邊界
        const TS = GameEngine.TILE_SIZE;
        const mapCfg = (GameEngine.state.systemConfig && GameEngine.state.systemConfig.map_size) || { w: 7500, h: 7500 };
        const cols = Math.floor(mapCfg.w / TS);
        const rows = Math.floor(mapCfg.h / TS);
        const minGX = Math.floor(960 / TS) - Math.floor(cols / 2);
        const minGY = Math.floor(560 / TS) - Math.floor(rows / 2);

        const boundsX = minGX * TS;
        const boundsY = minGY * TS;
        const boundsW = cols * TS;
        const boundsH = rows * TS;

        cam.setBounds(boundsX, boundsY, boundsW, boundsH);

        if (cam.scrollX < boundsX || cam.scrollX > boundsX + boundsW) {
            cam.setScroll(960 - 960, 560 - 540);
        }

        this.input.on('pointerdown', (pointer) => {
            const isPlacement = !!GameEngine.state.placingType;
            if (window.UIManager && window.UIManager.dragGhost) return;

            const isMiddleDrag = pointer.middleButtonDown();

            if (pointer.leftButtonDown() && !isPlacement && !isMiddleDrag) {
                this.selectionStartPos = { x: pointer.worldX, y: pointer.worldY };
                this.mouseDownScreenPos = { x: pointer.x, y: pointer.y };
            }

            if (isMiddleDrag) {
                this.isMiddleDragging = true;
                this.dragStartPos = { x: pointer.x, y: pointer.y };
                lastPointer = { x: pointer.x, y: pointer.y };
            }
        });

        this.input.on('pointermove', (pointer) => {
            if (!this.hasMouseEnteredGame && (pointer.x !== 0 || pointer.y !== 0)) {
                this.hasMouseEnteredGame = true;
                this.isMouseIn = true;
            }

            this.lastLocalMouse = { x: pointer.x, y: pointer.y };

            if (this.isMiddleDragging && this.dragStartPos) {
                if (!pointer.middleButtonDown()) {
                    cancelMiddleDrag();
                    lastPointer = { x: pointer.x, y: pointer.y };
                    return;
                }

                const dx = pointer.x - lastPointer.x;
                const dy = pointer.y - lastPointer.y;
                cam.scrollX -= dx;
                cam.scrollY -= dy;
                this.lastManualDragTime = Date.now();
            }
            lastPointer = { x: pointer.x, y: pointer.y };

            // [核心修復] 呼叫框選移動邏輯，確保框選框隨滑鼠移動
            this.handleSelectionMove(pointer);
        });

        this.input.on('pointerup', (pointer) => {
            const isPlacement = !!GameEngine.state.placingType;

            if (pointer.button === 0 && this.selectionStartPos && !isPlacement) {
                this.handleSelectionEnd(pointer);
            }

            // Cleanup
            if (pointer.button === 0) {
                this.selectionStartPos = null;
            } else if (pointer.button === 1) { // Middle button
                if (pointer.event && (pointer.event.buttons & 4) !== 0) {
                    return;
                }
                cancelMiddleDrag();
            }
        });

        // [核心修復] 跨 UI 穿透框選：綁定全域原生 Mouse 事件以支援在 UI 面板上拉取框選
        const globalMove = (e) => this.handleSelectionMove(e);
        const globalUp = (e) => {
            if (e.button === 0 && this.selectionStartPos) {
                this.handleSelectionEnd(e);
                this.selectionStartPos = null;
            } else if (e.button === 1) {
                if ((e.buttons & 4) !== 0) {
                    return;
                }
                cancelMiddleDrag();
            }
        };
        window.addEventListener('mousemove', globalMove);
        window.addEventListener('mouseup', globalUp);

        this.events.once('shutdown', () => {
            window.removeEventListener('mousemove', globalMove);
            window.removeEventListener('mouseup', globalUp);
        });
    }

    isTextInputFocused() {
        const el = document.activeElement;
        if (!el || el === document.body) return false;
        const tagName = (el.tagName || '').toUpperCase();
        return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || el.isContentEditable;
    }

    /**
     * 處理單位的右鍵指令（移動或攻擊）
     */
    handleRightClickCommand(unit, pointer, clickedTarget = null, cmdCenter = null) {
        console.log(`[Command] ${unit.configName} (${unit.id}) right-click cmd at ${pointer.worldX.toFixed(0)}, ${pointer.worldY.toFixed(0)}`);
        // [最終防護] 若正處於建造預覽狀態，或按下鼠標時正處於建造預覽狀態，屏蔽所有指令
        if (GameEngine.state.placingType || GameEngine.state.rightClickStartedInPlacementMode) return;

        // 單位狀態檢查
        const unitType = unit.config ? unit.config.type : '';
        const unitCamp = (unit.config && unit.config.camp) || unit.camp || 'player';
        if (unitType === 'wolf' || unitType === 'bear' || unitCamp === 'neutral') return; // 非玩家控制單位不處理

        // [核心新增] 加工廠派駐系統連動：先檢查是否為派駐指令，或是否需要解除當前派駐狀態
        if (GameEngine.workerSystem && unit.config.type === 'villagers') {
            const depositHandled = GameEngine.workerSystem.handleManualDepositCommand(unit, clickedTarget);
            if (depositHandled) return;

            const handled = GameEngine.workerSystem.handleWorkerCommand(unit, clickedTarget);
            if (handled) return; // 如果是工廠派駐相關操作，則中止後續的移動/採集邏輯
        }

        const wx = pointer.worldX, wy = pointer.worldY;
        const TS = GameEngine.TILE_SIZE;
        const pf = GameEngine.state.pathfinding;

        let finalTx = wx, finalTy = wy;
        let isAttackCommand = false;

        // 1. 識別目標類別
        if (clickedTarget) {
            const isResource = !!(clickedTarget.gx !== undefined && clickedTarget.gy !== undefined) ||
                (clickedTarget.resourceType) ||
                (clickedTarget.type1 === 'farmland' || clickedTarget.type1 === 'tree_plantation');
            const isEnemy = (clickedTarget.config && (clickedTarget.config.camp === 'enemy' || clickedTarget.config.camp === 'neutral')) ||
                clickedTarget.camp === 'enemy' || clickedTarget.camp === 'neutral' || clickedTarget.isEnemy;


            // [核心修復] 不再強制強制切換為目標中心座標。使用帶有偏移的點擊座標 (wx, wy) 作為基準，
            // 如此一來即便多個單位同時點擊同一建築，也會因為各自不同的偏移量而散開至合法點位。
            finalTx = wx;
            finalTy = wy;

            if (isEnemy) {
                // 我方單位右鍵點敵方：移動至攻擊範圍內開始攻擊敵人
                isAttackCommand = true;
                unit.targetId = clickedTarget.id;
                unit.forceFocus = true;
                unit.state = 'CHASE';
                // 追擊目標座標亦可以維持帶偏移，達成環繞攻擊效果
                unit.idleTarget = { x: finalTx, y: finalTy };
                unit.isPlayerLocked = true;
                unit.chaseFrame = 999;
                GameEngine.addLog(`[命令] ${unit.configName} 鎖定目標 ${clickedTarget.configName || '敵人'} 並進入追擊。`, 'INPUT');
            } else if (clickedTarget.isUnderConstruction && unit.config.type === 'villagers') {
                // 我方工人右鍵點施工中建築：開始建造 (一人一間配給邏輯由外層 dispatcher 處理)
                unit.state = 'MOVING_TO_CONSTRUCTION';
                unit.constructionTarget = clickedTarget;
                unit.targetId = null;
                unit.pathTarget = null;
                unit.isPlayerLocked = true;

                GameEngine.addLog(`[命令] 工人 ${unit.id} 前往建設 ${clickedTarget.name || clickedTarget.type1}。`, 'INPUT');
                return;
            } else if (isResource && unit.config.type === 'villagers') {
                // 我方工人右鍵點資源：採集該資源
                unit.state = 'MOVING_TO_RESOURCE';
                unit.type = clickedTarget.resourceType || clickedTarget.type1 || clickedTarget.type;
                unit.targetId = clickedTarget;
                unit.pathTarget = null;
                unit.isPlayerLocked = true;
                GameEngine.addLog(`[命令] ${unit.configName} 前往採集 ${unit.type}。`, 'INPUT');
                return; // 採集進入獨立流程
            } else {
                // 其它情況：點資源(非工人)、障礙、友軍建築
                // 移動至該目標位置附近合法點位
                if (pf) {
                    const gx = Math.floor(finalTx / TS);
                    const gy = Math.floor(finalTy / TS);
                    if (!pf.isValidAndWalkable(gx, gy, true)) {
                        const nearestArr = pf.getNearestWalkableTile(gx, gy, 50, true);
                        if (nearestArr) {
                            finalTx = nearestArr.x * TS + TS / 2;
                            finalTy = nearestArr.y * TS + TS / 2;
                        }
                    }
                }
                unit.targetId = null;
                unit.forceFocus = false;
                GameEngine.addLog(`[命令] ${unit.configName} 移動至目標附近。`, 'INPUT');
            }
        } else {
            // 我方單位右鍵點地板：移動至該位置
            if (pf) {
                const gx = Math.floor(wx / TS);
                const gy = Math.floor(wy / TS);
                if (!pf.isValidAndWalkable(gx, gy, true)) {
                    const nearestArr = pf.getNearestWalkableTile(gx, gy, 50, true);
                    if (nearestArr) {
                        finalTx = nearestArr.x * TS + TS / 2;
                        finalTy = nearestArr.y * TS + TS / 2;
                    }
                }
            }

            unit.targetId = null;
            unit.forceFocus = false;
            unit.pathTarget = null;
            unit.constructionTarget = null;
            unit.assignedWarehouseId = null;
            GameEngine.addLog(`[命令] ${unit.configName} 移動至地面。`, 'INPUT');
        }

        // 2. 執行通用移動狀態設定
        if (!isAttackCommand) {
            unit.state = 'IDLE';
        }

        // 核心修復：只有當新目標與舊目標距離大於一定閾值時，才清除舊路徑。
        const distToExisting = unit.idleTarget ? Math.hypot(unit.idleTarget.x - finalTx, unit.idleTarget.y - finalTy) : 999;
        if (distToExisting > 10) {
            unit.pathTarget = null;
            unit.fullPath = null;
        }

        unit.idleTarget = { x: finalTx, y: finalTy };
        unit.commandCenter = cmdCenter || { x: finalTx, y: finalTy }; // 儲存視覺中心點
        unit.isPlayerLocked = true;
    }

    logUnitDetail(unit) {
        console.group(`[選取單位詳細資訊] ${unit.configName} (${unit.id})`);
        console.log(`%c狀態: ${unit.state}`, "color: #ffeb3b; font-weight: bold; background: #212121; padding: 2px 5px;");
        console.log(`座標: (${unit.x.toFixed(1)}, ${unit.y.toFixed(1)})`);
        console.log(`目標: `, unit.targetId || unit.idleTarget || "無");
        const pf = GameEngine.state.pathfinding;
        if (pf) {
            const gx = Math.floor(unit.x / GameEngine.TILE_SIZE);
            const gy = Math.floor(unit.y / GameEngine.TILE_SIZE);
            console.log(`網格座標: (${gx}, ${gy}), 可通行: ${pf.grid[gy] && pf.grid[gy][gx] === 0}`);
        }
        console.groupEnd();
    }

    drawGrid() {
        const TS = GameEngine.TILE_SIZE; // 20px
        const g = this.gridGraphics;
        const cfg = UI_CONFIG.Grid || { mainColor: "#000000", mainAlpha: 0.12, subColor: "#000000", subAlpha: 0.03 };

        // 將 "#rrggbb" 字串格式轉為 Phaser lineStyle 需要的數字格式
        const parseColor = (c) => {
            if (typeof c !== 'string') return c;
            let raw = c.replace('#', '');
            if (raw.length === 8) raw = raw.substring(0, 6);
            return parseInt(raw, 16);
        };

        const mapCfg = GameEngine.state.systemConfig.map_size || { w: 3200, h: 2000 };
        const cols = Math.floor(mapCfg.w / TS);
        const rows = Math.floor(mapCfg.h / TS);
        const minGX = Math.floor(960 / TS) - Math.floor(cols / 2);
        const minGY = Math.floor(560 / TS) - Math.floor(rows / 2);

        const startX = minGX * TS, endX = (minGX + cols) * TS;
        const startY = minGY * TS, endY = (minGY + rows) * TS;

        g.clear();

        // 1. 繪製精細的小格 (20px)
        g.lineStyle(1, parseColor(cfg.subColor), cfg.subAlpha);
        for (let x = startX; x <= endX; x += TS) {
            if (x % (TS * 4) === 0) continue;
            g.lineBetween(x, startY, x, endY);
        }
        for (let y = startY; y <= endY; y += TS) {
            if (y % (TS * 4) === 0) continue;
            g.lineBetween(startX, y, endX, y);
        }

        // 2. 繪製主格線 (80px)
        g.lineStyle(1, parseColor(cfg.mainColor), cfg.mainAlpha);
        for (let x = startX; x <= endX; x += TS * 4) {
            g.lineBetween(x, startY, x, endY);
        }
        for (let y = startY; y <= endY; y += TS * 4) {
            g.lineBetween(startX, y, endX, y);
        }
    }

    update(time, delta) {
        const deltaTime = delta / 1000;
        const state = window.GAME_STATE;
        if (!state) return;

        if (this.logisticsGraphics && window.GAME_STATE) {
            this.logisticsGraphics.clear();
            const state = window.GAME_STATE;
            const logCfg = UI_CONFIG.LogisticsSystem || {
                lineThickness: 3, lineColor: "#4caf50", lineAlpha: 0.6,
                dragLineColor: "#8bc34a", dragLineAlpha: 0.8,
                arrowColor: "#ff8800ff", arrowSize: 8, arrowSpeed: 60, arrowSpacing: 40, lineOffset: 8
            };
            const parseColor = (c) => this.hexOrRgba(c).color;
            const currentTime = this.time.now / 1000;

            const getCoordId = (e) => `${e.type1}_${e.x}_${e.y}`;

            // 1. 建立冗餘連線地圖 (同時支援 ID 與座標查詢)
            if (state.mapEntities) {
                state.mapEntities.forEach(ent => {
                    if (ent.outputTargets && ent.outputTargets.length > 0) {
                        ent.outputTargets.forEach(conn => {
                            const target = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === conn.id);
                            if (target) {
                                let sx = ent.x, sy = ent.y, ex = target.x, ey = target.y;
                                const isReciprocal = target.outputTargets && target.outputTargets.find(t => (t.id === (ent.id || getCoordId(ent))));
                                if (isReciprocal) {
                                    const dx = ex - sx, dy = ey - sy; const dist = Math.hypot(dx, dy);
                                    if (dist > 0) {
                                        const nx = -dy / dist, ny = dx / dist; const offset = logCfg.lineOffset || 10;
                                        sx += nx * offset; sy += ny * offset; ex += nx * offset; ey += ny * offset;
                                    }
                                }
                                const isSelected = (window.UIManager.activeLogisticsConnection &&
                                                  window.UIManager.activeLogisticsConnection.source === ent &&
                                                  window.UIManager.activeLogisticsConnection.targetId === conn.id);
                                const isConnected = !!conn.filter;
                                const lColor = !isConnected
                                    ? (logCfg.disconnectedLineColor || "#6b6b6b")
                                    : (isSelected ? (logCfg.selectedLineColor || "#ffff00") : logCfg.lineColor);
                                const lAlpha = !isConnected
                                    ? (logCfg.disconnectedLineAlpha ?? logCfg.lineAlpha)
                                    : (isSelected ? (logCfg.selectedLineAlpha || 1.0) : logCfg.lineAlpha);
                                this.logisticsGraphics.lineStyle(logCfg.lineThickness, parseColor(lColor), lAlpha);
                                this.logisticsGraphics.beginPath(); this.logisticsGraphics.moveTo(sx, sy); this.logisticsGraphics.lineTo(ex, ey); this.logisticsGraphics.strokePath();
                                const adx = ex - sx, ady = ey - sy; const alen = Math.hypot(adx, ady);
                                if (alen > 20) {
                                    const ux = adx / alen, uy = ady / alen;
                                    const speed = logCfg.arrowSpeed || 60; const spacing = logCfg.arrowSpacing || 40;
                                    const arrowOffset = isConnected ? ((currentTime * speed) % spacing) : spacing * 0.5;
                                    const arrowColor = isConnected ? logCfg.arrowColor : (logCfg.disconnectedArrowColor || logCfg.disconnectedLineColor || "#9a9a9a");
                                    const arrowAlpha = isConnected ? 0.9 : (logCfg.disconnectedArrowAlpha ?? 0.85);
                                    const arrowSize = isConnected ? (logCfg.arrowSize || 8) : (logCfg.disconnectedArrowSize || logCfg.arrowSize || 8);
                                    this.logisticsGraphics.fillStyle(parseColor(arrowColor), arrowAlpha);
                                    for (let d = arrowOffset; d < alen - 10; d += spacing) {
                                        this.drawArrowhead(this.logisticsGraphics, sx + ux * d, sy + uy * d, ux, uy, arrowSize);
                                    }
                                }
                            }
                        });
                    }
                });
            }
            if (state.logisticsDragLine) {
                const sx = state.logisticsDragLine.startX;
                const sy = state.logisticsDragLine.startY;
                const ex = state.logisticsDragLine.endX;
                const ey = state.logisticsDragLine.endY;
                const dragColor = parseColor(logCfg.dragLineColor);
                const dx = ex - sx;
                const dy = ey - sy;
                const len = Math.hypot(dx, dy);

                if (len > 24) {
                    const ux = dx / len;
                    const uy = dy / len;
                    const arrowSize = Math.max(logCfg.dragArrowSize || logCfg.arrowSize || 8, 1);
                    const arrowCenterX = ex - ux * arrowSize;
                    const arrowCenterY = ey - uy * arrowSize;
                    const arrowBaseX = ex - ux * arrowSize * 1.5;
                    const arrowBaseY = ey - uy * arrowSize * 1.5;

                    this.logisticsGraphics.lineStyle(logCfg.dragLineThickness || logCfg.lineThickness, dragColor, logCfg.dragLineAlpha);
                    this.logisticsGraphics.beginPath();
                    this.logisticsGraphics.moveTo(sx, sy);
                    this.logisticsGraphics.lineTo(arrowBaseX, arrowBaseY);
                    this.logisticsGraphics.strokePath();

                    this.logisticsGraphics.fillStyle(dragColor, logCfg.dragLineAlpha);
                    this.drawArrowhead(this.logisticsGraphics, arrowCenterX, arrowCenterY, ux, uy, arrowSize);
                } else {
                    this.logisticsGraphics.lineStyle(logCfg.dragLineThickness || logCfg.lineThickness, dragColor, logCfg.dragLineAlpha);
                    this.logisticsGraphics.beginPath();
                    this.logisticsGraphics.moveTo(sx, sy);
                    this.logisticsGraphics.lineTo(ex, ey);
                    this.logisticsGraphics.strokePath();
                }
            }
        }

        // RTS 邊緣捲動實作
        this.updateEdgeScrolling(deltaTime);
        this.updateKeyboardCameraScrolling(deltaTime);

        // [核心新增] 偵測滑鼠懸停優先權 (Requirement 1 & 2)
        this.updateHoverTarget();

        // 如果正在框選且相機在捲動，即時更新框選 UI
        if (this.selectionStartPos) {
            this.handleSelectionMove();
        }

        const cam = this.cameras.main;

        // 1. 抓取狀態並更新基礎 UI (此部分負擔極輕，需保證即時性)
        const camMoved = this.lastCamX !== cam.scrollX || this.lastCamY !== cam.scrollY;
        this.lastCamX = cam.scrollX;
        this.lastCamY = cam.scrollY;

        const entitiesCountChanged = (this.lastEntitiesCount !== state.mapEntities.length);
        this.lastEntitiesCount = state.mapEntities.length;

        const renderVersionChanged = (this.lastRenderVersion !== state.renderVersion);
        this.lastRenderVersion = state.renderVersion;

        // 即時更新建造預覽 - 必須在跳過邏輯之前，否則無法即時追隨滑鼠
        this.updatePlacementPreview(state);

        if (window.UIManager) {
            window.UIManager.updateValues(); // [修復] 同步 UI 數值更新至 60FPS
            window.UIManager.updateStickyPositions();

            const coordsEl = document.getElementById("coords_display");
            if (coordsEl) {
                const centerX = Math.round(cam.scrollX + cam.width / 2);
                const centerY = Math.round(cam.scrollY + cam.height / 2);
                coordsEl.innerText = `X: ${centerX}, Y: ${centerY}`;
            }

            const fpsEl = document.getElementById("fps_display");
            if (fpsEl) {
                fpsEl.innerText = `FPS: ${Math.round(this.game.loop.actualFps)}`;
            }

            this.updateTownCenterLocator(cam);
        }

        // 繪製選取高亮 (建築選取箱)
        this.drawSelectionHighlight();

        // 繪製尋路目標指示器
        this.drawPathfindingIndicators();

        // 2. 判斷是否可以跳過重度的實體渲染計算
        // 如果相機沒動、加載完畢、實體數量沒變，且且渲染版本未更新，跳過繁重計算
        if (!camMoved && !this.pendingVisibleEntities && !entitiesCountChanged && !renderVersionChanged && !state.placingType) {
            const allUnits = [...(state.units.villagers || []), ...(state.units.npcs || [])];
            this.updateUnits(allUnits);
            this.updateDynamicHUD(this.lastVisibleEntities);
            // 渲染戰鬥視覺 (HP Bars & Projectiles)
            BattleRenderer.renderHPBars(this.hudGraphics, allUnits, deltaTime);
            BattleRenderer.renderProjectiles(this.hudGraphics, state, deltaTime);
            return;
        }

        // 3. 執行重度渲染與裁剪
        // 3a. 更新建築實體 (mapEntities)
        const visibleEntities = GameEngine.getVisibleEntities(cam.scrollX, cam.scrollY, cam.width, cam.height, 200);
        this.lastVisibleEntities = visibleEntities;
        this.updateEntities(visibleEntities, state.mapEntities);

        // 3b. 更新大地圖資源 (MapDataSystem)
        if (state.mapData) {
            this.updateResources(state.mapData, cam.scrollX, cam.scrollY, cam.width, cam.height);
        }

        const allUnits = [...(state.units.villagers || []), ...(state.units.npcs || [])];
        this.updateUnits(allUnits);
        this.updateDynamicHUD(visibleEntities);

        // 渲染戰鬥視覺 (HP Bars) - 同時包含單位與具備血量的建築實體
        const allCombatants = [...allUnits, ...state.mapEntities.filter(e => e.hp !== undefined)];
        BattleRenderer.renderHPBars(this.hudGraphics, allCombatants, deltaTime);
        BattleRenderer.renderProjectiles(this.hudGraphics, state, deltaTime);
    }

    updateEdgeScrolling(dt) {
        const cfg = UI_CONFIG.EdgeScrolling;
        if (!cfg || !cfg.enabled) return;

        const pointer = this.input.activePointer;
        if (!pointer || !pointer.active) return;

        // [核心防護] 排除網頁刷新後的初始 0,0 漂移
        // 如果滑鼠從未進入過畫面，或者處於初始 0,0 且從未移動過，則忽略
        if (!this.hasMouseEnteredGame || (pointer.x === 0 && pointer.y === 0 && !pointer.wasMoved)) {
            return;
        }

        const margin = cfg.edgeWidth || 50;
        const speed = cfg.moveSpeed || 1000;
        const winW = this.cameras.main.width;
        const winH = this.cameras.main.height;

        // 核心檢查：鼠標必須在遊戲視窗內才執行，移出則停止
        // 1. 基於事件監聽的狀態檢查 (最優先)
        if (this.isMouseIn === false) {
            this.updateEdgeCursor(0, 0);
            return;
        }

        // 2. 基本座標邊界檢查 (容許誤差 1 像素，若超出則視為移出)
        if (pointer.x < -1 || pointer.x > winW + 1 || pointer.y < -1 || pointer.y > winH + 1) {
            this.updateEdgeCursor(0, 0);
            return;
        }

        // 1. 判定是否處於邊緣感應區 (用於切換游標與判斷是否啟動捲動)
        let ex = 0, ey = 0;
        if (pointer.x < margin) ex = -1;
        else if (pointer.x > winW - margin) ex = 1;
        if (pointer.y < margin) ey = -1;
        else if (pointer.y > winH - margin) ey = 1;

        // 2. 更新鼠標樣式
        this.updateEdgeCursor(ex, ey, pointer, winW, winH);

        // 3. 執行全向捲動 (直線射線方向)
        const isCurrentlyDragging = this.isMiddleDragging || (this.inputSystem && this.inputSystem.didMove);
        if ((ex !== 0 || ey !== 0) && !isCurrentlyDragging) {
            // [核心需求] 以中央座標到鼠標的位置的這個直線方向移動
            const centerX = winW / 2;
            const centerY = winH / 2;

            const dx = pointer.x - centerX;
            const dy = pointer.y - centerY;
            const dist = Math.hypot(dx, dy);

            if (dist > 1) {
                const moveX = (dx / dist) * speed * dt;
                const moveY = (dy / dist) * speed * dt;

                this.cameras.main.scrollX += moveX;
                this.cameras.main.scrollY += moveY;

                this.lastEdgeScrollTime = Date.now();
            }
        }
    }

    updateKeyboardCameraScrolling(dt) {
        const cfg = UI_CONFIG.EdgeScrolling;
        if (!cfg || !cfg.enabled || !this.cameraKeys || this.isTextInputFocused()) return;

        let dx = 0;
        let dy = 0;
        if (this.cameraKeys.left.isDown) dx -= 1;
        if (this.cameraKeys.right.isDown) dx += 1;
        if (this.cameraKeys.up.isDown) dy -= 1;
        if (this.cameraKeys.down.isDown) dy += 1;
        if (dx === 0 && dy === 0) return;

        const len = Math.hypot(dx, dy);
        const speed = cfg.moveSpeed || 1000;
        this.cameras.main.scrollX += (dx / len) * speed * dt;
        this.cameras.main.scrollY += (dy / len) * speed * dt;
        this.lastEdgeScrollTime = Date.now();
    }

    /**
     * 更新並快取鼠標箭頭樣式，避免頻繁調用 DOM 操作
     */
    updateEdgeCursor(ex, ey, pointer, winW, winH) {
        let cursor = 'default';

        if (ex !== 0 || ey !== 0) {
            // [核心邏輯] 將邊緣切成四等分，依據滑鼠所在分段切換箭頭樣式
            if (ey === -1) { // 上邊緣
                if (pointer.x < winW / 4) cursor = 'nw-resize';
                else if (pointer.x > winW * 3 / 4) cursor = 'ne-resize';
                else cursor = 'n-resize';
            } else if (ey === 1) { // 下邊緣
                if (pointer.x < winW / 4) cursor = 'sw-resize';
                else if (pointer.x > winW * 3 / 4) cursor = 'se-resize';
                else cursor = 's-resize';
            } else if (ex === -1) { // 左邊緣
                if (pointer.y < winH / 4) cursor = 'nw-resize';
                else if (pointer.y > winH * 3 / 4) cursor = 'sw-resize';
                else cursor = 'w-resize';
            } else if (ex === 1) { // 右邊緣
                if (pointer.y < winH / 4) cursor = 'ne-resize';
                else if (pointer.y > winH * 3 / 4) cursor = 'se-resize';
                else cursor = 'e-resize';
            }
        }

        if (this._lastAppliedCursor !== cursor) {
            this._lastAppliedCursor = cursor;
            this.input.setDefaultCursor(cursor);
        }
    }

    updateTownCenterLocator(cam) {
        const el = document.getElementById("tc_locator");
        if (!el) return;

        const tc = GameEngine.state.mapEntities.find(e => e.type1 === 'town_center' || e.type1 === 'village');
        if (!tc) {
            el.style.display = "none";
            return;
        }

        const TS = GameEngine.TILE_SIZE;
        const cfg = GameEngine.getEntityConfig(tc.type1);
        let uw = 3, uh = 3; // 預期 Town Center 是 3x3
        if (cfg && cfg.size) {
            const m = cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
            if (m) { uw = parseInt(m[1]); uh = parseInt(m[2]); }
        }
        const halfW = (uw * TS) / 2;
        const halfH = (uh * TS) / 2;

        // 檢查中心點是否在畫面內 (略微寬鬆一點)
        const isVisible = (tc.x + halfW >= cam.scrollX && tc.x - halfW <= cam.scrollX + cam.width &&
            tc.y + halfH >= cam.scrollY && tc.y - halfH <= cam.scrollY + cam.height);

        if (isVisible) {
            el.style.display = "none";
        } else {
            el.style.display = "flex";
            const ptrCfg = UI_CONFIG.TownCenterPointer;
            const margin = ptrCfg.margin || 40;

            // 計算向量 (從畫面中心指向量村莊中心)
            let dx = tc.x - (cam.scrollX + cam.width / 2);
            let dy = tc.y - (cam.scrollY + cam.height / 2);
            const angle = Math.atan2(dy, dx);

            // 更新箭頭旋轉與距離
            const arrow = document.getElementById("tc_arrow");
            const distLabel = document.getElementById("tc_distance");
            const realDist = Math.hypot(dx, dy);

            if (arrow) {
                arrow.style.transform = `rotate(${angle}rad) translateX(36px)`;
            }
            if (distLabel) {
                distLabel.innerText = `${Math.round(realDist)}px`;
            }

            // 套用動態顏色 (確保 ui_config 修改能即時反應)
            el.style.background = window.UIManager ? window.UIManager.hexToRgba(ptrCfg.bgColor, ptrCfg.bgAlpha) : ptrCfg.bgColor;

            // 計算指針在螢幕上的位置 (把向量投影到螢幕邊界的矩形上)
            const w = cam.width - margin * 2;
            const h = cam.height - margin * 2;

            const absCos = Math.abs(Math.cos(angle));
            const absSin = Math.abs(Math.sin(angle));

            let dist;
            if (w * absSin <= h * absCos) {
                dist = (w / 2) / absCos;
            } else {
                dist = (h / 2) / absSin;
            }

            const px = cam.width / 2 + Math.cos(angle) * dist;
            const py = cam.height / 2 + Math.sin(angle) * dist;

            el.style.left = `${px - ptrCfg.width / 2}px`;
            el.style.top = `${py - ptrCfg.height / 2}px`;
        }
    }

    updateDynamicHUD(visibleEntities) {
        const g = this.hudGraphics;
        g.clear();
        if (!visibleEntities) return;

        const TS = GameEngine.TILE_SIZE;
        visibleEntities.forEach(ent => {
            const cfg = GameEngine.getEntityConfig(ent.type1);
            let uw = 1, uh = 1;
            if (cfg && cfg.size) {
                const match = cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
                if (match) { uw = parseInt(match[1]); uh = parseInt(match[2]); }
            }

            if (ent.isUnderConstruction) {
                this.drawBuildProgressBar(g, ent, uw, uh, TS);
                // 施工中時，確保生產隊列標籤隱藏
                const id = ent.id || `${ent.type1}_${ent.x}_${ent.y}`;
                if (this.queueTexts.has(id)) this.queueTexts.get(id).setVisible(false);
            } else if (ent.isUpgrading) {
                this.drawUpgradeProgressBar(g, ent, uw, uh, TS);
            } else if (ent.queue) {
                // 不論 queue.length 是否大於 0 都呼叫，讓 drawProductionHUD 內部處理隱藏邏輯
                this.drawProductionHUD(g, ent, uw, uh, TS);
            }

            // 繪製集結點 (僅在選中且有集結點時顯示)
            const isSelected = (window.UIManager && window.UIManager.activeMenuEntity === ent) ||
                (GameEngine.state.selectedBuildingIds && GameEngine.state.selectedBuildingIds.includes(ent.id || `${ent.type1}_${ent.x}_${ent.y}`));
            if (ent.rallyPoint && isSelected) {
                this.drawRallyPoint(g, ent);
            }

            // [核心修正] 繪製工人派駐燈號：改用實體獨立 Graphics 物件，並根據 Y 軸設定深度 (500,000 + ent.y + 0.5)
            // 這樣進度條會顯示在建築上方，但當工人站在建築前方 (y 較大) 時會遮住進度條。
            const id = ent.id || `${ent.type1}_${ent.x}_${ent.y}`;
            const bCfg = GameEngine.getBuildingConfig(ent.type1, ent.lv || 1);
            const canShowWorkerOccupancy = bCfg && !ent.isUnderConstruction && (bCfg.need_villagers > 0 || ent.targetWorkerCount > 0);
            if (canShowWorkerOccupancy) {
                let occG = this.occupancyHuds.get(id);
                if (!occG) {
                    occG = this.add.graphics();
                    this.occupancyHuds.set(id, occG);
                }
                occG.clear();
                occG.setDepth(500000 + ent.y + 0.5);
                occG.setVisible(true);
                this.drawWorkerLights(occG, ent, ent.x, ent.y, uw, uh, TS, 1.0);
            } else if (this.occupancyHuds.has(id)) {
                this.occupancyHuds.get(id).setVisible(false);
            }
        });
    }

    drawUpgradeProgressBar(g, ent, uw, uh, TS) {
        const prog = ent.upgradeProgress || 0;
        const hCfg = UI_CONFIG.ActionMenuHeader;
        const barW = uw * TS * 0.8;
        const barH = 8;
        const x = ent.x - barW / 2;
        const y = ent.y + (uh * TS) / 2 + 10;

        // 背景
        const bgVal = this.hexOrRgba(hCfg.worldProgressBg);
        g.fillStyle(bgVal.color, bgVal.alpha);
        g.fillRoundedRect(x, y, barW, barH, 4);

        // 進度
        if (prog > 0) {
            const fillVal = this.hexOrRgba(hCfg.worldProgressColor);
            g.fillStyle(fillVal.color, fillVal.alpha);
            g.fillRoundedRect(x + 1, y + 1, Math.max(0, (barW - 2) * prog), barH - 2, 3);
        }

        // 外框
        g.lineStyle(1.5, 0xffffff, 0.8);
        g.strokeRoundedRect(x, y, barW, barH, 4);
    }

    drawRallyPoint(g, ent) {
        const cfg = UI_CONFIG.RallyPoint;
        const color = typeof cfg.lineColor === 'string' ? parseInt(cfg.lineColor.replace('#', ''), 16) : cfg.lineColor;
        const circleColor = typeof cfg.circleColor === 'string' ? parseInt(cfg.circleColor.replace('#', ''), 16) : cfg.circleColor;

        const dx = ent.rallyPoint.x - ent.x;
        const dy = ent.rallyPoint.y - ent.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 5) return;

        // 1. 繪製虛線
        const dashLen = cfg.lineDash[0];
        const gapLen = cfg.lineDash[1];
        const totalStep = dashLen + gapLen;

        g.lineStyle(2, color, cfg.lineAlpha);
        for (let i = 0; i < dist; i += totalStep) {
            const startRatio = i / dist;
            const endRatio = Math.min((i + dashLen) / dist, 1);
            g.lineBetween(
                ent.x + dx * startRatio, ent.y + dy * startRatio,
                ent.x + dx * endRatio, ent.y + dy * endRatio
            );
        }

        // 2. 繪製縮放光圈
        const time = Date.now() * cfg.pulseSpeed;
        const scale = (Math.sin(time) + 1) / 2; // 0 ~ 1
        const radius = cfg.circleMinRadius + (cfg.circleMaxRadius - cfg.circleMinRadius) * scale;

        g.lineStyle(2, circleColor, cfg.circleAlpha);
        g.strokeCircle(ent.rallyPoint.x, ent.rallyPoint.y, radius);

        g.fillStyle(circleColor, cfg.circleAlpha * 0.3);
        g.fillCircle(ent.rallyPoint.x, ent.rallyPoint.y, radius * 0.6);
    }


    drawSelectionHighlight() {
        const g = this.selectionGraphics;
        g.clear();

        // 僅處理建築選取框。單位選取圈已移至 CharacterRenderer.js 以達成 100% 同步
        // 1. [手動選取] 建築選取框 (橘色，由玩家點擊觸發)
        if (GameEngine.state.selectedBuildingIds && GameEngine.state.selectedBuildingIds.length > 0) {
            GameEngine.state.selectedBuildingIds.forEach(id => {
                const ent = GameEngine.state.mapEntities.find(e => (e.id === id || `${e.type1}_${e.x}_${e.y}` === id));
                if (ent) {
                    this.drawSingleSelectionBox(g, ent, 0xff9800);
                }
            });
        }

        // [核心需求] 支援屍體選取框 (橘色，由玩家點擊觸發)
        const selectedResId = GameEngine.state.selectedResourceId;
        if (selectedResId && selectedResId.startsWith('corpse_')) {
            const ent = GameEngine.state.mapEntities.find(e => e.id === selectedResId);
            if (ent) {
                this.drawSingleSelectionBox(g, ent, 0xff9800);
            }
        }

        // 2. [資源與目標] 物件描邊效果 (使用 FX Sprite 管理)
        this.updateResourceFX();
    }

    /**
     * 資源物件描邊與發光效果 (CONTROLLING CONTURE OUTLINE)
     * 使用特殊的 FX Sprite 覆蓋在選中資源上
     */
    updateResourceFX() {
        if (!this.resourceFXMap) this.resourceFXMap = new Map();

        const state = GameEngine.state;
        const cam = this.cameras.main;
        const worldView = cam.worldView;
        const TS = GameEngine.TILE_SIZE;

        const cfgRes = UI_CONFIG.ResourceSelection || {
            glowColor: "#ffeb3b", targetColor: "#00e5ff",
            glowOuterStrength: 2, glowInnerStrength: 0,
            glowAlpha: 0.1, glowQuality: 8, depth: 15
        };
        const cfgBld = UI_CONFIG.BuildingConstructionSelection || { ...cfgRes, glowQuality: 4 };

        if (!this._villagerMap) this._villagerMap = new Map();
        if (!this._activeTargets) this._activeTargets = new Map();

        const activeTargets = this._activeTargets;
        activeTargets.clear();

        const villagerMap = this._villagerMap;
        villagerMap.clear();
        if (state.units && state.units.villagers) {
            state.units.villagers.forEach(v => villagerMap.set(v.id, v));
        }

        // [效能優化] 建立建築快速索引，避免 O(N) find
        if (!this._buildingMap || this._lastMapEntitiesCount !== state.mapEntities.length) {
            this._buildingMap = new Map();
            state.mapEntities.forEach(e => {
                this._buildingMap.set(e.id || `${e.type1}_${e.x}_${e.y}`, e);
            });
            this._lastMapEntitiesCount = state.mapEntities.length;
        }
        const buildingMap = this._buildingMap;

        // 1. 手動選中的資源 (檢查可見性)
        const selectedResId = state.selectedResourceId;
        if (selectedResId) {
            // [新增] 支援屍體 (mapEntities) 的選取高亮
            if (selectedResId && selectedResId.startsWith('corpse_')) {
                const corpse = buildingMap.get(selectedResId);
                if (corpse && worldView.contains(corpse.x, corpse.y)) {
                    // 使用 cfgRes 渲染通用的選取效果
                    activeTargets.set(selectedResId + "_sel", { entity: corpse, fxType: 'sel', config: cfgRes });
                }
            } else if (selectedResId.includes('_')) {
                const parts = selectedResId.split('_');
                const gx = parseInt(parts[0]), gy = parseInt(parts[1]);
                const res = GameEngine.state.mapData.getResource(gx, gy);
                if (res && res.type !== 0) {
                    const rx = gx * TS + TS / 2, ry = gy * TS + TS / 2;
                    if (worldView.contains(rx, ry)) {
                        activeTargets.set(selectedResId + "_sel", { entity: { ...res, gx, gy }, fxType: 'sel', config: cfgRes });
                    }
                } else {
                    state.selectedResourceId = null;
                }
            }
        }

        // 2. 選中的單位之指令目標 (檢查可見性)
        const selectedIds = state.selectedUnitIds || [];
        selectedIds.forEach(uid => {
            const u = villagerMap.get(uid);
            if (!u) return;

            // 資源採集目標 (大地圖 TILE 資源或屍體實體)
            if (u.targetId) {
                if (u.targetId.gx !== undefined) {
                    const res = GameEngine.state.mapData.getResource(u.targetId.gx, u.targetId.gy);
                    if (res && res.type !== 0) {
                        const rx = u.targetId.gx * TS + TS / 2, ry = u.targetId.gy * TS + TS / 2;
                        if (worldView.contains(rx, ry)) {
                            activeTargets.set(`${u.targetId.gx}_${u.targetId.gy}_target`, { entity: { ...res, gx: u.targetId.gx, gy: u.targetId.gy }, fxType: 'target', config: cfgRes });
                        }
                    }
                } else {
                    // [Requirement 2] 支援屍體實體之採集目標描邊
                    const tEntId = (typeof u.targetId === 'string') ? u.targetId : u.targetId.id;
                    const tEnt = buildingMap.get(tEntId);
                    if (tEnt && tEnt.type1 === 'corpse' && worldView.contains(tEnt.x, tEnt.y)) {
                        activeTargets.set(tEntId + "_target", { entity: tEnt, fxType: 'target', config: cfgRes });
                        // 同時畫出橘色基礎方框增強視覺反饋 (Requirement 2)
                        this.drawSingleSelectionBox(this.selectionGraphics, tEnt, 0xff9800);
                    }
                }
            }

            // 建築施工目標
            if (u.constructionTarget) {
                const b = u.constructionTarget;
                // [優化] 增加可見性檢查，大幅減少大尺寸建築的 Glow Shader 計算
                // 安全邊界設為 100，避免建築邊角突然消失
                if (worldView.left - 100 < b.x && worldView.right + 100 > b.x &&
                    worldView.top - 100 < b.y && worldView.bottom + 100 > b.y) {
                    const bId = b.id || `${b.type1}_${b.x}_${b.y}`;
                    activeTargets.set(bId + "_const", { entity: b, fxType: 'const', config: cfgBld });
                }
            }
        });

        // 3. 選中建築的集結點目標 (提示描邊外框)
        const selectedBldIds = state.selectedBuildingIds || [];
        selectedBldIds.forEach(bid => {
            const b = buildingMap.get(bid);
            if (b && b.rallyPoint && b.rallyPoint.targetId) {
                const rp = b.rallyPoint;
                let target = null;
                let isRes = false;

                if (rp.targetType === 'RESOURCE') {
                    if (rp.targetId && rp.targetId.startsWith('res_')) {
                        const parts = rp.targetId.split('_'); // 'res_gx_gy'
                        if (parts.length >= 3) {
                            const gx = parseInt(parts[1]), gy = parseInt(parts[2]);
                            const res = GameEngine.state.mapData.getResource(gx, gy);
                            if (res && res.type !== 0) {
                                const rx = gx * TS + TS / 2, ry = gy * TS + TS / 2;
                                if (worldView.contains(rx, ry)) {
                                    target = { ...res, gx, gy, x: rx, y: ry };
                                    isRes = true;
                                }
                            }
                        }
                    } else if (rp.targetId && rp.targetId.startsWith('corpse_')) {
                        const corpse = buildingMap.get(rp.targetId);
                        if (corpse && worldView.contains(corpse.x, corpse.y)) {
                            target = corpse;
                            isRes = true;
                        }
                    }
                } else if (rp.targetType === 'UNIT' || rp.targetType === 'BUILDING') {
                    target = villagerMap.get(rp.targetId) || buildingMap.get(rp.targetId);
                }

                if (target && target.x !== undefined) {
                    if (worldView.left - 150 < target.x && worldView.right + 150 > target.x &&
                        worldView.top - 150 < target.y && worldView.bottom + 150 > target.y) {
                        const tId = target.id || (target.gx !== undefined ? `res_${target.gx}_${target.gy}` : rp.targetId);
                        activeTargets.set(tId + "_rally", {
                            entity: target,
                            fxType: 'target',
                            config: isRes ? cfgRes : cfgBld
                        });

                        // [新增] 如果集結目標是屍體，額外畫出橘色方框 (解決圖 1 遺漏問題)
                        if (rp.targetId && rp.targetId.startsWith('corpse_')) {
                            this.drawSingleSelectionBox(this.selectionGraphics, target, 0xff9800);
                        }
                    }
                }
            }
        });

        // 4. 滑鼠懸停對象 (Requirement 1 & 2)
        const hoveredId = state.hoveredId;
        if (hoveredId && !activeTargets.has(hoveredId + "_sel") && !activeTargets.has(hoveredId + "_const")) {
            const cfgHover = { ...cfgRes, glowAlpha: 0.2, glowOuterStrength: 5 };
            if (hoveredId && hoveredId.includes('_') && !hoveredId.startsWith('corpse_') && !hoveredId.startsWith('unit_')) {
                const parts = hoveredId.split('_');
                const gx = parseInt(parts[0]), gy = parseInt(parts[1]);
                const res = GameEngine.state.mapData.getResource(gx, gy);
                if (res && res.type !== 0) {
                    const rx = gx * TS + TS / 2, ry = gy * TS + TS / 2;
                    if (worldView.contains(rx, ry)) {
                        activeTargets.set(hoveredId + "_hover", { entity: { ...res, gx, gy }, fxType: 'sel', config: cfgHover });
                    }
                }
            } else {
                const ent = buildingMap.get(hoveredId);
                if (ent && worldView.contains(ent.x, ent.y)) {
                    activeTargets.set(hoveredId + "_hover", { entity: ent, fxType: 'sel', config: cfgHover });
                }
            }
        }

        // 5. 建立或更新所需的 FX Sprite
        activeTargets.forEach((info, fullId) => {
            const { entity, fxType, config } = info;
            let fxSprite = this.resourceFXMap.get(fullId);

            if (!fxSprite) {
                let textureKey;
                if (entity.gx !== undefined && typeof entity.type === 'number') {
                    textureKey = this.getTextureKeyFromType(entity.type);
                } else {
                    textureKey = this.getTextureKey(entity.type1);
                }

                if (!textureKey || !this.textures.exists(textureKey)) return;

                fxSprite = this.add.sprite(0, 0, textureKey);
                const baseDepth = (entity.y !== undefined) ? entity.y : (entity.gy !== undefined ? (entity.gy * TS + TS / 2) : 0);
                fxSprite.setDepth(500000 + baseDepth + 10); // 置於物體上方

                if (fxSprite.postFX) {
                    const colorStr = (fxType === 'target') ? (config.targetColor || config.glowColor) : config.glowColor;
                    let cleanColor = colorStr.replace('#', '');
                    if (cleanColor.length > 6) cleanColor = cleanColor.substring(0, 6);
                    const color = parseInt(cleanColor, 16);

                    // [效能關鍵] 極低品質描邊用於非選中目標，保持流暢度
                    const q = fxType === 'const' ? 2 : (config.glowQuality || 4);
                    const glow = fxSprite.postFX.addGlow(
                        color,
                        config.glowOuterStrength,
                        config.glowInnerStrength,
                        config.glowKnockOut !== undefined ? config.glowKnockOut : true,
                        config.glowAlpha,
                        q
                    );
                    fxSprite.setData('fx', glow);
                }

                this.resourceFXMap.set(fullId, fxSprite);
            }

            // 更新位置與縮放
            if (entity.gx !== undefined && typeof entity.type === 'number') {
                const typeMap = {
                    1: 'SCENE_WOOD',
                    2: 'SCENE_STONE',
                    3: 'SCENE_FRUIT',
                    4: 'SCENE_GOLD_MINE',
                    5: 'SCENE_IRON_MINE',
                    6: 'SCENE_COAL_MINE',
                    7: 'SCENE_MAGIC_HERB',
                    8: 'SCENE_WOLF_CORPSE',
                    9: 'SCENE_BEAR_CORPSE',
                    10: 'SCENE_CRYSTAL_MINE',
                    11: 'SCENE_COPPER_MINE',
                    12: 'SCENE_SILVER_MINE',
                    13: 'SCENE_MITHRIL_MINE'
                };
                const resCfg = GameEngine.state.resourceConfigs.find(c => c.type === typeMap[entity.type] && c.lv === (entity.level || 1));
                const idx = GameEngine.state.mapData.getIndex(entity.gx, entity.gy);
                const varInfo = idx !== -1 ? GameEngine.state.mapData.variationGrid[idx] : 0xFFFFFF;
                const vScale = ((varInfo >> 24) & 0xFF) / 100 || 1.0;

                fxSprite.x = entity.gx * TS + TS / 2;
                fxSprite.y = entity.gy * TS + TS / 2;
                if (resCfg && resCfg.model_size) {
                    const s = config.selectionScale || 1.1;
                    fxSprite.setScale(resCfg.model_size.x * vScale * s, resCfg.model_size.y * vScale * s);
                }
            } else {
                fxSprite.x = entity.x;
                fxSprite.y = entity.y;
                const cfg = GameEngine.getEntityConfig(entity.type1);
                if (cfg && cfg.model_size) {
                    let sx = 0.6, sy = 0.6;
                    if (typeof cfg.model_size === 'string') {
                        const m = cfg.model_size.match(/\{[ ]*([\d.]+)[ ]*[\*x][ ]*([\d.]+)[ ]*\}/);
                        if (m) { sx = parseFloat(m[1]); sy = parseFloat(m[2]); }
                    } else if (cfg.model_size.x) { sx = cfg.model_size.x; sy = cfg.model_size.y; }

                    const finalSx = sx * (entity.vScaleX || 1) * (config.selectionScale || 1);
                    const finalSy = sy * (entity.vScaleY || 1) * (config.selectionScale || 1);
                    fxSprite.setScale(finalSx, finalSy);
                }
                if (entity.vTint !== undefined) fxSprite.setTint(entity.vTint);
            }
            fxSprite.setVisible(true);
        });

        // 4. 清理不再需要的 FX Sprite
        for (const [fid, sprite] of this.resourceFXMap.entries()) {
            if (!activeTargets.has(fid)) {
                sprite.destroy();
                this.resourceFXMap.delete(fid);
            }
        }
    }

    getTextureKeyFromType(typeNum) {
        const typeMap = {
            1: 'tex_tree', 2: 'tex_stone', 3: 'tex_food', 4: 'tex_gold_mine',
            5: 'tex_iron_mine', 6: 'tex_coal_mine', 7: 'tex_magic_herb',
            8: 'tex_wolf_corpse', 9: 'tex_bear_corpse',
            10: 'tex_crystal_mine', 11: 'tex_copper_mine', 12: 'tex_silver_mine', 13: 'tex_mithril_mine'
        };
        return typeMap[typeNum] || 'tex_tree';
    }

    drawResourceOutline(g, gx, gy, color) {
        // 此方法已由 updateResourceFX 取代，為保持兼容性保留空函式或轉移邏輯
    }

    drawSingleSelectionBox(g, ent, color) {
        const TS = GameEngine.TILE_SIZE;
        const cfg = GameEngine.getEntityConfig(ent.type1);
        if (!cfg && ent.type1 !== 'corpse') return; // [修正] 支援屍體等無配置實體

        let uw = 1, uh = 1;
        if (ent.type1 === 'corpse') {
            const rCfg = UI_CONFIG.ResourceSelection || {};
            const cScale = rCfg.corpseSelectionScale || 0.8;
            uw = cScale; uh = cScale;
        } else if (cfg && cfg.size) {
            const cleanSize = cfg.size.toString().replace(/['"]/g, '');
            const match = cleanSize.match(/\{[ ]*([\d.]+)[ ]*,[ ]*([\d.]+)[ ]*\}/);
            if (match) { uw = parseFloat(match[1]); uh = parseFloat(match[2]); }
        }

        const w = uw * TS;
        const h = uh * TS;

        g.lineStyle(4, color, 1);
        if (ent.type1 === 'corpse') {
            // [需求修正] 屍體改用圓形選取框，與 NPC 保持一致
            const radius = Math.max(w, h) / 2 + 2;
            g.strokeCircle(ent.x, ent.y, radius);
            // 內圈裝飾
            g.lineStyle(2, 0xffffff, 0.4);
            g.strokeCircle(ent.x, ent.y, radius - 4);
        } else {
            // [層級優化] 增加外框邊距，確保選取框在地表層級時仍能從建築邊緣露出
            g.strokeRect(ent.x - w / 2 - 4, ent.y - h / 2 - 4, w + 8, h + 8);
            g.lineStyle(2, 0xffffff, 0.8);
            g.strokeRect(ent.x - w / 2 - 2, ent.y - h / 2 - 2, w + 4, h + 4);
        }
    }

    /**
     * 加入新的點擊反饋效果
     */
    addClickEffect(x, y, type = 'ground') {
        this.clickEffects.push({
            x, y,
            type,
            startTime: Date.now(),
            duration: UI_CONFIG.PathfindingTarget.clickEffectDuration || 500
        });
    }

    /**
     * 繪製尋路目標指示器（選中單位的目標 & 點擊反饋）
     */
    drawPathfindingIndicators() {
        const g = this.targetGraphics;
        g.clear();

        // 1. 拖動畫面時不顯示目標提示
        if (this.isDragging) return;

        const cfg = UI_CONFIG.PathfindingTarget;
        if (!cfg) return;
        const now = Date.now();

        // 1. 處理點擊反饋 (透明度漸變)
        this.clickEffects = this.clickEffects.filter(eff => {
            const progress = (now - eff.startTime) / eff.duration;
            if (progress >= 1) return false;

            const alpha = (1 - progress) * (cfg.alpha || 0.7);
            this.drawTargetIndicator(g, eff.x, eff.y, eff.type, alpha, now);
            return true;
        });

        // 2. 處理選中單位的持久目標
        const selectedIds = GameEngine.state.selectedUnitIds || [];
        if (selectedIds.length > 0) {
            // [優化] 直接重用 updateResourceFX 已建好的快速索引
            const villagerMap = this._villagerMap || new Map();
            if (villagerMap.size === 0 && GameEngine.state.units.villagers) {
                GameEngine.state.units.villagers.forEach(v => villagerMap.set(v.id, v));
            }

            const drawnPos = new Set();
            selectedIds.forEach(id => {
                const u = villagerMap.get(id);
                if (!u) return;

                // 2. 敵人的目標點不顯示
                const isEnemy = (u.config && u.config.camp === 'enemy') || u.camp === 'enemy';
                if (isEnemy) return;

                const targetPoint = u.commandCenter || u.idleTarget;
                if (targetPoint && u.state === 'IDLE' && u.isPlayerLocked && !u._isRallyMovement) {
                    const dist = Math.hypot(u.x - targetPoint.x, u.y - targetPoint.y);
                    if (dist > 15) {
                        const key = `ground_${Math.floor(targetPoint.x)}_${Math.floor(targetPoint.y)}`;
                        if (!drawnPos.has(key)) {
                            this.drawTargetIndicator(g, targetPoint.x, targetPoint.y, 'ground', cfg.alpha || 0.7, now);
                            drawnPos.add(key);
                        }
                    } else {
                        u.commandCenter = null;
                    }
                }
            });
        }
    }

    /**
     * 繪製單個指示器 (選取框 or 光圈)
     */
    drawTargetIndicator(g, x, y, type, alpha, time) {
        const cfg = UI_CONFIG.PathfindingTarget;
        const parseColor = (c) => {
            if (typeof c !== 'string') return c;
            let raw = c.replace('#', '');
            if (raw.length === 8) raw = raw.substring(0, 6);
            return parseInt(raw, 16);
        };

        if (type === 'enemy') {
            const color = parseColor(cfg.enemyColor || "#ff4444");
            const pulse = (Math.sin(time * (cfg.pulseSpeed || 0.01)) + 1) / 2; // 0 ~ 1
            const r = (cfg.circleMinRadius || 18) + ((cfg.circleMaxRadius || 26) - (cfg.circleMinRadius || 18)) * pulse;

            g.lineStyle(3, color, alpha);
            g.strokeCircle(x, y, r);
            g.fillStyle(color, alpha * 0.3);
            g.fillCircle(x, y, r * 0.6);
        } else {
            // 地板/建築光圈
            const color = parseColor(cfg.floorColor || "#00e5ff");
            const pulse = (Math.sin(time * (cfg.pulseSpeed || 0.01)) + 1) / 2; // 0 ~ 1
            const r = (cfg.circleMinRadius || 6) + ((cfg.circleMaxRadius || 14) - (cfg.circleMinRadius || 6)) * pulse;

            g.lineStyle(2, color, alpha);
            g.strokeCircle(x, y, r);
            g.fillStyle(color, alpha * 0.3);
            g.fillCircle(x, y, r * 0.6);
        }
    }


    drawMarquee(start, end) {
        const g = this.marqueeGraphics;
        g.clear();

        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(start.x - end.x);
        const h = Math.abs(start.y - end.y);

        const cfg = UI_CONFIG.SelectionMarquee || {
            fillColor: "#00ff00", fillAlpha: 0.15,
            borderColor: "#00ff00", borderAlpha: 0.8, borderWidth: 1.5
        };

        const fill = this.hexOrRgba(cfg.fillColor);
        const border = this.hexOrRgba(cfg.borderColor);

        // 框框本體
        g.fillStyle(fill.color, cfg.fillAlpha !== undefined ? cfg.fillAlpha : fill.alpha);
        g.fillRect(x, y, w, h);

        // 框框輪廓
        g.lineStyle(cfg.borderWidth || 1.5, border.color, cfg.borderAlpha !== undefined ? cfg.borderAlpha : border.alpha);
        g.strokeRect(x, y, w, h);
    }

    updateEntities(visibleEntities, allEntities) {
        if (!visibleEntities) return;

        const visibleIds = new Set();
        const MAX_NEW_PER_FRAME = 20;
        let newlyCreatedCount = 0;

        // 1. 處理可見實體 (此處現僅包含 建築物 與 單個實體化資源)
        for (let i = 0; i < visibleEntities.length; i++) {
            const ent = visibleEntities[i];
            const id = ent.id;
            const type1 = ent.type1 || ent.type; // [核心相容] 支援新舊屬性命名
            visibleIds.add(id);

            let displayObj = this.entities.get(id);

            if (!displayObj) {
                if (newlyCreatedCount >= MAX_NEW_PER_FRAME) {
                    this.pendingVisibleEntities = true;
                    continue;
                }

                const textureKey = this.getTextureKey(type1);
                if (textureKey && this.textures.exists(textureKey)) {
                    displayObj = this.add.image(ent.x, ent.y, textureKey);
                    this.entities.set(id, displayObj);
                    this.entityGroup.add(displayObj);
                    displayObj.setDepth(500000 + ent.y); // Requirement 3: Y-axis sorting + Huge Offset
                } else {
                    displayObj = this.add.graphics();
                    this.drawEntity(displayObj, ent, 1.0);
                    this.entities.set(id, displayObj);
                    this.entityGroup.add(displayObj);
                    displayObj.setDepth(500000 + ent.y); // Requirement 3: Y-axis sorting + Huge Offset
                }
                newlyCreatedCount++;
            }

            if (displayObj) {
                if (!displayObj.visible) displayObj.setVisible(true);
                if (displayObj.x !== ent.x || displayObj.y !== ent.y) displayObj.setPosition(ent.x, ent.y);

                if (displayObj instanceof Phaser.GameObjects.Image) {
                    const targetAlpha = ent.isUnderConstruction ? 0.6 : 1.0;
                    if (displayObj.alpha !== targetAlpha) displayObj.setAlpha(targetAlpha);

                    const cfg = GameEngine.getEntityConfig(type1);
                    if (cfg && cfg.model_size) {
                        let sx = 0.6, sy = 0.6;
                        if (typeof cfg.model_size === 'string') {
                            const m = cfg.model_size.match(/\{[ ]*([\d.]+)[ ]*[\*x][ ]*([\d.]+)[ ]*\}/);
                            if (m) { sx = parseFloat(m[1]); sy = parseFloat(m[2]); }
                        } else if (cfg.model_size.x) { sx = cfg.model_size.x; sy = cfg.model_size.y; }

                        const finalSx = sx * (ent.vScaleX || 1);
                        const finalSy = sy * (ent.vScaleY || 1);
                        if (displayObj.scaleX !== finalSx || displayObj.scaleY !== finalSy) displayObj.setScale(finalSx, finalSy);
                    }
                    if (ent.vTint !== undefined && displayObj.tintTopLeft !== ent.vTint) displayObj.setTint(ent.vTint);
                }
            }

            this.updateEntityLabel(id, ent);
            this.handleWorkingEffects(id, ent, true);
            if (type1 === 'campfire' && !ent.isUnderConstruction) {
                this.handleCampfireParticles(id, ent, true);
            }
        }

        if (newlyCreatedCount < MAX_NEW_PER_FRAME) this.pendingVisibleEntities = false;

        // 2. 清理不可見實體 (隱藏與回收)
        for (const [id, displayObj] of this.entities.entries()) {
            if (!visibleIds.has(id)) {
                if (displayObj.visible) {
                    displayObj.setVisible(false);
                    this.hideEntityLabel(id);
                    // 隱藏所有相關的 Emitter
                    for (const [eid, emitter] of this.emitters.entries()) {
                        if (eid.startsWith(id)) emitter.setVisible(false);
                    }
                }
                // 超出生命週期則銷毀 (如動態產生的特效)
                if (!allEntities.some(e => e.id === id) && id.startsWith('effect_')) {
                    displayObj.destroy();
                    this.entities.delete(id);
                }
            }
        }
    }

    /**
     * 大地圖資源渲染優化 (遵照 [大地圖渲染與數據分離協議])
     * 使用 Blitter 與 Bob Pool 實現高效渲染與 Viewport Culling
     */
    updateResources(mapData, scrollX, scrollY, width, height) {
        const TS = GameEngine.TILE_SIZE;
        const resources = mapData.getVisibleResources(scrollX, scrollY, width, height, TS);
        const visibleKeys = new Set();

        // 核心映射
        const typeMap = {
            1: 'tree', 2: 'stone', 3: 'food', 4: 'gold_mine',
            5: 'iron_mine', 6: 'coal_mine', 7: 'magic_herb',
            8: 'wolf_corpse', 9: 'bear_corpse',
            10: 'crystal_mine', 11: 'copper_mine', 12: 'silver_mine', 13: 'mithril_mine'
        };
        const typeNameMap = {
            1: 'SCENE_WOOD',
            2: 'SCENE_STONE',
            3: 'SCENE_FRUIT',
            4: 'SCENE_GOLD_MINE',
            5: 'SCENE_IRON_MINE',
            6: 'SCENE_COAL_MINE',
            7: 'SCENE_MAGIC_HERB',
            8: 'SCENE_WOLF_CORPSE',
            9: 'SCENE_BEAR_CORPSE',
            10: 'SCENE_CRYSTAL_MINE',
            11: 'SCENE_COPPER_MINE',
            12: 'SCENE_SILVER_MINE',
            13: 'SCENE_MITHRIL_MINE'
        };

        // 1. 放置/更新資源
        for (let i = 0; i < resources.length; i++) {
            const res = resources[i];
            const key = `${res.gx}_${res.gy}`;
            visibleKeys.add(key);

            let bobInfo = this.resourceBobs.get(key);
            const typeStr = typeMap[res.type] || 'tree';

            // 獲取等級與配置
            const typeName = typeNameMap[res.type];
            const resCfg = GameEngine.state.resourceConfigs.find(c => c.type === typeName && c.lv === (res.level || 1));
            const baseMS = (resCfg && resCfg.model_size) ? resCfg.model_size : { x: 1, y: 1 };

            // 讀取變量網格中的 Tint 與 隨機縮放偏移 (8-bit scale index + 24-bit tint)
            const idx = mapData.getIndex(res.gx, res.gy);
            const varInfo = idx !== -1 ? mapData.variationGrid[idx] : 0xFFFFFF;
            const vTint = varInfo & 0xFFFFFF;
            const vScale = ((varInfo >> 24) & 0xFF) / 100 || 1.0;

            const finalScaleX = baseMS.x * vScale;
            const finalScaleY = baseMS.y * vScale;

            // 若類型或等級變動 (或模型發生不可評估變化)，回收舊物件
            if (bobInfo && (bobInfo.type !== typeStr || bobInfo.lv !== res.level)) {
                this.returnBobToPool(bobInfo.type, bobInfo.bob);
                this.resourceBobs.delete(key);
                bobInfo = null;
            }

            if (!bobInfo) {
                const img = this.getBobFromPool(typeStr);
                if (img) {
                    // [核心修正] Phaser Image 支援 setScale 實現不同等級的模型縮放 (model_size) 與 隨機變形 (visualVariation)
                    img.setScale(finalScaleX, finalScaleY);

                    // Image 預設 Origin(0.5, 0.5)，直接對齊格網中心
                    img.setPosition(res.gx * TS + TS / 2, res.gy * TS + TS / 2);
                    img.setTint(vTint);
                    img.setVisible(true);
                    img.setDepth(500000 + res.gy * TS + TS / 2); // Requirement 3: Y-axis sorting + Huge Offset

                    bobInfo = { type: typeStr, lv: res.level, bob: img };
                    this.resourceBobs.set(key, bobInfo);
                }
            } else {
                // 如果已存在但座標發生變化 (雖然地圖一般靜態，仍予以此防護)
                const img = bobInfo.bob;
                const tx = res.gx * TS + TS / 2, ty = res.gy * TS + TS / 2;
                if (img.x !== tx || img.y !== ty) img.setPosition(tx, ty);
            }

            // 更新資源標籤
            const dummyEnt = {
                id: key,
                x: res.gx * TS + TS / 2,
                y: res.gy * TS + TS / 2,
                type: typeStr,
                name: resCfg ? resCfg.name : typeStr,
                amount: res.amount,
                level: res.level
            };
            this.updateEntityLabel(key, dummyEnt);
        }

        // 2. 回收離開畫面的 物件 與標籤
        for (const [key, info] of this.resourceBobs.entries()) {
            if (!visibleKeys.has(key)) {
                this.returnBobToPool(info.type, info.bob);
                this.resourceBobs.delete(key);
                this.hideEntityLabel(key);
            }
        }
    }

    getBobFromPool(type) {
        const pool = this.resourcePools[type];
        if (pool && pool.length > 0) {
            return pool.pop();
        }
        // 若池中無對象，新創一個 Image (資源貼圖皆以 tex_ 為前綴)
        const img = this.add.image(0, 0, `tex_${type}`);
        img.setDepth(500000);
        this.resourceGroup.add(img);
        return img;
    }

    returnBobToPool(type, bob) {
        bob.setVisible(false);
        if (this.resourcePools[type]) {
            this.resourcePools[type].push(bob);
        }
    }

    cleanupEntityLabels(id) {
        // [修正] 為了支援多個 Emitter (如 smoke, sparks)，改為遍歷 Map 並匹配 ID 前綴
        for (const [eid, emitter] of this.emitters.entries()) {
            if (eid.startsWith(id)) {
                emitter.destroy();
                this.emitters.delete(eid);
            }
        }

        const labels = [this.queueTexts, this.nameLabels, this.levelLabels, this.resourceLabels, this.unitIconTexts, this.occupancyHuds];
        labels.forEach(map => {
            if (map.has(id)) {
                map.get(id).destroy();
                map.delete(id);
            }
        });
    }

    /**
     * [核心特效] 處理加工廠運作時的粒子效果 (煙霧、火花)
     */
    handleWorkingEffects(id, ent, isVisible) {
        // [核心修復] 必須同時具備配方且處於「活動生產」狀態才顯示特效
        // isCraftingActive 由 SynthesisSystem 根據材料與工人充足情況更新
        const isWorking = !!ent.currentRecipe && !!ent.isCraftingActive && !ent.isUnderConstruction;
        const type1 = ent.type1 || ent.type;

        // 特效即時開關
        const showEffect = isVisible && isWorking;

        if (showEffect || this.emitters.has(`${id}_smoke`)) {
            this.handleEmitter(`${id}_smoke`, ent, showEffect, 'smoke');
        }

        if (type1 === 'smelting_plant') {
            this.handleEmitter(`${id}_sparks`, ent, showEffect, 'sparks');
        }
    }

    /**
     * 營火粒子效果處理 (複用通用 Emitter 邏輯)
     */
    handleCampfireParticles(id, ent, isVisible) {
        this.handleEmitter(`${id}_fire`, ent, isVisible, 'campfire');
    }

    /**
     * 通用粒子發射器管理器 (EventEmitter Pool)
     */
    handleEmitter(eid, ent, isVisible, presetType) {
        let emitter = this.emitters.get(eid);
        if (!emitter) {
            let cfg;
            if (presetType === 'campfire') {
                cfg = UI_CONFIG.ResourceRenderer.Campfire.particle;
            } else {
                cfg = UI_CONFIG.WorkingEffects[presetType];
            }
            if (!cfg) return;

            // 顏色處理：兼容 tint, tints 以及 color
            const rawTint = cfg.tint || cfg.tints || cfg.color || cfg.colors;
            const tintVal = Array.isArray(rawTint)
                ? rawTint.map(t => this.hexOrRgba(t).color)
                : this.hexOrRgba(rawTint || "#ffffff").color;

            const emitterConfig = {
                lifespan: cfg.lifespan,
                speedY: cfg.speedY || 0,
                speed: cfg.speed || 0,
                scale: cfg.scale,
                alpha: cfg.alpha,
                tint: tintVal,
                blendMode: cfg.blendMode || 'NORMAL',
                frequency: cfg.frequency,
                gravityY: cfg.gravityY || 0,
                x: { min: -cfg.spreadX, max: cfg.spreadX },
                y: { min: (cfg.offsetY || 0) - 5, max: (cfg.offsetY || 0) + 5 }
            };

            // 如果是 sparks 類型，額外調整噴發角度 (固定屬性)
            if (presetType === 'sparks') {
                emitterConfig.angle = { min: -120, max: -60 }; // 向上噴濺
            }

            emitter = this.add.particles(ent.x, ent.y, 'fire_particle', emitterConfig);
            emitter.setDepth(500000 + ent.y + 10);
            this.emitters.set(eid, emitter);
        }

        if (emitter.x !== ent.x || emitter.y !== ent.y) emitter.setPosition(ent.x, ent.y);

        // [核心修正] 即時開關邏輯
        if (emitter.visible !== isVisible) {
            emitter.setVisible(isVisible);
            if (isVisible) {
                // 確保發射器處於運行狀態並立即噴發
                if (!emitter.emitting) emitter.start();
                emitter.emitParticle(8);
            } else {
                // 隱藏時停止發射
                if (emitter.emitting) emitter.stop();
            }
        }
    }

    updateEntityLabel(id, ent) {
        const resCfg = UI_CONFIG.MapResourceLabels;
        const bldCfg = UI_CONFIG.MapBuildingLabels; // 使用專屬建築標籤配置
        const config = GameEngine.state.buildingConfigs[ent.type1];
        const isBuilding = !!config;

        // 建築標籤恆顯示，資源標籤依據設定開關
        const showLabels = isBuilding ? true : GameEngine.state.settings.showResourceInfo;
        const cfg = isBuilding ? bldCfg : resCfg; // 根據類型切換配置來源

        if (!this._cachedLabelValues) this._cachedLabelValues = new Map();
        let cache = this._cachedLabelValues.get(id);
        if (!cache) {
            cache = { name: '', level: '', amount: -1, visible: false };
            this._cachedLabelValues.set(id, cache);
        }

        // 取得物件中心點
        const visualX = Math.round(ent.x);
        const visualY = Math.round(ent.y);

        // 解析建築物尺寸以計算標籤偏移
        const { uw, uh } = this.getFootprint(config);

        // 1. 名稱標籤 (Name)
        const nameStr = ent.isUnderConstruction ? "施工中" : (ent.name || (config ? config.name : ent.type));
        let nameTxt = this.nameLabels.get(id);
        if (!nameTxt && cfg.name) {
            nameTxt = this.add.text(visualX, visualY, nameStr, {
                font: cfg.name.fontSize || "12px Arial",
                fill: cfg.name.color || "#ffffff",
                align: 'center'
            }).setOrigin(0.5, 0.5);
            nameTxt.setStroke(this.hexToCssRgba(cfg.name.outlineColor || "#000000", cfg.name.outlineAlpha || 0.8), cfg.name.outlineWidth || 2);
            nameTxt.setDepth(1000000 + ent.y); // Stay on top
            this.nameLabels.set(id, nameTxt);
        }

        if (showLabels && nameTxt && cfg.name) {
            nameTxt.setVisible(true);
            const ox = cfg.name.offsetX || 0;
            const oy = cfg.name.offsetY || 0;

            // [還原] 尊重用戶在 ui_config.js 的原始偏移設置
            nameTxt.setPosition(visualX + ox, visualY + oy);

            if (cache.name !== nameStr) {
                nameTxt.setText(nameStr);
                cache.name = nameStr;
            }
        } else {
            nameTxt.setVisible(false);
        }

        // 2. 等級標籤 (Level)
        const currentLv = ent.lv || ent.level;
        // 修正：顯示所有帶有等級的物件，不再過濾 Lv.1
        const showLevel = showLabels && (isBuilding || currentLv !== undefined);
        let lvTxt = this.levelLabels.get(id);
        if (showLevel) {
            const lvStr = `Lv.${currentLv || 1}`;
            if (!lvTxt) {
                lvTxt = this.add.text(visualX, visualY, lvStr, {
                    font: cfg.level.fontSize,
                    fill: cfg.level.color,
                    align: 'center'
                }).setOrigin(0.5, 0.5);
                lvTxt.setStroke(this.hexToCssRgba(cfg.level.outlineColor, cfg.level.outlineAlpha), cfg.level.outlineWidth);
                lvTxt.setDepth(1000001 + ent.y); // Stay on top
                this.levelLabels.set(id, lvTxt);
            }
            lvTxt.setVisible(true);
            const lox = cfg.level.offsetX || 0;
            const loy = cfg.level.offsetY || 0;

            // [還原] 尊重用戶在 ui_config.js 的原始偏移設置
            lvTxt.setPosition(visualX + lox, visualY + loy);

            if (cache.level !== lvStr) {
                lvTxt.setText(lvStr);
                cache.level = lvStr;
            }
        } else if (lvTxt) {
            lvTxt.setVisible(false);
        }

        // 3. 數量標籤 (Amount) - 僅資源使用 MapResourceLabels.amount
        const isFarmlandType = ent.type === 'farmland' || ent.type === 'tree_plantation';
        if ((!isBuilding || isFarmlandType) && showLabels && ent.amount !== undefined && resCfg.amount) {
            let amtTxt = this.resourceLabels.get(id);
            const amtStr = `[${Math.floor(ent.amount)}]`;
            if (!amtTxt) {
                amtTxt = this.add.text(visualX, visualY, amtStr, {
                    font: resCfg.amount.fontSize || "12px Arial",
                    fill: resCfg.amount.color || "#ffffff",
                    align: 'center'
                }).setOrigin(0.5, 0.5);
                amtTxt.setStroke(this.hexToCssRgba(resCfg.amount.outlineColor || "#000000", resCfg.amount.outlineAlpha || 0.8), resCfg.amount.outlineWidth || 2);
                amtTxt.setDepth(999999 + ent.y); // Stay on top
                this.resourceLabels.set(id, amtTxt);
            }
            amtTxt.setVisible(true);
            const aox = resCfg.amount.offsetX || 0;
            let aoy = resCfg.amount.offsetY || 0;

            // [核心修復] 針對屍體類型資源，套用專屬偏移以避免遮擋模型
            if (ent.isCorpse && resCfg.amount.corpseOffsetY !== undefined) {
                aoy = resCfg.amount.corpseOffsetY;
            }

            amtTxt.setPosition(visualX + aox, visualY + aoy);
            if (cache.amount !== ent.amount) {
                amtTxt.setText(amtStr);
                cache.amount = ent.amount;
            }
        } else {
            const amtTxt = this.resourceLabels.get(id);
            if (amtTxt) amtTxt.setVisible(false);
        }

        this.updateFactoryProductIcon(id, ent, visualX, visualY, uw, uh, showLabels);
    }

    getResourceIconColor(type) {
        const key = String(type || '').toUpperCase();
        const cargoCfg = UI_CONFIG.CargoColors || {};
        const parse = (c, def = 0x795548) => {
            if (!c) return def;
            const clean = String(c).replace('#', '0x');
            const v = parseInt(clean.length > 8 ? clean.substring(0, 8) : clean);
            return isNaN(v) ? def : v;
        };

        if (key.includes('WOOD') || key.includes('PLANK')) return parse(cargoCfg.WOOD, 0x1ce026);
        if (key.includes('STONE') || key.includes('SLATE') || key.includes('ROCK')) return parse(cargoCfg.STONE, 0xacacac);
        if (key.includes('FOOD') || key.includes('FRUIT') || key.includes('MEAT') || key.includes('WHEAT') || key.includes('RICE')) return parse(cargoCfg.FOOD || cargoCfg.FRUIT, 0xff5816);
        if (key.includes('GOLD')) return parse(cargoCfg.GOLD_ORE, 0xffe047);
        if (key.includes('IRON') || key.includes('STEEL')) return parse(cargoCfg.IRON_ORE, 0x90a4ae);
        if (key.includes('COAL')) return parse(cargoCfg.COAL, 0x212121);
        if (key.includes('CRYSTAL') || key.includes('GLASS')) return 0x8de9ff;
        if (key.includes('COPPER')) return 0xc87533;
        if (key.includes('SILVER')) return 0xcfd8dc;
        if (key.includes('LEATHER') || key.includes('HIDE') || key.includes('PELT')) return 0x8d6e63;
        return parse(cargoCfg.DEFAULT, 0xad9191);
    }

    updateFactoryProductIcon(id, ent, visualX, visualY, uw, uh, showLabels) {
        let badge = this.productIconBadges.get(id);
        const cfg = GameEngine.getEntityConfig(ent.type1, ent.lv || 1);
        const hasLogisticsLine = ent.outputTargets && ent.outputTargets.length > 0;
        const recipeType = ent.currentRecipe && ent.currentRecipe.type;
        const shouldShow = showLabels && cfg && cfg.type2 === 'processing_plant' && hasLogisticsLine && recipeType && !ent.isUnderConstruction;

        if (!shouldShow) {
            if (badge) badge.setVisible(false);
            return;
        }

        if (!badge) {
            badge = this.add.graphics();
            this.productIconBadges.set(id, badge);
        }

        const size = 16;
        const x = Math.round(visualX - (uw * GameEngine.TILE_SIZE) / 2 + 6);
        const y = Math.round(visualY - (uh * GameEngine.TILE_SIZE) / 2 + 6);
        const color = this.getResourceIconColor(recipeType);

        badge.clear();
        badge.setVisible(true);
        badge.setDepth(1000002 + ent.y);
        badge.fillStyle(0x101010, 0.75);
        badge.fillRect(x - 2, y - 2, size + 4, size + 4);
        badge.lineStyle(1, 0xffffff, 0.7);
        badge.strokeRect(x - 2, y - 2, size + 4, size + 4);
        CharacterRenderer.drawItemIcon(badge, x, y, size, recipeType, color);
    }

    hideEntityLabel(id) {
        const labels = [this.nameLabels, this.levelLabels, this.resourceLabels, this.queueTexts, this.occupancyHuds];
        labels.forEach(map => {
            if (map.has(id)) {
                const obj = map.get(id);
                if (obj.visible) obj.setVisible(false);
            }
        });
    }

    getTextureKey(type1) {
        if (!type1) return null;
        // 精確匹配建築類型（必須在前綴匹配之前，避免 stone_factory 被誤判為石頭資源）
        const mapping = {
            'village': 'tex_village',
            'town_center': 'tex_town_center',
            'farmhouse': 'tex_farmhouse',
            'timber_factory': 'tex_timber_factory',
            'stone_factory': 'tex_stone_factory',
            'barn': 'tex_barn',
            'gold_mining_factory': 'tex_gold_mining_factory',
            'farmland': 'tex_farmland',
            'tree_plantation': 'tex_tree_plantation',
            'mage_place': 'tex_mage_place',
            'swordsman_place': 'tex_swordsman_place',
            'archer_place': 'tex_archer_place',
            'campfire': 'tex_campfire',
            'timber_processing_plant': 'tex_timber_processing_plant',
            'smelting_plant': 'tex_smelting_plant',
            'stone_processing_plant': 'tex_stone_processing_plant',
            'tank_workshop': 'tex_tank_workshop',
            'storehouse': 'tex_storehouse'
        };

        if (!type1) return null;
        if (mapping[type1]) return mapping[type1];

        // 前綴匹配資源類型（僅對非建築的自然資源）
        if (type1.startsWith('tree') || type1.startsWith('wood')) return 'tex_tree';
        if (type1.startsWith('stone')) return 'tex_stone';
        if (type1.startsWith('food')) return 'tex_food';
        if (type1.includes('gold')) return 'tex_gold_mine';
        if (type1.includes('iron')) return 'tex_iron_mine';
        if (type1.includes('coal')) return 'tex_coal_mine';
        if (type1.includes('herb')) return 'tex_magic_herb';
        if (type1.includes('crystal')) return 'tex_crystal_mine';
        if (type1.includes('copper')) return 'tex_copper_mine';
        if (type1.includes('silver')) return 'tex_silver_mine';
        if (type1.includes('mithril')) return 'tex_mithril_mine';
        if (type1.includes('wolf')) return 'tex_wolf_corpse';
        if (type1.includes('bear')) return 'tex_bear_corpse';

        return null;
    }

    drawEntity(g, ent, alpha, offX = 0, offY = 0) {
        const TS = GameEngine.TILE_SIZE;
        const type1 = ent.type1 || ent.type;
        const cfg = GameEngine.getEntityConfig(type1);
        const { uw, uh } = this.getFootprint(cfg);

        const isUnderConstruction = ent.isUnderConstruction === true || ent.isUnderConstruction === 1;
        const finalAlpha = isUnderConstruction ? (alpha * 0.5) : Math.max(alpha, 0.6);

        // 如果是預覽模式，加強視覺引導：外框與高透明度
        if (alpha < 1.0) {
            const previewColor = ent.previewColor || 0x2196f3; // 預設藍色，若受阻則傳入紅色
            g.lineStyle(2, previewColor, 0.8);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        }


        if (type1 === 'village' || type1 === 'town_center') {
            g.fillStyle(0x8d6e63, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(1, 0x5d4037, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (type1 === 'farmhouse') {
            g.fillStyle(0xbcaaa4, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(1, 0x8d6e63, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);

            g.fillStyle(0x795548, finalAlpha);
            g.beginPath();
            g.moveTo(offX - (uw * TS) / 2 - 5, offY - (uh * TS) / 2);
            g.lineTo(offX, offY - (uh * TS) / 2 - 20);
            g.lineTo(offX + (uw * TS) / 2 + 5, offY - (uh * TS) / 2);
            g.fillPath();
        } else if (type1 === 'timber_factory') {
            g.fillStyle(0x388e3c, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x1b5e20, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (type1 === 'stone_factory' || type1 === 'quarry') {
            g.fillStyle(0x455a64, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x263238, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (type1 === 'barn') {
            g.fillStyle(0xa1887f, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x5d4037, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (type1 === 'gold_mining_factory') {
            g.fillStyle(0xfbc02d, finalAlpha); // 鮮亮的黃色
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xf57f17, finalAlpha); // 橘黃色輪廓
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            // 加點晶體裝飾感
            g.fillStyle(0xfff176, finalAlpha);
            g.fillCircle(offX, offY, 15);
        } else if (type1 === 'farmland') {
            g.fillStyle(0xdce775, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(1, 0xafb42b, finalAlpha);
            for (let i = -(uw / 2); i < uw / 2; i += 0.5) {
                g.lineBetween(offX + i * TS, offY - (uh * TS) / 2 + 5, offX + i * TS, offY + (uh * TS) / 2 - 5);
            }
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (type1 === 'tree_plantation') {
            g.fillStyle(0x1b5e20, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x0a3d0d, finalAlpha);
            const step = TS;
            for (let i = -(uw * TS) / 2 + 10; i < (uw * TS) / 2; i += step) {
                for (let j = -(uh * TS) / 2 + 10; j < (uh * TS) / 2; j += step) {
                    g.fillStyle(0x2e7d32, finalAlpha);
                    g.fillCircle(offX + i, offY + j, 8);
                }
            }
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (type1 === 'mage_place') {
            g.fillStyle(0x4a148c, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xe1f5fe, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.fillStyle(0xffd600, finalAlpha);
            g.fillCircle(offX, offY, 20);
        } else if (type1 === 'swordsman_place') {
            g.fillStyle(0x455a64, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xf44336, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.fillStyle(0xffccbc, finalAlpha);
            g.fillRect(offX - 10, offY - 10, 20, 20);
        } else if (type1 === 'archer_place') {
            g.fillStyle(0x795548, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xffeb3b, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xf44336, finalAlpha);
            g.strokeCircle(offX, offY, 15);
            g.strokeCircle(offX, offY, 5);
        } else if (type1 === 'corpse') {
            // [核心修正] 呼叫專屬角色渲染器繪製屍體，達成自訂外觀效果
            CharacterRenderer.renderCorpse(g, offX, offY, ent);
        } else if (type1 === 'campfire') {
            const cfg = UI_CONFIG.ResourceRenderer.Campfire;
            g.fillStyle(cfg.groundColor, finalAlpha);
            g.fillCircle(offX, offY, 20);
            g.fillStyle(cfg.woodColor, finalAlpha);
            g.lineStyle(2, cfg.woodOutline, finalAlpha);
            g.strokeRect(offX - 14, offY - 4, 30, 8);

            g.save();
            g.fillRect(offX - 4, offY - 14, 10, 30);
            g.strokeRect(offX - 4, offY - 14, 10, 30);

            g.fillStyle(cfg.woodColor, finalAlpha);
            g.fillRect(offX - 8, offY - 8, 16, 16);
            g.strokeRect(offX - 8, offY - 8, 16, 16);

            g.restore();
        } else if (type1 === 'timber_processing_plant') {
            // 工廠主體
            g.fillStyle(0x2e7d32, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x1b5e20, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            // 鋸齒屋頂 (Factory Style)
            g.fillStyle(0x1b5e20, finalAlpha);
            for (let i = 0; i < 3; i++) {
                g.beginPath();
                const sx = offX - (uw * TS) / 2 + (i * (uw * TS) / 3);
                g.moveTo(sx, offY - (uh * TS) / 2);
                g.lineTo(sx + (uw * TS) / 3, offY - (uh * TS) / 2);
                g.lineTo(sx, offY - (uh * TS) / 2 - 15);
                g.fillPath();
            }
        } else if (type1 === 'smelting_plant') {
            g.fillStyle(0x37474f, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x212121, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            // 煙囪細節
            g.fillStyle(0x212121, finalAlpha);
            g.fillRect(offX + (uw * TS) / 4, offY - (uh * TS) / 2 - 20, 10, 25);
            g.fillStyle(0xff7043, finalAlpha);
            g.fillCircle(offX - 5, offY, 10);
        } else if (type1 === 'stone_processing_plant') {
            g.fillStyle(0x607d8b, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x455a64, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            // 石磚裝飾
            g.lineStyle(1, 0xffffff, finalAlpha * 0.3);
            g.strokeRect(offX - 10, offY - 10, 20, 20);
        } else if (type1 === 'tank_workshop') {
            g.fillStyle(0x455a64, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x263238, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            // 重型屋頂
            g.fillStyle(0x263238, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2 - 10, uw * TS, 10);
            // 標誌
            g.lineStyle(2, 0xfbc02d, finalAlpha);
            g.strokeCircle(offX, offY, 12);
        } else if (type1 === 'storehouse') {
            // 倉庫外觀：深灰色基座，帶有箱子裝飾
            g.fillStyle(0x546e7a, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x263238, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);

            // 屋頂
            g.fillStyle(0x37474f, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2 - 2, offY - (uh * TS) / 2 - 5, uw * TS + 4, 10);

            // 箱子符號 (📦 簡化版)
            g.fillStyle(0xffa726, finalAlpha);
            g.fillRect(offX - 10, offY - 10, 20, 20);
            g.lineStyle(1, 0xe65100, finalAlpha);
            g.strokeRect(offX - 10, offY - 10, 20, 20);
            // 箱子蓋線
            g.lineBetween(offX - 10, offY, offX + 10, offY);
            g.lineBetween(offX, offY - 10, offX, offY);
        } else if (type1 && (type1.startsWith('tree') || type1.startsWith('wood'))) {
            g.fillStyle(0x2e7d32, finalAlpha);
            g.fillCircle(offX, offY, 20);
        } else if (type1 && type1.startsWith('stone')) {
            g.fillStyle(0x757575, finalAlpha);
            g.beginPath();
            g.moveTo(offX - 20, offY + 10);
            g.lineTo(offX, offY - 15);
            g.lineTo(offX + 25, offY + 15);
            g.fillPath();
        } else if (type1 && type1.startsWith('food')) {
            g.fillStyle(0xc2185b, finalAlpha);
            g.fillCircle(offX, offY, 18);
        }
    }

    /**
     * 繪製建築上方的工人派駐燈號
     */
    drawWorkerLights(g, ent, offX, offY, uw, uh, TS, alpha) {
        // 只有已完成的加工廠才顯示
        if (ent.isUnderConstruction) return;

        const cfg = UI_CONFIG.WorkerOccupancy || {
            lightWidth: 10, lightHeight: 5, spacing: 3, offsetY: -12,
            bgColor: "#212121", bgAlpha: 0.8, activeColor: "#76ff03", inactiveColor: "#424242"
        };

        // 使用引擎標準方法獲獲取建築配置
        const bCfg = GameEngine.getBuildingConfig(ent.type1, ent.lv || 1);
        if (!bCfg) return;

        const buildingId = ent.id || `${ent.type1}_${ent.x}_${ent.y}`;
        const assignedById = GameEngine.state.units && GameEngine.state.units.villagers
            ? GameEngine.state.units.villagers.filter(v => v.assignedWarehouseId === buildingId).length
            : 0;
        const current = Math.max(ent.assignedWorkers ? ent.assignedWorkers.length : 0, assignedById);
        const isLogisticsNode = bCfg.logistics && (bCfg.logistics.canInput || bCfg.logistics.canOutput);
        const baseCapacity = bCfg.need_villagers > 0 ? bCfg.need_villagers : (isLogisticsNode ? 5 : 0);
        const max = Math.max(1, baseCapacity, ent.targetWorkerCount || 0, current);
        if (max <= 0) return;

        let lw = cfg.lightWidth;
        const lh = cfg.lightHeight;
        let sp = cfg.spacing;
        const baseTotalW = (lw + sp) * max - sp;
        const maxAllowedW = Math.max(18, uw * TS * 0.86);
        if (baseTotalW > maxAllowedW) {
            const scale = maxAllowedW / baseTotalW;
            lw = Math.max(4, Math.floor(lw * scale));
            sp = Math.max(1, Math.floor(sp * scale));
        }
        const totalW = (lw + sp) * max - sp;

        // 背景深色底座
        const bg = this.hexOrRgba(cfg.bgColor);
        const padding = cfg.basePadding || 2;
        const startX = offX - totalW / 2;
        const bottomInset = cfg.bottomInset !== undefined ? cfg.bottomInset : 8;
        const startY = offY + (uh * TS) / 2 - lh - padding - bottomInset;
        g.fillStyle(bg.color, alpha * (cfg.bgAlpha || 0.8));
        g.fillRect(startX - padding, startY - padding, totalW + padding * 2, lh + padding * 2);

        for (let i = 0; i < max; i++) {
            const lx = startX + i * (lw + sp);
            const isOn = i < current;

            // 底座/空格 (黑色)
            g.fillStyle(this.hexOrRgba(cfg.inactiveColor).color, alpha);
            g.fillRect(lx, startY, lw, lh);

            if (isOn) {
                // 亮燈 (亮綠色)
                const active = this.hexOrRgba(cfg.activeColor);
                g.fillStyle(active.color, alpha);
                g.fillRect(lx, startY, lw, lh);

                // 增加發光質感
                g.fillStyle(0xffffff, alpha * 0.5);
                g.fillRect(lx, startY, lw, 1.5);

                // 外發光
                const glow = this.hexOrRgba(cfg.glowColor || "#b2ff59");
                g.lineStyle(1, glow.color, alpha * (cfg.glowAlpha || 0.6));
                g.strokeRect(lx - 0.5, startY - 0.5, lw + 1, lh + 1);
            }
        }
    }

    drawBuildProgressBar(g, ent, uw, uh, TS) {
        const cfg = UI_CONFIG.BuildingProgressBar;
        const progress = ent.buildProgress / (ent.buildTime || 1);

        const overrides = cfg.overrides && cfg.overrides[ent.type1] ? cfg.overrides[ent.type1] : {};
        const widthScale = overrides.widthScale !== undefined ? overrides.widthScale : (cfg.widthScale || 1.1);
        const bh = overrides.height !== undefined ? overrides.height : (cfg.height || 10);
        const bw = (uw * TS) * widthScale;
        const bx = ent.x - bw / 2;

        // 計算垂直位置 (對齊邏輯)
        const align = overrides.align || cfg.align || "bottom";
        const offsetY = overrides.offsetY !== undefined ? overrides.offsetY : (cfg.offsetY || 0);
        let by = 0;
        switch (align) {
            case "top":
                by = ent.y - (uh * TS) / 2 + offsetY;
                break;
            case "center":
                by = ent.y - bh / 2 + offsetY;
                break;
            case "bottom":
            default:
                by = ent.y + (uh * TS) / 2 - bh + offsetY;
                break;
        }

        const bgColor = this.hexOrRgba(cfg.bgColor);
        g.fillStyle(bgColor.color, cfg.bgAlpha || bgColor.alpha);
        g.fillRect(bx, by, bw, bh);

        const fillColor = this.hexOrRgba(cfg.fillColor);
        g.fillStyle(fillColor.color, fillColor.alpha);
        g.fillRect(bx, by, bw * Math.max(0, Math.min(1, progress)), bh);

        const outlineColor = this.hexOrRgba(cfg.outlineColor);
        g.lineStyle(1, outlineColor.color, outlineColor.alpha);
        g.strokeRect(bx, by, bw, bh);
    }

    getFootprint(cfg) {
        let uw = 1, uh = 1;
        if (cfg && cfg.size) {
            const clean = cfg.size.toString().replace(/['"]/g, '');
            const m = clean.match(/\{[ ]*([\d.]+)[ ]*,[ ]*([\d.]+)[ ]*\}/);
            if (m) {
                uw = parseFloat(m[1]);
                uh = parseFloat(m[2]);
            }
        }
        return { uw, uh };
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

        // 讀取此建築自己的隊列
        const queue = ent.queue || [];
        const timer = ent.productionTimer || 0;

        if (queue.length === 0) {
            if (this.queueTexts.has(id)) this.queueTexts.get(id).setVisible(false);
            if (this.unitIconTexts.has(id)) this.unitIconTexts.get(id).setVisible(false);
            return;
        }

        const cfg = UI_CONFIG.ProductionHUD;
        const maxPop = GameEngine.getMaxPopulation();
        const currentPop = GameEngine.getCurrentPopulation();

        // [視覺同步] 判斷當前首位單位是否能產出
        const currentUnitId = queue[0];
        const unitName = GameEngine.state.idToNameMap[currentUnitId] || currentUnitId;
        const nextCfg = GameEngine.state.npcConfigs[unitName] || GameEngine.state.npcConfigs[currentUnitId];
        const unitPop = nextCfg ? (nextCfg.population || 1) : 1;
        const canSpawn = (currentPop + unitPop) <= maxPop;

        const progress = 1.0 - (timer / 5);

        // 智慧型對齊：計算整體 HUD 寬度並居中
        const iconReserved = 30;
        const barWidth = Math.max(50, (uw * TS) * 0.6);
        const totalHudWidth = iconReserved + 15 + barWidth; // 圖示 + 間距 + 進度條

        const bx = ent.x - totalHudWidth / 2;
        const by = ent.y + (uh * TS) / 2 - 35; // 稍微往上提一點，避免被底部邊緣切掉

        // 1. 繪製進度條背景
        g.fillStyle(parseInt(cfg.barBg.replace('#', ''), 16), cfg.barAlpha || 0.7);
        g.fillRect(bx + iconReserved + 5, by + 12, barWidth, 10);

        // 2. 繪製進度內容 (若產出受阻則顯示紅色)
        const fillColor = !canSpawn ? 0xf44336 : 0x4caf50;
        g.fillStyle(fillColor, 1);
        g.fillRect(bx + iconReserved + 5, by + 12, barWidth * Math.max(0, Math.min(1, progress)), 10);

        // 3. 繪製底座圖示圓圈
        g.fillStyle(0x311b92, 0.8);
        g.fillCircle(bx + 15, by + 17, 15);

        // 4. 更新單位圖示 (Emoji)
        const iconMap = {
            'villagers': '👤', 'female villagers': '👩', 'mage': '🧙', 'swordsman': '⚔️', 'archer': '🏹',
            '1': '👤', '2': '👩', '3': '⚔️', '4': '🧙', '5': '🏹'
        };
        const emoji = iconMap[currentUnitId] || iconMap[unitName] || '👤';

        let iconTxt = this.unitIconTexts.get(id);
        if (!iconTxt) {
            iconTxt = this.add.text(bx + 15, by + 17, emoji, { fontSize: '18px' }).setOrigin(0.5);
            iconTxt.setDepth(1500000);
            this.unitIconTexts.set(id, iconTxt);
        }
        if (iconTxt.text !== emoji) iconTxt.setText(emoji);
        iconTxt.setPosition(bx + 15, by + 17);
        iconTxt.setVisible(true);

        // 5. 更新隊列數量角標 (紅色圓圈)
        g.fillStyle(0xc62828, 1);
        g.fillCircle(bx + 30, by + 7, 8);

        let qTxt = this.queueTexts.get(id);
        const queueStr = queue.length.toString();
        if (!qTxt) {
            qTxt = this.add.text(bx + 30, by + 7, queueStr, {
                fontSize: '10px',
                fontStyle: 'bold',
                fontFamily: 'Arial',
                color: '#ffffff'
            }).setOrigin(0.5);
            qTxt.setDepth(1500001);
            this.queueTexts.set(id, qTxt);
        }
        if (qTxt.text !== queueStr) qTxt.setText(queueStr);
        qTxt.setPosition(bx + 30, by + 7);
        qTxt.setVisible(true);
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
                // 初始化渲染位置
                v.renderX = v.x;
                v.renderY = v.y;
            }

            const isVisible = (v.x + 50 > cam.scrollX && v.x - 50 < cam.scrollX + cam.width &&
                v.y + 50 > cam.scrollY && v.y - 50 < cam.scrollY + cam.height);

            sprite.setVisible(isVisible && v.visible !== false);
            if (isVisible) {
                // 核心優化：渲染插值 (Lerp)
                // 邏輯坐標 (v.x, v.y) 每 50ms 更新一次，但渲染每 16ms 執行一次
                // 透過逼近算法讓視覺座標平滑過渡，消除跳動感
                if (v.renderX === undefined) { v.renderX = v.x; v.renderY = v.y; }

                // 使用平滑係數 0.25 (在 60fps 下約 4 幀追上 90% 位移)
                const lerpFactor = 0.25;
                v.renderX += (v.x - v.renderX) * lerpFactor;
                v.renderY += (v.y - v.renderY) * lerpFactor;

                // 如果差距極小則直接對齊
                if (Math.abs(v.x - v.renderX) < 0.1) v.renderX = v.x;
                if (Math.abs(v.y - v.renderY) < 0.1) v.renderY = v.y;

                sprite.clear();
                sprite.setDepth(500000 + v.renderY); // Requirement 3: Y-axis sorting
                CharacterRenderer.render(sprite, v.renderX, v.renderY, v, this.time.now);

                // 更新單位的姓名與等級標籤 (Phaser Text 方案)
                this.updateUnitLabel(v.id, v, v.renderX, v.renderY);
            } else {
                // 如果不可見，也隱藏標籤
                this.hideUnitLabel(v.id);
            }
        });

        for (const [id, sprite] of this.units.entries()) {
            if (!currentIds.has(id)) {
                sprite.destroy();
                this.units.delete(id);
                this.cleanupUnitLabels(id);
            }
        }
    }

    updateUnitLabel(id, unit, x, y) {
        if (!unit.config) return;

        const camp = unit.config.camp || 'neutral';
        // 僅顯示敵人與中立生物的標籤，玩家村民不顯示
        if (camp !== 'enemy' && camp !== 'neutral') return;

        const cfg = UI_CONFIG.NPCLabel || { fontSize: "bold 14px Arial", enemyColor: "#ff4444", neutralColor: "#4caf50", offsetY: -35 };
        const labelStr = `${unit.config.name || 'NPC'} (Lv. ${unit.config.lv || 1})`;
        const color = camp === 'enemy' ? cfg.enemyColor : cfg.neutralColor;

        let label = this.nameLabels.get(id);
        if (!label) {
            label = this.add.text(x, y + cfg.offsetY, labelStr, {
                font: cfg.fontSize,
                fill: color,
                align: 'center'
            }).setOrigin(0.5, 0.5);

            label.setStroke('#000000', 3);
            label.setShadow(1, 1, 'rgba(0,0,0,0.6)', 2);
            label.setDepth(1000010 + unit.y); // NPC Labels on top
            this.nameLabels.set(id, label);
        }

        // 徹底穩定化：直接使用整數座標，不添加任何 breathing 偏移
        label.setPosition(Math.round(x), Math.round(y + cfg.offsetY));
        if (label.text !== labelStr) label.setText(labelStr);
        if (label.style.fill !== color) label.setFill(color); // 確保顏色正確切換
        if (!label.visible) label.setVisible(true);
    }

    hideUnitLabel(id) {
        if (this.nameLabels.has(id)) {
            this.nameLabels.get(id).setVisible(false);
        }
    }

    cleanupUnitLabels(id) {
        if (this.nameLabels.has(id)) {
            this.nameLabels.get(id).destroy();
            this.nameLabels.delete(id);
        }
    }

    updatePlacementPreview(state) {
        const g = this.placementPreview;
        g.clear();

        if (!state.placingType) return;

        // 單個預覽 (Drag/Stamp)
        if (state.previewPos && (state.buildingMode === 'DRAG' || state.buildingMode === 'STAMP' || state.buildingMode === 'NONE')) {
            const isClear = GameEngine.isAreaClear(state.previewPos.x, state.previewPos.y, state.placingType);
            this.drawEntity(g, {
                type1: state.placingType,
                previewColor: isClear ? 0x2196f3 : 0xf44336
            }, isClear ? 0.5 : 0.7, state.previewPos.x, state.previewPos.y);
        }

        // 批量預覽 (Line)
        if (state.buildingMode === 'LINE' && state.linePreviewEntities) {
            const tempPlaced = [];
            state.linePreviewEntities.forEach(pos => {
                const isClear = GameEngine.isAreaClear(pos.x, pos.y, state.placingType, tempPlaced);
                this.drawEntity(g, {
                    type1: state.placingType,
                    previewColor: isClear ? 0x2196f3 : 0xf44336
                }, isClear ? 0.3 : 0.6, pos.x, pos.y);

                if (isClear) tempPlaced.push({ type1: state.placingType, x: pos.x, y: pos.y });
            });
        }
    }



    // 新增支援位移的繪製方法
    drawEntityAt(g, x, y, ent, alpha) {
        g.save();
        // Phaser Graphics 的 Canvas 模式可以使用 translateCanvas
        // WebGL 模式需要使用內建的轉換或手動加算
        // 這裡我們直接手動加算最穩
        const oldX = g.x, oldY = g.y;
        // 我們不能改 Graphics 的 x/y 因為它可能已經被放在其他地方
        // 但 placementPreview 預設在 0,0。
        // 最簡單的方法：修改 drawEntity 讓它接收 x, y
        this.drawEntity(g, { ...ent, x, y, forcePos: true }, alpha);
        g.restore();
    }

    /**
     * 繪製指向性箭頭
     */
    drawArrowhead(g, x, y, ux, uy, size) {
        // ux, uy 是單位方向向量
        const px = -uy * (size * 0.6); // 垂直方向偏移
        const py = ux * (size * 0.6);

        g.beginPath();
        g.moveTo(x + ux * size, y + uy * size); // 頂點
        g.lineTo(x - ux * size * 0.5 + px, y - uy * size * 0.5 + py); // 底角 1
        g.lineTo(x - ux * size * 0.5 - px, y - uy * size * 0.5 - py); // 底角 2
        g.closePath();
        g.fillPath();
    }

    /**
     * [核心修補] 全域框選移動處理：支援 UI 穿透並實施邊界限制 (Clamping)
     */
    handleSelectionMove(e) {
        if (window.GAME_STATE && window.GAME_STATE.logisticsDragLine) {
            if (this.marqueeGraphics) this.marqueeGraphics.visible = false;
            return;
        }
        if (!this.selectionStartPos) return;
        if (this.marqueeGraphics) this.marqueeGraphics.visible = true;

        const cam = this.cameras.main;

        // [核心修復] 相容 Phaser Pointer 與原生 DOM MouseEvent
        // Phaser Pointer 沒有 clientX，但有 x (螢幕座標)
        if (e) {
            if (e.clientX !== undefined) {
                // DOM MouseEvent
                this.lastLocalMouse = window.UIManager ? window.UIManager.getLocalMouse(e) : { x: e.clientX, y: e.clientY };
            } else {
                // Phaser Pointer
                this.lastLocalMouse = { x: e.x, y: e.y };
            }
        }

        if (!this.lastLocalMouse) return;

        const worldX = cam.scrollX + this.lastLocalMouse.x;
        const worldY = cam.scrollY + this.lastLocalMouse.y;

        const bounds = cam.getBounds();
        const clampedX = Math.max(bounds.x, Math.min(worldX, bounds.x + bounds.width));
        const clampedY = Math.max(bounds.y, Math.min(worldY, bounds.y + bounds.height));

        const dist = Math.hypot(clampedX - this.selectionStartPos.x, clampedY - this.selectionStartPos.y);
        if (dist > 5) {
            this.drawMarquee(this.selectionStartPos, { x: clampedX, y: clampedY });
        } else {
            this.marqueeGraphics.clear();
        }
    }

    /**
     * [核心修補] 全域框選結束處理：解決鼠標移出視窗後鎖死的問題
     */
    handleSelectionEnd(e) {
        if (window.GAME_STATE && window.GAME_STATE.logisticsDragLine) return;
        if (!this.selectionStartPos) return;

        const isPhaserPointer = !!e.worldX;
        let endX, endY, isShift, screenX, screenY;

        if (isPhaserPointer) {
            endX = e.worldX;
            endY = e.worldY;
            isShift = e.event.shiftKey;
            screenX = e.x;
            screenY = e.y;
        } else {
            const cam = this.cameras.main;
            const local = window.UIManager ? window.UIManager.getLocalMouse(e) : { x: e.clientX, y: e.clientY };
            endX = cam.scrollX + local.x;
            endY = cam.scrollY + local.y;
            isShift = e.shiftKey;
            screenX = local.x;
            screenY = local.y;
        }

        const cam = this.cameras.main;
        const bounds = cam.getBounds();
        endX = Math.max(bounds.x, Math.min(endX, bounds.x + bounds.width));
        endY = Math.max(bounds.y, Math.min(endY, bounds.y + bounds.height));

        const dragDist = this.mouseDownScreenPos ? Math.hypot(screenX - this.mouseDownScreenPos.x, screenY - this.mouseDownScreenPos.y) : 0;

        if (dragDist < 5) {
            let bestDist = 60; // 提高選取寬容度 (原 40)
            let clickedUnit = null;
            const TS = GameEngine.TILE_SIZE;

            // [核心優化] 優先判定玩家單位，且採用混合 hitbox 檢測 (圓形 + 矩形)
            GameEngine.state.units.villagers.forEach(v => {
                if (v.visible === false) return; // [新增] 忽略不可見(在工廠內)的單位
                const isPlayer = (v.config?.camp === 'player' || v.camp === 'player' || !v.camp);
                const d = Math.hypot(v.x - endX, v.y - endY);

                // 矩形 Hitbox 判定 (適用於點擊中心稍微偏移的情況)
                const inHitbox = Math.abs(v.x - endX) < 30 && Math.abs(v.y - endY) < 40;

                if (d < bestDist || inHitbox) {
                    // 如果原本選中的不是玩家單位，或者這個單位更近
                    if (!clickedUnit || (isPlayer && !clickedUnit._isPlayer)) {
                        bestDist = d;
                        clickedUnit = v;
                        clickedUnit._isPlayer = isPlayer; // 暫存用於優先級比較
                    } else if (isPlayer === clickedUnit._isPlayer && d < bestDist) {
                        bestDist = d;
                        clickedUnit = v;
                    }
                }
            });

            if (clickedUnit) {
                const now = Date.now();
                const isDoubleClick = (GameEngine.state.lastSelectedUnitId === clickedUnit.id && (now - GameEngine.state.lastSelectionTime < 300));
                if (isDoubleClick) {
                    const unitType = clickedUnit.config.type;
                    const newlySelected = GameEngine.state.units.villagers.filter(v =>
                        v.config && v.config.type === unitType && v.visible !== false &&
                        v.x >= cam.scrollX && v.x <= cam.scrollX + cam.width &&
                        v.y >= cam.scrollY && v.y <= cam.scrollY + cam.height);
                    if (isShift) {
                        newlySelected.forEach(u => { if (!GameEngine.state.selectedUnitIds.includes(u.id)) GameEngine.state.selectedUnitIds.push(u.id); });
                    } else {
                        GameEngine.state.selectedUnitIds = newlySelected.map(v => v.id);
                    }
                    GameEngine.addLog(`[選取] 相同類型單位共 ${newlySelected.length} 個。`);
                } else {
                    if (isShift) {
                        if (GameEngine.state.selectedUnitIds.includes(clickedUnit.id)) {
                            GameEngine.state.selectedUnitIds = GameEngine.state.selectedUnitIds.filter(id => id !== clickedUnit.id);
                        } else {
                            GameEngine.state.selectedUnitIds.push(clickedUnit.id);
                        }
                    } else { GameEngine.state.selectedUnitIds = [clickedUnit.id]; }
                }
                GameEngine.state.lastSelectionTime = now;
                GameEngine.state.lastSelectedUnitId = clickedUnit.id;
                this.logUnitDetail(clickedUnit);
                GameEngine.state.selectedResourceId = null;
            } else {
                this._performClassicClickSelection(endX, endY, isShift);
            }
        } else {
            const minX = Math.min(this.selectionStartPos.x, endX), maxX = Math.max(this.selectionStartPos.x, endX);
            const minY = Math.min(this.selectionStartPos.y, endY), maxY = Math.max(this.selectionStartPos.y, endY);
            const boxUnits = GameEngine.state.units.villagers.filter(v =>
                (v.config?.camp === 'player' || v.camp === 'player' || !v.camp) &&
                v.visible !== false &&
                v.x >= minX && v.x <= maxX && v.y >= minY && v.y <= maxY
            );
            if (isShift) { boxUnits.forEach(u => { if (!GameEngine.state.selectedUnitIds.includes(u.id)) GameEngine.state.selectedUnitIds.push(u.id); }); }
            else {
                GameEngine.state.selectedUnitIds = boxUnits.map(v => v.id);
                GameEngine.state.selectedResourceId = null;
                GameEngine.state.selectedBuildingId = null;
                GameEngine.state.selectedBuildingIds = [];
                if (window.UIManager) window.UIManager.hideContextMenu();
            }
            if (boxUnits.length > 0) GameEngine.addLog(`[選取] 框選操作選中了 ${boxUnits.length} 個我方單位。`);
        }

        this.marqueeGraphics.clear();
        this.selectionStartPos = null;
        this.mouseDownScreenPos = null;
    }

    _performClassicClickSelection(worldX, worldY, isShift) {
        let foundRes = null;
        if (GameEngine.state.mapData) {
            const TS = GameEngine.TILE_SIZE;
            const searchGx = Math.floor(worldX / TS), searchGy = Math.floor(worldY / TS);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const gx = searchGx + dx, gy = searchGy + dy;
                    const res = GameEngine.state.mapData.getResource(gx, gy);
                    if (!res) continue;
                    const typeMap = {
                        1: 'SCENE_WOOD', 2: 'SCENE_STONE', 3: 'SCENE_FRUIT', 4: 'SCENE_GOLD_MINE',
                        5: 'SCENE_IRON_MINE', 6: 'SCENE_COAL_MINE', 7: 'SCENE_MAGIC_HERB',
                        8: 'SCENE_WOLF_CORPSE', 9: 'SCENE_BEAR_CORPSE',
                        10: 'SCENE_CRYSTAL_MINE', 11: 'SCENE_COPPER_MINE', 12: 'SCENE_SILVER_MINE', 13: 'SCENE_MITHRIL_MINE'
                    };
                    const cfg = GameEngine.state.resourceConfigs.find(c => c.type === typeMap[res.type] && c.lv === (res.level || 1));
                    if (!cfg) continue;
                    const ms = cfg.model_size || { x: 1, y: 1 }, vWidth = 120 * ms.x, vHeight = 120 * ms.y, rx = gx * TS + TS / 2, ry = gy * TS + TS / 2;
                    if (worldX >= rx - vWidth / 2 && worldX <= rx + vWidth / 2 && worldY >= ry - vHeight / 2 && worldY <= ry + vHeight / 2) {
                        foundRes = { gx, gy, res }; break;
                    }
                }
                if (foundRes) break;
            }
        }
        if (foundRes && !isShift) {
            GameEngine.state.selectedResourceId = `${foundRes.gx}_${foundRes.gy}`;
            GameEngine.state.selectedUnitIds = []; GameEngine.state.selectedBuildingId = null;
            GameEngine.state.selectedBuildingIds = [];
            if (window.UIManager) window.UIManager.hideContextMenu();
            GameEngine.addLog(`[選取] 資源：${foundRes.res.type} (Lv.${foundRes.res.level})`);
        } else {
            // 建築選取邏輯：優先使用 AABB 碰撞檢測以對應大型建築
            let clickedB = null;
            const TS = GameEngine.TILE_SIZE;

            // 將地圖實體按距離排序，優先選取最近的 (或最上層的)
            const sortedBuildings = [...GameEngine.state.mapEntities].sort((a, b) =>
                Math.hypot(a.x - worldX, a.y - worldY) - Math.hypot(b.x - worldX, b.y - worldY)
            );

            for (const e of sortedBuildings) {
                const cfg = GameEngine.getEntityConfig(e.type1);
                let uw = 1, uh = 1;
                if (e.type1 === 'corpse') {
                    // [核心修復] 屍體左鍵點擊範圍應與 UI_CONFIG 及右鍵判定同步
                    const cScale = (UI_CONFIG.ResourceSelection && UI_CONFIG.ResourceSelection.corpseSelectionScale) || 0.8;
                    uw = cScale; uh = cScale;
                } else if (cfg && cfg.size) {
                    const match = cfg.size.toString().match(/\{[ ]*([\d.]+)[ ]*,[ ]*([\d.]+)[ ]*\}/);
                    if (match) { uw = parseFloat(match[1]); uh = parseFloat(match[2]); }
                }
                const w = uw * TS, h = uh * TS;
                if (worldX >= e.x - w / 2 && worldX <= e.x + w / 2 && worldY >= e.y - h / 2 && worldY <= e.y + h / 2) {
                    clickedB = e;
                    break;
                }
            }

            if (clickedB && !isShift) {
                if (clickedB.type1 === 'corpse') {
                    // [核心修正] 屍體選取連動至資源高亮系統
                    GameEngine.state.selectedResourceId = clickedB.id;
                    GameEngine.state.selectedUnitIds = [];
                    GameEngine.state.selectedBuildingId = null;
                    GameEngine.state.selectedBuildingIds = [];
                } else if (window.UIManager) {
                    window.UIManager.showContextMenu(clickedB);
                }
                GameEngine.addLog(`[選取] ${clickedB.type1 === 'corpse' ? '資源' : '建築'}：${clickedB.name || clickedB.type1}`);
            } else if (!isShift) {
                GameEngine.state.selectedUnitIds = [];
                GameEngine.state.selectedResourceId = null;
                GameEngine.state.selectedBuildingId = null;
                GameEngine.state.selectedBuildingIds = [];
                if (window.UIManager) window.UIManager.hideContextMenu();
            }
        }
    }

    /**
     * [核心新增] 更新滑鼠懸停目標 (Requirement 1 & 2)
     * 基於 Y 座標決定優先權，Y 越大越靠前，優先被懸停。
     */
    updateHoverTarget() {
        if (!this.isMouseIn) {
            if (window.GAME_STATE) window.GAME_STATE.hoveredId = null;
            return;
        }

        const state = window.GAME_STATE || GameEngine.state;
        if (!state) return;

        const pointer = this.input.activePointer;
        if (!pointer) return;

        let bestY = -Infinity;
        let bestId = null;
        const TS = GameEngine.TILE_SIZE;

        // 1. 檢查單位 (Hitbox 40px)
        if (state.units && state.units.villagers) {
            state.units.villagers.forEach(v => {
                const dist = Math.hypot(v.x - pointer.worldX, v.y - pointer.worldY);
                if (dist < 40) {
                    if (v.y > bestY) {
                        bestY = v.y;
                        bestId = v.id;
                    }
                }
            });
        }

        // 2. 檢查建築 (主要實體)
        if (state.mapEntities) {
            state.mapEntities.forEach(ent => {
                if (!ent) return;
                const cfg = GameEngine.getEntityConfig(ent.type1);
                let uw = 1, uh = 1;
                if (ent.type1 === 'corpse') {
                    const cScale = (UI_CONFIG.ResourceSelection && UI_CONFIG.ResourceSelection.corpseSelectionScale) || 0.8;
                    uw = cScale; uh = cScale;
                } else if (cfg && cfg.size) {
                    const cleanSize = cfg.size.toString().replace(/['"]/g, '');
                    const match = cleanSize.match(/\{[ ]*([\d.]+)[ ]*,[ ]*([\d.]+)[ ]*\}/);
                    if (match) { uw = parseFloat(match[1]); uh = parseFloat(match[2]); }
                }
                const w = uw * TS, h = uh * TS;
                const padding = 5;
                if (pointer.worldX >= ent.x - w / 2 - padding && pointer.worldX <= ent.x + w / 2 + padding &&
                    pointer.worldY >= ent.y - h / 2 - padding && pointer.worldY <= ent.y + h / 2 + padding) {
                    if (ent.y > bestY) {
                        bestY = ent.y;
                        bestId = ent.id || `${ent.type1}_${ent.x}_${ent.y}`;
                    }
                }
            });
        }

        // 3. 檢查大地圖資源 (使用當前可見的 ResourceBobs)
        for (const [key, info] of this.resourceBobs.entries()) {
            const [gx, gy] = key.split('_').map(Number);
            const rx = gx * TS + TS / 2;
            const ry = gy * TS + TS / 2;

            // 讀取資源模型大小進行近似碰撞
            const typeNameMap = {
                'tree': 'SCENE_WOOD',
                'stone': 'SCENE_STONE',
                'food': 'SCENE_FRUIT',
                'gold_ore': 'SCENE_GOLD_MINE',
                'iron_ore': 'SCENE_IRON_MINE',
                'coal': 'SCENE_COAL_MINE',
                'magic_herb': 'SCENE_MAGIC_HERB',
                'wolf_corpse': 'SCENE_WOLF_CORPSE',
                'bear_corpse': 'SCENE_BEAR_CORPSE',
                'crystal_ore': 'SCENE_CRYSTAL_MINE',
                'copper_ore': 'SCENE_COPPER_MINE',
                'silver_ore': 'SCENE_SILVER_MINE',
                'mithril_ore': 'SCENE_MITHRIL_MINE'
            };
            const typeName = typeNameMap[info.type];
            const resCfg = GameEngine.state.resourceConfigs.find(c => c.type === typeName && c.lv === (info.lv || 1));
            const ms = (resCfg && resCfg.model_size) ? resCfg.model_size : { x: 1, y: 1 };

            const vWidth = 100 * ms.x, vHeight = 100 * ms.y; // 稍微寬鬆的資源碰撞

            if (pointer.worldX >= rx - vWidth / 2 && pointer.worldX <= rx + vWidth / 2 &&
                pointer.worldY >= ry - vHeight / 2 && pointer.worldY <= ry + vHeight / 2) {
                if (ry > bestY) {
                    bestY = ry;
                    bestId = key;
                }
            }
        }

        state.hoveredId = bestId;
    }
}
