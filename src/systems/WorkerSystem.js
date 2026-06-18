import { UI_CONFIG } from "../ui/ui_config.js";
import { ResourceSystem } from "./ResourceSystem.js";
import { SynthesisSystem } from "./SynthesisSystem.js";
import { BattleSystem } from "./BattleSystem.js";
import { conveyorSystem } from "./ConveyorSystem.js";

function annotateRoutePoints(points) {
    if (!Array.isArray(points) || points.length < 3) return;
    const getCardinalDir = (from, to) => {
        if (!from || !to) return null;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null;
        if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx) || 1, y: 0 };
        return { x: 0, y: Math.sign(dy) || 1 };
    };
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        const inDir = getCardinalDir(prev, curr);
        const outDir = getCardinalDir(curr, next);
        if (inDir && outDir && (inDir.x !== outDir.x || inDir.y !== outDir.y)) {
            curr.isCorner = true;
        }
    }
}


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
        const hasCargo = v && ((v.cargo || 0) > 0 || (v.cargoAmount || 0) > 0);
        const cargoMultiplier = UI_CONFIG.WorkerMovement?.cargoSpeedMultiplier ?? 0.5;
        return configSpeed * 13 * (hasCargo ? cargoMultiplier : 1);
    }

    getWorkerCollectionAmount(v, fallback = 1) {
        const rawAmount = v?.collection_resource ?? v?.config?.collection_resource;
        const amount = parseInt(rawAmount);
        return Number.isFinite(amount) && amount > 0 ? amount : fallback;
    }

    /**
     * 更新所有工人的狀態與移動
     */
    update(dt) {
        if (conveyorSystem && typeof conveyorSystem.update === 'function') {
            conveyorSystem.update(dt);
        }
        this.processAutomatedLogistics(window.GAME_STATE || this.engine.state, dt);
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
            case 'WORKING_IN_FACTORY':
                // 工人進入工廠後隱藏實體，專心提供產能
                v.visible = false;
                if (v.sprite && typeof v.sprite.setVisible === 'function') v.sprite.setVisible(false);
                if (v.gameObject && typeof v.gameObject.setVisible === 'function') v.gameObject.setVisible(false);
                break;
            case 'TRANSPORTING_LOGISTICS':
            case 'RETURNING_TO_FACTORY':
                // 強制召回還在外面跑的舊版搬運工
                v.state = 'WORKING_IN_FACTORY';
                v.cargoType = null;
                v.cargoAmount = 0;
                break;
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
                    const harvestTotal = this.getWorkerCollectionAmount(v, 1);

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
                                const outputType = targetEnt.type1 === 'farmland' ? 'food' : 'wood';
                                if (!targetEnt.outputBuffer) targetEnt.outputBuffer = {};
                                targetEnt.outputBuffer[outputType] = (targetEnt.outputBuffer[outputType] || 0) + canTake;
                                if (window.UIManager) window.UIManager.updateValues(true);
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
                    const depositAmount = (v.cargoAmount || 0) > 0 ? v.cargoAmount : v.cargo;
                    const depositType = v.cargoType || v.type;
                    const assignedDepositTarget = (!v.manualDepositTarget && v.targetBase && !v.targetBase.gx)
                        ? v.targetBase
                        : null;
                    const didDeposit = v.manualDepositTarget
                        ? ResourceSystem.depositResourceToBuilding(this.state, this.engine, v.manualDepositTarget, depositType, depositAmount, this.engine.addLog.bind(this.engine))
                        : assignedDepositTarget
                            ? ResourceSystem.depositResourceToBuilding(this.state, this.engine, assignedDepositTarget, depositType, depositAmount, this.engine.addLog.bind(this.engine))
                            : (ResourceSystem.depositResource(this.state, depositType, depositAmount, this.engine.addLog.bind(this.engine)) !== false);
                    if (!didDeposit) {
                        this.engine.addLog(`[存放失敗] ${v.manualDepositTarget?.name || '目標建築'} 無法存放 ${String(depositType || '').toUpperCase()}。`, 'TASK');
                    }
                    v.cargo = 0; v.cargoAmount = 0; v.cargoType = null; v.pathTarget = null;
                    v.depositPoint = null; v._lastBaseId = null;
                    v.commandCenter = null;
                    v.vTint = 0xffffff;
                    if (v.manualDepositTarget) {
                        v.manualDepositTarget = null;
                        v.manualDepositTargetId = null;
                        v.state = 'IDLE';
                        v.isPlayerLocked = true;
                        this.engine.addLog(`[存入完成] ${v.configName || '工人'} 已完成手動存放，目前待命。`, 'TASK');
                    } else if (v.nextStateAfterDeposit) {
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

    handleManualDepositCommand(v, clickedTarget) {
        if (!v || !clickedTarget || !v.config || v.config.type !== 'villagers') return false;
        const amount = (v.cargoAmount || 0) > 0 ? v.cargoAmount : (v.cargo || 0);
        const type = v.cargoType || v.type;
        if (amount <= 0 || !type) return false;
        if (!this.state.mapEntities.includes(clickedTarget)) return false;
        if (!ResourceSystem.canBuildingAcceptResource(this.state, this.engine, clickedTarget, type)) return false;

        v.state = 'MOVING_TO_BASE';
        v.targetBase = clickedTarget;
        v.manualDepositTarget = clickedTarget;
        v.manualDepositTargetId = clickedTarget.id || `${clickedTarget.type1}_${clickedTarget.x}_${clickedTarget.y}`;
        v.targetId = null;
        v.factoryTarget = null;
        v.pathTarget = null;
        v.fullPath = null;
        v.pathIndex = 0;
        v.depositPoint = null;
        v._lastBaseId = null;
        v.commandCenter = { x: clickedTarget.x, y: clickedTarget.y };
        v.isPlayerLocked = true;
        this.engine.addLog(`[命令] ${v.configName || '工人'} 前往 ${clickedTarget.name || clickedTarget.type1} 存放 ${String(type).toUpperCase()}。`, 'INPUT');
        return true;
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
        let projects = this.state.mapEntities.filter(e =>
            e && e.isUnderConstruction && Math.hypot(v.x - e.x, v.y - e.y) <= visionRadius
        );
        if (projects.length === 0) {
            projects = this.state.mapEntities.filter(e => e && e.isUnderConstruction);
        }

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
            const target = this.getBuildingWorkerTarget(entity);
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

            if (this.isGatheringBuilding(entity)) {
                this.rebalanceGatheringBuildingWorkers(entity, wid, data.workers);
            }
        });

        let needsRefill = true;
        while (needsRefill && allIdle.length > 0) {
            needsRefill = false;
            warehouseMap.forEach((data, wid) => {
                const { entity, workers } = data;
                const target = this.getBuildingWorkerTarget(entity);
                if (workers.length < target && allIdle.length > 0) {
                    const v = allIdle.shift();
                    if (this.isGatheringBuilding(entity)) {
                        const split = this.getGatheringBuildingWorkerSplit(entity);
                        const gatherers = workers.filter(worker => this.isGatheringWorkerForBuilding(worker, wid)).length;
                        const transporters = workers.filter(worker => this.isLogisticsWorkerForBuilding(worker, wid)).length;
                        if (transporters < split.transporters && gatherers >= split.gatherers) {
                            this.assignWorkerToIndoorLogistics(v, entity, wid);
                        } else {
                            this.assignWorkerToGathering(v, entity, wid);
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

        // 4. 對於仍處於 IDLE 且沒有被派駐的 free 村民，自動為其分派建造或其它任務，打破建造癱瘓
        allIdle.forEach(v => {
            if (v.state === 'IDLE' && !v.assignedWarehouseId && !v.isRecalled && !v.isPlayerLocked) {
                this.assignNextTask(v);
            }
        });
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
            if (this.isGatheringBuilding(clickedTarget)) {
                const existingWorkers = this.state.units.villagers.filter(worker => worker.assignedWarehouseId === eid && worker.id !== v.id);
                const split = this.getGatheringBuildingWorkerSplit(clickedTarget);
                const gatherers = existingWorkers.filter(worker => this.isGatheringWorkerForBuilding(worker, eid)).length;
                const transporters = existingWorkers.filter(worker => this.isLogisticsWorkerForBuilding(worker, eid)).length;
                if (transporters < split.transporters && gatherers >= split.gatherers) {
                    this.assignWorkerToIndoorLogistics(v, clickedTarget, eid);
                } else {
                    this.assignWorkerToGathering(v, clickedTarget, eid);
                }
            } else {
                v.state = 'MOVING_TO_FACTORY';
                v.factoryTarget = clickedTarget;
                v.assignedWarehouseId = eid; // 同步設置 ID 以便 UI 統計
                v.targetId = null;
                v.pathTarget = null;
                v.fullPath = null;
            }
            v.isPlayerLocked = true;
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
        const collCfg = UI_CONFIG.BuildingCollision || { buffer: 10, feetOffset: 8 };
        const logicY = building.y - (collCfg.feetOffset || 0);
        const clearance = Math.max(padding, (collCfg.buffer || 0) + Math.max((v.width || 20) / 2, 10));
        const halfW = (fp.uw * 20) / 2;
        const halfH = (fp.uh * 20) / 2;
        const left = building.x - halfW - clearance;
        const right = building.x + halfW + clearance;
        const top = logicY - halfH - clearance;
        const bottom = logicY + halfH + clearance;

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
        const sourceId = source.id || `${source.type1}_${source.x}_${source.y}`;
        const targetId = target.id || `${target.type1}_${target.x}_${target.y}`;
        const directConn = Array.isArray(source.outputTargets)
            ? source.outputTargets.find(conn => conn && conn.id === targetId)
            : null;

        if (directConn) {
            const transferRoute = (conveyorSystem && typeof conveyorSystem.getConnectionTransferRoute === 'function')
                ? conveyorSystem.getConnectionTransferRoute(source, target, directConn)
                : null;
            let routePoints = transferRoute && Array.isArray(transferRoute.points) && transferRoute.points.length >= 2
                ? transferRoute.points.map(p => ({ x: p.x, y: p.y }))
                : (!directConn.lineId && Array.isArray(directConn.routePoints) && directConn.routePoints.length >= 2
                    ? directConn.routePoints.map(p => ({ x: p.x, y: p.y }))
                    : null);
            if (Array.isArray(routePoints) && routePoints.length >= 2) {
                return {
                    start: { ...routePoints[0] },
                    end: { ...routePoints[routePoints.length - 1] },
                    points: routePoints,
                    sourceId,
                    targetId
                };
            }
            if (directConn.lineId) return null;
        }

        let sx = source.x;
        let sy = source.y;
        let ex = target.x;
        let ey = target.y;
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
        return { start, end, points: [start, end], sourceId, targetId };
    }

    normalizeTransferRoutePoints(source, target, routePoints) {
        if (!Array.isArray(routePoints) || routePoints.length < 2) return routePoints;
        const points = [];
        routePoints.forEach(point => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            const last = points[points.length - 1];
            if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.5) {
                points.push({ x: point.x, y: point.y });
            }
        });
        if (points.length < 2) return points;
        if (!source && !target) return points;

        const distance = (entity, point) => Math.hypot((entity.x || 0) - point.x, (entity.y || 0) - point.y);
        const first = points[0];
        const last = points[points.length - 1];

        let directScore = 0;
        let reverseScore = 0;
        if (source && target) {
            directScore = distance(source, first) + distance(target, last);
            reverseScore = distance(source, last) + distance(target, first);
        } else if (source) {
            directScore = distance(source, first);
            reverseScore = distance(source, last);
        } else if (target) {
            directScore = distance(target, last);
            reverseScore = distance(target, first);
        }
        return reverseScore < directScore ? points.reverse() : points;
    }

    formatTransferPoint(point) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return "null";
        return `(${Math.round(point.x)},${Math.round(point.y)})`;
    }

    logTransferRouteDebug(source, target, conn, itemType, rawRoutePoints, routePoints) {
        if (!this.engine || typeof this.engine.addLog !== 'function' || !conn) return;
        const now = Date.now();
        const key = `${conn.lineId || conn.id || 'no-line'}:${itemType || 'item'}`;
        conn._transferRouteDebugAt = conn._transferRouteDebugAt || {};
        if (conn._transferRouteDebugAt[key] && now - conn._transferRouteDebugAt[key] < 2500) return;
        conn._transferRouteDebugAt[key] = now;

        const first = Array.isArray(routePoints) ? routePoints[0] : null;
        const last = Array.isArray(routePoints) ? routePoints[routePoints.length - 1] : null;
        const rawFirst = Array.isArray(rawRoutePoints) ? rawRoutePoints[0] : null;
        const rawLast = Array.isArray(rawRoutePoints) ? rawRoutePoints[rawRoutePoints.length - 1] : null;
        const routeHead = Array.isArray(routePoints)
            ? routePoints.slice(0, 4).map(point => this.formatTransferPoint(point)).join(">")
            : "null";
        const dist = (entity, point) => entity && point
            ? Math.round(Math.hypot((entity.x || 0) - point.x, (entity.y || 0) - point.y))
            : "n/a";
        this.engine.addLog(
            `[DEBUG] Transfer route ${String(itemType || '').toUpperCase()} ` +
            `source=${this.formatTransferPoint(source)} target=${this.formatTransferPoint(target)} ` +
            `first=${this.formatTransferPoint(first)} last=${this.formatTransferPoint(last)} ` +
            `rawFirst=${this.formatTransferPoint(rawFirst)} rawLast=${this.formatTransferPoint(rawLast)} ` +
            `sourcePort=${this.formatTransferPoint(conn.sourcePort)} targetPort=${this.formatTransferPoint(conn.targetPort)} ` +
            `distSF=${dist(source, first)} distSL=${dist(source, last)} points=${Array.isArray(routePoints) ? routePoints.length : 0} ` +
            `head=${routeHead}`,
            'LOGISTICS'
        );
    }

    getOrderedLogisticsSegmentRoutePoints(lineId, source = null, target = null) {
        if (!lineId || !Array.isArray(this.state?.logisticsLines)) return null;
        const TS = 20;
        const segments = this.state.logisticsLines.filter(line =>
            line && (line.groupId === lineId || line.id === lineId) &&
            Array.isArray(line.routePoints) && line.routePoints.length >= 1
        );
        if (segments.length < 2) return null;

        const ordered = [...segments].sort((a, b) => {
            const timeA = a?.createdAt || 0;
            const timeB = b?.createdAt || 0;
            if (timeA !== timeB) return timeA - timeB;
            const orderA = Number.isFinite(a?.order) ? a.order : 0;
            const orderB = Number.isFinite(b?.order) ? b.order : 0;
            if (orderA !== orderB) return orderA - orderB;
            return String(a?.id || "").localeCompare(String(b?.id || ""));
        });

        const points = [];
        const pushPoint = (point) => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            const last = points[points.length - 1];
            if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.5) {
                points.push({ x: point.x, y: point.y });
            }
        };

        // Keep active transfer positions aligned with the logistics position list.
        // Segment endpoints may include construction handles past a merged corner.
        ordered.forEach(seg => pushPoint(seg.routePoints[0]));

        const lastSeg = ordered[ordered.length - 1];
        const lastEndpoint = lastSeg?.routePoints?.[lastSeg.routePoints.length - 1];
        if (lastEndpoint) pushPoint(lastEndpoint);

        for (let i = 1; i < points.length; i++) {
            if (Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) > TS * 1.75) {
                return null;
            }
        }

        const normalizedPoints = this.normalizeTransferRoutePoints(source, target, points);
        if (Array.isArray(normalizedPoints)) {
            annotateRoutePoints(normalizedPoints);
        }
        return Array.isArray(normalizedPoints) && normalizedPoints.length >= 2 ? normalizedPoints : null;
    }

    getItemTransferRoutePoints(source, target, conn) {
        if (!source || !target || !conn?.lineId || !Array.isArray(this.state.logisticsLines)) return null;
        const TS = 20;
        const segments = this.state.logisticsLines.filter(line =>
            line && (line.groupId === conn.lineId || line.id === conn.lineId) &&
            Array.isArray(line.routePoints) && line.routePoints.length >= 2
        );
        if (segments.length === 0) return null;

        const nodeKey = (point) => `${Math.round(point.x)},${Math.round(point.y)}`;
        const nodes = new Map();
        const edges = new Map();
        const addNode = (point) => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
            const key = nodeKey(point);
            if (!nodes.has(key)) nodes.set(key, { x: Math.round(point.x), y: Math.round(point.y) });
            if (!edges.has(key)) edges.set(key, []);
            return key;
        };
        const addEdge = (a, b) => {
            const ak = addNode(a);
            const bk = addNode(b);
            if (!ak || !bk || ak === bk) return;
            const weight = Math.hypot(nodes.get(bk).x - nodes.get(ak).x, nodes.get(bk).y - nodes.get(ak).y) || 0.001;
            edges.get(ak).push({ key: bk, weight });
            edges.get(bk).push({ key: ak, weight });
        };

        segments.forEach(seg => {
            const points = seg.routePoints;
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                if (!a || !b) continue;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 0.001) continue;
                const steps = Math.max(1, Math.round(dist / TS));
                let prev = null;
                for (let step = 0; step <= steps; step++) {
                    const point = step === steps
                        ? b
                        : { x: a.x + (dx / steps) * step, y: a.y + (dy / steps) * step };
                    const key = addNode(point);
                    if (prev && key) addEdge(nodes.get(prev), nodes.get(key));
                    prev = key;
                }
            }
        });
        if (nodes.size < 2) return null;

        const getEntityPorts = (entity) => {
            if (window.UIManager && typeof window.UIManager.getBuildingPortSlots === 'function') {
                const ports = window.UIManager.getBuildingPortSlots(entity);
                if (Array.isArray(ports) && ports.length > 0) return ports;
            }
            const fp = this.engine.getFootprint(entity.type1 || entity.type) || { uw: 3, uh: 3 };
            const halfW = ((fp.uw || 3) * TS) / 2;
            const halfH = ((fp.uh || 3) * TS) / 2;
            return [
                { x: entity.x, y: entity.y - halfH, dir: 'up' },
                { x: entity.x, y: entity.y + halfH, dir: 'down' },
                { x: entity.x - halfW, y: entity.y, dir: 'left' },
                { x: entity.x + halfW, y: entity.y, dir: 'right' }
            ];
        };
        const isPortNearEntity = (entity, port) => {
            if (!entity || !port || !Number.isFinite(port.x) || !Number.isFinite(port.y)) return false;
            const ports = getEntityPorts(entity);
            if (ports.some(entityPort => Math.hypot(entityPort.x - port.x, entityPort.y - port.y) <= TS * 0.75)) return true;

            const fp = this.engine.getFootprint(entity.type1 || entity.type) || { uw: 3, uh: 3 };
            const halfW = ((fp.uw || 3) * TS) / 2;
            const halfH = ((fp.uh || 3) * TS) / 2;
            const dx = Math.max(Math.abs(port.x - entity.x) - halfW, 0);
            const dy = Math.max(Math.abs(port.y - entity.y) - halfH, 0);
            return Math.hypot(dx, dy) <= TS * 0.75;
        };
        const nearestNode = (point) => {
            let best = null;
            let bestDist = Infinity;
            nodes.forEach((node, key) => {
                const dist = Math.hypot(node.x - point.x, node.y - point.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = { key, point: node, dist };
                }
            });
            return best;
        };
        const getCandidates = (entity, storedPort = null) => {
            const ports = [];
            if (storedPort && storedPort.sourceType !== 'logistics_line' &&
                Number.isFinite(storedPort.x) && Number.isFinite(storedPort.y) &&
                isPortNearEntity(entity, storedPort)) {
                ports.push(storedPort);
            }
            ports.push(...getEntityPorts(entity));

            const byKey = new Map();
            ports.forEach(port => {
                const nearest = nearestNode(port);
                if (!nearest || nearest.dist > TS * 1.25) return;
                const existing = byKey.get(nearest.key);
                if (!existing || nearest.dist < existing.dist) {
                    byKey.set(nearest.key, {
                        key: nearest.key,
                        anchor: { x: port.x, y: port.y },
                        dist: nearest.dist
                    });
                }
            });
            return [...byKey.values()].sort((a, b) => a.dist - b.dist);
        };

        const sourceCandidates = getCandidates(source, conn.sourcePort);
        const targetCandidates = getCandidates(target, conn.targetPort);
        if (sourceCandidates.length === 0 || targetCandidates.length === 0) return null;

        const orderedSegmentRoutePoints = this.getOrderedLogisticsSegmentRoutePoints(conn.lineId, source, target);
        if (Array.isArray(orderedSegmentRoutePoints) && orderedSegmentRoutePoints.length >= 2) {
            return orderedSegmentRoutePoints;
        }

        const findPath = (startKey, endKey) => {
            const distances = new Map([[startKey, 0]]);
            const previous = new Map();
            const open = new Set(nodes.keys());

            while (open.size > 0) {
                let current = null;
                let bestDistance = Infinity;
                open.forEach(key => {
                    const dist = distances.get(key) ?? Infinity;
                    if (dist < bestDistance) {
                        bestDistance = dist;
                        current = key;
                    }
                });
                if (!current || bestDistance === Infinity) break;
                open.delete(current);
                if (current === endKey) break;
                (edges.get(current) || []).forEach(edge => {
                    if (!open.has(edge.key)) return;
                    const nextDistance = bestDistance + edge.weight;
                    if (nextDistance < (distances.get(edge.key) ?? Infinity)) {
                        distances.set(edge.key, nextDistance);
                        previous.set(edge.key, current);
                    }
                });
            }

            if (!distances.has(endKey)) return null;
            const keys = [];
            let current = endKey;
            while (current) {
                keys.unshift(current);
                if (current === startKey) break;
                current = previous.get(current);
            }
            return keys[0] === startKey ? { keys, distance: distances.get(endKey) } : null;
        };

        let bestPath = null;
        sourceCandidates.forEach(sourceCandidate => {
            targetCandidates.forEach(targetCandidate => {
                const path = findPath(sourceCandidate.key, targetCandidate.key);
                if (!path) return;
                const score = path.distance + sourceCandidate.dist + targetCandidate.dist;
                if (!bestPath || score < bestPath.score) {
                    bestPath = { ...path, score, sourceAnchor: sourceCandidate.anchor, targetAnchor: targetCandidate.anchor };
                }
            });
        });
        if (!bestPath || !Array.isArray(bestPath.keys) || bestPath.keys.length < 2) {
            // 降級方案：使用端點追蹤法（與渲染器一致）
            const sortedSegs = [];
            const remaining = [...segments];
            let current = remaining.sort((a, b) => (a.order || 0) - (b.order || 0))[0];

            if (current) {
                sortedSegs.push(current);
                remaining.splice(remaining.indexOf(current), 1);

                while (remaining.length > 0) {
                    const lastSeg = sortedSegs[sortedSegs.length - 1];
                    const lastEp = lastSeg.routePoints?.[lastSeg.routePoints.length - 1] || { x: lastSeg.x, y: lastSeg.y };

                    let nextIndex = -1;
                    let minEdgeDist = 15; // 容許 15 像素內的偏差

                    for (let i = 0; i < remaining.length; i++) {
                        const rSeg = remaining[i];
                        const rSp = rSeg.routePoints?.[0] || { x: rSeg.x, y: rSeg.y };
                        const dist = Math.hypot(lastEp.x - rSp.x, lastEp.y - rSp.y);
                        if (dist < minEdgeDist) {
                            minEdgeDist = dist;
                            nextIndex = i;
                        }
                    }

                    if (nextIndex !== -1) {
                        sortedSegs.push(remaining[nextIndex]);
                        remaining.splice(nextIndex, 1);
                    } else {
                        remaining.sort((a, b) => (a.order || 0) - (b.order || 0));
                        sortedSegs.push(remaining[0]);
                        remaining.splice(0, 1);
                    }
                }
            }

            const points = [];
            const pushPoint = (point) => {
                if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
                const last = points[points.length - 1];
                if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.5) {
                    points.push({ x: point.x, y: point.y });
                }
            };

            sortedSegs.forEach(seg => {
                if (Array.isArray(seg.routePoints)) {
                    if (seg.routePoints.length > 0) pushPoint(seg.routePoints[0]);
                }
            });

            if (points.length >= 2) {
                const normalizedPoints = this.normalizeTransferRoutePoints(source, target, points);
                return normalizedPoints.length >= 2 ? normalizedPoints : null;
            }
            return null;
        }

        const points = [];
        const pushPoint = (point) => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
            const last = points[points.length - 1];
            if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.5) {
                points.push({ x: point.x, y: point.y });
            }
        };
        pushPoint(bestPath.sourceAnchor);
        bestPath.keys.forEach(key => pushPoint(nodes.get(key)));
        pushPoint(bestPath.targetAnchor);
        const normalizedPoints = this.normalizeTransferRoutePoints(source, target, points);
        return normalizedPoints.length >= 2 ? normalizedPoints : null;
    }

    createActiveTransfer(state, source, conn, itemType) {
        if (!source || !conn || !itemType) return null;
        const sourceId = source.id || `${source.type1}_${source.x}_${source.y}`;
        const target = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === conn.id);
        const orderedLineRoute = conn.lineId
            ? this.getOrderedLogisticsSegmentRoutePoints(conn.lineId, source, target)
            : null;
        const transferVisualRoute = target && conn.lineId && (!Array.isArray(orderedLineRoute) || orderedLineRoute.length < 2)
            ? this.getItemTransferRoutePoints(source, target, conn)
            : null;
        const route = (!Array.isArray(transferVisualRoute) || transferVisualRoute.length < 2) && target
            ? this.getLogisticsLinePoints(source, target)
            : null;
        const rawRoutePoints = Array.isArray(orderedLineRoute) && orderedLineRoute.length >= 2
            ? orderedLineRoute.map(point => ({ x: point.x, y: point.y }))
            : Array.isArray(transferVisualRoute) && transferVisualRoute.length >= 2
                ? transferVisualRoute.map(point => ({ x: point.x, y: point.y }))
                : (Array.isArray(route?.points) && route.points.length >= 2
                    ? route.points.map(point => ({ x: point.x, y: point.y }))
                    : (Array.isArray(conn.routePoints) && conn.routePoints.length >= 2
                        ? conn.routePoints.map(point => ({ x: point.x, y: point.y }))
                        : null));
        const routePoints = this.normalizeTransferRoutePoints(source, target, rawRoutePoints);
        if (routePoints) {
            annotateRoutePoints(routePoints);
        }
        // this.logTransferRouteDebug(source, target, conn, itemType, rawRoutePoints, routePoints);
        const transferId = `transfer_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000).toString(36)}`;

        // [新增] 自動設定追蹤目標
        if (state && !state.trackedTransferId) {
            state.trackedTransferId = transferId;
            if (this.engine && typeof this.engine.addLog === 'function') {
                this.engine.addLog(`[追蹤] 開始追蹤物品 ${itemType}`, 'LOGISTICS');
            }
        }

        return {
            id: transferId,
            lastSegment: -1, // 初始化區段紀錄
            sourceId,
            targetId: conn.id,
            itemType,
            progress: 0,
            lineId: conn.lineId || null,
            efficiency: Number(conn.efficiency) || 0,
            routePoints
        };
    }

    assignTransferSerial(state, transfer) {
        if (!state || !transfer || transfer.serialNumber) return transfer;
        const nextSerial = Number.isFinite(Number(state.nextTransferSerial))
            ? Math.max(1, Math.floor(Number(state.nextTransferSerial)))
            : 1;
        transfer.serialNumber = nextSerial;
        state.nextTransferSerial = nextSerial + 1;
        return transfer;
    }

    getBuildingLineExitPoint(building, from, to) {
        if (!building || !from || !to) return from;
        const fp = this.engine.getFootprint(building.type1 || building.type);
        const collisionCfg = UI_CONFIG.BuildingCollision || {};
        const clearance = Math.max(18, (collisionCfg.buffer || 10) + 10);
        const halfW = (fp.uw * 20) / 2 + clearance;
        const halfH = (fp.uh * 20) / 2 + clearance;
        const centerY = building.y - (collisionCfg.feetOffset || 0);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const candidates = [];

        if (Math.abs(dx) > 0.001) {
            candidates.push((building.x - halfW - from.x) / dx);
            candidates.push((building.x + halfW - from.x) / dx);
        }
        if (Math.abs(dy) > 0.001) {
            candidates.push((centerY - halfH - from.y) / dy);
            candidates.push((centerY + halfH - from.y) / dy);
        }

        const valid = candidates
            .filter(t => t >= 0 && t <= 1)
            .map(t => ({ x: from.x + dx * t, y: from.y + dy * t, t }))
            .filter(p =>
                p.x >= building.x - halfW - 0.5 &&
                p.x <= building.x + halfW + 0.5 &&
                p.y >= centerY - halfH - 0.5 &&
                p.y <= centerY + halfH + 0.5
            )
            .sort((a, b) => a.t - b.t);

        if (valid.length === 0) return from;
        const p = valid[0];
        const len = Math.hypot(dx, dy) || 1;
        return {
            x: p.x - (dx / len) * 2,
            y: p.y - (dy / len) * 2
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
        const basePoints = Array.isArray(line.points) && line.points.length >= 2
            ? line.points.map(p => ({ x: p.x, y: p.y }))
            : [line.start, line.end];
        const points = destination === 'source' ? basePoints.slice().reverse() : basePoints;
        const to = points[points.length - 1];
        if (!to || points.length < 2) return to || null;

        const segmentLengths = [];
        let totalLength = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const dx = points[i + 1].x - points[i].x;
            const dy = points[i + 1].y - points[i].y;
            const len = Math.hypot(dx, dy);
            segmentLengths.push(len);
            totalLength += len;
        }
        if (totalLength <= 0.01) return to;

        const nearestDistanceOnPolyline = (x, y) => {
            let bestDistSq = Number.POSITIVE_INFINITY;
            let bestAlong = 0;
            let along = 0;
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                const sx = b.x - a.x;
                const sy = b.y - a.y;
                const lenSq = sx * sx + sy * sy;
                if (lenSq <= 0.0001) {
                    along += segmentLengths[i] || 0;
                    continue;
                }
                const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (y - a.y) * sy) / lenSq));
                const px = a.x + sx * t;
                const py = a.y + sy * t;
                const dSq = (x - px) * (x - px) + (y - py) * (y - py);
                if (dSq < bestDistSq) {
                    bestDistSq = dSq;
                    bestAlong = along + (segmentLengths[i] || 0) * t;
                }
                along += segmentLengths[i] || 0;
            }
            return bestAlong;
        };

        const pointAtDistance = (distance) => {
            let remain = Math.max(0, Math.min(totalLength, distance));
            for (let i = 0; i < points.length - 1; i++) {
                const segLen = segmentLengths[i] || 0;
                const a = points[i];
                const b = points[i + 1];
                if (segLen <= 0.0001) continue;
                if (remain <= segLen) {
                    const t = remain / segLen;
                    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
                }
                remain -= segLen;
            }
            return { ...to };
        };

        const currentDistance = nearestDistanceOnPolyline(v.x, v.y);
        const lookAhead = Math.min(120, Math.max(50, speed * 0.9));
        let guidePoint = pointAtDistance(currentDistance + lookAhead);

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
            .filter(worker => worker.assignedWarehouseId === factoryId && this.isLogisticsWorkerForBuilding(worker, factoryId))
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
        v._assignmentRole = null;
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

    getGatheringBuildingWorkerSplit(entity) {
        const total = this.getBuildingWorkerTarget(entity);
        const hasOutputRoute = !!(entity && Array.isArray(entity.outputTargets) && entity.outputTargets.length > 0);
        if (!hasOutputRoute) {
            return { gatherers: total, transporters: 0 };
        }
        const gatherers = Math.ceil(total / 2);
        return { gatherers, transporters: Math.max(0, total - gatherers) };
    }

    isGatheringWorkerForBuilding(v, buildingId) {
        if (!v || v.assignedWarehouseId !== buildingId) return false;
        return v._assignmentRole === 'gather' ||
            (['MOVING_TO_RESOURCE', 'GATHERING', 'MOVING_TO_BASE'].includes(v.state) && v.logisticsHomeId !== buildingId);
    }

    isLogisticsWorkerForBuilding(v, buildingId) {
        if (!v || v.assignedWarehouseId !== buildingId) return false;
        return v._assignmentRole === 'transport' ||
            v.logisticsHomeId === buildingId ||
            ['MOVING_TO_FACTORY', 'WORKING_IN_FACTORY', 'TRANSPORTING_LOGISTICS', 'RETURNING_TO_FACTORY'].includes(v.state);
    }

    shouldWorkerTransportForGatheringBuilding(v, entity) {
        if (!v || !entity) return false;
        const buildingId = entity.id || `${entity.type1}_${entity.x}_${entity.y}`;
        const split = this.getGatheringBuildingWorkerSplit(entity);
        if (split.transporters <= 0) return false;

        const assignedWorkers = this.state.units.villagers
            .filter(worker => worker.assignedWarehouseId === buildingId)
            .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
        const workerIndex = assignedWorkers.findIndex(worker => worker.id === v.id);
        if (workerIndex < 0) return false;
        return workerIndex >= split.gatherers && workerIndex < split.gatherers + split.transporters;
    }

    canSwitchGatheringAssignmentRole(v) {
        if (!v) return false;
        if ((v.cargo || 0) > 0 || (v.cargoAmount || 0) > 0) return false;
        return !['TRANSPORTING_LOGISTICS', 'RETURNING_TO_FACTORY', 'MOVING_TO_BASE'].includes(v.state);
    }

    assignWorkerToGathering(v, entity, buildingId) {
        v.assignedWarehouseId = buildingId;
        v.factoryTarget = null;
        v.logisticsHomeId = null;
        v.logisticsTargetId = null;
        v.logisticsSourceId = null;
        v.logisticsWorkKey = null;
        v.logisticsWorkTimer = 0;
        v._assignmentRole = 'gather';
        v.type = this.getGatheringResourceType(entity);
        v.state = 'MOVING_TO_RESOURCE';
        v.targetId = (entity.type1 === 'farmland' || entity.type1 === 'tree_plantation') ? entity : null;
        v.gatherPoint = null;
        v.pathTarget = null;
        v.fullPath = null;
        v.visible = true;
        if (v.sprite && typeof v.sprite.setVisible === 'function') v.sprite.setVisible(true);
        if (v.gameObject && typeof v.gameObject.setVisible === 'function') v.gameObject.setVisible(true);
    }

    rebalanceGatheringBuildingWorkers(entity, buildingId, workers) {
        const split = this.getGatheringBuildingWorkerSplit(entity);
        if (split.transporters <= 0) {
            workers.forEach(v => {
                if (!this.isGatheringWorkerForBuilding(v, buildingId)) {
                    this.assignWorkerToGathering(v, entity, buildingId);
                }
            });
            return;
        }

        const sorted = [...workers].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
        sorted.forEach((v, index) => {
            if (index < split.gatherers) {
                if (!this.isGatheringWorkerForBuilding(v, buildingId) && this.canSwitchGatheringAssignmentRole(v)) {
                    this.assignWorkerToGathering(v, entity, buildingId);
                }
            } else if (!this.isLogisticsWorkerForBuilding(v, buildingId) && this.canSwitchGatheringAssignmentRole(v)) {
                this.assignWorkerToIndoorLogistics(v, entity, buildingId);
            }
        });
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

    getSceneResourceGatherTime(target, fallback = 3) {
        if (!target || target.gx === undefined || target.gy === undefined || !this.state.mapData) return null;
        const res = this.state.mapData.getResource(target.gx, target.gy);
        const typeNum = res ? res.type : target._lastResType;
        if (!typeNum) return null;
        const typeName = ResourceSystem.getResourceTypeName(typeNum);
        const timeTypeMap = {
            SCENE_WOOD: 'wood',
            SCENE_STONE: 'stone',
            SCENE_FRUIT: 'fruit',
            SCENE_GOLD_ORE: 'gold_ore',
            SCENE_GOLD_MINE: 'gold_ore',
            SCENE_IRON_ORE: 'iron_ore',
            SCENE_IRON_MINE: 'iron_ore',
            SCENE_COAL: 'coal_ore',
            SCENE_COAL_ORE: 'coal_ore',
            SCENE_COAL_MINE: 'coal_ore',
            SCENE_MAGIC_HERB: 'magic_herb',
            SCENE_CRYSTAL_ORE: 'crystal_ore',
            SCENE_CRYSTAL_MINE: 'crystal_ore',
            SCENE_COPPER_ORE: 'copper_ore',
            SCENE_COPPER_MINE: 'copper_ore',
            SCENE_SILVER_ORE: 'silver_ore',
            SCENE_SILVER_MINE: 'silver_ore',
            SCENE_MITHRIL_ORE: 'mithril_ore',
            SCENE_MITHRIL_MINE: 'mithril_ore'
        };
        const timeType = timeTypeMap[typeName] || typeName;
        return this.getIngredientProductionTime(timeType, fallback);
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
        const sceneResourceTime = this.getSceneResourceGatherTime(v.targetId, 3);
        if (sceneResourceTime !== null) return sceneResourceTime;

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
        v._assignmentRole = 'transport';
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

        const capacity = this.isGatheringBuilding(building)
            ? (cfg.need_villagers || 0)
            : (building.targetWorkerCount || cfg.need_villagers || 0);
        if (capacity <= 0) return false;
        return this.getAssignedCountForBuilding(building, v.id) < capacity;
    }

    ensureBuildingWorkerTarget(building, minimumCount = 1) {
        if (!building) return;
        if (this.isGatheringBuilding(building)) {
            const cfg = this.engine.getBuildingConfig(building.type1, building.lv || 1);
            const capacity = cfg ? (cfg.need_villagers || 0) : 0;
            building.targetWorkerCount = Math.min(capacity, Math.max(building.targetWorkerCount || 0, minimumCount));
            return;
        }
        building.targetWorkerCount = Math.max(building.targetWorkerCount || 0, minimumCount);
    }

    getBuildingWorkerTarget(entity) {
        if (!entity) return 0;
        const cfg = this.engine.getBuildingConfig(entity.type1, entity.lv || 1);
        if (this.isGatheringBuilding(entity)) {
            const capacity = cfg ? (cfg.need_villagers || 0) : 0;
            return Math.max(0, Math.min(capacity, entity.targetWorkerCount || 0));
        }
        return Math.max(0, entity.targetWorkerCount || 0);
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
        v._assignmentRole = 'transport';
        v.state = 'WORKING_IN_FACTORY';
        v.pathTarget = null;
        v.fullPath = null;
        v.pathIndex = 0;
        v._lastRequestedTarget = null;
        v._pathRequestId = (v._pathRequestId || 0) + 1;
        v.isFindingPath = false;
        v.commandCenter = null;
        v.visible = false;
        BattleSystem.clearUnitAsTarget(v.id, this.state);

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

    processAutomatedLogistics(state, deltaTime) {
        if (!state.activeTransfers) state.activeTransfers = [];
        // [固定子步長] 物品移動與合流放行對 tick 粗細極度敏感：每 tick 位移 = 速度×dt，
        // dt 過大時 winner 過衝合流閘門，留下永不閉合的碎片間隙（5Hz→56%、20Hz→83% 滿載）。
        // 把「移動+合流」這段切成固定 stepDt 子步長，與外部 tick 率脫鉤；建築發料仍用完整 deltaTime。
        let stepDt = deltaTime;
        const addTransportLog = (message) => {
            if (this.engine && typeof this.engine.addLog === 'function') {
                this.engine.addLog(message, 'LOGISTICS');
            }
        };
        const getEntityLabel = (ent) => ent ? (ent.name || ent.type1 || ent.type || '未知建築') : '未知目標';
        const getTransferRouteText = (transfer) => {
            const count = Array.isArray(transfer?.routePoints) ? transfer.routePoints.length : 0;
            return count >= 2 ? `路徑 ${count} 點` : '未取得繪製路徑點';
        };

        // 1. 推進正在運輸中的物品
        const getTransferSpeed = (transfer) => {
            const groupId = transfer?.lineId;
            const line = groupId && Array.isArray(state.logisticsLines)
                ? state.logisticsLines.find(item => item && (item.groupId === groupId || item.id === groupId) && Number(item.efficiency) > 0)
                : null;
            const cfg = this.engine ? this.engine.getEntityConfig(line?.lineType || 'transport_line', 1) : null;
            return Math.max(0.1, Number(line?.efficiency) || Number(transfer?.efficiency) || Number(cfg?.efficiency) || 4);
        };
        const getTransferRouteMetrics = (transfer) => {
            const points = transfer?.routePoints;
            if (!Array.isArray(points) || points.length < 2) {
                return { totalPixels: 0, totalTiles: 1 };
            }
            if (transfer._logicRouteMetricsPoints === points && transfer._logicRouteMetrics) {
                return transfer._logicRouteMetrics;
            }
            const key = points.map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join("|");
            if (transfer._logicRouteMetricsKey === key && transfer._logicRouteMetrics) {
                transfer._logicRouteMetricsPoints = points;
                return transfer._logicRouteMetrics;
            }

            let total = 0;
            for (let j = 0; j < points.length - 1; j++) {
                const segLen = Math.abs(points[j + 1].x - points[j].x) + Math.abs(points[j + 1].y - points[j].y);
                total += segLen;
            }

            const metrics = { totalPixels: total, totalTiles: Math.max(1, total / 20) };
            transfer._logicRouteMetricsPoints = points;
            transfer._logicRouteMetricsKey = key;
            transfer._logicRouteMetrics = metrics;
            return metrics;
        };
        const getRouteLengthInTiles = (transfer) => {
            return getTransferRouteMetrics(transfer).totalTiles;
        };
        const getStorageAmount = (ent, itemType) => {
            const key = String(itemType || '').toLowerCase();
            return (ent?.storage && Number(ent.storage[key])) || 0;
        };
        const removeFromWarehouseStorage = (ent, itemType, amount = 1) => {
            if (!ent || !itemType || amount <= 0) return false;
            const key = String(itemType).toLowerCase();
            if (!ent.storage) ent.storage = {};
            if ((ent.storage[key] || 0) < amount) return false;
            ent.storage[key] -= amount;
            if (ent.storage[key] <= 0) delete ent.storage[key];
            if (state.resources) {
                state.resources[key] = Math.max(0, (state.resources[key] || 0) - amount);
            }
            return true;
        };
        const getTransferPathKey = (transfer) => {
            if (transfer?.lineId) return `line:${transfer.lineId}`;
            const points = transfer?.routePoints || [];
            const first = points[0];
            const last = points[points.length - 1];
            return [
                "route",
                first ? `${Math.round(first.x)},${Math.round(first.y)}` : "start",
                last ? `${Math.round(last.x)},${Math.round(last.y)}` : "end"
            ].join("|");
        };
        const canStartTransfer = (transfer) => {
            if (!transfer || !Array.isArray(transfer.routePoints) || transfer.routePoints.length < 2) return true;
            const key = getTransferPathKey(transfer);
            const totalLength = getTransferRouteMetrics(transfer).totalPixels;
            if (totalLength <= 0) return true;
            const cellSize = this.engine?.TILE_SIZE || 20;
            return !state.activeTransfers.some(active => {
                if (!active || active.id === transfer.id) return false;
                if (!Array.isArray(active.routePoints) || active.routePoints.length < 2) return false;
                if (getTransferPathKey(active) !== key) return false;
                const activeTotal = getTransferRouteMetrics(active).totalPixels || totalLength;
                const activeDistance = Math.max(0, Math.min(1, Number(active.progress) || 0)) * activeTotal;
                return activeDistance < cellSize;
            });
        };
        const getPathDistanceToPoint = (points, point) => {
            if (!Array.isArray(points) || points.length < 2 || !point) return 0;
            let bestDist = Infinity;
            let bestPathDist = 0;
            let total = 0;
            for (let j = 0; j < points.length - 1; j++) {
                const a = points[j];
                const b = points[j + 1];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.abs(dx) + Math.abs(dy);
                const lenSq = dx * dx + dy * dy;
                if (lenSq > 0) {
                    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
                    const proj = { x: a.x + dx * t, y: a.y + dy * t };
                    const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestPathDist = total + len * t;
                    }
                }
                total += len;
            }
            return bestPathDist;
        };
        const getMergeAdmissionWinner = (node, spacing) => {
            if (!node || !Array.isArray(node.inputGroupIds)) return null;
            if (conveyorSystem && typeof conveyorSystem.getLogisticsMergeAdmissionWinner === 'function') {
                return conveyorSystem.getLogisticsMergeAdmissionWinner(node, state, {
                    spacing,
                    readyDistanceFromEnd: spacing
                });
            }
            const mergePoint = node.point || { x: node.x, y: node.y };
            const key = `${node.outputGroupId || "output"}:${Math.round(mergePoint.x || 0)},${Math.round(mergePoint.y || 0)}`;
            const contendersByLine = new Map();
            state.activeTransfers.forEach(other => {
                if (!other || !node.inputGroupIds.includes(other.lineId)) return;
                if (!Array.isArray(other.routePoints) || other.routePoints.length < 2) return;
                const otherTotal = getTransferRouteMetrics(other).totalPixels;
                if (otherTotal <= 0) return;
                const otherDistance = Math.max(0, Math.min(1, Number(other.progress) || 0)) * otherTotal;
                if (otherDistance < otherTotal - spacing - 0.1) return;
                const current = contendersByLine.get(other.lineId);
                if (!current || otherDistance > current.distance || (
                    Math.abs(otherDistance - current.distance) <= 0.1 &&
                    String(other.id || "") < String(current.transfer.id || "")
                )) {
                    contendersByLine.set(other.lineId, { transfer: other, distance: otherDistance });
                }
            });
            const contenders = Array.from(contendersByLine.values())
                .map(item => item.transfer)
                .filter(item => item?.id)
                .sort((a, b) => String(a.id).localeCompare(String(b.id)));
            if (contenders.length <= 1) return contenders[0]?.id || null;
            const signature = contenders.map(item => item.id).join("|");
            if (!state._logisticsMergeAdmissionWinners) state._logisticsMergeAdmissionWinners = {};
            const previous = state._logisticsMergeAdmissionWinners[key];
            if (previous && previous.signature === signature && contenders.some(item => item.id === previous.winnerId)) {
                return previous.winnerId;
            }
            const winner = contenders[Math.floor(Math.random() * contenders.length)];
            state._logisticsMergeAdmissionWinners[key] = { signature, winnerId: winner.id };
            return winner.id;
        };
        const getMergeInputMaxDistance = (transfer, totalLength, spacing) => {
            if (!conveyorSystem || typeof conveyorSystem.getLogisticsMergeNodeForInputTransfer !== 'function') {
                return totalLength;
            }
            const node = conveyorSystem.getLogisticsMergeNodeForInputTransfer(transfer, state);
            if (!node || !node.outputGroupId) return totalLength;
            const mergePoint = node.point || { x: node.x, y: node.y };

            const winnerId = getMergeAdmissionWinner(node, spacing);
            const isWinner = winnerId && transfer.id && transfer.id === winnerId;
            // [非勝者等待線] 與 LogisticsTransferQueues 一致：未取得路權前一律停在合流點前一格，
            // 杜絕貼隊推進造成的相位損失與重疊。
            if (!isWinner) {
                return Math.max(0, totalLength - spacing);
            }

            let requiredWait = 0;
            state.activeTransfers.forEach(other => {
                if (!other || other === transfer) return;
                if (other.lineId !== node.outputGroupId) return;
                if (!Array.isArray(other.routePoints) || other.routePoints.length < 2) return;
                const otherMetrics = getTransferRouteMetrics(other);
                const otherTotal = otherMetrics.totalPixels;
                if (otherTotal <= 0) return;
                const otherProgress = Math.max(0, Math.min(1, Number(other.progress) || 0));
                const otherMaxAllowed = other.maxAllowedProgress !== undefined ? other.maxAllowedProgress : 1.0;
                const otherQueueHeld = other.queueBlocked === true && otherProgress >= otherMaxAllowed - 0.0001;
                const projectedProgress = otherQueueHeld
                    ? otherProgress
                    : Math.min(otherMaxAllowed, otherProgress + stepDt * (getTransferSpeed(other) / Math.max(1, otherMetrics.totalTiles)));
                const otherDistance = projectedProgress * otherTotal;
                const mergeDistance = getPathDistanceToPoint(other.routePoints, mergePoint);
                const distFromMerge = otherDistance - mergeDistance;
                const followingMainMayOverlapTurn = node.zipperTurn === 'branch' &&
                    node.awaitingMainPass !== true &&
                    distFromMerge < -0.01;
                if (Math.abs(distFromMerge) < spacing - 0.1 && !followingMainMayOverlapTurn) {
                    // [緊密放行] 勝者隨前車逐步跟進保持一格間距。
                    const followGap = distFromMerge >= 0
                        ? Math.max(0, spacing - distFromMerge)
                        : spacing;
                    requiredWait = Math.max(requiredWait, followGap);
                } else if (node.awaitingMainPass === true && node.zipperTurn !== 'branch' &&
                    distFromMerge <= -(spacing + 0.1) && distFromMerge > -spacing * 3) {
                    // [防碎片視界] 輪到主線時，三格內有逼近中的來車：於等待線候命，禁止插它前面。
                    requiredWait = Math.max(requiredWait, spacing);
                }
            });
            if (requiredWait > 0) return Math.max(0, totalLength - requiredWait);
            return totalLength;
        };

        // [固定子步長] 把「回壓佇列→堆積限制→移動→合流放行」整段以固定 stepDt 重複推進，
        // 使每子步位移 ≤ 一個合理格分數，合流閘門維持細粒度，不受外部 tick 粗細影響。
        const LOGISTICS_SUB_DT = 0.0167; // ~60Hz 等效粒度，間距收斂到 1 格/93% 滿載（dt 上限 0.2 → ≤12 子步）
        const subSteps = Math.max(1, Math.ceil(deltaTime / LOGISTICS_SUB_DT - 1e-6));
        stepDt = deltaTime / subSteps;
        for (let _subStep = 0; _subStep < subSteps; _subStep++) {

        if (conveyorSystem && typeof conveyorSystem.applyBlockedTransferQueues === 'function') {
            conveyorSystem.applyBlockedTransferQueues(state);
        }

        // ==========================================
        // [新增] 計算每條物流線上物品的最大允許進度以實現堆積 (Backpressure & Stacking)
        // ==========================================
        const transfersByPath = new Map();
        state.activeTransfers.forEach(t => {
            if (!t) return;
            const key = getTransferPathKey(t);
            if (!transfersByPath.has(key)) {
                transfersByPath.set(key, []);
            }
            transfersByPath.get(key).push(t);
        });

        const cellSize = this.engine?.TILE_SIZE || 20;

        const isMergeInputTransfer = (transfer) => conveyorSystem &&
            typeof conveyorSystem.isLogisticsMergeInputTransfer === 'function' &&
            conveyorSystem.isLogisticsMergeInputTransfer(transfer, state);
        const isMergeOutputTransfer = (transfer) => {
            const lineId = transfer?.lineId || null;
            if (!lineId || !Array.isArray(state.logisticsMergeNodes)) return false;
            return state.logisticsMergeNodes.some(node => node?.outputGroupId === lineId);
        };

        Array.from(transfersByPath.entries()).sort(([, a], [, b]) => {
            const aIsMergeInput = a.some(isMergeInputTransfer);
            const bIsMergeInput = b.some(isMergeInputTransfer);
            return Number(aIsMergeInput) - Number(bIsMergeInput);
        }).forEach(([pathKey, groupTransfers]) => {
            // [對齊最長主線] 與 LogisticsTransferQueues 一致：
            // 尋找組內最長路徑作為基準路徑 (canonical)，並以此計算對齊後的距離進行排序與 Stacking 計算，
            // 避免轉彎車剛合流到 output 路線時，因 progress 重置為 0 被誤判在直行後車的後方而產生煞車。
            const canonical = groupTransfers.reduce((best, transfer) => {
                const len = getTransferRouteMetrics(transfer).totalPixels;
                return len > best.length ? { points: transfer.routePoints, length: len } : best;
            }, { points: null, length: 0 });

            const useCanonical = groupTransfers.length > 1 && canonical.length > 0 && groupTransfers.some(transfer => {
                const points = transfer.routePoints || [];
                const canonicalPoints = canonical.points || [];
                if (points.length !== canonicalPoints.length) return true;
                return points.some((point, index) => {
                    const other = canonicalPoints[index];
                    return !other || Math.hypot(point.x - other.x, point.y - other.y) > 0.1;
                });
            });

            const getPointOnPathByDistance = (pts, distance) => {
                if (!Array.isArray(pts) || pts.length < 2) return null;
                let remaining = Math.max(0, Number(distance) || 0);
                for (let i = 0; i < pts.length - 1; i++) {
                    const a = pts[i];
                    const b = pts[i + 1];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const len = Math.abs(dx) + Math.abs(dy); // 正交物流路徑長度
                    if (len <= 0) continue;
                    if (remaining <= len || i === pts.length - 2) {
                        const t = Math.max(0, Math.min(1, remaining / len));
                        return { x: a.x + dx * t, y: a.y + dy * t };
                    }
                    remaining -= len;
                }
                const last = pts[pts.length - 1];
                return last ? { x: last.x, y: last.y } : null;
            };

            const distanceCache = new Map();
            const getDistance = (transfer) => {
                if (distanceCache.has(transfer)) return distanceCache.get(transfer);
                const total = getTransferRouteMetrics(transfer).totalPixels;
                const distance = Math.max(0, Math.min(1, Number(transfer.progress) || 0)) * total;
                const resolved = useCanonical
                    ? getPathDistanceToPoint(canonical.points, getPointOnPathByDistance(transfer.routePoints, distance))
                    : distance;
                distanceCache.set(transfer, resolved);
                return resolved;
            };

            // 排序：若是 useCanonical，以對齊後的 canonical 距離由大到小排序，否則依 progress 排序
            groupTransfers.sort((a, b) => {
                const da = getDistance(a);
                const db = getDistance(b);
                if (Math.abs(db - da) > 0.0001) return db - da;
                return String(a.id).localeCompare(String(b.id));
            });

            let prevMaxCanonicalDist = Infinity;
            for (let j = 0; j < groupTransfers.length; j++) {
                const t = groupTransfers[j];
                const metrics = getTransferRouteMetrics(t);
                const totalLength = metrics.totalPixels;
                if (totalLength <= 0) {
                    t.maxAllowedProgress = 1.0;
                    continue;
                }

                const isMergeInput = isMergeInputTransfer(t);
                const isBreakpoint = !t.targetId && !isMergeInput;
                if (isMergeInput) {
                    delete t.queueBlocked;
                    delete t.blockedOnBrokenLine;
                }

                // 動態判定末端堆積限制：
                // 若末端點鄰近另一群組的線段起始點（表示是刪除後形成的斷點間隙），
                // 物品停在倒數第二格（totalLength - cellSize），否則停在自然終點（totalLength）。
                let dist_pn = totalLength;
                if (isBreakpoint) {
                    const bpts = t.routePoints;
                    if (Array.isArray(bpts) && bpts.length >= 2) {
                        const lastPt = bpts[bpts.length - 1];
                        const tLineId = t.lineId;
                        const isGapEndpoint = (state.logisticsLines || []).some(seg => {
                            if (!seg) return false;
                            const segGroupId = seg.groupId || seg.id;
                            if (segGroupId === tLineId) return false;
                            const segPts = Array.isArray(seg.routePoints) ? seg.routePoints : [];
                            if (segPts.length < 1) return false;
                            const segStart = segPts[0];
                            return segStart && Math.hypot(segStart.x - lastPt.x, segStart.y - lastPt.y) <= cellSize * 1.5;
                        });
                        if (isGapEndpoint) {
                            dist_pn = totalLength - cellSize;
                        }
                    }
                }

                const startDistOnCanonical = useCanonical
                    ? getPathDistanceToPoint(canonical.points, t.routePoints[0])
                    : 0;

                // [緊密不重疊] 主線與一般線統一使用完整物品長度作為間距，嚴防重疊。
                let spacing = cellSize;
                const desired = (t.progress || 0) * totalLength;

                let maxDist = totalLength;
                if (j === 0) {
                    if (isBreakpoint) {
                        maxDist = dist_pn;
                    } else if (isMergeInput) {
                        maxDist = Math.min(totalLength, getMergeInputMaxDistance(t, totalLength, cellSize));
                    } else {
                        maxDist = totalLength;
                    }
                } else {
                    const frontItem = groupTransfers[j - 1];
                    const frontCanonicalDist = getDistance(frontItem);
                    const physicalLimitCanonical = Math.max(startDistOnCanonical, Math.min(frontCanonicalDist, prevMaxCanonicalDist) - spacing);

                    let limitCanonical = startDistOnCanonical + totalLength;
                    if (desired <= dist_pn) {
                        const targetLimitCanonical = startDistOnCanonical + dist_pn;
                        if (frontCanonicalDist > targetLimitCanonical || prevMaxCanonicalDist > targetLimitCanonical) {
                            limitCanonical = Math.min(targetLimitCanonical, physicalLimitCanonical);
                        } else {
                            limitCanonical = physicalLimitCanonical;
                        }
                    } else {
                        limitCanonical = physicalLimitCanonical;
                    }
                    // 將 canonical 座標系的限制還原至物品局部座標系的 maxDist
                    maxDist = Math.max(0, limitCanonical - startDistOnCanonical);
                }

                // [拉鏈式合流] 主線穿越車在輪到支線時於合流點前一格讓行（對佇列中任何位置的穿越車皆適用）
                if (isMergeOutputTransfer(t) && conveyorSystem &&
                    typeof conveyorSystem.getLogisticsMergeThroughYieldLimit === 'function') {
                    const yieldLimit = conveyorSystem.getLogisticsMergeThroughYieldLimit(t, state, cellSize);
                    if (Number.isFinite(yieldLimit)) {
                        maxDist = Math.min(maxDist, yieldLimit);
                    }
                }

                prevMaxCanonicalDist = startDistOnCanonical + maxDist;
                t.maxAllowedProgress = maxDist / totalLength;
                if (isMergeInput) {
                    t.queueBlocked = maxDist < totalLength - 0.1 && desired >= maxDist - 0.1;
                }
            }
        });

        for (let i = state.activeTransfers.length - 1; i >= 0; i--) {
            let t = state.activeTransfers[i];
            const maxAllowed = t.maxAllowedProgress !== undefined ? t.maxAllowedProgress : 1.0;
            const queueHeld = t.queueBlocked === true && t.progress >= maxAllowed - 0.0001;

            if (!queueHeld && t.progress < maxAllowed) {
                t.progress += stepDt * (getTransferSpeed(t) / getRouteLengthInTiles(t));
                if (t.progress > maxAllowed) {
                    t.progress = maxAllowed;
                }
            } else if (t.progress > maxAllowed) {
                // 移動階段只標記阻塞；最終佔位由 LogisticsTransferQueues 統一裁決。
                t.queueBlocked = true;
            }

            if (t._mergeVisualTurn && Array.isArray(t.routePoints) && t.routePoints.length >= 2) {
                const turnPoint = { x: Number(t._mergeVisualTurn.x), y: Number(t._mergeVisualTurn.y) };
                if (Number.isFinite(turnPoint.x) && Number.isFinite(turnPoint.y)) {
                    const metrics = getTransferRouteMetrics(t);
                    const currentDistance = Math.max(0, Math.min(1, Number(t.progress) || 0)) * metrics.totalPixels;
                    const mergeDistance = getPathDistanceToPoint(t.routePoints, turnPoint);
                    if (currentDistance > mergeDistance + cellSize + 0.1) {
                        delete t._mergeVisualTurn;
                    }
                } else {
                    delete t._mergeVisualTurn;
                }
            }

            // [新增] 追蹤邏輯
            if (state && state.trackedTransferId === t.id) {
                const points = t.routePoints;
                if (Array.isArray(points) && points.length >= 2) {
                    let totalLength = 0;
                    const segmentLengths = [];
                    for (let j = 0; j < points.length - 1; j++) {
                        const dx = points[j + 1].x - points[j].x;
                        const dy = points[j + 1].y - points[j].y;
                        const len = Math.hypot(dx, dy);
                        segmentLengths.push(len);
                        totalLength += len;
                    }

                    let remain = t.progress * totalLength;
                    let currentSegment = 0;
                    for (let j = 0; j < segmentLengths.length; j++) {
                        if (remain <= segmentLengths[j]) {
                            currentSegment = j;
                            break;
                        }
                        remain -= segmentLengths[j];
                        currentSegment = j; // fallback
                    }

                    if (t.lastSegment !== currentSegment) {
                        for (let seg = t.lastSegment + 1; seg <= currentSegment; seg++) {
                            const p1 = points[seg];
                            const p2 = points[seg + 1] || p1;
                            if (this.engine && typeof this.engine.addLog === 'function') {
                                this.engine.addLog(`${t.itemType} 由位置${seg}(${Math.round(p1.x)},${Math.round(p1.y)})移動至位置${seg + 1}(${Math.round(p2.x)},${Math.round(p2.y)})`, 'LOGISTICS');
                            }
                        }
                        t.lastSegment = currentSegment;
                    }
                }
            }

            if (t.progress >= 1) {
                if (t.targetId) {
                    let target = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === t.targetId);
                    if (target) {
                        const tType = target.type1 || target.type;
                        const deposited = ResourceSystem.depositResourceToBuilding(state, this.engine, target, t.itemType, 1, null);
                        if (!deposited && !['warehouse', 'storehouse', 'barn', 'town_center', 'village'].includes(tType)) {
                            if (!target.inputBuffer) target.inputBuffer = {};
                            target.inputBuffer[t.itemType] = (target.inputBuffer[t.itemType] || 0) + 1;
                        }
                        if (window.UIManager) window.UIManager.updateValues(true);
                        // addTransportLog(`[物流] ${String(t.itemType).toUpperCase()} 已送達 ${getEntityLabel(target)}。`);
                    }
                    if (state && state.trackedTransferId === t.id) {
                        state.trackedTransferId = null; // 釋放追蹤
                        if (this.engine && typeof this.engine.addLog === 'function') {
                            this.engine.addLog(`[追蹤] 物品 ${t.itemType} 已送達目的地。`, 'LOGISTICS');
                        }
                    }
                    state.activeTransfers.splice(i, 1);
                } else {
                    t.progress = 1;
                }
            }
        }

        if (conveyorSystem && typeof conveyorSystem.applyLogisticsMergeNodes === 'function') {
            conveyorSystem.applyLogisticsMergeNodes(state);
        }

        } // ── 固定子步長迴圈結束 ──

        // 2. 讓滿足工人條件的建築自動發送物品
        state.mapEntities.forEach(ent => {
            if (!ent.outputTargets || ent.outputTargets.length === 0) return;

            const cfg = this.engine ? this.engine.getEntityConfig(ent.type1, ent.lv) : null;
            const needWorkers = cfg ? (cfg.need_villagers || 0) : 0;
            const currentWorkers = ent.assignedWorkers ? ent.assignedWorkers.length : 0;
            const isWarehouse = ['warehouse', 'storehouse', 'barn', 'town_center', 'village'].includes(ent.type1);



            // 修正規則：不再因為工人不足而停擺。
            // 1 名工人是 1 倍效率，N 名工人是 N 倍效率。
            const efficiency = Math.max(0, currentWorkers);

            const itemDispatchInterval = 2; // 基準：1 名工人每 2 秒發送一個物品。
            ent.logisticsTimer = (ent.logisticsTimer || 0) + deltaTime * efficiency;
            if (ent.logisticsTimer >= itemDispatchInterval) {
                let itemSpawned = false;

                const outputTargets = Array.isArray(ent.outputTargets) ? ent.outputTargets : [];
                const startIndex = outputTargets.length > 0
                    ? Math.max(0, Math.floor(Number(ent.nextLogisticsOutputTargetIndex) || 0)) % outputTargets.length
                    : 0;

                for (let offset = 0; offset < outputTargets.length; offset++) {
                    if (itemSpawned) break; // 一次 tick 只發送一個物品，依序分配
                    const connIndex = (startIndex + offset) % outputTargets.length;
                    const conn = outputTargets[connIndex];

                    if (isWarehouse) {
                        if (conn.filter) {
                            if (this.engine && typeof this.engine.addLog === 'function' && !ent._debugLogged) {
                                this.engine.addLog(`[DEBUG] Warehouse checking: ${conn.filter}, value: ${getStorageAmount(ent, conn.filter)}`, 'LOGISTICS');
                                ent._debugLogged = true;
                            }
                            if (getStorageAmount(ent, conn.filter) >= 1) {
                                const transfer = this.createActiveTransfer(state, ent, conn, conn.filter);
                                if (!transfer) continue;
                                if (!canStartTransfer(transfer)) continue;
                                if (!removeFromWarehouseStorage(ent, conn.filter, 1)) continue;
                                if (window.UIManager) window.UIManager.updateValues(true);
                                this.assignTransferSerial(state, transfer);
                                state.activeTransfers.push(transfer);
                                itemSpawned = true;
                                ent.nextLogisticsOutputTargetIndex = (connIndex + 1) % outputTargets.length;
                                const target = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === conn.id);
                                // addTransportLog(`[物流] ${getEntityLabel(ent)} -> ${getEntityLabel(target)} 開始輸送 ${String(conn.filter).toUpperCase()}（${getTransferRouteText(transfer)}）。`);
                            }
                        }
                    } else if (ent.outputBuffer) {
                        for (let resType in ent.outputBuffer) {
                            if (ent.outputBuffer[resType] >= 1 && conn.filter === resType) {
                                const transfer = this.createActiveTransfer(state, ent, conn, resType);
                                if (!transfer) continue;
                                if (!canStartTransfer(transfer)) continue;
                                ent.outputBuffer[resType] -= 1;
                                if (window.UIManager) window.UIManager.updateValues(true);
                                this.assignTransferSerial(state, transfer);
                                state.activeTransfers.push(transfer);
                                itemSpawned = true;
                                ent.nextLogisticsOutputTargetIndex = (connIndex + 1) % outputTargets.length;
                                const target = state.mapEntities.find(e => (e.id || `${e.type1}_${e.x}_${e.y}`) === conn.id);
                                // addTransportLog(`[物流] ${getEntityLabel(ent)} -> ${getEntityLabel(target)} 開始輸送 ${String(resType).toUpperCase()}（${getTransferRouteText(transfer)}）。`);
                                break;
                            }
                        }
                    }
                }

                if (itemSpawned) {
                    ent.logisticsTimer = Math.max(0, ent.logisticsTimer - itemDispatchInterval);
                }
            }
        });

    }
}
