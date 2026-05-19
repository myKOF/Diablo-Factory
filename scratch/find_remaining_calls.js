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

const file = path.resolve(__dirname, '../src/ui/ui.js');
const content = fs.readFileSync(file, 'utf8');

methods.forEach(method => {
    const regex = new RegExp(`\\bthis\\.${method}\\b`, 'g');
    let match;
    while ((match = regex.exec(content)) !== null) {
        console.log(`FOUND REMAINING CALL: Line ${content.substring(0, match.index).split('\n').length}: this.${method}`);
    }
});
