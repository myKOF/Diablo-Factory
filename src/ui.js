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

        window.addEventListener("click", (e) => this.handleWorldClick(e));
        window.addEventListener("mousemove", (e) => this.handleDragMove(e));
        window.addEventListener("mouseup", (e) => this.handleDragEnd(e));

        setInterval(() => this.updateValues(), 500);
        console.log("UI 管理器已加載");
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
                desc: `增加 ${cfg.population} 人口 (目前: ${currentCount}/${cfg.maxCount})<br>消耗: ${costStr.join(' ')}`
            };
            this.createBuildingBtn(container, bp, item);
        });
    }

    static createBuildingBtn(container, bp, item) {
        const btn = document.createElement("div");
        btn.className = "building-item";
        btn.style.cssText = `
            position: relative; height: ${bp.itemHeight}px; border: 1px solid #555;
            margin: 5px 0; padding: 10px; background: rgba(0,0,0,0.3);
            color: ${bp.textColor}; font-size: ${bp.fontSize};
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
            cursor: grab; background: rgba(255, 87, 34, 0.2);
        `;
        icon.onmousedown = (e) => {
            e.preventDefault();
            this.startDrag(item.id, e.clientX, e.clientY);
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

    static handleDragMove(e) {
        if (!this.dragGhost) return;
        this.dragGhost.style.left = `${e.clientX - 20}px`;
        this.dragGhost.style.top = `${e.clientY - 20}px`;

        const cam = window.AnimationRenderer.camera;
        const TS = GameEngine.TILE_SIZE;
        const cfg = GameEngine.state.buildingConfigs[this.activeBuilding];

        let uw = 1, uh = 1;
        if (cfg && cfg.size) {
            const match = cfg.size.match(/\{(\d+),(\d+)\}/);
            if (match) {
                uw = parseInt(match[1]);
                uh = parseInt(match[2]);
            }
        }

        // 根據尺寸奇偶性決定偏移：
        // 奇數尺寸 (1x1) 應該對齊格子中心 (TS/2)
        // 偶數尺寸 (2x2) 應該對齊格線 (0)
        const offsetX = (uw % 2 === 0) ? 0 : TS / 2;
        const offsetY = (uh % 2 === 0) ? 0 : TS / 2;

        const gx = Math.round((e.clientX - cam.x - offsetX) / TS);
        const gy = Math.round((e.clientY - cam.y - offsetY) / TS);

        GameEngine.state.previewPos = {
            x: gx * TS + offsetX,
            y: gy * TS + offsetY
        };
    }

    static handleDragEnd(e) {
        if (!this.dragGhost) return;
        if (GameEngine.state.previewPos) {
            GameEngine.placeBuilding(this.activeBuilding, GameEngine.state.previewPos.x, GameEngine.state.previewPos.y);
        }
        document.body.removeChild(this.dragGhost);
        this.dragGhost = null;
        this.activeBuilding = null;
        GameEngine.state.placingType = null;
        GameEngine.state.previewPos = null;
    }

    static getLocalMouse(e) {
        const container = document.getElementById("game_container");
        if (!container) return { x: e.clientX, y: e.clientY };
        const rect = container.getBoundingClientRect();
        // 考慮到可能的視窗拉伸，X/Y 比例分開計算
        const scaleX = rect.width / 1920;
        const scaleY = rect.height / 1080;
        return {
            x: (e.clientX - rect.left) / scaleX,
            y: (e.clientY - rect.top) / scaleY
        };
    }

    static handleWorldClick(e) {
        // 策略：先根據點擊點決定是否關閉，再判斷是否打開

        // 如果點擊的是按鈕，不做任何處理 (按鈕內部的 onclick 會執行工作)
        if (e.target.closest(".action-btn")) return;

        // 如果點擊的是 UI 以外的地方，先無條件關閉選單
        const wasOpen = document.getElementById("context_menu")?.style.display !== "none";
        this.hideContextMenu();

        // 如果點擊的是 UI 其它區域（如面板背景、資源列），則到此為止 (已關閉)
        if (e.target.closest(".panel")) return;

        // 如果目前是建造模式，點擊大地圖是為了建造，不處理選單
        if (this.dragGhost) return;

        const local = this.getLocalMouse(e);
        const cam = window.AnimationRenderer.camera;
        const entities = GameEngine.state.mapEntities;

        // 偵測是否點擊了村莊
        const clicked = entities.find(ent => {
            const cfg = GameEngine.state.buildingConfigs[ent.type];
            if (!cfg) return false;
            const em = cfg.size.match(/\{(\d+),(\d+)\}/);
            const w = (em ? parseInt(em[1]) : 1) * GameEngine.TILE_SIZE;
            const h = (em ? parseInt(em[2]) : 1) * GameEngine.TILE_SIZE;
            const mx = local.x - cam.x, my = local.y - cam.y;
            // 點擊判定稍微縮減 5 像素，避免邊緣模糊判定
            return mx > ent.x - w / 2 + 5 && mx < ent.x + w / 2 - 5 && my > ent.y - h / 2 + 5 && my < ent.y + h / 2 - 5;
        });

        if (clicked && clicked.type === 'village') {
            const screenX = clicked.x + cam.x;
            const screenY = clicked.y + cam.y + 110;
            this.showContextMenu(screenX, screenY);
        }
    }

    static showContextMenu(x, y) {
        const menu = document.getElementById("context_menu");
        const cfg = UI_CONFIG.ActionMenu;
        menu.style.display = "flex";
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.width = cfg.width + "px";
        menu.style.height = cfg.height + "px";
        menu.innerHTML = `
            <div class="action-btn" id="cmd_WOOD" onclick="GameEngine.setCommand('WOOD')">
                <span class="icon">🪓</span><span class="label">採集木材</span>
            </div>
            <div class="action-btn" id="cmd_STONE" onclick="GameEngine.setCommand('STONE')">
                <span class="icon">⛏️</span><span class="label">採集石頭</span>
            </div>
            <div class="action-btn" id="cmd_FOOD" onclick="GameEngine.setCommand('FOOD')">
                <span class="icon">🧺</span><span class="label">採集食物</span>
            </div>
            <div class="action-btn" id="cmd_RETURN" onclick="GameEngine.setCommand('RETURN')">
                <span class="icon">🏘️</span><span class="label">全員收工</span>
            </div>
            <div class="action-btn" id="worker_btn" onclick="GameEngine.addToVillageQueue('villagers')">
                <span class="icon">👤</span><span class="label">訓練工人</span>
                <div id="queue_badge" class="queue-badge" style="display:none">0</div>
            </div>
        `;

        // 立即刷新一次 UI，確保狀態（如高亮、進度、警告）即時顯示
        this.updateValues();
    }

    static hideContextMenu() {
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
        // 更新指令高亮狀態
        ['WOOD', 'STONE', 'FOOD', 'RETURN'].forEach(cmd => {
            const btn = document.getElementById(`cmd_${cmd}`);
            if (btn) {
                if (GameEngine.state.currentGlobalCommand === cmd) btn.classList.add("active");
                else btn.classList.remove("active");
            }
        });

        // 更新指令選單位置 (跟隨世界座標)
        if (this.activeMenuEntity) {
            const menu = document.getElementById("context_menu");
            const cam = window.AnimationRenderer.camera;
            const TS = GameEngine.TILE_SIZE;
            
            // 將 entity 世界座標轉為螢幕座標 (考慮 2x2 建築的中點偏移)
            const sx = this.activeMenuEntity.x + cam.x + (TS); 
            const sy = this.activeMenuEntity.y + cam.y + (TS * 2) + 10; 
            
            menu.style.left = `${sx}px`;
            menu.style.top = `${sy}px`;
        }
    }
}

window.GameEngine = GameEngine;
window.UIManager = UIManager;
