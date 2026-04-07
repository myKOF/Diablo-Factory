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

        // 效能協議：為資源實作物業層級的 Blitter (離屏快取渲染方案)
        // Blitter 對於數千個相同材質的靜態物件有無與倫比的效能
        this.resourceBlitters = {
            'tree': this.add.blitter(0, 0, 'tex_tree').setDepth(8),
            'stone': this.add.blitter(0, 0, 'tex_stone').setDepth(8),
            'food': this.add.blitter(0, 0, 'tex_food').setDepth(8),
            'gold': this.add.blitter(0, 0, 'tex_gold').setDepth(8)
        };
        this.resourceBobs = new Map(); // 格網鍵值 (gx_gy) -> { type, bob }
        this.resourcePools = { 'tree': [], 'stone': [], 'food': [], 'gold': [] };

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

            // 1. 左鍵點擊/選取邏輯
            if (pointer.leftButtonDown() && !isPlacement && !isMiddleDrag) {
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
                        // 雙擊：選取畫面內相同類型的單位 (以 npc_data 中的 type 決定)
                        const unitType = clickedUnit.config.type;
                        const cam = this.cameras.main;

                        const newlySelected = GameEngine.state.units.villagers
                            .filter(v => v.config && v.config.type === unitType &&
                                v.x >= cam.scrollX && v.x <= cam.scrollX + cam.width &&
                                v.y >= cam.scrollY && v.y <= cam.scrollY + cam.height);

                        if (isShift) {
                            newlySelected.forEach(u => {
                                if (!GameEngine.state.selectedUnitIds.includes(u.id)) GameEngine.state.selectedUnitIds.push(u.id);
                            });
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
                    return; // 點中單位就不觸發拖曳
                } else {
                    // 點擊地面：準備框選 (如果沒有 Shift 則清除舊選取)
                    if (!pointer.event.shiftKey) {
                        GameEngine.state.selectedUnitIds = [];
                        GameEngine.state.lastSelectedUnitId = null;
                        if (window.UIManager) window.UIManager.hideContextMenu(); // 同步關閉 UI 選單
                    }
                    this.selectionStartPos = { x: pointer.worldX, y: pointer.worldY };
                }
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
                // 必須使用本地 snapshots (rightClickWasPlacement) 以防止與 UIManager 全域狀態的清理順序產生競爭。
                if (this.rightClickWasPlacement || GameEngine.state.rightClickStartedInPlacementMode) {
                    this.rightClickWasPlacement = false;
                    GameEngine.state.rightClickStartedInPlacementMode = false;
                    // 注意：此處僅負責攔截指令，具體的「取消虛影」邏輯由 UIManager.handleWorldMouseUp 負責 (因為那邊有精確的 drift 判斷)
                    return;
                }
                
                // 重置標記以防萬一
                this.rightClickWasPlacement = false;
                GameEngine.state.rightClickStartedInPlacementMode = false;

                const dragDist = this.dragStartPos ? Math.hypot(pointer.x - this.dragStartPos.x, pointer.y - this.dragStartPos.y) : 0;
                // 3. 即使沒觸發 move 事件，位移超過設定門檻仍視為拖動 (放寬容錯率)
                const threshold = (UI_CONFIG.Interaction && UI_CONFIG.Interaction.minDragDistance) || 10;
                if (dragDist > threshold) return;

                // 1. 識別點擊目標 (碰撞檢測)
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

                // 其次檢測建築 (mapEntities)
                if (!clickedEnemy) {
                    GameEngine.state.mapEntities.forEach(e => {
                        const d = Math.hypot(e.x - pointer.worldX, e.y - pointer.worldY);
                        if (d < bestDist) { bestDist = d; clickedEntity = e; }
                    });
                }

                // 最後檢測資源 (MapDataSystem)
                if (!clickedEnemy && !clickedEntity && GameEngine.state.mapData) {
                    const TS = GameEngine.TILE_SIZE;
                    const gx = Math.floor(pointer.worldX / TS);
                    const gy = Math.floor(pointer.worldY / TS);
                    const res = GameEngine.state.mapData.getResource(gx, gy);
                    if (res) {
                        const rx = gx * TS + TS / 2;
                        const ry = gy * TS + TS / 2;
                        const d = Math.hypot(rx - pointer.worldX, ry - pointer.worldY);
                        if (d < bestDist) {
                            // 模擬 Entity 物件
                            clickedEntity = {
                                id: `tile_${gx}_${gy}`,
                                gx, gy,
                                x: rx, y: ry,
                                type: res.type === 1 ? 'WOOD' : (res.type === 2 ? 'STONE' : (res.type === 3 ? 'FOOD' : 'GOLD')),
                                resourceType: res.type === 1 ? 'WOOD' : (res.type === 2 ? 'STONE' : (res.type === 3 ? 'FOOD' : 'GOLD')),
                                amount: res.amount
                            };
                        }
                    }
                }

                // 觸發點擊效果 (無論是否有選中單位)
                if (clickedEnemy) {
                    this.addClickEffect(clickedEnemy.x, clickedEnemy.y, 'enemy');
                } else if (clickedEntity) {
                    this.addClickEffect(clickedEntity.x, clickedEntity.y, 'ground');
                } else {
                    this.addClickEffect(pointer.worldX, pointer.worldY, 'ground');
                }

                const selectedIds = GameEngine.state.selectedUnitIds || [];
                if (selectedIds.length > 0) {
                    const unitsToMove = selectedIds.map(id => GameEngine.state.units.villagers.find(v => v.id === id)).filter(v => v);

                    const colsNum = Math.ceil(Math.sqrt(unitsToMove.length));
                    const spacing = 40;

                    unitsToMove.forEach((unit, i) => {
                        if (clickedEnemy) {
                            // 追擊指令：直接設定目標
                            this.handleRightClickCommand(unit, pointer, clickedEnemy);
                        } else {
                            // 移動指令：計算陣型偏移
                            const r = Math.floor(i / colsNum);
                            const c = i % colsNum;
                            const offX = (c - (colsNum - 1) / 2) * spacing;
                            const offY = (r - (colsNum - 1) / 2) * spacing;
                            const fakePointer = { worldX: pointer.worldX + offX, worldY: pointer.worldY + offY };
                            this.handleRightClickCommand(unit, fakePointer);
                        }
                    });
                }
            }

            // 結束框選
            if (this.selectionStartPos) {
                const start = this.selectionStartPos;
                const end = { x: pointer.worldX, y: pointer.worldY };

                const minX = Math.min(start.x, end.x);
                const maxX = Math.max(start.x, end.x);
                const minY = Math.min(start.y, end.y);
                const maxY = Math.max(start.y, end.y);

                // 如果拖曳距離足夠大 (避免微小誤觸)
                if (Math.abs(maxX - minX) > 5 || Math.abs(maxY - minY) > 5) {
                    const boxUnits = GameEngine.state.units.villagers.filter(v =>
                        v.x >= minX && v.x <= maxX && v.y >= minY && v.y <= maxY
                    );

                    if (pointer.event.shiftKey) {
                        boxUnits.forEach(u => {
                            if (!GameEngine.state.selectedUnitIds.includes(u.id)) GameEngine.state.selectedUnitIds.push(u.id);
                        });
                    } else {
                        GameEngine.state.selectedUnitIds = boxUnits.map(v => v.id);
                    }
                    if (boxUnits.length > 0) GameEngine.addLog(`[選取] 框選操作選中了 ${boxUnits.length} 個單位。`);
                }

                this.selectionStartPos = null;
                this.marqueeGraphics.clear();
            }

            if (pointer.button !== 2) {
                this.isDragging = false;
            }
            this.dragStartPos = null;
        });
    }

    /**
     * 處理單位的右鍵指令（移動或攻擊）
     */
    handleRightClickCommand(unit, pointer, clickedTarget = null) {
        // [最終防護] 若正處於建造預覽狀態，或按下鼠標時正處於建造預覽狀態，屏蔽所有指令
        if (GameEngine.state.placingType || GameEngine.state.rightClickStartedInPlacementMode) return;

        // 先判斷 npc 的 type，若為敵方則不執行指令
        const type = unit.config ? unit.config.type : '';
        if (type === 'wolf' || type === 'bear') return;

        const wx = pointer.worldX, wy = pointer.worldY;

        // 1. 執行命令
        if (clickedTarget) {
            const isResource = !!clickedTarget.gx;
            
            if (isResource) {
                // 點擊的是資源格 (MapDataSystem)
                unit.state = 'MOVING_TO_RESOURCE';
                // 暫時重置採集類型 (讓 MOVING_TO_RESOURCE 邏輯接管)
                unit.targetId = clickedTarget; 
                unit.pathTarget = null;
                unit.isManualCommand = true;
                GameEngine.addLog(`[命令] ${unit.configName} 正在前往採集資源。`);
            } else {
                // 點擊的是實體 (敵軍或建築)
                unit.targetId = clickedTarget.id;
                unit.forceFocus = true;
                unit.state = 'CHASE';
                unit.idleTarget = { x: clickedTarget.x, y: clickedTarget.y };
                unit.isManualCommand = true;
                unit.chaseFrame = 999;
                GameEngine.addLog(`[命令] ${unit.configName} 正在追擊目標 ${clickedTarget.configName || '目標'}。`);
            }
        } else {
            // 移動指令：完全清除所有任務內容，防止系統重新分配回去做老本行
            unit.targetId = null;
            unit.forceFocus = false; // 點擊地面重置強制鎖定
            unit.constructionTarget = null;
            unit.assignedWarehouseId = null;

            // 安全檢查：若目標點不可行走(在建築內)，導航至週邊最近可用點
            const TS = GameEngine.TILE_SIZE;
            const gx = Math.floor(wx / TS);
            const gy = Math.floor(wy / TS);
            let finalTx = wx, finalTy = wy;
            const pf = GameEngine.state.pathfinding;

            // 修正：必須將像素坐標轉為格網索引，否則判定永遠失效
            if (pf && !pf.isValidAndWalkable(gx, gy, true)) {
                const nearestArr = pf.getNearestWalkableTile(gx, gy, 50, true);
                if (nearestArr) {
                    finalTx = nearestArr.x * TS + TS / 2;
                    finalTy = nearestArr.y * TS + TS / 2;
                }
            }

            // 核心修復：只有當新目標與舊目標距離大於一定閾值時，才清除舊路徑。
            // 這能防止快速雙擊右鍵時，第二下無意中清除了第一下剛計算好的尋路路徑，導致單位變回「直線前進」。
            const distToExisting = unit.idleTarget ? Math.hypot(unit.idleTarget.x - finalTx, unit.idleTarget.y - finalTy) : 999;
            if (distToExisting > 10) {
                unit.pathTarget = null;
                unit.fullPath = null;
            }

            unit.idleTarget = { x: finalTx, y: finalTy };
            unit.state = 'IDLE';
            unit.isManualCommand = true;
            GameEngine.addLog(`[命令] ${unit.configName} 移動至目的並待命。`);
        }
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

        // 2. [戰鬥目標] 建築目標框 (紅色，目前被我方選中單位鎖定攻擊的目標)
        const selectedIds = GameEngine.state.selectedUnitIds || [];
        if (selectedIds.length > 0) {
            const targetedEntities = new Set();
            GameEngine.state.units.villagers.forEach(u => {
                if (selectedIds.includes(u.id) && u.targetId) {
                    const ent = GameEngine.state.mapEntities.find(e => e.id === u.targetId);
                    if (ent) targetedEntities.add(ent);
                }
            });

            targetedEntities.forEach(ent => {
                this.drawSingleSelectionBox(g, ent, 0xf44336); // 紅色選定框
            });
        }
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
        
        // 類型映射 (1: tree, 2: stone, 3: food, 4: gold)
        const typeMap = { 1: 'tree', 2: 'stone', 3: 'food', 4: 'gold' };

        // 1. 放置/更新資源 Bob 與 標籤
        for (let i = 0; i < resources.length; i++) {
            const res = resources[i];
            const key = `${res.gx}_${res.gy}`;
            visibleKeys.add(key);

            let bobInfo = this.resourceBobs.get(key);
            const typeStr = typeMap[res.type] || 'tree';

            if (!bobInfo) {
                // 從池中獲取或新建 Bob
                const bob = this.getBobFromPool(typeStr);
                if (bob) {
                    const TEX_OFF = 60; // 120 / 2
                    bob.x = (res.gx * TS + TS / 2) - TEX_OFF;
                    bob.y = (res.gy * TS + TS / 2) - TEX_OFF;
                    bob.setVisible(true);
                    
                    // 套用視覺變量 (如 Tint)
                    const idx = mapData.getIndex(res.gx, res.gy);
                    const variation = mapData.variationGrid[idx];
                    if (variation) bob.setTint(variation);

                    bobInfo = { type: typeStr, bob: bob };
                    this.resourceBobs.set(key, bobInfo);
                }
            } else if (bobInfo.type !== typeStr) {
                // 類型改變 (較少見，可能是地圖編輯)
                this.returnBobToPool(bobInfo.type, bobInfo.bob);
                const newBob = this.getBobFromPool(typeStr);
                const TEX_OFF = 60; // 120 / 2
                newBob.x = (res.gx * TS + TS / 2) - TEX_OFF;
                newBob.y = (res.gy * TS + TS / 2) - TEX_OFF;
                newBob.setVisible(true);
                bobInfo.type = typeStr;
                bobInfo.bob = newBob;
            }

            // 更新資源標籤 (基於 MapDataSystem)
            const dummyEnt = {
                id: key,
                x: res.gx * TS + TS / 2,
                y: res.gy * TS + TS / 2,
                type: typeStr,
                amount: res.amount,
                level: res.level
            };
            this.updateEntityLabel(key, dummyEnt);
        }

        // 2. 回收离开畫面的 Bob 與 標籤
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
        // 若池中無對象，新創一個
        const blitter = this.resourceBlitters[type];
        if (blitter) return blitter.create(0, 0);
        return null;
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
            g.lineStyle(2, 0x2196f3, 0.8);
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
            this.drawEntity(g, {
                type: state.placingType
            }, 0.5, state.previewPos.x, state.previewPos.y);
        }

        // 批量預覽 (Line)
        if (state.buildingMode === 'LINE' && state.linePreviewEntities) {
            state.linePreviewEntities.forEach(pos => {
                this.drawEntity(g, {
                    type: state.placingType
                }, 0.3, pos.x, pos.y); // 拉排預覽稍微淡一點
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
