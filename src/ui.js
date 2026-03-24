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
        buildingPanel.appendChild(title);

        const listContainer = document.createElement("div");
        listContainer.id = "building_list";
        this.refreshBuildingList(listContainer, bp);

        buildingPanel.appendChild(listContainer);
        this.uiLayer.appendChild(buildingPanel);

        // 3. 日誌面板
        const lp = UI_CONFIG.LogPanel;
        const logPanel = document.createElement("div");
        logPanel.className = "panel";
        logPanel.id = "log_panel";
        logPanel.style.cssText = `
            position: absolute; left: ${lp.x}px; top: ${lp.y}px;
            width: ${lp.width}px; height: ${lp.height}px;
            background: ${lp.bgColor}; font-family: monospace;
            overflow: hidden; pointer-events: auto;
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
        `;
        btn.innerHTML = `<strong>${item.name}</strong><br><small>${item.desc}</small>`;
        
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

    static handleWorldClick(e) {
        if (e.target.closest(".panel")) return;
        const cam = window.AnimationRenderer.camera;
        const tc = GameEngine.state.mapEntities.find(ent => ent.type === 'village' || ent.type === 'town_center');
        if (tc) {
            if (Math.hypot(tc.x - (e.clientX - cam.x), tc.y - (e.clientY - cam.y)) < 80) this.showContextMenu(e.clientX, e.clientY);
            else this.hideContextMenu();
        }
    }

    static showContextMenu(x, y) {
        const menu = document.getElementById("context_menu");
        menu.style.display = "block";
        menu.style.left = `${x}px`; menu.style.top = `${y}px`;
        menu.innerHTML = `
            <div class="title" style="margin-bottom:10px">派遣村民</div>
            <button class="menu-btn" onclick="GameEngine.setCommand('WOOD')">🪓 伐木</button>
            <button class="menu-btn" onclick="GameEngine.setCommand('STONE')">⛏️ 採礦</button>
            <button class="menu-btn" onclick="GameEngine.setCommand('FOOD')">🧺 採集食物</button>
            <hr>
            <button class="menu-btn" onclick="GameEngine.setCommand('RETURN'); UIManager.hideContextMenu()">🏘️ 全員召回</button>
            <button class="menu-btn" onclick="UIManager.hideContextMenu()">❌ 關閉選單</button>
        `;
        menu.querySelectorAll(".menu-btn").forEach(b => b.style.cssText = `
            display: block; width: 100%; margin: 5px 0; padding: 8px;
            background: #4e342e; color: white; border: 1px solid #795548; cursor: pointer;
        `);
    }

    static hideContextMenu() {
        const menu = document.getElementById("context_menu");
        if (menu) menu.style.display = "none";
    }

    static updateValues() {
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
        const lp = document.getElementById("log_panel");
        if (lp) lp.innerHTML = GameEngine.state.log.map(msg => `<div>> ${msg}</div>`).join("");
    }
}

window.GameEngine = GameEngine;
window.UIManager = UIManager;
