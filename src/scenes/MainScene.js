import { GameEngine } from "../systems/game_systems.js";
import { UI_CONFIG } from "../ui/ui_config.js";
import { CharacterRenderer } from "../renderers/character_renderer.js";
import { ResourceRenderer } from "../renderers/resource_renderer.js";
import { BattleRenderer } from "../renderers/battle_renderer.js";

export class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        this.entities = new Map(); // ID -> Sprite/Image
        this.units = new Map();     // ID -> Sprite
        this.queueTexts = new Map();
        this.nameLabels = new Map();
        this.levelLabels = new Map();
        this.resourceLabels = new Map();
        this.unitIconTexts = new Map();
        this.emitters = new Map(); // ID -> ParticleEmitter
        this.gridGraphics = null;
        this.marqueeGraphics = null; // 框選圖形界面
        this.targetGraphics = null;  // 尋路目標提示層
        this.selectionStartPos = null; // 框選起始位置 (世界座標)
        this.clickEffects = [];      // 點擊反饋效果列表
        this.lastRenderVersion = 0;
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

        // 效能協議：為資源實作物業層級的物件池渲染優化
        // 考量到資源物件有模型縮放 (model_size) 與視覺變形需求，改用 Image 對象池而非 Blitter。
        // Phaser 在幾千個 Image 下效能依然強勁。
        this.resourceBobs = new Map(); // 格網鍵值 (gx_gy) -> { type, bob, lv }
        this.resourcePools = { 'tree': [], 'stone': [], 'food': [], 'gold': [] };
        // 建立專用群組
        this.resourceGroup = this.add.group();

        // 預覽配置 (用於建築放置)
        this.placementPreview = this.add.graphics();
        this.placementPreview.setDepth(100);

        // 動態 HUD 繪圖層 (進度條、生產列)
        this.hudGraphics = this.add.graphics();
        this.hudGraphics.setDepth(60);

        // 選取高亮層
        this.selectionGraphics = this.add.graphics();
        this.selectionGraphics.setDepth(55);

        // 框選 marquee 層
        this.marqueeGraphics = this.add.graphics();
        this.marqueeGraphics.setDepth(2000); // 置頂顯示

        // 尋路目標提示層 (位於單位之下)
        this.targetGraphics = this.add.graphics();
        this.targetGraphics.setDepth(5);

        // 相機控制
        this.lastCamX = -9999;
        this.lastCamY = -9999;
        this.isDragging = false;
        this.lastVisibleEntities = [];
        this.pendingVisibleEntities = true; // 強制首幀加載
        this.setupCamera();

        // 設置全局引用
        window.PhaserScene = this;
        BattleRenderer.init(this);

        // RTS 核心設定：禁用右鍵選單
        if (this.input && this.input.mouse) {
            this.input.mouse.disableContextMenu();
        }
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
            this.drawEntity(g, { type, isUnderConstruction: false }, 1.0);
            g.restore();
        };

        // 生成所有建築材質
        const buildingTypes = [
            'village', 'town_center', 'farmhouse', 'timber_factory',
            'stone_factory', 'barn', 'gold_mining_factory', 'farmland', 'tree_plantation',
            'mage_place', 'swordsman_place', 'archer_place', 'campfire'
        ];

        buildingTypes.forEach(type => {
            const cfg = GameEngine.state.buildingConfigs[type];
            let uw = 1, uh = 1;
            if (cfg && cfg.size) {
                const cleanSize = cfg.size.toString().replace(/['"]/g, '');
                const match = cleanSize.match(/\{[ ]*([\d.]+)[ ]*,[ ]*([\d.]+)[ ]*\}/);
                if (match) {
                    uw = parseFloat(match[1]);
                    uh = parseFloat(match[2]);
                }
            }
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

        this.input.on('pointerdown', (pointer) => {
            // 核心功能：不論是否被 UI 阻擋，第一時間捕捉目前的建築狀態快照
            const isPlacement = !!GameEngine.state.placingType;
            this.rightClickWasPlacement = isPlacement;
            // 記錄本次按下的初始狀態，防止 contextmenu 事件先一步清除了標記
            GameEngine.state.rightClickStartedInPlacementMode = isPlacement;

            // 排除 UI 點擊干擾
            if (window.UIManager && window.UIManager.dragGhost) return;

            const isMiddleDrag = pointer.middleButtonDown();
            const isRightClick = pointer.rightButtonDown();

            // 1. 左鍵點擊/選取邏輯 - 僅初始化起始點，具體判斷移至 pointerup
            if (pointer.leftButtonDown() && !isPlacement && !isMiddleDrag) {
                this.selectionStartPos = { x: pointer.worldX, y: pointer.worldY };
                this.mouseDownScreenPos = { x: pointer.x, y: pointer.y };
            }

            // 2. 右鍵與中鍵皆可用於相機拖曳
            if (isRightClick || isMiddleDrag) {
                this.isDragging = true;
                this.hasMetDragThreshold = false; // 重置拖動門檻標記
                this.dragStartPos = { x: pointer.x, y: pointer.y };
                lastPointer = { x: pointer.x, y: pointer.y };
            }

            if (isPlacement && !isMiddleDrag) return;
        });

        // 核心修補：註冊全域 mouseup 事件，確保鼠標移出視窗外放開時，仍能正確終止拖動狀態
        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.dragStartPos = null;
            }
        });

        this.input.on('pointermove', (pointer) => {
            if (this.isDragging) {
                // 檢查是否已達到設定的最小位移門檻，避免誤觸
                if (!this.hasMetDragThreshold) {
                    const dist = Math.hypot(pointer.x - this.dragStartPos.x, pointer.y - this.dragStartPos.y);
                    const threshold = (UI_CONFIG.Interaction && UI_CONFIG.Interaction.minDragDistance) || 5;
                    if (dist >= threshold) {
                        this.hasMetDragThreshold = true;
                    }
                }

                if (this.hasMetDragThreshold) {
                    const dx = pointer.x - lastPointer.x;
                    const dy = pointer.y - lastPointer.y;
                    if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
                        cam.scrollX -= dx;
                        cam.scrollY -= dy;
                        this.lastDragTime = Date.now(); // 記錄最後一次畫面移動的時間點
                    }
                }
                lastPointer = { x: pointer.x, y: pointer.y };
            }

            // 更新框選預覽
            if (this.selectionStartPos) {
                this.drawMarquee(this.selectionStartPos, { x: pointer.worldX, y: pointer.worldY });
            }
        });

        this.input.on('pointerup', (pointer) => {
            const isPlacement = !!GameEngine.state.placingType;

            // [右鍵單擊] 或 [右鍵指令]
            if (pointer.button === 2) {
                this.isDragging = false;
                const now = Date.now();
                const dragDecay = 100;
                const wasCameraDragging = (this.lastDragTime && (now - this.lastDragTime < dragDecay));

                // 1. 如果是拖動畫面結束，過濾掉任何可能的尋路指令
                if (wasCameraDragging) {
                    this.rightClickWasPlacement = false; // 拖動結束，消耗掉本次狀態
                    GameEngine.addLog("[指令] 拖動畫面中，已自動過濾寻路指令。", "PATH");
                    return;
                }

                // 2. 核心衝突修復：如果本次右鍵「開始時」處於建築模式，則本次放開只能用於「取消」或「拖動」。
                if (this.rightClickWasPlacement || GameEngine.state.rightClickStartedInPlacementMode) {
                    this.rightClickWasPlacement = false;
                    GameEngine.state.rightClickStartedInPlacementMode = false;
                    return;
                }

                // 重置標記以防萬一
                this.rightClickWasPlacement = false;
                GameEngine.state.rightClickStartedInPlacementMode = false;

                const dragDist = this.dragStartPos ? Math.hypot(pointer.x - this.dragStartPos.x, pointer.y - this.dragStartPos.y) : 0;
                const threshold = (UI_CONFIG.Interaction && UI_CONFIG.Interaction.minDragDistance) || 10;
                if (dragDist > threshold) return;

                // 識別點擊目標 (碰撞檢測) - 僅在放開時執行
                let clickedEnemy = null;
                let clickedEntity = null;
                let bestDist = 40;

                // 優先檢測敵軍
                GameEngine.state.units.villagers.forEach(v => {
                    const camp = (v.config && v.config.camp) || v.camp || 'neutral';
                    if (camp === 'enemy') {
                        const d = Math.hypot(v.x - pointer.worldX, v.y - pointer.worldY);
                        if (d < bestDist) { bestDist = d; clickedEnemy = v; }
                    }
                });

                if (!clickedEnemy) {
                    const TS = GameEngine.TILE_SIZE;
                    GameEngine.state.mapEntities.forEach(e => {
                        const fp = GameEngine.getFootprint(e.type);
                        const w = fp.uw * TS, h = fp.uh * TS;
                        // AABB 碰撞檢測 (支援大建築邊緣點擊)
                        if (pointer.worldX >= e.x - w / 2 - 10 && pointer.worldX <= e.x + w / 2 + 10 &&
                            pointer.worldY >= e.y - h / 2 - 10 && pointer.worldY <= e.y + h / 2 + 10) {
                            clickedEntity = e;
                        }
                    });
                }

                if (!clickedEnemy && !clickedEntity && GameEngine.state.mapData) {
                    const TS = GameEngine.TILE_SIZE;
                    const clickX = pointer.worldX, clickY = pointer.worldY;
                    const searchGx = Math.floor(clickX / TS);
                    const searchGy = Math.floor(clickY / TS);

                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const gx = searchGx + dx, gy = searchGy + dy;
                            const res = GameEngine.state.mapData.getResource(gx, gy);
                            if (!res) continue;
                            const typeMap = { 1: 'WOOD', 2: 'STONE', 3: 'FOOD', 4: 'GOLD' };
                            const typeName = typeMap[res.type];
                            const cfg = GameEngine.state.resourceConfigs.find(c => c.type === typeName && c.lv === (res.level || 1));
                            if (!cfg) continue;

                            const ms = cfg.model_size || { x: 1, y: 1 };
                            const vWidth = 120 * ms.x, vHeight = 120 * ms.y;
                            const rx = gx * TS + TS / 2, ry = gy * TS + TS / 2;

                            if (clickX >= rx - vWidth / 2 && clickX <= rx + vWidth / 2 &&
                                clickY >= ry - vHeight / 2 && clickY <= ry + vHeight / 2) {
                                clickedEntity = {
                                    id: `${gx}_${gy}`,
                                    gx, gy, x: rx, y: ry,
                                    type: typeName, resourceType: typeName, amount: res.amount
                                };
                                break;
                            }
                        }
                        if (clickedEntity) break;
                    }
                }

                // 觸發效果與下達指令
                if (clickedEnemy) this.addClickEffect(clickedEnemy.x, clickedEnemy.y, 'enemy');
                else if (clickedEntity) this.addClickEffect(clickedEntity.x, clickedEntity.y, 'ground');
                else this.addClickEffect(pointer.worldX, pointer.worldY, 'ground');

                const selectedIds = GameEngine.state.selectedUnitIds || [];
                if (selectedIds.length > 0) {
                    const unitsToMove = selectedIds.map(id => GameEngine.state.units.villagers.find(v => v.id === id)).filter(v => v);
                    if (clickedEntity && clickedEntity.isUnderConstruction) {
                        const vCandidates = unitsToMove.filter(v => v.config?.type === 'villagers');
                        if (vCandidates.length > 0) {
                            vCandidates.forEach(v => this.handleRightClickCommand(v, pointer, clickedEntity));
                            return;
                        }
                    }

                    const colsNum = Math.ceil(Math.sqrt(unitsToMove.length));
                    const spacing = 40;
                    unitsToMove.forEach((unit, i) => {
                        const r = Math.floor(i / colsNum), c = i % colsNum;
                        const offX = (c - (colsNum - 1) / 2) * spacing, offY = (r - (colsNum - 1) / 2) * spacing;
                        // 核心協議：即使點擊實體，也帶入相應的偏移座標，確保多個單位不會重疊於同一點
                        const offsetPointer = { worldX: pointer.worldX + offX, worldY: pointer.worldY + offY };
                        this.handleRightClickCommand(unit, offsetPointer, clickedEnemy || clickedEntity);
                    });
                }
            }

            // [左鍵單擊] 或 [框選結束]
            if (pointer.button === 0 && this.selectionStartPos && !isPlacement) {
                const start = this.selectionStartPos;
                const end = { x: pointer.worldX, y: pointer.worldY };
                const dragDist = this.mouseDownScreenPos ? Math.hypot(pointer.x - this.mouseDownScreenPos.x, pointer.y - this.mouseDownScreenPos.y) : 0;

                // 判斷是單擊還是框選 (門檻設為 5 像素)
                if (dragDist < 5) {
                    // --- 單選邏輯 ---
                    let bestDist = 40;
                    let clickedUnit = null;
                    GameEngine.state.units.villagers.forEach(v => {
                        const d = Math.hypot(v.x - pointer.worldX, v.y - pointer.worldY);
                        if (d < bestDist) { bestDist = d; clickedUnit = v; }
                    });

                    if (clickedUnit) {
                        const now = Date.now();
                        const isDoubleClick = (GameEngine.state.lastSelectedUnitId === clickedUnit.id && (now - GameEngine.state.lastSelectionTime < 300));
                        const isShift = pointer.event.shiftKey;

                        if (isDoubleClick) {
                            const unitType = clickedUnit.config.type;
                            const cam = this.cameras.main;
                            const newlySelected = GameEngine.state.units.villagers.filter(v => v.config && v.config.type === unitType &&
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
                            } else {
                                GameEngine.state.selectedUnitIds = [clickedUnit.id];
                            }
                        }
                        GameEngine.state.lastSelectionTime = now;
                        GameEngine.state.lastSelectedUnitId = clickedUnit.id;
                        this.logUnitDetail(clickedUnit);
                        GameEngine.state.selectedResourceId = null;
                    } else {
                        // 檢查資源選取
                        let foundRes = null;
                        if (GameEngine.state.mapData) {
                            const TS = GameEngine.TILE_SIZE;
                            const searchGx = Math.floor(pointer.worldX / TS), searchGy = Math.floor(pointer.worldY / TS);
                            for (let dy = -1; dy <= 1; dy++) {
                                for (let dx = -1; dx <= 1; dx++) {
                                    const gx = searchGx + dx, gy = searchGy + dy;
                                    const res = GameEngine.state.mapData.getResource(gx, gy);
                                    if (!res) continue;
                                    const typeMap = { 1: 'WOOD', 2: 'STONE', 3: 'FOOD', 4: 'GOLD' };
                                    const cfg = GameEngine.state.resourceConfigs.find(c => c.type === typeMap[res.type] && c.lv === (res.level || 1));
                                    if (!cfg) continue;
                                    const ms = cfg.model_size || { x: 1, y: 1 };
                                    const vWidth = 120 * ms.x, vHeight = 120 * ms.y;
                                    const rx = gx * TS + TS / 2, ry = gy * TS + TS / 2;
                                    if (pointer.worldX >= rx - vWidth / 2 && pointer.worldX <= rx + vWidth / 2 &&
                                        pointer.worldY >= ry - vHeight / 2 && pointer.worldY <= ry + vHeight / 2) {
                                        foundRes = { gx, gy, res }; break;
                                    }
                                }
                                if (foundRes) break;
                            }
                        }

                        if (foundRes && !pointer.event.shiftKey) {
                            GameEngine.state.selectedResourceId = `${foundRes.gx}_${foundRes.gy}`;
                            GameEngine.state.selectedUnitIds = [];
                            GameEngine.state.selectedBuildingId = null;
                            if (window.UIManager) window.UIManager.hideContextMenu();
                            GameEngine.addLog(`[選取] 資源：${foundRes.res.type} (Lv.${foundRes.res.level})`);
                        } else {
                            // 檢查建築選取
                            let clickedBuilding = null;
                            let bestBDist = 40;
                            GameEngine.state.mapEntities.forEach(e => {
                                const d = Math.hypot(e.x - pointer.worldX, e.y - pointer.worldY);
                                if (d < bestBDist) { bestBDist = d; clickedBuilding = e; }
                            });

                            if (clickedBuilding && !pointer.event.shiftKey) {
                                GameEngine.state.selectedBuildingId = clickedBuilding.id;
                                GameEngine.state.selectedUnitIds = [];
                                GameEngine.state.selectedResourceId = null;
                                if (window.UIManager) window.UIManager.hideContextMenu();
                                GameEngine.addLog(`[選取] 建築：${clickedBuilding.name || clickedBuilding.type} ${clickedBuilding.isUnderConstruction ? '(施工中)' : ''}`);
                            } else if (!pointer.event.shiftKey) {
                                // 點地板清空選取
                                GameEngine.state.selectedUnitIds = [];
                                GameEngine.state.lastSelectedUnitId = null;
                                GameEngine.state.selectedResourceId = null;
                                if (window.UIManager) window.UIManager.hideContextMenu();
                            }
                        }
                    }
                } else {
                    // --- 框選邏輯 ---
                    const minX = Math.min(start.x, end.x), maxX = Math.max(start.x, end.x);
                    const minY = Math.min(start.y, end.y), maxY = Math.max(start.y, end.y);

                    // 僅框選我方單位 (camp === 'player')
                    const boxUnits = GameEngine.state.units.villagers.filter(v =>
                        (v.config?.camp === 'player' || v.camp === 'player' || !v.camp) &&
                        v.x >= minX && v.x <= maxX && v.y >= minY && v.y <= maxY
                    );

                    if (pointer.event.shiftKey) {
                        boxUnits.forEach(u => { if (!GameEngine.state.selectedUnitIds.includes(u.id)) GameEngine.state.selectedUnitIds.push(u.id); });
                    } else {
                        GameEngine.state.selectedUnitIds = boxUnits.map(v => v.id);
                        GameEngine.state.selectedResourceId = null;
                        GameEngine.state.selectedBuildingId = null;
                        if (window.UIManager) window.UIManager.hideContextMenu();
                    }
                    if (boxUnits.length > 0) GameEngine.addLog(`[選取] 框選操作選中了 ${boxUnits.length} 個我方單位。`);
                    this.marqueeGraphics.clear();
                }
                this.selectionStartPos = null;
                this.mouseDownScreenPos = null;
            }

            if (pointer.button !== 0) this.isDragging = false;
            this.dragStartPos = null;
        });
    }

    /**
     * 處理單位的右鍵指令（移動或攻擊）
     */
    handleRightClickCommand(unit, pointer, clickedTarget = null) {
        // [最終防護] 若正處於建造預覽狀態，或按下鼠標時正處於建造預覽狀態，屏蔽所有指令
        if (GameEngine.state.placingType || GameEngine.state.rightClickStartedInPlacementMode) return;

        // 單位狀態檢查
        const unitType = unit.config ? unit.config.type : '';
        if (unitType === 'wolf' || unitType === 'bear') return; // 非玩家控制單位不處理

        const wx = pointer.worldX, wy = pointer.worldY;
        const TS = GameEngine.TILE_SIZE;
        const pf = GameEngine.state.pathfinding;

        let finalTx = wx, finalTy = wy;
        let isAttackCommand = false;

        // 1. 識別目標類別
        if (clickedTarget) {
            const isResource = !!(clickedTarget.gx !== undefined && clickedTarget.gy !== undefined) || (clickedTarget.resourceType);
            const isEnemy = (clickedTarget.config && clickedTarget.config.camp === 'enemy') || clickedTarget.camp === 'enemy' || clickedTarget.isEnemy;

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
                GameEngine.addLog(`[命令] ${unit.configName} 鎖定目標 ${clickedTarget.configName || '敵人'} 並進入追擊。`);
            } else if (clickedTarget.isUnderConstruction && unit.config.type === 'villagers') {
                // 我方工人右鍵點施工中建築：開始建造 (一人一間配給邏輯由外層 dispatcher 處理)
                unit.state = 'MOVING_TO_CONSTRUCTION';
                unit.constructionTarget = clickedTarget;
                unit.targetId = null;
                unit.pathTarget = null;
                unit.isPlayerLocked = true;

                // [視覺優化] 同步選取該建築，顯示選取框與取消按鈕
                if (window.UIManager) window.UIManager.showContextMenu(clickedTarget);

                GameEngine.addLog(`[命令] 工人 ${unit.id} 前往建設 ${clickedTarget.name || clickedTarget.type}。`, 'COMMON');
                return;
            } else if (isResource && unit.config.type === 'villagers') {
                // 我方工人右鍵點資源：採集該資源
                unit.state = 'MOVING_TO_RESOURCE';
                unit.type = clickedTarget.resourceType || clickedTarget.type;
                unit.targetId = clickedTarget;
                unit.pathTarget = null;
                unit.isPlayerLocked = true;
                GameEngine.addLog(`[命令] ${unit.configName} 前往採集 ${unit.type}。`);
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
                GameEngine.addLog(`[命令] ${unit.configName} 移動至目標附近。`);
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
            GameEngine.addLog(`[命令] ${unit.configName} 移動至地面。`);
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
        const parseColor = (c) => typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c;

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
            this.updateUnits(state.units.villagers);
            this.updateDynamicHUD(this.lastVisibleEntities);
            // 渲染戰鬥視覺 (HP Bars - 即使沒動也需更新動畫與剩餘時間)
            BattleRenderer.renderHPBars(this.hudGraphics, state.units.villagers, deltaTime);
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

        this.updateUnits(state.units.villagers);
        this.updateDynamicHUD(visibleEntities);

        // 渲染戰鬥視覺 (HP Bars) - 同時包含單位與具備血量的建築實體
        const allCombatants = [...state.units.villagers, ...state.mapEntities.filter(e => e.hp !== undefined)];
        BattleRenderer.renderHPBars(this.hudGraphics, allCombatants, deltaTime);
    }

    updateTownCenterLocator(cam) {
        const el = document.getElementById("tc_locator");
        if (!el) return;

        const tc = GameEngine.state.mapEntities.find(e => e.type === 'town_center' || e.type === 'village');
        if (!tc) {
            el.style.display = "none";
            return;
        }

        const TS = GameEngine.TILE_SIZE;
        const cfg = GameEngine.getEntityConfig(tc.type);
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

            // 更新箭頭旋轉
            const arrow = document.getElementById("tc_arrow");
            if (arrow) {
                // ▶ 預設朝右(0rad)，旋轉至 angle 後平移至圓圈邊緣
                arrow.style.transform = `rotate(${angle}rad) translateX(36px)`;
            }

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
            const cfg = GameEngine.getEntityConfig(ent.type);
            let uw = 1, uh = 1;
            if (cfg && cfg.size) {
                const match = cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
                if (match) { uw = parseInt(match[1]); uh = parseInt(match[2]); }
            }

            if (ent.isUnderConstruction) {
                this.drawBuildProgressBar(g, ent, uw, uh, TS);
                // 施工中時，確保生產隊列標籤隱藏
                const id = ent.id || `${ent.type}_${ent.x}_${ent.y}`;
                if (this.queueTexts.has(id)) this.queueTexts.get(id).setVisible(false);
            } else if (ent.queue) {
                // 不論 queue.length 是否大於 0 都呼叫，讓 drawProductionHUD 內部處理隱藏邏輯
                this.drawProductionHUD(g, ent, uw, uh, TS);
            }

            // 繪製集結點 (僅在選中且有集結點時顯示)
            if (ent.rallyPoint && window.UIManager && window.UIManager.activeMenuEntity === ent) {
                this.drawRallyPoint(g, ent);
            }
        });
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
        if (window.UIManager && window.UIManager.activeMenuEntity) {
            const ent = window.UIManager.activeMenuEntity;
            this.drawSingleSelectionBox(g, ent, 0xff9800);
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

        const cfgFX = UI_CONFIG.ResourceSelection || {
            glowColor: "#ffeb3b", targetColor: "#00e5ff",
            glowOuterStrength: 2, glowInnerStrength: 0,
            glowAlpha: 0.1, glowQuality: 12, depth: 15
        };

        const activeIds = new Set();
        const selectedResId = GameEngine.state.selectedResourceId;
        if (selectedResId) {
            const parts = selectedResId.split('_');
            const res = GameEngine.state.mapData.getResource(parseInt(parts[0]), parseInt(parts[1]));
            if (res && res.type !== 0) {
                activeIds.add(selectedResId + "_sel");
            } else {
                // [核心修復] 若資源已枯竭，自動清除全域選取狀態，防止殘留描邊
                GameEngine.state.selectedResourceId = null;
            }
        }

        const selectedIds = GameEngine.state.selectedUnitIds || [];
        selectedIds.forEach(uid => {
            const u = GameEngine.state.units.villagers.find(v => v.id === uid);
            if (u && u.targetId && u.targetId.gx !== undefined) {
                const res = GameEngine.state.mapData.getResource(u.targetId.gx, u.targetId.gy);
                if (res && res.type !== 0) {
                    activeIds.add(`${u.targetId.gx}_${u.targetId.gy}_target`);
                }
            }
        });

        // 1. 建立或更新所需的 FX Sprite
        activeIds.forEach(fullId => {
            const parts = fullId.split('_');
            const gx = parseInt(parts[0]), gy = parseInt(parts[1]);
            const fxType = parts[2]; // "sel" or "target"

            const res = GameEngine.state.mapData.getResource(gx, gy);
            if (!res) return;

            let fxSprite = this.resourceFXMap.get(fullId);
            if (!fxSprite) {
                const textureKey = this.getTextureKeyFromType(res.type);
                fxSprite = this.add.sprite(0, 0, textureKey);
                fxSprite.setDepth(cfgFX.depth); // 使用設定的深度

                // 套用描邊或發光效果
                if (fxSprite.postFX) {
                    const colorStr = fxType === 'sel' ? cfgFX.glowColor : cfgFX.targetColor;
                    // 指令修復：處理 8 位元 Hex (RGBA)，只取前 6 位 (RGB)
                    let cleanColor = colorStr.replace('#', '');
                    if (cleanColor.length > 6) cleanColor = cleanColor.substring(0, 6);
                    const color = parseInt(cleanColor, 16);

                    const glow = fxSprite.postFX.addGlow(
                        color,
                        cfgFX.glowOuterStrength,
                        cfgFX.glowInnerStrength,
                        cfgFX.glowKnockOut !== undefined ? cfgFX.glowKnockOut : true, // [修正] 使用 KnockOut 隱藏發光物件的中心本體
                        cfgFX.glowAlpha,
                        cfgFX.glowQuality
                    );
                    fxSprite.setData('fx', glow);
                }

                this.resourceFXMap.set(fullId, fxSprite);
            }

            // 更新位置與縮放
            const TS = GameEngine.TILE_SIZE;
            const typeMap = { 1: 'WOOD', 2: 'STONE', 3: 'FOOD', 4: 'GOLD' };
            const resCfg = GameEngine.state.resourceConfigs.find(c => c.type === typeMap[res.type] && c.lv === (res.level || 1));

            // 讀取視覺變量中的隨機縮放
            const idx = GameEngine.state.mapData.getIndex(gx, gy);
            const varInfo = idx !== -1 ? GameEngine.state.mapData.variationGrid[idx] : 0xFFFFFF;
            const vScale = ((varInfo >> 24) & 0xFF) / 100 || 1.0;

            fxSprite.x = gx * TS + TS / 2;
            fxSprite.y = gy * TS + TS / 2;
            if (resCfg && resCfg.model_size) {
                const s = cfgFX.selectionScale || 1.1;
                fxSprite.setScale(resCfg.model_size.x * vScale * s, resCfg.model_size.y * vScale * s);
            }
            fxSprite.setVisible(true);
        });

        // 2. 清理不再需要的 FX Sprite
        for (const [fid, sprite] of this.resourceFXMap.entries()) {
            if (!activeIds.has(fid)) {
                sprite.destroy();
                this.resourceFXMap.delete(fid);
            }
        }
    }

    getTextureKeyFromType(typeNum) {
        const typeMap = { 1: 'tex_tree', 2: 'tex_stone', 3: 'tex_food', 4: 'tex_gold' };
        return typeMap[typeNum] || 'tex_tree';
    }

    drawResourceOutline(g, gx, gy, color) {
        // 此方法已由 updateResourceFX 取代，為保持兼容性保留空函式或轉移邏輯
    }

    drawSingleSelectionBox(g, ent, color) {
        const TS = GameEngine.TILE_SIZE;
        const cfg = GameEngine.getEntityConfig(ent.type);
        if (!cfg) return;

        let uw = 1, uh = 1;
        if (cfg.size) {
            const cleanSize = cfg.size.toString().replace(/['"]/g, '');
            const match = cleanSize.match(/\{[ ]*([\d.]+)[ ]*,[ ]*([\d.]+)[ ]*\}/);
            if (match) { uw = parseFloat(match[1]); uh = parseFloat(match[2]); }
        }

        const w = uw * TS;
        const h = uh * TS;

        g.lineStyle(4, color, 1);
        g.strokeRect(ent.x - w / 2 - 2, ent.y - h / 2 - 2, w + 4, h + 4);
        g.lineStyle(1.5, 0xffffff, 1);
        g.strokeRect(ent.x - w / 2 - 0, ent.y - h / 2 - 0, w, h);
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

        // 2. 處理選中單位的持久目標 (僅當單位在移動或有目標時)
        const selectedIds = GameEngine.state.selectedUnitIds || [];
        if (selectedIds.length > 0) {
            const drawnPos = new Set();
            selectedIds.forEach(id => {
                const u = GameEngine.state.units.villagers.find(v => v.id === id);
                if (!u) return;

                // 2. 敵人的目標點不顯示 (僅顯示友方單位的移動目的地)
                const isEnemy = (u.config && u.config.camp === 'enemy') || u.camp === 'enemy';
                if (isEnemy) return;

                // 2. 只有狀態不是 IDLE 或是有目標時才顯示
                if (u.targetId) {
                    // [核心修正] 不再在此處顯示攻擊目標點（縮放紅圈）。
                    // 根據玩家要求，攻擊目標只需常態顯示自身紅圈與血條，不需要點擊指示器。
                } else if (u.idleTarget && u.state !== 'IDLE') {
                    const key = `ground_${Math.floor(u.idleTarget.x)}_${Math.floor(u.idleTarget.y)}`;
                    if (!drawnPos.has(key)) {
                        this.drawTargetIndicator(g, u.idleTarget.x, u.idleTarget.y, 'ground', cfg.alpha || 0.7, now);
                        drawnPos.add(key);
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
        const parseColor = (c) => typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c;

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

        // 框框本體 (綠色透明)
        g.fillStyle(0x00ff00, 0.15);
        g.fillRect(x, y, w, h);

        // 框框輪廓 (綠色實線)
        g.lineStyle(1.5, 0x00ff00, 0.8);
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
            visibleIds.add(id);

            let displayObj = this.entities.get(id);

            if (!displayObj) {
                if (newlyCreatedCount >= MAX_NEW_PER_FRAME) {
                    this.pendingVisibleEntities = true;
                    continue;
                }

                const textureKey = this.getTextureKey(ent.type);
                if (textureKey && this.textures.exists(textureKey)) {
                    displayObj = this.add.image(ent.x, ent.y, textureKey);
                    this.entities.set(id, displayObj);
                    this.entityGroup.add(displayObj);
                    displayObj.setDepth(10);
                } else if (!textureKey && !['campfire'].includes(ent.type)) {
                    displayObj = this.add.graphics();
                    this.drawEntity(displayObj, ent, 1.0);
                    this.entities.set(id, displayObj);
                    this.entityGroup.add(displayObj);
                    displayObj.setDepth(10);
                }
                newlyCreatedCount++;
            }

            if (displayObj) {
                if (!displayObj.visible) displayObj.setVisible(true);
                if (displayObj.x !== ent.x || displayObj.y !== ent.y) displayObj.setPosition(ent.x, ent.y);

                if (displayObj instanceof Phaser.GameObjects.Image) {
                    const targetAlpha = ent.isUnderConstruction ? 0.6 : 1.0;
                    if (displayObj.alpha !== targetAlpha) displayObj.setAlpha(targetAlpha);

                    const cfg = GameEngine.getEntityConfig(ent.type);
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
            if (ent.type === 'campfire' && !ent.isUnderConstruction) {
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
                    if (this.emitters.has(id)) this.emitters.get(id).setVisible(false);
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
        const typeMap = { 1: 'tree', 2: 'stone', 3: 'food', 4: 'gold' };
        const typeNameMap = { 1: 'WOOD', 2: 'STONE', 3: 'FOOD', 4: 'GOLD' };

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
        img.setDepth(8);
        this.resourceGroup.add(img);
        return img;
    }

    returnBobToPool(type, bob) {
        bob.setVisible(false);
        if (this.resourcePools[type]) {
            this.resourcePools[type].push(bob);
        }
    }

    handleCampfireParticles(id, ent, isVisible) {
        let emitter = this.emitters.get(id);
        if (!emitter) {
            const cfg = UI_CONFIG.ResourceRenderer.Campfire.particle;
            emitter = this.add.particles(ent.x, ent.y, 'fire_particle', {
                lifespan: cfg.lifespan,
                speedY: cfg.speedY,
                scale: cfg.scale,
                alpha: cfg.alpha,
                tint: cfg.tints.map(t => this.hexOrRgba(t).color),
                blendMode: cfg.blendMode,
                frequency: cfg.frequency,
                x: { min: -cfg.spreadX, max: cfg.spreadX },
                y: { min: cfg.offsetY, max: 0 }
            });
            emitter.setDepth(15);
            this.emitters.set(id, emitter);
        }
        if (emitter.x !== ent.x || emitter.y !== ent.y) emitter.setPosition(ent.x, ent.y);
        if (emitter.visible !== isVisible) emitter.setVisible(isVisible);
    }

    cleanupEntityLabels(id) {
        const labels = [this.queueTexts, this.nameLabels, this.levelLabels, this.resourceLabels, this.unitIconTexts, this.emitters];
        labels.forEach(map => {
            if (map.has(id)) {
                map.get(id).destroy();
                map.delete(id);
            }
        });
    }

    updateEntityLabel(id, ent) {
        const cfg = UI_CONFIG.MapResourceLabels;
        const config = GameEngine.state.buildingConfigs[ent.type];
        const isBuilding = !!config;

        const showLabels = isBuilding ? true : GameEngine.state.settings.showResourceInfo;

        if (!this._cachedLabelValues) this._cachedLabelValues = new Map();
        let cache = this._cachedLabelValues.get(id);
        if (!cache) {
            cache = { name: '', level: '', amount: -1, visible: false };
            this._cachedLabelValues.set(id, cache);
        }

        // 1. 取得視覺物件中心點 (世界座標直接就是中心)
        const visualX = Math.round(ent.x);
        const visualY = Math.round(ent.y);

        // 2. 名稱標籤 (Name)
        const nameStr = ent.isUnderConstruction ? "施工中" : (ent.name || ent.type);
        let nameTxt = this.nameLabels.get(id);
        if (!nameTxt) {
            nameTxt = this.add.text(visualX, visualY, nameStr, {
                font: cfg.name.fontSize,
                fill: cfg.name.color,
                align: 'center'
            }).setOrigin(0.5, 0.5);
            nameTxt.setStroke(this.hexToCssRgba(cfg.name.outlineColor, cfg.name.outlineAlpha), cfg.name.outlineWidth);
            nameTxt.setDepth(50);
            this.nameLabels.set(id, nameTxt);
        }

        if (cache.name !== nameStr) {
            nameTxt.setText(nameStr);
            cache.name = nameStr;
        }
        const nOffY = isBuilding ? (cfg.name.buildingOffsetY || -15) : (cfg.name.offsetY || -45);
        const tx = visualX + (cfg.name.offsetX || 0);
        const ty = visualY + nOffY;
        if (nameTxt.x !== tx || nameTxt.y !== ty) {
            nameTxt.setPosition(tx, ty);
        }
        if (nameTxt.visible !== showLabels) nameTxt.setVisible(showLabels);

        // 3. 等級標籤 (Level)
        let lvlTxt = this.levelLabels.get(id);
        if (ent.level !== undefined) {
            const levelStr = `Lv.${ent.level}`;
            if (!lvlTxt) {
                lvlTxt = this.add.text(visualX, visualY, levelStr, {
                    font: cfg.level.fontSize,
                    fill: cfg.level.color,
                    align: 'center'
                }).setOrigin(0.5, 0.5);
                lvlTxt.setStroke(this.hexToCssRgba(cfg.level.outlineColor, cfg.level.outlineAlpha), cfg.level.outlineWidth);
                lvlTxt.setDepth(50);
                this.levelLabels.set(id, lvlTxt);
            }
            if (cache.level !== levelStr) {
                lvlTxt.setText(levelStr);
                cache.level = levelStr;
            }
            const lOffY = isBuilding ? (cfg.level.buildingLevelOffsetY || -35) : (cfg.level.offsetY || -65);
            const ltx = visualX + (cfg.level.offsetX || 0);
            const lty = visualY + lOffY;
            if (lvlTxt.x !== ltx || lvlTxt.y !== lty) {
                lvlTxt.setPosition(ltx, lty);
            }
            if (lvlTxt.visible !== showLabels) lvlTxt.setVisible(showLabels);
        } else if (lvlTxt && lvlTxt.visible) {
            lvlTxt.setVisible(false);
        }

        // 3. 數量標籤 (Amount)
        let amtTxt = this.resourceLabels.get(id);
        if (ent.amount !== undefined) {
            const amountVal = Math.floor(ent.amount);
            const amountStr = `(${amountVal})`;
            if (!amtTxt) {
                amtTxt = this.add.text(visualX, visualY, amountStr, {
                    font: cfg.amount.fontSize,
                    fill: cfg.amount.color,
                    align: 'center'
                }).setOrigin(0.5, 0.5);
                amtTxt.setStroke(this.hexToCssRgba(cfg.amount.outlineColor, cfg.amount.outlineAlpha), cfg.amount.outlineWidth);
                amtTxt.setDepth(50);
                this.resourceLabels.set(id, amtTxt);
            }
            if (cache.amount !== amountVal) {
                amtTxt.setText(amountStr);
                cache.amount = amountVal;
            }
            const atx = visualX + (cfg.amount.offsetX || 0);
            const aty = visualY + (cfg.amount.offsetY || 0);
            if (amtTxt.x !== atx || amtTxt.y !== aty) {
                amtTxt.setPosition(atx, aty);
            }
            if (amtTxt.visible !== showLabels) amtTxt.setVisible(showLabels);
        } else if (amtTxt && amtTxt.visible) {
            amtTxt.setVisible(false);
        }
    }

    hideEntityLabel(id) {
        const labels = [this.nameLabels, this.levelLabels, this.resourceLabels, this.queueTexts];
        labels.forEach(map => {
            if (map.has(id)) {
                const obj = map.get(id);
                if (obj.visible) obj.setVisible(false);
            }
        });
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
            'gold_mining_factory': 'tex_gold_mining_factory',
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
        if (type.startsWith('gold')) return 'tex_gold';

        return null;
    }

    drawEntity(g, ent, alpha, offX = 0, offY = 0) {
        const TS = GameEngine.TILE_SIZE;
        const cfg = GameEngine.getEntityConfig(ent.type);
        let uw = 1, uh = 1;
        if (cfg && cfg.size) {
            const cleanSize = cfg.size.toString().replace(/['"]/g, '');
            const match = cleanSize.match(/\{[ ]*([\d.]+)[ ]*,[ ]*([\d.]+)[ ]*\}/);
            if (match) {
                uw = parseFloat(match[1]);
                uh = parseFloat(match[2]);
            }
        }

        const isUnderConstruction = ent.isUnderConstruction === true || ent.isUnderConstruction === 1;
        const finalAlpha = isUnderConstruction ? (alpha * 0.5) : Math.max(alpha, 0.6);

        // 如果是預覽模式，加強視覺引導：外框與高透明度
        if (alpha < 1.0) {
            const previewColor = ent.previewColor || 0x2196f3; // 預設藍色，若受阻則傳入紅色
            g.lineStyle(2, previewColor, 0.8);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        }

        const isSelected = window.UIManager && window.UIManager.activeMenuEntity === ent;
        if (isSelected) {
            g.lineStyle(4, 0xffeb3b, 1);
            g.strokeRect(offX - (uw * TS) / 2 - 2, offY - (uh * TS) / 2 - 2, uw * TS + 4, uh * TS + 4);
        }

        if (ent.type === 'village' || ent.type === 'town_center') {
            g.fillStyle(0x8d6e63, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(1, 0x5d4037, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'farmhouse') {
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
        } else if (ent.type === 'timber_factory') {
            g.fillStyle(0x388e3c, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x1b5e20, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'stone_factory' || ent.type === 'quarry') {
            g.fillStyle(0x455a64, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x263238, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'barn') {
            g.fillStyle(0xa1887f, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x5d4037, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'gold_mining_factory') {
            g.fillStyle(0xfbc02d, finalAlpha); // 鮮亮的黃色
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xf57f17, finalAlpha); // 橘黃色輪廓
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            // 加點晶體裝飾感
            g.fillStyle(0xfff176, finalAlpha);
            g.fillCircle(offX, offY, 15);
        } else if (ent.type === 'farmland') {
            g.fillStyle(0xdce775, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(1, 0xafb42b, finalAlpha);
            for (let i = -(uw / 2); i < uw / 2; i += 0.5) {
                g.lineBetween(offX + i * TS, offY - (uh * TS) / 2 + 5, offX + i * TS, offY + (uh * TS) / 2 - 5);
            }
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'tree_plantation') {
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
        } else if (ent.type === 'mage_place') {
            g.fillStyle(0x4a148c, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xe1f5fe, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.fillStyle(0xffd600, finalAlpha);
            g.fillCircle(offX, offY, 20);
        } else if (ent.type === 'swordsman_place') {
            g.fillStyle(0x455a64, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xf44336, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.fillStyle(0xffccbc, finalAlpha);
            g.fillRect(offX - 10, offY - 10, 20, 20);
        } else if (ent.type === 'archer_place') {
            g.fillStyle(0x795548, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xffeb3b, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xf44336, finalAlpha);
            g.strokeCircle(offX, offY, 15);
            g.strokeCircle(offX, offY, 5);
        } else if (ent.type === 'campfire') {
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
        } else if (ent.type.startsWith('tree') || ent.type.startsWith('wood')) {
            g.fillStyle(0x2e7d32, finalAlpha);
            g.fillCircle(offX, offY, 20);
        } else if (ent.type.startsWith('stone')) {
            g.fillStyle(0x757575, finalAlpha);
            g.beginPath();
            g.moveTo(offX - 20, offY + 10);
            g.lineTo(offX, offY - 15);
            g.lineTo(offX + 25, offY + 15);
            g.fillPath();
        } else if (ent.type.startsWith('food')) {
            g.fillStyle(0xc2185b, finalAlpha);
            g.fillCircle(offX, offY, 18);
        }
    }

    drawBuildProgressBar(g, ent, uw, uh, TS) {
        const cfg = UI_CONFIG.BuildingProgressBar;
        const progress = ent.buildProgress / (ent.buildTime || 1);

        const overrides = cfg.overrides && cfg.overrides[ent.type] ? cfg.overrides[ent.type] : {};
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
        const isPopFull = GameEngine.state.units.villagers.length >= maxPop;
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

        // 2. 繪製進度內容
        const fillColor = isPopFull ? 0xf44336 : 0x4caf50;
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
        const currentUnitId = queue[0];
        const unitName = GameEngine.state.idToNameMap[currentUnitId] || currentUnitId;
        const emoji = iconMap[currentUnitId] || iconMap[unitName] || '👤';

        let iconTxt = this.unitIconTexts.get(id);
        if (!iconTxt) {
            iconTxt = this.add.text(bx + 15, by + 17, emoji, { fontSize: '18px' }).setOrigin(0.5);
            iconTxt.setDepth(100);
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
            qTxt.setDepth(101);
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

            sprite.setVisible(isVisible);
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
                sprite.setDepth(200);
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
        if (!unit.config || unit.config.camp !== 'enemy') return;

        const cfg = UI_CONFIG.NPCLabel || { fontSize: "bold 14px Arial", enemyColor: "#ff4444", offsetY: -65 };
        const labelStr = `${unit.config.name || '敵人'} (Lv. ${unit.config.lv || 1})`;

        let label = this.nameLabels.get(id);
        if (!label) {
            label = this.add.text(x, y + cfg.offsetY, labelStr, {
                font: cfg.fontSize,
                fill: cfg.enemyColor,
                align: 'center'
            }).setOrigin(0.5, 0.5);

            label.setStroke('#000000', 3);
            label.setShadow(1, 1, 'rgba(0,0,0,0.6)', 2);
            label.setDepth(210);
            this.nameLabels.set(id, label);
        }

        // 徹底穩定化：直接使用整數座標，不添加任何 breathing 偏移
        label.setPosition(Math.round(x), Math.round(y + cfg.offsetY));
        if (label.text !== labelStr) label.setText(labelStr);
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
                type: state.placingType,
                previewColor: isClear ? 0x2196f3 : 0xf44336
            }, isClear ? 0.5 : 0.7, state.previewPos.x, state.previewPos.y);
        }

        // 批量預覽 (Line)
        if (state.buildingMode === 'LINE' && state.linePreviewEntities) {
            const tempPlaced = [];
            state.linePreviewEntities.forEach(pos => {
                const isClear = GameEngine.isAreaClear(pos.x, pos.y, state.placingType, tempPlaced);
                this.drawEntity(g, {
                    type: state.placingType,
                    previewColor: isClear ? 0x2196f3 : 0xf44336
                }, isClear ? 0.3 : 0.6, pos.x, pos.y);

                if (isClear) tempPlaced.push({ type: state.placingType, x: pos.x, y: pos.y });
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
}
