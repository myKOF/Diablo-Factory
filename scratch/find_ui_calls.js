const fs = require('fs');
const path = require('path');

const methods = [
    'buildOrthogonalRoute',
    'getLogisticsTargetBuildingAt',
    'getConnectionRoute',
    'getConnectionTransferRoute',
    'getLogisticsGroupRoutePoints',
    'ensureLogisticsLineStore',
    'snapPointToGridCenter',
    'makeLogisticsLineId',
    'getLogisticsSegmentOccupyKey',
    'getLogisticsSegmentOccupiedKeys',
    'buildGridRoutePoints',
    'buildLogisticsSegments',
    'upsertLogisticsLine',
    'getLogisticsLineRoute',
    'getLogisticsLineById',
    'getLogisticsSegmentsByGroupId',
    'setLogisticsGroupFilter',
    'getLogisticsLineNodePoints',
    'isPointOnLogisticsLine',
    'getLogisticsLineDirectedCells',
    'areLogisticsGroupsTouching',
    'mergeConnectedLogisticsGroups',
    'mergeLogisticsLineGroups',
    'cleanupDeletedLinePreviousTurnOverride',
    'getLogisticsLineSourceEntity',
    'getLogisticsLineSelectionKey',
    'isSelectedLogisticsLine'
];

const file = path.resolve(__dirname, '../src/ui/ui.js');
const content = fs.readFileSync(file, 'utf8');

methods.forEach(method => {
    const regex = new RegExp(`\\bthis\\.${method}\\b`, 'g');
    let match;
    while ((match = regex.exec(content)) !== null) {
        console.log(`FOUND: ui.js - Line ${content.substring(0, match.index).split('\n').length}: this.${method}`);
    }
});
