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

function scanDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') {
                scanDirectory(fullPath);
            }
        } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.html'))) {
            if (file === 'ConveyorSystem.js') continue;
            const content = fs.readFileSync(fullPath, 'utf8');
            methods.forEach(method => {
                const regex = new RegExp(`(\\bUIManager\\b|\\bwindow\\.UIManager\\b|\\bthis\\b)\\.${method}\\b`, 'g');
                let match;
                while ((match = regex.exec(content)) !== null) {
                    console.log(`FOUND: ${file} - Line ${content.substring(0, match.index).split('\n').length}: call to ${method} via ${match[1]}`);
                }
            });
        }
    }
}

scanDirectory(path.resolve(__dirname, '../src'));
