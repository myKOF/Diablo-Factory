import { UI_CONFIG } from "./ui_config.js";
import { GameEngine } from "./game_systems.js";

/**
 * UI 管理器
 * 負責渲染介面並處理動態建築清單
 */
export class UIManager {
    static uiLayer;
    static dragGhost = null;
    static activeBuilding = null;

    static init() {
        this.uiLayer = document.getElementById("ui_layer");
        if (!this.uiLayer) return;

        this.renderAll();

        // 綁定世界級事件
        window.addEventListener("mousedown", (e) => this.handleWorldMouseDown(e));
        window.addEventListener("mousemove", (e) => this.handleWorldMouseMove(e));
        window.addEventListener("mouseup", (e) => this.handleWorldMouseUp(e));
        window.addEventListener("click", (e) => this.handleWorldClick(e));
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape") this.cancelBuildingMode();
        });
        window.addEventListener("contextmenu", (e) => {
            if (GameEngine.state.placingType) {
                e.preventDefault();
                this.cancelBuildingMode();
            }
        });

        setInterval(() => this.updateValues(), 500);

        // 用於監听拖曳啟動
        window.addEventListener("mousemove", (e) => {
            if (this.potentialDragType && !this.dragGhost) {
                const dist = Math.hypot(e.clientX - this.mouseDownPos.x, e.clientY - this.mouseDownPos.y);
                if (dist > 10) {
                    this.startDrag(this.potentialDragType, e.clientX, e.clientY);
                    this.potentialDragType = null;
                }
            }
        });
        window.addEventListener("mouseup", () => {
            this.potentialDragType = null;
        });

        console.log("UI 管理器已加載 (Advanced Building System)");
    }

    static renderAll() {
        this.uiLayer.innerHTML = "";

        // 1. 資源列
        const rb = UI_CONFIG.ResourceBar;
        const resourceBar = document.createElement("div");
        resourceBar.className = "panel";
        resourceBar.style.cssText = `
            position: absolute; left: ${rb.x}px; top: ${rb.y}px;
            width: ${rb.width}px; height: ${rb.height}px;
            font-size: ${rb.fontSize}; color: ${rb.fontColor};
            display: flex; align-items: center; justify-content: space-around;
            pointer-events: auto;
        `;
        resourceBar.id = "resource_bar";
        this.uiLayer.appendChild(resourceBar);

        // 2. 建築面板
        const bp = UI_CONFIG.BuildingPanel;
        const buildingPanel = document.createElement("div");
        buildingPanel.className = "panel";
        buildingPanel.style.cssText = `
            position: absolute; left: ${bp.x}px; top: ${bp.y}px;
            width: ${bp.width}px; height: ${bp.height}px;
            pointer-events: auto;
        `;

        const title = document.createElement("div");
        title.className = "title";
        title.innerText = bp.title;
        title.style.fontSize = bp.titleSize;
        title.style.color = bp.titleColor;
        title.style.borderBottomColor = bp.titleColor;
        buildingPanel.appendChild(title);

        const listContainer = document.createElement("div");
        listContainer.id = "building_list";
        this.refreshBuildingList(listContainer, bp);

        buildingPanel.appendChild(listContainer);
        this.uiLayer.appendChild(buildingPanel);

        // 3. 日誌面板
        const logCfg = UI_CONFIG.LogPanel;
        const logPanel = document.createElement("div");
        logPanel.id = "log_panel";
        logPanel.className = "panel";
        logPanel.style.cssText = `
            position: absolute; left: ${logCfg.x}px; top: ${logCfg.y}px;
            width: ${logCfg.width}px; height: ${logCfg.height}px;
            background: ${logCfg.bgColor}; color: #e0f2f1;
            padding: ${logCfg.padding}; border: 1.5px solid ${logCfg.borderColor};
            font-size: ${logCfg.fontSize}; font-family: 'Courier New', monospace;
            display: flex; flex-direction: column;
            overflow-y: auto; pointer-events: auto;
            box-sizing: border-box;
            box-shadow: 0 4px 10px rgba(0,0,0,0.5);
        `;
        this.uiLayer.appendChild(logPanel);

        // 4. 指令選單
        const menu = document.createElement("div");
        menu.id = "context_menu";
        menu.className = "panel";
        menu.style.cssText = `position: absolute; display: none; width: 200px; padding: 10px; z-index: 1000; pointer-events: auto;`;
        this.uiLayer.appendChild(menu);
    }

    static refreshBuildingList(container, bp) {
        container.innerHTML = "";
        const configs = GameEngine.state.buildingConfigs;
        if (Object.keys(configs).length === 0) {
            setTimeout(() => this.refreshBuildingList(container, bp), 500);
            return;
        }

        const buildingIcons = {
            town_center: "🏰", village: "🏘️", farmhouse: "🏡",
            timber_factory: "🪵", stone_factory: "⛏️", barn: "🌾",
            farmland: "🌱", alchemy_lab: "⚗️", cathedral: "⛪", academy: "🧙"
        };

        Object.values(configs).forEach(cfg => {
            const currentCount = GameEngine.state.mapEntities.filter(e => e.type === cfg.model).length;

            const costStr = [];
            if (cfg.costs.food > 0) costStr.push(`🍖${cfg.costs.food}`);
            if (cfg.costs.wood > 0) costStr.push(`🪵${cfg.costs.wood}`);
            if (cfg.costs.stone > 0) costStr.push(`🪨${cfg.costs.stone}`);
            if (cfg.costs.gold > 0) costStr.push(`💰${cfg.costs.gold}`);

            const item = {
                id: cfg.model,
                name: cfg.name,
                icon: buildingIcons[cfg.model] || "🏗️",
                desc: `增加 ${cfg.population} 人口 (目前: ${currentCount}/${cfg.maxCount})<br>消耗: ${costStr.join(' ')}`
            };
            this.createBuildingBtn(container, bp, item);
        });
    }

    static createBuildingBtn(container, bp, item) {
        const btn = document.createElement("div");
        btn.className = "building-item";
        btn.setAttribute("data-type", item.id);
        btn.style.cssText = `
            position: relative; height: ${bp.itemHeight}px; border: 1px solid #555;
            margin: 5px 0; padding: 10px; background: rgba(0,0,0,0.3);
            color: ${bp.textColor}; font-size: ${bp.fontSize};
            cursor: pointer; transition: all 0.2s;
        `;
        btn.innerHTML = `
            <strong style="color: ${bp.titleColor}">${item.name}</strong><br>
            <small style="color: ${bp.descColor}">${item.desc}</small>
        `;

        const icon = document.createElement("div");
        icon.className = "building-icon";
        icon.style.cssText = `
            position: absolute; right: 10px; bottom: 10px;
            width: 40px; height: 40px; border: 2px solid #ff5722;
            background: rgba(255, 87, 34, 0.2);
            display: flex; align-items: center; justify-content: center;
            font-size: 24px; pointer-events: none; /* 圖示僅作視覺展示 */
        `;
        icon.innerHTML = item.icon || "🏗️";

        // 統一拖曳與點擊邏輯
        btn.onmousedown = (e) => {
            if (e.button !== 0) return;
            this.mouseDownPos = { x: e.clientX, y: e.clientY };
            this.mouseDownTime = Date.now();
            this.potentialDragType = item.id;
        };

        btn.onclick = (e) => {
            e.stopPropagation();
            // 如果發生過拖曳，則 onclick 不處理 (由 handleWorldMouseUp 處理建造)
            if (this.dragGhost) return;
            
            // 如果點擊時間太長，也不視為純點擊
            if (Date.now() - this.mouseDownTime > 300) return;

            if (GameEngine.state.placingType === item.id) {
                this.cancelBuildingMode();
            } else {
                this.startStampMode(item.id);
            }
        };

        btn.appendChild(icon);
        container.appendChild(btn);
    }

    static createWarningHint() {
        if (document.getElementById("warning_hint")) return;
        const cfg = UI_CONFIG.WarningHUD;
        const warn = document.createElement("div");
        warn.id = "warning_hint";
        warn.style.cssText = `
            position: fixed; 
            left: 50%; top: ${cfg.y};
            transform: translate(-50%, -50%) scale(0.9);
            color: ${cfg.fontColor};
            font-size: ${cfg.fontSize};
            font-weight: 600;
            background: ${cfg.bgColor};
            border: 2px solid ${cfg.borderColor};
            padding: ${cfg.padding};
            border-radius: 4px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.8), inset 0 0 10px rgba(255,255,255,0.05);
            pointer-events: none; 
            opacity: 0; 
            transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
            z-index: 99999; 
            text-align: center; 
            min-width: 300px;
            display: none;
            font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
            letter-spacing: 1px;
        `;
        document.body.appendChild(warn);
    }

    static showWarning(msg) {
        this.createWarningHint();
        const cfg = UI_CONFIG.WarningHUD;
        const warn = document.getElementById("warning_hint");
        if (!warn) return;

        warn.innerText = msg;
        warn.style.display = "block";

        warn.offsetHeight;

        warn.style.opacity = "1";
        warn.style.transform = "translate(-50%, -50%) scale(1)";

        if (this.warnTimer) clearTimeout(this.warnTimer);
        this.warnTimer = setTimeout(() => {
            warn.style.opacity = "0";
            warn.style.transform = "translate(-50%, -50%) scale(0.95)";
            setTimeout(() => { if (warn.style.opacity === "0") warn.style.display = "none"; }, 300);
        }, cfg.duration);
    }

    static startDrag(type, mouseX, mouseY) {
        GameEngine.state.buildingMode = 'DRAG';
        this.activeBuilding = type;
        this.dragGhost = document.createElement("div");
        this.dragGhost.style.cssText = `
            position: fixed; left: ${mouseX - 20}px; top: ${mouseY - 20}px;
            width: 40px; height: 40px; border: 2px dashed white;
            background: rgba(255,255,255,0.3); pointer-events: none; z-index: 9999;
        `;
        document.body.appendChild(this.dragGhost);
        GameEngine.state.placingType = type;
    }

    static startStampMode(type) {
        this.cancelBuildingMode();
        GameEngine.state.buildingMode = 'STAMP';
        GameEngine.state.placingType = type;
        this.activeBuilding = type;
        GameEngine.addLog(`進入建造模式：${GameEngine.state.buildingConfigs[type].name} (ESC 取消)`);
    }

    static cancelBuildingMode() {
        if (!GameEngine.state.placingType) return;
        GameEngine.state.buildingMode = 'NONE';
        GameEngine.state.placingType = null;
        this.activeBuilding = null;
        GameEngine.state.linePreviewEntities = [];
        if (this.dragGhost) {
            document.body.removeChild(this.dragGhost);
            this.dragGhost = null;
        }
    }

    static getWorldMousePos(clientX, clientY) {
        const scene = window.PhaserScene;
        const cam = scene ? { x: -scene.cameras.main.scrollX, y: -scene.cameras.main.scrollY } : { x: 0, y: 0 };
        const TS = GameEngine.TILE_SIZE;
        const cfg = GameEngine.state.buildingConfigs[this.activeBuilding];

        let uw = 1, uh = 1;
        if (cfg && cfg.size) {
            const match = cfg.size.match(/\{(\d+),(\d+)\}/);
            if (match) { uw = parseInt(match[1]); uh = parseInt(match[2]); }
        }

        const offsetX = (uw % 2 === 0) ? 0 : TS / 2;
        const offsetY = (uh % 2 === 0) ? 0 : TS / 2;

        const gx = Math.round((clientX - cam.x - offsetX) / TS);
        const gy = Math.round((clientY - cam.y - offsetY) / TS);

        return {
            x: gx * TS + offsetX,
            y: gy * TS + offsetY
        };
    }

    static handleWorldMouseDown(e) {
        if (e.target.closest("#ui_layer")) return;

        // 右鍵直接取消
        if (e.button === 2) {
            this.cancelBuildingMode();
            return;
        }

        // 僅處理左鍵
        if (e.button !== 0) return;
        
        const state = GameEngine.state;
        if (state.buildingMode === 'STAMP') {
            state.buildingMode = 'LINE';
            state.lineStartPos = this.getWorldMousePos(e.clientX, e.clientY);
            state.linePreviewEntities = [state.lineStartPos];
        }
    }

    static handleWorldMouseMove(e) {
        const state = GameEngine.state;
        if (!state.placingType) return;
        
        // 如果鼠標在 UI 面板上，隱藏虛影
        if (e.target.closest(".panel")) {
            state.previewPos = null;
            state.linePreviewEntities = [];
            return;
        }
        
        const pos = this.getWorldMousePos(e.clientX, e.clientY);
        state.previewPos = pos;

        if (state.buildingMode === 'DRAG') {
            if (this.dragGhost) {
                this.dragGhost.style.left = `${e.clientX - 20}px`;
                this.dragGhost.style.top = `${e.clientY - 20}px`;
            }
        } else if (state.buildingMode === 'LINE') {
            if (state.lineStartPos) {
                state.linePreviewEntities = GameEngine.getLinePositions(state.placingType, state.lineStartPos.x, state.lineStartPos.y, pos.x, pos.y);
            }
        }
    }

    static handleWorldMouseUp(e) {
        // 僅處理左鍵放開來確定建造。右鍵放開不應觸發建造。
        if (e.button !== 0) return;

        const state = GameEngine.state;
        if (state.buildingMode === 'DRAG') {
            if (state.previewPos) {
                GameEngine.placeBuilding(state.placingType, state.previewPos.x, state.previewPos.y);
            }
            this.cancelBuildingMode();
        } else if (state.buildingMode === 'LINE') {
            const pos = this.getWorldMousePos(e.clientX, e.clientY);
            // 如果位移足夠，執行拉排建造
            if (state.lineStartPos && (Math.abs(pos.x - state.lineStartPos.x) > 10 || Math.abs(pos.y - state.lineStartPos.y) > 10)) {
                GameEngine.placeBuildingLine(state.placingType, state.lineStartPos.x, state.lineStartPos.y, pos.x, pos.y);
                this.lastLinePlacementTime = Date.now();
            }
            state.buildingMode = 'STAMP';
            state.linePreviewEntities = [];
            state.lineStartPos = null;
        }
    }

    static getLocalMouse(e) {
        const container = document.getElementById("game_container");
        if (!container) return { x: e.clientX, y: e.clientY };
        const rect = container.getBoundingClientRect();
        const scaleX = rect.width / 1920;
        const scaleY = rect.height / 1080;
        return {
            x: (e.clientX - rect.left) / scaleX,
            y: (e.clientY - rect.top) / scaleY
        };
    }

    static handleWorldClick(e) {
        const state = GameEngine.state;
        
        // 如果是 UI，不處理世界點擊
        if (e.target.closest("#ui_layer")) {
            if (!e.target.closest("#context_menu")) {
                // 點擊 UI 空白處不關閉 Stamp 模式，除非點擊的是其它交互區域
            }
            return;
        }

        // Stamp 模式：點擊地圖直接建造
        if (state.buildingMode === 'STAMP') {
            // 如果剛拉完一排，跳過本次點擊觸發 (避免在結尾點多蓋一個)
            if (this.lastLinePlacementTime && Date.now() - this.lastLinePlacementTime < 100) return;
            
            const pos = this.getWorldMousePos(e.clientX, e.clientY);
            GameEngine.placeBuilding(state.placingType, pos.x, pos.y);
            return;
        }

        // 隱藏右鍵選單邏輯
        this.hideContextMenu();

        const local = this.getLocalMouse(e);
        const scene = window.PhaserScene;
        const cam = scene ? { x: -scene.cameras.main.scrollX, y: -scene.cameras.main.scrollY } : { x: 0, y: 0 };
        const entities = GameEngine.state.mapEntities;

        const clicked = entities.find(ent => {
            const cfg = GameEngine.state.buildingConfigs[ent.type];
            if (!cfg) return false;
            const em = cfg.size.match(/\{(\d+),(\d+)\}/);
            const w = (em ? parseInt(em[1]) : 1) * GameEngine.TILE_SIZE;
            const h = (em ? parseInt(em[2]) : 1) * GameEngine.TILE_SIZE;
            const mx = local.x - cam.x, my = local.y - cam.y;
            return mx > ent.x - w / 2 + 5 && mx < ent.x + w / 2 - 5 && my > ent.y - h / 2 + 5 && my < ent.y + h / 2 - 5;
        });

        if (clicked) {
            const screenX = clicked.x + cam.x;
            const screenY = clicked.y + cam.y + 110;
            this.showContextMenu(clicked, screenX, screenY);
        }
    }

    static showContextMenu(entity, x, y, isConfirming = false) {
        this.activeMenuEntity = entity;
        const menu = document.getElementById("context_menu");
        const cfg = UI_CONFIG.ActionMenu;

        menu.style.display = "flex";
        menu.style.flexDirection = "column";
        menu.style.width = "auto";
        menu.style.minWidth = "200px";
        menu.style.height = "auto";
        menu.style.padding = "10px";

        // ... (中間內容不變)

        let name = entity.isUnderConstruction ? "施工中的建築" : (entity.name || entity.type);
        let headerColor = isConfirming ? "#ff8a80" : "#ffcc8c";
        let headerBorder = isConfirming ? "1px solid #c62828" : "1px solid #8b6e4b";
        let headerText = isConfirming ? `確定銷毀 ${name} 並退還 50%？` : name;

        let html = `<div style="text-align:center; padding:5px; border-bottom:${headerBorder}; margin-bottom:10px; color:${headerColor}; font-weight:bold; font-size:16px;">${headerText}</div>`;

        html += `<div style="display:flex; flex-direction:row; flex-wrap:wrap; gap:10px; justify-content:center;">`;

        const eid = entity.id || `${entity.type}_${entity.x}_${entity.y}`;

        if (isConfirming) {
            // 確認銷毀模式
            html += `
                <button class="action-btn danger" onclick="window.UIManager.actualDestroy(event, '${eid}')" style="pointer-events: auto;">
                    <span class="icon">✔️</span><span class="label">確定銷毀</span>
                </button>
                <button class="action-btn" onclick="window.UIManager.cancelDestroy(event)" style="pointer-events: auto;">
                    <span class="icon">❌</span><span class="label">取消</span>
                </button>
            `;
        } else {
            // 一般模式
            if (entity.type === 'town_center' || entity.type === 'village') {
                html += `
                    <button class="action-btn" id="cmd_WOOD" onclick="window.GameEngine.setCommand(event, 'WOOD')">
                        <span class="icon">🪓</span><span class="label">採集木材</span>
                    </button>
                    <button class="action-btn" id="cmd_STONE" onclick="window.GameEngine.setCommand(event, 'STONE')">
                        <span class="icon">⛏️</span><span class="label">採集石頭</span>
                    </button>
                    <button class="action-btn" id="cmd_FOOD" onclick="window.GameEngine.setCommand(event, 'FOOD')">
                        <span class="icon">🧺</span><span class="label">採集食物</span>
                    </button>
                    <button class="action-btn" id="cmd_RETURN" onclick="window.GameEngine.setCommand(event, 'RETURN')">
                        <span class="icon">🏘️</span><span class="label">收工</span>
                    </button>
                    <button class="action-btn" id="worker_btn" onclick="window.GameEngine.addToVillageQueue(event, 'villagers')">
                        <span class="icon">👤</span><span class="label">訓練</span>
                        <div id="queue_badge" class="queue-badge" style="display:none">0</div>
                        <div id="prod_progress" class="progress-bar-mini"></div>
                    </button>
                `;
            }

            // 倉庫自動化管理介面
            const isWarehouse = ['timber_factory', 'stone_factory', 'barn'].includes(entity.type);
            if (isWarehouse && !entity.isUnderConstruction) {
                const currentAssigned = GameEngine.state.units.villagers.filter(v => v.assignedWarehouseId === eid).length;
                html += `
                    <div class="warehouse-controls">
                        <div class="control-title">自動化採集管理</div>
                        <div class="control-row">
                            <button class="adjust-btn" onclick="window.UIManager.adjustWorkers(event, -1)">-</button>
                            <span class="count-display">${currentAssigned} / ${entity.targetWorkerCount || 0}</span>
                            <button class="adjust-btn" onclick="window.UIManager.adjustWorkers(event, 1)">+</button>
                        </div>
                        <div class="status-hint">派遣狀態</div>
                    </div>
                `;
            }

            // 限制：如果是最後一間「村莊中心」，不顯示銷毀選項
            const villageCount = GameEngine.state.mapEntities.filter(e => e.type === 'town_center' || e.type === 'village').length;
            const isLastVillage = (entity.type === 'town_center' || entity.type === 'village') && villageCount <= 1;

            if (!isLastVillage) {
                html += `
                    <button class="action-btn danger" onclick="window.UIManager.confirmDestroy(event)">
                        <span class="icon">💣</span><span class="label">銷毀</span>
                    </button>
                `;
            }
        }

        html += `</div>`;

        menu.innerHTML = html;
        this.updateValues();
        this.updateStickyPositions(); // 立即計算智慧位置，避免首幀閃爍
    }

    static confirmDestroy(event) {
        if (event) event.stopPropagation();
        const ent = this.activeMenuEntity;
        if (!ent) return;
        
        // 切換到確認模式
        const scene = window.PhaserScene;
        const cam = scene ? { x: -scene.cameras.main.scrollX, y: -scene.cameras.main.scrollY } : { x: 0, y: 0 };
        this.showContextMenu(ent, ent.x + cam.x, ent.y + cam.y + 110, true);
    }

    static cancelDestroy(event) {
        if (event) event.stopPropagation();
        const ent = this.activeMenuEntity;
        if (!ent) return;
        
        // 切換回一般模式
        const scene = window.PhaserScene;
        const cam = scene ? { x: -scene.cameras.main.scrollX, y: -scene.cameras.main.scrollY } : { x: 0, y: 0 };
        this.showContextMenu(ent, ent.x + cam.x, ent.y + cam.y + 110, false);
    }

    static actualDestroy(event, eid) {
        if (event) event.stopPropagation();
        
        // 使用 ID 查找實體，確保引用最新
        const ent = GameEngine.state.mapEntities.find(e => {
            const id = e.id || `${e.type}_${e.x}_${e.y}`;
            return id === eid;
        });

        if (!ent) {
            console.error("找不到待銷毀的實體:", eid);
            return;
        }
        
        // 呼叫引擎執行銷毀
        GameEngine.destroyBuilding(ent);
    }

    static adjustWorkers(event, delta) {
        if (event) event.stopPropagation();
        if (!this.activeMenuEntity) return;
        GameEngine.adjustWarehouseWorkers(this.activeMenuEntity, delta);
    }

    static hideContextMenu() {
        this.activeMenuEntity = null;
        const menu = document.getElementById("context_menu");
        if (menu) menu.style.display = "none";
    }

    static updateValues() {
        // 更新資源
        const rb = document.getElementById("resource_bar");
        if (rb) {
            const labels = UI_CONFIG.ResourceBar.labels;
            const res = GameEngine.state.resources;
            const popCount = GameEngine.state.units.villagers.length;
            const maxPop = GameEngine.getMaxPopulation();
            rb.innerHTML = `
                <span>${labels.gold} ${res.gold}</span>
                <span>${labels.wood} ${res.wood}</span>
                <span>${labels.stone} ${res.stone}</span>
                <span>${labels.food} ${res.food}</span>
                <span title="人口上限">👥 ${popCount} / ${maxPop}</span>
            `;
            if (popCount >= maxPop) rb.querySelector('span:last-child').style.color = "#ff5252";
        }

        // 更新日誌
        const lp = document.getElementById("log_panel");
        if (lp) {
            const history = GameEngine.state.log;
            const content = history.map(msg => `<div>> ${msg}</div>`).join("");
            if (lp.innerHTML !== content) {
                // 判斷使用者是否目前正停留在底部
                const isAtBottom = lp.scrollHeight - lp.scrollTop - lp.clientHeight < 20;

                lp.innerHTML = content;

                // 只有在使用者本來就在底部的情況下，才自動捲動
                if (isAtBottom) {
                    lp.scrollTop = lp.scrollHeight;
                }
            }
        }

        // 更新生產隊列顯示
        const badge = document.getElementById("queue_badge");
        const prog = document.getElementById("prod_progress");
        const workerBtn = document.getElementById("worker_btn");

        if (badge && prog) {
            const q = GameEngine.state.villageQueue.length;
            const maxPop = GameEngine.getMaxPopulation();
            const isPopFull = GameEngine.state.units.villagers.length >= maxPop;

            if (q > 0) {
                badge.style.display = "flex";
                badge.innerText = q;
                const p = (1 - GameEngine.state.villageProductionTimer / 5) * 100;
                prog.style.width = `${p}%`;
                prog.style.backgroundColor = isPopFull ? "#f44336" : "#4caf50";
            } else {
                badge.style.display = "none";
                prog.style.width = "0%";
            }
        }

        // 更新區域：倉庫自動化管理
        const countDisplay = document.querySelector(".count-display");
        const statusHint = document.querySelector(".status-hint");
        if (countDisplay && statusHint && this.activeMenuEntity) {
            const ent = this.activeMenuEntity;
            const current = GameEngine.state.units.villagers.filter(v => v.assignedWarehouseId === (ent.id || `${ent.type}_${ent.x}_${ent.y}`)).length;
            countDisplay.innerText = `${current} / ${ent.targetWorkerCount || 0}`;
            statusHint.innerText = `派遣狀態`;
        }

        // 更新指令高亮狀態
        ['WOOD', 'STONE', 'FOOD', 'RETURN'].forEach(cmd => {
            const btn = document.getElementById(`cmd_${cmd}`);
            if (btn) {
                if (GameEngine.state.currentGlobalCommand === cmd) btn.classList.add("active");
                else btn.classList.remove("active");
            }
        });

        // 5. 更新建築按鈕高亮
        const placingType = GameEngine.state.placingType;
        document.querySelectorAll(".building-item").forEach(btn => {
            if (btn.getAttribute("data-type") === placingType) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
    }

    // 每一幀由渲染器調用，確保選單絕對同步 (60FPS)
    static updateStickyPositions() {
        if (this.activeMenuEntity) {
            const menu = document.getElementById("context_menu");
            const scene = window.PhaserScene;
            const cam = scene ? { x: -scene.cameras.main.scrollX, y: -scene.cameras.main.scrollY } : { x: 0, y: 0 };
            const cfg = UI_CONFIG.ActionMenu;

            // 基礎螢幕中心位置
            let sx = this.activeMenuEntity.x + cam.x;
            let sy = this.activeMenuEntity.y + cam.y;

            // 取得選單寬高 (動態抓取，若尚未渲染則使用配置預設值)
            const menuWidth = menu.offsetWidth || cfg.width || 380;
            const menuHeight = menu.offsetHeight || cfg.height || 95;
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;

            // 智慧偏置計算
            let finalX = sx + (cfg.offsetX || 0);
            let finalY = sy + (cfg.offsetY || 0);

            // --- 邊界檢查與反向邏輯 ---
            
            // 1. 水平檢查：如果右側超出，改往左顯示
            if (finalX + menuWidth > screenWidth - 20) {
                finalX = sx - menuWidth - (cfg.offsetX || 15);
            }
            
            // 2. 垂直檢查：如果底部超出，改往上顯示 (建築上方)
            if (finalY + menuHeight > screenHeight - 20) {
                finalY = sy - menuHeight - (cfg.offsetY || 100);
            }

            // 3. 全域安全區域確保 (防止被頂部資源列或左側面板蓋住)
            finalX = Math.max(20, Math.min(finalX, screenWidth - menuWidth - 20));
            finalY = Math.max(20, Math.min(finalY, screenHeight - menuHeight - 20));

            menu.style.left = `${finalX}px`;
            menu.style.top = `${finalY}px`;
        }
    }
}

window.GameEngine = GameEngine;
window.UIManager = UIManager;
