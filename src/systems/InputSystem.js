import { GameEngine } from "./game_systems.js";

/**
 * InputSystem: 終極單例版本。
 * 解決多重實例造成的日誌重疊與點擊穿透問題。
 */
export class InputSystem {
    constructor(scene) {
        this.scene = scene;
        this.instanceId = Math.random().toString(36).substr(2, 5);
        
        if (window._globalInputSystem) {
            console.log(`[InputSystem] 清理舊實例 (${window._globalInputSystem.instanceId})...`);
            window._globalInputSystem.destroy();
        }
        window._globalInputSystem = this;

        this.DRAG_THRESHOLD = 10;
        this.isDragging = false;
        this.rightDownInfo = null;
        this.lastX = 0;
        this.lastY = 0;
        this.lastRightUpTime = 0;
        
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);

        console.log(`[InputSystem] 已初始化實例: ${this.instanceId}`);
        this.setupListeners();
    }

    destroy() {
        if (!this.scene || !this.scene.input) return;
        console.log(`[InputSystem] 實例 ${this.instanceId} 正在卸載監聽器...`);
        this.scene.input.off('pointerdown', this.onPointerDown);
        this.scene.input.off('pointermove', this.onPointerMove);
        this.scene.input.off('pointerup', this.onPointerUp);
        if (window._globalInputSystem === this) {
            window._globalInputSystem = null;
        }
    }

    setupListeners() {
        const scene = this.scene;

        // 【嚴重修復】不再使用無差別的 scene.input.off('pointerdown') 避免破壞 MainScene 的左鍵框選
        // 取而代之，確保舊的匿名函數不會干擾，並嚴格利用綁定的方法
        
        scene.input.on('pointerdown', this.onPointerDown);
        scene.input.on('pointermove', this.onPointerMove);
        scene.input.on('pointerup', this.onPointerUp);
    }

    onPointerDown(pointer) {
        // [防衛] 若多重掛載發生，舊實例遇到新事件應主動失效
        if (window._globalInputSystem && window._globalInputSystem !== this) {
            this.destroy();
            return;
        }

        if (pointer.button === 2) { 
            const now = Date.now();
            const cam = this.scene.cameras.main;
            
            // 預約：pointerdown 僅紀錄起點與當下畫面中心絕對座標
            this.rightDownInfo = {
                id: pointer.id,
                x: pointer.x,
                y: pointer.y,
                camX: cam ? Math.round(cam.scrollX + cam.width / 2) : 0,
                camY: cam ? Math.round(cam.scrollY + cam.height / 2) : 0,
                time: now
            };
            this.isDragging = false;
            this.lastX = pointer.x;
            this.lastY = pointer.y;
        }
    }

    onPointerMove(pointer) {
        if (this.rightDownInfo && pointer.id === this.rightDownInfo.id) {
            const totalDist = Math.hypot(pointer.x - this.rightDownInfo.x, pointer.y - this.rightDownInfo.y);
            
            // 判定位移（>10px 鎖定為拖拽）
            if (totalDist > this.DRAG_THRESHOLD) {
                const dx = pointer.x - this.lastX;
                const dy = pointer.y - this.lastY;
                
                const cam = this.scene.cameras.main;
                if (cam) {
                    cam.scrollX -= dx;
                    cam.scrollY -= dy;
                }
                this.scene.lastDragTime = Date.now();
                
                this.isDragging = true; // 鎖定為這是一次拖拽
            }
        }
        this.lastX = pointer.x;
        this.lastY = pointer.y;
    }

    onPointerUp(pointer) {
        if (pointer.button === 2) { 
            if (!this.rightDownInfo || pointer.id !== this.rightDownInfo.id) return;

            const now = Date.now();
            const duration = now - this.rightDownInfo.time;
            const totalDist = Math.hypot(pointer.x - this.rightDownInfo.x, pointer.y - this.rightDownInfo.y);
            
            const cam = this.scene.cameras.main;
            const currentCamX = cam ? Math.round(cam.scrollX + cam.width / 2) : 0;
            const currentCamY = cam ? Math.round(cam.scrollY + cam.height / 2) : 0;
            const cameraMoved = this.rightDownInfo.camX !== currentCamX || this.rightDownInfo.camY !== currentCamY;

            // 確保 Camera Pan 與 Unit Move 是互斥的
            // [玩家規則] 畫面中心在大地圖的絕對座標必需絕對不變，才可以呼叫單位移動指令
            const isFinalDrag = this.isDragging || totalDist > this.DRAG_THRESHOLD || cameraMoved;

            if (isFinalDrag) {
                GameEngine.addLog(`[Input-${this.instanceId}] 取消移動 (相機拖曳中或畫面已移動)`, 'INPUT');
                this.lastDragEndTime = now; // 記錄本次「取消」結束時間
            } else if (duration < 500) { 
                const timeSinceLastDrag = now - (this.lastDragEndTime || 0);

                // [最終幽靈防線] 
                // 1. duration < 10: 絕對非人為物理點擊（通常是 0ms 或 1ms 瀏覽器幽靈事件）
                // 2. timeSinceLastDrag < 100: 緊隨在「相機拖曳」終止後的第一刻，防禦幽靈合成點擊
                if (duration <= 15 || timeSinceLastDrag < 100) {
                    GameEngine.addLog(`[Input-${this.instanceId}] 攔截異常點擊 (duration:${duration})`, 'INPUT');
                } else {
                    // 合理的點擊時間，且畫面中心座標完全無變更
                    GameEngine.addLog(`[Input-${this.instanceId}] 右鍵單擊，觸發移動`, 'INPUT');
                    this.handleUnitMove(pointer);
                }
            }

            // 消耗掉此資訊，防止重複觸發
            this.rightDownInfo = null;
            this.isDragging = false;
        }
    }

    handleUnitMove(pointer) {
        const scene = this.scene;
        // 如果正在建築模式預覽中或已由此模式中右鍵，不移動
        if (GameEngine.state.placingType || GameEngine.state.rightClickStartedInPlacementMode) return;

        let clickedEnemy = null;
        let clickedEntity = null;
        let bestDist = 40;

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
                        clickedEntity = {
                            id: `${gx}_${gy}`, gx, gy, x: rx, y: ry,
                            type: typeName, resourceType: typeName, amount: res.amount
                        };
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
