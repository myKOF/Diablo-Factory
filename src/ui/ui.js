import { UI_CONFIG } from "./ui_config.js";
import { GameEngine } from "../systems/game_systems.js";

/**
 * UI 管理器
 * 負責渲染介面並處理動態建築清單
 */
export class UIManager {
    static uiLayer;
    static dragGhost = null;
    static activeBuilding = null;
    static logHeight = 200; // 預設日誌高度
    static isResizingLog = false;
    static logFilters = { COMMON: true, PATH: true }; // 日誌篩選器
    static startY = 0;
    static startHeight = 200;
    static leftMouseDownPos = null; // 記錄左鍵按下位置，用於過濾框選後的誤觸
    static lastUIState = {
        resources: "",
        logHash: "",
        queueInfo: ""
    };

    static init() {
        this.uiLayer = document.getElementById("ui_layer");
        if (!this.uiLayer) return;

        // [核心修正] 將 UIManager 暴露至全域，確保 HTML 字串中的 onclick 能正確呼叫方法
        window.UIManager = this;

        this.renderAll();
        // ... (其餘事件綁定保持不變)

        // 綁定世界級事件
        window.addEventListener("mousedown", (e) => this.handleWorldMouseDown(e));
        window.addEventListener("mousemove", (e) => this.handleWorldMouseMove(e));
        window.addEventListener("mouseup", (e) => this.handleWorldMouseUp(e));
        window.addEventListener("click", (e) => this.handleWorldClick(e), { capture: true });
        window.addEventListener("mousemove", (e) => {
            if (UIManager.isResizingLog) {
                const dy = UIManager.startY - e.clientY;
                UIManager.logHeight = Math.max(100, Math.min(window.innerHeight - 200, UIManager.startHeight + dy));
                const logPanel = document.getElementById("log_panel");
                if (logPanel) {
                    logPanel.style.height = `${UIManager.logHeight}px`;
                    const restoreBtn = document.getElementById("log_restore_btn");
                    if (restoreBtn) {
                        const defaultHeight = UI_CONFIG.LogPanel.height || 200;
                        restoreBtn.style.display = Math.abs(UIManager.logHeight - defaultHeight) > 5 ? "flex" : "none";
                    }
                }
            }
        });
        window.addEventListener("mouseup", () => {
            if (UIManager.isResizingLog) {
                UIManager.isResizingLog = false;
                const logPanel = document.getElementById("log_panel");
                if (logPanel) {
                    logPanel.style.borderTopColor = "";
                    logPanel.style.borderTopWidth = "1.5px";
                }
            }
        });
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape") this.cancelBuildingMode();
        });
        window.addEventListener("contextmenu", (e) => {
            if (GameEngine.state.placingType || this.activeMenuEntity) {
                e.preventDefault();
                // 如果偵測到剛發生過相機拖動，則不執行取消建築模式的操作
                const scene = window.PhaserScene;
                const wasDragging = scene && scene.lastDragTime && (Date.now() - scene.lastDragTime < 100);
                if (GameEngine.state.placingType && !wasDragging) this.cancelBuildingMode();
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

    static hexToRgba(hex, alpha) {
        if (!hex || !hex.startsWith('#')) return hex;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha || 1})`;
    }

    static renderAll() {
        this.uiLayer.innerHTML = "";

        // 1. 資源列
        const rbCfg = UI_CONFIG.ResourceBar;
        const resourceBar = document.createElement("div");
        resourceBar.className = "panel";
        resourceBar.id = "resource_bar";
        this.applyAnchorStyle(resourceBar, rbCfg);

        // 額外樣式設定
        resourceBar.style.fontSize = rbCfg.fontSize;
        resourceBar.style.color = rbCfg.fontColor;
        resourceBar.style.display = "flex";
        resourceBar.style.alignItems = "center";
        resourceBar.style.justifyContent = "space-around";
        resourceBar.style.pointerEvents = "auto";

        this.uiLayer.appendChild(resourceBar);

        // 2. 建築面板
        const bpCfg = UI_CONFIG.BuildingPanel;
        const buildingPanel = document.createElement("div");
        buildingPanel.className = "panel";
        this.applyAnchorStyle(buildingPanel, bpCfg);
        buildingPanel.style.pointerEvents = "auto";

        const title = document.createElement("div");
        title.className = "title";
        title.innerText = bpCfg.title;
        title.style.fontSize = bpCfg.titleSize;
        title.style.color = bpCfg.titleColor;
        title.style.borderBottomColor = bpCfg.titleColor;
        buildingPanel.appendChild(title);

        const listContainer = document.createElement("div");
        listContainer.id = "building_list";
        this.refreshBuildingList(listContainer, bpCfg);

        buildingPanel.appendChild(listContainer);
        this.uiLayer.appendChild(buildingPanel);

        // 3. 日誌面板
        const logCfg = UI_CONFIG.LogPanel;
        const logPanel = document.createElement("div");
        logPanel.id = "log_panel";
        logPanel.className = "panel";
        this.applyAnchorStyle(logPanel, logCfg);

        logPanel.style.background = this.hexToRgba(logCfg.bgColor, logCfg.bgAlpha);
        logPanel.style.color = "#e0f2f1";
        logPanel.style.padding = logCfg.padding;
        logPanel.style.border = `1.5px solid ${logCfg.borderColor}`;
        logPanel.style.fontSize = logCfg.fontSize;
        logPanel.style.fontFamily = "'Courier New', monospace";
        logPanel.style.display = "flex";
        logPanel.style.flexDirection = "column";
        logPanel.style.overflow = "visible"; // 確保拉伸把手和按鈕不被裁剪
        logPanel.style.pointerEvents = "auto";
        logPanel.style.boxSizing = "border-box";
        logPanel.style.height = `${this.logHeight}px`;
        logPanel.style.position = "absolute"; // 確保子元素絕對定位正常

        // 日誌內容容器 (真正滾動的地方)
        const logContent = document.createElement("div");
        logContent.id = "log_content";
        logContent.style.cssText = `
            flex: 1; width: 100%; overflow-y: auto;
            pointer-events: auto; padding: 0;
        `;
        logPanel.appendChild(logContent);

        // [TEST] 加入選中單位調試列 (刷新座標)
        const debugInfo = document.createElement("div");
        debugInfo.id = "unit_debug_info";
        debugInfo.style.cssText = `
            background: rgba(0,0,0,0.5); padding: 5px 10px;
            color: #ffeb3b; font-weight: bold; font-size: 11px;
            border-top: 1px solid rgba(255, 235, 59, 0.3);
            display: none;
        `;
        logPanel.appendChild(debugInfo);

        // 加上拉伸拉手 (視覺化的小橫線)
        const handle = document.createElement("div");
        handle.id = "log_handle";
        handle.style.cssText = `
            position: absolute; top: 0; left: 50%; transform: translateX(-50%);
            width: 40px; height: 16px; display: flex; align-items: center; justify-content: center;
            cursor: ns-resize; font-size: 14px; color: ${this.hexToRgba(logCfg.borderColor, 0.7)};
            background: ${this.hexToRgba(logCfg.bgColor, 0.9)}; border: 1px solid ${this.hexToRgba(logCfg.borderColor, 0.5)};
            border-top: none; border-radius: 0 0 6px 6px; z-index: 200; pointer-events: auto;
        `;
        handle.innerHTML = "•••";
        logPanel.appendChild(handle);

        // 面板本身的滑鼠事件處理 (用於偵測頂部邊緣)
        logPanel.onmousemove = (e) => {
            const rect = logPanel.getBoundingClientRect();
            // 在頂部 10px 區域顯示拉伸游標
            if (e.clientY <= rect.top + 10) {
                logPanel.style.cursor = "ns-resize";
            } else {
                logPanel.style.cursor = "default";
            }
        };

        logPanel.onmousedown = (e) => {
            const rect = logPanel.getBoundingClientRect();
            if (e.clientY <= rect.top + 15) {
                e.preventDefault();
                UIManager.isResizingLog = true;
                UIManager.startY = e.clientY;
                UIManager.startHeight = UIManager.logHeight;
                logPanel.style.borderTopColor = "#ffeb3b";
                logPanel.style.borderTopWidth = "3px";
                return;
            }
        };

        // 加入恢復按鈕 (向下箭頭)
        const restoreBtn = document.createElement("div");
        restoreBtn.id = "log_restore_btn";
        restoreBtn.innerHTML = "▼";
        restoreBtn.title = "恢復預設高度";
        restoreBtn.style.cssText = `
            position: absolute; top: 12px; right: 12px; width: 24px; height: 24px;
            background: ${this.hexToRgba(logCfg.bgColor, 0.95)}; border: 1.5px solid ${logCfg.borderColor};
            color: #fff; display: none; align-items: center; justify-content: center;
            cursor: pointer; font-size: 12px; border-radius: 4px; transition: all 0.2s;
            z-index: 300; pointer-events: auto;
        `;
        restoreBtn.onclick = (e) => {
            e.stopPropagation();
            UIManager.logHeight = logCfg.height || 200;
            const lp = document.getElementById("log_panel");
            if (lp) lp.style.height = `${UIManager.logHeight}px`;
            restoreBtn.style.display = "none";
        };
        restoreBtn.onmouseover = () => restoreBtn.style.background = logCfg.borderColor;
        restoreBtn.onmouseout = () => restoreBtn.style.background = this.hexToRgba(logCfg.bgColor, 0.95);
        logPanel.appendChild(restoreBtn);

        // 加入清理按鈕 (垃圾桶)
        const clearBtn = document.createElement("div");
        clearBtn.id = "log_clear_btn";
        clearBtn.innerHTML = "🗑️";
        clearBtn.title = "清理日誌內容";
        clearBtn.style.cssText = `
            position: absolute; top: 12px; right: 44px; width: 24px; height: 24px;
            background: ${this.hexToRgba(logCfg.bgColor, 0.95)}; border: 1.5px solid ${logCfg.borderColor};
            color: #fff; display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 13px; border-radius: 4px; transition: all 0.2s;
            z-index: 300; pointer-events: auto;
        `;
        clearBtn.onclick = (e) => {
            e.stopPropagation();
            GameEngine.state.log = [];
            const lc = document.getElementById("log_content");
            if (lc) lc.innerHTML = "";
            GameEngine.addLog("日誌系統已重置。");
        };
        clearBtn.onmouseover = () => clearBtn.style.background = logCfg.borderColor;
        clearBtn.onmouseout = () => clearBtn.style.background = this.hexToRgba(logCfg.bgColor, 0.95);
        logPanel.appendChild(clearBtn);

        // 加入篩選按鈕 (漏斗)
        const filterBtn = document.createElement("div");
        filterBtn.id = "log_filter_btn";
        filterBtn.innerHTML = "🔍";
        filterBtn.title = "篩選日誌類型";
        filterBtn.style.cssText = `
            position: absolute; top: 12px; right: 76px; width: 24px; height: 24px;
            background: ${this.hexToRgba(logCfg.bgColor, 0.95)}; border: 1.5px solid ${logCfg.borderColor};
            color: #fff; display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 13px; border-radius: 4px; transition: all 0.2s;
            z-index: 300; pointer-events: auto;
        `;

        // 篩選選單容器
        const filterMenu = document.createElement("div");
        filterMenu.id = "log_filter_menu";
        filterMenu.style.cssText = `
            position: absolute; bottom: 30px; right: 0; width: 120px;
            background: ${this.hexToRgba(logCfg.bgColor, 0.95)}; border: 1.5px solid ${logCfg.borderColor};
            border-radius: 4px; padding: 10px; display: none; flex-direction: column; gap: 8px;
            z-index: 400; box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        `;

        const categories = { COMMON: "一般訊息", PATH: "尋路訊息" };
        Object.entries(categories).forEach(([key, label]) => {
            const item = document.createElement("label");
            item.style.cssText = `display: flex; align-items: center; gap: 8px; font-size: 13px; color: #fff; cursor: pointer;`;
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = this.logFilters[key];
            checkbox.onchange = (e) => {
                e.stopPropagation();
                this.logFilters[key] = checkbox.checked;
                this.updateValues(true); // 強制更新
            };
            item.appendChild(checkbox);
            item.appendChild(document.createTextNode(label));
            filterMenu.appendChild(item);
        });

        // 防止點擊選單內部時導致選單關閉
        filterMenu.onclick = (e) => e.stopPropagation();

        filterBtn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = filterMenu.style.display === "flex";
            filterMenu.style.display = isVisible ? "none" : "flex";

            // 如果開啟選單，隱藏其它可能干擾的 UI (如果有)
        };
        filterBtn.appendChild(filterMenu);
        logPanel.appendChild(filterBtn);

        this.uiLayer.appendChild(logPanel);

        // 4. 系統設置按鈕 (齒輪)
        const setBtnCfg = UI_CONFIG.SettingsButton;
        const setBtn = document.createElement("div");
        setBtn.id = "settings_btn";
        setBtn.className = "panel glass-panel"; // 使用共同的面板類別
        this.applyAnchorStyle(setBtn, setBtnCfg);
        setBtn.style.textAlign = "center";
        setBtn.style.lineHeight = `${setBtnCfg.height}px`;
        setBtn.style.fontSize = setBtnCfg.fontSize;
        setBtn.style.background = this.hexToRgba(setBtnCfg.bgColor, setBtnCfg.bgAlpha);
        setBtn.style.cursor = "pointer";
        setBtn.style.pointerEvents = "auto";
        setBtn.style.display = "flex";
        setBtn.style.alignItems = "center";
        setBtn.style.justifyContent = "center";
        setBtn.innerHTML = setBtnCfg.icon || "⚙️";
        setBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleSettingsPanel();
        };
        this.uiLayer.appendChild(setBtn);

        // 5. 系統設置選單面板
        const setPanel = document.createElement("div");
        setPanel.id = "settings_panel";
        setPanel.className = "panel glass-panel";
        setPanel.style.display = "none"; // 預設隱藏
        setPanel.style.zIndex = "1001";
        setPanel.style.pointerEvents = "auto";
        this.applyAnchorStyle(setPanel, UI_CONFIG.SettingsPanel);
        this.uiLayer.appendChild(setPanel);

        // 6. 座標顯示
        const coordsCfg = UI_CONFIG.CoordsDisplay;
        const coordsEl = document.createElement("div");
        coordsEl.id = "coords_display";
        coordsEl.className = "panel glass-panel";
        this.applyAnchorStyle(coordsEl, coordsCfg);
        coordsEl.style.display = "flex";
        coordsEl.style.alignItems = "center";
        coordsEl.style.justifyContent = "center";
        coordsEl.style.fontSize = coordsCfg.fontSize;
        coordsEl.style.color = coordsCfg.fontColor;
        coordsEl.style.padding = coordsCfg.padding;
        coordsEl.style.pointerEvents = "none"; // 座標顯示不應阻擋點擊
        coordsEl.innerHTML = "X: 0, Y: 0";
        this.uiLayer.appendChild(coordsEl);

        // 7. FPS 顯示
        const fpsCfg = UI_CONFIG.FPSDisplay;
        const fpsEl = document.createElement("div");
        fpsEl.id = "fps_display";
        fpsEl.className = "panel glass-panel";
        this.applyAnchorStyle(fpsEl, fpsCfg);
        fpsEl.style.display = "flex";
        fpsEl.style.alignItems = "center";
        fpsEl.style.justifyContent = "center";
        fpsEl.style.fontSize = fpsCfg.fontSize;
        fpsEl.style.color = fpsCfg.fontColor;
        fpsEl.style.padding = fpsCfg.padding;
        fpsEl.style.pointerEvents = "none";
        fpsEl.innerHTML = "FPS: --";
        this.uiLayer.appendChild(fpsEl);

        // 8. 村莊中心定位指針
        const tcPtrCfg = UI_CONFIG.TownCenterPointer;
        const tcPtr = document.createElement("div");
        tcPtr.id = "tc_locator";
        tcPtr.className = "panel glass-panel";
        tcPtr.style.cssText = `
            position: absolute; display: none; width: ${tcPtrCfg.width}px; height: ${tcPtrCfg.height}px;
            border-radius: 50%; padding: 0; align-items: center; justify-content: center;
            background: ${this.hexToRgba(tcPtrCfg.bgColor, tcPtrCfg.bgAlpha)}; border: 4px solid #ffffff;
            box-shadow: 0 0 20px rgba(0,0,0,0.8), inset 0 0 10px rgba(0,0,0,0.3);
            outline: 2px solid #000000; outline-offset: -1px;
            cursor: pointer; z-index: 2000; pointer-events: auto;
            transition: transform 0.1s;
        `;
        tcPtr.innerHTML = `
            <div style="font-size: ${tcPtrCfg.fontSize}; filter: drop-shadow(0 0 3px rgba(0,0,0,0.5));">${tcPtrCfg.icon}</div>
            <div id="tc_arrow" style="position: absolute; font-size: 28px; color: #ffffff; text-shadow: 0 0 8px rgba(0,0,0,0.9); font-weight: bold;">${tcPtrCfg.arrowIcon}</div>
            <div id="tc_distance" style="position: absolute; bottom: 4px; font-size: ${tcPtrCfg.distanceFontSize || '12px'}; color: ${tcPtrCfg.distanceColor || '#fff'}; font-weight: bold; background: rgba(0,0,0,0.4); padding: 0 4px; border-radius: 4px;">--m</div>
        `;
        tcPtr.onclick = (e) => {
            e.stopPropagation();
            this.panToTownCenter();
        };
        tcPtr.onmouseover = () => tcPtr.style.transform = "scale(1.1)";
        tcPtr.onmouseout = () => tcPtr.style.transform = "scale(1)";
        this.uiLayer.appendChild(tcPtr);

        // 8. 指令選單 (智慧定位，支援固定錨點)
        const menu = document.getElementById("context_menu") || document.createElement("div");
        menu.id = "context_menu";
        menu.className = "panel";
        const menuCfg = UI_CONFIG.ActionMenu;
        menu.style.cssText = `position: absolute; display: none; z-index: 1000; pointer-events: auto;`;
        if (menuCfg.anchor) this.applyAnchorStyle(menu, menuCfg);
        this.uiLayer.appendChild(menu);

        // 9. 獨立的銷毀按鈕 (右上角的小 X)
        const destroyBtn = document.createElement("div");
        destroyBtn.id = "destroy_btn";
        destroyBtn.innerHTML = "×";
        destroyBtn.title = "銷毀建築";
        destroyBtn.style.cssText = `
            position: absolute; display: none; width: 18px; height: 18px;
            background: rgba(244, 67, 54, 0.9); color: white; border: 1px solid #fff;
            border-radius: 3px; align-items: center; justify-content: center;
            cursor: pointer; font-size: 14px; font-weight: bold; z-index: 1100;
            pointer-events: auto; box-shadow: 0 2px 5px rgba(0,0,0,0.5);
            transition: transform 0.1s;
        `;
        destroyBtn.onclick = (e) => {
            e.stopPropagation();
            this.confirmDestroy(e);
        };
        destroyBtn.onmouseover = () => destroyBtn.style.transform = "scale(1.2)";
        destroyBtn.onmouseout = () => destroyBtn.style.transform = "scale(1)";
        this.uiLayer.appendChild(destroyBtn);
    }

    /**
     * 套用錨點對齊樣式
     */
    static applyAnchorStyle(el, cfg) {
        if (!cfg || !cfg.anchor) return;

        el.style.position = "absolute";
        const offX = cfg.offsetX || 0;
        const offY = cfg.offsetY || 0;

        // 重置可能的樣式
        el.style.left = el.style.right = el.style.top = el.style.bottom = el.style.transform = "";

        switch (cfg.anchor) {
            case "TOP_LEFT":
                el.style.left = `${offX}px`;
                el.style.top = `${offY}px`;
                break;
            case "TOP_CENTER":
                el.style.left = "50%";
                el.style.top = `${offY}px`;
                el.style.transform = `translateX(-50%)`;
                if (offX) el.style.marginLeft = `${offX}px`;
                break;
            case "TOP_RIGHT":
                el.style.right = `${offX}px`;
                el.style.top = `${offY}px`;
                break;
            case "BOTTOM_LEFT":
                el.style.left = `${offX}px`;
                el.style.bottom = `${offY}px`;
                break;
            case "BOTTOM_CENTER":
                el.style.left = "50%";
                el.style.bottom = `${offY}px`;
                el.style.transform = `translateX(-50%)`;
                if (offX) el.style.marginLeft = `${offX}px`;
                break;
            case "BOTTOM_RIGHT":
                el.style.right = `${offX}px`;
                el.style.bottom = `${offY}px`;
                break;
            case "CENTER":
                el.style.left = "50%";
                el.style.top = "50%";
                el.style.transform = `translate(-50%, -50%)`;
                if (offX || offY) el.style.transform += ` translate(${offX}px, ${offY}px)`;
                break;
        }

        if (cfg.width) el.style.width = typeof cfg.width === 'number' ? `${cfg.width}px` : cfg.width;
        if (cfg.height) el.style.height = typeof cfg.height === 'number' ? `${cfg.height}px` : cfg.height;

        // 進階美化
        if (cfg.glass) el.classList.add("glass-panel");
        if (cfg.shadowColor) el.style.boxShadow = `0 10px 40px ${this.hexToRgba(cfg.shadowColor, cfg.shadowAlpha)}`;
        else if (cfg.shadow) el.style.boxShadow = cfg.shadow;
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
            farmland: "🌱", alchemy_lab: "⚗️", cathedral: "⛪", academy: "🧙",
            tree_plantation: "🌳", mage_place: "🧙", swordsman_place: "⚔️", archer_place: "🏹"
        };

        // 改為從 bp.list 讀取，確保順序與顯示內容正確
        bp.list.forEach(listItem => {
            const cfg = configs[listItem.id];
            if (!cfg) return;

            const currentCount = GameEngine.state.mapEntities.filter(e => e.type === cfg.model).length;

            const costStr = [];
            if (cfg.costs.food > 0) costStr.push(`🍖${cfg.costs.food}`);
            if (cfg.costs.wood > 0) costStr.push(`🪵${cfg.costs.wood}`);
            if (cfg.costs.stone > 0) costStr.push(`🪨${cfg.costs.stone}`);
            if (cfg.costs.gold > 0) costStr.push(`💰${cfg.costs.gold}`);

            const item = {
                id: cfg.model,
                name: listItem.name || cfg.name,
                icon: buildingIcons[cfg.model] || "🏗️",
                desc: `${listItem.desc || cfg.desc}<br>消耗: ${costStr.join(' ')}`
            };
            this.createBuildingBtn(container, bp, item);
        });
    }

    static createBuildingBtn(container, bp, item) {
        const btn = document.createElement("div");
        btn.className = "building-item";
        btn.setAttribute("data-type", item.id);

        // 使用 Flexbox 佈局以適應不同高度
        btn.style.cssText = `
            position: relative; 
            height: ${bp.itemHeight}px; 
            border: 1px solid rgba(255, 255, 255, 0.1);
            margin: 4px 0; 
            padding: 0 12px; 
            background: rgba(45, 45, 45, 0.6);
            color: ${bp.textColor}; 
            cursor: pointer; 
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            flex-direction: column;
            justify-content: center;
            overflow: hidden;
            box-sizing: border-box;
            border-radius: 4px;
        `;

        // 內部文字容器
        const content = document.createElement("div");
        content.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 2px;
            pointer-events: none;
            width: calc(100% - 45px);
        `;

        content.innerHTML = `
            <div style="color: ${bp.titleColor}; font-size: ${bp.fontSize}; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</div>
            <div style="color: ${this.hexToRgba(bp.descColor, bp.descAlpha)}; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.desc}</div>
        `;

        // 圖示容器
        const iconSize = Math.min(40, bp.itemHeight - 16);
        const icon = document.createElement("div");
        icon.className = "building-icon";
        icon.style.cssText = `
            position: absolute; 
            right: 12px; 
            top: 50%;
            transform: translateY(-50%);
            width: ${iconSize}px; 
            height: ${iconSize}px; 
            border: 1.5px solid #ff5722;
            background: rgba(255, 87, 34, 0.15);
            display: flex; 
            align-items: center; 
            justify-content: center;
            font-size: ${iconSize * 0.6}px; 
            pointer-events: none;
            border-radius: 4px;
            box-shadow: inset 0 0 10px rgba(255, 87, 34, 0.2);
        `;
        icon.innerHTML = item.icon || "🏗️";

        // 事件綁定
        btn.onmousedown = (e) => {
            if (e.button !== 0) return;
            this.mouseDownPos = { x: e.clientX, y: e.clientY };
            this.mouseDownTime = Date.now();
            this.potentialDragType = item.id;
        };

        btn.onclick = (e) => {
            e.stopPropagation();
            if (this.dragGhost) return;
            if (Date.now() - this.mouseDownTime > 300) return;

            if (GameEngine.state.placingType === item.id) {
                this.cancelBuildingMode();
            } else {
                this.startStampMode(item.id);
            }
        };

        btn.appendChild(content);
        btn.appendChild(icon);
        container.appendChild(btn);
    }

    static createWarningHint() {
        if (document.getElementById("warning_hint")) return;
        const cfg = UI_CONFIG.WarningHUD;
        const warn = document.createElement("div");
        warn.id = "warning_hint";

        this.applyAnchorStyle(warn, cfg);

        warn.style.color = cfg.fontColor;
        warn.style.fontSize = cfg.fontSize;
        warn.style.fontWeight = "600";
        warn.style.background = this.hexToRgba(cfg.bgColor, cfg.bgAlpha);
        warn.style.border = `2px solid ${cfg.borderColor}`;
        warn.style.padding = cfg.padding;
        warn.style.borderRadius = "8px";
        warn.style.pointerEvents = "none";
        warn.style.opacity = "0";
        warn.style.transition = "all 0.4s cubic-bezier(0.19, 1, 0.22, 1)";
        warn.style.zIndex = "99999";
        warn.style.textAlign = "center";
        warn.style.minWidth = "300px";
        warn.style.display = "none";
        warn.style.fontFamily = "'Outfit', 'Inter', sans-serif";
        warn.style.letterSpacing = "1px";

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
        GameEngine.state.previewPos = null; // 核心修復：清除上一次的預覽位置，防止跳躍
        this.activeBuilding = null;
        GameEngine.state.linePreviewEntities = [];
        if (this.dragGhost) {
            document.body.removeChild(this.dragGhost);
            this.dragGhost = null;
        }
    }

    static getWorldMousePos(clientX, clientY) {
        // 先將螢幕座標轉換為遊戲容器內的虛擬座標 (考慮到 transform: scale)
        const local = this.getLocalMouse({ clientX, clientY });

        const scene = window.PhaserScene;
        // Phaser 的相機座標本身就在世界空間，我們需要加上相機位置來獲取世界座標
        // Phaser 相機 scrollX 為正值時表示畫面往右移，所以在世界空間中座標 = local + scroll
        const cam = scene ? { x: scene.cameras.main.scrollX, y: scene.cameras.main.scrollY } : { x: 0, y: 0 };
        const TS = GameEngine.TILE_SIZE;
        const cfg = GameEngine.state.buildingConfigs[this.activeBuilding];

        let uw = 1, uh = 1;
        if (cfg && cfg.size) {
            const match = cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
            if (match) { uw = parseInt(match[1]); uh = parseInt(match[2]); }
        }

        // 核心對齊演算法：
        // 奇數尺寸 (1x1, 3x3) 的建築物中心點應在「格子正中央」 (例如 x.5 * 20)
        // 偶數尺寸 (2x2) 的建築物中心點應在「格子交界線上」 (例如 x.0 * 20)
        let gx, gy;
        if (uw % 2 !== 0) {
            gx = Math.floor((local.x + cam.x) / TS) + 0.5;
        } else {
            gx = Math.round((local.x + cam.x) / TS);
        }

        if (uh % 2 !== 0) {
            gy = Math.floor((local.y + cam.y) / TS) + 0.5;
        } else {
            gy = Math.round((local.y + cam.y) / TS);
        }

        return {
            x: gx * TS,
            y: gy * TS
        };
    }

    static handleWorldMouseDown(e) {
        if (e.target.closest("#ui_layer")) return;

        // 記錄按下的座標，用於在 MouseUp 時判斷是否為「點擊」還是「拖動畫面」
        if (e.button === 2) {
            // [核心修復] 在操作起始階段，標記本次右鍵是否是「取消建造」
            // 因為後續 contextmenu 事件可能會提前清空 GameEngine.state.placingType
            GameEngine.state.rightClickStartedInPlacementMode = !!GameEngine.state.placingType;
            this.rightMouseDownPos = { x: e.clientX, y: e.clientY };
            this.rightMouseDownTime = Date.now();
            return;
        }

        // 僅處理左鍵
        if (e.button !== 0) return;

        this.leftMouseDownPos = { x: e.clientX, y: e.clientY };

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

        // 優先更新 HTML 拖曳外框 (確保它在 UI 面板上也能順暢跟隨滑鼠)
        if (state.buildingMode === 'DRAG' && this.dragGhost) {
            this.dragGhost.style.left = `${e.clientX - 20}px`;
            this.dragGhost.style.top = `${e.clientY - 20}px`;
        }

        // 如果鼠標在 UI 面板上，隱藏 Phaser 虛影
        if (e.target.closest(".panel")) {
            state.previewPos = null;
            state.linePreviewEntities = [];
            return;
        }

        const pos = this.getWorldMousePos(e.clientX, e.clientY);
        state.previewPos = pos;

        if (state.buildingMode === 'LINE') {
            if (state.lineStartPos) {
                state.linePreviewEntities = GameEngine.getLinePositions(state.placingType, state.lineStartPos.x, state.lineStartPos.y, pos.x, pos.y);
            }
        }
    }

    static handleWorldMouseUp(e) {
        // [右鍵邏輯專區]
        if (e.button === 2) {
            if (this.rightMouseDownPos) {
                const now = Date.now();
                const drift = Math.hypot(e.clientX - this.rightMouseDownPos.x, e.clientY - this.rightMouseDownPos.y);
                const duration = now - (this.rightMouseDownTime || 0);
                this.rightMouseDownPos = null;

                // [核心修復] 僅在「右鍵單擊」而非「右鍵移動」(拖動畫框) 時取消建造模式
                if (GameEngine.state.rightClickStartedInPlacementMode) {
                    const scene = window.PhaserScene;
                    const wasDragging = scene && scene.lastDragTime && (Date.now() - scene.lastDragTime < 100);
                    
                    if (drift < 10 && !wasDragging) {
                        this.cancelBuildingMode();
                    }
                    GameEngine.state.rightClickStartedInPlacementMode = false;
                    return;
                }

                // 核心同步：判斷 Phaser 相機是否在移動中 (依據 MainScene.js 邏輯)
                const scene = window.PhaserScene;
                const wasDragging = scene && scene.lastDragTime && (now - scene.lastDragTime < 100);

                // 如果位移超過 10 或在過去 0.1 秒內發生過畫面拖移，則判定為拖移而非指令
                if (drift < 10 && !wasDragging) {
                    const ent = this.activeMenuEntity;
                    const bCfg = ent ? GameEngine.state.buildingConfigs[ent.type] : null;

                    // 1. 設定/取消集結點
                    if (bCfg && bCfg.npcProduction && bCfg.npcProduction.length > 0) {
                        const pos = this.getWorldMousePos(e.clientX, e.clientY);
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
                            this.updateValues(true);
                        } else {
                            ent.rallyPoint = pos;
                            GameEngine.addLog(`${bCfg.name} 集結點已設定：(${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`);
                            this.updateValues(true);
                        }
                    } else if (GameEngine.state.placingType) {
                        // 2. 取消當前的建造預覽
                        this.cancelBuildingMode();
                    }
                }
            }
            return;
        }

        // [左鍵邏輯專區]
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
        // [核心修正] 框選衝突修補：如果滑鼠位移過大 (例如正在框選單位)，則忽略本次點擊，防止建築被「一併選中」。
        // 此處必須在函數最頂層處理，確保不論點擊何處 (包括 UI) 都能正確消耗掉滑鼠位移狀態。
        if (this.leftMouseDownPos) {
            const drift = Math.hypot(e.clientX - this.leftMouseDownPos.x, e.clientY - this.leftMouseDownPos.y);
            // 核心衝突點：此閾值必須與 MainScene.js 的框選啟動閾值 (5px) 同步。
            // 只要偵測到超過 5px 的位移，即視為有意圖的「框選」或「拖動」，此時應封鎖建築選單的自動開啟。
            const threshold = 5; 
            const wasDrag = drift > threshold;
            this.leftMouseDownPos = null; // 立即消耗
            if (wasDrag) return;
        }

        // 全域關閉日誌篩選選單
        const filterMenu = document.getElementById("log_filter_menu");
        if (filterMenu && filterMenu.style.display === "flex") {
            const filterBtn = document.getElementById("log_filter_btn");
            if (filterBtn && !filterBtn.contains(e.target)) {
                filterMenu.style.display = "none";
            }
        }

        if (this.dragGhost) return;

        const state = GameEngine.state;

        // 核心邏輯：明確區分「本身指令選單」與「他者 UI/地面」
        const menuEl = document.getElementById("context_menu");
        const distBtnEl = document.getElementById("destroy_btn");
        const isSelfUI = (menuEl && menuEl.contains(e.target)) || (distBtnEl && distBtnEl.contains(e.target));

        if (!isSelfUI) {
            this.hideContextMenu();
        }

        // 點擊 UI 區域後的額外處理
        if (e.target.closest("#ui_layer")) {
            if (!e.target.closest("#settings_btn") && !e.target.closest("#settings_panel")) {
                this.hideSettingsPanel();
            }
            // 如果點到的是具體的 UI 標籤或按鈕 (而非背景層)，則中止後續地圖交互邏輯
            if (e.target.id !== "ui_layer") return;
        }

        // 點擊大地圖區域 (點在 0,0 層級或非 UI 區域)
        this.hideSettingsPanel();

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
            const cfg = GameEngine.getEntityConfig(ent.type);
            if (!cfg) return false;
            const em = cfg.size ? cfg.size.match(/\{(\d+),(\d+)\}/) : null;
            const w = (em ? parseInt(em[1]) : 1) * GameEngine.TILE_SIZE;
            const h = (em ? parseInt(em[2]) : 1) * GameEngine.TILE_SIZE;
            const mx = local.x - cam.x, my = local.y - cam.y;
            return mx > ent.x - w / 2 + 5 && mx < ent.x + w / 2 - 5 && my > ent.y - h / 2 + 5 && my < ent.y + h / 2 - 5;
        });

        if (clicked) {
            this.showContextMenu(clicked);
        }
    }

    static showContextMenu(entity, isConfirming = false) {
        this.activeMenuEntity = entity;
        const menu = document.getElementById("context_menu");
        const cfg = UI_CONFIG.ActionMenu;

        // 若配置有錨點設定則套用
        if (cfg.anchor) {
            this.applyAnchorStyle(menu, cfg);
        }

        menu.style.display = "flex";
        menu.style.flexDirection = "column";
        menu.style.padding = "15px";
        if (cfg.minWidth) menu.style.minWidth = typeof cfg.minWidth === 'number' ? `${cfg.minWidth}px` : cfg.minWidth;

        // ... (中間內容不變)

        let name = entity.isUnderConstruction ? (GameEngine.state.buildingConfigs[entity.type]?.name || "施工中的建築") : (entity.name || entity.type);
        let headerText = isConfirming ? 
            (entity.isUnderConstruction ? `確定取消建設 ${name} 並全額退還？` : `確定銷毀 ${name} 並退還 50%？`) 
            : name;
        let titleStyle = isConfirming ? `style="text-align:center; font-size: 20px; color:#ff8a80; border-bottom-color:#c62828;"` : `style="text-align:center; font-size: 20px;"`;

        let html = `<div class="title" ${titleStyle}>${headerText}</div>`;

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
                    <button class="action-btn" id="cmd_GOLD" onclick="window.GameEngine.setCommand(event, 'GOLD')">
                        <span class="icon">💰</span><span class="label">採集黃金</span>
                    </button>
                    <button class="action-btn" id="cmd_FOOD" onclick="window.GameEngine.setCommand(event, 'FOOD')">
                        <span class="icon">🧺</span><span class="label">採集食物</span>
                    </button>
                    <button class="action-btn" id="cmd_RETURN" onclick="window.GameEngine.setCommand(event, 'RETURN')">
                        <span class="icon">🏘️</span><span class="label">收工</span>
                    </button>
                `;
            }

            // 動態生成 NPC 生產按鈕
            const bCfg = GameEngine.state.buildingConfigs[entity.type];
            if (bCfg && bCfg.npcProduction && bCfg.npcProduction.length > 0 && !entity.isUnderConstruction) {
                const iconMap = {
                    'villagers': '👤', 'female villagers': '👩', 'mage': '🧙', 'swordsman': '⚔️', 'archer': '🏹',
                    '1': '👤', '2': '👩', '3': '⚔️', '4': '🧙', '5': '🏹'
                };

                if (bCfg.productionMode === 'rand') {
                    // 隨機生產模式
                    const firstId = bCfg.npcProduction[0];
                    const icon = iconMap[firstId] || '❓';
                    html += `
                        <button class="action-btn" onclick="window.GameEngine.addToProductionQueue(event, 'RANDOM', null)">
                            <span class="icon">${icon}</span><span class="label">隨機招募</span>
                            <div class="queue-badge" style="display:none">0</div>
                            <div class="progress-bar-mini"></div>
                        </button>
                    `;
                } else {
                    // 一般生產模式
                    bCfg.npcProduction.forEach(id => {
                        const name = GameEngine.state.idToNameMap[id] || id;
                        const icon = iconMap[id] || iconMap[name] || '👤';
                        html += `
                            <button class="action-btn" onclick="window.GameEngine.addToProductionQueue(event, '${id}', null)">
                                <span class="icon">${icon}</span><span class="label">${name}</span>
                                <div class="queue-badge" style="display:none">0</div>
                                <div class="progress-bar-mini"></div>
                            </button>
                        `;
                    });
                }
            }

            // 倉庫自動化管理介面
            const isWarehouse = ['timber_factory', 'stone_factory', 'barn', 'gold_mining_factory'].includes(entity.type);
            if (isWarehouse && !entity.isUnderConstruction) {
                const currentAssigned = GameEngine.state.units.villagers.filter(v =>
                    v.config && v.config.type === 'villagers' && v.config.camp === 'player' &&
                    v.assignedWarehouseId === eid
                ).length;
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
        }

        html += `</div>`;

        // 判斷是否隱藏選單：如果除了標題外沒有任何操作按鈕，且非銷毀確認模式，則隱藏選單
        const hasActions = html.includes('action-btn') || html.includes('warehouse-controls');
        if (!hasActions && !isConfirming) {
            menu.style.display = "none";
        } else {
            menu.style.display = "flex"; // 確保恢復顯示
            menu.innerHTML = html;
            if (!cfg.anchor) {
                // 先把選單移出可視區域，等 DOM 渲染一幀取得真實尺寸後再定位，避免首幀跳動
                menu.style.left = "-9999px";
                menu.style.top = "-9999px";
            }
        }

        // 顯示銷毀按鈕 (只有在非確認模式下才顯示右上角的 X)
        const destroyBtn = document.getElementById("destroy_btn");
        if (destroyBtn) {
            const villageCount = GameEngine.state.mapEntities.filter(e => e.type === 'town_center' || e.type === 'village').length;
            const isLastVillage = (entity.type === 'town_center' || entity.type === 'village') && villageCount <= 1;
            destroyBtn.style.display = (!isConfirming && !isLastVillage) ? "flex" : "none";
        }

        this.updateValues();
        requestAnimationFrame(() => this.updateStickyPositions());
    }

    static confirmDestroy(event) {
        if (event) event.stopPropagation();
        const ent = this.activeMenuEntity;
        if (!ent) return;

        // 切換到確認模式
        this.showContextMenu(ent, true);
    }

    static cancelDestroy(event) {
        if (event) event.stopPropagation();
        const ent = this.activeMenuEntity;
        if (!ent) return;

        // 切換回一般模式
        this.showContextMenu(ent, false);
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

    static toggleSettingsPanel() {
        const panel = document.getElementById("settings_panel");
        if (!panel) return;

        if (panel.style.display === "none") {
            this.hideContextMenu(); // 先關閉其它選單
            this.renderSettingsPanel();
            panel.style.display = "flex";
            panel.style.flexDirection = "column";
        } else {
            panel.style.display = "none";
        }
    }

    static renderSettingsPanel() {
        const panel = document.getElementById("settings_panel");
        const cfg = UI_CONFIG.SettingsPanel;
        const settings = GameEngine.state.settings;

        let html = `<div class="title" style="text-align:center; font-size: 20px; border-bottom: 2px solid #8b6e4b; margin-bottom: 20px; padding-bottom: 10px;">${cfg.title}</div>`;

        html += `<div style="display:flex; flex-direction:column; gap:16px; padding: 10px;">`;

        // 1. 顯示資源資訊 (名稱、等級、數量)
        html += `
            <div style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;" onclick="window.UIManager.updateSetting(event, 'showResourceInfo', !window.GAME_STATE.settings.showResourceInfo)">
                <span style="font-size: 16px; color: #e0e0e0; font-weight: 600;">地圖資源標籤顯示</span>
                <div class="setting-toggle ${settings.showResourceInfo ? 'active' : ''}" style="width: 54px; height: 26px; background: ${settings.showResourceInfo ? 'var(--aoe-gold)' : '#444'}; border-radius: 13px; position: relative; transition: all 0.3s; box-shadow: inset 0 2px 5px rgba(0,0,0,0.5);">
                    <div style="width: 20px; height: 20px; background: white; border-radius: 50%; position: absolute; top: 3px; ${settings.showResourceInfo ? 'right: 3px' : 'left: 3px'}; transition: all 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.4);"></div>
                </div>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;" onclick="window.UIManager.updateSetting(event, 'showVisionRange', (window.GAME_STATE.settings.showVisionRange + 1) % 3)">
                <span style="font-size: 16px; color: #e0e0e0; font-weight: 600;">單位視界圈顯示</span>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                    <div class="setting-toggle" style="width: 70px; height: 26px; background: ${settings.showVisionRange === 0 ? '#444' : (settings.showVisionRange === 1 ? '#5c85d6' : 'var(--aoe-gold)')}; border-radius: 13px; position: relative; transition: all 0.3s; box-shadow: inset 0 2px 5px rgba(0,0,0,0.5);">
                        <div style="width: 20px; height: 20px; background: white; border-radius: 50%; position: absolute; top: 3px; left: ${settings.showVisionRange === 0 ? '3px' : (settings.showVisionRange === 1 ? '25px' : '47px')}; transition: all 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.4);"></div>
                    </div>
                    <span style="font-size: 11px; color: ${settings.showVisionRange === 0 ? '#aaa' : '#fff'}; font-weight: bold;">
                        ${settings.showVisionRange === 0 ? '關閉' : (settings.showVisionRange === 1 ? '僅選中單位' : '全部單位')}
                    </span>
                </div>
            </div>
        `;

        html += `</div>`;

        // 關閉按鈕
        html += `
            <div style="margin-top: 30px; border-top: 1px solid rgba(139, 110, 75, 0.3); padding-top: 15px;">
                <button class="action-btn" onclick="event.stopPropagation(); window.UIManager.toggleSettingsPanel()" style="width: 100%; height: 44px; flex-direction: row; gap: 10px;">
                    <span class="icon" style="font-size:18px; margin:0;">🔙</span><span class="label" style="font-size:14px;">返回遊戲</span>
                </button>
            </div>
        `;

        panel.innerHTML = html;
    }

    static updateSetting(event, key, val) {
        if (event) event.stopPropagation();
        GameEngine.state.settings[key] = val;
        GameEngine.state.renderVersion++; // 通知渲染器刷新 (處理顯示/隱藏標籤)
        this.renderSettingsPanel(); // 重新渲染以更新 UI 狀態
    }

    static hideSettingsPanel() {
        const settings = document.getElementById("settings_panel");
        if (settings) settings.style.display = "none";
    }

    static hideContextMenu() {
        this.activeMenuEntity = null;
        const menu = document.getElementById("context_menu");
        if (menu) menu.style.display = "none";
        const destroyBtn = document.getElementById("destroy_btn");
        if (destroyBtn) destroyBtn.style.display = "none";

        // 注意：這裡不再自動隱藏 settings_panel，避免 toggle 時發生衝突
    }

    static updateValues(forceUpdate = false) {
        const state = GameEngine.state;
        const res = state.resources;

        // 更新區域：日誌系統 (優化篩選與顏色)
        const lc = document.getElementById("log_content");
        if (lc) {
            const history = state.log;
            const filtered = history.filter(item => this.logFilters[item.category]);

            // 建立內容字串並附帶顏色
            const content = filtered.map(item => {
                const color = item.category === 'PATH' ? '#ffff00' : '#ffffff';
                return `<div style="color: ${color}">> ${item.msg}</div>`;
            }).join("");

            if (lc.innerHTML !== content || forceUpdate) {
                const isAtBottom = lc.scrollHeight - lc.scrollTop - lc.clientHeight < 30;
                lc.innerHTML = content;
                if (isAtBottom) lc.scrollTop = lc.scrollHeight;
            }
        }

        // 更新資源
        const rb = document.getElementById("resource_bar");
        if (rb) {
            const labels = UI_CONFIG.ResourceBar.labels;
            const popCount = GameEngine.getCurrentPopulation();
            const maxPop = GameEngine.getMaxPopulation();

            const stateStr = `${res.gold}|${res.wood}|${res.stone}|${res.food}|${popCount}|${maxPop}`;
            if (this.lastUIState.resources !== stateStr) {
                rb.innerHTML = `
                    <span>${labels.gold} ${res.gold}</span>
                    <span>${labels.wood} ${res.wood}</span>
                    <span>${labels.stone} ${res.stone}</span>
                    <span>${labels.food} ${res.food}</span>
                    <span title="人口上限" style="${popCount >= maxPop ? 'color: #ff5252' : ''}">👥 ${popCount} / ${maxPop}</span>
                `;
                this.lastUIState.resources = stateStr;
            }
        }

        // 更新日誌
        this.updateLogPanel();
    }

    static updateLogPanel() {
        // [TEST] 更新選中單位即時座標與狀態 (若選取多個，僅顯示第一個)
        const debugInfo = document.getElementById("unit_debug_info");
        const selIds = GameEngine.state.selectedUnitIds || [];
        const v = selIds.length > 0 ? GameEngine.state.units.villagers.find(u => u.id === selIds[0]) : null;

        if (v && debugInfo) {
            debugInfo.style.display = "block";
            const target = (v.fullPath && v.fullPath[v.pathIndex]) ?
                `➟ (${v.fullPath[v.pathIndex].x.toFixed(0)}, ${v.fullPath[v.pathIndex].y.toFixed(0)})` : " (待命)";
            debugInfo.innerHTML = `[DEBUG] ${v.configName} (${v.state}): (${v.x.toFixed(0)}, ${v.y.toFixed(0)}) ${target}`;
        } else if (debugInfo) {
            debugInfo.style.display = "none";
        }

        const lp = document.getElementById("log_content");
        if (lp) {
            const history = GameEngine.state.log;

            // 核心修復：執行真正的過濾邏輯
            const filtered = history.filter(entry => {
                const cat = (typeof entry === 'object') ? entry.category : 'COMMON';
                return UIManager.logFilters[cat];
            });

            // 修正：日誌現在是物件格式 { msg, category, id }，按照分類上色
            const content = filtered.map(entry => {
                let text = (typeof entry === 'object') ? entry.msg : entry;
                let colorAttr = '';

                if (typeof entry === 'object') {
                    switch (entry.category) {
                        case 'PATH':
                        case 'STUCK': colorAttr = ' style="color: #ffeb3b;"'; break;
                        case 'STATE': colorAttr = ' style="color: #4fc3f7;"'; break;
                        case 'SYSTEM': colorAttr = ' style="color: #f48fb1;"'; break;
                    }
                }

                return `<div${colorAttr}>> ${text}</div>`;
            }).join("");

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
            // 讀取目前選中城鎮中心自己的隊列
            const tc = this.activeMenuEntity;
            const q = (tc && tc.queue) ? tc.queue.length : 0;
            const timer = (tc && tc.productionTimer !== undefined) ? tc.productionTimer : 0;
            const maxPop = GameEngine.getMaxPopulation();
            const isPopFull = GameEngine.getCurrentPopulation() >= maxPop;

            if (q > 0) {
                badge.style.display = "flex";
                badge.innerText = q;
                const p = (1 - timer / 5) * 100;
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
            const current = GameEngine.state.units.villagers.filter(v =>
                v.config && v.config.type === 'villagers' && v.config.camp === 'player' &&
                v.assignedWarehouseId === (ent.id || `${ent.type}_${ent.x}_${ent.y}`)
            ).length;
            countDisplay.innerText = `${current} / ${ent.targetWorkerCount || 0}`;
            statusHint.innerText = `派遣狀態`;
        }

        // 更新指令高亮狀態
        ['WOOD', 'STONE', 'GOLD', 'FOOD', 'RETURN'].forEach(cmd => {
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

    static updateStickyPositions() {
        if (this.activeMenuEntity) {
            const menu = document.getElementById("context_menu");
            const scene = window.PhaserScene;
            // Phaser 的 scrollX 表示畫面往右移，所以在螢幕空間中：螢幕座標 = 世界座標 - scrollX
            const cam = scene ? { x: scene.cameras.main.scrollX, y: scene.cameras.main.scrollY } : { x: 0, y: 0 };
            const cfg = UI_CONFIG.ActionMenu;

            // 基礎螢幕位置 (虛擬 1920x1080 空間)
            let sx = this.activeMenuEntity.x - cam.x;
            let sy = this.activeMenuEntity.y - cam.y;

            // 取得選單寬高 (由於在縮放內部，這裡得到的 offsetWidth 也是虛擬像素)
            const menuWidth = menu.offsetWidth || cfg.width || 380;
            const menuHeight = menu.offsetHeight || cfg.height || 95;

            // 虛擬畫面的邊界
            const virtualWidth = 1920;
            const virtualHeight = 1080;

            // --- 判斷是智慧定位還是固定錨點 ---
            if (cfg.anchor) {
                // 固定位置不在此更新，由 applyAnchorStyle 處理
            } else {
                // 智慧偏置計算 (相對於物體中心的位移)
                // 選單水平居中於建築下方：X 向左偏 menuWidth/2，Y 向下偏 offsetY
                let finalX = sx - menuWidth / 2 + (cfg.offsetX || 0);
                let finalY = sy + (cfg.offsetY || 100);

                // --- 邊界檢查與反向邏輯 (針對 1920x1080) ---

                // 1. 水平檢查：如果右側超出虛擬邊界，改往左顯示
                if (finalX + menuWidth > virtualWidth - 20) {
                    finalX = sx - menuWidth - (cfg.offsetX || 15);
                }

                // 2. 垂直檢查：如果底部超出虛擬邊界，改往上顯示
                if (finalY + menuHeight > virtualHeight - 20) {
                    finalY = sy - menuHeight - (cfg.offsetY || 100);
                }

                // 3. 全域安全區域確保 (防止跑出 1920x1080 範圍)
                finalX = Math.max(20, Math.min(finalX, virtualWidth - menuWidth - 20));
                finalY = Math.max(20, Math.min(finalY, virtualHeight - menuHeight - 20));

                menu.style.left = `${finalX}px`;
                menu.style.top = `${finalY}px`;
            }

            // 更新銷毀按鈕位置 (右上角)
            const dBtn = document.getElementById("destroy_btn");
            if (dBtn && dBtn.style.display !== 'none') {
                const bCfg = GameEngine.getEntityConfig(this.activeMenuEntity.type);
                let uw = 1, uh = 1;
                if (bCfg && bCfg.size) {
                    const match = bCfg.size.match(/\{[ ]*([\d.]+)[ ]*,[ ]*([\d.]+)[ ]*\}/);
                    if (match) { uw = parseFloat(match[1]); uh = parseFloat(match[2]); }
                }
                const halfW = (uw * GameEngine.TILE_SIZE) / 2;
                const halfH = (uh * GameEngine.TILE_SIZE) / 2;

                // sx, sy 是建築中心，讓按鈕完全待在內部邊緣
                dBtn.style.left = `${sx + halfW - 20}px`;
                dBtn.style.top = `${sy - halfH + 2}px`;
            }
        }
    }
    /**
     * 相機快速回歸村莊中心
     */
    static panToTownCenter() {
        // 同時檢查 village 與 town_center
        const tc = GameEngine.state.mapEntities.find(e => e.type === 'town_center' || e.type === 'village');
        if (!tc || !window.PhaserScene) return;

        const cam = window.PhaserScene.cameras.main;
        const cfg = UI_CONFIG.TownCenterPointer;

        const centerX = cam.scrollX + cam.width / 2;
        const centerY = cam.scrollY + cam.height / 2;
        const dist = Math.hypot(tc.x - centerX, tc.y - centerY);

        // 動態調整 pan 時間：距離越大，時間稍長但速度加快 (以免過卡)
        // 限制在 400ms ~ 1500ms 之間
        const duration = Math.min(1500, Math.max(400, dist / 4));

        cam.pan(tc.x, tc.y, duration, 'Cubic.easeInOut');
        GameEngine.addLog(`相機移動至城鎮中心 (距離: ${Math.round(dist)}px)`);
    }
}

window.GameEngine = GameEngine;
window.UIManager = UIManager;
