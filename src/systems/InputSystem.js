import { GameEngine } from "./game_systems.js";
import { UI_CONFIG } from "../ui/ui_config.js";
import { ResourceSystem } from "./ResourceSystem.js";

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

                // [新功能] 檢查設置：若關閉右鍵拖拽，則跳過相機滾動邏輯
                if (GameEngine.state.settings.rightClickDrag === false) {
                    return;
                }

                const dx = pointer.x - this.lastX;
                const dy = pointer.y - this.lastY;
                const cam = this.scene.cameras.main;
                if (cam) {
                    const zoom = cam.zoom || 1;
                    cam.scrollX -= dx / zoom;
                    cam.scrollY -= dy / zoom;
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
                if ((GameEngine.state.logisticsDragLine || window.UIManager?.isLogisticsDragging) && window.UIManager?.cancelLogisticsDrag?.()) {
                    GameEngine.state.suppressRightClickMoveUntil = now + 250;
                    GameEngine.state.rightClickStartedInPlacementMode = false;
                    this.rightDownInfo = null;
                    this.didMove = false;
                    return;
                }
                if (GameEngine.state.suppressRightClickMoveUntil && now < GameEngine.state.suppressRightClickMoveUntil) {
                    this.rightDownInfo = null;
                    this.didMove = false;
                    return;
                }
                if (GameEngine.state.placingType || GameEngine.state.rightClickStartedInPlacementMode) {
                    GameEngine.addLog(`[Input] 單擊：取消建築`, 'INPUT');
                    if (this.scene.cancelPlacement) {
                        this.scene.cancelPlacement();
                    } else if (window.UIManager) {
                        window.UIManager.cancelBuildingMode();
                    } else {
                        GameEngine.state.placingType = null;
                    }
                    this.rightDownInfo = null;
                    this.didMove = false;
                    GameEngine.state.rightClickStartedInPlacementMode = false;
                    return;
                } else if (window.UIManager && window.UIManager.activeMenuEntity) {
                    const activeEnt = window.UIManager.activeMenuEntity;
                    const bCfg = GameEngine.state.buildingConfigs[activeEnt.type1];
                    
                    // 如果選中的建築可以集結 (有生產功能)
                    if (bCfg && bCfg.npcProduction && bCfg.npcProduction.length > 0) {
                        const isMulti = GameEngine.state.selectedBuildingIds && GameEngine.state.selectedBuildingIds.length > 1;
                        if (isMulti) {
                            // 多選模式：為所有同類型的選中建築設定集結點
                            const type1 = activeEnt.type1;
                            const targets = GameEngine.state.mapEntities.filter(e => 
                                GameEngine.state.selectedBuildingIds.includes(e.id || `${e.type1}_${e.x}_${e.y}`) &&
                                e.type1 === type1 && !e.isUnderConstruction
                            );
                            targets.forEach(t => this.handleRallyPoint(pointer, t, GameEngine.state.buildingConfigs[t.type1]));
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
        const TS = GameEngine.TILE_SIZE;
        const state = GameEngine.state;

        // [核心邏輯] 偵測點擊位置的物件類型以決定集結模式
        let clickedTarget = null;
        let targetType = 'GROUND';

        // 1. [優先權最高] 使用全域懸停目標 (MainScene 已計算過精確碰撞與深度優先級)
        if (state.hoveredId) {
            const hid = state.hoveredId;
            // A. 檢查是否點擊到單位
            const allUnits = [...(state.units.villagers || []), ...(state.units.npcs || [])];
            let found = allUnits.find(u => u.id === hid && u.hp > 0);
            if (found) {
                clickedTarget = found;
                targetType = 'UNIT';
            } 
            
            // B. 檢查是否點擊到建築物或屍體
            if (!clickedTarget) {
                found = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === hid);
                if (found) {
                    clickedTarget = found;
                    targetType = (found.type1 === 'corpse') ? 'RESOURCE' : 'BUILDING';
                }
            }

            // C. 檢查是否點擊到網格資源 (gx_gy)
            if (!clickedTarget && hid.includes('_')) {
                const parts = hid.split('_');
                if (parts.length === 2) {
                    const gx = parseInt(parts[0]), gy = parseInt(parts[1]);
                    if (!isNaN(gx) && !isNaN(gy)) {
                        const res = state.mapData.getResource(gx, gy);
                        if (res && res.type !== 0) {
                            clickedTarget = { 
                                id: `res_${gx}_${gy}`, 
                                gx, gy, 
                                x: gx * TS + TS / 2, 
                                y: gy * TS + TS / 2, 
                                type: 'RESOURCE_NODE',
                                resourceType: ['NONE', 'WOOD', 'STONE', 'FOOD', 'GOLD', 'IRON', 'COAL', 'MAGIC_HERB', 'WOLF', 'BEAR'][res.type]
                            };
                            targetType = 'RESOURCE';
                        }
                    }
                }
            }
        }

        // 2. [備選方案] 若懸停目標失效，則執行區域掃描 (相容原本邏輯)
        if (!clickedTarget) {
            // ... (原本的 Units 掃描可保留作為二次檢查)
            const allUnits = [...(state.units.villagers || []), ...(state.units.npcs || [])];
            allUnits.forEach(v => {
                if (v.hp > 0 && Math.hypot(v.x - pos.x, v.y - pos.y) < 40) {
                    clickedTarget = v;
                    targetType = 'UNIT';
                }
            });
        }

        if (!clickedTarget) {
            // 原本的建築掃描
            state.mapEntities.forEach(e => {
                const fp = GameEngine.getFootprint(e.type1);
                let w = (fp.uw * TS), h = (fp.uh * TS);
                let padding = 10;
                if (pos.x >= e.x - w / 2 - padding && pos.x <= e.x + w / 2 + padding &&
                    pos.y >= e.y - h / 2 - padding && pos.y <= e.y + h / 2 + padding) {
                    clickedTarget = e;
                    targetType = (e.type1 === 'corpse') ? 'RESOURCE' : 'BUILDING';
                }
            });
        }

        const isSelf = clickedTarget && (clickedTarget.id === ent.id || (clickedTarget.x === ent.x && clickedTarget.y === ent.y));

        if (isSelf) {
            ent.rallyPoint = null;
            GameEngine.addLog(`已取消建築集結點。`);
            if (window.UIManager) window.UIManager.updateValues(true);
        } else if (clickedTarget) {
            // [Snap 邏輯] 將集結點鎖定到目標中心，並保存 ID 用於後續連動渲染或追蹤
            ent.rallyPoint = {
                x: clickedTarget.x,
                y: clickedTarget.y,
                targetId: clickedTarget.id || (clickedTarget.gx !== undefined ? `res_${clickedTarget.gx}_${clickedTarget.gy}` : null),
                targetType: targetType,
                // 保存基礎屬性快照
                name: clickedTarget.name || clickedTarget.type1 || '目標'
            };
            GameEngine.addLog(`${bCfg.name} 集結點已鎖定至：${ent.rallyPoint.name}`);
            if (window.UIManager) window.UIManager.updateValues(true);
        } else {
            // 一般空地
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

        // --- 尋找目標的邏輯 (納入 npcs 掃描) ---
        const allUnits = [...(GameEngine.state.units.villagers || []), ...(GameEngine.state.units.npcs || [])];
        allUnits.forEach(v => {
            const camp = (v.config && v.config.camp) || v.camp || 'player';
            if (camp === 'enemy' || camp === 'neutral') {
                const d = Math.hypot(v.x - pointer.worldX, v.y - pointer.worldY);
                if (d < bestDist) { bestDist = d; clickedEnemy = v; }
            }
        });


        if (!clickedEnemy) {
            const TS = GameEngine.TILE_SIZE;
            GameEngine.state.mapEntities.forEach(e => {
                const fp = GameEngine.getFootprint(e.type1);
                let w = fp.uw * TS, h = fp.uh * TS;
                let padding = 10;

                if (e.type1 === 'corpse') {
                    const cScale = (UI_CONFIG.ResourceSelection && UI_CONFIG.ResourceSelection.corpseSelectionScale) || 0.8;
                    w = cScale * TS;
                    h = cScale * TS;
                    padding = 5; 
                }

                if (pointer.worldX >= e.x - w / 2 - padding && pointer.worldX <= e.x + w / 2 + padding &&
                    pointer.worldY >= e.y - h / 2 - padding && pointer.worldY <= e.y + h / 2 + padding) {
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
                    // [P3] 使用 ResourceSystem 的權威對照表，取代此處重複內嵌的 resType→SCENE 名稱表。
                    const typeName = ResourceSystem.RESOURCE_TYPE_MAP[res.type];
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
                    // [核心優化] 傳入原始點 pointer.worldX/Y 作為視覺指示座標，避免多單位時地面光圈過多
                    this.handleRightClickCommand(unit, offsetPointer, clickedEnemy || clickedEntity, { x: pointer.worldX, y: pointer.worldY });
                });
            }
        }
    }

    // [P3] 單位右鍵指令的 FSM 變更原位於 MainScene；其僅讀寫 GameEngine 狀態與 unit 物件、
    // 不依賴任何 scene 成員，本即輸入指令邏輯，故移入 InputSystem 與 handleUnitMove 同居。
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
}
