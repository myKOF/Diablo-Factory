import { conveyorSystem } from '../ConveyorSystem.js';
import { buildSelectedGroupDebugGraphRoutes } from './LogisticsRouteGraph.js';
import { buildSelectedGroupDebugRoutePoints } from './LogisticsDebugRouteStitcher.js';

export class LogisticsRenderModel {
    constructor(system = conveyorSystem) {
        this.system = system;
    }

    // [P2a] debug overlay 路線拓樸（BFS 可達性 / 線性鏈分解）抽至系統層的純函式，
    // 渲染器經此 facade 取用，不再於渲染層持有圖演算法。
    buildDebugGraphRoutes(groupSegs, tileSize = 20) {
        return buildSelectedGroupDebugGraphRoutes(groupSegs, tileSize);
    }

    // [P2a] debug overlay 路線續接器（合流續接 / 實體 fallback / 回填）抽至系統層；
    // 以 this 作為 renderModel 注入，本 facade 提供續接器所需的 ensureMergeNodeStore /
    // getGroupRoutePoints / getMergeNodeOutputRoute / getSegmentsByGroupId 介面。
    getSelectedGroupDebugRoutePoints(state, groupKey, groupSegs, tileSize = 20) {
        return buildSelectedGroupDebugRoutePoints(state, groupKey, groupSegs, this, tileSize);
    }

    getMergeConnectedGroupIds(groupId, state) {
        if (!groupId) return new Set();
        if (this.system && typeof this.system.getLogisticsMergeConnectedGroupIds === 'function') {
            return this.system.getLogisticsMergeConnectedGroupIds(groupId, state);
        }
        return new Set([groupId]);
    }

    getDisplayConnectedGroupIds(groupIds, state) {
        const sourceIds = groupIds instanceof Set ? groupIds : new Set(groupIds || []);
        if (this.system && typeof this.system.getLogisticsDisplayConnectedGroupIds === 'function') {
            return this.system.getLogisticsDisplayConnectedGroupIds(sourceIds, state);
        }
        if (this.system && typeof this.system.getLogisticsGroupsConnectedThroughMergeNodes === 'function') {
            return this.system.getLogisticsGroupsConnectedThroughMergeNodes(sourceIds, state);
        }
        return new Set(sourceIds);
    }

    ensureMergeNodeStore(state) {
        if (this.system && typeof this.system.ensureLogisticsMergeNodeStore === 'function') {
            return this.system.ensureLogisticsMergeNodeStore(state);
        }
        return state?.logisticsMergeNodes || [];
    }

    getSegmentsByGroupId(groupId) {
        if (this.system && typeof this.system.getLogisticsSegmentsByGroupId === 'function') {
            return this.system.getLogisticsSegmentsByGroupId(groupId);
        }
        return [];
    }

    getLineById(lineId) {
        if (this.system && typeof this.system.getLogisticsLineById === 'function') {
            return this.system.getLogisticsLineById(lineId);
        }
        return null;
    }

    getLineRoute(line) {
        if (this.system && typeof this.system.getLogisticsLineRoute === 'function') {
            return this.system.getLogisticsLineRoute(line);
        }
        return null;
    }

    isSelectedLine(line, state) {
        if (this.system && typeof this.system.isSelectedLogisticsLine === 'function') {
            return this.system.isSelectedLogisticsLine(line);
        }
        return !!line && state?.selectedLogisticsLineId === line.id;
    }

    getConnectionRoute(source, target, conn) {
        if (this.system && typeof this.system.getConnectionRoute === 'function') {
            return this.system.getConnectionRoute(source, target, conn);
        }
        return null;
    }

    getConnectionTransferRoute(source, target, conn) {
        if (this.system && typeof this.system.getConnectionTransferRoute === 'function') {
            return this.system.getConnectionTransferRoute(source, target, conn);
        }
        return null;
    }

    buildPreviewSegments(rawGhostPoints, routeWidth) {
        if (!this.system ||
            typeof this.system.buildGridRoutePoints !== 'function' ||
            typeof this.system.buildLogisticsSegments !== 'function') {
            return null;
        }
        const gridPoints = this.system.buildGridRoutePoints(rawGhostPoints);
        return this.system.buildLogisticsSegments(
            '__preview__',
            null,
            null,
            null,
            gridPoints,
            routeWidth,
            null,
            null,
            null
        );
    }

    getMergeNodeForInputTransfer(transfer, state) {
        if (this.system && typeof this.system.getLogisticsMergeNodeForInputTransfer === 'function') {
            return this.system.getLogisticsMergeNodeForInputTransfer(transfer, state);
        }
        return null;
    }

    getMergeNodeOutputRoute(node) {
        if (this.system && typeof this.system.getLogisticsMergeNodeOutputRoute === 'function') {
            return this.system.getLogisticsMergeNodeOutputRoute(node);
        }
        return null;
    }

    getGroupRoutePoints(groupId, anchorPoint) {
        if (this.system && typeof this.system.getLogisticsGroupRoutePoints === 'function') {
            return this.system.getLogisticsGroupRoutePoints(groupId, anchorPoint);
        }
        return null;
    }
}

export const logisticsRenderModel = new LogisticsRenderModel();
