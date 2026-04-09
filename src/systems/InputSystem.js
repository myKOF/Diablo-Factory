import { GameEngine } from "./game_systems.js";
import { UI_CONFIG } from "../ui/ui_config.js";

/**
 * InputSystem: 簡約邏輯穩定版
 * 嚴格遵循：1.拖動畫面 (不動作) 2.取消建築 (點擊優先) 3.移動單位 (無建築時)
 */
export class InputSystem {
    constructor(scene) {
        this.scene = scene;
        this.instanceId = Math.random().toString(36).substr(2, 5);

        if (window._globalInputSystem) {
            window._globalInputSystem.destroy();
        }
        window._globalInputSystem = this;

        // 從 UI_CONFIG 讀取最小拖動距離設定，預設為 5
        this.DRAG_THRESHOLD = (UI_CONFIG && UI_CONFIG.Interaction) ? UI_CONFIG.Interaction.minDragDistance : 5;
        this.didMove = false; // 關鍵：標記本次右鍵按下後是否「動過」
        this.rightDownInfo = null;
        this.lastX = 0;
        this.lastY = 0;

        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);

        console.log(`[InputSystem] 已初始化實例: ${this.instanceId} (穩定簡約版)`);
        this.setupListeners();
    }

    destroy() {
        if (!this.scene || !this.scene.input) return;
        this.scene.input.off('pointerdown', this.onPointerDown);
        this.scene.input.off('pointermove', this.onPointerMove);
        this.scene.input.off('pointerup', this.onPointerUp);
        if (window._globalInputSystem === this) window._globalInputSystem = null;
    }

    setupListeners() {
        const scene = this.scene;
        scene.input.on('pointerdown', this.onPointerDown);
        scene.input.on('pointermove', this.onPointerMove);
        scene.input.on('pointerup', this.onPointerUp);
    }

    onPointerDown(pointer) {
        if (pointer.button === 2) {
            // [核心防護] 過濾 Browser/Phaser 合成的假性 Down (例如跨越 UI 回到畫布時產生的 pointerover/pointerenter)
            // 確保只有真實的物理點擊才算是拖曳起點，防止干擾連續拖曳狀態
            if (pointer.event && pointer.event.type !== 'pointerdown' && pointer.event.type !== 'mousedown') {
                return;
            }

            const cam = this.scene.cameras.main;
            this.rightDownInfo = { 
                id: pointer.id, 
                x: pointer.x, 
                y: pointer.y,
                time: Date.now(),
                scrollX: cam ? cam.scrollX : 0,
                scrollY: cam ? cam.scrollY : 0
            };
            this.didMove = false; // 1. 按下時，重置移動狀態為「沒動過」
            this.lastX = pointer.x;
            this.lastY = pointer.y;
        }
    }

    onPointerMove(pointer) {
        if (this.rightDownInfo && pointer.id === this.rightDownInfo.id) {
            // [核心防護] 處理滑鼠在視窗/瀏覽器外放開，再移回視窗內造成的「無限拖曳」問題
            // 若偵測到指標移動時，物理右鍵 (buttons & 2) 已不再處於按壓狀態，即代表在外部被放開了
            if (pointer.event && (pointer.event.buttons & 2) === 0) {
                this.rightDownInfo = null;
                this.didMove = false;
                return;
            }

            const dist = Math.hypot(pointer.x - this.rightDownInfo.x, pointer.y - this.rightDownInfo.y);

            // 只要位移超過門檻，就把「沒動過」變成「動過」
            if (dist > this.DRAG_THRESHOLD) {
                this.didMove = true; // 2. 標記為動過

                const dx = pointer.x - this.lastX;
                const dy = pointer.y - this.lastY;
                const cam = this.scene.cameras.main;
                if (cam) {
                    cam.scrollX -= dx;
                    cam.scrollY -= dy;
                    this.scene.lastManualDragTime = Date.now();
                }
            }
        }
        this.lastX = pointer.x;
        this.lastY = pointer.y;
    }

    onPointerUp(pointer) {
        if (pointer.button === 2) {
            if (!this.rightDownInfo) return;

            // [核心防護] 檢查這是否只是「移出畫布」進入 UI 面板所引發的假性放開 (pointerout)
            // e.buttons 的二進位表示目前實際按壓的按鈕，2 代表右鍵仍被硬體按死著
            if (pointer.event && (pointer.event.buttons & 2) !== 0) {
                return; // 直接無視，維持拖曳狀態！讓玩家可以在 UI 面板上順滑拖移而不中斷
            }

            const now = Date.now();

            // [全域防重] 無論是什麼類型的放開，一律防抖 (防止硬體微動連點在 50ms 內觸發兩次)
            if (window._lastRightUpProcessed && (now - window._lastRightUpProcessed < 50)) {
                this.rightDownInfo = null;
                this.didMove = false;
                return;
            }
            window._lastRightUpProcessed = now;

            const cam = this.scene.cameras.main;
            const duration = now - this.rightDownInfo.time;
            const totalDist = Math.hypot(pointer.x - this.rightDownInfo.x, pointer.y - this.rightDownInfo.y);

            let cameraMoved = false;
            if (cam) {
                cameraMoved = Math.abs(cam.scrollX - this.rightDownInfo.scrollX) > 0.1 || 
                              Math.abs(cam.scrollY - this.rightDownInfo.scrollY) > 0.1;
            }

            const isFinalDrag = this.didMove || totalDist > this.DRAG_THRESHOLD;

            if (isFinalDrag || cameraMoved) {
                // 如果本次操作是拖動，記錄拖動結束的時間
                window._lastDragEndTime = now;
            }

            // 檢查是否處於「剛結束拖動的冷卻期」(200ms 內)，避免硬體 Bounce 產生新的獨立 Click
            const timeSinceLastDrag = window._lastDragEndTime ? (now - window._lastDragEndTime) : 9999;
            const isJustAfterDrag = timeSinceLastDrag < 200;

            const CLICK_TIME_LIMIT = 250;
            // 極端嚴格的判定：相機沒動、沒有觸發過拖動、點擊時間短，且不是在剛結束拖拉之後
            const canMove = !cameraMoved && !isFinalDrag && (duration < CLICK_TIME_LIMIT) && !isJustAfterDrag;

            const panStatus = cameraMoved ? "畫面有動" : "畫面沒動";
            const dragStatus = isFinalDrag ? "判定為拖動" : "判定為點擊";
            const moveStatus = canMove ? "可移動" : "不可移動";

            GameEngine.addLog(`[Input-${this.instanceId}] 右鍵放開: ${panStatus} | ${dragStatus} | ${moveStatus} (Dist:${totalDist.toFixed(1)}, Time:${duration}ms, CD:${timeSinceLastDrag}ms)`, 'INPUT');

            // 3. 核心判定：判定為移動才執行動作
            if (canMove) {
                if (GameEngine.state.placingType || GameEngine.state.rightClickStartedInPlacementMode) {
                    GameEngine.addLog(`[Input] 單擊：取消建築`, 'INPUT');
                    if (this.scene.cancelPlacement) {
                        this.scene.cancelPlacement();
                    } else if (window.UIManager) {
                        window.UIManager.cancelBuildingMode();
                    } else {
                        GameEngine.state.placingType = null;
                    }
                } else if (window.UIManager && window.UIManager.activeMenuEntity) {
                    const activeEnt = window.UIManager.activeMenuEntity;
                    const bCfg = GameEngine.state.buildingConfigs[activeEnt.type];
                    
                    // 如果選中的建築可以集結 (有生產功能)
                    if (bCfg && bCfg.npcProduction && bCfg.npcProduction.length > 0) {
                        const isMulti = GameEngine.state.selectedBuildingIds && GameEngine.state.selectedBuildingIds.length > 1;
                        if (isMulti) {
                            // 多選模式：為所有同類型的選中建築設定集結點
                            const type = activeEnt.type;
                            const targets = GameEngine.state.mapEntities.filter(e => 
                                GameEngine.state.selectedBuildingIds.includes(e.id || `${e.type}_${e.x}_${e.y}`) &&
                                e.type === type && !e.isUnderConstruction
                            );
                            targets.forEach(t => this.handleRallyPoint(pointer, t, GameEngine.state.buildingConfigs[t.type]));
                        } else {
                            this.handleRallyPoint(pointer, activeEnt, bCfg);
                        }
                    } else {
                        this.handleUnitMove(pointer);
                    }
                } else {
                    this.handleUnitMove(pointer);
                }
            }

            // 清理狀態供下次使用
            this.rightDownInfo = null;
            this.didMove = false;
            GameEngine.state.rightClickStartedInPlacementMode = false;
        }
    }

    handleRallyPoint(pointer, ent, bCfg) {
        const pos = { x: pointer.worldX, y: pointer.worldY };
        let uw = 1, uh = 1;
        if (bCfg.size) {
            const m = bCfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
            if (m) { uw = parseInt(m[1]); uh = parseInt(m[2]); }
        }
        const halfW = (uw * GameEngine.TILE_SIZE) / 2;
        const halfH = (uh * GameEngine.TILE_SIZE) / 2;

        const isInside = pos.x >= ent.x - halfW && pos.x <= ent.x + halfW &&
            pos.y >= ent.y - halfH && pos.y <= ent.y + halfH;

        if (isInside) {
            ent.rallyPoint = null;
            GameEngine.addLog(`已取消建築集結點。`);
            if (window.UIManager) window.UIManager.updateValues(true);
        } else {
            ent.rallyPoint = pos;
            GameEngine.addLog(`${bCfg.name} 集結點已設定：(${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`);
            if (window.UIManager) window.UIManager.updateValues(true);
        }
    }

    handleUnitMove(pointer) {
        const scene = this.scene;
        // 確保建築模式下絕不觸發移動
        if (GameEngine.state.placingType) return;

        let clickedEnemy = null;
        let clickedEntity = null;
        let bestDist = 40;

        // --- 尋找目標的邏輯 (Agent原本寫的，保持不動) ---
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
                if (pointer.worldX >= e.x - w / 2 - 10 && pointer.worldX <= e.x + w / 2 + 10 &&
                    pointer.worldY >= e.y - h / 2 - 10 && pointer.worldY <= e.y + h / 2 + 10) {
                    clickedEntity = e;
                }
            });
        }

        if (!clickedEnemy && !clickedEntity && GameEngine.state.mapData) {
            const TS = GameEngine.TILE_SIZE;
            const clickX = pointer.worldX, clickY = pointer.worldY;
            const searchGx = Math.floor(clickX / TS), searchGy = Math.floor(clickY / TS);
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
                        clickedEntity = { id: `${gx}_${gy}`, gx, gy, x: rx, y: ry, type: typeName, resourceType: typeName, amount: res.amount };
                        break;
                    }
                }
                if (clickedEntity) break;
            }
        }

        const selectedIds = GameEngine.state.selectedUnitIds || [];
        if (selectedIds.length > 0) {
            const unitsToMove = selectedIds.map(id => GameEngine.state.units.villagers.find(v => v.id === id)).filter(v => v);
            if (unitsToMove.length > 0) {
                if (clickedEnemy) scene.addClickEffect(clickedEnemy.x, clickedEnemy.y, 'enemy');
                else if (clickedEntity) scene.addClickEffect(clickedEntity.x, clickedEntity.y, 'ground');
                else scene.addClickEffect(pointer.worldX, pointer.worldY, 'ground');
                const colsNum = Math.ceil(Math.sqrt(unitsToMove.length));
                const spacing = 40;
                unitsToMove.forEach((unit, i) => {
                    const r = Math.floor(i / colsNum), c = i % colsNum;
                    const offX = (c - (colsNum - 1) / 2) * spacing, offY = (r - (colsNum - 1) / 2) * spacing;
                    const offsetPointer = { worldX: pointer.worldX + offX, worldY: pointer.worldY + offY };
                    scene.handleRightClickCommand(unit, offsetPointer, clickedEnemy || clickedEntity);
                });
            }
        }
    }
}