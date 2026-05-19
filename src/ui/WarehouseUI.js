import { UI_CONFIG } from "./ui_config.js";
import { GameEngine } from "../systems/game_systems.js";

export class WarehouseUI {
    static warehouseFilterValue = 1; // 1: 資源(Lv1), 2: 材料(Lv2+)
    static warehouseSortById = false;

    static dismissWarehouseWorkers(event) {
        if (event) event.stopPropagation();
        const ent = window.UIManager.activeWarehouseEntity;
        if (!ent) return;

        const previousMenuEntity = window.UIManager.activeMenuEntity;
        window.UIManager.activeMenuEntity = ent;
        window.UIManager.dismissWorkers(null);
        window.UIManager.activeMenuEntity = previousMenuEntity;
        WarehouseUI.renderWarehousePanel();
    }

    static adjustWarehousePanelWorkers(event, delta) {
        if (event) event.stopPropagation();
        const ent = window.UIManager.activeWarehouseEntity;
        if (!ent) return;
        GameEngine.adjustWarehouseWorkers(ent, delta);
        WarehouseUI.renderWarehousePanel();
    }

    static toggleWarehousePanel(entity = null) {
        const panel = document.getElementById("warehouse_panel");
        if (!panel) return;

        if (entity) {
            window.UIManager.activeWarehouseEntity = entity;
        }

        if (panel.style.display === "none") {
            window.UIManager.hideContextMenu(); // 先關閉其它選單
            window.UIManager.hideSettingsPanel();

            const ent = window.UIManager.activeWarehouseEntity;
            const customId = ent ? `warehouse_panel_${ent.id || `${ent.type1}_${ent.x}_${ent.y}`}` : "warehouse_panel_global";
            panel.dataset.dragId = customId;
            window.UIManager.applyAnchorStyle(panel, UI_CONFIG.WarehousePanel, customId);

            WarehouseUI.renderWarehousePanel();
            panel.style.display = "flex";
            panel.style.flexDirection = "column";
        } else {
            panel.style.display = "none";
        }
    }

    static setWarehouseFilter(lv) {
        WarehouseUI.warehouseFilterValue = lv;
        WarehouseUI.renderWarehousePanel();
    }

    static sortWarehouse() {
        WarehouseUI.warehouseSortById = !WarehouseUI.warehouseSortById; // 切換排序狀態
        WarehouseUI.renderWarehousePanel();
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
        const total = window.UIManager.getIngredientProductionTime(type, 1);
        if (!Number.isFinite(total) || total <= 0) return 0;
        return Math.max(0, Math.min(1, (worker.logisticsWorkTimer || 0) / total));
    }

    static renderWarehouseWorkerSlots(ent) {
        if (!ent) return '';
        const bCfg = GameEngine.getBuildingConfig(ent.type1, ent.lv || 1) || {};
        const workers = WarehouseUI.getWarehouseAssignedWorkers(ent);
        const targetCount = Math.max(ent.targetWorkerCount || 0, workers.length, bCfg.need_villagers || 5);
        const slotCount = Math.max(1, targetCount);
        const slots = [];

        for (let i = 0; i < slotCount; i++) {
            const worker = workers[i];
            const progress = worker ? WarehouseUI.getWarehouseWorkerCooldown(worker) : 0;
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
        if (!container || !window.UIManager.activeWarehouseEntity) return;
        const workers = WarehouseUI.getWarehouseAssignedWorkers(window.UIManager.activeWarehouseEntity);
        const workerMap = new Map(workers.map(worker => [worker.id, worker]));
        container.querySelectorAll(".warehouse-worker-slot").forEach(slot => {
            const worker = workerMap.get(slot.dataset.workerId);
            if (!worker) return;
            const deg = Math.round(WarehouseUI.getWarehouseWorkerCooldown(worker) * 360);
            slot.style.background = `conic-gradient(rgba(50,240,106,0.75) ${deg}deg, rgba(255,255,255,0.08) ${deg}deg 360deg)`;
        });
    }

    static renderWarehousePanel() {
        const panel = document.getElementById("warehouse_panel");
        if (!panel) return;
        const cfg = UI_CONFIG.WarehousePanel;
        const ent = window.UIManager.activeWarehouseEntity;

        // 強制設置容器為 flex 佈局以支援內部高度自動填滿
        panel.style.display = "flex";
        panel.style.flexDirection = "column";
        panel.style.padding = "20px";
        panel.style.boxSizing = "border-box";

        // 右上角關閉按鈕
        let html = `
            <div onclick="event.stopPropagation(); window.WarehouseUI.toggleWarehousePanel()" 
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
                    ${ent ? `<button onclick="window.WarehouseUI.dismissWarehouseWorkers(event)" 
                        style="padding: 5px 12px; border: 1px solid #b86b6b; border-radius: 4px; background: #5a1f1f; color: #fff1f1; cursor: pointer; transition: 0.2s; font-weight: bold;" title="解散這間倉庫的派駐工人">解散</button>
                    <button onclick="window.WarehouseUI.adjustWarehousePanelWorkers(event, -1)"
                        style="width: 24px; height: 24px; border-radius: 50%; background: #5b3d31; border: 2px solid #c59a79; color: #f6e2cf; font-size: 16px; font-weight: 900; cursor: pointer; display:flex; align-items:center; justify-content:center; line-height:1; box-shadow: 0 2px 5px rgba(0,0,0,0.35);" title="減少 1 位派駐工人">－</button>` : ``}
                </div>
                <button onclick="window.WarehouseUI.sortWarehouse(); event.stopPropagation();" 
                        style="padding: 5px 12px; border: 1px solid #6b5232; border-radius: 4px; background: ${WarehouseUI.warehouseSortById ? '#3a2b16' : '#221a10'}; color: #ddd; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 5px;" title="依 ID 排序">
                    <span style="font-size: 12px;">排序</span> ${WarehouseUI.warehouseSortById ? '↑' : '↓'}
                </button>
            </div>
        `;

        html += WarehouseUI.renderWarehouseWorkerSlots(ent);

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

        if (WarehouseUI.warehouseSortById) {
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
                const displayIcon = window.UIManager.getIngredientIcon(stack.type);

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

    static hideWarehousePanel() {
        const panel = document.getElementById("warehouse_panel");
        if (panel) panel.style.display = "none";
    }
}
