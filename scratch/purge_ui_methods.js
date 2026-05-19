const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../src/ui/ui.js');
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

console.log(`Original line count: ${lines.length}`);

// Block A: 1972 to 2032 (inclusive) -> getLogisticsLineAt & getLogisticsLinesAt
// 0-indexed: index 1971 to 2031
const countA = 2032 - 1972 + 1;
lines.splice(1971, countA);
console.log(`After Block A: ${lines.length}`);

// Block B: 1774 to 1941 (inclusive) -> deleteLogisticsLineById & deleteLogisticsLineGroupById
// 0-indexed: index 1773 to 1940
const countB = 1941 - 1774 + 1;
lines.splice(1773, countB);
console.log(`After Block B: ${lines.length}`);

// Block C: 1499 to 1581 (inclusive) -> cleanupDeletedLinePreviousTurnOverride to isSelectedLogisticsLine
// 0-indexed: index 1498 to 1580
const countC = 1581 - 1499 + 1;
lines.splice(1498, countC);
console.log(`After Block C: ${lines.length}`);

fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log("ui.js purged perfectly!");
