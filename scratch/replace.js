const fs = require('fs');
let c = fs.readFileSync('tests/LogisticsLinesMerge.spec.js', 'utf8');
c = c.split("await executeLogic(page, () => window.GameEngine.addToProductionQueue(null, 'RANDOM'));").join(`await executeLogic(page, () => {
    const tc = window.GameEngine.state.mapEntities.find(e => e.type1 === 'core_village');
    window.GameEngine.addToProductionQueue(null, 'RANDOM', tc);
});`);
fs.writeFileSync('tests/LogisticsLinesMerge.spec.js', c);
