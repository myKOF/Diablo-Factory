import { UI_CONFIG } from "./ui_config.js";
import { GameEngine } from "../systems/game_systems.js";
import { SynthesisSystem } from "../systems/SynthesisSystem.js";
import { conveyorSystem } from "../systems/ConveyorSystem.js";
import { WarehouseUI } from "./WarehouseUI.js";
import { LogisticsUI } from "./LogisticsUI.js";
import { BuildingMenuUI } from "./BuildingMenuUI.js";


/**
 * UI 管理器
 * 負責渲染介面並處理動態建築清單
 */
export class UIManager {
    static uiLayer;
    static dragGhost = null;
    
    static get logisticsSourceEntity() { return LogisticsUI.logisticsSourceEntity; }
    static set logisticsSourceEntity(val) { LogisticsUI.logisticsSourceEntity = val; }
    static get logisticsSourceLine() { return LogisticsUI.logisticsSourceLine; }
    static set logisticsSourceLine(val) { LogisticsUI.logisticsSourceLine = val; }
    static get activeLogisticsConnection() { return LogisticsUI.activeLogisticsConnection; }
    static set activeLogisticsConnection(val) { LogisticsUI.activeLogisticsConnection = val; }
    static get activeLogisticsLine() { return LogisticsUI.activeLogisticsLine; }
    static set activeLogisticsLine(val) { LogisticsUI.activeLogisticsLine = val; }
    static get isLogisticsDragging() { return LogisticsUI.isLogisticsDragging; }
    static set isLogisticsDragging(val) { LogisticsUI.isLogisticsDragging = val; }
    static get potentialLogisticsDrag() { return LogisticsUI.potentialLogisticsDrag; }
    static set potentialLogisticsDrag(val) { LogisticsUI.potentialLogisticsDrag = val; }
    
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
            if (e.button !== 0) return;
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

    static escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, ch => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[ch]);
    }

    static getRecipeConfig(type) {
        if (!type || !GameEngine.state.ingredientConfigs) return null;
        const key = String(type).trim().toLowerCase();
        return GameEngine.state.ingredientConfigs[key] || GameEngine.state.ingredientConfigs[type] || null;
    }

    static getIngredientDisplayName(type) {
        const cfg = this.getRecipeConfig(type);
        return (cfg && cfg.name) || GameEngine.RESOURCE_NAMES[type] || type || "未知材料";
    }

    static getRecipeNeeds(recipeType, inputBuffer = {}) {
        const ingCfg = this.getRecipeConfig(recipeType);
        const needs = ingCfg && ingCfg.need_ingredients ? ingCfg.need_ingredients : {};
        return Object.keys(needs).map(type => {
            const required = needs[type] || 0;
            const stored = inputBuffer[type] || 0;
            return {
                type,
                required,
                stored,
                progress: required > 0 ? Math.min(1, stored / required) : 0,
                label: `${stored} / ${required}`
            };
        });
    }

    static getFactoryWorkers(entity) {
        if (!entity) return [];
        const ids = new Set(entity.assignedWorkers || []);
        const eid = entity.id || `${entity.type1}_${entity.x}_${entity.y}`;
        return GameEngine.state.units.villagers
            .filter(v => ids.has(v.id) || v.assignedWarehouseId === eid)
            .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
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
        window.WarehouseUI = WarehouseUI;
        window.LogisticsUI = LogisticsUI;
        window.BuildingMenuUI = BuildingMenuUI;

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
                if (LogisticsUI.deleteSelectedLogisticsLine()) {
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
        const shortcutCfg = UI_CONFIG.ShortcutBar;
        if (shortcutCfg) {
            const shortcutBar = document.createElement("div");
            shortcutBar.className = "panel shortcut-bar";
            shortcutBar.id = "shortcut_bar";
            this.applyAnchorStyle(shortcutBar, shortcutCfg);
            shortcutBar.style.pointerEvents = "auto";
            const shortcutList = document.createElement("div");
            shortcutList.id = "shortcut_list";
            this.refreshShortcutBar(shortcutList, shortcutCfg);
            shortcutBar.appendChild(shortcutList);
            this.uiLayer.appendChild(shortcutBar);
        }

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

        // [新增] 暫停按鈕
        const pauseBtn = document.createElement("div");
        pauseBtn.id = "log_pause_btn";
        pauseBtn.innerHTML = "⏸️";
        pauseBtn.title = "暫停遊戲以查看日誌";
        pauseBtn.style.cssText = `
            position: absolute; top: 12px; right: 108px; width: 24px; height: 24px;
            background: ${this.hexToRgba(logCfg.bgColor, 0.95)}; border: 1.5px solid ${logCfg.borderColor};
            color: #fff; display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 13px; border-radius: 4px; transition: all 0.2s;
            z-index: 300; pointer-events: auto;
        `;
        pauseBtn.onclick = (e) => {
            e.stopPropagation();
            const scene = window.PhaserScene;
            if (!scene) return;
            if (GameEngine.state && GameEngine.state.isPaused) {
                scene.scene.resume();
                GameEngine.state.isPaused = false;
                pauseBtn.innerHTML = "⏸️";
                pauseBtn.title = "暫停遊戲以查看日誌";
                GameEngine.addLog("遊戲已恢復運行。");
            } else {
                scene.scene.pause();
                if (GameEngine.state) GameEngine.state.isPaused = true;
                pauseBtn.innerHTML = "▶️";
                pauseBtn.title = "恢復遊戲運行";
                GameEngine.addLog("遊戲已暫停。");
            }
        };
        pauseBtn.onmouseover = () => pauseBtn.style.background = logCfg.borderColor;
        pauseBtn.onmouseout = () => pauseBtn.style.background = this.hexToRgba(logCfg.bgColor, 0.95);
        logPanel.appendChild(pauseBtn);

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
                WarehouseUI.toggleWarehousePanel(this.activeWarehouseEntity);
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

    static getBuildingIcon(type) {
        const buildingIcons = {
            town_center: "🏰", village: "🏰", farmhouse: "🏠",
            timber_factory: "🪵", stone_factory: "⛏", barn: "🌾",
            farmland: "🌱", alchemy_lab: "⚗", cathedral: "✚", academy: "📚",
            tree_plantation: "🌲", mage_place: "✨", swordsman_place: "⚔", archer_place: "🏹",
            timber_processing_plant: "🪚", smelting_plant: "🔥", tank_workshop: "🛡", stone_processing_plant: "🧱",
            storehouse: "📦", transport_line: "➡"
        };
        return buildingIcons[type] || "🏗";
    }

    static getBuildConfigsByUiLocation(location, fallbackList = []) {
        const configs = GameEngine.state.buildingConfigs || {};
        const values = Object.values(configs).filter(cfg => cfg && Number(cfg.ui_location || 1) === location);
        if (values.length > 0) return values;
        return fallbackList.map(item => configs[item.id]).filter(Boolean);
    }

    static getCostText(cfg) {
        const costStr = [];
        for (let r in (cfg.costs || {})) {
            if (cfg.costs[r] > 0) costStr.push(`${this.getIngredientIcon(r)}${cfg.costs[r]}`);
        }
        return costStr.length > 0 ? costStr.join(" ") : "0";
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
        const uiLocatedConfigs = this.getBuildConfigsByUiLocation(1, []);
        if (uiLocatedConfigs.length > 0) {
            uiLocatedConfigs.forEach(cfg => {
                this.createBuildingBtn(container, bp, {
                    id: cfg.model,
                    name: cfg.name,
                    icon: this.getBuildingIcon(cfg.model),
                    desc: `${cfg.desc || ""}<br>成本 ${this.getCostText(cfg)}`
                });
            });
            return;
        }

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

    static refreshShortcutBar(container, bp) {
        container.innerHTML = "";
        const configs = GameEngine.state.buildingConfigs || {};
        if (Object.keys(configs).length === 0) {
            setTimeout(() => this.refreshShortcutBar(container, bp), 500);
            return;
        }

        this.getBuildConfigsByUiLocation(2, []).forEach(cfg => {
            this.createBuildingBtn(container, bp, {
                id: cfg.model,
                name: cfg.name,
                icon: this.getBuildingIcon(cfg.model),
                desc: `成本 ${this.getCostText(cfg)}`,
                countResource: cfg.model
            }, { compact: true });
        });
    }

    static createBuildingBtn(container, bp, item, options = {}) {
        const btn = document.createElement("div");
        btn.className = options.compact ? "building-item shortcut-item" : "building-item";
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
        icon.innerHTML = item.icon || ">";

        if (options.compact) {
            btn.title = `${item.name}\n${String(item.desc || "").replace(/<br>/g, "\n")}`;
            btn.style.padding = "0";
            btn.style.alignItems = "center";
            btn.style.justifyContent = "center";
            content.style.left = "4px";
            content.style.right = "4px";
            content.style.top = "42px";
            content.style.bottom = "4px";
            content.style.justifyContent = "center";
            const count = GameEngine.state.resources?.[item.countResource || item.id] || 0;
            content.innerHTML = `
                <div style="color: ${bp.textColor}; font-size: 10px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center;">${item.name}</div>
                <div class="shortcut-count" data-resource="${item.countResource || item.id}" style="color: ${bp.titleColor}; font-size: 11px; font-weight: 900; line-height: 1; text-align: center;">${count}</div>
            `;
            icon.style.left = "50%";
            icon.style.right = "auto";
            icon.style.top = "6px";
            icon.style.transform = "translateX(-50%)";
            icon.style.width = "32px";
            icon.style.height = "32px";
            icon.style.fontSize = "20px";
        }

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
        const cfg = GameEngine.state.buildingConfigs[type];
        if (cfg && cfg.type2 === 'transport_line') {
            GameEngine.state.activeTransportLineType = type;
        }
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
        GameEngine.state.activeTransportLineType = null;
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
        // [核心修復] 增加 1.5 倍網格以上的緩衝 (30px)，確保緊貼建築拉線時，相鄰的所有網格中心點都能被視為「內部」而免除碰撞
        const buffer = GameEngine.TILE_SIZE * 1.5;
        return worldX >= ent.x - fp.w / 2 - buffer && worldX <= ent.x + fp.w / 2 + buffer &&
            worldY >= ent.y - fp.h / 2 - buffer && worldY <= ent.y + fp.h / 2 + buffer;
    }

    /**
     * 獲取指定世界座標下的實體 (優先檢索建築)
     */
    static getEntityAtPoint(worldX, worldY) {
        // 優先從 mapEntities 中尋找
        const found = GameEngine.state.mapEntities.find(ent => this.isPointInsideEntity(ent, worldX, worldY));
        if (found) return found;

        // 次之從資源中尋找 (MapDataSystem)
        if (GameEngine.state.mapData) {
            const gx = Math.floor(worldX / GameEngine.TILE_SIZE);
            const gy = Math.floor(worldY / GameEngine.TILE_SIZE);
            const res = GameEngine.state.mapData.getResource(gx, gy);
            if (res && res.type !== 0) {
                return {
                    id: `res_${gx}_${gy}`,
                    type1: 'RESOURCE',
                    x: gx * GameEngine.TILE_SIZE + GameEngine.TILE_SIZE / 2,
                    y: gy * GameEngine.TILE_SIZE + GameEngine.TILE_SIZE / 2
                };
            }
        }
        return null;
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
            slot.slotIndex === port.slotIndex &&
            (!port.dir || slot.dir === port.dir)
        );
        if (matched) return matched;

        const refX = Number.isFinite(fallbackX) ? fallbackX : (Number.isFinite(port.x) ? port.x : ent.x);
        const refY = Number.isFinite(fallbackY) ? fallbackY : (Number.isFinite(port.y) ? port.y : ent.y);
        return this.getNearestPortSlot(ent, refX, refY) || port;
    }




    static isSelectedBuilding(ent) {
        if (!ent) return false;
        const id = this.getEntityId(ent);
        const selectedIds = GameEngine.state.selectedBuildingIds || [];
        return this.activeMenuEntity === ent ||
            GameEngine.state.selectedBuildingId === id ||
            selectedIds.includes(id);
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



    static cancelActiveConstructionPreview() {
        if (LogisticsUI.cancelLogisticsDrag()) return true;
        if (!GameEngine.state.placingType && GameEngine.state.buildingMode === 'NONE') return false;
        this.cancelBuildingMode();
        this.clearWorldSelectionMarquee();
        GameEngine.state.rightClickStartedInPlacementMode = false;
        GameEngine.state.suppressRightClickMoveUntil = Date.now() + 250;
        GameEngine.addLog(`[建造] 已取消建造預覽。`, 'SYSTEM');
        return true;
    }





    static handleWorldMouseDown(e) {
        if (e.target.closest("#ui_layer") && e.button !== 2) return;

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
            if (!this.isSelectedBuilding(ent)) return false;
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

        const clickedLine = conveyorSystem.getLogisticsLineAt(worldX, worldY);
        const isDoubleClick = (e.detail || 0) >= 2;
        if (LogisticsUI.isTransportLinePlacementActive() && GameEngine.state.buildingMode === 'STAMP') {
            LogisticsUI.beginTransportLineBuildDrag(worldX, worldY, clickedLine || null);
            conveyorSystem.updateDrag(worldX, worldY);
            return;
        }
        if (clickedLine && !isDoubleClick && conveyorSystem.isSelectedLogisticsLine(clickedLine) && GameEngine.state.buildingMode === 'NONE') {
            LogisticsUI.beginLogisticsDragFromLine(clickedLine, worldX, worldY);
            return;
        }

        const state = GameEngine.state;
        if (state.buildingMode === 'STAMP' && !LogisticsUI.isTransportLinePlacementActive()) {
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
                if (LogisticsUI.beginLogisticsDragFromBuilding(pending.entity, pending.sourcePort)) {
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
        if (LogisticsUI.isTransportLinePlacementActive()) {
            state.previewPos = null;
            state.linePreviewEntities = [];
            return;
        }

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
            if (LogisticsUI.cancelLogisticsDrag()) {
                GameEngine.state.rightClickStartedInPlacementMode = false;
                GameEngine.state.suppressRightClickMoveUntil = Date.now() + 250;
                if (typeof e.preventDefault === "function") e.preventDefault();
                if (typeof e.stopPropagation === "function") e.stopPropagation();
                this.rightMouseDownPos = null;
                return;
            }
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
            if (!LogisticsUI.isTransportLinePlacementActive() && state.lineStartPos && (Math.abs(pos.x - state.lineStartPos.x) > 10 || Math.abs(pos.y - state.lineStartPos.y) > 10)) {
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
        const logisticsMenuEl = document.getElementById("logistics_menu");
        const distBtnEl = document.getElementById("destroy_btn");
        const warehousePanelEl = document.getElementById("warehouse_panel");
        const warehouseBtnEl = document.getElementById("warehouse_btn");
        const isSelfUI = (menuEl && menuEl.contains(e.target)) ||
            (logisticsMenuEl && logisticsMenuEl.contains(e.target)) ||
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
                WarehouseUI.hideWarehousePanel();
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
            if (LogisticsUI.isTransportLinePlacementActive()) {
                GameEngine.addLog(`[物流線] 至少需要向任一方向拖曳 2 格才能建造。`, 'LOGISTICS');
                return;
            }
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
            GameEngine.state.selectedLogisticsGroupId = null;
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
                    WarehouseUI.toggleWarehousePanel(clicked);
                }
            } else {
                this.showContextMenu(clicked);
            }
            return;
        }

        // [物流線實體] 點擊優先級低於建築，高於地板。
        const clickedLine = conveyorSystem.getLogisticsLineAt(worldX, worldY);
        if (clickedLine) {
            const now = Date.now();
            const groupId = clickedLine.groupId || clickedLine.id;
            const isDoubleClick = (e.detail || 0) >= 2
                || (GameEngine.state.lastSelectedLogisticsGroupId === groupId && (now - GameEngine.state.lastSelectionTime < 500));
            GameEngine.state.selectedUnitIds = [];
            GameEngine.state.selectedBuildingIds = [];
            GameEngine.state.selectedBuildingId = null;
            GameEngine.state.selectedResourceId = null;
            LogisticsUI.selectLogisticsLine(clickedLine, isDoubleClick);
            GameEngine.state.lastSelectionTime = now;
            GameEngine.state.lastSelectedLogisticsGroupId = groupId;
            if (isDoubleClick) {
                const groupCount = conveyorSystem.getLogisticsSegmentsByGroupId(groupId).length;
                GameEngine.addLog(`[物流] 已選取同群組物流線 ${groupCount} 段。`, 'LOGISTICS');
            }
            const source = GameEngine.state.mapEntities.find(ent => this.getEntityId(ent) === clickedLine.sourceId);
            if (source && clickedLine.targetId) {
                LogisticsUI.showLogisticsMenu(source, clickedLine.targetId, e.clientX, e.clientY, conveyorSystem.getLogisticsLineSelectionKey(clickedLine));
            } else {
                LogisticsUI.showLogisticsLineMenu(clickedLine, e.clientX, e.clientY);
            }
            return;
        }

        // 點擊地面
        GameEngine.state.selectedBuildingIds = [];
        GameEngine.state.selectedBuildingId = null;
        GameEngine.state.selectedLogisticsLineId = null;
        GameEngine.state.selectedLogisticsGroupId = null;
        this.activeLogisticsConnection = null;
        this.activeLogisticsLine = null;
    }


    static showContextMenu(entity, isConfirming = false, preservePosition = false) { return BuildingMenuUI.showContextMenu(entity, isConfirming, preservePosition); }
    static confirmDestroy(event) { return BuildingMenuUI.confirmDestroy(event); }
    static cancelDestroy(event) { return BuildingMenuUI.cancelDestroy(event); }
    static actualDestroy(event, eid) { return BuildingMenuUI.actualDestroy(event, eid); }
    static selectRecipe(event, recipeUid, recipeType) { return BuildingMenuUI.selectRecipe(event, recipeUid, recipeType); }
    static clearFactoryProduct(event) { return BuildingMenuUI.clearFactoryProduct(event); }
    static dismissWorkers(event) { return BuildingMenuUI.dismissWorkers(event); }
    static adjustWorkers(event, delta) { return BuildingMenuUI.adjustWorkers(event, delta); }
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



    static getBuildingWorkerCooldown(worker) { return BuildingMenuUI.getBuildingWorkerCooldown(worker); }
    static updateBuildingWorkerSlots() { return BuildingMenuUI.updateBuildingWorkerSlots(); }

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



    static getLogisticsTooltipEl() { return LogisticsUI.getLogisticsTooltipEl(); }
    static showLogisticsTooltip(event, text) { LogisticsUI.showLogisticsTooltip(event, text); }
    static moveLogisticsTooltip(event) { LogisticsUI.moveLogisticsTooltip(event); }
    static hideLogisticsTooltip() { LogisticsUI.hideLogisticsTooltip(); }

    static hideWarehousePanel() { WarehouseUI.hideWarehousePanel(); }

    static hideContextMenu() {
        this.activeMenuEntity = null;
        const menu = document.getElementById("context_menu");
        if (menu) menu.style.display = "none";
        const destroyBtn = document.getElementById("destroy_btn");
        if (destroyBtn) destroyBtn.style.display = "none";

        WarehouseUI.hideWarehousePanel(); // 關閉右鍵選單時順便把倉庫也關閉
        const lm = document.getElementById("logistics_menu"); if (lm) lm.style.display = "none";

        // 注意：這裡不再自動隱藏 settings_panel，避免 toggle 時發生衝突
    }

    static updateValues(forceUpdate = false) {
        const state = GameEngine.state;
        const res = state.resources;


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

        document.querySelectorAll(".shortcut-count[data-resource]").forEach(el => {
            const key = el.getAttribute("data-resource");
            const nextValue = (res && key) ? (res[key] || 0) : 0;
            const text = String(nextValue);
            if (el.textContent !== text || forceUpdate) el.textContent = text;
        });

        const warehousePanel = document.getElementById("warehouse_panel");
        if (warehousePanel && warehousePanel.style.display !== "none") {
            WarehouseUI.updateWarehouseWorkerSlots();
            const activeStorage = this.activeWarehouseEntity ? (this.activeWarehouseEntity.storage || {}) : {};
            const warehouseState = Object.keys(activeStorage || {})
                .sort()
                .map(key => `${key}:${activeStorage[key] || 0}`)
                .join("|") + `|workers:${this.activeWarehouseEntity ? WarehouseUI.getWarehouseAssignedWorkers(this.activeWarehouseEntity).map(v => v.id).join(',') : ''}`;
            if (this.lastUIState.warehouse !== warehouseState || forceUpdate) {
                this.lastUIState.warehouse = warehouseState;
                WarehouseUI.renderWarehousePanel();
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
                    this.showContextMenu(factoryEnt, false, true);
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

                const productionFill = null;
                const productionText = menu.querySelector(".factory-countdown-text");
                const materialRatio = menu.querySelector(".factory-material-ratio");
                const outputStockpileIcon = menu.querySelector(".factory-output-stockpile-icon");
                const outputStockpileValue = menu.querySelector(".factory-output-stockpile-value");
                const outputStockpileBox = menu.querySelector(".factory-output-stockpile");
                const productionProgress = factoryEnt.currentRecipe ? Math.max(0, Math.min(1, factoryEnt.craftingProgress || 0)) : 0;
                const currentIcon = menu.querySelector(".factory-current-icon");
                if (currentIcon) {
                    currentIcon.style.setProperty("--remain-deg", `${Math.round((1 - productionProgress) * 360)}deg`);
                }
                const factoryWorkers = this.getFactoryWorkers(factoryEnt);
                const workerDots = menu.querySelectorAll(".factory-worker-dot");
                if (workerDots.length > 0) {
                    workerDots.forEach((dot, index) => {
                        dot.classList.toggle("active", index < factoryWorkers.length);
                    });
                }
                const workerCount = menu.querySelector(".factory-worker-count");
                if (workerCount) {
                    const workerMax = Math.max(1, cfg.need_villagers || 5);
                    workerCount.textContent = `${Math.min(workerMax, factoryWorkers.length)}/${workerMax}`;
                }
                const efficiency = menu.querySelector(".factory-efficiency");
                if (efficiency) {
                    const workerMax = Math.max(1, cfg.need_villagers || 5);
                    efficiency.textContent = `效率：${Math.round((Math.min(workerMax, factoryWorkers.length) / workerMax) * 100)}%`;
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
                    const progFill = prog.querySelector("span") || prog;
                    if (isCrafting) {
                        const p = Math.min(100, (factoryEnt.craftingProgress || 0) * 100);
                        progFill.style.width = `${p}%`;
                        prog.style.display = "block";
                    } else {
                        progFill.style.width = "0%";
                        prog.style.display = "block";
                    }
                }

                // 3. 更新按鈕邊框高亮 (Active 狀態)
                const isCrafting = factoryEnt.currentRecipe && factoryEnt.currentRecipe.type === type;
                btn.classList.toggle("is-active", !!isCrafting);
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
            const activeCfg = GameEngine.getBuildingConfig(this.activeMenuEntity.type1, this.activeMenuEntity.lv || 1);
            const isProcessingPlantMenu = !!(activeCfg && activeCfg.type2 === "processing_plant");
            // Phaser 的 scrollX 表示畫面往右移，所以在螢幕空間中：螢幕座標 = 世界座標 - scrollX
            const cam = scene ? { x: scene.cameras.main.scrollX, y: scene.cameras.main.scrollY } : { x: 0, y: 0 };
            const cfg = UI_CONFIG.ActionMenu;

            // 基礎螢幕位置 (虛擬 1920x1080 空間)
            let sx = this.activeMenuEntity.x - cam.x;
            let sy = this.activeMenuEntity.y - cam.y;

            // 取得選單寬高 (由於在縮放內部，這裡得到的 offsetWidth 也是虛擬像素)
            const menuWidth = menu.offsetWidth || cfg.width || 380;
            const menuHeight = menu.offsetHeight || cfg.height || 95;
            const factoryScale = isProcessingPlantMenu ? 0.75 : 1;
            const visualMenuWidth = menuWidth * factoryScale;
            const visualMenuHeight = menuHeight * factoryScale;

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
                if (finalX + visualMenuWidth > virtualWidth - 20) {
                    finalX = sx - visualMenuWidth - (cfg.offsetX || 15);
                }

                // 2. 垂直檢查：一般選單底部超出才翻到上方
                // 加工廠選單固定同一側，避免清除/重選產品時因高度變化跳位
                if (!isProcessingPlantMenu && finalY + visualMenuHeight > virtualHeight - 20) {
                    finalY = sy - menuHeight - (cfg.offsetY || 100);
                }

                // 3. 全域安全區域確保 (防止跑出 1920x1080 範圍)
                finalX = Math.max(20, Math.min(finalX, virtualWidth - visualMenuWidth - 20));
                finalY = Math.max(20, Math.min(finalY, virtualHeight - visualMenuHeight - 20));

                menu.style.left = `${finalX}px`;
                menu.style.top = `${finalY}px`;
            }

            // [同步圖 4 需求] 更新銷毀按鈕位置到建築物右上角
            const dBtn = document.getElementById("destroy_btn");
            if (dBtn && dBtn.style.display !== 'none') {
                const camMain = scene && scene.cameras && scene.cameras.main;
                const fp = GameEngine.getFootprint(this.activeMenuEntity.type1);
                const uw = fp ? fp.uw : 1;
                const uh = fp ? fp.uh : 1;
                const halfW = (uw * GameEngine.TILE_SIZE) / 2;
                const halfH = (uh * GameEngine.TILE_SIZE) / 2;

                // sx, sy 是建築中心，回歸至模型右上角對齊
                const zoom = camMain ? (camMain.zoom || 1) : 1;
                const worldX = camMain ? camMain.scrollX + (camMain.width * (1 - 1 / zoom)) / 2 : cam.x;
                const worldY = camMain ? camMain.scrollY + (camMain.height * (1 - 1 / zoom)) / 2 : cam.y;
                const cornerX = (this.activeMenuEntity.x + halfW - worldX) * zoom;
                const cornerY = (this.activeMenuEntity.y - halfH - worldY) * zoom;
                const btnW = dBtn.offsetWidth || 18;
                dBtn.style.left = `${cornerX - btnW}px`;
                dBtn.style.top = `${cornerY}px`;
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
window.BuildingMenuUI = BuildingMenuUI;
window.WarehouseUI = WarehouseUI;
window.LogisticsUI = LogisticsUI;


