const fs = require('fs');
let c = fs.readFileSync('tests/LogisticsLinesMerge.spec.js', 'utf8');

// Set Rally Point
c = c.replace('// [系統日誌] 城鎮中心 集結點已鎖定至：倉庫', `// [系統日誌] 城鎮中心 集結點已鎖定至：倉庫
    await executeLogic(page, () => {
        const tc = window.GameEngine.state.mapEntities.find(e => e.type1 === 'core_village');
        const storehouse = window.GameEngine.state.mapEntities.find(e => e.id === 'core_storehouse');
        if (tc && storehouse) {
            tc.rallyPoint = {
                x: storehouse.x, y: storehouse.y, targetId: storehouse.id, targetType: 'building', name: storehouse.name
            };
        }
    });`);

// Set Filters for logistics lines
c = c.replace('// [系統日誌] [物流] 傳送帶建造完成，共 29 節。', `// [系統日誌] [物流] 傳送帶建造完成，共 29 節。
    await executeLogic(page, () => {
        const storehouse = window.GameEngine.state.mapEntities.find(e => e.id === 'core_storehouse');
        if (storehouse && storehouse.outputTargets.length > 0) {
            storehouse.outputTargets[0].filter = 'food';
        }
    });`);

c = c.replace('// [系統日誌] [物流] 傳送帶建造完成，共 17 節。', `// [系統日誌] [物流] 傳送帶建造完成，共 17 節。
    await executeLogic(page, () => {
        const storehouse = window.GameEngine.state.mapEntities.find(e => e.id === 'core_storehouse');
        if (storehouse && storehouse.outputTargets.length > 1) {
            storehouse.outputTargets[1].filter = 'wood';
        }
    });`);

c = c.replace('// [系統日誌] [物流] 傳送帶建造完成，共 23 節。', `// [系統日誌] [物流] 傳送帶建造完成，共 23 節。
    await executeLogic(page, () => {
        const storehouse = window.GameEngine.state.mapEntities.find(e => e.id === 'core_storehouse');
        if (storehouse && storehouse.outputTargets.length > 2) {
            storehouse.outputTargets[2].filter = 'stone';
        }
    });`);

fs.writeFileSync('tests/LogisticsLinesMerge.spec.js', c);
