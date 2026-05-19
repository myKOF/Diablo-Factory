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
let content = fs.readFileSync(file, 'utf8');

let count = 0;
methods.forEach(method => {
    const regex = new RegExp(`\\bthis\\.${method}\\b`, 'g');
    content = content.replace(regex, () => {
        count++;
        return `conveyorSystem.${method}`;
    });
});

fs.writeFileSync(file, content, 'utf8');
console.log(`Successfully replaced ${count} references to conveyorSystem in ui.js.`);
