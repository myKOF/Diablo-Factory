import { UI_CONFIG } from "./ui_config.js";
import { GameEngine } from "../systems/game_systems.js";
import { SynthesisSystem } from "../systems/SynthesisSystem.js";
import { conveyorSystem } from "../systems/ConveyorSystem.js";


/**
 * UI 管理器
 * 負責渲染介面並處理動態建築清單
 */
export class UIManager {
    static uiLayer;
    static dragGhost = null;
    static logisticsSourceEntity = null; static logisticsSourceLine = null; static activeLogisticsConnection = null; static activeLogisticsLine = null;
    static isLogisticsDragging = false;
    static potentialLogisticsDrag = null;
    static activeWarehouseEntity = null;
    static activeBuilding = null;
    static uiPositions = {};

    static loadUIPositions() {
        // 重置為空，不再從 localStorage 讀取，實現重啟遊戲歸位
        this.uiPositions = {};
    }

    static saveUIPositions() {
        // 僅保留在內存中，不寫入 localStorage
    }

    /**
     * 使元素可拖曳，並記錄位置
     */
    static makeDraggable(el, id) {
        if (!el || !id) return;
        
        let isDragging = false;
        let startVX, startVY;
        let startEX, startEY;

        const handleMouseDown = (e) => {
            if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.closest('.no-drag')) {
                return;
            }
            // 日誌面板頂部區域用於縮放，不啟動拖曳
            if (id === "log_panel" && (e.clientY <= el.getBoundingClientRect().top + 15)) return;

            e.stopPropagation();
            isDragging = true;
            
            // 1. 獲取初始虛擬鼠標位置
            const localStart = this.getLocalMouse(e);
            startVX = localStart.x;
            startVY = localStart.y;

            // 2. 獲取元素當前的虛擬左上角座標 (考慮到容器縮放與 transform 偏移)
            const rect = el.getBoundingClientRect();
            const localEl = this.getLocalMouse({ clientX: rect.left, clientY: rect.top });
            startEX = localEl.x;
            startEY = localEl.y;

            el.style.cursor = "grabbing";
            el.style.transition = "none"; // 拖動時關閉動畫
            
            const onMouseMove = (moveE) => {
                if (!isDragging) return;
                
                const localMove = this.getLocalMouse(moveE);
                const dx = localMove.x - startVX;
                const dy = localMove.y - startVY;

                // 3. 套用新的虛擬像素位置 (加入邊界限制：至少保留 50px 在 1920x1080 範圍內)
                const margin = 50;
                const virtualWidth = 1920;
                const virtualHeight = 1080;
                
                // 計算原始目標位置
                let targetX = startEX + dx;
                let targetY = startEY + dy;

                // 限制範圍：
                // 左邊界：X 最小為 -(寬度 - margin)
                // 右邊界：X 最大為 (畫布寬 - margin)
                // 上邊界：Y 最小為 -(高度 - margin)
                // 下邊界：Y 最大為 (畫布高 - margin)
                const elW = el.offsetWidth;
                const elH = el.offsetHeight;

                const finalX = Math.max(-elW + margin, Math.min(virtualWidth - margin, targetX));
                const finalY = Math.max(-elH + margin, Math.min(virtualHeight - margin, targetY));

                el.style.left = `${finalX}px`;
                el.style.top = `${finalY}px`;
                
                // 4. 清除可能干擾絕對定位的屬性
                el.style.right = "auto";
                el.style.bottom = "auto";
                el.style.transform = "none";
                el.style.margin = "0";
            };

            const onMouseUp = () => {
                if (!isDragging) return;
                isDragging = false;
                el.style.cursor = "default";
                el.style.transition = "";
                
                // 確保 ID 存在才紀錄 (優先使用動態綁定的 dragId)
                const saveId = el.dataset.dragId || id;
                if (saveId) {
                    this.uiPositions[saveId] = { left: el.style.left, top: el.style.top };
                    this.saveUIPositions();
                }
                
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
            };
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
        };
        el.addEventListener("mousedown", handleMouseDown);
    }
    static logHeight = 200; // 預設日誌高度
    static isResizingLog = false;
    static logFilters = { COMMON: false, PATH: false, INPUT: false, BATTLE: false, SYSTEM: false, TASK: false, GATHER: false, LOGISTICS: true }; // 日誌篩選器
    static startY = 0;
    static startHeight = 200;
    static leftMouseDownPos = null; // 記錄左鍵按下位置，用於過濾框選後的誤觸
    static lastUIState = {
        resources: "",
        logHash: "",
        queueInfo: ""
    };

    static ingredientIconMap = {
        fruit: "🍎",
        wolf_meat: "🥩",
        bear_meat: "🍗",
        wheat: "🌾",
        rice: "🍚",
        wood: "🪵",
        stone: "🪨",
        crystal_ore: "💎",
        coal_ore: "⚫",
        copper_ore: "🟫",
        iron_ore: "🔩",
        silver_ore: "⚪",
        gold_ore: "🟡",
        mithril_ore: "💠",
        wolf_pelts: "🐺",
        bear_pelts: "🐻",
        food: "🍖",
        leather: "🟤",
        wooden_planks: "🪵",
        slate_slabs: "🧱",
        glass: "🥛",
        crystal_ball: "🔮",
        coal: "⚫",
        copper_ingots: "🟧",
        copper_plates: "🛡️",
        iron_ingots: "⬛",
        iron_plates: "⛓️",
        steel: "🔗",
        silver_ingots: "🥈",
        gold_ingots: "🥇",
        mithril_ingots: "🎖️",
        gold: "💰"
    };

    static getIngredientIcon(typeOrIcon) {
        if (!typeOrIcon) return "📦";
        const key = String(typeOrIcon).trim().toLowerCase();
        return this.ingredientIconMap[key] || "📦";
    }

    static getBuildingStockpileInfo(entity, cfg) {
        if (!entity) return null;
        const outputBuffer = entity.outputBuffer || {};
        const outputKeys = Object.keys(outputBuffer).filter(k => (outputBuffer[k] || 0) > 0);
        if (outputKeys.length > 0) {
            const type = outputKeys[0];
            return { type, amount: outputBuffer[type] || 0, max: null };
        }

        const produce = (cfg && cfg.produce_resource) || {};
        let type = Object.keys(produce)[0] || null;
        if (!type) {
            if (entity.type1 === 'timber_factory' || entity.type1 === 'tree_plantation') type = 'wood';
            else if (entity.type1 === 'stone_factory') type = 'stone';
            else if (entity.type1 === 'barn' || entity.type1 === 'farmland') type = 'food';
            else if (entity.type1 === 'gold_mining_factory') type = 'gold_ore';
        }

        if (!type) return null;
        return { type, amount: outputBuffer[type] || 0, max: null };
    }

    static getFactoryOutputStockpileInfo(entity) {
        if (!entity) return null;
        const outputBuffer = entity.outputBuffer || {};
        const recipeType = entity.currentRecipe ? entity.currentRecipe.type : null;
        if (recipeType) {
            return { type: recipeType, amount: outputBuffer[recipeType] || 0 };
        }
        const outputKeys = Object.keys(outputBuffer).filter(k => (outputBuffer[k] || 0) > 0);
        if (outputKeys.length === 0) return null;
        const type = outputKeys[0];
        return { type, amount: outputBuffer[type] || 0 };
    }

    static getIngredientProductionTime(type, fallback = 5) {
        if (!type) return fallback;
        const state = GameEngine.state;
        const key = String(type).trim().toLowerCase();
        const cfg = state.ingredientConfigs
            ? (state.ingredientConfigs[key] || state.ingredientConfigs[type])
            : null;
        const rawTime = cfg ? (cfg.production_times ?? cfg.craftTime) : null;
        const seconds = parseFloat(rawTime);
        return Number.isFinite(seconds) && seconds > 0 ? seconds : fallback;
    }

    static formatProductionCountdown(entity) {
        if (!entity || !entity.currentRecipe) return "待機中";
        const totalSeconds = this.getIngredientProductionTime(entity.currentRecipe.type, 5);
        const progress = Math.max(0, Math.min(1, entity.craftingProgress || 0));
        const remainingSeconds = Math.max(0, (1 - progress) * totalSeconds);
        return `${remainingSeconds.toFixed(1)} 秒`;
    }

    static init() {
        this.uiLayer = document.getElementById("ui_layer");
        if (!this.uiLayer) return;

        // [核心修正] 將 UIManager 暴露至全域，確保 HTML 字串中的 onclick 能正確呼叫方法
        window.UIManager = this;

        this.loadUIPositions();
        this.renderAll();

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
            if (e.key === "Escape") {
                if (this.cancelActiveConstructionPreview()) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                this.cancelBuildingMode();
            }
            if (e.key === "Delete") {
                if (this.isTextInputEvent(e)) return;
                if (this.deleteSelectedLogisticsLine()) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
            if (this.isPlacementRotateKeyEvent(e)) {
                if (this.isTextInputEvent(e)) return;
                if (this.rotatePlacementPreview(e)) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
            }
            if (e.key === "Tab") {
                if (this.isLogisticsDragging && conveyorSystem.toggleBendMode()) {
                    e.preventDefault();
                    e.stopPropagation();
                    GameEngine.addLog(`[物流] 已切換物流線虛影方向。`, "LOGISTICS");
                    return;
                }
                const state = GameEngine.state;
                if (state.placingType && (state.buildingMode === "DRAG" || state.buildingMode === "LINE" || state.buildingMode === "STAMP")) {
                    e.preventDefault(); 

                    if (state.buildingSpacing === undefined) state.buildingSpacing = 1;
                    state.buildingSpacing++;
                    if (state.buildingSpacing > 5) state.buildingSpacing = 0;

                    if (state.buildingMode === "LINE" && state.lineStartPos && state.previewPos) {
                        state.linePreviewEntities = GameEngine.getLinePositions(
                            state.placingType,
                            state.lineStartPos.x,
                            state.lineStartPos.y,
                            state.previewPos.x,
                            state.previewPos.y
                        );
                    }

                    GameEngine.addLog(`建築間距已切換為：${state.buildingSpacing} 格`, "SYSTEM");
                }
            }
        });
        window.addEventListener("contextmenu", (e) => {
            e.preventDefault();
        });

        setInterval(() => this.updateValues(), 500);

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

    static isTextInputEvent(e) {
        const tagName = e.target?.tagName ? e.target.tagName.toLowerCase() : "";
        return tagName === "input" || tagName === "textarea" || tagName === "select" || e.target?.isContentEditable;
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
        buildingPanel.id = "building_panel";
        this.applyAnchorStyle(buildingPanel, bpCfg);
        buildingPanel.style.pointerEvents = "auto";
        this.makeDraggable(buildingPanel, "building_panel");

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
            flex: 1; width: 100%; overflow-y: auto; overflow-x: hidden;
            pointer-events: auto; padding: 0; box-sizing: border-box;
            white-space: normal; overflow-wrap: anywhere; word-break: break-word;
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
            position: absolute; bottom: 30px; right: 0; min-width: 140px; white-space: nowrap;
            background: ${this.hexToRgba(logCfg.bgColor, 0.95)}; border: 1.5px solid ${logCfg.borderColor};
            border-radius: 4px; padding: 10px; display: none; flex-direction: column; gap: 8px;
            z-index: 400; box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        `;

        const categories = { COMMON: "一般訊息", PATH: "尋路訊息", INPUT: "右鍵行為訊息", BATTLE: "戰鬥訊息", SYSTEM: "系統訊息", TASK: "任務訊息", GATHER: "採集訊息", LOGISTICS: "物流訊息" };

        // --- [新增] 全選/取消全選功能 ---
        const masterItem = document.createElement("label");
        masterItem.style.cssText = `display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ffeb3b; cursor: pointer; border-bottom: 1.5px solid rgba(255,255,255,0.15); padding-bottom: 6px; margin-bottom: 4px; font-weight: bold;`;
        const masterCheckbox = document.createElement("input");
        masterCheckbox.type = "checkbox";
        masterCheckbox.checked = Object.values(this.logFilters).every(v => v);
        masterCheckbox.onchange = (e) => {
            e.stopPropagation();
            const checked = masterCheckbox.checked;
            Object.keys(this.logFilters).forEach(k => {
                this.logFilters[k] = checked;
            });
            // 更新下方所有 checkbox 的視覺狀態
            filterMenu.querySelectorAll('input.category-check').forEach(cb => cb.checked = checked);
            this.updateValues(true);
        };
        masterItem.appendChild(masterCheckbox);
        masterItem.appendChild(document.createTextNode("全選 / 取消全選"));
        filterMenu.appendChild(masterItem);

        Object.entries(categories).forEach(([key, label]) => {
            const item = document.createElement("label");
            item.style.cssText = `display: flex; align-items: center; gap: 8px; font-size: 13px; color: #fff; cursor: pointer;`;
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "category-check"; // 加入類名便於批次控制
            checkbox.checked = this.logFilters[key];
            checkbox.onchange = (e) => {
                e.stopPropagation();
                this.logFilters[key] = checkbox.checked;
                // 更新 master checkbox 狀態
                masterCheckbox.checked = Object.values(this.logFilters).every(v => v);
                this.updateValues(true);
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
        this.makeDraggable(logPanel, "log_panel");

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
        this.makeDraggable(setPanel, "settings_panel");

        // 5.5 倉庫按鈕與面板
        const warehouseBtnCfg = UI_CONFIG.WarehouseButton;
        if (warehouseBtnCfg) {
            const warehouseBtn = document.createElement("div");
            warehouseBtn.id = "warehouse_btn";
            warehouseBtn.className = "panel glass-panel";
            this.applyAnchorStyle(warehouseBtn, warehouseBtnCfg);
            warehouseBtn.style.textAlign = "center";
            warehouseBtn.style.lineHeight = `${warehouseBtnCfg.height}px`;
            warehouseBtn.style.fontSize = warehouseBtnCfg.fontSize;
            warehouseBtn.style.background = this.hexToRgba(warehouseBtnCfg.bgColor, warehouseBtnCfg.bgAlpha);
            warehouseBtn.style.cursor = "pointer";
            warehouseBtn.style.pointerEvents = "auto";
            warehouseBtn.style.display = "flex";
            warehouseBtn.style.alignItems = "center";
            warehouseBtn.style.justifyContent = "center";
            warehouseBtn.innerHTML = warehouseBtnCfg.icon || "📦";
            warehouseBtn.onclick = (e) => {
                e.stopPropagation();
                this.toggleWarehousePanel(this.activeWarehouseEntity);
            };
            this.uiLayer.appendChild(warehouseBtn);
        }

        const warehousePanelCfg = UI_CONFIG.WarehousePanel;
        if (warehousePanelCfg) {
            const warehousePanel = document.createElement("div");
            warehousePanel.id = "warehouse_panel";
            warehousePanel.className = "panel glass-panel";
            warehousePanel.style.display = "none";
            warehousePanel.style.zIndex = "1001";
            warehousePanel.style.pointerEvents = "auto";
            this.applyAnchorStyle(warehousePanel, warehousePanelCfg);
            this.uiLayer.appendChild(warehousePanel);
            this.makeDraggable(warehousePanel, "warehouse_panel");
        }


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
            <div id="tc_distance" style="position: absolute; bottom: 4px; font-size: ${tcPtrCfg.distanceFontSize || "12px"}; color: ${tcPtrCfg.distanceColor || "#fff"}; font-weight: bold; background: rgba(0,0,0,0.4); padding: 0 4px; border-radius: 4px;">--m</div>
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
        menu.style.cssText = `position: absolute; display: none; z-index: 1000; pointer-events: auto; overflow: hidden;`;
        if (menuCfg.anchor) this.applyAnchorStyle(menu, menuCfg);
        this.uiLayer.appendChild(menu);
        this.makeDraggable(menu, "context_menu");

        // 9. 獨立的銷毀按鈕 (跟隨建築物右上角)
        const destroyBtn = document.createElement("div");
        destroyBtn.id = "destroy_btn";
        destroyBtn.innerHTML = "×";
        destroyBtn.title = "銷毀建築";
        destroyBtn.style.cssText = `
            position: absolute; display: none; width: 18px; height: 18px;
            background: rgba(244, 67, 54, 0.9); color: white; border: 1px solid #fff;
            border-radius: 3px; align-items: center; justify-content: center;
            cursor: pointer; font-size: 14px; font-weight: bold; z-index: 5;
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

        // 10. 物流取消框 (拉線時顯示於起點上方)
        const logCancel = document.createElement("div");
        logCancel.id = "logistics_cancel_zone";
        logCancel.innerHTML = "×";
        logCancel.style.cssText = `
            position: absolute; display: none; width: 24px; height: 24px;
            background: rgba(244, 67, 54, 0.9); color: white; border: 1.5px solid #fff;
            border-radius: 4px; align-items: center; justify-content: center;
            cursor: pointer; font-size: 16px; font-weight: bold; z-index: 2000;
            pointer-events: none; box-shadow: 0 0 10px rgba(244,67,54,0.5);
            transition: transform 0.1s;
        `;
        this.uiLayer.appendChild(logCancel);
    }

    /**
     * 套用錨點對齊樣式
     */
        static applyAnchorStyle(el, cfg, customId = null) {
        if (!el || !cfg) return;

        el.style.position = "absolute";

        // [新增] 優先套用保存的位置 (只要有 ID 且有記錄就套用)
        const lookupId = customId || el.dataset.dragId || el.id;
        if (lookupId && this.uiPositions && this.uiPositions[lookupId]) {
            const saved = this.uiPositions[lookupId];
            el.style.left = saved.left;
            el.style.top = saved.top;
            el.style.right = "auto";
            el.style.bottom = "auto";
            el.style.transform = "none";
            el.style.margin = "0";
        } else if (cfg.anchor) {
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
            case "LEFT_CENTER":
                el.style.left = `${offX}px`;
                el.style.top = "50%";
                el.style.transform = `translateY(-50%)`;
                if (offY) el.style.marginTop = `${offY}px`;
                break;
            case "RIGHT_CENTER":
                el.style.right = `${offX}px`;
                el.style.top = "50%";
                el.style.transform = `translateY(-50%)`;
                if (offY) el.style.marginTop = `${offY}px`;
                break;
            }
        }

        // 尺寸設定 (支援寬高及最小/最大值)
        const dimensions = ["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight"];
        dimensions.forEach(dim => {
            if (cfg[dim] !== undefined) {
                el.style[dim] = typeof cfg[dim] === "number" ? `${cfg[dim]}px` : cfg[dim];
            }
        });

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
            tree_plantation: "🌳", mage_place: "🧙", swordsman_place: "⚔️", archer_place: "🏹",
            timber_processing_plant: "🪵", smelting_plant: "🔥", tank_workshop: "🚜", stone_processing_plant: "🪨",
            storehouse: "📦"
        };

        // 改為從 bp.list 讀取，確保順序與顯示內容正確
        bp.list.forEach(listItem => {
            const cfg = configs[listItem.id];
            if (!cfg) return;

            const currentCount = GameEngine.state.mapEntities.filter(e => e.type1 === cfg.model).length;

            const costStr = [];
            for (let r in cfg.costs) {
                if (cfg.costs[r] > 0) {
                    costStr.push(`${this.getIngredientIcon(r)}${cfg.costs[r]}`);
                }
            }

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
            width: ${bp.itemWidth || 240}px;
            height: ${bp.itemHeight || 80}px; 
            border: 1.5px solid rgba(255, 255, 255, 0.08);
            margin: 4px 0; 
            padding: 0 12px; 
            background: rgba(45, 45, 45, 0.6);
            color: ${bp.textColor}; 
            cursor: pointer; 
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            flex-direction: column;
            justify-content: center;
            overflow: visible;
            box-sizing: border-box;
            border-radius: 4px;
        `;

        // 內部文字容器 (採用絕對定位確保對齊)
        const content = document.createElement("div");
        content.style.cssText = `
            position: absolute;
            left: 12px;
            top: 5px;
            bottom: 5px;
            right: 60px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            pointer-events: none;
        `;

        content.innerHTML = `
            <div style="color: ${bp.titleColor}; font-size: ${bp.fontSize}; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left;">${item.name}</div>
            <div style="color: ${this.hexToRgba(bp.descColor, bp.descAlpha)}; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left;">${item.desc}</div>
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
        GameEngine.state.placingRotation = 0;
    }

    static startStampMode(type) {
        this.cancelBuildingMode();
        GameEngine.state.buildingMode = 'STAMP';
        GameEngine.state.placingType = type;
        GameEngine.state.placingRotation = 0;
        this.activeBuilding = type;
        GameEngine.addLog(`進入建造模式：${GameEngine.state.buildingConfigs[type].name} (ESC 取消)`);
    }

    static cancelBuildingMode() {
        if (!GameEngine.state.placingType) return;
        GameEngine.state.buildingMode = 'NONE';
        GameEngine.state.placingType = null;
        GameEngine.state.placingRotation = 0;
        GameEngine.state.previewPos = null; // 核心修復：清除上一次的預覽位置，防止跳躍
        this.activeBuilding = null;
        GameEngine.state.linePreviewEntities = [];
        if (this.dragGhost) {
            document.body.removeChild(this.dragGhost);
            this.dragGhost = null;
        }
    }

    static getWorldMousePos(clientX, clientY) {
        const world = this.getWorldPoint(clientX, clientY);
        const TS = GameEngine.TILE_SIZE;
        const cfg = GameEngine.state.buildingConfigs[this.activeBuilding];

        let uw = 1, uh = 1;
        if (cfg && cfg.size) {
            const match = cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
            if (match) { uw = parseInt(match[1]); uh = parseInt(match[2]); }
        }

        let gx, gy;
        if (uw % 2 !== 0) {
            gx = Math.floor(world.x / TS) + 0.5;
        } else {
            gx = Math.round(world.x / TS);
        }

        if (uh % 2 !== 0) {
            gy = Math.floor(world.y / TS) + 0.5;
        } else {
            gy = Math.round(world.y / TS);
        }

        return {
            x: gx * TS,
            y: gy * TS
        };
    }

    static getWorldPoint(clientX, clientY) {
        const local = this.getLocalMouse({ clientX, clientY });
        const scene = window.PhaserScene;
        if (!scene || !scene.cameras || !scene.cameras.main) {
            return { x: local.x, y: local.y };
        }
        if (typeof scene.screenToWorldPoint === "function") {
            return scene.screenToWorldPoint(local.x, local.y);
        }
        const cam = scene.cameras.main;
        const zoom = cam.zoom || 1;
        return {
            x: cam.scrollX + local.x / zoom,
            y: cam.scrollY + local.y / zoom
        };
    }

    static getEntityId(ent) {
        return ent && (ent.id || `${ent.type1}_${ent.x}_${ent.y}`);
    }

    static getEntityFootprint(ent) {
        const TS = GameEngine.TILE_SIZE;
        const fp = GameEngine.getFootprint(ent.type1);
        return {
            uw: fp && fp.uw ? fp.uw : 1,
            uh: fp && fp.uh ? fp.uh : 1,
            w: (fp && fp.uw ? fp.uw : 1) * TS,
            h: (fp && fp.uh ? fp.uh : 1) * TS
        };
    }

    static isPointInsideEntity(ent, worldX, worldY) {
        if (!ent) return false;
        const fp = this.getEntityFootprint(ent);
        return worldX > ent.x - fp.w / 2 && worldX < ent.x + fp.w / 2 &&
            worldY > ent.y - fp.h / 2 && worldY < ent.y + fp.h / 2;
    }

    static getDirectionVector(dir) {
        if (dir === 'up') return { x: 0, y: -1 };
        if (dir === 'down') return { x: 0, y: 1 };
        if (dir === 'left') return { x: -1, y: 0 };
        return { x: 1, y: 0 };
    }

    static getOppositeDirection(dir) {
        if (dir === 'up') return 'down';
        if (dir === 'down') return 'up';
        if (dir === 'left') return 'right';
        return 'left';
    }

    static getBuildingPortSlots(ent) {
        if (!ent) return [];
        const TS = GameEngine.TILE_SIZE;
        const cfg = GameEngine.getEntityConfig(ent.type1) || {};
        const fp = this.getEntityFootprint(ent);
        const halfW = fp.w / 2;
        const halfH = fp.h / 2;
        const defs = Array.isArray(cfg.ports) ? cfg.ports : (Array.isArray(cfg.port) ? cfg.port : []);
        const slots = [];

        const makeSlot = (dir, width, defIndex, slotIndex, start, end) => {
            let x = ent.x;
            let y = ent.y;
            if (dir === 'up' || dir === 'down') {
                const centerAlong = (start + end) / 2;
                x = ent.x - halfW + centerAlong * TS;
                y = dir === 'up' ? (ent.y - halfH) : (ent.y + halfH);
            } else {
                const centerAlong = (start + end) / 2;
                y = ent.y - halfH + centerAlong * TS;
                x = dir === 'left' ? (ent.x - halfW) : (ent.x + halfW);
            }
            return { dir, width: Math.max(1, width), defIndex, slotIndex, x, y };
        };

        const rotateDir = (dir, steps) => {
            const dirs = ['up', 'right', 'down', 'left'];
            const index = dirs.indexOf(dir);
            if (index === -1) return dir;
            return dirs[(index + steps) % 4];
        };
        const rotateSlot = (slot) => {
            const steps = ((Number(ent.rotationSteps) || 0) % 4 + 4) % 4;
            if (steps === 0) return slot;
            const relX = slot.x - ent.x;
            const relY = slot.y - ent.y;
            let x = relX;
            let y = relY;
            for (let i = 0; i < steps; i++) {
                const nextX = -y;
                const nextY = x;
                x = nextX;
                y = nextY;
            }
            return {
                ...slot,
                dir: rotateDir(slot.dir, steps),
                x: ent.x + x,
                y: ent.y + y
            };
        };

        if (defs.length > 0) {
            defs.forEach((p, defIndex) => {
                const dir = String(p.align || '').toLowerCase();
                if (!['up', 'down', 'left', 'right'].includes(dir)) return;
                const width = Math.max(1, Number(p.width) || 1);
                const count = Math.max(1, Number(p.count) || 1);
                const gap = Math.max(0, Number(p.gap) || 0);
                const axisLen = (dir === 'up' || dir === 'down') ? fp.uw : fp.uh;
                const totalSpan = count * width + (count - 1) * gap;
                const axisStart = (axisLen - totalSpan) / 2;
                for (let i = 0; i < count; i++) {
                    const segStart = axisStart + i * (width + gap);
                    const segEnd = segStart + width;
                    slots.push(rotateSlot(makeSlot(dir, width, defIndex, i, segStart, segEnd)));
                }
            });
        }

        if (slots.length === 0) {
            // 沒有配置 port 時，提供四側中央的預設端口，避免物流中斷。
            slots.push(rotateSlot({ dir: 'up', width: 1, defIndex: -1, slotIndex: 0, x: ent.x, y: ent.y - halfH }));
            slots.push(rotateSlot({ dir: 'down', width: 1, defIndex: -1, slotIndex: 0, x: ent.x, y: ent.y + halfH }));
            slots.push(rotateSlot({ dir: 'left', width: 1, defIndex: -1, slotIndex: 0, x: ent.x - halfW, y: ent.y }));
            slots.push(rotateSlot({ dir: 'right', width: 1, defIndex: -1, slotIndex: 0, x: ent.x + halfW, y: ent.y }));
        }
        return slots;
    }

    static getNearestPortSlot(ent, worldX, worldY, preferredDir = null) {
        const slots = this.getBuildingPortSlots(ent);
        if (!slots.length) return null;
        let best = null;
        let bestScore = Infinity;
        for (const slot of slots) {
            const dist = Math.hypot(slot.x - worldX, slot.y - worldY);
            const dirPenalty = preferredDir && slot.dir !== preferredDir ? GameEngine.TILE_SIZE * 1.2 : 0;
            const score = dist + dirPenalty;
            if (score < bestScore) {
                bestScore = score;
                best = slot;
            }
        }
        return best;
    }

    static resolveCurrentPortSlot(ent, port, fallbackX = null, fallbackY = null) {
        if (!ent || !port) return port || null;
        const slots = this.getBuildingPortSlots(ent);
        if (!slots.length) return port;

        const matched = slots.find(slot =>
            slot.defIndex === port.defIndex &&
            slot.slotIndex === port.slotIndex
        );
        if (matched) return matched;

        const refX = Number.isFinite(fallbackX) ? fallbackX : (Number.isFinite(port.x) ? port.x : ent.x);
        const refY = Number.isFinite(fallbackY) ? fallbackY : (Number.isFinite(port.y) ? port.y : ent.y);
        return this.getNearestPortSlot(ent, refX, refY) || port;
    }

    static buildOrthogonalRoute(startPoint, endPoint, startDir = null, endDir = null, biasPoint = null) {
        const TS = GameEngine.TILE_SIZE;
        const margin = TS * 0.7;
        const pts = [];
        const pushPoint = (x, y) => {
            const px = Math.round(x);
            const py = Math.round(y);
            const last = pts[pts.length - 1];
            if (!last || last.x !== px || last.y !== py) {
                pts.push({ x: px, y: py });
            }
        };

        const startVec = startDir ? this.getDirectionVector(startDir) : null;
        const endVec = endDir ? this.getDirectionVector(endDir) : null;

        const s0 = { x: startPoint.x, y: startPoint.y };
        const s1 = startVec ? { x: s0.x + startVec.x * margin, y: s0.y + startVec.y * margin } : { ...s0 };
        const e0 = { x: endPoint.x, y: endPoint.y };
        const e1 = endVec ? { x: e0.x + endVec.x * margin, y: e0.y + endVec.y * margin } : { ...e0 };

        pushPoint(s0.x, s0.y);
        pushPoint(s1.x, s1.y);

        const dx = e1.x - s1.x;
        const dy = e1.y - s1.y;
        if (Math.abs(dx) < 1 || Math.abs(dy) < 1) {
            pushPoint(e1.x, e1.y);
        } else {
            const bendA = { x: e1.x, y: s1.y }; // 先水平後垂直
            const bendB = { x: s1.x, y: e1.y }; // 先垂直後水平
            let chooseA = Math.abs(dx) >= Math.abs(dy);
            if (biasPoint) {
                const aScore = Math.hypot(bendA.x - biasPoint.x, bendA.y - biasPoint.y);
                const bScore = Math.hypot(bendB.x - biasPoint.x, bendB.y - biasPoint.y);
                chooseA = aScore <= bScore;
            }
            const bend = chooseA ? bendA : bendB;
            pushPoint(bend.x, bend.y);
            pushPoint(e1.x, e1.y);
        }

        pushPoint(e0.x, e0.y);
        return pts;
    }

    static getLogisticsTargetBuildingAt(worldX, worldY, sourceEnt = null) {
        return GameEngine.state.mapEntities.find(ent => {
            if (ent.isUnderConstruction) return false;
            if (sourceEnt && ent === sourceEnt) return false;
            const cfg = GameEngine.getEntityConfig(ent.type1);
            if (!cfg || !cfg.logistics || !cfg.logistics.canInput) return false;
            if (this.isPointInsideEntity(ent, worldX, worldY)) return true;

            const portHitRadius = GameEngine.TILE_SIZE * 0.8;
            return this.getBuildingPortSlots(ent).some(port =>
                Math.hypot(port.x - worldX, port.y - worldY) <= portHitRadius
            );
        }) || null;
    }

    static getConnectionRoute(sourceEnt, targetEnt, conn = null) {
        if (!sourceEnt || !targetEnt) return null;
        if (conn && Array.isArray(conn.routePoints) && conn.routePoints.length >= 2) {
            return {
                points: conn.routePoints.map(p => ({ x: p.x, y: p.y })),
                width: Math.max(1, Number(conn.routeWidth) || 1)
            };
        }
        const sourcePort = this.getNearestPortSlot(sourceEnt, targetEnt.x, targetEnt.y);
        const preferredDir = sourcePort ? this.getOppositeDirection(sourcePort.dir) : null;
        const targetPort = this.getNearestPortSlot(targetEnt, sourceEnt.x, sourceEnt.y, preferredDir);
        if (!sourcePort || !targetPort) return null;
        return {
            points: this.buildGridRoutePoints(this.buildOrthogonalRoute(
                { x: sourcePort.x, y: sourcePort.y },
                { x: targetPort.x, y: targetPort.y },
                sourcePort.dir,
                targetPort.dir,
                { x: (sourceEnt.x + targetEnt.x) / 2, y: (sourceEnt.y + targetEnt.y) / 2 }
            )),
            width: Math.max(1, Math.min(sourcePort.width || 1, targetPort.width || 1))
        };
    }

    static ensureLogisticsLineStore() {
        const state = GameEngine.state;
        if (!Array.isArray(state.logisticsLines)) state.logisticsLines = [];
        return state.logisticsLines;
    }

    static snapPointToGridCenter(point) {
        const TS = GameEngine.TILE_SIZE;
        const align = TS / 2;
        return {
            x: Math.round(point.x / align) * align,
            y: Math.round(point.y / align) * align
        };
    }

    static makeLogisticsLineId(sourceId, targetId = null, targetPoint = null) {
        const targetKey = targetId || `${Math.round(targetPoint?.x || 0)}_${Math.round(targetPoint?.y || 0)}`;
        return `logistics_${sourceId}_${targetKey}_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000).toString(36)}`;
    }

    static getLogisticsSegmentOccupyKey(line) {
        if (!line) return null;
        const TS = GameEngine.TILE_SIZE;
        const align = TS / 2;
        const gx = line.gridX !== undefined ? line.gridX : Math.round(line.x / align);
        const gy = line.gridY !== undefined ? line.gridY : Math.round(line.y / align);
        return `${gx},${gy}`;
    }

    static buildGridRoutePoints(points) {
        if (!Array.isArray(points) || points.length < 2) return [];
        const TS = GameEngine.TILE_SIZE;
        const align = TS / 2;
        const snapped = points.map(p => this.snapPointToGridCenter(p));
        const route = [];
        const push = (p) => {
            const last = route[route.length - 1];
            if (!last || last.x !== p.x || last.y !== p.y) route.push({ x: p.x, y: p.y });
        };

        push(snapped[0]);
        for (let i = 1; i < snapped.length; i++) {
            const last = route[route.length - 1];
            const next = snapped[i];
            if (!last || (last.x === next.x && last.y === next.y)) continue;
            if (last.x !== next.x && last.y !== next.y) {
                push({ x: next.x, y: last.y });
            }
            push(next);
        }

        const expanded = [];
        const pushExpanded = (p) => {
            const last = expanded[expanded.length - 1];
            if (!last || last.x !== p.x || last.y !== p.y) expanded.push({ x: p.x, y: p.y });
        };
        pushExpanded(route[0]);
        for (let i = 1; i < route.length; i++) {
            const a = expanded[expanded.length - 1];
            const b = route[i];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const steps = Math.max(Math.abs(dx), Math.abs(dy)) / align;
            const sx = Math.sign(dx) * align;
            const sy = Math.sign(dy) * align;
            for (let step = 1; step <= steps; step++) {
                pushExpanded({ x: a.x + sx * step, y: a.y + sy * step });
            }
        }
        return expanded;
    }

    static buildLogisticsSegments(groupId, sourceId, targetId, targetPoint, gridPoints, routeWidth, sourcePort, targetPort, filter) {
        if (!Array.isArray(gridPoints) || gridPoints.length < 2) return [];
        const TS = GameEngine.TILE_SIZE;
        const align = TS / 2;
        const segments = [];
        for (let i = 0; i < gridPoints.length - 1; i += 2) {
            const start = gridPoints[i];
            const next = gridPoints[Math.min(i + 1, gridPoints.length - 1)];
            const targetEnd = gridPoints[Math.min(i + 2, gridPoints.length - 1)];
            const dx = targetEnd.x - start.x;
            const dy = targetEnd.y - start.y;
            let end = targetEnd;
            if (Math.hypot(dx, dy) < TS - 0.001) {
                const dirX = Math.sign(next.x - start.x);
                const dirY = Math.sign(next.y - start.y);
                end = {
                    x: start.x + dirX * TS,
                    y: start.y + dirY * TS
                };
            }
            if (start.x === end.x && start.y === end.y) continue;
            const centerX = (start.x + end.x) / 2;
            const centerY = (start.y + end.y) / 2;
            const gx = Math.round(centerX / align);
            const gy = Math.round(centerY / align);
            segments.push({
                id: `${groupId}_seg_${i}`,
                groupId,
                type: 'logistics_segment',
                sourceId,
                targetId,
                targetPoint: targetId ? null : targetPoint,
                gridX: gx,
                gridY: gy,
                alignUnit: 0.5,
                x: centerX,
                y: centerY,
                routePoints: [{ x: start.x, y: start.y }, { x: end.x, y: end.y }],
                routeWidth: Math.max(1, Number(routeWidth) || 1),
                sourcePort,
                targetPort,
                filter: filter || null,
                order: i,
                createdAt: Date.now()
            });
        }
        return segments;
    }

    static upsertLogisticsLine({ lineId = null, sourceEnt, targetEnt = null, targetPoint = null, points = [], routeWidth = 1, sourcePort = null, targetPort = null, conn = null }) {
        const lines = this.ensureLogisticsLineStore();
        const sourceId = this.getEntityId(sourceEnt);
        const targetId = targetEnt ? this.getEntityId(targetEnt) : null;
        const groupId = lineId || conn?.lineId || this.makeLogisticsLineId(sourceId, targetId, targetPoint);
        const cleanTargetPoint = targetId ? null : this.snapPointToGridCenter(targetPoint);
        const cleanSourcePort = sourcePort ? { dir: sourcePort.dir, slotIndex: sourcePort.slotIndex, defIndex: sourcePort.defIndex, width: sourcePort.width, x: sourcePort.x, y: sourcePort.y } : null;
        const cleanTargetPort = targetPort ? { dir: targetPort.dir, slotIndex: targetPort.slotIndex, defIndex: targetPort.defIndex, width: targetPort.width, x: targetPort.x, y: targetPort.y } : null;
        const gridPoints = this.buildGridRoutePoints(points);
        const previous = lines.find(item => item.groupId === groupId || item.id === groupId);
        const filter = conn ? (conn.filter || null) : (previous?.filter || null);
        const segments = this.buildLogisticsSegments(groupId, sourceId, targetId, cleanTargetPoint, gridPoints, routeWidth, cleanSourcePort, cleanTargetPort, filter);
        const occupied = new Map();
        lines.forEach(item => {
            const key = this.getLogisticsSegmentOccupyKey(item);
            if (key && !occupied.has(key)) occupied.set(key, item);
        });
        const additions = [];
        segments.forEach(segment => {
            const key = this.getLogisticsSegmentOccupyKey(segment);
            if (!key || occupied.has(key)) return;
            occupied.set(key, segment);
            additions.push(segment);
        });
        GameEngine.state.logisticsLines = lines.concat(additions);

        if (conn) {
            conn.lineId = groupId;
            conn.routePoints = gridPoints.map(p => ({ x: p.x, y: p.y }));
            conn.routeWidth = Math.max(1, Number(routeWidth) || 1);
            conn.sourcePort = cleanSourcePort;
            conn.targetPort = cleanTargetPort;
        }
        return additions[additions.length - 1] || segments.map(segment => occupied.get(this.getLogisticsSegmentOccupyKey(segment))).filter(Boolean).pop() || null;
    }

    static getLogisticsLineRoute(line) {
        if (!line || !Array.isArray(line.routePoints) || line.routePoints.length < 2) return null;
        return {
            points: line.routePoints.map(p => ({ x: p.x, y: p.y })),
            width: Math.max(1, Number(line.routeWidth) || 1)
        };
    }

    static getLogisticsLineById(lineId) {
        return this.ensureLogisticsLineStore().find(line => line.id === lineId || line.groupId === lineId) || null;
    }

    static getLogisticsSegmentsByGroupId(groupId) {
        return this.ensureLogisticsLineStore()
            .filter(line => line.groupId === groupId || line.id === groupId)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    static setLogisticsGroupFilter(groupId, filterItem) {
        this.getLogisticsSegmentsByGroupId(groupId).forEach(line => {
            line.filter = filterItem || null;
        });
    }

    static isSelectedLogisticsLine(line) {
        const selectedId = GameEngine.state.selectedLogisticsLineId;
        if (!line || !selectedId) return false;
        return line.id === selectedId || line.groupId === selectedId;
    }

    static getLogisticsLineDragPort(line) {
        const points = Array.isArray(line?.routePoints) ? line.routePoints : [];
        const first = points[0];
        const second = points[1];
        let dir = null;
        if (first && second) {
            const dx = second.x - first.x;
            const dy = second.y - first.y;
            if (Math.abs(dx) >= Math.abs(dy)) dir = dx >= 0 ? "right" : "left";
            else dir = dy >= 0 ? "down" : "up";
        }
        return {
            dir,
            width: Math.max(1, Number(line?.routeWidth) || 1),
            sourceType: "logistics_line"
        };
    }

    static beginLogisticsDragFromLine(line) {
        if (!line) return false;
        this.clearWorldSelectionMarquee();
        this.logisticsSourceEntity = null;
        this.logisticsSourceLine = line;
        this.isLogisticsDragging = true;
        this.activeLogisticsLine = line;
        this.activeLogisticsConnection = null;
        GameEngine.state.selectedLogisticsLineId = line.id;
        GameEngine.state.logisticsDragLine = { active: true };
        this.hideContextMenu();
        conveyorSystem.startDrag(line.x, line.y, null, this.getLogisticsLineDragPort(line), line);
        return true;
    }

    static beginLogisticsDragFromBuilding(ent, sourcePort) {
        if (!ent || !sourcePort) return false;
        this.clearWorldSelectionMarquee();
        this.logisticsSourceEntity = ent;
        this.logisticsSourceLine = null;
        this.isLogisticsDragging = true;
        this.hideContextMenu();
        conveyorSystem.startDrag(sourcePort.x, sourcePort.y, ent, sourcePort);
        GameEngine.state.logisticsDragLine = { active: true };
        return true;
    }

    static clearWorldSelectionMarquee() {
        const scene = window.PhaserScene;
        if (!scene) return;
        scene.selectionStartPos = null;
        scene.mouseDownScreenPos = null;
        if (scene.marqueeGraphics) {
            scene.marqueeGraphics.clear();
            scene.marqueeGraphics.visible = false;
        }
    }

    static rotatePlacementPreview(e = null) {
        const state = GameEngine.state;
        if (!state.placingType) return false;
        const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        if (state.lastPlacementRotateAt && now - state.lastPlacementRotateAt < 40) return true;
        state.lastPlacementRotateAt = now;
        state.placingRotation = ((Number(state.placingRotation) || 0) + 1) % 4;
        GameEngine.addLog(`[建造] 建築方向已旋轉 ${state.placingRotation * 90} 度。`, "SYSTEM");
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        return true;
    }

    static isPlacementRotateKeyEvent(e) {
        if (!e) return false;
        const key = String(e.key || "");
        return e.code === "KeyR" ||
            e.keyCode === 82 ||
            e.which === 82 ||
            key.toLowerCase() === "r" ||
            key === "ㄐ";
    }

    static cancelLogisticsDrag() {
        if (!this.isLogisticsDragging && !GameEngine.state.logisticsDragLine) return false;
        conveyorSystem.cancelDrag();
        this.clearWorldSelectionMarquee();
        this.logisticsSourceEntity = null;
        this.logisticsSourceLine = null;
        this.potentialLogisticsDrag = null;
        this.isLogisticsDragging = false;
        GameEngine.state.logisticsDragLine = null;
        GameEngine.addLog(`[物流] 已取消物流線建造。`, 'LOGISTICS');
        return true;
    }

    static cancelActiveConstructionPreview() {
        if (this.cancelLogisticsDrag()) return true;
        if (!GameEngine.state.placingType && GameEngine.state.buildingMode === 'NONE') return false;
        this.cancelBuildingMode();
        this.clearWorldSelectionMarquee();
        GameEngine.addLog(`[建造] 已取消建造預覽。`, 'SYSTEM');
        return true;
    }

    static deleteLogisticsLineById(lineId) {
        const state = GameEngine.state;
        const line = this.getLogisticsLineById(lineId);
        if (!line) return false;
        state.logisticsLines = this.ensureLogisticsLineStore().filter(item => item.id !== line.id);
        if (line.sourceId && line.targetId && !this.getLogisticsSegmentsByGroupId(line.groupId).length) {
            const sourceEnt = state.mapEntities.find(ent => this.getEntityId(ent) === line.sourceId);
            if (sourceEnt && Array.isArray(sourceEnt.outputTargets)) {
                sourceEnt.outputTargets = sourceEnt.outputTargets.filter(conn => conn.lineId !== line.groupId && conn.id !== line.targetId);
            }
        }
        if (state.selectedLogisticsLineId === line.id) state.selectedLogisticsLineId = null;
        if (this.activeLogisticsLine && this.activeLogisticsLine.id === line.id) this.activeLogisticsLine = null;
        if (this.activeLogisticsConnection?.lineId === line.id) this.activeLogisticsConnection = null;
        GameEngine.addLog(`[物流] 物流線段已刪除`, 'LOGISTICS');
        return true;
    }

    static deleteLogisticsLineGroupById(groupId) {
        const state = GameEngine.state;
        const segments = this.getLogisticsSegmentsByGroupId(groupId);
        if (!segments.length) return false;
        const first = segments[0];
        state.logisticsLines = this.ensureLogisticsLineStore().filter(item => item.groupId !== groupId && item.id !== groupId);
        if (first.sourceId && first.targetId) {
            const sourceEnt = state.mapEntities.find(ent => this.getEntityId(ent) === first.sourceId);
            if (sourceEnt && Array.isArray(sourceEnt.outputTargets)) {
                sourceEnt.outputTargets = sourceEnt.outputTargets.filter(conn => conn.lineId !== groupId && conn.id !== first.targetId);
            }
        }
        if (segments.some(line => line.id === state.selectedLogisticsLineId)) state.selectedLogisticsLineId = null;
        if (this.activeLogisticsLine && this.activeLogisticsLine.groupId === groupId) this.activeLogisticsLine = null;
        if (this.activeLogisticsConnection?.groupId === groupId) this.activeLogisticsConnection = null;
        GameEngine.addLog(`[物流] 物流線群組已刪除`, 'LOGISTICS');
        return true;
    }

    static deleteSelectedLogisticsLine() {
        const selectedLineId = GameEngine.state.selectedLogisticsLineId;
        if (!selectedLineId && !this.activeLogisticsLine && !this.activeLogisticsConnection) return false;

        let deleted = false;
        if (this.activeLogisticsConnection?.groupId) {
            deleted = this.deleteLogisticsLineGroupById(this.activeLogisticsConnection.groupId);
        } else if (this.activeLogisticsLine) {
            deleted = this.deleteLogisticsLineById(this.activeLogisticsLine.id);
        } else if (selectedLineId) {
            deleted = this.deleteLogisticsLineById(selectedLineId);
        }

        if (!deleted) return false;

        const menu = document.getElementById("logistics_menu");
        if (menu) menu.style.display = "none";
        this.activeLogisticsConnection = null;
        this.activeLogisticsLine = null;
        this.logisticsSourceLine = null;
        if (GameEngine.state.selectedLogisticsLineId === selectedLineId) {
            GameEngine.state.selectedLogisticsLineId = null;
        }
        return true;
    }

    static getLogisticsLineAt(worldX, worldY) {
        const TS = GameEngine.TILE_SIZE;
        return this.ensureLogisticsLineStore()
            .filter(line =>
                Math.abs(worldX - line.x) <= TS / 2 &&
                Math.abs(worldY - line.y) <= TS / 2
            )
            .sort((a, b) => {
                const da = Math.hypot(worldX - a.x, worldY - a.y);
                const db = Math.hypot(worldX - b.x, worldY - b.y);
                return da - db || (b.createdAt || 0) - (a.createdAt || 0);
            })[0] || null;
    }

    static handleWorldMouseDown(e) {
        if (e.button === 2 && this.cancelActiveConstructionPreview()) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

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
        const world = this.getWorldPoint(e.clientX, e.clientY);
        const worldX = world.x; const worldY = world.y;
        const clickedBuilding = GameEngine.state.mapEntities.find(ent => {
            if (ent.isUnderConstruction) return false;
            const cfg = GameEngine.getEntityConfig(ent.type1);
            if (!cfg || !cfg.logistics || !cfg.logistics.canOutput) return false;
            return this.isPointInsideEntity(ent, worldX, worldY);
        });
        if (clickedBuilding && GameEngine.state.buildingMode === 'NONE') {
            const sourcePort = this.getNearestPortSlot(clickedBuilding, worldX, worldY);
            if (sourcePort) {
                this.potentialLogisticsDrag = {
                    entity: clickedBuilding,
                    sourcePort,
                    startClientX: e.clientX,
                    startClientY: e.clientY
                };
            }
        }

        const clickedLine = this.getLogisticsLineAt(worldX, worldY);
        if (clickedLine && this.isSelectedLogisticsLine(clickedLine) && GameEngine.state.buildingMode === 'NONE') {
            this.beginLogisticsDragFromLine(clickedLine);
            return;
        }

        const state = GameEngine.state;
        if (state.buildingMode === 'STAMP') {
            state.buildingMode = 'LINE';
            state.lineStartPos = this.getWorldMousePos(e.clientX, e.clientY);
            state.linePreviewEntities = [state.lineStartPos];
        }
    }

    static handleWorldMouseMove(e) {
        if (this.potentialLogisticsDrag && !this.isLogisticsDragging) {
            const threshold = UI_CONFIG.Interaction?.minDragDistance || 10;
            const dist = Math.hypot(
                e.clientX - this.potentialLogisticsDrag.startClientX,
                e.clientY - this.potentialLogisticsDrag.startClientY
            );
            if (dist > threshold) {
                const pending = this.potentialLogisticsDrag;
                this.potentialLogisticsDrag = null;
                if (this.beginLogisticsDragFromBuilding(pending.entity, pending.sourcePort)) {
                    const world = this.getWorldPoint(e.clientX, e.clientY);
                    conveyorSystem.updateDrag(world.x, world.y);
                    return;
                }
            }
        }

        if (this.isLogisticsDragging && GameEngine.state.logisticsDragLine) {
            const world = this.getWorldPoint(e.clientX, e.clientY);
            conveyorSystem.updateDrag(world.x, world.y);
            return;
        }

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
            // 所有右鍵行為（取消建築、設定集結點）已全數整合至 InputSystem.js 處理
            this.rightMouseDownPos = null;
            return;
        }

        // [左鍵邏輯專區]
        if (e.button !== 0) return;
        this.potentialLogisticsDrag = null;

        if (this.isLogisticsDragging) {
            conveyorSystem.submitDrag();
            this.logisticsSourceEntity = null;
            this.logisticsSourceLine = null;
            this.isLogisticsDragging = false;
            GameEngine.state.logisticsDragLine = null;
            return;
        }

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
        const warehousePanelEl = document.getElementById("warehouse_panel");
        const warehouseBtnEl = document.getElementById("warehouse_btn");
        const isSelfUI = (menuEl && menuEl.contains(e.target)) ||
            (distBtnEl && distBtnEl.contains(e.target)) ||
            (warehousePanelEl && warehousePanelEl.contains(e.target)) ||
            (warehouseBtnEl && warehouseBtnEl.contains(e.target));


        if (!isSelfUI) {
            this.hideContextMenu();
        }

        // 點擊 UI 區域後的額外處理
        if (e.target.closest("#ui_layer")) {
            if (!e.target.closest("#settings_btn") && !e.target.closest("#settings_panel") &&
                !e.target.closest("#warehouse_btn") && !e.target.closest("#warehouse_panel")) {
                this.hideSettingsPanel();
                this.hideWarehousePanel();
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

        const world = this.getWorldPoint(e.clientX, e.clientY);
        const worldX = world.x;
        const worldY = world.y;
        const nearbyUnit = GameEngine.state.units.villagers.find(u => u.visible !== false && Math.hypot(u.x - worldX, u.y - worldY) < 50);
        if (nearbyUnit) return;


        const entities = GameEngine.state.mapEntities;

        const clicked = entities.find(ent => {
            const fp = GameEngine.getFootprint(ent.type1);
            if (!fp) return false;
            const w = fp.uw * GameEngine.TILE_SIZE;
            const h = fp.uh * GameEngine.TILE_SIZE;
            const mx = worldX, my = worldY;
            return mx > ent.x - w / 2 && mx < ent.x + w / 2 && my > ent.y - h / 2 && my < ent.y + h / 2;
        });

        if (clicked) {
            const now = Date.now();
            const buildingId = clicked.id || `${clicked.type1}_${clicked.x}_${clicked.y}`;
            GameEngine.state.selectedLogisticsLineId = null;
            this.activeLogisticsLine = null;

            // 雙擊全選邏輯
            const isDoubleClick = (GameEngine.state.lastSelectedBuildingId === buildingId && (now - GameEngine.state.lastSelectionTime < 500));

            if (isDoubleClick) {
                const type1 = clicked.type1;
                const scene = window.PhaserScene;
                if (scene) {
                    const view = scene.cameras.main.worldView;
                    const visibleBuildings = GameEngine.state.mapEntities.filter(e => 
                        e.type1 === type1 && 
                        e.x >= view.x && e.x <= view.x + view.width && 
                        e.y >= view.y && e.y <= view.y + view.height
                    );
                    GameEngine.state.selectedBuildingIds = visibleBuildings.map(e => e.id || `${e.type1}_${e.x}_${e.y}`);
                    GameEngine.addLog(`[選取] 相同類型建築共 ${visibleBuildings.length} 個。`);
                }
            } else {
                GameEngine.state.selectedBuildingIds = [buildingId];
                GameEngine.state.selectedBuildingId = clicked.id;
            }

            GameEngine.state.lastSelectionTime = now;
            GameEngine.state.lastSelectedBuildingId = buildingId;
            GameEngine.state.selectedUnitIds = [];
            GameEngine.state.selectedResourceId = null;

            if (!clicked.isUnderConstruction && (clicked.type1 === "storehouse" || clicked.type2 === "storehouse")) {
                const panel = document.getElementById("warehouse_panel");
                if (panel && panel.style.display === "none") {
                    this.toggleWarehousePanel(clicked);
                }
            } else {
                this.showContextMenu(clicked);
            }
            return;
        }

        // [物流線實體] 點擊優先級低於建築，高於地板。
        const clickedLine = this.getLogisticsLineAt(worldX, worldY);
        if (clickedLine) {
            GameEngine.state.selectedUnitIds = [];
            GameEngine.state.selectedBuildingIds = [];
            GameEngine.state.selectedBuildingId = null;
            GameEngine.state.selectedResourceId = null;
            GameEngine.state.selectedLogisticsLineId = clickedLine.id;
            const source = GameEngine.state.mapEntities.find(ent => this.getEntityId(ent) === clickedLine.sourceId);
            if (source && clickedLine.targetId) {
                this.showLogisticsMenu(source, clickedLine.targetId, e.clientX, e.clientY, clickedLine.id);
            } else {
                this.showLogisticsLineMenu(clickedLine, e.clientX, e.clientY);
            }
            return;
        }

        // 點擊地面
        GameEngine.state.selectedBuildingIds = [];
        GameEngine.state.selectedBuildingId = null;
        GameEngine.state.selectedLogisticsLineId = null;
        this.activeLogisticsConnection = null;
        this.activeLogisticsLine = null;
    }

    static showContextMenu(entity, isConfirming = false) {
        this.activeMenuEntity = entity;
        const menu = document.getElementById("context_menu");
        const cfg = UI_CONFIG.ActionMenu;

        // 設置動態識別碼，使不同建築擁有獨立位置
        const customId = `context_menu_${entity.id || `${entity.type1}_${entity.x}_${entity.y}`}`;
        menu.dataset.dragId = customId;

        // 套用錨點樣式 (包含寬高、最小寬度等尺寸設定)
        if (cfg.anchor) {
            this.applyAnchorStyle(menu, cfg, customId);
        }

        menu.style.display = "flex";
        menu.style.flexDirection = "column";
        menu.style.padding = "20px";
        menu.style.boxSizing = "border-box";
        menu.style.overflow = "hidden";

        let name = entity.isUnderConstruction ? (GameEngine.getBuildingConfig(entity.type1, entity.lv)?.name || "施工中的建築") : (entity.name || entity.type1);
        const cfg_current = GameEngine.getBuildingConfig(entity.type1, entity.lv || 1);
        const canAssignWorkers = cfg_current && (cfg_current.need_villagers > 0 || (cfg_current.logistics && (cfg_current.logistics.canInput || cfg_current.logistics.canOutput)));
        const isProcessingPlant = cfg_current && cfg_current.type2 === 'processing_plant';
        if (isProcessingPlant && !isConfirming) menu.style.padding = "16px";
        const nextCfg = GameEngine.getBuildingConfig(entity.type1, (entity.lv || 1) + 1);
        const hCfg = UI_CONFIG.ActionMenuHeader;
        const eid = entity.id || `${entity.type1}_${entity.x}_${entity.y}`;
        const assignedWorkerCount = GameEngine.state.units.villagers.filter(v =>
            v.config && v.config.type === 'villagers' && v.assignedWarehouseId === eid
        ).length;
        const isGatheringBuilding = cfg_current && (
            cfg_current.type2 === 'gathering' ||
            ['timber_factory', 'stone_factory', 'barn', 'gold_mining_factory', 'farmland', 'tree_plantation'].includes(entity.type1)
        );
        const workerLightMax = Math.max(1, isProcessingPlant
            ? (cfg_current?.need_villagers || 5)
            : isGatheringBuilding
                ? (cfg_current?.need_villagers || 1)
            : (entity.targetWorkerCount || cfg_current?.need_villagers || 5));
        const workerLightCount = Math.max(0, Math.min(workerLightMax, isProcessingPlant
            ? new Set(entity.assignedWorkers || []).size
            : assignedWorkerCount));
        const maxWorkersForEntity = workerLightMax;
        const stockpileInfo = isGatheringBuilding ? this.getBuildingStockpileInfo(entity, cfg_current) : null;
        const compactWorkerHtml = (!isConfirming && isProcessingPlant && canAssignWorkers && !entity.isUnderConstruction) ? `
            <div style="display: flex; align-items: center; gap: 6px; margin-left: 10px;">
                <div class="factory-worker-lights" title="建築內工人 ${workerLightCount} / ${workerLightMax}" style="display: grid; grid-template-columns: repeat(${workerLightMax}, 1fr); width: 118px; height: 20px; background: #202a2f; border: 2px solid #cfd8dc; box-sizing: border-box;">
                    ${Array.from({ length: workerLightMax }).map((_, i) => `<div class="factory-worker-light" style="background: ${i < workerLightCount ? '#32f06a' : 'rgba(120,130,138,0.55)'}; border-right: ${i < workerLightMax - 1 ? '1px solid rgba(0,0,0,0.5)' : '0'};"></div>`).join('')}
                </div>
                <button class="adjust-btn" onclick="window.UIManager.adjustWorkers(event, -1)"
                    style="width: 24px; height: 24px; border-radius: 50%; background: #5b3d31; border: 2px solid #c59a79; color: #f6e2cf; font-size: 16px; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.35);">－</button>
            </div>
        ` : "";

        // --- 1. 左側標頭：Lv 與 名稱 (垂直堆疊) ---
        let leftHeader = "";
        const lOffset = hCfg.leftOffset || { x: 0, y: 0 };
        if (isConfirming) {
            leftHeader = `
                <div style="display: flex; flex-direction: column; justify-content: center; transform: translate(${lOffset.x}px, ${lOffset.y}px);">
                    <span style="font-size: 16px; color: #ff8a80; font-weight: bold; margin-bottom: 4px;">${entity.isUnderConstruction ? "取消建設？" : "確定銷毀？"}</span>
                    <span style="font-size: 22px; color: ${hCfg.nameColor}; font-weight: bold; text-shadow: 1px 1px 3px rgba(0,0,0,0.8);">${name}</span>
                </div>
            `;
        } else {
            const showDismiss = !isConfirming && canAssignWorkers && !entity.isUnderConstruction;
            
            let dismissHtml = "";
            if (showDismiss) {
                const dOffX = hCfg.dismissBtnOffsetX !== undefined ? hCfg.dismissBtnOffsetX : 15;
                const dOffY = hCfg.dismissBtnOffsetY !== undefined ? hCfg.dismissBtnOffsetY : -3;
                dismissHtml = `<button class="dismiss-btn" onclick="window.UIManager.dismissWorkers(event)" style="margin-left: ${dOffX}px; transform: translateY(${dOffY}px); padding: 0 8px; height: ${hCfg.dismissBtnHeight || '24px'}; background: ${hCfg.dismissBtnBg || '#c62828'}; color: ${hCfg.dismissBtnColor || 'white'}; border: 1.5px solid ${hCfg.dismissBtnBorder || '#ff8a80'}; border-radius: 4px; font-size: ${hCfg.dismissBtnFontSize || '12px'}; cursor: pointer; font-weight: bold; white-space: nowrap; pointer-events: auto;">解散</button>`;
                if (isGatheringBuilding) {
                    dismissHtml += `<button class="adjust-btn" onclick="window.UIManager.adjustWorkers(event, -1)"
                        style="margin-left: 18px; width: 26px; height: 26px; border-radius: 50%; background: ${hCfg.workerAdjustBtnBg || '#4e342e'}; border: 2.3px solid ${hCfg.workerAdjustBtnBorder || '#8b6e4b'}; color: ${hCfg.workerAdjustBtnColor || 'white'}; font-size: 17px; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.35); pointer-events: auto;">－</button>`;
                }
            }

            leftHeader = `
                <div style="display: flex; flex-direction: column; justify-content: center; transform: translate(${lOffset.x}px, ${lOffset.y}px);">
                    <div style="display: flex; align-items: center;">
                        <span style="font-size: ${hCfg.levelFontSize}; font-weight: 900; color: #ffffff; line-height: 0.9; font-family: 'Arial Black', sans-serif; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">Lv.${entity.lv || 1}</span>
                        ${dismissHtml}
                        ${compactWorkerHtml}
                    </div>
                    <span style="font-size: ${hCfg.nameFontSize}; color: ${hCfg.nameColor}; font-weight: bold; margin-top: ${isProcessingPlant ? '6px' : '10px'}; text-shadow: 1px 1px 3px rgba(0,0,0,0.8); white-space: nowrap;">${name}</span>
                </div>
            `;
        }

        // --- 2. 右側面板：升級資訊 (暗色圓角框) ---
        let rightHeader = "";
        let requirementHtml = "";
        const rOffset = hCfg.rightOffset || { x: 0, y: 0 };
        const reqOffset = hCfg.requirementOffset || { x: 0, y: 0 };
        const boxW = typeof hCfg.upgradeInfoWidth === 'number' ? `${hCfg.upgradeInfoWidth}px` : hCfg.upgradeInfoWidth;
        const boxH = typeof hCfg.upgradeInfoHeight === 'number' ? `${hCfg.upgradeInfoHeight}px` : hCfg.upgradeInfoHeight;

        if (!isConfirming && entity.isUpgrading) {
            const prog = Math.floor((entity.upgradeProgress || 0) * 100);
            rightHeader = `
                <div style="display: flex; align-items: center; background: rgba(0, 0, 0, 0.4); padding: ${hCfg.upgradeInfoPadding}; border-radius: 12px; border: 1.5px solid rgba(255,255,255,0.1); width: ${boxW}; min-width: ${boxW}; height: ${boxH}; box-sizing: border-box; transform: translate(${rOffset.x}px, ${rOffset.y}px);">
                    <div style="flex: 1; height: 24px; background: rgba(0,0,0,0.5); border-radius: 12px; position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); margin-right: 15px;">
                        <div id="upgrade_progress_bar" style="width: ${prog}%; height: 100%; background: linear-gradient(90deg, ${hCfg.progressColorStart}, ${hCfg.progressColorEnd});"></div>
                        <div id="upgrade_percentage_text" style="position: absolute; width: 100%; text-align: center; top: 0; font-size: 12px; line-height: 24px; color: white; font-weight: bold; text-shadow: 0 1px 2px black;">升級中 ${prog}%</div>
                    </div>
                    <button class="action-btn" style="width: 56px; height: 34px; border-radius: 17px; background: ${hCfg.cancelBtnBg}; border: 1px solid rgba(255,255,255,0.2); font-size: 13px; font-weight: bold; color: white; cursor: pointer;"
                            onclick="window.GameEngine.cancelUpgrade(event, window.UIManager.activeMenuEntity)">取消</button>
                </div>
            `;
        } else if (!isConfirming && nextCfg && !entity.isUnderConstruction) {
            const unlock = GameEngine.isUpgradeUnlocked(entity, nextCfg);
            const costs = nextCfg?.costs || {};
            const costItems = [];

            for (let r in costs) {
                costItems.push({ key: r, icon: this.getIngredientIcon(r), val: costs[r] });
            }

            const btnSize = hCfg.upgradeBtnSize || 54;
            let btnStyle = `width: ${btnSize}px; height: ${btnSize}px; background: ${hCfg.upgradeBtnBg}; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; box-shadow: ${hCfg.upgradeBtnShadow}; border: 1.5px solid rgba(255,255,255,0.2); flex-shrink: 0;`;
            let btnAction = `window.GameEngine.startUpgrade(event, window.UIManager.activeMenuEntity)`;
            let btnEvents = `onmouseover="this.style.background='${hCfg.upgradeBtnHoverBg}'; this.style.transform='scale(1.05)';" onmouseout="this.style.background='${hCfg.upgradeBtnBg}'; this.style.transform='scale(1)';"`;

            if (!unlock.unlocked) {
                btnStyle = `width: ${btnSize}px; height: ${btnSize}px; background: #444; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: not-allowed; opacity: 0.6; filter: grayscale(1); border: 1px solid rgba(255,255,255,0.1); flex-shrink: 0;`;
                btnAction = ""; btnEvents = "";
            }

            let costsHtml = "";
            costItems.forEach(item => {
                const playerVal = GameEngine.state.resources[item.key] || 0;
                const isSufficient = playerVal >= item.val;
                costsHtml += `
                    <div style="display: flex; align-items: center; gap: 4px; color: ${isSufficient ? hCfg.resSufficientColor : hCfg.resInsufficientColor}; font-weight: bold; font-size: ${hCfg.upgradeInfoCostFontSize || '17px'}; flex-shrink: 0;">
                        <span>${item.icon}</span><span>${item.val}</span>
                    </div>
                `;
            });

            rightHeader = `
                <div style="display: flex; align-items: center; background: rgba(0, 0, 0, 0.4); padding: ${hCfg.upgradeInfoPadding}; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); width: ${boxW}; min-width: ${boxW}; height: ${boxH}; box-sizing: border-box; transform: translate(${rOffset.x}px, ${rOffset.y}px);">
                    <div style="display: flex; flex-direction: column; flex: 1; overflow: hidden; justify-content: center;">
                        <span style="font-size: ${hCfg.upgradeInfoLabelFontSize || '13px'}; font-weight: bold; color: rgba(255,255,255,0.3); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">升級至 Lv.${(entity.lv || 1) + 1}</span>
                        <div style="display: flex; align-items: center; flex-wrap: nowrap; gap: ${hCfg.upgradeInfoResourceGap !== undefined ? hCfg.upgradeInfoResourceGap : 15}px;">${costsHtml || '<span style="color: #81c784; font-size: 14px;">免費</span>'}</div>
                    </div>
                    <div class="upgrade-action-btn" style="${btnStyle}; margin-left: 15px;" onclick="${btnAction}" ${btnEvents}>
                        <span style="color: white; font-size: ${btnSize * 0.5}px; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">▲</span>
                    </div>
                </div>
            `;

            if (unlock.requirement) {
                requirementHtml = `
                    <div style="color: ${unlock.requirement.satisfied ? '#81c784' : hCfg.requirementColor}; font-size: ${hCfg.requirementFontSize}; font-weight: bold; text-shadow: 0 1px 2px black; transform: translate(${reqOffset.x}px, ${reqOffset.y}px);">
                        ${unlock.requirement.text}
                    </div>
                `;
            }
        } else if (!isConfirming && entity.lv > 1 && !nextCfg) {
            rightHeader = `<div style="color: #fbc02d; font-weight: bold; font-size: 16px; border: 1px solid rgba(251, 192, 45, 0.3); display: flex; align-items: center; justify-content: center; border-radius: 12px; background: rgba(0,0,0,0.3); width: ${boxW}; height: ${boxH}; box-sizing: border-box; transform: translate(${rOffset.x}px, ${rOffset.y}px);">已達最高等級 ⭐</div>`;
        }

        const btnOpacity = entity.isUpgrading ? "opacity: 0.4; filter: grayscale(1); pointer-events: none;" : "opacity: 1;";

        // --- 3. 指令按鈕生成 (格網) ---
        const gOffset = hCfg.actionGridOffset || { x: 0, y: 0 };
        // [修正] 改為 nowrap 並使用 space-evenly，確保縮減寬度時，間距會同比調整，且永不換行
        const gridJustify = isConfirming ? "center" : "space-evenly";
        const gridGap = isConfirming ? "20px" : "4px";
        let gridHtml = `<div id="action_button_grid" style="display:flex; flex-direction:${isProcessingPlant ? 'column' : 'row'}; flex-wrap:nowrap; gap:${isProcessingPlant ? '8px' : gridGap}; justify-content:${isProcessingPlant ? 'flex-start' : gridJustify}; align-items:${isProcessingPlant ? 'stretch' : 'center'}; transition: all 0.3s; width: 100%; transform: translate(${gOffset.x}px, ${gOffset.y}px);">`;

        if (isConfirming) {
            gridHtml += `
                <button class="action-btn danger" onclick="window.UIManager.actualDestroy(event, '${eid}')" style="width: 100px; height: 44px; flex-direction: row; gap: 8px;">
                    <span class="icon" style="font-size:18px; margin:0;">✔️</span><span class="label">確定銷毀</span>
                </button>
                <button class="action-btn" onclick="window.UIManager.cancelDestroy(event)" style="width: 100px; height: 44px; flex-direction: row; gap: 8px;">
                    <span class="icon" style="font-size:18px; margin:0;">❌</span><span class="label">取消</span>
                </button>
            `;
        } else {
            // 普通指令模式
            if (entity.type1 === 'town_center' || entity.type1 === 'village') {
                const cmds = [['WOOD', '🪓', '採集木材'], ['STONE', '⛏️', '採集石頭'], ['GOLD', '💰', '採集黃金'], ['FOOD', '🧺', '採集食物'], ['RETURN', '🏘️', '收工']];
                cmds.forEach(c => {
                    gridHtml += `<button class="action-btn" id="cmd_${c[0]}" onclick="window.GameEngine.setCommand(event, '${c[0]}')" style="${btnOpacity}"><span class="icon">${c[1]}</span><span class="label">${c[2]}</span></button>`;
                });
            }

            // 生產按鈕
            const bCfg = GameEngine.getBuildingConfig(entity.type1, entity.lv || 1);
            if (bCfg && bCfg.npcProduction && bCfg.npcProduction.length > 0 && !entity.isUnderConstruction) {
                const iconMap = { 'villagers': '👤', 'female villagers': '👩', 'mage': '🧙', 'swordsman': '⚔️', 'archer': '🏹' };
                if (bCfg.productionMode === 'rand') {
                    gridHtml += `
                        <button class="action-btn" onclick="window.GameEngine.addToProductionQueue(event, 'RANDOM', null)" style="${btnOpacity}">
                            <span class="icon">${iconMap[bCfg.npcProduction[0]] || '❓'}</span><span class="label">隨機招募</span>
                            <div id="queue_badge" class="queue-badge" style="display:none">0</div><div id="prod_progress" class="progress-bar-mini"></div>
                        </button>`;
                } else {
                    bCfg.npcProduction.forEach(id => {
                        const name = GameEngine.state.idToNameMap[id] || id;
                        gridHtml += `
                            <button class="action-btn" onclick="window.GameEngine.addToProductionQueue(event, '${id}', null)">
                                <span class="icon">${iconMap[id] || iconMap[name] || '👤'}</span><span class="label">${name}</span>
                                <div id="queue_badge" class="queue-badge" style="display:none">0</div><div id="prod_progress" class="progress-bar-mini"></div>
                            </button>`;
                    });
                }
            }

            // --- [新增] 派駐人數加減按鈕 ---
            if (!isConfirming && canAssignWorkers && !entity.isUnderConstruction && !isProcessingPlant) {
                const current = assignedWorkerCount;
                const wcOff = hCfg.workerControlOffset || { x: 0, y: 15 };
                const maxWorkers = maxWorkersForEntity; 
                const stockpileLabel = stockpileInfo
                    ? `${Math.floor(stockpileInfo.amount || 0)}${stockpileInfo.max ? ` / ${Math.floor(stockpileInfo.max)}` : ''}`
                    : '';
                const stockpileName = stockpileInfo
                    ? ((GameEngine.state.ingredientConfigs && GameEngine.state.ingredientConfigs[stockpileInfo.type]?.name) || GameEngine.RESOURCE_NAMES[stockpileInfo.type] || stockpileInfo.type)
                    : '';
                const assignedWorkersForSlots = isGatheringBuilding
                    ? GameEngine.state.units.villagers
                        .filter(v => v.config && v.config.type === 'villagers' && v.assignedWarehouseId === eid)
                        .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
                    : [];
                const workerSlotsHtml = isGatheringBuilding
                    ? Array.from({ length: maxWorkers }).map((_, i) => {
                        const worker = assignedWorkersForSlots[i];
                        const progress = worker ? this.getBuildingWorkerCooldown(worker) : 0;
                        const deg = Math.round(progress * 360);
                        return `
                            <div class="building-worker-slot" data-worker-id="${worker ? worker.id : ''}" title="${worker ? '派駐工人' : '空位'}" style="width: 30px; height: 30px; border-radius: 50%; border: 1.5px solid ${worker ? '#c59a79' : 'rgba(255,255,255,0.16)'}; background: ${worker ? `conic-gradient(rgba(50,240,106,0.75) ${deg}deg, rgba(255,255,255,0.08) ${deg}deg 360deg)` : 'rgba(0,0,0,0.28)'}; display: flex; align-items: center; justify-content: center; box-sizing: border-box; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 5px rgba(0,0,0,0.35); color: #f6e2cf; font-size: 15px; line-height: 1; flex: 0 0 30px;">
                                <div style="width: 22px; height: 22px; border-radius: 50%; background: ${worker ? '#5b3d31' : 'rgba(255,255,255,0.03)'}; display: flex; align-items: center; justify-content: center; line-height: 1;">${worker ? '👨' : ''}</div>
                            </div>`;
                    }).join('')
                    : '';
                
                gridHtml += `
                    <div style="display: flex; align-items: stretch; gap: 12px; transform: translate(${wcOff.x}px, ${wcOff.y}px); width: calc(100% - 32px); flex: 0 0 calc(100% - 32px); max-width: calc(100% - 32px); margin: 0 auto; height: 60px; box-sizing: border-box;">
                        <div class="warehouse-controls" style="display: flex; flex-direction: row; align-items: center; justify-content: ${isGatheringBuilding ? 'flex-start' : 'space-between'}; gap: 10px; background: rgba(0,0,0,0.4); padding: 10px 14px; margin: 0; border-radius: 12px; border: 1.5px solid rgba(255,255,255,0.1); box-shadow: 0 4px 15px rgba(0,0,0,0.5); height: 60px; box-sizing: border-box; width: ${stockpileInfo ? '62%' : '100%'}; flex: 0 0 ${stockpileInfo ? '62%' : '100%'}; max-width: ${stockpileInfo ? '62%' : '100%'}; overflow: hidden;">
                            ${!isGatheringBuilding ? `
                            <button class="adjust-btn" onclick="window.UIManager.adjustWorkers(event, -1)" 
                                    style="width: ${hCfg.workerAdjustBtnSize || 32}px; height: ${hCfg.workerAdjustBtnSize || 32}px; flex: 0 0 ${hCfg.workerAdjustBtnSize || 32}px; border-radius: 50%; background: ${hCfg.workerAdjustBtnBg || '#4e342e'}; border: 2.3px solid ${hCfg.workerAdjustBtnBorder || '#8b6e4b'}; color: ${hCfg.workerAdjustBtnColor || 'white'}; font-size: 20px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"
                                    onmouseover="this.style.background='#6d4c41'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='${hCfg.workerAdjustBtnBg || '#4e342e'}'; this.style.transform='scale(1)';">－</button>
                            ` : ''}
                            
                            ${isGatheringBuilding ? `
                                <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 auto; overflow: hidden;">
                                    ${workerSlotsHtml}
                                </div>
                            ` : `
                            <div style="display: flex; flex-direction: column; align-items: center; min-width: 72px; flex: 1 1 auto;">
                                <span style="font-size: 10px; color: rgba(255,255,255,0.35); font-weight: bold; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 1px;">Villagers</span>
                                <div style="font-size: ${hCfg.workerCountFontSize || '22px'}; font-weight: 900; color: #fff; font-family: 'Arial Black', sans-serif; text-shadow: 0 2px 4px rgba(0,0,0,0.5); line-height: 1;">
                                    <span style="color: #76ff03;">${current}</span> <span style="color: rgba(255,255,255,0.2); margin: 0 3px;">/</span> <span style="color: #fbc02d;">${maxWorkers}</span>
                                </div>
                            </div>
                            `}

                            ${!isGatheringBuilding ? `
                            <button class="adjust-btn" onclick="window.UIManager.adjustWorkers(event, 1)" 
                                    style="width: ${hCfg.workerAdjustBtnSize || 32}px; height: ${hCfg.workerAdjustBtnSize || 32}px; flex: 0 0 ${hCfg.workerAdjustBtnSize || 32}px; border-radius: 50%; background: ${hCfg.workerAdjustBtnBg || '#4e342e'}; border: 2.3px solid ${hCfg.workerAdjustBtnBorder || '#8b6e4b'}; color: ${hCfg.workerAdjustBtnColor || 'white'}; font-size: 20px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"
                                    onmouseover="this.style.background='#6d4c41'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='${hCfg.workerAdjustBtnBg || '#4e342e'}'; this.style.transform='scale(1)';">＋</button>
                            ` : ''}
                        </div>
                        ${stockpileInfo ? `
                            <div title="${stockpileName}" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; background: rgba(0,0,0,0.4); padding: 8px 10px; border-radius: 12px; border: 1.5px solid rgba(255,255,255,0.1); box-shadow: 0 4px 15px rgba(0,0,0,0.5); height: 60px; box-sizing: border-box; flex: 1 1 auto; min-width: 0;">
                                <span style="font-size: 10px; color: rgba(255,255,255,0.35); font-weight: bold; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap;">屯積</span>
                                <div style="display: flex; align-items: center; justify-content: center; gap: 5px; min-width: 0; color: #fff; font-size: 17px; font-weight: 900; font-family: 'Arial Black', sans-serif; text-shadow: 0 2px 4px rgba(0,0,0,0.5); line-height: 1;">
                                    <span id="building_stockpile_icon" style="font-size: 18px; line-height: 1;">${this.getIngredientIcon(stockpileInfo.type)}</span>
                                    <span id="building_stockpile_value" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${stockpileLabel}</span>
                                </div>
                            </div>
                        ` : ''}
                    </div>`;
            }
        }
        // --- [新增] 加工廠配方清單 ---
        if (!isConfirming && isProcessingPlant && !entity.isUnderConstruction) {
            const recipes = SynthesisSystem.getBuildingRecipes(GameEngine.state, GameEngine, entity) || [];
            if (recipes.length > 0) {
                const state = GameEngine.state;
                const inputBuffer = entity.inputBuffer || {};
                const getRecipeConfig = (recipeType) => {
                    const key = String(recipeType || '').toLowerCase();
                    return state.ingredientConfigs ? (state.ingredientConfigs[key] || state.ingredientConfigs[recipeType]) : null;
                };
                const getRecipeNeedInfo = (recipeType) => {
                    const ingCfg = getRecipeConfig(recipeType);
                    const needs = ingCfg && ingCfg.need_ingredients ? ingCfg.need_ingredients : {};
                    const needKeys = Object.keys(needs);
                    if (needKeys.length === 0) {
                        return { materialType: recipeType, stored: 0, required: 0, progress: 0, label: '0 / 0' };
                    }
                    const materialType = needKeys[0];
                    const stored = inputBuffer[materialType] || 0;
                    const required = needs[materialType] || 0;
                    const progress = required > 0 ? Math.min(1, stored / required) : 0;
                    return { materialType, stored, required, progress, label: `${stored} / ${required}` };
                };
                const formatRecipeName = (type) => {
                    const ingCfg = getRecipeConfig(type);
                    return (ingCfg && ingCfg.name) || GameEngine.RESOURCE_NAMES[type] || type;
                };
                const currentRecipe = entity.currentRecipe || recipes.find(r => r.isUnlocked) || recipes[0];
                const currentNeed = currentRecipe ? getRecipeNeedInfo(currentRecipe.type) : null;
                const productionProgress = entity.currentRecipe ? Math.max(0, Math.min(1, entity.craftingProgress || 0)) : 0;
                const currentRecipeName = entity.currentRecipe
                    ? formatRecipeName(entity.currentRecipe.type)
                    : '未設定';
                const outputStockpile = this.getFactoryOutputStockpileInfo(entity);
                const outputStockpileName = outputStockpile
                    ? formatRecipeName(outputStockpile.type)
                    : '成品';

                gridHtml += `<div style="width: 100%; display: flex; flex-direction: column; gap: 4px; padding-top: 0;">`;
                gridHtml += `
                    <section style="width: 100%; border: 2px solid rgba(11,84,143,0.9); border-radius: 14px; background: rgba(24,28,25,0.82); padding: 8px 14px 10px; box-sizing: border-box;">
                        <div style="font-size: 13px; color: rgba(255,255,255,0.5); font-weight: 800; margin-bottom: 7px;">當前生產線</div>
                        <div style="display: grid; grid-template-columns: minmax(0, 1fr) 104px; gap: 12px; align-items: stretch;">
                            <div style="display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 10px; align-items: end; min-width: 0;">
                                <div title="${currentRecipeName}" style="width: 44px; height: 44px; border: 1px solid rgba(139,110,75,0.55); border-radius: 6px; background: rgba(255,255,255,0.05); color: #e8e1d4; display: flex; align-items: center; justify-content: center; box-sizing: border-box; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);">
                                    <div style="font-size: 26px; line-height: 1; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.4));">${currentRecipe ? this.getIngredientIcon(currentRecipe.type) : '📦'}</div>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
                                    <div class="factory-material-ratio" style="height: 16px; display: flex; align-items: center; color: #fff; font-size: 14px; font-weight: 900; text-shadow: 0 2px 3px rgba(0,0,0,0.85), 1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000;">
                                        ${currentNeed ? currentNeed.label : '0 / 0'}
                                    </div>
                                    <div style="height: 34px; border: 2px solid #f4f4f4; border-radius: 7px; background: #232323; overflow: hidden; position: relative;">
                                        <div class="factory-production-fill" style="height: 100%; width: 100%; transform: scaleX(${productionProgress}); transform-origin: left center; background: #32f06a; border-radius: 0 7px 7px 0; transition: transform 0.08s linear; will-change: transform;"></div>
                                        <div class="factory-production-text" style="position: absolute; inset: 0; display: flex; align-items: center; padding-left: 18px; color: #ffffff; font-size: 18px; font-weight: 900; text-shadow: 0 2px 3px rgba(0,0,0,0.9), 1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000;">
                                            ${this.formatProductionCountdown(entity)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="factory-output-stockpile" title="${outputStockpileName}" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-width: 0; height: 56px; border-radius: 10px; border: 1.5px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.35); box-sizing: border-box; padding: 6px 8px;">
                                <div style="font-size: 10px; color: rgba(255,255,255,0.38); font-weight: 900; letter-spacing: 1px;">屯積</div>
                                <div style="display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 0; color: #ffffff; font-size: 18px; font-weight: 900; font-family: 'Arial Black', sans-serif; text-shadow: 0 2px 4px rgba(0,0,0,0.65);">
                                    <span class="factory-output-stockpile-icon" style="font-size: 18px; line-height: 1;">${outputStockpile ? this.getIngredientIcon(outputStockpile.type) : '📦'}</span>
                                    <span class="factory-output-stockpile-value" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${outputStockpile ? Math.floor(outputStockpile.amount || 0) : 0}</span>
                                </div>
                            </div>
                        </div>
                    </section>
                `;

                gridHtml += `<section style="width: 100%; border: 2px solid rgba(11,84,143,0.9); border-radius: 14px; background: rgba(96,96,96,0.9); padding: 10px 18px; box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: flex-start;">`;
                recipes.forEach(rec => {
                    const isUnlocked = rec.isUnlocked;
                    const isCrafting = entity.currentRecipe && (entity.currentRecipe.uid ? entity.currentRecipe.uid === rec.uid : entity.currentRecipe.type === rec.type);
                    const opacity = isUnlocked ? "1" : "0.4";
                    const filter = isUnlocked ? "none" : "grayscale(100%)";
                    const activeStyle = isCrafting ? "outline: 3px solid #ffeb3b; box-shadow: 0 0 0 2px rgba(255,235,59,0.35), 0 0 10px rgba(255,235,59,0.55); border-radius: 7px;" : "";
                    const name = formatRecipeName(rec.type);
                    const icon = this.getIngredientIcon(rec.type);
                    const needInfo = getRecipeNeedInfo(rec.type);

                    gridHtml += `
                        <button class="recipe-btn" data-uid="${rec.uid}" data-type="${rec.type}" onclick="window.UIManager.selectRecipe(event, '${rec.uid}', '${rec.type}')"
                                style="position: relative; width: 68px; min-height: 76px; padding: 3px 4px; border: 0; border-radius: 7px; background: ${isCrafting ? 'rgba(255,235,59,0.16)' : 'transparent'}; color: #fff; cursor: ${isUnlocked ? 'pointer' : 'not-allowed'}; opacity: ${opacity}; filter: ${filter}; text-align: center; font-family: inherit; box-sizing: border-box; ${activeStyle}"
                                ${isUnlocked ? '' : 'disabled'} title="${isUnlocked ? `${name}：${needInfo.label}` : '建築等級不足，尚未解鎖'}">
                            <div style="font-size: 12px; line-height: 14px; font-weight: 800; margin-bottom: 2px; height: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</div>
                            <div class="recipe-icon-frame" style="width: 40px; height: 40px; margin: 0 auto 3px; border: 2px solid ${isCrafting ? '#ffeb3b' : 'rgba(139,110,75,0.55)'}; border-radius: 6px; background: ${isCrafting ? 'rgba(255,235,59,0.14)' : 'rgba(255,255,255,0.05)'}; color: #e8e1d4; display: flex; align-items: center; justify-content: center; box-sizing: border-box; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);">
                                <div style="font-size: 24px; line-height: 1; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.4));">${icon}</div>
                            </div>
                            <div class="recipe-material-ratio" data-recipe-type="${rec.type}" style="font-size: 12px; line-height: 14px; font-weight: 900; color: #fff; text-shadow: 0 2px 3px rgba(0,0,0,0.65);">${needInfo.label}</div>
                        </button>
                    `;
                });
                gridHtml += `</section>`;
                gridHtml += `</div>`;
            }
        }
        gridHtml += `</div>`; // 結束指令按鈕格網 (action_button_grid)




        // --- 4. 判斷是否顯示指令列 ---
        const hasActions = gridHtml.includes('action-btn') || gridHtml.includes('warehouse-controls') || gridHtml.includes('recipe-btn');

        // --- 5. 最終組合 ---
        // 動態調整高度：沒有指令時高度自適應，有指令時使用配置的高度
        if (hasActions) {
            if (isProcessingPlant) {
                menu.style.height = "auto";
                menu.style.width = "620px";
                menu.style.minWidth = "620px";
                menu.style.maxWidth = "620px";
                menu.style.overflow = "visible";
            } else if (cfg.height) {
                menu.style.height = typeof cfg.height === 'number' ? `${cfg.height}px` : cfg.height;
                menu.style.overflow = "hidden";
            }
            // [修正] 確保寬度也重新套用，避免被其它邏輯誤改
            if (!isProcessingPlant) {
                if (cfg.width) menu.style.width = typeof cfg.width === 'number' ? `${cfg.width}px` : cfg.width;
                if (cfg.minWidth) menu.style.minWidth = typeof cfg.minWidth === 'number' ? `${cfg.minWidth}px` : cfg.minWidth;
            }
        } else {
            menu.style.height = "auto";
            menu.style.overflow = "visible";
            // 當內容少時，允許寬度彈性但仍維持最小寬度
            if (cfg.minWidth) menu.style.width = "auto";
        }

        const headerOff = hCfg.headerOffset || { x: 0, y: 0 };
        const gridOff = hCfg.actionGridOffset || { x: 0, y: 0 };

        // 組合內容
        if (hasActions && isProcessingPlant && !isConfirming) {
            menu.innerHTML = `
                <div style="width: 100%; display: flex; flex-direction: column; gap: 8px; overflow: visible;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                        <div style="flex: 1; min-width: 0;">${leftHeader}</div>
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0;">
                            ${rightHeader}
                            ${requirementHtml}
                        </div>
                    </div>
                    <div style="width: 100%; display: flex; flex-direction: column; gap: 8px;">
                        ${gridHtml}
                    </div>
                </div>
            `;
        } else if (hasActions) {
            menu.innerHTML = `
                <div style="height: 100%; width: 100%; display: flex; flex-direction: column; position: relative; overflow: visible;">
                    <!-- 上部：標頭區 (佔 50%) -->
                    <div style="height: 50%; width: 100%; display: flex; flex-direction: column; justify-content: flex-start; transform: translate(${headerOff.x}px, ${headerOff.y}px);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                            ${leftHeader}
                            <div style="display: flex; flex-direction: column; align-items: flex-end;">
                                ${rightHeader}
                                <div style="display: flex; flex-direction: column; align-items: flex-end; margin-top: 8px; gap: 4px;">
                                    ${requirementHtml}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 中部：分隔線 -->
                    <div style="position: absolute; left: -20px; top: 50%; width: calc(100% + 40px); height: 1.5px; background: rgba(255,255,255,0.15); transform: translateY(-50%); pointer-events: none; z-index: 1;"></div>

                    <!-- 下部：指令區 (佔 50%，內容垂直置中) -->
                    <div style="height: 50%; width: 100%; display: flex; align-items: center; justify-content: center; position: relative;">
                        ${gridHtml}
                    </div>
                </div>
            `;
        } else {
            // 沒有指令時：只顯示標頭，不顯示中線與下方空間
            menu.innerHTML = `
                <div style="width: 100%; transform: translate(${headerOff.x}px, ${headerOff.y}px);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                        ${leftHeader}
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                            ${rightHeader}
                            <div style="height: 32px; display: flex; align-items: center; margin-top: 8px;">
                                ${requirementHtml}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // 智慧隱藏選單
        if (!hasActions && !isConfirming && !rightHeader) {
            menu.style.display = "none";
        } else {
            menu.style.display = "flex";
            if (!cfg.anchor) {
                menu.style.left = "-9999px"; menu.style.top = "-9999px";
            }
        }

        const destroyBtn = document.getElementById("destroy_btn");
        if (destroyBtn) {
            const villageCount = GameEngine.state.mapEntities.filter(e => e.type1 === 'town_center' || e.type1 === 'village').length;
            const isLastVillage = (entity.type1 === 'town_center' || entity.type1 === 'village') && villageCount <= 1;
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
            const id = e.id || `${e.type1}_${e.x}_${e.y}`;
            return id === eid;
        });

        if (!ent) {
            console.error("找不到待銷毀的實體:", eid);
            return;
        }

        // 呼叫引擎執行銷毀
        GameEngine.destroyBuilding(ent);
    }

    static selectRecipe(event, recipeUid, recipeType) {
        if (event) event.stopPropagation();
        if (!this.activeMenuEntity) return;
        const activeId = this.activeMenuEntity.id || `${this.activeMenuEntity.type1}_${this.activeMenuEntity.x}_${this.activeMenuEntity.y}`;
        const targetEntity = GameEngine.state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === activeId) || this.activeMenuEntity;
        const recipes = SynthesisSystem.getBuildingRecipes(GameEngine.state, GameEngine, targetEntity) || [];
        // 優先使用 uid 匹配，若無則回退到 type 匹配
        const rec = recipes.find(r => r.uid === recipeUid) || recipes.find(r => r.type === recipeType);
        if (rec && rec.isUnlocked) {
            SynthesisSystem.setCraftingTarget(GameEngine.state, GameEngine, targetEntity, rec);
            this.activeMenuEntity = targetEntity;
            this.showContextMenu(targetEntity); // 點擊後刷新選單顯示高亮狀態
        }
    }

    static dismissWorkers(event) {
        if (event) event.stopPropagation();
        const ent = this.activeMenuEntity;
        if (!ent) return;

        const eid = ent.id || `${ent.type1}_${ent.x}_${ent.y}`;
        // 查找所有派駐在此建築的工人 (包含正在路上的與已經進入內部的)
        const workers = GameEngine.state.units.villagers.filter(v =>
            v.assignedWarehouseId === eid ||
            (v.factoryTarget && (v.factoryTarget.id || `${v.factoryTarget.type1}_${v.factoryTarget.x}_${v.factoryTarget.y}`) === eid)
        );

        workers.forEach(v => {
            v.assignedWarehouseId = null;
            v.factoryTarget = null;
            v.state = 'IDLE';
            v.visible = true; // 確保工人變回可見
            // 讓工人出現在建築周圍隨機位置
            const angle = Math.random() * Math.PI * 2;
            const dist = 40 + Math.random() * 40;
            v.x = ent.x + Math.cos(angle) * dist;
            v.y = ent.y + Math.sin(angle) * dist;
            v.idleTarget = null;
        });

        // 清除建築內部的派駐名單與目標人數
        if (ent.assignedWorkers) ent.assignedWorkers = [];
        ent.targetWorkerCount = 0;

        GameEngine.addLog(`[解散] 已將 ${ent.name || ent.type1} 的所有工人解散至週圍。`, 'SYSTEM');
        this.showContextMenu(ent); // 立即刷新 UI
    }

    static dismissWarehouseWorkers(event) {
        if (event) event.stopPropagation();
        const ent = this.activeWarehouseEntity;
        if (!ent) return;

        const previousMenuEntity = this.activeMenuEntity;
        this.activeMenuEntity = ent;
        this.dismissWorkers(null);
        this.activeMenuEntity = previousMenuEntity;
        this.renderWarehousePanel();
    }

    static adjustWarehousePanelWorkers(event, delta) {
        if (event) event.stopPropagation();
        const ent = this.activeWarehouseEntity;
        if (!ent) return;
        GameEngine.adjustWarehouseWorkers(ent, delta);
        this.renderWarehousePanel();
    }

    static adjustWorkers(event, delta) {
        if (event) event.stopPropagation();
        if (!this.activeMenuEntity) return;
        GameEngine.adjustWarehouseWorkers(this.activeMenuEntity, delta);
        // [修正] 調整後立即重新渲染選單，以反映最新的人數數值
        this.showContextMenu(this.activeMenuEntity);
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

        // 右上角關閉按鈕
        let html = `
            <div onclick="event.stopPropagation(); window.UIManager.toggleSettingsPanel()" 
                 style="position: absolute; top: 15px; right: 20px; width: 30px; height: 30px; 
                        display: flex; align-items: center; justify-content: center; 
                        cursor: pointer; color: #fbc02d; font-size: 28px; transition: all 0.2s; z-index: 10;"
                 onmouseover="this.style.transform='scale(1.2)'; this.style.color='#fff'" 
                 onmouseout="this.style.transform='scale(1)'; this.style.color='#fbc02d'">
                ×
            </div>
        `;

        html += `<div class="title" style="text-align:center; font-size: 20px; border-bottom: 2px solid #8b6e4b; margin-bottom: 20px; padding-bottom: 10px;">${cfg.title}</div>`;

        html += `<div style="display:flex; flex-direction:column; gap:16px; padding: 10px;">`;

        // 1. 地圖資源標籤顯示
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

            <div style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;" onclick="window.UIManager.updateSetting(event, 'rightClickDrag', !window.GAME_STATE.settings.rightClickDrag)">
                <span style="font-size: 16px; color: #e0e0e0; font-weight: 600;">右鍵拖動畫面的開關</span>
                <div class="setting-toggle ${settings.rightClickDrag ? 'active' : ''}" style="width: 54px; height: 26px; background: ${settings.rightClickDrag ? 'var(--aoe-gold)' : '#444'}; border-radius: 13px; position: relative; transition: all 0.3s; box-shadow: inset 0 2px 5px rgba(0,0,0,0.5);">
                    <div style="width: 20px; height: 20px; background: white; border-radius: 50%; position: absolute; top: 3px; ${settings.rightClickDrag ? 'right: 3px' : 'left: 3px'}; transition: all 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.4);"></div>
                </div>
            </div>
        `;

        html += `</div>`;

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

    static toggleWarehousePanel(entity = null) {
        const panel = document.getElementById("warehouse_panel");
        if (!panel) return;

        if (entity) {
            this.activeWarehouseEntity = entity;
        }

        if (panel.style.display === "none") {
            this.hideContextMenu(); // 先關閉其它選單
            this.hideSettingsPanel();
            
            const ent = this.activeWarehouseEntity;
            const customId = ent ? `warehouse_panel_${ent.id || `${ent.type1}_${ent.x}_${ent.y}`}` : "warehouse_panel_global";
            panel.dataset.dragId = customId;
            this.applyAnchorStyle(panel, UI_CONFIG.WarehousePanel, customId);

            this.renderWarehousePanel();
            panel.style.display = "flex";
            panel.style.flexDirection = "column";
        } else {
            panel.style.display = "none";
        }
    }

    // 倉庫系統狀態緩存
    static warehouseFilterValue = 1; // 1: 資源(Lv1), 2: 材料(Lv2+)
    static warehouseSortById = false;

    static setWarehouseFilter(lv) {
        this.warehouseFilterValue = lv;
        this.renderWarehousePanel();
    }

    static sortWarehouse() {
        this.warehouseSortById = !this.warehouseSortById; // 切換排序狀態
        this.renderWarehousePanel();
    }

    static getWarehouseAssignedWorkers(ent) {
        if (!ent || !GameEngine.state.units || !GameEngine.state.units.villagers) return [];
        const eid = ent.id || `${ent.type1}_${ent.x}_${ent.y}`;
        return GameEngine.state.units.villagers
            .filter(v => v.assignedWarehouseId === eid)
            .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    }

    static getWarehouseWorkerCooldown(worker) {
        if (!worker || !worker.logisticsWorkKey) return 0;
        const parts = String(worker.logisticsWorkKey).split('|');
        const type = parts[parts.length - 1];
        const total = this.getIngredientProductionTime(type, 1);
        if (!Number.isFinite(total) || total <= 0) return 0;
        return Math.max(0, Math.min(1, (worker.logisticsWorkTimer || 0) / total));
    }

    static getBuildingWorkerCooldown(worker) {
        if (!worker) return 0;
        if (worker.state === 'GATHERING') {
            const total = GameEngine.workerSystem && typeof GameEngine.workerSystem.getGatheringProductionTime === 'function'
                ? GameEngine.workerSystem.getGatheringProductionTime(worker)
                : 1;
            return total > 0 ? Math.max(0, Math.min(1, (worker.gatherTimer || 0) / total)) : 0;
        }
        return this.getWarehouseWorkerCooldown(worker);
    }

    static updateBuildingWorkerSlots() {
        const container = document.getElementById("context_menu");
        if (!container || !this.activeMenuEntity) return;
        const slots = container.querySelectorAll(".building-worker-slot");
        if (!slots.length) return;

        const eid = this.activeMenuEntity.id || `${this.activeMenuEntity.type1}_${this.activeMenuEntity.x}_${this.activeMenuEntity.y}`;
        const workers = GameEngine.state.units.villagers
            .filter(v => v.config && v.config.type === 'villagers' && v.assignedWarehouseId === eid)
            .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));

        slots.forEach((slot, index) => {
            const worker = workers[index];
            slot.dataset.workerId = worker ? worker.id : '';
            if (!worker) {
                slot.style.borderColor = 'rgba(255,255,255,0.16)';
                slot.style.background = 'rgba(0,0,0,0.28)';
                const face = slot.firstElementChild;
                if (face) {
                    face.textContent = '';
                    face.style.background = 'rgba(255,255,255,0.03)';
                }
                return;
            }

            const deg = Math.round(this.getBuildingWorkerCooldown(worker) * 360);
            slot.style.borderColor = '#c59a79';
            slot.style.background = `conic-gradient(rgba(50,240,106,0.75) ${deg}deg, rgba(255,255,255,0.08) ${deg}deg 360deg)`;
            const face = slot.firstElementChild;
            if (face) {
                face.textContent = '👨';
                face.style.background = '#5b3d31';
            }
        });
    }

    static renderWarehouseWorkerSlots(ent) {
        if (!ent) return '';
        const bCfg = GameEngine.getBuildingConfig(ent.type1, ent.lv || 1) || {};
        const workers = this.getWarehouseAssignedWorkers(ent);
        const targetCount = Math.max(ent.targetWorkerCount || 0, workers.length, bCfg.need_villagers || 5);
        const slotCount = Math.max(1, targetCount);
        const slots = [];

        for (let i = 0; i < slotCount; i++) {
            const worker = workers[i];
            const progress = worker ? this.getWarehouseWorkerCooldown(worker) : 0;
            const deg = Math.round(progress * 360);
            const face = worker ? '👨' : '';
            slots.push(`
                <div class="warehouse-worker-slot" data-worker-id="${worker ? worker.id : ''}" style="width: 27px; height: 27px; min-width: 27px; min-height: 27px; flex: 0 0 27px; aspect-ratio: 1 / 1; border-radius: 50%; border: 1.5px solid ${worker ? '#c59a79' : 'rgba(255,255,255,0.16)'}; background: ${worker ? `conic-gradient(rgba(50,240,106,0.75) ${deg}deg, rgba(255,255,255,0.08) ${deg}deg 360deg)` : 'rgba(0,0,0,0.28)'}; display: flex; align-items: center; justify-content: center; box-sizing: border-box; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 5px rgba(0,0,0,0.35);">
                    <div style="width: 20px; height: 20px; min-width: 20px; min-height: 20px; flex: 0 0 20px; aspect-ratio: 1 / 1; border-radius: 50%; background: ${worker ? '#5b3d31' : 'rgba(255,255,255,0.03)'}; display: flex; align-items: center; justify-content: center; color: #f6e2cf; font-size: 13px; line-height: 1;">
                        ${face}
                    </div>
                </div>
            `);
        }

        return `
            <div id="warehouse_worker_slots" style="display: flex; align-items: center; gap: 4px; min-height: 44px; padding: 8px 10px; margin-bottom: 10px; border: 1.5px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(0,0,0,0.26); box-sizing: border-box; overflow: hidden;">
                ${slots.join('')}
            </div>
        `;
    }

    static updateWarehouseWorkerSlots() {
        const container = document.getElementById("warehouse_worker_slots");
        if (!container || !this.activeWarehouseEntity) return;
        const workers = this.getWarehouseAssignedWorkers(this.activeWarehouseEntity);
        const workerMap = new Map(workers.map(worker => [worker.id, worker]));
        container.querySelectorAll(".warehouse-worker-slot").forEach(slot => {
            const worker = workerMap.get(slot.dataset.workerId);
            if (!worker) return;
            const deg = Math.round(this.getWarehouseWorkerCooldown(worker) * 360);
            slot.style.background = `conic-gradient(rgba(50,240,106,0.75) ${deg}deg, rgba(255,255,255,0.08) ${deg}deg 360deg)`;
        });
    }

    static renderWarehousePanel() {
        const panel = document.getElementById("warehouse_panel");
        if (!panel) return;
        const cfg = UI_CONFIG.WarehousePanel;
        const ent = this.activeWarehouseEntity;

        // 強制設置容器為 flex 佈局以支援內部高度自動填滿
        panel.style.display = "flex";
        panel.style.flexDirection = "column";
        panel.style.padding = "20px";
        panel.style.boxSizing = "border-box";

        // 右上角關閉按鈕
        let html = `
            <div onclick="event.stopPropagation(); window.UIManager.toggleWarehousePanel()" 
                 style="position: absolute; top: 15px; right: 20px; width: 30px; height: 30px; 
                        display: flex; align-items: center; justify-content: center; 
                        cursor: pointer; color: #fbc02d; font-size: 28px; transition: all 0.2s; z-index: 10;"
                 onmouseover="this.style.transform='scale(1.2)'; this.style.color='#fff'" 
                 onmouseout="this.style.transform='scale(1)'; this.style.color='#fbc02d'">
                ×
            </div>
        `;

        html += `<div class="title" style="text-align:center; font-size: 20px; border-bottom: 2px solid #8b6e4b; margin-bottom: 8px; padding-bottom: 10px; color: ${cfg.titleColor || '#fbc02d'};">${cfg.title}</div>`;

        html += `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px; gap: 10px; min-height: 30px;">
                <div style="display:flex; align-items:center; gap: 12px;">
                    ${ent ? `<button onclick="window.UIManager.dismissWarehouseWorkers(event)" 
                        style="padding: 5px 12px; border: 1px solid #b86b6b; border-radius: 4px; background: #5a1f1f; color: #fff1f1; cursor: pointer; transition: 0.2s; font-weight: bold;" title="解散這間倉庫的派駐工人">解散</button>
                    <button onclick="window.UIManager.adjustWarehousePanelWorkers(event, -1)"
                        style="width: 24px; height: 24px; border-radius: 50%; background: #5b3d31; border: 2px solid #c59a79; color: #f6e2cf; font-size: 16px; font-weight: 900; cursor: pointer; display:flex; align-items:center; justify-content:center; line-height:1; box-shadow: 0 2px 5px rgba(0,0,0,0.35);" title="減少 1 位派駐工人">－</button>` : ``}
                </div>
                <button onclick="window.UIManager.sortWarehouse(); event.stopPropagation();" 
                        style="padding: 5px 12px; border: 1px solid #6b5232; border-radius: 4px; background: ${this.warehouseSortById ? '#3a2b16' : '#221a10'}; color: #ddd; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 5px;" title="依 ID 排序">
                    <span style="font-size: 12px;">排序</span> ${this.warehouseSortById ? '↑' : '↓'}
                </button>
            </div>
        `;

        html += this.renderWarehouseWorkerSlots(ent);

        html += `<div style="display:flex; flex-wrap: wrap; gap:10px; padding: 15px; color: #e0e0e0; flex: 1; align-content: flex-start; justify-content: flex-start; background: rgba(0,0,0,0.3); border-radius: 8px; overflow-y: auto; margin-bottom: 5px;">`;

        const configs = { ...GameEngine.state.ingredientConfigs };
        const warehouseStorage = ent ? (ent.storage || {}) : {};
        // 確保 wood, stone, gold 有配置資料以供顯示
        ['wood', 'stone', 'gold'].forEach(resType => {
            if (!configs[resType]) {
                const baseId = resType === 'wood' ? 6 : (resType === 'stone' ? 7 : (resType === 'gold' ? 12 : 999));
                configs[resType] = { id: baseId, name: GameEngine.RESOURCE_NAMES[resType] || resType, icon: resType, type: resType, stack: 5000, lv: 1 };
            }
        });
        Object.keys(warehouseStorage || {}).forEach((resType, index) => {
            if ((warehouseStorage[resType] || 0) <= 0 || configs[resType]) return;
            configs[resType] = {
                id: 9000 + index,
                name: GameEngine.RESOURCE_NAMES[resType] || resType,
                icon: resType,
                type: resType,
                stack: 5000,
                lv: 1
            };
        });

        let itemsForTab = Object.values(configs).filter(c => {
            if (!c || !c.type) return false;
            const amount = warehouseStorage[c.type] || 0;
            // 顯示所有有庫存的項目，不再區分等級 (頁籤)
            return amount > 0;
        });

        if (this.warehouseSortById) {
            itemsForTab.sort((a, b) => a.id - b.id);
        }

        // 將資源按堆疊數拆分
        const stackedItems = [];
        itemsForTab.forEach(item => {
            let total = warehouseStorage[item.type] || 0;
            const stackLimit = item.stack || 1000;
            if (total <= 0) return;
            while (total > 0) {
                const current = Math.min(total, stackLimit);
                stackedItems.push({
                    ...item,
                    currentAmount: current,
                    isFull: current >= stackLimit
                });
                total -= current;
            }
        });

        if (stackedItems.length === 0) {
            html += `<div style="width:100%; text-align:center; padding: 40px; color: #666; font-size: 14px;">此分類目前無任何物品</div>`;
        } else {
            stackedItems.forEach(stack => {
                const amtColor = cfg.itemTextColor || '#fff';
                const displayIcon = this.getIngredientIcon(stack.type);



                // 適應 420px 寬度的 5 欄佈局
                html += `
                    <div style="position: relative; width: calc(20% - 8px); aspect-ratio: 1; min-width: 50px; background: rgba(255,255,255,0.05); border: 1px solid rgba(139,110,75,0.5); border-radius: 6px; display:flex; justify-content:center; align-items:center; overflow: hidden; cursor: default; transition: all 0.2s;" 
                         onmouseenter="this.style.background='rgba(255,255,255,0.1)'; this.style.borderColor='#fbc02d'; window.UIManager.showItemTooltip(event, '${stack.name}', '${stack.id}', '${stack.currentAmount}', '${stack.stack}')"
                         onmousemove="window.UIManager.moveItemTooltip(event)"
                         onmouseleave="this.style.background='rgba(255,255,255,0.05)'; this.style.borderColor='rgba(139,110,75,0.5)'; window.UIManager.hideItemTooltip()">
                        <div style="font-size: ${cfg.itemIconSize || 28}px; pointer-events: none;">${displayIcon}</div>
                        <div style="position: absolute; bottom: 2px; left: 0; right: 0; text-align: center; font-size: ${cfg.itemFontSize || 10}px; font-family: monospace; color: ${amtColor}; font-weight: bold; text-shadow: 1px 1px 1px #000; pointer-events: none;">
                            ${(cfg.useAbbreviation !== false && stack.currentAmount >= 1000) ? (stack.currentAmount / 1000).toFixed(1) + 'k' : stack.currentAmount}
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>`; // end grid

        panel.innerHTML = html;
    }

    static getItemTooltipEl() {
        let tip = document.getElementById("item_tooltip");
        if (!tip) {
            tip = document.createElement("div");
            tip.id = "item_tooltip";
            tip.style.cssText = "position:absolute; z-index:3000; display:none; pointer-events:none; background:rgba(12,12,12,0.96); color:#f5f5f5; border:2px solid #f5f5f5; padding:6px 9px; font-size:16px; line-height:1.35; white-space:nowrap; box-shadow:0 3px 8px rgba(0,0,0,0.55);";
            document.body.appendChild(tip);
        }
        return tip;
    }

    static showItemTooltip(event, name, id, amount, stack) {
        const tip = this.getItemTooltipEl();
        tip.innerHTML = `<div>${name} (ID:${id})</div><div>數量: ${amount} / ${stack}</div>`;
        tip.style.display = "block";
        this.moveItemTooltip(event);
    }

    static moveItemTooltip(event) {
        const tip = document.getElementById("item_tooltip");
        if (!tip || tip.style.display === "none") return;
        const margin = 12;
        const rect = tip.getBoundingClientRect();
        let left = event.clientX + margin;
        let top = event.clientY + margin;
        if (left + rect.width > window.innerWidth - 6) left = event.clientX - rect.width - margin;
        if (top + rect.height > window.innerHeight - 6) top = event.clientY - rect.height - margin;
        tip.style.left = `${Math.max(6, left)}px`;
        tip.style.top = `${Math.max(6, top)}px`;
    }

    static hideItemTooltip() {
        const tip = document.getElementById("item_tooltip");
        if (tip) tip.style.display = "none";
    }

    static hideWarehousePanel() {
        const panel = document.getElementById("warehouse_panel");
        if (panel) panel.style.display = "none";
    }

    static hideContextMenu() {
        this.activeMenuEntity = null;
        const menu = document.getElementById("context_menu");
        if (menu) menu.style.display = "none";
        const destroyBtn = document.getElementById("destroy_btn");
        if (destroyBtn) destroyBtn.style.display = "none";

        this.hideWarehousePanel(); // 關閉右鍵選單時順便把倉庫也關閉
        const lm = document.getElementById("logistics_menu"); if (lm) lm.style.display = "none";

        // 注意：這裡不再自動隱藏 settings_panel，避免 toggle 時發生衝突
    }

    static showLogisticsMenu(sourceEnt, targetId, mouseX, mouseY, lineId = null) {
        this.hideContextMenu();
        const connForLine = sourceEnt?.outputTargets?.find(t => t.id === targetId) || null;
        const groupId = connForLine?.lineId || null;
        const selectedSegment = lineId ? this.getLogisticsLineById(lineId) : (groupId ? this.getLogisticsLineById(groupId) : null);
        const selectedLineId = selectedSegment?.id || null;
        this.activeLogisticsConnection = { source: sourceEnt, targetId: targetId, lineId: selectedLineId, groupId };
        this.activeLogisticsLine = selectedSegment;
        GameEngine.state.selectedLogisticsLineId = selectedLineId;
        let menu = document.getElementById("logistics_menu");
        if (!menu) {
            menu = document.createElement("div"); menu.id = "logistics_menu"; menu.className = "panel glass-panel";
            menu.style.cssText = `position: absolute; z-index: 2000; padding: 15px; display: flex; flex-direction: column; gap: 10px; background: rgba(20,20,20,0.95); border: 2px solid #4caf50; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.8); pointer-events: auto;`;
            this.uiLayer.appendChild(menu);
        }
        let availableItems = [];
        const sourceCfg = GameEngine.getBuildingConfig(sourceEnt.type1, sourceEnt.lv || 1);
        const isProcessingPlantSource = sourceCfg && sourceCfg.type2 === 'processing_plant';
        const isGatheringSource = sourceCfg && (
            sourceCfg.type2 === 'gathering' ||
            ['timber_factory', 'tree_plantation', 'stone_factory', 'quarry', 'barn', 'farmland', 'gold_mining_factory'].includes(sourceEnt.type1)
        );
        if (isGatheringSource) {
            availableItems = this.getGatheringLogisticsItems(sourceEnt, sourceCfg);
        } else if (isProcessingPlantSource) {
            const recipes = typeof SynthesisSystem !== 'undefined'
                ? (SynthesisSystem.getBuildingRecipes(GameEngine.state, GameEngine, sourceEnt) || [])
                : [];
            availableItems = recipes.filter(r => r.isUnlocked).map(r => r.type);
            if (!sourceEnt.currentRecipe && !sourceEnt._missingRecipeFilterHintLogged) {
                GameEngine.addLog(`[物流] ${sourceEnt.name || sourceEnt.type1} 尚未設定加工廠生產線；物流線視窗只是在設定搬運品項，不是配方設定入口。`, 'LOGISTICS');
                sourceEnt._missingRecipeFilterHintLogged = true;
            }
        } else if (typeof SynthesisSystem !== 'undefined') {
            const recipes = SynthesisSystem.getBuildingRecipes(GameEngine.state, GameEngine, sourceEnt) || [];
            if (recipes.length > 0) availableItems = recipes.filter(r => r.isUnlocked).map(r => r.type);
        }
        if (!isProcessingPlantSource && availableItems.length === 0) {
            if (['storehouse', 'warehouse', 'village', 'town_center'].includes(sourceEnt.type1)) {
                const storage = sourceEnt.storage || {};
                availableItems = Object.keys(storage).filter(k => storage[k] > 0);
            } else {
                availableItems = Object.keys(GameEngine.state.resources).filter(k => GameEngine.state.resources[k] > 0);
            }
            if (sourceEnt.outputBuffer) availableItems = [...new Set([...availableItems, ...Object.keys(sourceEnt.outputBuffer)])];
        }
        availableItems = [...new Set(availableItems)];
        const conn = sourceEnt.outputTargets.find(t => t.id === targetId);
        if (conn && conn.filter && availableItems.length > 0 && !availableItems.includes(conn.filter)) {
            conn.filter = null;
            if (conn.lineId) {
                this.setLogisticsGroupFilter(conn.lineId, null);
            }
        }
        const currentFilter = conn ? conn.filter : null;
        const helperText = isProcessingPlantSource
            ? (sourceEnt.currentRecipe
                ? `這裡只控制這條物流線要搬什麼。目前加工廠生產線為：${GameEngine.RESOURCE_NAMES[sourceEnt.currentRecipe.type] || sourceEnt.currentRecipe.type}。`
                : `這裡只控制這條物流線要搬什麼。此加工廠尚未設定生產線，因此不應在這裡看到可量產成品。`)
            : '這裡只控制這條物流線要搬什麼，不會自動設定加工廠的生產線。未設定品項前，物流線不會通行。';
        let html = `<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 8px; margin-bottom: 5px; gap: 20px;"><span style="color: #4caf50; font-weight: bold; font-size: 15px;">設定此物流線搬運品項</span><button onclick="window.UIManager.deleteLogisticsLine(event)" style="background: #f44336; color: white; border: 1px solid #ff8a80; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-weight: bold; font-size: 12px;">刪除連線 ✖</button></div><div style="font-size: 12px; color: #c8e6c9; margin-bottom: 8px; line-height: 1.45;">${helperText}</div><div style="display: flex; flex-wrap: wrap; gap: 6px; max-width: 280px;">`;
        if (!currentFilter) {
            html += `<div style="width: 100%; color: #ffca28; font-size: 12px; font-weight: bold; margin-bottom: 2px;">尚未設定品項，物流線目前不通</div>`;
        }
        availableItems.forEach(item => {
            const cfg = GameEngine.state.ingredientConfigs ? GameEngine.state.ingredientConfigs[item] : null;
            const displayName = (cfg && cfg.name) ? cfg.name : (GameEngine.RESOURCE_NAMES[item] || item);
            html += `<button onclick="window.UIManager.setLogisticsFilter(event, '${item}')" style="padding: 6px 12px; background: ${currentFilter === item ? '#4caf50' : '#333'}; color: white; border: 1px solid #555; border-radius: 4px; cursor: pointer;">${displayName}</button>`;
        });
        menu.innerHTML = html + `</div>`; menu.style.display = "flex";
        menu.style.left = `${Math.min(mouseX + 15, window.innerWidth - 300)}px`; menu.style.top = `${Math.min(mouseY - 20, window.innerHeight - 200)}px`;
    }

    static showLogisticsLineMenu(line, mouseX, mouseY) {
        if (!line) return;
        this.hideContextMenu();
        this.activeLogisticsLine = line;
        this.activeLogisticsConnection = null;
        GameEngine.state.selectedLogisticsLineId = line.id;
        let menu = document.getElementById("logistics_menu");
        if (!menu) {
            menu = document.createElement("div"); menu.id = "logistics_menu"; menu.className = "panel glass-panel";
            menu.style.cssText = `position: absolute; z-index: 2000; padding: 15px; display: flex; flex-direction: column; gap: 10px; background: rgba(20,20,20,0.95); border: 2px solid #4caf50; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.8); pointer-events: auto;`;
            this.uiLayer.appendChild(menu);
        }
        menu.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 8px; margin-bottom: 5px; gap: 20px;"><span style="color: #4caf50; font-weight: bold; font-size: 15px;">物流線節點</span><button onclick="window.UIManager.deleteLogisticsLine(event)" style="background: #f44336; color: white; border: 1px solid #ff8a80; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-weight: bold; font-size: 12px;">刪除連線 ✖</button></div><div style="font-size: 12px; color: #c8e6c9; margin-bottom: 4px; line-height: 1.45;">此物流線已實體化，可被點擊、選取與刪除。地板終點可作為後續分段建造的節點。</div>`;
        menu.style.display = "flex";
        menu.style.left = `${Math.min(mouseX + 15, window.innerWidth - 300)}px`;
        menu.style.top = `${Math.min(mouseY - 20, window.innerHeight - 160)}px`;
    }

    static getGatheringLogisticsItems(sourceEnt, sourceCfg) {
        if (!sourceEnt) return [];
        const produce = (sourceCfg && sourceCfg.produce_resource) || {};
        const producedKeys = Object.keys(produce).map(k => String(k).toLowerCase()).filter(Boolean);
        if (producedKeys.length > 0) return producedKeys;

        const typeMap = {
            timber_factory: 'wood',
            tree_plantation: 'wood',
            stone_factory: 'stone',
            quarry: 'stone',
            barn: 'food',
            farmland: 'food',
            gold_mining_factory: 'gold_ore'
        };
        const mapped = typeMap[sourceEnt.type1];
        return mapped ? [mapped] : [];
    }

    static setLogisticsFilter(event, filterItem) {
        if (event) event.stopPropagation();
        if (this.activeLogisticsConnection) {
            const conn = this.activeLogisticsConnection.source.outputTargets.find(t => t.id === this.activeLogisticsConnection.targetId);
            if (conn) {
                conn.filter = filterItem;
                if (conn.lineId) {
                    this.setLogisticsGroupFilter(conn.lineId, filterItem);
                }
                const filterName = GameEngine.RESOURCE_NAMES[filterItem] || filterItem;
                GameEngine.addLog(`[物流] 路線搬運品項已更新：${filterName}。這只影響搬運，不會改變加工廠生產線。`, 'LOGISTICS');
            }
            const menu = document.getElementById('logistics_menu');
            if (menu) this.showLogisticsMenu(this.activeLogisticsConnection.source, this.activeLogisticsConnection.targetId, parseInt(menu.style.left) - 15, parseInt(menu.style.top) + 20);
        }
    }

    static deleteLogisticsLine(event) {
        if (event) event.stopPropagation();
        if (this.activeLogisticsConnection && !this.activeLogisticsConnection.groupId && this.activeLogisticsConnection.source) {
            this.activeLogisticsConnection.source.outputTargets = this.activeLogisticsConnection.source.outputTargets.filter(t => t.id !== this.activeLogisticsConnection.targetId);
            GameEngine.addLog(`[物流] 路線已刪除`, 'LOGISTICS');
        } else {
            this.deleteSelectedLogisticsLine();
        }
        const menu = document.getElementById("logistics_menu"); if (menu) menu.style.display = "none";
        this.activeLogisticsConnection = null;
        this.activeLogisticsLine = null;
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
        if (rb && state) {
            const labels = UI_CONFIG.ResourceBar.labels;
            const popCount = GameEngine.getCurrentPopulation ? GameEngine.getCurrentPopulation() : 0;
            const maxPop = GameEngine.getMaxPopulation ? GameEngine.getMaxPopulation() : 0;

            // 優先使用設定檔讀取的鍵值，若無或為空則回退至預設
            const initialKeys = (state.initialResourceKeys && state.initialResourceKeys.length > 0)
                ? state.initialResourceKeys
                : []; // 若無配置則不顯示，避免顯示死代碼 fallback

            // 構建比對字串，包含所有動態資源數值與人口
            const resValues = initialKeys.map(k => (res && res[k]) || 0);
            const stateStr = `${resValues.join('|')}|${popCount}|${maxPop}`;

            if (this.lastUIState.resources !== stateStr || forceUpdate) {
                let html = "";
                initialKeys.forEach(key => {
                    let label = "";
                    const cfg = state.ingredientConfigs ? state.ingredientConfigs[key] : null;
                    if (cfg) {
                        const icon = this.getIngredientIcon(key);
                        label = `${icon} ${cfg.name}：`;
                    } else {
                        label = (labels && labels[key]) || `${key}：`;
                    }

                    const val = (res && res[key]) || 0;
                    html += `<span>${label} ${val}</span>`;
                });

                // 最後加入人口顯示
                html += `<span title="人口上限" style="${popCount >= maxPop ? 'color: #ff5252' : ''}">👥 ${popCount} / ${maxPop}</span>`;

                rb.innerHTML = html;
                this.lastUIState.resources = stateStr;
            }
        }

        // 更新日誌
        this.updateLogPanel(forceUpdate);

        const warehousePanel = document.getElementById("warehouse_panel");
        if (warehousePanel && warehousePanel.style.display !== "none") {
            this.updateWarehouseWorkerSlots();
            const activeStorage = this.activeWarehouseEntity ? (this.activeWarehouseEntity.storage || {}) : {};
            const warehouseState = Object.keys(activeStorage || {})
                .sort()
                .map(key => `${key}:${activeStorage[key] || 0}`)
                .join("|") + `|workers:${this.activeWarehouseEntity ? this.getWarehouseAssignedWorkers(this.activeWarehouseEntity).map(v => v.id).join(',') : ''}`;
            if (this.lastUIState.warehouse !== warehouseState || forceUpdate) {
                this.lastUIState.warehouse = warehouseState;
                this.renderWarehousePanel();
            }
        }
    }

    static updateLogPanel(forceUpdate = false) {
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

        // 更新升級進度條
        const upgradeBar = document.getElementById("upgrade_progress_bar");
        const upgradeText = document.getElementById("upgrade_percentage_text");
        if (this.activeMenuEntity && this.activeMenuEntity.isUpgrading) {
            const rawProg = (this.activeMenuEntity.upgradeProgress || 0) * 100;
            if (upgradeBar) upgradeBar.style.width = `${rawProg}%`; // [修復] 使用浮點數以達成子像素級平滑
            if (upgradeText) upgradeText.innerText = `升級中... ${Math.floor(rawProg)}%`;
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
                        case 'BATTLE': colorAttr = ' style="color: #ff5252;"'; break;
                        case 'TASK': colorAttr = ' style="color: #4caf50;"'; break;
                        case 'GATHER': colorAttr = ' style="color: #8bc34a;"'; break;
                        case 'LOGISTICS': colorAttr = ' style="color: #81c784;"'; break;
                    }
                }

                const colorStyle = colorAttr ? (colorAttr.match(/style="([^"]*)"/)?.[1] || '') : '';
                return `<div style="${colorStyle} white-space: normal; overflow-wrap: anywhere; word-break: break-word; max-width: 100%; box-sizing: border-box;">> ${text}</div>`;
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

        // 更新加工廠配方即時狀態 (進度條 & 隊列數量)
        const factoryEnt = this.activeMenuEntity;
        if (factoryEnt && !factoryEnt.isUnderConstruction) {
            const menu = document.getElementById("context_menu");
            const cfg = GameEngine.getBuildingConfig(factoryEnt.type1, factoryEnt.lv || 1);
            if (menu && menu.style.display !== "none") {
                const stockpileValue = document.getElementById("building_stockpile_value");
                const stockpileIcon = document.getElementById("building_stockpile_icon");
                if (stockpileValue || stockpileIcon) {
                    const stockpileInfo = this.getBuildingStockpileInfo(factoryEnt, cfg);
                    if (stockpileInfo) {
                        const stockpileLabel = `${Math.floor(stockpileInfo.amount || 0)}${stockpileInfo.max ? ` / ${Math.floor(stockpileInfo.max)}` : ''}`;
                        if (stockpileValue) stockpileValue.textContent = stockpileLabel;
                        if (stockpileIcon) stockpileIcon.textContent = this.getIngredientIcon(stockpileInfo.type);
                    }
                }
            }
            if (menu && menu.style.display !== "none" && cfg && cfg.type2 === "processing_plant") {
                const factoryPanelState = [
                    factoryEnt.id || `${factoryEnt.type1}_${factoryEnt.x}_${factoryEnt.y}`,
                    factoryEnt.currentRecipe ? factoryEnt.currentRecipe.type : "none"
                ].join("::");

                if (this.lastUIState.factoryPanel !== factoryPanelState || forceUpdate) {
                    this.lastUIState.factoryPanel = factoryPanelState;
                    this.showContextMenu(factoryEnt, false);
                    return;
                }

                const workerLights = menu.querySelector(".factory-worker-lights");
                if (workerLights) {
                    const workerMax = Math.max(1, cfg.need_villagers || 5);
                    const workerCount = Math.max(0, Math.min(workerMax, new Set(factoryEnt.assignedWorkers || []).size));
                    const cells = workerLights.querySelectorAll(".factory-worker-light");
                    if (cells.length === workerMax) {
                        cells.forEach((cell, index) => {
                            cell.style.background = index < workerCount ? "#32f06a" : "rgba(120,130,138,0.55)";
                        });
                        workerLights.title = `建築內工人 ${workerCount} / ${workerMax}`;
                    }
                }

                const productionFill = menu.querySelector(".factory-production-fill");
                const productionText = menu.querySelector(".factory-production-text");
                const materialRatio = menu.querySelector(".factory-material-ratio");
                const outputStockpileIcon = menu.querySelector(".factory-output-stockpile-icon");
                const outputStockpileValue = menu.querySelector(".factory-output-stockpile-value");
                const outputStockpileBox = menu.querySelector(".factory-output-stockpile");
                const productionProgress = factoryEnt.currentRecipe ? Math.max(0, Math.min(1, factoryEnt.craftingProgress || 0)) : 0;
                if (productionFill) {
                    const lastProgress = parseFloat(productionFill.dataset.progress || "0");
                    if (productionProgress + 0.02 < lastProgress) {
                        productionFill.style.transition = "none";
                        productionFill.style.transform = "scaleX(0)";
                        productionFill.offsetHeight;
                        productionFill.style.transition = "transform 0.08s linear";
                    }
                    productionFill.dataset.progress = String(productionProgress);
                    productionFill.style.transform = `scaleX(${productionProgress})`;
                }
                if (productionText) {
                    productionText.textContent = this.formatProductionCountdown(factoryEnt);
                }
                if (materialRatio && factoryEnt.currentRecipe) {
                    const ingCfg = GameEngine.state.ingredientConfigs
                        ? GameEngine.state.ingredientConfigs[String(factoryEnt.currentRecipe.type || '').toLowerCase()]
                        : null;
                    const needs = ingCfg && ingCfg.need_ingredients ? ingCfg.need_ingredients : {};
                    const needKey = Object.keys(needs)[0];
                    materialRatio.textContent = needKey ? `${(factoryEnt.inputBuffer || {})[needKey] || 0} / ${needs[needKey] || 0}` : "0 / 0";
                }
                if (outputStockpileIcon || outputStockpileValue || outputStockpileBox) {
                    const outputStockpile = this.getFactoryOutputStockpileInfo(factoryEnt);
                    if (outputStockpile) {
                        if (outputStockpileIcon) outputStockpileIcon.textContent = this.getIngredientIcon(outputStockpile.type);
                        if (outputStockpileValue) outputStockpileValue.textContent = `${Math.floor(outputStockpile.amount || 0)}`;
                        if (outputStockpileBox) {
                            const ingCfg = GameEngine.state.ingredientConfigs
                                ? GameEngine.state.ingredientConfigs[String(outputStockpile.type || '').toLowerCase()]
                                : null;
                            outputStockpileBox.title = (ingCfg && ingCfg.name) || GameEngine.RESOURCE_NAMES[outputStockpile.type] || outputStockpile.type;
                        }
                    }
                }
                menu.querySelectorAll(".recipe-material-ratio").forEach(el => {
                    const recipeType = el.getAttribute("data-recipe-type");
                    const ingCfg = GameEngine.state.ingredientConfigs
                        ? GameEngine.state.ingredientConfigs[String(recipeType || '').toLowerCase()]
                        : null;
                    const needs = ingCfg && ingCfg.need_ingredients ? ingCfg.need_ingredients : {};
                    const needKey = Object.keys(needs)[0];
                    el.textContent = needKey ? `${(factoryEnt.inputBuffer || {})[needKey] || 0} / ${needs[needKey] || 0}` : "0 / 0";
                });
            }

            const recipeBtns = document.querySelectorAll(".recipe-btn");
            recipeBtns.forEach(btn => {
                const type = btn.getAttribute("data-type");
                const badge = btn.querySelector(".recipe-badge");
                const prog = btn.querySelector(".recipe-progress");
                if (!badge && !prog) return;

                // 1. 計算該配方的總數 (正在生產的 + 隊列中的)
                let count = 0;
                if (factoryEnt.currentRecipe && factoryEnt.currentRecipe.type === type) count++;
                if (factoryEnt.recipeQueue) {
                    count += factoryEnt.recipeQueue.filter(r => r && r.type === type).length;
                }

                if (badge) {
                    badge.innerText = count;
                    badge.style.display = count > 0 ? "flex" : "none";
                }

                // 2. 更新當前生產進度
                if (prog) {
                    const isCrafting = factoryEnt.currentRecipe && factoryEnt.currentRecipe.type === type;
                    if (isCrafting) {
                        const p = Math.min(100, (factoryEnt.craftingProgress || 0) * 100);
                        prog.style.width = `${p}%`;
                        prog.style.display = "block";
                    } else {
                        prog.style.width = "0%";
                        prog.style.display = "none";
                    }
                }

                // 3. 更新按鈕邊框高亮 (Active 狀態)
                const isCrafting = factoryEnt.currentRecipe && factoryEnt.currentRecipe.type === type;
                btn.style.background = isCrafting ? "rgba(255,235,59,0.16)" : "transparent";
                btn.style.outline = isCrafting ? "3px solid #ffeb3b" : "none";
                btn.style.boxShadow = isCrafting
                    ? "0 0 0 2px rgba(255,235,59,0.35), 0 0 10px rgba(255,235,59,0.55)"
                    : "none";
                const iconFrame = btn.querySelector(".recipe-icon-frame");
                if (iconFrame) {
                    iconFrame.style.border = isCrafting ? "2px solid #ffeb3b" : "2px solid rgba(139,110,75,0.55)";
                    iconFrame.style.background = isCrafting ? "rgba(255,235,59,0.14)" : "rgba(255,255,255,0.05)";
                    iconFrame.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.04)";
                }
            });
        }

        // 更新區域：倉庫自動化管理
        const countDisplay = document.querySelector(".count-display");
        const statusHint = document.querySelector(".status-hint");
        if (countDisplay && this.activeMenuEntity) {
            const ent = this.activeMenuEntity;
            const current = GameEngine.state.units.villagers.filter(v =>
                v.config && v.config.type === 'villagers' && v.config.camp === 'player' &&
                v.assignedWarehouseId === (ent.id || `${ent.type1}_${ent.x}_${ent.y}`)
            ).length;
            countDisplay.innerText = `${current} / ${ent.targetWorkerCount || 0}`;
            if (statusHint) statusHint.innerText = `派遣狀態`;
        }
        this.updateBuildingWorkerSlots();

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

            // [同步圖 4 需求] 更新銷毀按鈕位置到建築物右上角
            const dBtn = document.getElementById("destroy_btn");
            if (dBtn && dBtn.style.display !== 'none') {
                const fp = GameEngine.getFootprint(this.activeMenuEntity.type1);
                const uw = fp ? fp.uw : 1;
                const uh = fp ? fp.uh : 1;
                const halfW = (uw * GameEngine.TILE_SIZE) / 2;
                const halfH = (uh * GameEngine.TILE_SIZE) / 2;

                // sx, sy 是建築中心，回歸至模型右上角對齊
                dBtn.style.left = `${sx + halfW - 20}px`;
                dBtn.style.top = `${sy - halfH}px`;
            }
        }
    }
    /**
     * 相機快速回歸村莊中心
     */
    static panToTownCenter() {
        const tc = GameEngine.state.mapEntities.find(e => e.type1 === 'town_center' || e.type1 === 'village');
        if (!tc || !window.PhaserScene) return;

        const cam = window.PhaserScene.cameras.main;
        const centerX = cam.scrollX + cam.width / 2;
        const centerY = cam.scrollY + cam.height / 2;
        const dist = Math.hypot(tc.x - centerX, tc.y - centerY);
        const duration = Math.min(1500, Math.max(400, dist / 4));

        cam.pan(tc.x, tc.y, duration, 'Cubic.easeInOut');
        GameEngine.addLog(`相機移動至城鎮中心 (距離: ${Math.round(dist)}px)`);
    }
}




window.GameEngine = GameEngine;
window.UIManager = UIManager;


