export class BuildingSystem {
    static spendResources(state, costs) {
        for (let r in costs) {
            const cost = costs[r] || 0;
            if (cost > 0 && (state.resources[r] || 0) < cost) return false;
        }
        for (let r in costs) {
            let remaining = costs[r] || 0;
            if (remaining <= 0) continue;
            const warehouses = (state.mapEntities || []).filter(e => e && e.storage && (e.storage[r] || 0) > 0);
            for (const wh of warehouses) {
                const take = Math.min(remaining, wh.storage[r] || 0);
                wh.storage[r] -= take;
                remaining -= take;
                if (remaining <= 0) break;
            }
            state.resources[r] = Math.max(0, (state.resources[r] || 0) - costs[r]);
        }
        return true;
    }

    static refundResources(state, costs) {
        const target = (state.mapEntities || []).find(e => e.id === state.mainWarehouseId)
            || (state.mapEntities || []).find(e => e && ['storehouse', 'warehouse', 'village', 'town_center'].includes(e.type1));
        for (let r in costs) {
            const amount = costs[r] || 0;
            if (amount <= 0) continue;
            state.resources[r] = (state.resources[r] || 0) + amount;
            if (target) {
                if (!target.storage) target.storage = {};
                target.storage[r] = (target.storage[r] || 0) + amount;
            }
        }
    }

    /**
     * 建築邏輯更新：處理生產隊列與升級進度
     */
    static updateBuildingsLogic(state, engine, deltaTime) {
        const maxPop = engine.getMaxPopulation();
        let currentPopCount = engine.getCurrentPopulation();
        let anyFoundBlocked = false;

        if (state.lastMaxPop > 0 && maxPop > state.lastMaxPop) {
            engine.triggerWarning("3", [maxPop]);
        }
        state.lastMaxPop = maxPop;

        state.mapEntities.forEach(ent => {
            // 集結點追蹤
            if (ent.rallyPoint && ent.rallyPoint.targetId && ent.rallyPoint.targetType === 'UNIT') {
                const target = state.units.villagers.find(u => u.id === ent.rallyPoint.targetId);
                if (target && target.hp > 0) {
                    ent.rallyPoint.x = target.x;
                    ent.rallyPoint.y = target.y;
                } else {
                    ent.rallyPoint.targetId = null;
                    ent.rallyPoint.targetType = 'GROUND';
                }
            }

            // 升級邏輯
            if (ent.isUpgrading) {
                if (ent.upgradeProgress === undefined) ent.upgradeProgress = 0;
                ent.upgradeProgress += deltaTime / ent.upgradeTime;
                if (ent.upgradeProgress >= 1.0) {
                    ent.isUpgrading = false;
                    ent.upgradeProgress = 0;
                    ent.lv = (ent.lv || 1) + 1;
                    const newCfg = engine.getBuildingConfig(ent.type1, ent.lv);
                    if (newCfg) {
                        ent.name = newCfg.name;
                        ent.model = newCfg.model;
                    }
                    engine.addLog(`${ent.name} 升級成功！目前等級：${ent.lv}`);
                    engine.triggerWarning("upgrade_success", [ent.name, ent.lv]);
                    if (window.UIManager) {
                        window.UIManager.showWarning(`${ent.name} 升級至 ${ent.lv} 級！`);
                        window.UIManager.updateValues(true);
                        if (window.UIManager.activeMenuEntity === ent) window.UIManager.showContextMenu(ent);
                    }
                    state.renderVersion++;
                }
                return;
            }

            // 生產隊列邏輯
            if (ent.isUnderConstruction || !ent.queue || ent.queue.length === 0) return;

            const nextConfigName = ent.queue[0];
            let nextCfg = state.npcConfigs[nextConfigName];
            if (!nextCfg) {
                const mappedName = state.idToNameMap[nextConfigName];
                if (mappedName) nextCfg = state.npcConfigs[mappedName];
            }
            const unitPop = nextCfg ? (nextCfg.population || 1) : 1;
            const canSpawnPossible = (currentPopCount + unitPop) <= maxPop;

            if (ent.productionTimer === undefined) ent.productionTimer = 0;
            if (ent.productionTimer > 0) {
                ent.productionTimer -= deltaTime;
                if (ent.productionTimer < 0) ent.productionTimer = 0;
            }

            if (ent.productionTimer <= 0) {
                if (!canSpawnPossible) {
                    anyFoundBlocked = true;
                } else {
                    if (engine.spawnNPC(nextConfigName, ent)) {
                        ent.queue.shift();
                        currentPopCount += unitPop;
                        ent.productionTimer = ent.queue.length > 0 ? 5 : 0;
                    }
                }
            }
        });

        if (anyFoundBlocked) {
            if (!state.hasHitPopLimit) {
                engine.triggerWarning("2");
                state.hasHitPopLimit = true;
            }
        } else {
            state.hasHitPopLimit = false;
        }
    }

    static startUpgrade(state, engine, event, entity) {
        if (event && event.stopPropagation) event.stopPropagation();
        if (entity.isUpgrading || entity.isUnderConstruction) return;

        const currentCfg = engine.getBuildingConfig(entity.type1, entity.lv);
        const nextCfg = engine.getBuildingConfig(entity.type1, entity.lv + 1);

        if (!nextCfg) {
            engine.addLog("已達最高等級！");
            return;
        }

        const unlockStatus = engine.isUpgradeUnlocked(entity, nextCfg);
        if (!unlockStatus.unlocked) {
            engine.addLog(`未滿足升級條件：${unlockStatus.reason}`);
            return;
        }

        // 檢查資源 (使用下一等級的 cost)
        const nextCosts = nextCfg.costs || {};
        for (let r in nextCosts) {
            const cost = nextCosts[r];
            if ((state.resources[r] || 0) < cost) {
                engine.triggerWarning("1", [r.toUpperCase()]);
                return;
            }
        }

        if (!this.spendResources(state, nextCosts)) return;

        entity.isUpgrading = true;
        entity.upgradeProgress = 0;
        entity.upgradeTime = nextCfg.upgradeTime || 10;
        engine.addLog(`開始升級 ${currentCfg.name} 到 ${entity.lv + 1} 級，預計耗時 ${entity.upgradeTime} 秒。`);
        if (window.UIManager) {
            window.UIManager.updateValues(true);
            window.UIManager.showContextMenu(entity);
        }
    }

    static cancelUpgrade(state, engine, event, entity) {
        if (event && event.stopPropagation) event.stopPropagation();
        if (!entity || !entity.isUpgrading) return;

        // 返還資源 (100% 返還)
        const nextCfg = engine.getBuildingConfig(entity.type1, entity.lv + 1);
        const costs = nextCfg?.costs || {};
        this.refundResources(state, costs);

        entity.isUpgrading = false;
        entity.upgradeProgress = 0;

        const currentCfg = engine.getBuildingConfig(entity.type1, entity.lv);
        engine.addLog(`${currentCfg.name || entity.type1} 升級已取消，資源已退還。`);
        if (window.UIManager) {
            window.UIManager.showWarning("升級已取消，資源已全額退還");
            window.UIManager.showContextMenu(entity);
        }
    }

    static addToProductionQueue(state, engine, event, configName, sourceBuilding = null) {
        if (event && event.stopPropagation) event.stopPropagation();

        // 取得主要建築實體 (如果是從 UI 點擊)
        const activeBuilding = sourceBuilding || (window.UIManager && window.UIManager.activeMenuEntity);
        if (!activeBuilding || !activeBuilding.queue) {
            engine.addLog("此建築無法生產單位！");
            return;
        }

        // 判斷是否為多選模式且選中多個同類型建築
        const isMultiSelect = state.selectedBuildingIds && state.selectedBuildingIds.length > 1;
        let targets = [activeBuilding];

        if (isMultiSelect) {
            targets = state.mapEntities.filter(e =>
                state.selectedBuildingIds.includes(e.id || `${e.type1}_${e.x}_${e.y}`) &&
                e.type1 === activeBuilding.type1 &&
                !e.isUnderConstruction
            );
        }

        // 對每個目標建築執行生產邏輯
        targets.forEach(target => {
            engine._executeSingleProduction(configName, target);
        });

        if (window.UIManager) window.UIManager.updateValues(true);
    }

    /**
     * 執行單一建築的生產指令
     * 會根據建築等級自動匹配對應的單位等級
     */
    static _executeSingleProduction(state, engine, clickedConfigId, building) {
        if (!building || !building.queue) return;

        if (building.queue.length >= 10) {
            engine.addLog(`${building.name} 的生產隊伍已滿 (10/10)！`);
            return;
        }

        // [關鍵] 根據建築等級調整產出的單位編號 (例如 A 生產 Lv1, B 生產 Lv2)
        const finalConfigId = engine.resolveAppropriateUnitId(clickedConfigId, building);

        // 檢查該建築是否真的被允許生產此單位 (或此種類型)
        const bCfg = engine.getBuildingConfig(building.type1, building.lv || 1);
        if (!bCfg || !bCfg.npcProduction) return;

        // 如果不是 RANDOM，則檢查 finalConfigId 是否在該等級建築的產出清單中
        if (finalConfigId !== 'RANDOM') {
            const finalCfg = state.npcConfigs[finalConfigId] || state.npcConfigs[state.idToNameMap[finalConfigId]];
            const finalType = finalCfg ? finalCfg.type : null;

            const isAllowed = bCfg.npcProduction.some(id => {
                const name = state.idToNameMap[id] || id;
                const cfg = state.npcConfigs[name] || state.npcConfigs[id];
                return id == finalConfigId || (cfg && finalType && cfg.type === finalType);
            });
            if (!isAllowed) {
                console.warn(`[生產跳過] ${building.name} (Lv.${building.lv}) 不支援生產 ${finalConfigId} (類型: ${finalType})`);
                return;
            }
        }

        // 檢查資源成本
        let costConfigId = finalConfigId;
        if (finalConfigId === 'RANDOM') {
            costConfigId = bCfg.npcProduction[0];
        }

        let cfg = state.npcConfigs[costConfigId] || state.npcConfigs[state.idToNameMap[costConfigId]];
        if (!cfg) {
            console.error(`[生產] 找不到配置 (用於計費): ${costConfigId}`);
            return;
        }

        if (cfg.costs) {
            for (let r in cfg.costs) {
                const cost = cfg.costs[r];
                if (cost > 0) {
                    const current = state.resources[r.toLowerCase()] || 0;
                    if (current < cost) {
                        engine.triggerWarning("1", [r.toUpperCase()]);
                        return; // 只要有一項不夠就停止該建築生產
                    }
                }
            }
            if (!this.spendResources(state, Object.fromEntries(Object.entries(cfg.costs).map(([r, cost]) => [r.toLowerCase(), cost])))) return;
        }

        building.queue.push(finalConfigId);
        if (building.queue.length === 1 && (building.productionTimer || 0) <= 0) {
            building.productionTimer = 5;
        }
        engine.addLog(`${building.name} 加入生產隊列：${finalConfigId} (${building.queue.length}/10)`);
    }

    /**
     * 根據建築等級解析最適合的單位 ID
     * 邏輯：找到與 clickedConfigId 同類型且等級不高於建築等級的最高級單位
     */
    static resolveAppropriateUnitId(state, engine, clickedId, building) {
        // 先獲取原始點擊單位的配置，以得知其「類型」 (swordsman, mage, etc.)
        let baseCfg = state.npcConfigs[clickedId];
        if (!baseCfg) {
            const name = state.idToNameMap[clickedId];
            if (name) baseCfg = state.npcConfigs[name];
        }

        if (!baseCfg || clickedId === 'RANDOM') return clickedId;

        const unitType = baseCfg.type;
        const bLv = building.lv || 1;

        // 在所有 NPC 配置中尋找：
        // 1. 類型相同
        // 2. 等級 <= 建築等級
        // 3. 取等級最高的一個
        let bestId = clickedId;
        let bestLv = baseCfg.lv || 1;

        for (const name in state.npcConfigs) {
            const cfg = state.npcConfigs[name];
            if (cfg.type === unitType && cfg.lv <= bLv) {
                if (cfg.lv > bestLv) {
                    bestLv = cfg.lv;
                    bestId = cfg.id || name;
                }
            }
        }

        return bestId;
    }

    static placeBuilding(state, engine, type1, x, y) {
        const cfg = state.buildingConfigs[type1];
        if (!cfg) return false;
        const currentCount = state.mapEntities.filter(e => e.type1 === type1).length;
        if (cfg.maxCount !== undefined && currentCount >= cfg.maxCount) {
            engine.addLog(`建造失敗：${cfg.name} 數量已達上限！`);
            return false;
        }
        // 檢查資源
        for (let r in cfg.costs) {
            if ((state.resources[r] || 0) < cfg.costs[r]) {
                engine.triggerWarning("1", [r.toUpperCase()]);
                return false;
            }
        }
        if (!engine.isAreaClear(x, y, type1)) { engine.addLog("位置受阻！"); return false; }

        if (!this.spendResources(state, cfg.costs)) return false;

        const newBuilding = {
            id: `build_${type1}_${x}_${y}_${Date.now()}`,
            model: cfg.model,
            type1: cfg.type1,
            lv: cfg.lv || 1,
            x: x, y: y, name: "待施工",
            isUnderConstruction: true, buildProgress: 0,
            buildTime: Math.max(1, cfg.buildTime || 5), // 防止 0 或 NaN
            amount: cfg.resourceValue || 0,
            maxAmount: cfg.resourceValue || 0,
            isResource: (type1 === 'farmland' || type1 === 'tree_plantation'),
            targetWorkerCount: 0,
            ...(cfg.npcProduction && cfg.npcProduction.length > 0 ? { queue: [], productionTimer: 0 } : {})
        };
        state.mapEntities.push(newBuilding);
        state.renderVersion++; // 通知渲染器刷新

        // --- NPC 位移修復：如果有村民被壓在剛生成的建築下，將其推開 ---
        const TS = engine.TILE_SIZE;
        const match = cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
        const uw = match ? parseInt(match[1]) : 1, uh = match ? parseInt(match[2]) : 1;
        const w = uw * TS, h = uh * TS;
        const bLeft = x - w / 2, bRight = x + w / 2, bTop = y - h / 2, bBottom = y + h / 2;

        // [新協定] 既然是「先選人再蓋房」，放置後不應彈出選取框 (保持選取工人而非建築)
        const selIds = state.selectedUnitIds || [];
        const selectedVillagers = state.units.villagers.filter(v => selIds.includes(v.id) && v.config.type === 'villagers');

        // [優先級分配] 依照放置順序遞增分配序列號，工人應由小到大建造
        newBuilding.priority = state.globalConstructionOrder++;

        if (selectedVillagers.length > 0) {
            const isLineMode = state.buildingMode === 'LINE';

            if (isLineMode) {
                // 批次模式下，為了分配均勻，我們只挑選「完全沒事」的人去負責這棟
                const candidate = selectedVillagers.find(v => !v.constructionTarget);
                if (candidate) {
                    candidate.state = 'MOVING_TO_CONSTRUCTION';
                    candidate.constructionTarget = newBuilding;
                    candidate.targetId = null;
                    candidate.pathTarget = null;
                    candidate.isPlayerLocked = true;
                    engine.addLog(`[分配] 工人 ${candidate.id.substr(-4)} 負責 P:${newBuilding.priority} 單點施工。`);
                }
            } else {
                // 單一建築模式下，所有選取的工人一併前往，支援多人同時建造
                let count = 0;
                selectedVillagers.forEach(v => {
                    // 如果工人已經在蓋「另一棟」建築，為了效率先讓其完工
                    if (v.constructionTarget && v.constructionTarget !== newBuilding) {
                        return;
                    }

                    // 如果不是在回城的命脈任務中，直接切換到建築狀態
                    if (v.state === 'IDLE' || v.state === 'GATHERING' || v.state === 'MOVING_TO_RESOURCE' || v.state === 'MOVING' || v.state === 'MOVING_TO_CONSTRUCTION') {
                        v.state = 'MOVING_TO_CONSTRUCTION';
                        v.constructionTarget = newBuilding;
                        v.targetId = null;
                        v.pathTarget = null;
                        v.isPlayerLocked = true;
                        count++;
                    } else if (v.state === 'MOVING_TO_BASE') {
                        // 正在回城的，就把下次任務設為此建築
                        v.nextStateAfterDeposit = 'MOVING_TO_CONSTRUCTION';
                        v.nextTargetAfterDeposit = newBuilding;
                    }
                });
                if (count > 0) engine.addLog(`[協作] ${count} 位工人前往支援 P:${newBuilding.priority} 建築。`);
                else engine.addLog(`[排隊] 選中的工人正在忙碌，隨後將自動處理 P:${newBuilding.priority}。`);
                console.log(`[協作派發] 單獨模型指派 ${count}/${selectedVillagers.length} 位。`);
            }
        } else {
            engine.addLog(`${cfg.name} 已放置 (待建序列 P:${newBuilding.priority})。`, 'COMMON');
        }

        state.selectedBuildingId = null;
        engine.updatePathfindingGrid(); // 建造完成後刷新格網數據
        engine.updateSpatialGrid();
        return true;
    }

    static placeBuildingLine(state, engine, type1, startX, startY, endX, endY) {
        const positions = engine.getLinePositions(type1, startX, startY, endX, endY);
        const cfg = state.buildingConfigs[type1];
        if (!cfg || positions.length === 0) return;

        // 預檢總成本與可用性
        let possibleBuildings = [];
        let totalCosts = { food: 0, wood: 0, stone: 0, gold: 0 };

        positions.forEach(pos => {
            if (engine.isAreaClear(pos.x, pos.y, type1, possibleBuildings)) {
                possibleBuildings.push({ x: pos.x, y: pos.y });
                for (let r in cfg.costs) totalCosts[r] += cfg.costs[r];
            }
        });

        if (possibleBuildings.length === 0) return;

        // 檢查最終資源量
        for (let r in totalCosts) {
            if (state.resources[r] < totalCosts[r]) {
                engine.triggerWarning("1", [r.toUpperCase()]);
                return;
            }
        }

        // 批量執行
        let count = 0;
        possibleBuildings.forEach(pos => {
            if (engine.placeBuilding(type1, pos.x, pos.y)) count++;
        });
        if (count > 0) {
            engine.addLog(`批次建造：${cfg.name} x${count}。`);
            // [多人協作] 批次放置後，讓所有「依然空閒」的選中工人尋找最適合的工地支援 (分攤剩餘勞動力)
            const selIds = state.selectedUnitIds || [];
            const remainingFree = state.units.villagers.filter(v => selIds.includes(v.id) && !v.constructionTarget && v.config?.type === 'villagers');
            if (remainingFree.length > 0) {
                const projects = state.mapEntities.filter(e => e && e.isUnderConstruction).sort((a, b) => (a.priority || 0) - (b.priority || 0));
                remainingFree.forEach(v => {
                    const best = engine.findBestConstructionProject(v, projects);
                    if (best) {
                        v.state = 'MOVING_TO_CONSTRUCTION';
                        v.constructionTarget = best;
                        v.targetId = null; v.pathTarget = null;
                        v.isPlayerLocked = true;
                    }
                });
                engine.addLog(`[協作] ${remainingFree.length} 位剩餘工人已分派至待建工地。`);
            }
        }
    }

    static getLinePositions(state, engine, type1, startX, startY, endX, endY) {
        const TS = engine.TILE_SIZE;
        const cfg = state.buildingConfigs[type1];
        if (!cfg) return [];
        const match = cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
        const uw = match ? parseInt(match[1]) : 1, uh = match ? parseInt(match[2]) : 1;

        const spacing = state.buildingSpacing !== undefined ? state.buildingSpacing : 1;

        // 為了讓拉排更直覺，我們強迫它沿著主軸線排列
        const dx = endX - startX, dy = endY - startY;
        const positions = [];

        if (Math.abs(dx) > Math.abs(dy)) {
            // 水平排列
            const step = (uw + spacing) * TS;
            const count = Math.floor(Math.abs(dx) / step) + 1;
            const dir = dx > 0 ? 1 : -1;
            for (let i = 0; i < count; i++) {
                positions.push({ x: startX + i * step * dir, y: startY });
            }
        } else {
            // 垂直排列
            const step = (uh + spacing) * TS;
            const count = Math.floor(Math.abs(dy) / step) + 1;
            const dir = dy > 0 ? 1 : -1;
            for (let i = 0; i < count; i++) {
                positions.push({ x: startX, y: startY + i * step * dir });
            }
        }
        return positions;
    }

    static destroyBuilding(state, engine, ent) {
        if (!ent) return;
        const cfg = state.buildingConfigs[ent.type1];
        if (!cfg) return;

        // 1. 返還資源 (50%)
        let refundLog = [];
        for (let r in cfg.costs) {
            const refundRate = ent.isUnderConstruction ? 1.0 : 0.5;
            const amount = Math.floor(cfg.costs[r] * refundRate);
            if (amount > 0) {
                this.refundResources(state, { [r]: amount });
                refundLog.push(`${amount} 單位 ${engine.RESOURCE_NAMES[r] || r}`);
            }
        }

        // 2. 更新狀態計計數
        if (ent.type1 === 'farmhouse') state.buildings.farmhouse--;

        // 3. 從地圖移除
        const id = ent.id || `${ent.type1}_${ent.x}_${ent.y}`;
        state.mapEntities = state.mapEntities.filter(e => {
            const eid = e.id || `${e.type1}_${e.x}_${e.y}`;
            return eid !== id;
        });
        if (Array.isArray(state.logisticsLines)) {
            state.logisticsLines = state.logisticsLines.filter(line => line.sourceId !== id && line.targetId !== id);
        }
        state.mapEntities.forEach(e => {
            if (Array.isArray(e.outputTargets)) {
                e.outputTargets = e.outputTargets.filter(conn => conn.id !== id);
            }
        });
        if (state.selectedLogisticsLineId) {
            const selectedExists = Array.isArray(state.logisticsLines) && state.logisticsLines.some(line => line.id === state.selectedLogisticsLineId);
            if (!selectedExists) state.selectedLogisticsLineId = null;
        }

        state.renderVersion++; // 通知渲染器刷新

        // 4. 通知日誌
        const actionName = ent.isUnderConstruction ? "取消施工" : "銷毀";
        engine.addLog(`${actionName}了 ${cfg.name}。返還：${refundLog.join(', ') || '無'}`);

        // 5. 如果有村民正要去這建設/採集，或已經進駐 (包含倉庫與工廠)，需重置並釋放
        state.units.villagers.forEach(v => {
            const isAssignedToThis = (v.constructionTarget === ent || v.targetId === ent || v.assignedWarehouseId === id || v.factoryTarget === ent);
            
            if (isAssignedToThis) {
                // 如果工人已進駐建築內（處於隱藏狀態），將其釋放回地圖
                if (v.visible === false || v.state === 'WORKING_IN_FACTORY') {
                    v.visible = true;
                    // 讓工人散開，避免疊在一個點上
                    const scatterAngle = Math.random() * Math.PI * 2;
                    const scatterDist = 20 + Math.random() * 40;
                    v.x = ent.x + Math.cos(scatterAngle) * scatterDist;
                    v.y = ent.y + Math.sin(scatterAngle) * scatterDist;
                }
                
                v.constructionTarget = null;
                v.targetId = null;
                v.assignedWarehouseId = null;
                v.factoryTarget = null;
                
                // 強制恢復為閒置狀態，避免卡在特殊狀態
                v.state = 'IDLE';
                engine.restoreVillagerTask(v);
            }
        });

        if (window.UIManager) {
            window.UIManager.hideContextMenu();
            window.UIManager.updateValues();
        }
        engine.updateSpatialGrid();
        if (engine.updatePathfindingGrid) engine.updatePathfindingGrid();
    }
}
