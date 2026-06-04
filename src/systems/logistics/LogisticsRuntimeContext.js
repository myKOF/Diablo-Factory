import { GameEngine } from '../game_systems.js';
import { UI_CONFIG } from '../../ui/ui_config.js';
import { BuildingSystem } from '../BuildingSystem.js';

export class LogisticsRuntimeContext {
    constructor(getGameEngine = () => GameEngine) {
        this.getGameEngine = getGameEngine;
    }

    get gameEngine() {
        return this.getGameEngine();
    }

    get uiConfig() {
        return UI_CONFIG;
    }

    get uiManager() {
        return typeof window !== 'undefined' ? window.UIManager : null;
    }

    get buildingSystem() {
        return BuildingSystem;
    }

    get state() {
        return this.gameEngine.state;
    }

    get tileSize() {
        return this.gameEngine.TILE_SIZE || 20;
    }

    getMapEntities(state = this.state) {
        return Array.isArray(state?.mapEntities) ? state.mapEntities : [];
    }

    getLogisticsLines(state = this.state) {
        return Array.isArray(state?.logisticsLines) ? state.logisticsLines : [];
    }

    getActiveTransfers(state = this.state) {
        return Array.isArray(state?.activeTransfers) ? state.activeTransfers : [];
    }

    getEntityId(entity) {
        return this.uiManager?.getEntityId?.(entity) || entity?.id || null;
    }

    getBuildingPortSlots(entity) {
        return this.uiManager?.getBuildingPortSlots?.(entity) || [];
    }

    getNearestPortSlot(entity, x, y, preferredDir = null) {
        return this.uiManager?.getNearestPortSlot?.(entity, x, y, preferredDir) || null;
    }

    resolveCurrentPortSlot(entity, port, fallbackX = null, fallbackY = null) {
        return this.uiManager?.resolveCurrentPortSlot?.(entity, port, fallbackX, fallbackY) || null;
    }

    isPointInsideEntity(entity, x, y) {
        return this.uiManager?.isPointInsideEntity?.(entity, x, y) === true;
    }

    getOppositeDirection(dir) {
        return this.uiManager?.getOppositeDirection?.(dir) || null;
    }

    spendResources(state, costs) {
        return this.buildingSystem.spendResources(state, costs);
    }
}
