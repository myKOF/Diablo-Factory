const fs = require('fs');
const path = require('path');

globalThis.UI_CONFIG = {
    ConveyorBuild: {
        alignmentUnit: 0.5,
        directionLockThreshold: 0.5
    }
};

globalThis.GameEngine = {
    TILE_SIZE: 20,
    state: {
        logisticsLines: [],
        conveyorGhosts: [],
        conveyorValid: false,
        conveyorRouteWidth: 1,
        resources: { WOOD: 1000, STONE: 1000 },
        mapEntities: [],
        pathfinding: {
            grid: Array.from({ length: 40 }, () => new Array(40).fill(0))
        }
    },
    addLog: (msg, type) => console.log(`[GAME LOG][${type}]`, msg),
    triggerWarning: (id, args) => console.warn("[GAME WARN]", id, args),
    getEntityConfig: () => ({ logistics: { canInput: true } })
};

globalThis.BuildingSystem = {
    spendResources: (state, cost) => {
        for (const [r, amt] of Object.entries(cost)) {
            state.resources[r] = (state.resources[r] || 0) - amt;
        }
        return true;
    }
};

globalThis.window = {
    UIManager: {
        resolveCurrentPortSlot: (ent, port, x, y) => port,
        getNearestPortSlot: (building, x, y, preferredDir) => ({ x, y, dir: 'right' }),
        getEntityId: (ent) => ent ? ent.id : null,
        isPointInsideEntity: () => false,
        getBuildingPortSlots: () => [],
        getOppositeDirection: (dir) => 'left',
        getLogisticsLinesAt: (x, y) => {
            const TS = GameEngine.TILE_SIZE;
            const align = TS / 2;
            const gx = Math.round(x / align);
            const gy = Math.round(y / align);
            return GameEngine.state.logisticsLines.filter(line => {
                const lx = line.gridX !== undefined ? line.gridX : Math.round(line.x / align);
                const ly = line.gridY !== undefined ? line.gridY : Math.round(line.y / align);
                return lx === gx && ly === gy;
            });
        }
    }
};

const routerCode = fs.readFileSync(path.join(__dirname, '../src/systems/ConveyorRouter.js'), 'utf8')
    .replace(/export class ConveyorRouter/, 'globalThis.ConveyorRouter = class ConveyorRouter');
eval(routerCode);

let systemCode = fs.readFileSync(path.join(__dirname, '../src/systems/ConveyorSystem.js'), 'utf8');
systemCode = systemCode.replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&');
systemCode = systemCode.replace(/export class ConveyorSystem/, 'globalThis.ConveyorSystem = class ConveyorSystem');
systemCode = systemCode.replace(/export const conveyorSystem = new ConveyorSystem\(\);/, 'globalThis.conveyorSystem = new ConveyorSystem();');
eval(systemCode);

const sys = new globalThis.ConveyorSystem();
sys.cleanupDeletedLinePreviousTurnOverride = () => {};
sys.recalculateLogisticsGroupEndpoints = () => {};
sys.updateActiveTransfersOnLogisticsChange = () => {};

console.log("=== Drag 1: 110,110 -> 250,110 (Horizontal Right) ===");
const sourceEnt = { id: 'factory_1', x: 90, y: 90, outputTargets: [] };
GameEngine.state.mapEntities.push(sourceEnt);
const sourcePort = { x: 110, y: 110, dir: 'right' };

sys.startDrag(110, 110, sourceEnt, sourcePort);
sys.updateDragNow(250, 110);
sys.submitDrag();

console.log("Lines count after Drag 1:", GameEngine.state.logisticsLines.length);

console.log("\n=== Drag 2: Extend from last segment of Drag 1 (Vertical Down) ===");
// Find the absolute last segment of Drag 1
const sorted1 = [...GameEngine.state.logisticsLines].sort((a,b) => b.x - a.x);
const lastSeg1 = sorted1[0];
console.log("lastSeg1 center x:", lastSeg1.x);

// Drag starts at 270, 110 (end of Drag 1)
sys.startDrag(270, 110, null, null, lastSeg1);
sys.updateDragNow(270, 210);
sys.submitDrag();

console.log("Lines count after Drag 2:", GameEngine.state.logisticsLines.length);

console.log("\n=== Drag 3: Extend from last segment of Drag 2 (Horizontal Left) ===");
// Find the absolute last segment of Drag 2
const sorted2 = [...GameEngine.state.logisticsLines].sort((a,b) => b.y - a.y);
const lastSeg2 = sorted2[0];
console.log("lastSeg2 center y:", lastSeg2.y);

// Drag starts at 270, 210 (end of Drag 2)
sys.startDrag(270, 210, null, null, lastSeg2);
sys.updateDragNow(170, 210);
sys.submitDrag();

console.log("Lines count after Drag 3:", GameEngine.state.logisticsLines.length);
GameEngine.state.logisticsLines.forEach((line, index) => {
    console.log(`  Line ${index}: id=${line.id}, groupId=${line.groupId}, coords=(${line.x}, ${line.y}), routePoints=${JSON.stringify(line.routePoints)}`);
});
