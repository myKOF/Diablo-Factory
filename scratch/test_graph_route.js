const fs = require('fs');
const path = require('path');

globalThis.UI_CONFIG = { ConveyorBuild: { alignmentUnit: 1.0 } };
globalThis.GameEngine = {
    TILE_SIZE: 20,
    state: { logisticsLines: [], activeTransfers: [], resources: {}, mapEntities: [] },
    addLog: () => {}
};
globalThis.BuildingSystem = {};
globalThis.window = { UIManager: {} };
globalThis.ConveyorRouter = class {};

const conveyorCode = fs.readFileSync(path.join(__dirname, '../src/systems/ConveyorSystem.js'), 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '// $&')
    .replace(/export class ConveyorSystem/, 'globalThis.ConveyorSystem = class ConveyorSystem')
    .replace(/export const conveyorSystem = new ConveyorSystem\(\);/, 'globalThis.conveyorSystem = new ConveyorSystem();');
eval(conveyorCode);

const align = GameEngine.TILE_SIZE / 2; // half tile = 10
function makeSegment(id, startGx, startGy, endGx, endGy, order) {
    return {
        id,
        groupId: 'extension_group',
        startGx,
        startGy,
        endGx,
        endGy,
        order,
        x: ((startGx + endGx) / 2) * align,
        y: ((startGy + endGy) / 2) * align,
        routePoints: [
            { x: startGx * align, y: startGy * align },
            { x: endGx * align, y: endGy * align }
        ]
    };
}

const segments = [];
// Create segments from 0 to 29 (30 segments)
// Horizontal row: (1, 1) -> (21, 1) -> (21, 19)
// Let's say:
// 10 horizontal segments: x goes from 1 to 21
for (let i = 0; i < 10; i++) {
    segments.push(makeSegment(`h_${i}`, 1 + i * 2, 1, 3 + i * 2, 1, i));
}
// 9 vertical segments: y goes from 1 to 19 at x = 21
for (let i = 0; i < 9; i++) {
    segments.push(makeSegment(`v_${i}`, 21, 1 + i * 2, 21, 3 + i * 2, 10 + i));
}

// Now we extend it (segments 19 to 30):
// 11 horizontal segments: x goes from 21 down to 1 at y = 19
for (let i = 0; i < 11; i++) {
    segments.push(makeSegment(`h2_${i}`, 21 - i * 2, 19, 19 - i * 2, 19, 19 + i));
}

const system = new globalThis.ConveyorSystem();
const route = system.buildLogisticsGraphRoutePoints(segments);
console.log("Graph route points length:", route ? route.length : "null");
if (route) {
    console.log("Route start:", route[0]);
    console.log("Route end:", route[route.length - 1]);
}
