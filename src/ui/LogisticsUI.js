import { UI_CONFIG } from "./ui_config.js";
import { GameEngine } from "../systems/game_systems.js";
import { conveyorSystem } from "../systems/ConveyorSystem.js";
import { SynthesisSystem } from "../systems/SynthesisSystem.js";

export class LogisticsUI {
    static logisticsSourceEntity = null;
    static logisticsSourceLine = null;
    static activeLogisticsConnection = null;
    static activeLogisticsLine = null;
    static isLogisticsDragging = false;
    static potentialLogisticsDrag = null;

    static getLogisticsTooltipEl() {
        let tip = document.getElementById("logistics_tooltip");
        if (!tip) {
            tip = document.createElement("div");
            tip.id = "logistics_tooltip";
            tip.style.cssText = "position:absolute; z-index:3000; display:none; pointer-events:none; background:rgba(12,12,12,0.96); color:#f5f5f5; border:2px solid #f5f5f5; padding:6px 9px; font-size:16px; line-height:1.35; white-space:nowrap; box-shadow:0 3px 8px rgba(0,0,0,0.55);";
            document.body.appendChild(tip);
        }
        return tip;
    }

    static showLogisticsTooltip(event, text) {
        const tip = LogisticsUI.getLogisticsTooltipEl();
        tip.innerHTML = `<div>${text}</div>`;
        tip.style.display = "block";
        LogisticsUI.moveLogisticsTooltip(event);
    }

    static moveLogisticsTooltip(event) {
        const tip = document.getElementById("logistics_tooltip");
        if (!tip || tip.style.display === "none") return;
        const margin = 12;
        const rect = tip.getBoundingClientRect();
        
        // 優先顯示於游標左上角
        let left = event.clientX - rect.width - margin;
        let top = event.clientY - rect.height - margin;
        
        // 如果左邊超出界面，改為顯示在游標右側
        if (left < 6) {
            left = event.clientX + margin;
        }
        // 如果右邊也超出界面，強制靠右對齊
        if (left + rect.width > window.innerWidth - 6) {
            left = window.innerWidth - rect.width - 6;
        }
        
        // 如果上方超出界面，改為顯示在游標下方
        if (top < 6) {
            top = event.clientY + margin;
        }
        // 如果下方也超出界面，強制靠下對齊
        if (top + rect.height > window.innerHeight - 6) {
            top = window.innerHeight - rect.height - 6;
        }
        
        tip.style.left = `${Math.max(6, left)}px`;
        tip.style.top = `${Math.max(6, top)}px`;
    }

    static hideLogisticsTooltip() {
        const tip = document.getElementById("logistics_tooltip");
        if (tip) tip.style.display = "none";
    }

    static showLogisticsMenu(sourceEnt, targetId, mouseX, mouseY, lineId = null) {
        window.UIManager.hideContextMenu();
        if (!sourceEnt) return;
        const outputTargets = Array.isArray(sourceEnt?.outputTargets) ? sourceEnt.outputTargets : [];
        const connForLine = outputTargets.find(t => t.id === targetId) || null;
        const hintedSegment = lineId ? conveyorSystem.getLogisticsLineById(lineId) : null;
        const groupId = connForLine?.lineId || hintedSegment?.groupId || null;
        const selectedSegment = lineId ? conveyorSystem.getLogisticsLineById(lineId) : (groupId ? conveyorSystem.getLogisticsLineById(groupId) : null);
        const selectedLineId = selectedSegment ? conveyorSystem.getLogisticsLineSelectionKey(selectedSegment) : null;
        LogisticsUI.activeLogisticsConnection = { source: sourceEnt, targetId: targetId, lineId: selectedLineId, groupId };
        LogisticsUI.activeLogisticsLine = selectedSegment;
        GameEngine.state.selectedLogisticsLineId = selectedLineId;
        let menu = document.getElementById("logistics_menu");
        if (!menu) {
            menu = document.createElement("div"); menu.id = "logistics_menu"; menu.className = "panel glass-panel";
            menu.style.cssText = `position: absolute; z-index: 2000; padding: 15px; display: flex; flex-direction: column; gap: 10px; background: rgba(20,20,20,0.95); border: 2px solid #4caf50; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.8); pointer-events: auto;`;
            window.UIManager.uiLayer.appendChild(menu);
            window.UIManager.makeDraggable(menu, "logistics_menu");
        }
        menu.dataset.dragId = `logistics_menu_${groupId || targetId || "standalone"}`;
        let availableItems = [];
        const sourceCfg = GameEngine.getBuildingConfig(sourceEnt.type1, sourceEnt.lv || 1);
        const isProcessingPlantSource = sourceCfg && sourceCfg.type2 === 'processing_plant';
        const isGatheringSource = sourceCfg && (
            sourceCfg.type2 === 'gathering' ||
            ['timber_factory', 'tree_plantation', 'stone_factory', 'quarry', 'barn', 'farmland', 'gold_mining_factory'].includes(sourceEnt.type1)
        );
        if (isGatheringSource) {
            availableItems = LogisticsUI.getGatheringLogisticsItems(sourceEnt, sourceCfg);
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
        const conn = outputTargets.find(t => t.id === targetId) || null;
        if (conn && conn.filter && availableItems.length > 0 && !availableItems.includes(conn.filter)) {
            conn.filter = null;
            if (conn.lineId) {
                conveyorSystem.setLogisticsGroupFilter(conn.lineId, null);
            }
        }
        const currentFilter = conn ? conn.filter : (selectedSegment?.filter || null);
        const helperText = isProcessingPlantSource
            ? (sourceEnt.currentRecipe
                ? `此物流線已實體化。選擇材料後，工人會自動運輸；目前生產線為 ${window.UIManager.escapeHtml(window.UIManager.getIngredientDisplayName(sourceEnt.currentRecipe.type))}。`
                : `此物流線已實體化。請先在生產界面設定主要材料，再選擇要自動運輸的材料。`)
            : '此物流線已實體化，可被點擊、選取與刪除。設定材料後，派駐工人會自動開始運輸。';
        let html = `
            <div class="logistics-node-menu">
                <div class="logistics-node-header">
                    <div>
                        <div class="logistics-node-title">物流線節點</div>
                        <div class="logistics-node-status">${currentFilter ? `自動運輸：${window.UIManager.escapeHtml(window.UIManager.getIngredientDisplayName(currentFilter))}` : '尚未設定運輸材料'}</div>
                    </div>
                    <button class="logistics-delete-btn" onclick="window.LogisticsUI.deleteLogisticsLine(event)">刪除連線 ✖</button>
                </div>
                <div class="logistics-node-help">${helperText}</div>
                <div class="logistics-filter-title">自動運輸材料</div>
                <div class="logistics-filter-list">
        `;
        if (!currentFilter) {
            html += `<div class="logistics-empty-note">選擇一種材料後會立刻開始自動運輸。</div>`;
        }
        availableItems.forEach(item => {
            const cfg = GameEngine.state.ingredientConfigs ? GameEngine.state.ingredientConfigs[item] : null;
            const displayName = (cfg && cfg.name) ? cfg.name : (GameEngine.RESOURCE_NAMES[item] || item);
            html += `
                <button class="logistics-filter-btn ${currentFilter === item ? 'is-active' : ''}" onclick="window.LogisticsUI.setLogisticsFilter(event, '${item}')">
                    <span>${window.UIManager.getIngredientIcon(item)}</span>
                    <strong>${window.UIManager.escapeHtml(displayName)}</strong>
                </button>
            `;
        });
        if (availableItems.length === 0) {
            html += `<div class="logistics-empty-note">目前沒有可運輸材料。</div>`;
        }
        menu.innerHTML = html + `</div></div>`;
        menu.style.display = "flex";
        const savedPos = window.UIManager.uiPositions?.[menu.dataset.dragId];
        if (savedPos) {
            menu.style.left = savedPos.left;
            menu.style.top = savedPos.top;
        } else {
            const menuWidth = menu.offsetWidth || 420;
            const menuHeight = menu.offsetHeight || 220;
            const rightPadding = 24;
            const x = Math.max(16, window.innerWidth - menuWidth - rightPadding);
            const y = Math.max(16, Math.round((window.innerHeight - menuHeight) / 2));
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;
        }
        menu.style.right = "auto";
        menu.style.bottom = "auto";
        menu.style.transform = "none";
        menu.style.margin = "0";
    }

    static showLogisticsLineMenu(line, mouseX, mouseY) {
        if (!line) return;
        const sourceEnt = conveyorSystem.getLogisticsLineSourceEntity(line);
        if (sourceEnt) {
            LogisticsUI.showLogisticsMenu(sourceEnt, line.targetId || null, mouseX, mouseY, line.id);
            return;
        }
        window.UIManager.hideContextMenu();
        LogisticsUI.activeLogisticsLine = line;
        LogisticsUI.activeLogisticsConnection = null;
        GameEngine.state.selectedLogisticsLineId = conveyorSystem.getLogisticsLineSelectionKey(line);
        let menu = document.getElementById("logistics_menu");
        if (!menu) {
            menu = document.createElement("div"); menu.id = "logistics_menu"; menu.className = "panel glass-panel";
            menu.style.cssText = `position: absolute; z-index: 2000; padding: 15px; display: flex; flex-direction: column; gap: 10px; background: rgba(20,20,20,0.95); border: 2px solid #4caf50; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.8); pointer-events: auto;`;
            window.UIManager.uiLayer.appendChild(menu);
            window.UIManager.makeDraggable(menu, "logistics_menu");
        }
        menu.dataset.dragId = `logistics_menu_${line.groupId || line.id || "standalone"}`;
        menu.innerHTML = `
            <div class="logistics-node-menu">
                <div class="logistics-node-header">
                    <div>
                        <div class="logistics-node-title">物流線節點</div>
                        <div class="logistics-node-status">已選取線段</div>
                    </div>
                    <button class="logistics-delete-btn" onclick="window.LogisticsUI.deleteLogisticsLine(event)">刪除連線 ✖</button>
                </div>
                <div class="logistics-node-help">此物流線已實體化，可被點擊、選取與刪除。地板終點可作為後續分段建造的節點。</div>
            </div>
        `;
        menu.style.display = "flex";
        const savedPos = window.UIManager.uiPositions?.[menu.dataset.dragId];
        if (savedPos) {
            menu.style.left = savedPos.left;
            menu.style.top = savedPos.top;
        } else {
            const menuWidth = menu.offsetWidth || 420;
            const menuHeight = menu.offsetHeight || 180;
            const rightPadding = 24;
            const x = Math.max(16, window.innerWidth - menuWidth - rightPadding);
            const y = Math.max(16, Math.round((window.innerHeight - menuHeight) / 2));
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;
        }
        menu.style.right = "auto";
        menu.style.bottom = "auto";
        menu.style.transform = "none";
        menu.style.margin = "0";
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
        if (LogisticsUI.activeLogisticsConnection) {
            const outputTargets = Array.isArray(LogisticsUI.activeLogisticsConnection.source?.outputTargets)
                ? LogisticsUI.activeLogisticsConnection.source.outputTargets
                : [];
            const conn = outputTargets.find(t => t.id === LogisticsUI.activeLogisticsConnection.targetId);
            if (conn) {
                conn.filter = filterItem;
                if (conn.lineId) {
                    conveyorSystem.setLogisticsGroupFilter(conn.lineId, filterItem);
                }
            } else if (LogisticsUI.activeLogisticsConnection.groupId) {
                conveyorSystem.setLogisticsGroupFilter(LogisticsUI.activeLogisticsConnection.groupId, filterItem);
                if (LogisticsUI.activeLogisticsLine) LogisticsUI.activeLogisticsLine.filter = filterItem;
            }
            if (conn || LogisticsUI.activeLogisticsConnection.groupId) {
                const filterName = window.UIManager.getIngredientDisplayName(filterItem);
                GameEngine.addLog(`[物流] 路線搬運品項已更新：${filterName}。`, 'LOGISTICS');
                if (GameEngine.workerSystem && typeof GameEngine.workerSystem.updateWorkerAssignments === 'function') {
                    GameEngine.workerSystem.updateWorkerAssignments();
                }
            }
            const menu = document.getElementById('logistics_menu');
            if (menu) LogisticsUI.showLogisticsMenu(LogisticsUI.activeLogisticsConnection.source, LogisticsUI.activeLogisticsConnection.targetId, parseInt(menu.style.left) - 15, parseInt(menu.style.top) + 20);
        }
    }

    static deleteLogisticsLine(event) {
        if (event) event.stopPropagation();
        if (LogisticsUI.activeLogisticsConnection && !LogisticsUI.activeLogisticsConnection.groupId && Array.isArray(LogisticsUI.activeLogisticsConnection.source?.outputTargets)) {
            LogisticsUI.activeLogisticsConnection.source.outputTargets = LogisticsUI.activeLogisticsConnection.source.outputTargets.filter(t => t.id !== LogisticsUI.activeLogisticsConnection.targetId);
            GameEngine.addLog(`[物流] 路線已刪除`, 'LOGISTICS');
        } else {
            LogisticsUI.deleteSelectedLogisticsLine();
        }
        const menu = document.getElementById("logistics_menu"); if (menu) menu.style.display = "none";
        LogisticsUI.activeLogisticsConnection = null;
        LogisticsUI.activeLogisticsLine = null;
    }

    static clearLogisticsSelection() {
        GameEngine.state.selectedLogisticsLineId = null;
        GameEngine.state.selectedLogisticsGroupId = null;
        LogisticsUI.activeLogisticsConnection = null;
        LogisticsUI.activeLogisticsLine = null;
    }

    static isTransportLinePlacementActive() {
        const state = GameEngine.state;
        const cfg = state?.placingType ? state.buildingConfigs?.[state.placingType] : null;
        return !!cfg && cfg.type2 === 'transport_line';
    }

    static selectLogisticsLine(line, selectGroup = false) {
        if (!line) {
            LogisticsUI.clearLogisticsSelection();
            return;
        }
        GameEngine.state.selectedLogisticsLineId = conveyorSystem.getLogisticsLineSelectionKey(line);
        GameEngine.state.selectedLogisticsGroupId = selectGroup ? (line.groupId || line.id) : null;
        LogisticsUI.activeLogisticsLine = line;

        if (GameEngine.state.logisticsLines) {
            const groupId = line.groupId || line.id;
            const groupLines = conveyorSystem.ensureLogisticsLineStore()
                .filter(l => l.groupId === groupId || l.id === groupId)
                .sort((a, b) => {
                    const timeA = a.createdAt || 0;
                    const timeB = b.createdAt || 0;
                    if (timeA !== timeB) return timeA - timeB;
                    return (a.order || 0) - (b.order || 0);
                });
            
            const points = [];
            groupLines.forEach(l => {
                if (Array.isArray(l.routePoints) && l.routePoints.length > 0) {
                    points.push(l.routePoints[0]);
                } else if (Number.isFinite(l.x) && Number.isFinite(l.y)) {
                    points.push({ x: l.x, y: l.y });
                }
            });
            
            if (points.length > 0) {
                points.forEach((p, index) => {
                    GameEngine.addLog(`物流線位置${index} (${Math.round(p.x)},${Math.round(p.y)})`, 'LOGISTICS');
                });
            }
        }
    }

    static getLogisticsLineDragPort(line, anchorX = null, anchorY = null) {
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
            x: Number.isFinite(anchorX) ? anchorX : line?.x,
            y: Number.isFinite(anchorY) ? anchorY : line?.y,
            sourceType: "logistics_line"
        };
    }

    static beginLogisticsDragFromLine(line, clickX = null, clickY = null) {
        if (!line) return false;
        window.UIManager.clearWorldSelectionMarquee();
        LogisticsUI.logisticsSourceEntity = null;
        LogisticsUI.logisticsSourceLine = line;
        LogisticsUI.isLogisticsDragging = true;
        LogisticsUI.activeLogisticsLine = line;
        LogisticsUI.activeLogisticsConnection = null;
        GameEngine.state.selectedLogisticsLineId = conveyorSystem.getLogisticsLineSelectionKey(line);
        GameEngine.state.selectedLogisticsGroupId = null;
        GameEngine.state.logisticsDragLine = { active: true };
        window.UIManager.hideContextMenu();
        const startX = (typeof clickX === 'number') ? clickX : line.x;
        const startY = (typeof clickY === 'number') ? clickY : line.y;
        conveyorSystem.startDrag(startX, startY, null, LogisticsUI.getLogisticsLineDragPort(line, startX, startY), line);
        return true;
    }

    static beginLogisticsDragFromBuilding(ent, sourcePort) {
        if (!ent || !sourcePort) return false;
        if (!window.UIManager.isSelectedBuilding(ent)) return false;
        window.UIManager.clearWorldSelectionMarquee();
        LogisticsUI.logisticsSourceEntity = ent;
        LogisticsUI.logisticsSourceLine = null;
        LogisticsUI.isLogisticsDragging = true;
        window.UIManager.hideContextMenu();
        conveyorSystem.startDrag(sourcePort.x, sourcePort.y, ent, sourcePort);
        GameEngine.state.logisticsDragLine = { active: true };
        return true;
    }

    static beginTransportLineBuildDrag(worldX, worldY, sourceLine = null) {
        window.UIManager.clearWorldSelectionMarquee();
        LogisticsUI.logisticsSourceEntity = null;
        LogisticsUI.logisticsSourceLine = sourceLine || null;
        LogisticsUI.isLogisticsDragging = true;
        window.UIManager.hideContextMenu();
        if (sourceLine) {
            conveyorSystem.startDrag(worldX, worldY, null, LogisticsUI.getLogisticsLineDragPort(sourceLine, worldX, worldY), sourceLine);
        } else {
            conveyorSystem.startDrag(worldX, worldY, null, null, null);
        }
        GameEngine.state.logisticsDragLine = { active: true, buildMode: 'transport_line' };
        return true;
    }

    static cancelLogisticsDrag() {
        if (!LogisticsUI.isLogisticsDragging && !GameEngine.state.logisticsDragLine) return false;
        conveyorSystem.cancelDrag();
        window.UIManager.clearWorldSelectionMarquee();
        LogisticsUI.logisticsSourceEntity = null;
        LogisticsUI.logisticsSourceLine = null;
        LogisticsUI.potentialLogisticsDrag = null;
        LogisticsUI.isLogisticsDragging = false;
        GameEngine.state.logisticsDragLine = null;
        GameEngine.addLog(`[物流] 已取消物流線建造。`, 'LOGISTICS');
        if (window.UIManager) window.UIManager.updateValues();
        return true;
    }

    static deleteSelectedLogisticsLine() {
        const state = GameEngine.state;
        const selectedLineId = state.selectedLogisticsLineId;
        const selectedGroupId = state.selectedLogisticsGroupId;
        
        if (!selectedLineId && !selectedGroupId) return false;

        let deleted = false;
        
        if (selectedGroupId) {
            deleted = conveyorSystem.deleteLogisticsLineGroupById(selectedGroupId);
        } else if (selectedLineId) {
            deleted = conveyorSystem.deleteLogisticsLineById(selectedLineId);
        }

        if (!deleted) return false;

        const menu = document.getElementById("logistics_menu");
        if (menu) menu.style.display = "none";
        LogisticsUI.activeLogisticsConnection = null;
        LogisticsUI.activeLogisticsLine = null;
        LogisticsUI.logisticsSourceLine = null;
        state.selectedLogisticsLineId = null;
        state.selectedLogisticsGroupId = null;
        return true;
    }
}
