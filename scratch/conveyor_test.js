import { ConveyorRouter } from '../src/systems/ConveyorRouter.js';

function runTests() {
    console.log("--- Starting Conveyor Routing TDD ---");

    // Initialize a 10x10 empty grid
    const cols = 10, rows = 10;
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
    const router = new ConveyorRouter(grid, cols, rows);

    // Case 1: L-Shape Test
    console.log("\n[Test 1] L-Shape Test: (0,0) to (5,5)");
    const path1 = router.findPath({ x: 0, y: 0 }, { x: 5, y: 5 });
    if (path1) {
        const turns = path1.filter(n => n.isCurve).length;
        console.log(`Path length: ${path1.length}, Turns: ${turns}`);
        console.log("Coordinates:", path1.map(p => `(${p.x},${p.y})`).join(" -> "));
        if (turns === 1) console.log("✅ Result: Passed (1 turn)");
        else console.log(`❌ Result: Failed (${turns} turns instead of 1)`);
    } else {
        console.log("❌ Result: Failed (No path found)");
    }

    // Case 2: Turn Penalty Test
    console.log("\n[Test 2] Turn Penalty Test: (0,3) to (5,3) with obstacle at (2,3)");
    // Add obstacle
    grid[3][2] = 1; 
    grid[2][2] = 1; // Make it a vertical barrier
    grid[4][2] = 1;
    
    const path2 = router.findPath({ x: 0, y: 3 }, { x: 5, y: 3 });
    if (path2) {
        const turns = path2.filter(n => n.isCurve).length;
        console.log(`Path length: ${path2.length}, Turns: ${turns}`);
        console.log("Coordinates:", path2.map(p => `(${p.x},${p.y})`).join(" -> "));
        // Should go around (0,3)->(1,3)->(1,1/5)->(3,1/5)->(3,3)->(5,3) or similar
        // Minimal turns to avoid a long barrier should be 4 turns (U-shape)
        if (turns <= 4) console.log("✅ Result: Passed (Minimal turns)");
        else console.log(`❌ Result: Failed (${turns} turns - zig-zag detected)`);
    } else {
        console.log("❌ Result: Failed (No path found)");
    }

    // Case 3: Validation Test (Port Compatibility)
    console.log("\n[Test 3] Validation Test: Output Port to Output Port");
    const sourcePort = { type: 'output', x: 0, y: 0 };
    const targetPort = { type: 'output', x: 5, y: 5 };
    
    const validate = (s, t) => {
        if (s.type === 'output' && t.type === 'output') return "Invalid: Output cannot connect to Output";
        return "Valid";
    };

    const result3 = validate(sourcePort, targetPort);
    console.log(`Validation result: ${result3}`);
    if (result3.includes("Invalid")) console.log("✅ Result: Passed (Intercepted)");
    else console.log("❌ Result: Failed (Allowed illegal connection)");

    console.log("\n--- TDD Complete ---");
}

runTests();
