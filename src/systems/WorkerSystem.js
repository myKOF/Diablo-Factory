import { UI_CONFIG } from "../ui/ui_config.js";
import { ResourceSystem } from "./ResourceSystem.js";
import { SynthesisSystem } from "./SynthesisSystem.js";

/**
 * 工人系統 (WorkerSystem.js)
 * 核心職責：工人尋路、座標移動、狀態機切換（Idle, Move, Mining, Constructing 等）
 * 遵循微創重構原則：僅做物理搬移，不修改尋路算法邏輯
 */
export class WorkerSystem {
    constructor(state, engineContext) {
        this.state = state;
        this.engine = engineContext;

        // 工廠類型定義
        this.FACTORY_TYPES = ['timber_processing_plant', 'smelting_plant', 'tank_workshop', 'stone_processing_plant'];
        this.LOGISTICS_STORAGE_TYPES = ['warehouse', 'storehouse', 'barn', 'town_center', 'village'];
    }

    getUnitMoveSpeed(v, isNonPlayerWandering = false) {
        const configSpeed = isNonPlayerWandering ? (v.config.idle_speed || 2.5) : (v.config.fighting_speed || 5.5);
        return configSpeed * 13;
    }

    /**
     * 更新所有工人的狀態與移動
     */
    update(dt) {
        const selectedIds = new Set(this.state.selectedUnitIds || []);
        const sortedVillagers = [...this.state.units.villagers].sort((a, b) => {
            const aS = selectedIds.has(a.id) ? 1 : 0;
            const bS = selectedIds.has(b.id) ? 1 : 0;
            return bS - aS;
        });

        const allMovableUnits = [...sortedVillagers, ...(this.state.units.npcs || [])];

        allMovableUnits.forEach(v => {
            this.updateVillagerMovement(v, dt);
        });

        // 每秒執行一次工人分配邏輯
        this.state.assignmentTimer += dt;
        if (this.state.assignmentTimer >= 1.0 || this.state.needsGridUpdate) {
            this.updateWorkerAssignments();
            if (this.engine.updateSpatialGrid) this.engine.updateSpatialGrid();
            this.state.assignmentTimer = 0;
            this.state.needsGridUpdate = false;
        }
    }

    updateVillagerMovement(v, deltaTime) {
        const TILE_SIZE = 20; // 基礎座標單位 (與 GameEngine.TILE_SIZE 保持一致)

        // 核心邏輯：只有 npc_data 中類型為 'villagers' 的才具備採集與建設能力，非村民僅處理 IDLE 巡邏或集結點移動
        if (v.config.type !== 'villagers') {
            const oldX = v.x, oldY = v.y;
            const isNonPlayerWandering = ((v.config.camp === 'enemy' || v.config.camp === 'neutral') && (v.state === 'IDLE' || v.state === 'MOVING'));
            const moveBaseSpeed = isNonPlayerWandering ? (v.config.idle_speed || 2.5) : (v.config.fighting_speed || 5.5);
            const moveSpeed = moveBaseSpeed * 13;
            if (v.idleTarget) {
                if (v.state !== 'CHASE' && v.state !== 'ATTACK' && v.state !== 'GATHERING') v.state = 'MOVING';
                this.moveDetailed(v, v.idleTarget.x, v.idleTarget.y, moveSpeed, deltaTime);
                if (Math.hypot(v.x - v.idleTarget.x, v.y - v.idleTarget.y) < 5) {
                    v.idleTarget = null;
                    v.commandCenter = null;
                    if (v.state === 'MOVING') v.state = 'IDLE';

                    let minWait = 3, maxWait = 6;
                    const cfg = this.state.systemConfig.enemy_patrol_time;
                    if (cfg && typeof cfg === 'string') {
                        const match = cfg.match(/\{[ ]*([\d.]+)[ ]*,[ ]*([\d.]+)[ ]*\}/);
                        if (match) {
                            minWait = parseFloat(match[1]);
                            maxWait = parseFloat(match[2]);
                        }
                    } else if (typeof cfg === 'number') {
                        minWait = cfg; maxWait = cfg * 1.5;
                    }

                    v.waitTimer = minWait + Math.random() * (maxWait - minWait);
                }
            } else if (v.state === 'IDLE' && v.config.patrol_range > 0) {
                if (v.waitTimer > 0) {
                    v.waitTimer -= deltaTime;
                } else {
                    const pr = v.config.patrol_range * TILE_SIZE;
                    const angle = Math.random() * Math.PI * 2;
                    const dist = Math.random() * pr;
                    const tx = (v.spawnX || v.x) + Math.cos(angle) * dist;
                    const ty = (v.spawnY || v.y) + Math.sin(angle) * dist;

                    let targetWalkable = true;
                    if (this.state.pathfinding && this.state.pathfinding.isGridSet) {
                        const tgx = Math.floor(tx / TILE_SIZE);
                        const tgy = Math.floor(ty / TILE_SIZE);
                        if (!this.state.pathfinding.isValidAndWalkable(tgx, tgy, true)) {
                            targetWalkable = false;
                        }
                    }

                    if (targetWalkable) {
                        v.idleTarget = { x: tx, y: ty };
                    } else {
                        v.waitTimer = 1 + Math.random() * 2;
                    }
                }
            } else if (v.state === 'MOVING') {
                v.state = 'IDLE';
                v.commandCenter = null;
            }
            const colliding = this.isColliding(v.x, v.y);
            if (colliding) {
                if (this.isColliding(oldX, oldY) !== colliding) { v.x = oldX; v.y = oldY; }
                else { this.resolveStuck(v); }
            }
            return;
        }

        if (v.assignedWarehouseId) {
            const w = this.state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === v.assignedWarehouseId);
            if (w && !w.isUnderConstruction) { v.targetBase = w; }
            else { v.assignedWarehouseId = null; v.targetBase = ResourceSystem.findNearestDepositPoint(this.state, v.x, v.y, v.cargoType || 'WOOD') || { x: 960, y: 560 }; }
        } else {
            v.targetBase = ResourceSystem.findNearestDepositPoint(this.state, v.x, v.y, v.cargoType || 'WOOD') || { x: 960, y: 560 };
        }
        const oldX = v.x, oldY = v.y;

        let ignoreEnts = [v];
        if ((v.state === 'GATHERING' || v.state === 'MOVING_TO_RESOURCE') && v.targetId) ignoreEnts.push(v.targetId);
        if ((v.state === 'CONSTRUCTING' || v.state === 'MOVING_TO_CONSTRUCTION') && v.constructionTarget) ignoreEnts.push(v.constructionTarget);
        if (v.state === 'MOVING_TO_BASE' && v.targetBase) ignoreEnts.push(v.targetBase);
        if (v.state === 'TRANSPORTING_LOGISTICS' || v.state === 'RETURNING_TO_FACTORY') {
            const logisticsTarget = v.logisticsTargetId
                ? this.state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === v.logisticsTargetId)
                : null;
            const logisticsHome = v.logisticsHomeId
                ? this.state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === v.logisticsHomeId)
                : null;
            if (logisticsTarget) ignoreEnts.push(logisticsTarget);
            if (logisticsHome && logisticsHome !== logisticsTarget) ignoreEnts.push(logisticsHome);
        }
        if (v._isRallyMovement && v.rallySourceBuildingId) {
            const rallySource = this.state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === v.rallySourceBuildingId);
            if (rallySource) ignoreEnts.push(rallySource);
        }

        if (v.state !== 'IDLE' && v.state !== 'CHASE' && v.idleTarget) {
            v.idleTarget = null;
        }

        const isNonPlayerWandering = ((v.config.camp === 'enemy' || v.config.camp === 'neutral') && (v.state === 'IDLE' || v.state === 'MOVING'));
        const moveSpeed = this.getUnitMoveSpeed(v, isNonPlayerWandering);

        const isSelected = this.state.selectedUnitIds && this.state.selectedUnitIds.includes(v.id);
        if (isSelected && v._lastRecordedState !== v.state) {
            const msg = `[狀態轉進] ${v.configName}: ${v._lastRecordedState || 'IDLE'} -> ${v.state} (${v.x.toFixed(0)}, ${v.y.toFixed(0)})`;
            console.log(`%c${msg}`, "color: #4fc3f7; font-weight: bold;");
            this.engine.addLog(msg, 'STATE');
            v._lastRecordedState = v.state;
        }

        if (v._stuckFrames > 100) {
            this.resolveStuck(v);
        }

        switch (v.state) {
            case 'MOVING_TO_FACTORY':
                if (!v.factoryTarget) { v.state = 'IDLE'; break; }
                const factoryIgnoreEnts = [...ignoreEnts, v.factoryTarget];

                // [核心優化] 派駐位置放寬：判定是否碰到建築模型範圍
                const fp = this.engine.getFootprint(v.factoryTarget.type1);
                const halfW = (fp.uw * 20) / 2;
                const halfH = (fp.uh * 20) / 2;

                // [調試] 檢查抵達距離與判定
                const dist = Math.hypot(v.x - v.factoryTarget.x, v.y - v.factoryTarget.y);
                const isTouching =
                    v.x >= v.factoryTarget.x - halfW - 40 &&
                    v.x <= v.factoryTarget.x + halfW + 40 &&
                    v.y >= v.factoryTarget.y - halfH - 40 &&
                    v.y <= v.factoryTarget.y + halfH + 40;

                if (isTouching) {
                    console.log(`[物流調試] 工人 ${v.id} 判定抵達 ${v.factoryTarget.type1}。距離: ${dist.toFixed(1)}`);
                    const targetBuilding = v.factoryTarget;
                    const entered = this.tryEnterLogisticsBuilding(v, targetBuilding, 'target');

                    if (entered) {
                        if (this.state.selectedUnitIds) {
                            this.state.selectedUnitIds = this.state.selectedUnitIds.filter(id => id !== v.id);
                        }
                    } else {
                        v.assignedWarehouseId = null;
                        v.factoryTarget = null;
                        v.state = 'IDLE';
                        v.pathTarget = null;
                        v.fullPath = null;
                        v.commandCenter = null;
                        v.visible = true;
                        if (v.sprite && typeof v.sprite.setVisible === 'function') v.sprite.setVisible(true);
                        if (v.gameObject && typeof v.gameObject.setVisible === 'function') v.gameObject.setVisible(true);

                        const scatterAngle = Math.random() * Math.PI * 2;
                        const scatterDist = 30 + Math.random() * 50;
                        v.idleTarget = {
                            x: v.x + Math.cos(scatterAngle) * scatterDist,
                            y: v.y + Math.sin(scatterAngle) * scatterDist
                        };

                        this.engine.addLog(`[物流] ${targetBuilding.name || targetBuilding.type1} 目前沒有可用派駐空位，${v.configName || '工人'} 在門口待命。`, 'LOGISTICS');
                    }
                } else {
                    const approach = this.getBuildingApproachPoint(v, v.factoryTarget, 30);
                    this.moveDetailed(v, approach.x, approach.y, moveSpeed, deltaTime, factoryIgnoreEnts);
                }
                break;
            case 'WORKING_IN_FACTORY': {
                if (v.state === 'WORKING_IN_FACTORY') {
                    const state = window.GAME_STATE || (this.engine ? this.engine.state : null) || this.state;
                    let factory = null;
                    let fId = v.assignedWarehouseId || v.logisticsHomeId || v.targetId;
                    if (typeof fId === 'object' && fId !== null) fId = fId.id;
                    if (fId) factory = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === fId);

                    if (!factory) {
                        factory = state.mapEntities.find(e => {
                            const isValidNode = e.outputTargets || e.outputBuffer || this.isLogisticsStorageType(e.type1 || e.type);
                            return isValidNode && Math.hypot(e.x - v.x, e.y - v.y) < 60;
                        });
                        if (factory) v.assignedWarehouseId = factory.id || `${factory.type1}_${factory.x}_${factory.y}`;
                    }

                    const fType = factory ? String(factory.type1 || factory.type).toLowerCase() : '';
                    const isWarehouse = this.isLogisticsStorageType(fType);

                    if (factory && factory.outputTargets && factory.outputTargets.length > 0) {

                        // 每 100 幀隨機抽樣印出日誌，讓我們知道工人在想什麼
                        if (Math.random() < 0.01) {
                            console.log(`[除錯] 工人 ${v.id} 正在 ${factory.name || fType} 待命。是否為倉庫: ${isWarehouse}`);
                        }

                        if (isWarehouse) {
                            const conn = this.pickLogisticsConnectionForWorker(v, factory, factory.outputTargets, (candidate) => {
                                return candidate.filter && (state.resources[candidate.filter] || 0) >= 1;
                            });
                            if (conn) {
                                const resCount = state.resources[conn.filter] || 0;
                                if (Math.random() < 0.01) console.log(`[除錯] 檢查連線 -> 過濾器: ${conn.filter}, 全域庫存: ${resCount}`);

                                const workKey = `${conn.id || ''}|${conn.filter || ''}`;
                                if (v.logisticsWorkKey !== workKey) {
                                    v.logisticsWorkKey = workKey;
                                    v.logisticsWorkTimer = 0;
                                }

                                const workTime = this.getIngredientProductionTime(conn.filter, 1);
                                v.logisticsWorkTimer = (v.logisticsWorkTimer || 0) + deltaTime;
                                if (v.logisticsWorkTimer < workTime) {
                                    break;
                                }

                                v.logisticsWorkTimer = 0;
                                v.logisticsWorkKey = null;

                                state.resources[conn.filter] -= 1;
                                v.cargoType = conn.filter;
                                v.cargoAmount = 1;
                                v.state = 'TRANSPORTING_LOGISTICS';
                                v.logisticsTargetId = conn.id;
                                v.logisticsSourceId = factory.id || `${factory.type1}_${factory.x}_${factory.y}`;
                                v.logisticsHomeId = factory.id || `${factory.type1}_${factory.x}_${factory.y}`;
                                v._logisticsTransportKey = null;
                                this.markWorkerOutsideBuilding(v, factory);
                                const logisticsTarget = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === conn.id);
                                if (logisticsTarget) this.placeWorkerAtLogisticsEndpoint(v, factory, logisticsTarget, 'source');

                                // [修復 2] 雙重保證顯示工人 (邏輯與 Phaser 渲染層)
                                v.visible = true;
                                if (v.sprite && typeof v.sprite.setVisible === 'function') v.sprite.setVisible(true);
                                if (v.gameObject && typeof v.gameObject.setVisible === 'function') v.gameObject.setVisible(true);

                                const routeNumber = (conn._balancedIndex ?? 0) + 1;
                                if (this.engine) this.engine.addLog(`[物流] ${factory.name || factory.type1} 派出 ${v.configName || '工人'}，送出 ${conn.filter} 至第 ${routeNumber} 條路線。`, 'LOGISTICS');
                                console.log(`[成功] 工人 ${v.id} 帶著 ${conn.filter} 出門了！`);
                            } else {
                                v.logisticsWorkTimer = 0;
                                v.logisticsWorkKey = null;
                            }
                        } else if (factory.outputBuffer) {
                            for (let resType in factory.outputBuffer) {
                                if (factory.outputBuffer[resType] >= 1) {
                                    let validConn = this.pickLogisticsConnectionForWorker(v, factory, factory.outputTargets, (candidate) => {
                                        return !candidate.filter || candidate.filter === resType;
                                    });
                                    if (!validConn && v.logisticsSourceId) {
                                        validConn = { id: v.logisticsSourceId, filter: resType, isFallbackReturn: true };
                                    }
                                    if (validConn) {
                                        factory.outputBuffer[resType] -= 1;
                                        v.cargoType = resType;
                                        v.cargoAmount = 1;
                                        v.state = 'TRANSPORTING_LOGISTICS';
                                        v.logisticsTargetId = validConn.id;
                                        v.logisticsHomeId = factory.id || `${factory.type1}_${factory.x}_${factory.y}`;
                                        v._logisticsTransportKey = null;
                                        this.markWorkerOutsideBuilding(v, factory);
                                        const logisticsTarget = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === validConn.id);
                                        if (logisticsTarget) this.placeWorkerAtLogisticsEndpoint(v, factory, logisticsTarget, 'source');
                                        v.visible = true;
                                        if (v.sprite && typeof v.sprite.setVisible === 'function') v.sprite.setVisible(true);
                                        if (v.gameObject && typeof v.gameObject.setVisible === 'function') v.gameObject.setVisible(true);
                                        if (validConn.isFallbackReturn) {
                                            this.engine.addLog(`[物流] ${factory.name || factory.type1} 派出 ${v.configName || '工人'}，自動將 ${resType} 送回原來源建築。`, 'LOGISTICS');
                                        } else {
                                            this.engine.addLog(`[物流] ${factory.name || factory.type1} 派出 ${v.configName || '工人'}，搬運 ${resType}。`, 'LOGISTICS');
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    } else if (factory && !isWarehouse && factory.currentRecipe && !v.logisticsSourceId && !factory._missingOutputRouteLogged) {
                        this.engine.addLog(`[物流] ${factory.name || factory.type1} 尚未設定對外輸出路線，成品暫時無法搬出。`, 'LOGISTICS');
                        factory._missingOutputRouteLogged = true;
                    }
                }
                v.pathTarget = null; v.fullPath = null; break;
            }
            case 'TRANSPORTING_LOGISTICS': {
                const state = window.GAME_STATE || (this.engine ? this.engine.state : null) || this.state;
                const target = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === v.logisticsTargetId);
                if (!target) {
                    v.state = 'RETURNING_TO_FACTORY'; break;
                }
                const homeForTransport = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === v.logisticsHomeId);
                if (homeForTransport) {
                    const transportKey = `${v.logisticsHomeId || ''}->${v.logisticsTargetId || ''}:${v.cargoType || ''}:${v.cargoAmount || 0}`;
                    if (v._logisticsTransportKey !== transportKey) {
                        this.placeWorkerAtLogisticsEndpoint(v, homeForTransport, target, 'source');
                        v._logisticsTransportKey = transportKey;
                    }
                }

                // 相容多種移動方法呼叫
                const logisticsMoveSpeed = this.getUnitMoveSpeed(v, false);
                const logisticsIgnoreEnts = [...ignoreEnts, target];
                if (homeForTransport) logisticsIgnoreEnts.push(homeForTransport);
                const transportEndpoint = homeForTransport
                    ? this.moveAlongLogisticsLine(v, homeForTransport, target, 'target', logisticsMoveSpeed, deltaTime, logisticsIgnoreEnts)
                    : null;
                if (!transportEndpoint) {
                    const targetApproach = this.getBuildingApproachPoint(v, target, 30);
                    if (typeof this.moveDetailed === 'function') this.moveDetailed(v, targetApproach.x, targetApproach.y, logisticsMoveSpeed, deltaTime, logisticsIgnoreEnts);
                    else if (typeof this.moveTowards === 'function') this.moveTowards(v, targetApproach.x, targetApproach.y, logisticsMoveSpeed, deltaTime, logisticsIgnoreEnts);
                }

                const reachedTransportEnd = transportEndpoint && Math.hypot(v.x - transportEndpoint.x, v.y - transportEndpoint.y) < 8;
                if (reachedTransportEnd || this.isTouchingBuilding(v, target, 40)) {
                    if (homeForTransport) this.placeWorkerAtLogisticsEndpoint(v, homeForTransport, target, 'target');
                    if (!target.inputBuffer) target.inputBuffer = {};
                    const tType = target.type1 || target.type;
                    const deliveredCargoType = v.cargoType;
                    const deliveredCargoAmount = v.cargoAmount;
                    if (v.cargoAmount > 0 && v.cargoType) {
                        if (['warehouse', 'barn', 'town_center', 'village', 'storehouse'].includes(tType)) {
                            state.resources[v.cargoType] = (state.resources[v.cargoType] || 0) + v.cargoAmount;
                        } else {
                            target.inputBuffer[v.cargoType] = (target.inputBuffer[v.cargoType] || 0) + v.cargoAmount;
                            const targetCfg = this.engine.getBuildingConfig(target.type1 || target.type, target.lv || 1);
                            if (targetCfg && targetCfg.type2 === 'processing_plant') {
                                const recipeType = target.currentRecipe ? target.currentRecipe.type : null;
                                const ingCfg = recipeType && state.ingredientConfigs ? state.ingredientConfigs[recipeType] : null;
                                const needIds = ingCfg && ingCfg.need_ingredients ? Object.keys(ingCfg.need_ingredients) : [];
                                const bufferIds = Object.keys(target.inputBuffer || {});
                                const cargoType = v.cargoType;
                                const matchesRecipe = !recipeType || needIds.length === 0 || needIds.includes(cargoType);
                                const mismatchNote = matchesRecipe ? '符合' : '不符合';
                                this.engine.addLog(
                                    `[物流] 送達加工廠檢查：cargoType=${cargoType}, currentRecipeType=${recipeType || 'null'}, needIngredientTypes=[${needIds.join(', ') || 'none'}], inputBufferTypes=[${bufferIds.join(', ') || 'empty'}] -> ${mismatchNote}目前配方。`,
                                    'LOGISTICS'
                                );
                            }
                        }
                        this.engine.addLog(`[物流] 資源已送達 ${target.name || target.type1} (cargo=${v.cargoType}, amount=${v.cargoAmount})`, 'LOGISTICS');
                    }

                    v.cargoType = null;
                    v.cargoAmount = 0;
                    v.state = 'RETURNING_TO_FACTORY';
                    v.pathTarget = null;
                    v.fullPath = null;
                    this.engine.addLog(`[物流] ${v.configName || '工人'} 已將 ${deliveredCargoType || '資源'} x${deliveredCargoAmount || 0} 送達 ${target.name || target.type1}，正在返回原建築繼續搬運。`, 'LOGISTICS');
                }
                break;
            }
            case 'RETURNING_TO_FACTORY': {
                const state = window.GAME_STATE || (this.engine ? this.engine.state : null) || this.state;
                const home = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === v.logisticsHomeId);
                if (!home) {
                    v.state = 'IDLE'; break;
                }
                const targetForReturn = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === v.logisticsTargetId);

                const returnMoveSpeed = this.getUnitMoveSpeed(v, false);
                const homeIgnoreEnts = [...ignoreEnts, home];
                if (targetForReturn) homeIgnoreEnts.push(targetForReturn);
                const returnEndpoint = targetForReturn
                    ? this.moveAlongLogisticsLine(v, home, targetForReturn, 'source', returnMoveSpeed, deltaTime, homeIgnoreEnts)
                    : null;
                if (!returnEndpoint) {
                    const homeApproach = this.getBuildingApproachPoint(v, home, 30);
                    if (typeof this.moveDetailed === 'function') this.moveDetailed(v, homeApproach.x, homeApproach.y, returnMoveSpeed, deltaTime, homeIgnoreEnts);
                    else if (typeof this.moveTowards === 'function') this.moveTowards(v, homeApproach.x, homeApproach.y, returnMoveSpeed, deltaTime, homeIgnoreEnts);
                }

                const reachedReturnEnd = returnEndpoint && Math.hypot(v.x - returnEndpoint.x, v.y - returnEndpoint.y) < 8;
                if (reachedReturnEnd || this.isTouchingBuilding(v, home, 40)) {
                    if (targetForReturn) this.placeWorkerAtLogisticsEndpoint(v, home, targetForReturn, 'source');
                    if (this.tryEnterLogisticsBuilding(v, home, 'home')) {
                        break;
                    }

                    const retryTarget = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === v.logisticsTargetId);
                    if (retryTarget) {
                        v.state = 'TRANSPORTING_LOGISTICS';
                        this.engine.addLog(`[物流] ${home.name || home.type1} 目前無空位，${v.configName || '工人'} 改為再次嘗試 ${retryTarget.name || retryTarget.type1}。`, 'LOGISTICS');
                    } else {
                        v.state = 'IDLE';
                        this.engine.addLog(`[物流] 原建築與目標建築皆不可進入，${v.configName || '工人'} 暫時待命。`, 'LOGISTICS');
                    }
                }
                break;
            }
            case 'IDLE':
                if (v.vTint !== 0xffffff) v.vTint = 0xffffff;
                if (v.idleTarget) {
                    this.moveDetailed(v, v.idleTarget.x, v.idleTarget.y, moveSpeed, deltaTime, ignoreEnts);
                    if (Math.hypot(v.x - v.idleTarget.x, v.y - v.idleTarget.y) < 10) {
                        v.idleTarget = null;
                        v.commandCenter = null;
                        v.isPlayerLocked = false;
                        v._isRallyMovement = false;
                        v.rallySourceBuildingId = null;
                        v.waitTimer = 1 + Math.random() * 2;
                        v.pathTarget = null;
                        v.fullPath = null;
                        v.pathIndex = 0;
                    }
                }
                break;
            case 'CHASE':
                if (v.idleTarget) {
                    this.moveDetailed(v, v.idleTarget.x, v.idleTarget.y, moveSpeed, deltaTime, ignoreEnts);
                }
                break;
            case 'ATTACK':
                v.pathTarget = null;
                v.fullPath = null;
                break;
            case 'MOVING_TO_RESOURCE':
                let searchX = v.x, searchY = v.y;
                if (v.assignedWarehouseId) {
                    const w = this.state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === v.assignedWarehouseId);
                    if (w) { searchX = w.x; searchY = w.y; }
                }

                let target = v.targetId;
                const isEntityResource = target && (target.type1 === 'farmland' || target.type1 === 'tree_plantation');

                if (!target || (target.gx === undefined && !isEntityResource)) {
                    if (typeof target === 'string') {
                        const ent = this.state.mapEntities.find(e => e.id === target);
                        if (ent) target = ent;
                        else target = ResourceSystem.findNearestResource(this.state, 20, searchX, searchY, v.type, v.id);
                    } else {
                        target = ResourceSystem.findNearestResource(this.state, 20, searchX, searchY, v.type, v.id);
                    }
                } else if (target.gx !== undefined) {
                    const res = this.state.mapData.getResource(target.gx, target.gy);
                    if (!res || res.amount <= 0) target = ResourceSystem.findNearestResource(this.state, 20, searchX, searchY, v.type, v.id);
                } else if (isEntityResource) {
                    if (target.amount <= 0) target = ResourceSystem.findNearestResource(this.state, 20, searchX, searchY, v.type, v.id);
                }

                if (target) {
                    if (!ignoreEnts.includes(target)) ignoreEnts.push(target);
                    if (!v.gatherPoint || v._lastTargetId !== (target.id || `${target.gx}_${target.gy}`)) {
                        v._lastTargetId = (target.id || `${target.gx}_${target.gy}`);
                        this.engine.addLog(`[尋路更新] ${v.configName || '工人'} 定位目標資源...`, 'PATH');

                        if (target.type1 === 'farmland' || target.type1 === 'tree_plantation') {
                            v.gatherPoint = {
                                x: target.x + (Math.random() - 0.5) * 50,
                                y: target.y + (Math.random() - 0.5) * 50
                            };
                        } else {
                            let rRadius = 25;
                            const rCfg = this.state.resourceConfigs.find(c => c.type === (target.resourceType || target.type1));
                            if (rCfg && rCfg.pixel_size) {
                                rRadius = (Math.max(rCfg.pixel_size.w, rCfg.pixel_size.h) / 2) + 15;
                            }
                            let baseAngle = Math.atan2(v.y - target.y, v.x - target.x);
                            baseAngle += (Math.random() - 0.5) * 2.8;
                            v.gatherPoint = {
                                x: target.x + Math.cos(baseAngle) * rRadius,
                                y: target.y + Math.sin(baseAngle) * rRadius
                            };
                        }
                    }

                    const distToGather = Math.hypot(v.gatherPoint.x - v.x, v.gatherPoint.y - v.y);
                    if (distToGather < 15) {
                        if (v.cargo > 0) {
                            v.nextStateAfterDeposit = 'MOVING_TO_RESOURCE';
                            v.nextTargetAfterDeposit = target;
                            v.nextTypeAfterDeposit = v.type;
                            v.state = 'MOVING_TO_BASE';
                            v.pathTarget = null;
                            v.gatherPoint = null;
                        } else {
                            this.engine.addLog(`[任務啟動] ${v.configName || '工人'} 已抵達資源點並開始採集 ${target.name || target.type1}`, 'TASK');
                            v.state = 'GATHERING'; v.targetId = target; v.gatherTimer = 0; v.pathTarget = null;
                            v.commandCenter = null;
                            v.gatherPoint = null;
                        }
                    } else {
                        if (!v._lastLogPath || v._lastLogPath !== (target.id || 'target')) {
                            this.engine.addLog(`[尋路目標] ${v.configName || '工人'} 正在前往目標 (${Math.round(v.gatherPoint.x)}, ${Math.round(v.gatherPoint.y)})`, 'PATH');
                            v._lastLogPath = (target.id || 'target');
                        }
                        this.moveDetailed(v, v.gatherPoint.x, v.gatherPoint.y, moveSpeed, deltaTime, ignoreEnts);
                    }
                } else { v.state = 'IDLE'; v.pathTarget = null; v.gatherPoint = null; v.workOffset = null; v.vTint = 0xffffff; }
                break;
            case 'GATHERING':
                v.gatherTimer += deltaTime;
                const harvestTime = this.getGatheringProductionTime(v);
                if (!v.targetId) {
                    v.state = 'IDLE';
                    v.pathTarget = null;
                    v.isPlayerLocked = false;
                    break;
                }

                if (v.gatherTimer >= harvestTime) {
                    let harvestTotal = 5;
                    if (v.targetId.gx !== undefined && v.targetId.gy !== undefined) {
                        const res = this.state.mapData.getResource(v.targetId.gx, v.targetId.gy);
                        if (res) {
                            const typeName = ResourceSystem.getResourceTypeName(res.type);
                            const cfg = this.state.resourceConfigs.find(c => c.type === typeName && c.lv === (res.level || 1));
                            if (cfg && cfg.collection_resource) harvestTotal = cfg.collection_resource;
                        }
                    } else {
                        let targetEnt = (typeof v.targetId === 'string') ?
                            this.state.mapEntities.find(e => e.id === v.targetId) :
                            (this.state.mapEntities.includes(v.targetId) ? v.targetId : null);
                        if (targetEnt) {
                            const cfg = this.engine.getEntityConfig(targetEnt.type1, targetEnt.lv || 1);
                            if (cfg && cfg.collection_resource) {
                                harvestTotal = cfg.collection_resource;
                            }
                        }
                    }

                    if (v.targetId.gx !== undefined && v.targetId.gy !== undefined) {
                        const resBeforeConsume = this.state.mapData.getResource(v.targetId.gx, v.targetId.gy);
                        if (resBeforeConsume && resBeforeConsume.type) v.targetId._lastResType = resBeforeConsume.type;
                        const consumed = this.state.mapData.consumeResource(v.targetId.gx, v.targetId.gy, harvestTotal);
                        v.cargo = consumed;
                        let targetCargoType = v.type || 'food';
                        const res = this.state.mapData.getResource(v.targetId.gx, v.targetId.gy);
                        if (v.targetId.gx !== undefined) {
                            const tType = res ? res.type : v.targetId._lastResType;
                            v.targetId._lastResType = tType;
                            if (tType) {
                                const typeName = ResourceSystem.getResourceTypeName(tType);
                                const cfg = this.state.resourceConfigs.find(c => c.type === typeName);
                                if (cfg && cfg.ingredients && Object.keys(cfg.ingredients).length > 0) {
                                    targetCargoType = Object.keys(cfg.ingredients)[0];
                                }
                            }
                        }
                        v.cargoType = targetCargoType;
                        this.state.renderVersion++;

                        if (consumed <= 0) {
                            v.targetId = null;
                            v.gatherPoint = null;
                            v.state = 'MOVING_TO_RESOURCE';
                            v.vTint = 0xffffff;
                        } else {
                            v.state = 'MOVING_TO_BASE';
                        }
                        v.pathTarget = null;
                        v.gatherTimer = 0;
                    } else {
                        const targetEnt = (typeof v.targetId === 'string') ?
                            this.state.mapEntities.find(e => e.id === v.targetId) :
                            (this.state.mapEntities.includes(v.targetId) ? v.targetId : null);

                        if (targetEnt) {
                            const canTake = Math.min(harvestTotal, targetEnt.amount);
                            targetEnt.amount -= canTake;
                            this.state.renderVersion++;

                            if (targetEnt.type1 === 'corpse') {
                                this.engine.addLog(`[戰鬥資訊] 採集屍體資源：${v.configName || '工人'} 正在採集 ${targetEnt.name || '屍體'} (獲得 ${targetEnt.resType} x${canTake})`, 'GATHER');
                                v.cargo += canTake;
                                v.cargoType = targetEnt.resType || 'FOOD';
                                if (v.cargo >= 5 || targetEnt.amount <= 0) {
                                    this.engine.addLog(`[採集完成] ${v.configName || '工人'} 已採得充足 ${v.cargoType.toUpperCase()}，正在返回基地`, 'TASK');
                                    v.state = 'MOVING_TO_BASE';
                                    if (targetEnt.amount <= 0) v._lastTaskWasCorpse = true;
                                }
                            } else {
                                if (targetEnt.type1 === 'farmland') this.state.resources.food += canTake;
                                else if (targetEnt.type1 === 'tree_plantation') this.state.resources.wood += canTake;
                                v.cargo = 0;
                                v.cargoType = null;
                            }

                            v.gatherTimer = 0;
                            if (targetEnt.amount <= 0) {
                                this.engine.addLog(`${targetEnt.name || '資源點'} 已採集完畢。`, 'SYSTEM');
                                if (targetEnt.type1 === 'corpse') {
                                    this.state.mapEntities = this.state.mapEntities.filter(e => e !== targetEnt);
                                    if (this.engine.updatePathfindingGrid) this.engine.updatePathfindingGrid();
                                    this.state.renderVersion++;
                                    v._lastTaskWasCorpse = true;
                                } else {
                                    targetEnt.isUnderConstruction = true;
                                    targetEnt.buildProgress = 0;
                                    targetEnt.name = "施工中 (" + (targetEnt.type1 === 'farmland' ? "農田" : "樹木田") + ")";
                                    if (this.engine.updatePathfindingGrid) this.engine.updatePathfindingGrid();
                                }
                                v.targetId = null;
                                v.gatherPoint = null;

                                if (targetEnt.type1 !== 'corpse') {
                                    this.restoreVillagerTask(v);
                                } else if (v.state !== 'MOVING_TO_BASE') {
                                    v.state = 'IDLE';
                                }
                            }
                        } else {
                            v.state = 'IDLE';
                            v.targetId = null;
                        }
                    }
                }
                break;
            case 'MOVING_TO_BASE':
                if (!v.targetBase) {
                    const nearestTC = this.state.mapEntities.find(e => e.type1 === 'town_center' || e.type1 === 'village');
                    if (nearestTC) {
                        v.targetBase = nearestTC;
                        v.pathTarget = null;
                    } else {
                        v.state = 'IDLE'; v.pathTarget = null;
                    }
                    break;
                }

                const cfgB = this.engine.getBuildingConfig(v.targetBase.type1, v.targetBase.lv || 1);
                let depositDist = 25;
                let uw = 1, uh = 1;
                if (cfgB && cfgB.size) {
                    const m = cfgB.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/);
                    if (m) {
                        uw = parseInt(m[1]);
                        uh = parseInt(m[2]);
                    }
                }

                const baseId = v.targetBase.id || `${v.targetBase.type1}_${v.targetBase.x}_${v.targetBase.y}`;
                if (!v.depositPoint || v._lastBaseId !== baseId) {
                    v._lastBaseId = baseId;
                    const pts = [];
                    const w = uw * 20 + 20;
                    const h = uh * 20 + 20;
                    const bx = v.targetBase.x;
                    const by = v.targetBase.y;

                    const steps = 4;
                    for (let i = 0; i < steps; i++) pts.push({ x: bx - w / 2 + (w / steps) * i, y: by - h / 2 });
                    for (let i = 0; i < steps; i++) pts.push({ x: bx + w / 2, y: by - h / 2 + (h / steps) * i });
                    for (let i = 0; i < steps; i++) pts.push({ x: bx + w / 2 - (w / steps) * i, y: by + h / 2 });
                    for (let i = 0; i < steps; i++) pts.push({ x: bx - w / 2, y: by + h / 2 - (h / steps) * i });

                    let nearestPt = { x: bx, y: by };
                    let minDistSq = Infinity;
                    for (const p of pts) {
                        const dSq = (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
                        if (dSq < minDistSq) {
                            minDistSq = dSq;
                            nearestPt = p;
                        }
                    }

                    if (!v.workOffset) {
                        const idNumInv = parseInt((v.id || "0").replace(/[^0-9]/g, '')) || 0;
                        const angleInv = (idNumInv * 137.5) * (Math.PI / 180);
                        v.workOffset = { x: Math.cos(angleInv) * 15, y: Math.sin(angleInv) * 15 };
                    }
                    v.depositPoint = {
                        x: nearestPt.x + v.workOffset.x,
                        y: nearestPt.y + v.workOffset.y
                    };
                }

                const distB = Math.hypot(v.depositPoint.x - v.x, v.depositPoint.y - v.y);
                if (distB < depositDist) {
                    ResourceSystem.depositResource(this.state, v.cargoType || v.type, v.cargo, this.engine.addLog.bind(this.engine));
                    v.cargo = 0; v.cargoType = null; v.pathTarget = null;
                    v.depositPoint = null; v._lastBaseId = null;
                    v.commandCenter = null;
                    v.vTint = 0xffffff;
                    if (v.nextStateAfterDeposit) {
                        v.state = v.nextStateAfterDeposit;
                        v.nextStateAfterDeposit = null;
                        if (v.nextTypeAfterDeposit) { v.type = v.nextTypeAfterDeposit; v.nextTypeAfterDeposit = null; }
                        if (v.nextTargetAfterDeposit) { v.targetId = v.nextTargetAfterDeposit; v.nextTargetAfterDeposit = null; }
                        this.engine.addLog(`[存入完成] ${v.configName || '工人'} 任務恢復，前往資源點`, 'TASK');
                    } else if (v.isRecalled || v._lastTaskWasCorpse) {
                        v.state = 'IDLE';
                        v.isRecalled = false;
                        v.idleTarget = null;
                        v.isPlayerLocked = v._lastTaskWasCorpse;
                        v._lastTaskWasCorpse = false;
                        if (v.isPlayerLocked) this.engine.addLog(`[存入完成] ${v.configName || '工人'} 已存完屍體資源，目前原地待命`, 'TASK');
                    } else {
                        v.state = 'MOVING_TO_RESOURCE';
                        this.engine.addLog(`[存入完成] ${v.configName || '工人'} 已清空背包，繼續採集`, 'TASK');
                    }
                } else {
                    this.moveDetailed(v, v.depositPoint.x, v.depositPoint.y, moveSpeed, deltaTime, ignoreEnts);
                }
                break;
            case 'MOVING_TO_CONSTRUCTION':
                if (!v.constructionTarget || !this.state.mapEntities.includes(v.constructionTarget) || !v.constructionTarget.isUnderConstruction) {
                    v.constructionTarget = null;
                    v.pathTarget = null;
                    if (!this.assignNextConstructionTask(v)) {
                        this.restoreVillagerTask(v);
                    }
                    return;
                }

                const idNumC = parseInt((v.id || "0").replace(/[^0-9]/g, '')) || 0;
                const fpC = this.getFootprint(v.constructionTarget.type1);
                const halfWC = (fpC.uw * 20) / 2;
                const halfHC = (fpC.uh * 20) / 2;

                if (!v._stableConstructionTarget || Math.hypot(v.x - (v._lastUnitPosX || 0), v.y - (v._lastUnitPosY || 0)) > 50) {
                    const dxC = v.x - v.constructionTarget.x;
                    const dyC = v.y - v.constructionTarget.y;
                    let txC = v.constructionTarget.x, tyC = v.constructionTarget.y;

                    if (Math.abs(dxC) > Math.abs(dyC)) {
                        txC = dxC > 0 ? (v.constructionTarget.x + halfWC + 10) : (v.constructionTarget.x - halfWC - 10);
                        const spreadY = (idNumC % 5 - 2) * (halfHC * 0.7);
                        tyC = v.constructionTarget.y + spreadY;
                    } else {
                        tyC = dyC > 0 ? (v.constructionTarget.y + halfHC + 10) : (v.constructionTarget.y - halfHC - 10);
                        const spreadX = (idNumC % 5 - 2) * (halfWC * 0.7);
                        txC = v.constructionTarget.x + spreadX;
                    }
                    v._stableConstructionTarget = { x: txC, y: tyC };
                    v._lastUnitPosX = v.x;
                    v._lastUnitPosY = v.y;
                }

                const txC_pos = v._stableConstructionTarget.x;
                const tyC_pos = v._stableConstructionTarget.y;

                const distC = Math.hypot(txC_pos - v.x, tyC_pos - v.y);
                const buildingDist = Math.hypot(v.constructionTarget.x - v.x, v.constructionTarget.y - v.y);
                if (distC < 35 || buildingDist < (Math.max(halfWC, halfHC) + 15)) {
                    v.state = 'CONSTRUCTING';
                    v.pathTarget = null;
                    v.commandCenter = null;
                    v._stableConstructionTarget = null;
                } else {
                    this.moveDetailed(v, txC_pos, tyC_pos, moveSpeed, deltaTime, ignoreEnts);
                }
                break;
            case 'CONSTRUCTING':
                if (!v.constructionTarget || !this.state.mapEntities.includes(v.constructionTarget) || !v.constructionTarget.isUnderConstruction) {
                    v.constructionTarget = null;
                    if (!this.assignNextConstructionTask(v)) {
                        this.restoreVillagerTask(v);
                    }
                    return;
                }

                v.constructionTarget.name = "施工中";
                v.constructionTarget.buildProgress += deltaTime;
                const targetBuildTime = Math.max(0.1, v.constructionTarget.buildTime || 5);

                if (v.constructionTarget.buildProgress >= targetBuildTime) {
                    const finishedBuilding = v.constructionTarget;
                    finishedBuilding.isUnderConstruction = false;
                    this.state.renderVersion++;
                    const type1 = finishedBuilding.type1;
                    const bCfg = this.engine.getBuildingConfig(type1, 1);
                    finishedBuilding.name = bCfg ? bCfg.name : type1;

                    if (type1 === 'farmland' || type1 === 'tree_plantation') {
                        finishedBuilding.resourceType = (type1 === 'farmland' ? 'FOOD' : 'WOOD');
                        finishedBuilding.amount = bCfg ? (bCfg.resourceValue || 500) : 500;
                    }

                    if (type1 === 'farmhouse') this.state.buildings.farmhouse++;
                    this.engine.addLog(`建造完成：${finishedBuilding.name}。`);

                    if (this.engine.updatePathfindingGrid) this.engine.updatePathfindingGrid();

                    const allUnitsForUnstuck = [...this.state.units.villagers, ...(this.state.units.npcs || [])];
                    allUnitsForUnstuck.forEach(vi => {
                        const ignore = [vi.targetId, vi.targetBase].filter(Boolean);
                        if (this.isColliding(vi.x, vi.y, ignore) === finishedBuilding) {
                            this.resolveStuck(vi);
                        }
                    });

                    if (['timber_factory', 'stone_factory', 'barn', 'gold_mining_factory'].includes(type1)) {
                        v.assignedWarehouseId = (finishedBuilding.id || `${finishedBuilding.type1}_${finishedBuilding.x}_${finishedBuilding.y}`);
                        v.type = (type1 === 'timber_factory' ? 'WOOD' : (type1 === 'stone_factory' ? 'STONE' : (type1 === 'barn' ? 'FOOD' : 'GOLD')));
                        v.state = 'MOVING_TO_RESOURCE';
                        v.targetId = null; v.pathTarget = null; v.prevTask = null; v.constructionTarget = null;
                        this.engine.addLog(`建造者已自動轉為 ${finishedBuilding.name} 的專職員工。`);
                    } else if (type1 === 'farmland' || type1 === 'tree_plantation') {
                        v.assignedWarehouseId = (finishedBuilding.id || `${finishedBuilding.type1}_${finishedBuilding.x}_${finishedBuilding.y}`);
                        v.type = (type1 === 'farmland' ? 'FOOD' : 'WOOD');
                        v.state = 'MOVING_TO_RESOURCE'; v.targetId = finishedBuilding; v.gatherTimer = 0; v.pathTarget = null; v.prevTask = null; v.constructionTarget = null;
                        v.workOffset = { x: (Math.random() - 0.5) * 50, y: (Math.random() - 0.5) * 50 };
                        this.engine.addLog(`建造者前往${type1 === 'farmland' ? '農田' : '樹木田'}內部開始工作。`);
                    } else {
                        if (!this.assignNextConstructionTask(v)) {
                            this.restoreVillagerTask(v);
                            v.constructionTarget = null;
                            if (v.state === 'IDLE') {
                                const angle = Math.random() * Math.PI * 2;
                                const dist = 30 + Math.random() * 40;
                                v.idleTarget = {
                                    x: v.x + Math.cos(angle) * dist,
                                    y: v.y + Math.sin(angle) * dist
                                };
                            }
                            this.engine.addLog(`建造清單已清空，工人們嘗試散開並待命。`);
                        }
                    }
                }
                break;
        }

        const collidingEnt = this.isColliding(v.x, v.y, ignoreEnts, v.width, v.height);
        if (collidingEnt) {
            const wasColliding = this.isColliding(oldX, oldY, ignoreEnts);
            if (wasColliding !== collidingEnt) {
                v.x = oldX; v.y = oldY; v.pathTarget = null;
                v._stuckFrames = (v._stuckFrames || 0) + 1;
                if (v._stuckFrames > 12) {
                    this.resolveStuck(v);
                }
            } else {
                this.resolveStuck(v);
            }
        } else {
            if (Math.hypot(v.x - oldX, v.y - oldY) > 0.1) {
                v._stuckFrames = 0;
            } else if (v.state.startsWith('MOVING')) {
                v._stuckFrames = (v._stuckFrames || 0) + 1;
                if (v._stuckFrames > 15) {
                    this.resolveStuck(v);
                }
            }
        }

        if (v.state === 'IDLE' && collidingEnt) {
            v.idleTarget = null;
            v.commandCenter = null;
            v.isPlayerLocked = false;
        }

        // 已移除冗餘的 MOVING_TO_BASE 邏輯，相關功能已整合至 switch 狀態機中。
    }

    restoreVillagerTask(v) {
        v.isPlayerLocked = false;
        if (v.prevTask) {
            v.state = v.prevTask.state;
            v.targetId = v.prevTask.targetId;
            v.type = v.prevTask.type;
            v.prevTask = null;
        } else {
            v.state = 'IDLE';
            this.assignNextTask(v);
        }
        v.pathTarget = null;
    }

    assignNextTask(v, keepCurrentIfNoneFound = false) {
        if (v.config.type !== 'villagers' || v.isRecalled) {
            v.state = 'IDLE';
            return;
        }

        const isSelected = (this.state.selectedUnitIds || []).includes(v.id);
        if (!isSelected && v.isPlayerLocked && (v.state.startsWith('MOVING_TO') || v.state === 'GATHERING' || v.state === 'CONSTRUCTING' || v.state === 'IDLE')) {
            return;
        }

        const warehouses = this.state.mapEntities.filter(e =>
            ['timber_factory', 'stone_factory', 'barn', 'gold_mining_factory', 'farmland', 'tree_plantation'].includes(e.type1) && !e.isUnderConstruction
        );

        if (v.assignedWarehouseId) {
            const myW = warehouses.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === v.assignedWarehouseId);
            if (myW && ResourceSystem.findNearestResource(this.state, 20, v.x, v.y, v.type, v.id)) {
                const currentWorkers = this.state.units.villagers.filter(vi => vi !== v && vi.assignedWarehouseId === v.assignedWarehouseId).length;
                if (currentWorkers < (myW.targetWorkerCount || 0)) {
                    v.state = 'MOVING_TO_RESOURCE';
                    v.targetId = null; v.pathTarget = null;
                    return;
                }
            }
            v.assignedWarehouseId = null;
        }

        for (const w of warehouses) {
            const winfo = (w.id || `${w.type1}_${w.x}_${w.y}`);
            const count = this.state.units.villagers.filter(vi => vi.assignedWarehouseId === winfo).length;
            if (count < (w.targetWorkerCount || 0)) {
                const resType = this.getGatheringResourceType(w);
                if (ResourceSystem.findNearestResource(this.state, 20, w.x, w.y, resType, v.id)) {
                    v.assignedWarehouseId = winfo;
                    v.type = resType;
                    v.state = 'MOVING_TO_RESOURCE';
                    v.targetId = null; v.pathTarget = null;
                    return;
                }
            }
        }

        if (this.state.currentGlobalCommand && this.state.currentGlobalCommand !== 'RETURN') {
            v.type = this.state.currentGlobalCommand;
            if (ResourceSystem.findNearestResource(this.state, 20, v.x, v.y, v.type, v.id)) {
                v.state = 'MOVING_TO_RESOURCE';
                v.targetId = null; v.pathTarget = null;
                return;
            }
        }

        v.state = 'IDLE';
    }

    assignNextConstructionTask(v) {
        if (!v || v.config?.type !== 'villagers') return false;
        const visionRadius = (v.field_vision || 15) * 20 * 2;
        const projects = this.state.mapEntities.filter(e =>
            e && e.isUnderConstruction && Math.hypot(v.x - e.x, v.y - e.y) <= visionRadius
        );

        if (projects.length === 0) return false;
        projects.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        const nextTarget = this.findBestConstructionProject(v, projects);

        if (nextTarget) {
            v.constructionTarget = nextTarget;
            v.state = 'MOVING_TO_CONSTRUCTION';
            v.pathTarget = null;
            v.isPlayerLocked = true;
            this.engine.addLog(`[連動] ${v.configName || '工人'} 已自動前往下一個工地。`);
            return true;
        }
        return false;
    }

    findBestConstructionProject(v, projects) {
        if (!projects || projects.length === 0) return null;
        const unassigned = projects.find(p => !this.state.units.villagers.some(other => other.constructionTarget === p));
        if (unassigned) return unassigned;

        let bestTarget = projects[0];
        let minWorkers = Infinity;
        projects.forEach(p => {
            const workerCount = this.state.units.villagers.filter(other => other.constructionTarget === p).length;
            if (workerCount < minWorkers) {
                minWorkers = workerCount;
                bestTarget = p;
            } else if (workerCount === minWorkers) {
                if ((p.priority || 0) < (bestTarget.priority || 0)) {
                    bestTarget = p;
                }
            }
        });
        return bestTarget;
    }

    moveDetailed(v, tx, ty, speed, dt, ignoreEnts = []) {
        const targetDist = !v._lastRequestedTarget ? 999 : Math.hypot(v._lastRequestedTarget.x - tx, v._lastRequestedTarget.y - ty);
        const now = Date.now();
        const lastPathTime = v._lastPathTime || 0;

        if (targetDist > 15 && !v.isFindingPath && this.state.pathfinding && (now - lastPathTime > 500)) {
            v._lastRequestedTarget = { x: tx, y: ty };
            v.isFindingPath = true;
            v._lastPathTime = now;
            const pathRequestId = (v._pathRequestId || 0) + 1;
            v._pathRequestId = pathRequestId;
            const isSelected = this.state.selectedUnitIds && this.state.selectedUnitIds.includes(v.id);
            if (isSelected) {
                this.engine.addLog(`[重新尋路] 距離目標: ${targetDist.toFixed(0)}`, 'PATH');
            }

            this.state.pathfinding.findPath(v.x, v.y, tx, ty, (path) => {
                if (v._pathRequestId !== pathRequestId) return;
                v.isFindingPath = false;
                if (path && path.length > 1) {
                    v.fullPath = path;
                    v.pathIndex = 1;
                } else if (!v.fullPath) {
                    v.fullPath = [];
                }
            });
        }

        let remainingDt = dt;
        let safetyCounter = 0;

        while (remainingDt > 0 && safetyCounter < 10) {
            safetyCounter++;
            const moveDist = speed * remainingDt;

            if (v.fullPath && v.pathIndex < v.fullPath.length) {
                const node = v.fullPath[v.pathIndex];
                const dx = node.x - v.x;
                const dy = node.y - v.y;
                const dist = Math.hypot(dx, dy);

                if (dist <= moveDist) {
                    const deltaX = node.x - v.x;
                    if (Math.abs(deltaX) > 0.01) v.facing = deltaX > 0 ? 1 : -1;
                    v.x = node.x;
                    v.y = node.y;
                    v.pathIndex++;
                    remainingDt -= dist / speed;
                } else if (dist > 0.01) {
                    const ratio = moveDist / dist;
                    const nextX = v.x + dx * ratio;
                    const nextY = v.y + dy * ratio;

                    const fullIgnore = [v, ...ignoreEnts];
                    if (!this.isColliding(nextX, nextY, fullIgnore)) {
                        v.x = nextX;
                        v.y = nextY;
                        if (Math.abs(dx) > 0.01) v.facing = dx > 0 ? 1 : -1;
                        v._stuckFrames = 0;
                    } else {
                        v._stuckFrames = (v._stuckFrames || 0) + 1;
                        v.fullPath = null;
                        v.isFindingPath = false;
                    }
                    remainingDt = 0;
                } else {
                    v.pathIndex++;
                }
            } else {
                this.moveTowards(v, tx, ty, speed * (v.isFindingPath ? 0.7 : 1.0), remainingDt, ignoreEnts);
                remainingDt = 0;
            }
        }
    }

    resolveStuck(v) {
        if (!this.state.pathfinding) return;
        const isSelected = this.state.selectedUnitIds && this.state.selectedUnitIds.includes(v.id);
        const oldX = v.x, oldY = v.y;
        const gx = Math.floor(v.x / 20);
        const gy = Math.floor(v.y / 20);
        const nearest = this.state.pathfinding.getNearestWalkableTile(gx, gy, 100, true, true);

        if (nearest) {
            v.x = nearest.x * 20 + 10 + (Math.random() - 0.5) * 4;
            v.y = nearest.y * 20 + 10 + (Math.random() - 0.5) * 4;
            v.fullPath = null;
            v.pathIndex = 0;
            v.pathTarget = null;
            v._lastRequestedTarget = null;
            v.isFindingPath = false;
            v._stuckFrames = -40;
            v._isRallyMovement = false;
            v.rallySourceBuildingId = null;

            if (v.idleTarget) {
                const d = Math.hypot(v.idleTarget.x - v.x, v.idleTarget.y - v.y);
                if (d < 60) v.idleTarget = { x: v.x, y: v.y };
            } else if (v.gatherPoint) {
                const d = Math.hypot(v.gatherPoint.x - v.x, v.gatherPoint.y - v.y);
                if (d < 50) v.gatherPoint = { x: v.x, y: v.y };
            } else if (v.depositPoint) {
                const d = Math.hypot(v.depositPoint.x - v.x, v.depositPoint.y - v.y);
                if (d < 50) v.depositPoint = { x: v.x, y: v.y };
            } else if (v._stableConstructionTarget) {
                const d = Math.hypot(v._stableConstructionTarget.x - v.x, v._stableConstructionTarget.y - v.y);
                if (d < 50) v._stableConstructionTarget = { x: v.x, y: v.y };
            }

            if (isSelected) {
                this.engine.addLog(`[防卡死修復] 已由 (${oldX.toFixed(0)},${oldY.toFixed(0)}) 移至 (${v.x.toFixed(0)}, ${v.y.toFixed(0)})`, "PATH");
            }
        } else {
            if (isSelected) {
                this.engine.addLog(`[防卡死失敗] 100格半徑內找不到脫困空間!`, 'PATH');
            }
        }
    }

    moveTowards(v, tx, ty, speed, dt, ignoreEnts = []) {
        const dx = tx - v.x, dy = ty - v.y;
        const dist = Math.hypot(dx, dy);
        const moveDist = speed * dt;

        if (dist > 0.1) {
            const ratio = Math.min(1, moveDist / dist);
            const nextX = v.x + dx * ratio;
            const nextY = v.y + dy * ratio;

            const fullIgnore = [v, ...ignoreEnts];
            if (!this.isColliding(nextX, nextY, fullIgnore)) {
                if (Math.abs(dx) > 0.1) v.facing = dx > 0 ? 1 : -1;
                v.x = nextX;
                v.y = nextY;
                v._stuckFrames = 0;
            } else {
                v._stuckFrames = (v._stuckFrames || 0) + 1;
                v.fullPath = null;
            }
        }
    }

    isColliding(x, y, ignoreEnts = [], unitW = 0, unitH = 0) {
        const grid = this.state.spatialGrid;
        if (!grid || !grid.cells) return null;

        const cellSize = grid.cellSize;
        const gx = Math.floor(x / cellSize);
        const gy = Math.floor(y / cellSize);

        for (let i = gx - 1; i <= gx + 1; i++) {
            for (let j = gy - 1; j <= gy + 1; j++) {
                const cell = grid.cells.get(`${i},${j}`);
                if (!cell) continue;

                for (const ent of cell) {
                    if (ent.isUnderConstruction) continue;
                    if (ignoreEnts.includes(ent)) continue;

                    const cfg = this.engine.getEntityConfig(ent.type1);
                    if (cfg && cfg.collision) {
                        if (!ent._collisionW) {
                            const match = cfg.size ? cfg.size.match(/\{[ ]*(\d+)[ ]*,[ ]*(\d+)[ ]*\}/) : null;
                            const uw = match ? parseInt(match[1]) : 1, uh = match ? parseInt(match[2]) : 1;
                            ent._collisionW = uw * 20;
                            ent._collisionH = uh * 20;
                        }

                        const collCfg = UI_CONFIG.BuildingCollision || { buffer: 10, feetOffset: 8 };
                        const effBufferW = Math.max(unitW / 2, (collCfg.buffer || 0) / 2);
                        const effBufferH = Math.max(unitH / 2, (collCfg.buffer || 0) / 2);

                        const w = ent._collisionW + effBufferW * 2, h = ent._collisionH + effBufferH * 2;
                        const FOOT_OFFSET = collCfg.feetOffset || 8;
                        const logicY = ent.y - FOOT_OFFSET;

                        if (x > ent.x - w / 2 + 0.1 && x < ent.x + w / 2 - 0.1 && y > logicY - h / 2 + 0.1 && y < logicY + h / 2 - 0.1) {
                            return ent;
                        }
                    }
                }
            }
        }

        if (this.state.mapData) {
            const searchGx = Math.floor(x / 20);
            const searchGy = Math.floor(y / 20);

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const gx = searchGx + dx, gy = searchGy + dy;
                    const res = this.state.mapData.getResource(gx, gy);
                    if (res) {
                        const level = this.state.mapData.levelGrid[this.state.mapData.getIndex(gx, gy)] || 1;
                        const cfg = this.state.resourceConfigs.find(c => c.type === ResourceSystem.getResourceTypeName(res.type) && c.lv === level);

                        if (cfg && cfg.pixel_size) {
                            const rx = gx * 20 + 10, ry = gy * 20 + 10;
                            const pw = cfg.pixel_size.w, ph = cfg.pixel_size.h;
                            if (x > rx - pw / 2 && x < rx + pw / 2 && y > ry - ph / 2 && y < ry + ph / 2) {
                                const isTarget = ignoreEnts && ignoreEnts.some(ign =>
                                    ign && (ign.gx === gx && ign.gy === gy) || ign.id === `${gx}_${gy}`
                                );
                                if (!isTarget) return { type: 'resource', gx, gy };
                            }
                        } else if (gx === searchGx && gy === searchGy) {
                            const isTarget = ignoreEnts && ignoreEnts.some(ign =>
                                ign && (ign.gx === gx && ign.gy === gy) || ign.id === `${gx}_${gy}`
                            );
                            if (!isTarget) return { type: 'resource', gx, gy };
                        }
                    }
                }
            }
        }
        return null;
    }

    updateWorkerAssignments() {
        const warehouses = this.state.mapEntities.filter(e => {
            if (e.isUnderConstruction) return false;
            const cfg = this.engine.getBuildingConfig(e.type1, e.lv || 1);
            // 只要配置檔有需求人數，或是具備物流輸入/輸出能力，就可以派駐工人
            return cfg && (cfg.need_villagers > 0 || (cfg.logistics && (cfg.logistics.canInput || cfg.logistics.canOutput)));
        });

        const warehouseMap = new Map();
        warehouses.forEach(w => warehouseMap.set(w.id || `${w.type1}_${w.x}_${w.y}`, { entity: w, workers: [] }));

        this.state.units.villagers.forEach(v => {
            if (!v.config || v.config.type !== 'villagers' || v.config.camp !== 'player') {
                v.assignedWarehouseId = null;
                return;
            }
            if (v.assignedWarehouseId) {
                const data = warehouseMap.get(v.assignedWarehouseId);
                if (!data) {
                    v.assignedWarehouseId = null;
                    v.state = 'IDLE';
                } else {
                    data.workers.push(v);
                }
            }
        });

        let allIdle = this.state.units.villagers.filter(v =>
            v.config && v.config.type === 'villagers' && v.config.camp === 'player' &&
            v.state === 'IDLE' && !v.assignedWarehouseId && !v.isRecalled && !v.isPlayerLocked
        );

        warehouseMap.forEach((data, wid) => {
            const { entity, workers } = data;
            const target = entity.targetWorkerCount || 0;
            if (workers.length > target) {
                const overflow = workers.slice(target);
                overflow.forEach(v => {
                    if (entity.assignedWorkers) {
                        entity.assignedWorkers = entity.assignedWorkers.filter(id => id !== v.id);
                    }
                    v.assignedWarehouseId = null;
                    v.factoryTarget = null;
                    v.targetId = null;
                    v.pathTarget = null;
                    v.fullPath = null;
                    v.visible = true;
                    if (v.sprite && typeof v.sprite.setVisible === 'function') v.sprite.setVisible(true);
                    if (v.gameObject && typeof v.gameObject.setVisible === 'function') v.gameObject.setVisible(true);
                    this.engine.addLog(`[派駐釋放] ${v.configName || '工人'} 已從 ${entity.name || entity.type1} 解除派駐。`, 'TASK');
                    this.assignNextTask(v);
                    if (v.state === 'IDLE') allIdle.push(v);
                });
                data.workers = workers.slice(0, target);
            }
        });

        let needsRefill = true;
        while (needsRefill && allIdle.length > 0) {
            needsRefill = false;
            warehouseMap.forEach((data, wid) => {
                const { entity, workers } = data;
                const target = entity.targetWorkerCount || 0;
                if (workers.length < target && allIdle.length > 0) {
                    const v = allIdle.shift();
                    if (this.isGatheringBuilding(entity)) {
                        v.assignedWarehouseId = wid;
                        v.type = this.getGatheringResourceType(entity);
                        v.state = 'MOVING_TO_RESOURCE';
                        if (entity.type1 === 'farmland' || entity.type1 === 'tree_plantation') {
                            v.targetId = entity;
                        } else {
                            v.targetId = null;
                        }
                    } else {
                        this.assignWorkerToIndoorLogistics(v, entity, wid);
                    }
                    v.pathTarget = null;
                    workers.push(v);
                    this.engine.addLog(`[派駐分配] ${v.configName || '工人'} 已分配至 ${entity.name || entity.type1}。`, 'TASK');
                    needsRefill = true;
                }
            });
        }
    }

    adjustWarehouseWorkers(entity, delta) {
        if (!entity) return;
        const prevCount = entity.targetWorkerCount || 0;
        const nextCount = Math.max(0, prevCount + delta);
        entity.targetWorkerCount = nextCount;

        if (prevCount !== nextCount) {
            const label = entity.name || entity.type1;
            this.engine.addLog(`[派駐設定] ${label} 的目標工人數已調整為 ${nextCount}。`, 'TASK');
        }

        this.updateWorkerAssignments();
        if (window.UIManager) window.UIManager.updateValues();
    }

    findNearestAvailableVillager(x, y) {
        let nearest = null;
        let minDist = Infinity;
        this.state.units.villagers.forEach(v => {
            if (v.state === 'IDLE' && !v.assignedWarehouseId) {
                const dist = Math.hypot(v.x - x, v.y - y);
                if (dist < minDist) { minDist = dist; nearest = v; }
            }
        });
        if (nearest) return nearest;
        this.state.units.villagers.forEach(v => {
            if (v.state === 'MOVING_TO_CONSTRUCTION' || v.state === 'CONSTRUCTING') return;
            if (v.targetId && v.targetId.type1 === 'farmland') return;
            if (v.assignedWarehouseId) return;
            const dist = Math.hypot(v.x - x, v.y - y);
            if (dist < minDist) { minDist = dist; nearest = v; }
        });
        return nearest;
    }

    /**
     * 處理工人的右鍵點擊指令 (派駐工廠專用邏輯)
     * @returns {boolean} 是否已處理該指令
     */
    handleWorkerCommand(v, clickedTarget) {
        // 1. 離職與除名 (中斷防護)：如果工人目前在工廠中，接收任何新指令都要先「離職」
        if (v.state === 'WORKING_IN_FACTORY' || v.state === 'MOVING_TO_FACTORY') {
            this.releaseWorkerAssignment(v, { reduceTarget: true });
            v.visible = true; // 恢復顯示
            this.engine.addLog(`[任務變更] ${v.configName || '工人'} 已離開加工廠。`, 'INPUT');
        }

        // 2. 派駐檢查：當目標具備物流資格或有人數需求時
        const bCfg = clickedTarget ? this.engine.getBuildingConfig(clickedTarget.type1, clickedTarget.lv || 1) : null;
        const isLogisticsNode = bCfg && (bCfg.need_villagers > 0 || (bCfg.logistics && (bCfg.logistics.canInput || bCfg.logistics.canOutput)));

        if (clickedTarget && isLogisticsNode) {
            // [核心需求] 若建築還在施工中，不執行派駐邏輯，回傳 false 讓 MainScene 處理為建造指令
            if (clickedTarget.isUnderConstruction) {
                return false;
            }

            const maxWorkers = bCfg.need_villagers || 5; // 補足預設值：若配置檔未定義人數，預設 5 名
            const totalAssigned = this.getAssignedCountForBuilding(clickedTarget, v.id);

            if (totalAssigned >= maxWorkers) {
                // 已滿則不派駐，但仍回傳 true 表示點擊有效（防止工人跑去砍樹）
                return true;
            }

            // 3. 設定派駐任務
            const eid = clickedTarget.id || `${clickedTarget.type1}_${clickedTarget.x}_${clickedTarget.y}`;
            this.ensureBuildingWorkerTarget(clickedTarget, totalAssigned + 1);
            v.state = 'MOVING_TO_FACTORY';
            v.factoryTarget = clickedTarget;
            v.assignedWarehouseId = eid; // 同步設置 ID 以便 UI 統計
            v.targetId = null;
            v.isPlayerLocked = true;
            v.pathTarget = null;
            v.fullPath = null;
            this.engine.addLog(`[物流] ${v.configName || '工人'} 正在前往 ${clickedTarget.name || clickedTarget.type1} 報到。`, 'LOGISTICS');
            return true;
        }

        return false; // 非工廠指令，交由原有的 MainScene 邏輯處理
    }

    isTouchingBuilding(v, building, padding = 40) {
        if (!building) return false;
        const fp = this.engine.getFootprint(building.type1 || building.type);
        const halfW = (fp.uw * 20) / 2;
        const halfH = (fp.uh * 20) / 2;
        return (
            v.x >= building.x - halfW - padding &&
            v.x <= building.x + halfW + padding &&
            v.y >= building.y - halfH - padding &&
            v.y <= building.y + halfH + padding
        );
    }

    getBuildingApproachPoint(v, building, padding = 30) {
        if (!building) return { x: v.x, y: v.y };
        const fp = this.engine.getFootprint(building.type1 || building.type);
        const halfW = (fp.uw * 20) / 2;
        const halfH = (fp.uh * 20) / 2;
        const left = building.x - halfW - padding;
        const right = building.x + halfW + padding;
        const top = building.y - halfH - padding;
        const bottom = building.y + halfH + padding;

        const clampedX = Math.max(left, Math.min(right, v.x));
        const clampedY = Math.max(top, Math.min(bottom, v.y));
        const insideX = v.x >= left && v.x <= right;
        const insideY = v.y >= top && v.y <= bottom;

        if (!insideX || !insideY) {
            return { x: clampedX, y: clampedY };
        }

        const distances = [
            { side: 'left', value: Math.abs(v.x - left) },
            { side: 'right', value: Math.abs(right - v.x) },
            { side: 'top', value: Math.abs(v.y - top) },
            { side: 'bottom', value: Math.abs(bottom - v.y) }
        ].sort((a, b) => a.value - b.value);

        switch (distances[0].side) {
            case 'left': return { x: left, y: clampedY };
            case 'right': return { x: right, y: clampedY };
            case 'top': return { x: clampedX, y: top };
            default: return { x: clampedX, y: bottom };
        }
    }

    getLogisticsLinePoints(source, target) {
        if (!source || !target) return null;

        let sx = source.x;
        let sy = source.y;
        let ex = target.x;
        let ey = target.y;
        const sourceId = source.id || `${source.type1}_${source.x}_${source.y}`;
        const isReciprocal = target.outputTargets && target.outputTargets.find(conn => conn.id === sourceId);

        if (isReciprocal) {
            const dx = ex - sx;
            const dy = ey - sy;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
                const cfg = UI_CONFIG.LogisticsSystem || {};
                const offset = cfg.lineOffset || 10;
                const nx = -dy / dist;
                const ny = dx / dist;
                sx += nx * offset;
                sy += ny * offset;
                ex += nx * offset;
                ey += ny * offset;
            }
        }

        const start = this.getBuildingLineExitPoint(source, { x: sx, y: sy }, { x: ex, y: ey });
        const end = this.getBuildingLineExitPoint(target, { x: ex, y: ey }, { x: sx, y: sy });
        return { start, end };
    }

    getBuildingLineExitPoint(building, from, to) {
        if (!building || !from || !to) return from;
        const fp = this.engine.getFootprint(building.type1 || building.type);
        const collisionCfg = UI_CONFIG.BuildingCollision || {};
        const clearance = Math.max(18, (collisionCfg.buffer || 10) + 10);
        const halfW = (fp.uw * 20) / 2 + clearance;
        const halfH = (fp.uh * 20) / 2 + clearance;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const candidates = [];

        if (Math.abs(dx) > 0.001) {
            candidates.push((building.x - halfW - from.x) / dx);
            candidates.push((building.x + halfW - from.x) / dx);
        }
        if (Math.abs(dy) > 0.001) {
            candidates.push((building.y - halfH - from.y) / dy);
            candidates.push((building.y + halfH - from.y) / dy);
        }

        const valid = candidates
            .filter(t => t >= 0 && t <= 1)
            .map(t => ({ x: from.x + dx * t, y: from.y + dy * t, t }))
            .filter(p =>
                p.x >= building.x - halfW - 0.5 &&
                p.x <= building.x + halfW + 0.5 &&
                p.y >= building.y - halfH - 0.5 &&
                p.y <= building.y + halfH + 0.5
            )
            .sort((a, b) => a.t - b.t);

        if (valid.length === 0) return from;
        const p = valid[0];
        const len = Math.hypot(dx, dy) || 1;
        return {
            x: p.x + (dx / len) * 4,
            y: p.y + (dy / len) * 4
        };
    }

    placeWorkerAtLogisticsEndpoint(v, source, target, endpoint) {
        const line = this.getLogisticsLinePoints(source, target);
        if (!line) return;
        const point = endpoint === 'target' ? line.end : line.start;
        v.x = point.x;
        v.y = point.y;
        v.renderX = point.x;
        v.renderY = point.y;
        v.pathTarget = null;
        v.fullPath = null;
        v.pathIndex = 0;
        v._lastRequestedTarget = null;
        v._pathRequestId = (v._pathRequestId || 0) + 1;
        v.isFindingPath = false;
        v._lastPathTime = 0;
        v._stuckFrames = 0;
        v.commandCenter = null;
        v.idleTarget = null;
        if (v.sprite && typeof v.sprite.setPosition === 'function') v.sprite.setPosition(point.x, point.y);
        if (v.gameObject && typeof v.gameObject.setPosition === 'function') v.gameObject.setPosition(point.x, point.y);
    }

    moveAlongLogisticsLine(v, source, target, destination, speed, dt, ignoreEnts = []) {
        const line = this.getLogisticsLinePoints(source, target);
        if (!line) return null;

        const from = destination === 'source' ? line.end : line.start;
        const to = destination === 'source' ? line.start : line.end;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq <= 0.01) return to;

        const t = Math.max(0, Math.min(1, ((v.x - from.x) * dx + (v.y - from.y) * dy) / lenSq));
        const len = Math.sqrt(lenSq);
        const lookAhead = Math.min(120, Math.max(50, speed * 0.9));
        const nextT = Math.min(1, t + lookAhead / len);
        let guidePoint = {
            x: from.x + dx * nextT,
            y: from.y + dy * nextT
        };

        if (this.state.pathfinding) {
            const gx = Math.floor(guidePoint.x / 20);
            const gy = Math.floor(guidePoint.y / 20);
            if (!this.state.pathfinding.isValidAndWalkable(gx, gy, true)) {
                const nearest = this.state.pathfinding.getNearestWalkableTile(gx, gy, 12, true, true);
                if (nearest) {
                    guidePoint = {
                        x: nearest.x * 20 + 10,
                        y: nearest.y * 20 + 10
                    };
                }
            }
        }

        this.moveDetailed(v, guidePoint.x, guidePoint.y, speed, dt, ignoreEnts);
        v.pathTarget = null;

        return to;
    }

    pickLogisticsConnectionForWorker(v, factory, outputTargets, canUse) {
        if (!factory || !Array.isArray(outputTargets) || outputTargets.length === 0) return null;
        const usableTargets = outputTargets
            .map((conn, index) => ({ conn, index }))
            .filter(({ conn }) => canUse(conn));
        if (usableTargets.length === 0) return null;

        const factoryId = factory.id || `${factory.type1}_${factory.x}_${factory.y}`;
        const assignedWorkers = this.state.units.villagers
            .filter(worker => worker.assignedWarehouseId === factoryId)
            .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
        const workerIndex = Math.max(0, assignedWorkers.findIndex(worker => worker.id === v.id));
        const preferredIndex = outputTargets.length > 0 ? workerIndex % outputTargets.length : 0;
        const preferred = usableTargets.find(({ index }) => index === preferredIndex) || usableTargets[workerIndex % usableTargets.length];

        preferred.conn._balancedIndex = preferred.index;
        return preferred.conn;
    }

    getAssignedCountForBuilding(building, excludeVillagerId = null) {
        if (!building) return 0;
        const buildingId = building.id || `${building.type1}_${building.x}_${building.y}`;
        return this.state.units.villagers.filter(worker => {
            if (excludeVillagerId && worker.id === excludeVillagerId) return false;
            return worker.assignedWarehouseId === buildingId;
        }).length;
    }

    releaseWorkerAssignment(v, { reduceTarget = false } = {}) {
        if (!v) return;
        const buildingId = v.assignedWarehouseId || (v.factoryTarget
            ? (v.factoryTarget.id || `${v.factoryTarget.type1}_${v.factoryTarget.x}_${v.factoryTarget.y}`)
            : null);
        const building = v.factoryTarget || (buildingId
            ? this.state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === buildingId)
            : null);

        if (building) {
            if (building.assignedWorkers) {
                building.assignedWorkers = building.assignedWorkers.filter(id => id !== v.id);
            }
            if (reduceTarget) {
                building.targetWorkerCount = Math.max(0, (building.targetWorkerCount || 0) - 1);
            }
        }

        v.assignedWarehouseId = null;
        v.factoryTarget = null;
        v.logisticsHomeId = null;
        v.logisticsWorkKey = null;
        v.logisticsWorkTimer = 0;
        v.visible = true;
        if (v.sprite && typeof v.sprite.setVisible === 'function') v.sprite.setVisible(true);
        if (v.gameObject && typeof v.gameObject.setVisible === 'function') v.gameObject.setVisible(true);
    }

    isGatheringBuilding(entity) {
        if (!entity) return false;
        return ['timber_factory', 'stone_factory', 'barn', 'gold_mining_factory', 'farmland', 'tree_plantation'].includes(entity.type1);
    }

    getIngredientProductionTime(type, fallback = 3) {
        if (!type) return fallback;
        const key = String(type).toLowerCase();
        const cfg = this.state.ingredientConfigs
            ? (this.state.ingredientConfigs[key] || this.state.ingredientConfigs[type])
            : null;
        const rawTime = cfg ? (cfg.production_times ?? cfg.craftTime) : null;
        const parsed = parseFloat(rawTime);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    getResourceOutputTypes(target) {
        if (!target) return [];

        if (target.gx !== undefined && target.gy !== undefined && this.state.mapData) {
            const res = this.state.mapData.getResource(target.gx, target.gy);
            const typeNum = res ? res.type : target._lastResType;
            if (typeNum) {
                const level = (this.state.mapData.levelGrid && this.state.mapData.getIndex)
                    ? (this.state.mapData.levelGrid[this.state.mapData.getIndex(target.gx, target.gy)] || 1)
                    : 1;
                const typeName = ResourceSystem.getResourceTypeName(typeNum);
                const cfg = this.state.resourceConfigs.find(c => c.type === typeName && c.lv === level)
                    || this.state.resourceConfigs.find(c => c.type === typeName);
                if (cfg && cfg.ingredients) {
                    const types = Object.keys(cfg.ingredients);
                    if (types.length > 0) return types;
                }
            }
        }

        const targetEnt = typeof target === 'string'
            ? this.state.mapEntities.find(e => e.id === target)
            : (this.state.mapEntities.includes(target) ? target : null);

        if (targetEnt) {
            if (targetEnt.type1 === 'farmland') return ['food'];
            if (targetEnt.type1 === 'tree_plantation') return ['wood'];
            if (targetEnt.type1 === 'corpse' && targetEnt.resType) return [targetEnt.resType];
        }

        return [];
    }

    getGatheringProductionTime(v) {
        const outputTypes = this.getResourceOutputTypes(v.targetId);
        if (outputTypes.length > 0) {
            return Math.max(...outputTypes.map(type => this.getIngredientProductionTime(type, 3)));
        }

        return Math.max(0.1, parseFloat(v.config.collection_speed) || 3);
    }

    getGatheringResourceType(entity) {
        if (!entity) return null;
        if (entity.type1 === 'timber_factory' || entity.type1 === 'tree_plantation') return 'WOOD';
        if (entity.type1 === 'stone_factory') return 'STONE';
        if (entity.type1 === 'barn' || entity.type1 === 'farmland') return 'FOOD';
        if (entity.type1 === 'gold_mining_factory') return 'GOLD';
        return null;
    }

    assignWorkerToIndoorLogistics(v, entity, buildingId) {
        v.assignedWarehouseId = buildingId;
        v.factoryTarget = entity;
        v.targetId = null;
        v.type = null;
        v.state = 'MOVING_TO_FACTORY';
        v.pathTarget = null;
        v.fullPath = null;
        v.isPlayerLocked = false;
    }

    canEnterLogisticsBuilding(v, building) {
        if (!building) return false;
        const cfg = this.engine.getBuildingConfig(building.type1, building.lv || 1);
        if (!cfg) return false;

        if (cfg.type2 === 'processing_plant') {
            const capacity = cfg.need_villagers || 0;
            const currentInside = (building.assignedWorkers || []).filter(id => id !== v.id).length;
            return capacity <= 0 ? false : currentInside < capacity;
        }

        const capacity = building.targetWorkerCount || cfg.need_villagers || 0;
        if (capacity <= 0) return false;
        return this.getAssignedCountForBuilding(building, v.id) < capacity;
    }

    ensureBuildingWorkerTarget(building, minimumCount = 1) {
        if (!building) return;
        building.targetWorkerCount = Math.max(building.targetWorkerCount || 0, minimumCount);
    }

    tryEnterLogisticsBuilding(v, building, role = 'target') {
        if (!building || !this.canEnterLogisticsBuilding(v, building)) {
            return false;
        }

        const previousBuildingId = v.assignedWarehouseId;
        const buildingId = building.id || `${building.type1}_${building.x}_${building.y}`;
        const cfg = this.engine.getBuildingConfig(building.type1, building.lv || 1);

        if (role === 'target' && previousBuildingId && previousBuildingId !== buildingId) {
            const previousBuilding = this.state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === previousBuildingId);
            if (previousBuilding) {
                previousBuilding.targetWorkerCount = Math.max(0, (previousBuilding.targetWorkerCount || 0) - 1);
                if (previousBuilding.assignedWorkers) {
                    previousBuilding.assignedWorkers = previousBuilding.assignedWorkers.filter(id => id !== v.id);
                }
            }
        }

        v.assignedWarehouseId = buildingId;
        v.factoryTarget = cfg && cfg.type2 === 'processing_plant' ? building : null;
        v.state = 'WORKING_IN_FACTORY';
        v.pathTarget = null;
        v.fullPath = null;
        v.pathIndex = 0;
        v._lastRequestedTarget = null;
        v._pathRequestId = (v._pathRequestId || 0) + 1;
        v.isFindingPath = false;
        v.commandCenter = null;
        v.visible = false;

        if (v.sprite && typeof v.sprite.setVisible === 'function') v.sprite.setVisible(false);
        if (v.gameObject && typeof v.gameObject.setVisible === 'function') v.gameObject.setVisible(false);

        if (cfg && cfg.type2 === 'processing_plant') {
            if (!building.assignedWorkers) building.assignedWorkers = [];
            if (!building.assignedWorkers.includes(v.id)) {
                building.assignedWorkers.push(v.id);
            }
        } else {
            this.markWorkerInsideBuilding(v, building);
        }

        const reservedCount = cfg && cfg.type2 === 'processing_plant'
            ? (building.assignedWorkers ? building.assignedWorkers.length : 1)
            : this.getAssignedCountForBuilding(building);
        this.ensureBuildingWorkerTarget(building, reservedCount);

        if (role === 'target') {
            v.logisticsHomeId = buildingId;
            if (!v.logisticsSourceId) v.logisticsSourceId = previousBuildingId || buildingId;
            if (cfg && cfg.type2 === 'processing_plant') {
                SynthesisSystem.ensureDefaultRecipe(this.state, this.engine, building);
            }
            this.engine.addLog(`[物流] ${v.configName || '工人'} 已進入 ${building.name || building.type1} 派駐。`, 'LOGISTICS');
            if (cfg && cfg.type2 === 'processing_plant' && !building.currentRecipe) {
                this.engine.addLog(`[物流] ${building.name || building.type1} 尚未設定加工廠生產線，因此工人目前只會待命。上方物流線的搬運品項不等於工廠配方。`, 'LOGISTICS');
            }
        } else {
            this.engine.addLog(`[物流] ${v.configName || '工人'} 已返回 ${building.name || building.type1} 待命。`, 'LOGISTICS');
        }

        return true;
    }

    isLogisticsStorageType(type) {
        return this.LOGISTICS_STORAGE_TYPES.includes(String(type || '').toLowerCase());
    }

    markWorkerOutsideBuilding(v, building) {
        if (!v || !building || !building.assignedWorkers) return;
        building.assignedWorkers = building.assignedWorkers.filter(id => id !== v.id);
    }

    markWorkerInsideBuilding(v, building) {
        if (!v || !building) return;
        if (!building.assignedWorkers) building.assignedWorkers = [];
        if (!building.assignedWorkers.includes(v.id)) {
            building.assignedWorkers.push(v.id);
        }
    }

    getFootprint(type1) {
        const cfg = this.engine.getBuildingConfig(type1, 1);
        if (cfg && cfg.size) {
            const m = cfg.size.match(/\{[ ]*(\d+)[ ]*[,x][ ]*(\d+)[ ]*\}/);
            if (m) return { uw: parseInt(m[1]), uh: parseInt(m[2]) };
        }
        return { uw: 3, uh: 3 }; // 預設放寬為 3x3，避免判定過於嚴苛
    }
}
