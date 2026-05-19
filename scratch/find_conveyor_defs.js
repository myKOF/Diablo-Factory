const fs = require('fs');
const path = require('path');

const methods = [
    'cleanupDeletedLinePreviousTurnOverride',
    'orderLogisticsSegmentsByDirection',
    'getLogisticsLineSourceEntity',
    'getLogisticsLineSelectionKey',
    'isSelectedLogisticsLine',
    'deleteLogisticsLineById',
    'deleteLogisticsLineGroupById',
    'getLogisticsLineAt',
    'getLogisticsLinesAt'
];

const file = path.resolve(__dirname, '../src/systems/ConveyorSystem.js');
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

methods.forEach(method => {
    lines.forEach((line, index) => {
        if (line.includes(`${method}(`)) {
            console.log(`FOUND DEFINITION: ConveyorSystem.js - Line ${index + 1}: ${line.trim()}`);
        }
    });
});
