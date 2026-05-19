import { UI_CONFIG } from "./ui_config.js";
import { GameEngine } from "../systems/game_systems.js";
import { SynthesisSystem } from "../systems/SynthesisSystem.js";
import { WarehouseUI } from "./WarehouseUI.js";

export class BuildingMenuUI {
    static showContextMenu(entity, isConfirming = false, preservePosition = false) {
        const menu = document.getElementById("context_menu");
        const previousEntity = window.UIManager.activeMenuEntity;
        const previousEntityId = previousEntity ? (previousEntity.id || `${previousEntity.type1}_${previousEntity.x}_${previousEntity.y}`) : null;
        const nextEntityId = entity ? (entity.id || `${entity.type1}_${entity.x}_${entity.y}`) : null;
        const previousLeft = menu ? menu.style.left : "";
        const previousTop = menu ? menu.style.top : "";
        window.UIManager.activeMenuEntity = entity;
        const cfg = UI_CONFIG.ActionMenu;

        // 設置動態識別碼，使不同建築擁有獨立位置
        const customId = `context_menu_${entity.id || `${entity.type1}_${entity.x}_${entity.y}`}`;
        menu.dataset.dragId = customId;

        // 套用錨點樣式 (包含寬高、最小寬度等尺寸設定)
        if (cfg.anchor) {
            window.UIManager.applyAnchorStyle(menu, cfg, customId);
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
        menu.classList.toggle("factory-context-menu", !!isProcessingPlant);
        menu.style.transformOrigin = isProcessingPlant ? "50% 100%" : "top left";
        menu.style.scale = isProcessingPlant ? "0.75" : "1";
        const keepFactoryMenuPosition = !!(
            preservePosition ||
            (isProcessingPlant &&
                !isConfirming &&
                previousEntityId &&
                previousEntityId === nextEntityId &&
                previousLeft &&
                previousTop &&
                previousLeft !== "-9999px" &&
                previousTop !== "-9999px")
        );
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
        const stockpileInfo = isGatheringBuilding ? window.UIManager.getBuildingStockpileInfo(entity, cfg_current) : null;
        const compactWorkerHtml = (!isConfirming && false && isProcessingPlant && canAssignWorkers && !entity.isUnderConstruction) ? `
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
            const showDismiss = !isConfirming && canAssignWorkers && !entity.isUnderConstruction && !isProcessingPlant;

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

            const headerNameMarginTop = isProcessingPlant ? '0' : '10px';
            const headerColumnStyle = isProcessingPlant ? "display: flex; align-items: center; gap: 10px;" : "display: flex; align-items: center;";
            leftHeader = `
                <div style="display: flex; flex-direction: column; justify-content: center; transform: translate(${lOffset.x}px, ${lOffset.y}px);">
                    <div style="${headerColumnStyle}">
                        <span style="font-size: ${hCfg.levelFontSize}; font-weight: 900; color: #ffffff; line-height: 0.9; font-family: 'Arial Black', sans-serif; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">Lv.${entity.lv || 1}</span>
                        <span style="font-size: ${hCfg.nameFontSize}; color: ${hCfg.nameColor}; font-weight: bold; margin-top: ${headerNameMarginTop}; text-shadow: 1px 1px 3px rgba(0,0,0,0.8); white-space: nowrap;">${name}</span>
                        ${dismissHtml}
                        ${compactWorkerHtml}
                    </div>
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
        } else if (!isConfirming && nextCfg && !entity.isUnderConstruction && cfg_current && cfg_current.type2 === 'core') {
            const unlock = GameEngine.isUpgradeUnlocked(entity, nextCfg);
            const costs = nextCfg?.costs || {};
            const costItems = [];

            for (let r in costs) {
                costItems.push({ key: r, icon: window.UIManager.getIngredientIcon(r), val: costs[r] });
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
        } else if (!isConfirming && entity.lv > 1 && !nextCfg && cfg_current && cfg_current.type2 === 'core') {
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
                        const progress = worker ? BuildingMenuUI.getBuildingWorkerCooldown(worker) : 0;
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
                                    <span id="building_stockpile_icon" style="font-size: 18px; line-height: 1;">${window.UIManager.getIngredientIcon(stockpileInfo.type)}</span>
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
                const inputBuffer = entity.inputBuffer || {};
                const outputBuffer = entity.outputBuffer || {};
                const formatRecipeName = (type) => window.UIManager.getIngredientDisplayName(type);
                const currentRecipe = entity.currentRecipe || null;
                const currentNeeds = currentRecipe ? window.UIManager.getRecipeNeeds(currentRecipe.type, inputBuffer) : [];
                const productionProgress = entity.currentRecipe ? Math.max(0, Math.min(1, entity.craftingProgress || 0)) : 0;
                const currentRecipeName = entity.currentRecipe ? formatRecipeName(entity.currentRecipe.type) : '選擇產品';
                const workerMax = Math.max(1, cfg_current?.need_villagers || 5);
                const factoryWorkers = window.UIManager.getFactoryWorkers(entity);
                const workerCount = Math.max(0, Math.min(workerMax, factoryWorkers.length));
                const efficiency = Math.round((workerCount / workerMax) * 100);
                const productAmount = currentRecipe ? Math.floor(outputBuffer[currentRecipe.type] || 0) : 0;
                const productCap = 100;
                const workerDots = Array.from({ length: workerMax }).map((_, i) => `
                    <div class="factory-worker-dot ${i < workerCount ? 'active' : ''}"></div>
                `).join('');
                const currentNeedHtml = currentNeeds.length > 0
                    ? currentNeeds.slice(0, 5).map(need => `
                        <div class="factory-ingredient-tile" data-need-type="${need.type}" title="${window.UIManager.escapeHtml(window.UIManager.getIngredientDisplayName(need.type))}">
                            <div class="factory-ingredient-frame">
                                <div class="factory-ingredient-icon">${window.UIManager.getIngredientIcon(need.type)}</div>
                            </div>
                            <div class="factory-ingredient-count">${need.required}</div>
                        </div>
                    `).join('')
                    : `<div class="factory-empty-note">選擇產品</div>`;

                gridHtml += `<div class="factory-production-panel">`;
                gridHtml += `
                    <div class="factory-craft-wrap">
                        <div class="factory-section-label factory-outside-label">材料生產</div>
                        <section class="factory-craft-section">
                        <div class="factory-craft-row">
                            <div class="factory-product-tile" title="${window.UIManager.escapeHtml(currentRecipeName)}">
                                <div class="factory-product-frame">
                                    ${currentRecipe ? `<button class="factory-product-clear" type="button" onclick="window.UIManager.clearFactoryProduct(event)">×</button>` : ''}
                                    <div class="factory-product-icon">${currentRecipe ? window.UIManager.getIngredientIcon(currentRecipe.type) : ''}</div>
                                </div>
                                <div class="factory-product-count">${currentRecipe ? `${productAmount}` : '選擇產品'}</div>
                            </div>
                            <div class="factory-arrow-stack">
                                <span></span><span></span><span></span>
                            </div>
                            <div class="factory-ingredient-list">${currentNeedHtml}</div>
                        </div>
                        </section>
                    </div>
                    <div class="factory-worker-wrap">
                        <div class="factory-section-label factory-outside-label">工人派駐</div>
                        <section class="factory-worker-panel">
                        <div class="factory-efficiency">效率：${efficiency}%</div>
                        <div class="factory-worker-dots">${workerDots}</div>
                        <div class="factory-worker-footer">
                            <strong class="factory-worker-count">${workerCount}/${workerMax}</strong>
                            <button class="factory-dismiss-btn" onclick="window.UIManager.dismissWorkers(event)">解散</button>
                            <button class="factory-adjust-btn" onclick="window.UIManager.adjustWorkers(event, -1)">－</button>
                        </div>
                        </section>
                    </div>
                `;

                gridHtml += `<div class="factory-section-label factory-outside-label factory-menu-label">材料選單</div>`;
                gridHtml += `<section class="factory-recipe-section">`;
                recipes.forEach(rec => {
                    const isUnlocked = rec.isUnlocked;
                    const isCrafting = entity.currentRecipe && (entity.currentRecipe.uid ? entity.currentRecipe.uid === rec.uid : entity.currentRecipe.type === rec.type);
                    const opacity = isUnlocked ? '1' : '0.4';
                    const filter = isUnlocked ? 'none' : 'grayscale(100%)';
                    const name = formatRecipeName(rec.type);
                    const icon = window.UIManager.getIngredientIcon(rec.type);
                    const needInfo = window.UIManager.getRecipeNeeds(rec.type, inputBuffer)[0] || { label: '0 / 0', progress: 0 };
                    const pct = Math.round(needInfo.progress * 100);

                    gridHtml += `
                        <button class="recipe-btn ${isCrafting ? 'is-active' : ''}" data-uid="${rec.uid}" data-type="${rec.type}" onclick="window.UIManager.selectRecipe(event, '${rec.uid}', '${rec.type}')"
                                style="opacity:${opacity}; filter:${filter}; --recipe-progress:${pct}%;"
                                ${isUnlocked ? '' : 'disabled'} title="${isUnlocked ? `${window.UIManager.escapeHtml(name)}：${needInfo.label}` : '建築等級不足，尚未解鎖'}">
                            <div class="recipe-icon-frame"><div>${icon}</div></div>
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
                menu.style.width = "680px";
                menu.style.minWidth = "680px";
                menu.style.maxWidth = "680px";
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
                if (!keepFactoryMenuPosition) {
                    menu.style.left = "-9999px";
                    menu.style.top = "-9999px";
                }
            }
        }

        const destroyBtn = document.getElementById("destroy_btn");
        if (destroyBtn) {
            const villageCount = GameEngine.state.mapEntities.filter(e => e.type1 === 'town_center' || e.type1 === 'village').length;
            const isLastVillage = (entity.type1 === 'town_center' || entity.type1 === 'village') && villageCount <= 1;
            destroyBtn.style.display = (!isConfirming && !isLastVillage) ? "flex" : "none";
        }

        window.UIManager.updateValues();
        requestAnimationFrame(() => {
            if (keepFactoryMenuPosition) {
                const currentMenu = document.getElementById("context_menu");
                if (currentMenu) {
                    currentMenu.style.left = previousLeft;
                    currentMenu.style.top = previousTop;
                }
                return;
            }
            window.UIManager.updateStickyPositions();
        });
    }

    static confirmDestroy(event) {
        if (event) event.stopPropagation();
        const ent = window.UIManager.activeMenuEntity;
        if (!ent) return;

        // 切換到確認模式
        BuildingMenuUI.showContextMenu(ent, true);
    }

    static cancelDestroy(event) {
        if (event) event.stopPropagation();
        const ent = window.UIManager.activeMenuEntity;
        if (!ent) return;

        // 切換回一般模式
        BuildingMenuUI.showContextMenu(ent, false);
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
        if (!window.UIManager.activeMenuEntity) return;
        const activeId = window.UIManager.activeMenuEntity.id || `${window.UIManager.activeMenuEntity.type1}_${window.UIManager.activeMenuEntity.x}_${window.UIManager.activeMenuEntity.y}`;
        const targetEntity = GameEngine.state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === activeId) || window.UIManager.activeMenuEntity;
        const recipes = SynthesisSystem.getBuildingRecipes(GameEngine.state, GameEngine, targetEntity) || [];
        // 優先使用 uid 匹配，若無則回退到 type 匹配
        const rec = recipes.find(r => r.uid === recipeUid) || recipes.find(r => r.type === recipeType);
        if (rec && rec.isUnlocked) {
            SynthesisSystem.setCraftingTarget(GameEngine.state, GameEngine, targetEntity, rec);
            window.UIManager.activeMenuEntity = targetEntity;
            BuildingMenuUI.showContextMenu(targetEntity, false, true); // 點擊後刷新選單顯示高亮狀態
        }
    }

    static clearFactoryProduct(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        if (!window.UIManager.activeMenuEntity) return;
        const activeId = window.UIManager.activeMenuEntity.id || `${window.UIManager.activeMenuEntity.type1}_${window.UIManager.activeMenuEntity.x}_${window.UIManager.activeMenuEntity.y}`;
        const targetEntity = GameEngine.state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === activeId) || window.UIManager.activeMenuEntity;
        targetEntity.currentRecipe = null;
        targetEntity.craftingProgress = 0;
        targetEntity.isCraftingActive = false;
        targetEntity.inputBuffer = {};
        targetEntity.manualRecipeCleared = true;
        targetEntity._autoRecipeLogKey = null;
        targetEntity._lastMissingIngredientsLog = null;
        window.UIManager.activeMenuEntity = targetEntity;
        BuildingMenuUI.showContextMenu(targetEntity, false, true);
    }

    static dismissWorkers(event) {
        if (event) event.stopPropagation();
        const ent = window.UIManager.activeMenuEntity;
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
        BuildingMenuUI.showContextMenu(ent); // 立即刷新 UI
    }


    static adjustWorkers(event, delta) {
        if (event) event.stopPropagation();
        if (!window.UIManager.activeMenuEntity) return;
        GameEngine.adjustWarehouseWorkers(window.UIManager.activeMenuEntity, delta);
        // [修正] 調整後立即重新渲染選單，以反映最新的人數數值
        BuildingMenuUI.showContextMenu(window.UIManager.activeMenuEntity);
    }


    static getBuildingWorkerCooldown(worker) {
        if (!worker) return 0;
        if (worker.state === 'GATHERING') {
            const total = GameEngine.workerSystem && typeof GameEngine.workerSystem.getGatheringProductionTime === 'function'
                ? GameEngine.workerSystem.getGatheringProductionTime(worker)
                : 1;
            return total > 0 ? Math.max(0, Math.min(1, (worker.gatherTimer || 0) / total)) : 0;
        }
        return WarehouseUI.getWarehouseWorkerCooldown(worker);
    }

    static updateBuildingWorkerSlots() {
        const container = document.getElementById("context_menu");
        if (!container || !window.UIManager.activeMenuEntity) return;
        const slots = container.querySelectorAll(".building-worker-slot");
        if (!slots.length) return;

        const eid = window.UIManager.activeMenuEntity.id || `${window.UIManager.activeMenuEntity.type1}_${window.UIManager.activeMenuEntity.x}_${window.UIManager.activeMenuEntity.y}`;
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

            const deg = Math.round(BuildingMenuUI.getBuildingWorkerCooldown(worker) * 360);
            slot.style.borderColor = '#c59a79';
            slot.style.background = `conic-gradient(rgba(50,240,106,0.75) ${deg}deg, rgba(255,255,255,0.08) ${deg}deg 360deg)`;
            const face = slot.firstElementChild;
            if (face) {
                face.textContent = '👨';
                face.style.background = '#5b3d31';
            }
        });
    }

}
