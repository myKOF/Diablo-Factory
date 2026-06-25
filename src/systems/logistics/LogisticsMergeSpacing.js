/**
 * @module LogisticsMergeSpacing
 *
 * 合流輸入「最大允許前進距離」的共享決策算術。
 *
 * 背景：合流勝者(winner)在進入合流點前，必須與輸出線上既有車輛維持間距，
 * 否則會在合流瞬間重疊或損失相位。此「該等待多少」的判斷原本在
 * LogisticsTransferQueues 與 LogisticsTransferSystem 兩處被逐字複製，
 * 任一處改動而另一處未同步，就會讓回壓佇列 pass 與堆積 pass 互相矛盾——
 * 這正是「物流線合併後物品堵死」反覆復發、修四次仍復發的根因之一。
 *
 * 本模組把「會 drift 成 bug 的決策窗口算術」收斂成單一純函式；
 * 兩個 pass 刻意不同的部分（other 距離來源：原始 progress vs 含 stepDt 投影）
 * 由呼叫端自行計算後，以 distancesFromMerge 陣列注入。
 *
 * 純函式：不讀寫任何 game-engine 狀態，僅做算術，方便單元測試。
 */

/**
 * 計算合流勝者必須讓出的「等待距離」(requiredWait)。
 *
 * @param {{zipperTurn?: string, awaitingMainPass?: boolean}} node 合流節點（僅讀取 zipperTurn / awaitingMainPass）
 * @param {number} spacing 合流間距（= 一格物品長度）
 * @param {number[]} distancesFromMerge 輸出線上每台「合格其他車」相對合流點的有號距離；
 *        >0 表示該車已越過合流點，<0 表示仍在逼近中。呼叫端負責過濾與計算。
 * @returns {number} requiredWait（>0 表示需於 totalLength - requiredWait 處候命）
 */
export function computeMergeInputRequiredWait(node, spacing, distancesFromMerge) {
    let requiredWait = 0;
    if (!Array.isArray(distancesFromMerge)) return requiredWait;
    for (const distFromMerge of distancesFromMerge) {
        const followingMainMayOverlapTurn = node.zipperTurn === 'branch' &&
            node.awaitingMainPass !== true &&
            distFromMerge < -0.01;
        if (Math.abs(distFromMerge) < spacing - 0.1 && !followingMainMayOverlapTurn) {
            // [緊密放行] 勝者隨前車逐步跟進，保持剛好一格間距。
            const followGap = distFromMerge >= 0
                ? Math.max(0, spacing - distFromMerge)
                : spacing;
            requiredWait = Math.max(requiredWait, followGap);
        } else if (node.awaitingMainPass === true && node.zipperTurn !== 'branch' &&
            distFromMerge <= -(spacing + 0.1) && distFromMerge > -spacing * 3) {
            // [防碎片視界] 輪到主線時，三格內有逼近中的來車：於等待線候命，禁止插它前面。
            requiredWait = Math.max(requiredWait, spacing);
        }
    }
    return requiredWait;
}

/**
 * 計算合流輸入車的最大允許前進距離（沿其自身路徑）。
 *
 * @param {number} totalLength 該輸入車自身路徑總長
 * @param {number} spacing 合流間距
 * @param {boolean} isWinner 該車是否為本輪合流勝者
 * @param {{zipperTurn?: string, awaitingMainPass?: boolean}} node 合流節點
 * @param {number[]} distancesFromMerge 見 computeMergeInputRequiredWait
 * @returns {number} 最大允許距離（夾在 [0, totalLength]）
 */
export function computeMergeInputMaxDistance(totalLength, spacing, isWinner, node, distancesFromMerge) {
    // [非勝者等待線] 未取得路權前一律停在合流點前一格，杜絕貼隊推進造成的相位損失與重疊。
    if (!isWinner) {
        return Math.max(0, totalLength - spacing);
    }
    const requiredWait = computeMergeInputRequiredWait(node, spacing, distancesFromMerge);
    if (requiredWait > 0) return Math.max(0, totalLength - requiredWait);
    return totalLength;
}
