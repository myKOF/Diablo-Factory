import { GameEngine } from "./game_systems.js";

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

        this.DRAG_THRESHOLD = 5;
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
            this.rightDownInfo = { id: pointer.id, x: pointer.x, y: pointer.y };
            this.didMove = false; // 1. 按下時，重置移動狀態為「沒動過」
            this.lastX = pointer.x;
            this.lastY = pointer.y;
        }
    }

    onPointerMove(pointer) {
        if (this.rightDownInfo && pointer.id === this.rightDownInfo.id) {
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
                }
            }
        }
        this.lastX = pointer.x;
        this.lastY = pointer.y;
    }

    onPointerUp(pointer) {
        if (pointer.button === 2) {
            if (!this.rightDownInfo) return;

            // 3. 核心判定：只要這期間「動過」，放開時就絕對不執行點擊指令
            if (this.didMove) {
                GameEngine.addLog(`[Input] 拖曳結束 (攔截指令)`, 'INPUT');
            } else {
                // 4. 只有「完全沒動過」才進入點擊邏輯
                if (GameEngine.state.placingType) {
                    GameEngine.addLog(`[Input] 單擊：取消建築`, 'INPUT');
                    if (this.scene.cancelPlacement) {
                        this.scene.cancelPlacement();
                    } else {
                        GameEngine.state.placingType = null;
                    }
                } else {
                    GameEngine.addLog(`[Input] 單擊：移動單位`, 'INPUT');
                    this.handleUnitMove(pointer);
                }
            }

            // 清理狀態供下次使用
            this.rightDownInfo = null;
            this.didMove = false;
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