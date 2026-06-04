import { LogisticsRuntimeContext } from './LogisticsRuntimeContext.js';

export class LogisticsConfigCostAdapter {
    constructor(system, runtimeContext = new LogisticsRuntimeContext()) {
        this.system = system;
        this.runtime = runtimeContext;
    }

    getAlignmentUnit() {
        const unit = Number(this.runtime.uiConfig.ConveyorBuild?.alignmentUnit) || 0.5;
        return Math.max(0.5, Math.min(1, unit));
    }

    getGridUnitSize() {
        return this.runtime.gameEngine.TILE_SIZE;
    }

    getRouteScale() {
        return Math.round(1 / this.getAlignmentUnit());
    }

    getTransportLineConfig() {
        const configs = this.runtime.state?.buildingConfigs || {};
        const selectedType = this.runtime.state?.activeTransportLineType;
        return (selectedType && configs[selectedType]) ||
            Object.values(configs).find(cfg => cfg && cfg.type2 === 'transport_line') ||
            configs.transport_line ||
            null;
    }

    getTransportLineCost(segmentCount) {
        const cfg = this.getTransportLineConfig();
        const costs = {};
        Object.entries(cfg?.costs || {}).forEach(([resource, amount]) => {
            const value = Number(amount) || 0;
            if (value > 0) costs[resource] = value * Math.max(0, segmentCount);
        });
        return costs;
    }

    canAffordTransportLine(segmentCount) {
        const resources = this.runtime.state?.resources || {};
        const costs = this.getTransportLineCost(segmentCount);
        return Object.entries(costs).every(([resource, amount]) => (resources[resource] || 0) >= amount);
    }

}
