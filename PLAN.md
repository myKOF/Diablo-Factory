# 2026-06-09 物流線四格圓角改造計畫

## 核心目標
1. 物流線轉彎處由單格直角改為 2x2 四格範圍的平滑圓角視覺。
2. 保留既有 `routePoints`、occupancy、合流、回壓與群組排序邏輯，僅調整渲染層與在途物品視覺取樣。
3. 物品通過圓角時，同步產生平滑位移與角度旋轉，避免在轉角中心瞬間跳向。

## 2026-06-09 實際畫面未出現圓角修正
1. 根因：實際遊戲中的物流線由多個單段 segment 組成，每段通常只有兩個點；上一版只在單條 `route.points` 內尋找三點轉角，因此畫面中的 group 轉角不會被命中。
2. 修正：單段方塊渲染遇到 group 轉角格時先讓位，再依 `getLogisticsGroupTurnCells` 取得的 incoming/outgoing 方向繪製 group 層級四格圓角。
3. 多線匯流：沿用既有 group turn cell 判定，不重建物流拓樸，不改 MergeNode 與 occupancy。

## 實施步驟
- [x] 步驟 1：在 `LogisticsRenderer` 新增物流線圓角視覺路徑取樣 helper。
- [x] 步驟 2：將物流線底圖與拖曳預覽改為沿圓角取樣點繪製厚線。
- [x] 步驟 3：將 `getPointOnTransferPath` 改為回傳圓角視覺座標與朝向角度，並套用至物品 sprite 旋轉。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。
- [x] 步驟 5：補上 group 層級轉角繪製，修正實際畫面未出現圓角的問題。

# 物流線合流合併修正計畫

## 核心問題分析
1. 當支線合流至主線末端時，由於主線此時沒有離開合流點，無法成功註冊為 `MergeNode`。當主線被延伸時，兩者在空間上相碰且尚未建立 `MergeNode`，這會觸發 `mergeConnectedGroups` 將兩者錯誤地合併為同一個群組（Logistics Group），導致整個物流線的編號和傳輸順序混亂。
2. 為了修復此問題而引入的 `tryRegisterMergeNodeForTouchingGroups` 雖能解決 T 字合流點的合併問題，但卻未對「方向完全一致的順接（直線連接）」進行過濾。這導致直線順接的輸送帶也在中間被錯誤地註冊了 `MergeNode` 且未合併，進而使一整條直線主線被拆碎成多個 Group，物流順序和物品移動方向因此錯亂。

## 解決方案
在 `LogisticsLineMergeCoordinator` 進行 `mergeConnectedGroups` 時，對於相碰且尚未透過 `MergeNode` 連接的兩個群組：
1. 收集兩組所有線段的端點，作為潛在的合流點（接觸點）。
2. 在每個接觸點上，利用 `LogisticsMergeNodeStore` 的 `canRegisterMergeDirection` 檢查是否能註冊為 `MergeNode`。
3. **新增方向一致性檢查**：若進入方向與離開方向完全一致（代表為直線順接而非合流），則**不註冊** `MergeNode`，並回傳 `false` 讓系統將其合併。
4. 若方向不一致（代表為合流或轉角），則調用 `registerLogisticsMergeNode` 建立 `MergeNode`，並不合併這兩個群組（跳過合併）。

## 預期效果
1. 當主線延伸後，系統會自動在接觸點建立 `MergeNode`。
2. 支線和主線不會合併，維持各自獨立的群組與順序編號，符合預期合流行為。
3. 直線順接的輸送帶會如預期合併成同一個 Group，編號和物品移動方向回復正常。

## 三、點選物流線顯示物品完整移動路徑修正
### 1. 核心需求
當選取或點擊任意物流線（不論是主線還是支線）時，除了其自身的黃色數字編號（保持原樣，只標記到合流點），紅色高亮路線必須沿著下游的所有 `MergeNode` 一路延伸到最終的物品移動終點。

### 2. 解決方案
1. **下游遞迴延伸**：在 `LogisticsRenderer.getSelectedGroupDebugRoutePoints` 獲取原始選取群組的點集後，利用當前的 `MergeNode` 連接關係，若路徑終點落在某個 `MergeNode` 的輸入接口上，則透過 `getLogisticsMergeNodeOutputRoute` 取得其在下游群組的物品移動軌跡，並拼接到路徑尾端，遞迴直到無下游連接為止。
2. **高亮白名單擴充**：渲染紅線與紅點的 `drawRoutePointsDebug` 原先只允許在選取群組內的格點繪製。我們修改為使用包含延伸後完整路徑所有格點的 Set（`extendedAllowedCellKeys`），使高亮紅線能穿過合流點一直畫到終點。
3. **黃色數字編號限制**：在 `renderDebugRouteNumberSprites` 中依然限制使用原群組格點白名單，確保編號僅在當前群組內顯示，不會溢出到下游。

### 3. 雙端首尾自適應拼接與延伸
由於前端的 `buildSelectedGroupDebugGraphRoutes` 生成的線段路徑方向可能受鋪設順序或起迄點設定影響，導致紅線在幾何上的 `lastPt` 剛好為起點而非終點，進而無法以單純的 `lastPt` 匹配到 `MergeNode`。
我們修改為同時檢索路徑的 `firstPt`（起點）與 `lastPt`（終點），並在對接下一級物流路徑 `nextRoute` 時進行幾何方向判斷，實現首尾自適應拼接：
- **正向匹配**（終點靠近合流點）：將 `nextRoute` 拼接到尾端。在拼接前，若發現 `nextRoute` 的尾端比起點更靠近 `lastPt`（即路徑方向相反），則將 `nextRoute` 反轉後拼接，以確保在多級合流中拼接後的最末端點仍落在下游，不會使路徑幾何「折返」而截斷後續延伸。
- **反向匹配**（起點靠近合流點）：將 `nextRoute` 拼接到開頭（首端拼接）。在拼接前，若發現 `nextRoute` 的起點離 `firstPt` 較近，說明其下游朝向與當前路徑相反，需將其反轉後拼接到開頭；否則直接拼接，確保在不破壞支線原本數字編號順序下，完整打通反向延伸路徑。

# 2026-06-05 三線合流完整路徑顯示修復計畫

## 核心目標
1. 選取位於三線合流接合點上的 output 物流線時，也要顯示 input 分支到 output 下游的完整物品移動路徑。
2. 保留既有 input 分支選取時向下游延伸的顯示行為。
3. 避免在 renderer 中重建物流拓樸系統，只重用既有 merge-node 與 group route 查詢。

## 實施步驟
- [x] 步驟 1：補上 output group 選取時的完整路徑回歸測試。
- [x] 步驟 2：調整 `LogisticsRenderer.getSelectedGroupDebugRoutePoints`，在 selected group 為 merge output 時補入 input route。
- [x] 步驟 3：執行 debug route 測試、物流方向守門測試、語法檢查與 `npm.cmd run finalize`。

# 2026-06-05 第三合流線路徑 fallback 修復

## 核心目標
1. 當第三條合流線缺少可匹配的 merge-node 延伸資訊時，仍能依照「當前路徑終點貼到另一群組起點」補上紅色完整下游 debug route。
2. 僅允許起點貼合的下游線作為 fallback，避免把反向終點誤接回來。

## 實施步驟
- [x] 步驟 1：新增無 merge-node、但終點接下游起點的回歸測試。
- [x] 步驟 2：在 `getSelectedGroupDebugRoutePoints` 補入幾何下游 fallback。
- [x] 步驟 3：重新執行 debug route 測試與 finalize。

# 2026-06-05 實際運輸路徑中段接合修復

## 核心目標
1. 紅色 debug route 必須能沿用 `conveyorSystem.getLogisticsGroupRoutePoints` 的實際群組路徑。
2. 當接合點位於下游路徑中段時，從該接合點切出後半段，而不是要求接合點必須是下游第一點。

## 實施步驟
- [x] 步驟 1：新增「接到下游 route 中段」回歸測試。
- [x] 步驟 2：調整 renderer fallback，優先讀取系統群組路徑並從 anchor 切片。
- [x] 步驟 3：重新執行 debug route 測試與 finalize。

# 2026-06-05 合流候選方向優先級修復

## 核心目標
1. 同一接合點同時存在直行候選與轉向候選時，選取路徑必須優先接往實際轉向離開的下游。
2. 明確排除反向候選，避免紅線或後續路徑回接到上游造成回堵判讀錯誤。

## 實施步驟
- [x] 步驟 1：新增左側進入 junction 時，必須選擇向下轉向而非向右直行的回歸測試。
- [x] 步驟 2：在 renderer 幾何 fallback 加入方向評分：反向拒絕、轉向優先、同向次之。
- [x] 步驟 3：重新執行 debug route 測試與 finalize。

# 2026-06-05 未連接路徑與回壓回推修復

## 核心目標
1. 未建立 `MergeNode` 前，選取物流線不得只因幾何接近就畫出下游完整路徑。
2. 已建立合流後，Debug route 只能依照實際 `MergeNode` 與物流群組輸出路徑延伸。
3. 物品回壓時只能停住等待，嚴禁將既有 `progress` 寫回較小值造成物品被推回。

## 實施步驟
- [x] 步驟 1：將 Debug route 測試改為驗證「無 MergeNode 不延伸」。
- [x] 步驟 2：移除 renderer 依座標相鄰推測下游的幾何 fallback。
- [x] 步驟 3：修正 `LogisticsTransferQueues` 與 `WorkerSystem` 回壓邏輯，阻塞時不降低物品進度。
- [x] 步驟 4：執行 Debug route、回壓不回推、語法檢查與 `npm.cmd run finalize`。

# 2026-06-05 精確接合完整路徑恢復

## 核心目標
1. 未接合、有空隙的物流線不得顯示下游完整路徑。
2. 已精確貼合在同一接合點的物流線，即使 renderer 沒拿到完整 MergeNode helper route，也必須能從 state logistics lines 補出完整 Debug route。
3. 同一接合點存在多條候選下游時，仍以轉向下游優先，避免選回直行錯線。

## 實施步驟
- [x] 步驟 1：新增精確貼合、空隙未接合、多候選轉向的 Debug route 回歸測試。
- [x] 步驟 2：在 renderer 補回嚴格物理接合 fallback，距離限制為半格內，不再使用寬鬆幾何推測。
- [x] 步驟 3：執行 Debug route、物流回壓、產出間隔、語法檢查與 `npm.cmd run finalize`。

# 2026-06-05 多輸出物流線輪替出貨修復

## 核心目標
1. 同一建築存在多條 `outputTargets` 時，不得永遠從第一條物流線出貨造成後面物流線餓死。
2. 保留每次 dispatch tick 只送出一個物品的節流規則。
3. 成功出貨後記錄下一次起始索引，讓多條輸出線以 round-robin 方式輪流嘗試。

## 實施步驟
- [x] 步驟 1：新增三條輸出線輪替出貨回歸測試，確認舊邏輯只送 `line_a`。
- [x] 步驟 2：調整 `WorkerSystem.processAutomatedLogistics`，以 `nextLogisticsOutputTargetIndex` 輪替輸出目標。
- [x] 步驟 3：執行產出間隔、Debug route、回壓、方向守門、語法檢查與 `npm.cmd run finalize`。

# 2026-06-05 合流入口重疊防護修復

## 核心目標
1. 合流輸出線起點已有物品時，輸入線到達合流點的物品不得切入 output group 造成重疊。
2. 多條輸入線同一幀到達同一合流點時，每幀最多只允許一個物品切入 output group。
3. 被擋住的輸入物品停在 input 末端並標記 `queueBlocked`，不得被往回推。

## 實施步驟
- [x] 步驟 1：新增 output 起點被佔用與同幀多 input 的合流不重疊回歸測試。
- [x] 步驟 2：在 `LogisticsMergeNodeRuntime` 切換 lineId 前檢查 output 入口一格內是否已有物品。
- [x] 步驟 3：執行合流不重疊、回壓、完整路徑、產出輪替、方向守門、語法檢查與 `npm.cmd run finalize`。

# 2026-06-05 物品視覺安全間距修復

## 核心目標
1. 物品渲染尺寸為整格時，邏輯間距不得只等於 1 格，避免箱子描邊與標號視覺重疊。
2. 合流入口、批次回壓與 WorkerSystem 舊回壓段必須使用一致安全距離。
3. 既有重疊不得透過往回推修正，只能阻止後續移動與合流切入，等待前方拉開距離。

## 實施步驟
- [x] 步驟 1：加嚴合流不重疊測試，要求 output 前車距離 24px 時仍等待。
- [x] 步驟 2：將合流入口與回壓最小距離統一提高到 `1.25 * TILE_SIZE`。
- [x] 步驟 3：執行合流不重疊、回壓不回推、完整路徑、出貨輪替、方向守門、語法檢查與 `npm.cmd run finalize`。

# 2026-06-05 距離佔位與刪線斷點修復

## 核心目標
1. 回壓排列恢復 1 格緊貼佔位，不使用物理碰撞或額外間距，避免堵塞隊列中間出現空格。
2. 刪除物流線中段後，前段無目標物品必須停在 suppressed endpoint 的前一格，不得停進被刪除的格子。
3. 一般前車回壓仍遵守「不能往回推」，只有拓撲刪線硬邊界可將物品修正到最後合法格。

## 實施步驟
- [x] 步驟 1：新增 suppressed endpoint 斷點前一格停靠回歸測試。
- [x] 步驟 2：將合流與回壓間距恢復為 `TILE_SIZE`，並在 `LogisticsTransferQueues` / `WorkerSystem` 讀取 suppressed endpoint 作為硬斷點。
- [x] 步驟 3：執行刪線斷點、回壓、合流、完整路徑、出貨輪替、方向守門、語法檢查與 `npm.cmd run finalize`。

# 2026-06-05 合流輸入起點誤阻塞修復

## 核心目標
1. 合流 input 線上的物品還沒接近合流點前，不得因其他 input 分支有物品而被鎖在起點。
2. 合流入口佔位仍由 `LogisticsMergeNodeRuntime` 在物品抵達 merge node 時判定。
3. 保留每條線自身的距離佔位與回壓檢查，避免 O(n²) 物理碰撞。

## 實施步驟
- [x] 步驟 1：新增兩條合流 input 起點物品不應互相阻塞的回歸測試。
- [x] 步驟 2：移除 `WorkerSystem` 與 `LogisticsTransferQueues` 中遠離合流點也會跨 input 預阻塞的邏輯。
- [x] 步驟 3：執行回壓、合流、完整路徑、出貨輪替、方向守門、語法檢查與 `npm.cmd run finalize`。

# 2026-06-05 跨物流線合流回壓 Stacking 與重疊修復

## 核心目標
1. 解決不同物流線的在途物品（activeTransfers）在合流點/轉折點因為 lineId 不同而被分到不同 Stacking 分組，導致輸入線末端物品與輸出線前端物品重疊的問題。
2. 實現「跨 Merge Node 的 Stacking 傳遞」：若輸入線的最前端物品（j === 0）其終點接往合流點，則將輸出線最靠近起點的物品作為其 frontItem 來計算 spacing 限制。
3. 修正 WorkerSystem 更新中，當物品 progress 超過 maxAllowedProgress 時未將 progress 截斷為 maxAllowedProgress，導致回壓時無法退回或卡在重疊位置的問題。

## 實施步驟
- [ ] 步驟 1：新增跨 Merge Node 合流回壓不重疊與 Stacking 限制的回歸測試。
- [ ] 步驟 2：修改 `WorkerSystem.processAutomatedLogistics`，在計算 `maxDist` 時，若 `j === 0` 且 `isMergeInput` 為真，檢索輸出線 `outputGroupId` 上最前端的物品，並將其當作 frontItem 來計算 `maxDist` 限制。
- [ ] 步驟 3：在 `processAutomatedLogistics` 的更新循環中，當 `t.progress > maxAllowed` 時，強制將 `t.progress` 截斷為 `maxAllowed`。
- [ ] 步驟 4：執行單元測試、物流回壓測試、方向守門、語法檢查與 `npm run finalize`。

# 2026-06-05 整合 Playwright 自動化自測框架

## 核心目標
1. 在專案中安裝 `playwright` 套件作為開發端與 Agent 的自測工具。
2. 建立一個 Playwright 自動化測試腳本（例如 `tests/logistics_e2e.spec.js` 或是 `scratch/verify_playwright.js`），模擬啟動遊戲網頁，並驗證遊戲引擎主循環是否能無錯誤運行。
3. 嚴格遵守「無痕測試與自動清理協議」：測試腳本中的變數宣告在最外層，`finally` 區塊中執行 `browser.close()`，並將所有截圖和日誌輸出到 `tmp/`。

## 實施步驟
- [ ] 步驟 1：安裝 `playwright` 與 `@playwright/test` 依賴。
- [ ] 步驟 2：撰寫 Playwright 整合測試腳本，能在 Headless 模式下開啟本地伺服器、加載遊戲、驗證遊戲引擎初始化成功，並保存首頁截圖至 `tmp/`。
- [ ] 步驟 3：確保 `finally` 區塊具有雙重清理邏輯，清空殘留檔案與正確關閉瀏覽器。
- [ ] 步驟 4：執行 Playwright 測試與 `npm run finalize`。

# 2026-06-05 雙通道碰撞回壓隊列（LogisticsTransferQueues）合流重疊修復

## 核心目標
1. 解決 `LogisticsTransferQueues.js` 與 `WorkerSystem.js` 兩者在 Stacking 計算時沒有同步，導致 `applyBlockedQueues` 重寫並忽略跨 Merge Node 合流限制的問題。
2. 在 `LogisticsTransferQueues.applyBlockedQueues` 中，若當前物品是本線路最前車（`occupiedProgress === Infinity`）且為合流輸入線，限制其 `maxAllowed` 不得衝入已被佔用的輸出線起點。

## 實施步驟
- [ ] 步驟 1：修改 `src/systems/logistics/LogisticsTransferQueues.js`，在遍歷 `transfers` 時，若 `occupiedProgress === Infinity` 且 `isMergeInput` 為真，檢索輸出線最前端的物品，並以此限制當前物品 the `maxAllowed`。
- [ ] 步驟 2：執行 `scratch/test_logistics_merge_stacking.js` 單元測試，確保 Mock 測試依然通過。
- [ ] 步驟 3：使用 Playwright 啟動網頁並觀察物品流動，確認 T 字與拐角合流點不再發生重疊。
- [ ] 步驟 4：執行 `npm run finalize` 完成任務。

# 2026-06-05 合流點實際距離檢測與回壓重疊修復

## 核心問題分析
1. `WorkerSystem.js`、`LogisticsTransferQueues.js` 在計算合流輸入線物品的最大允許進度（`maxAllowedProgress` / `maxAllowed`）時，以及 `LogisticsMergeNodeRuntime.js` 在判定輸出線入口是否被佔用（`isOutputEntryOccupied`）時，都錯誤地將輸出線物品距離「其自身路徑起點」的累積長度 `frontDist` / `distance` 直接與 `spacing` / `minTransferSpacing` 做比較。
2. 這在合流點位於輸出線中段（起點以外的位置）時會造成嚴重錯誤：系統會誤判輸出線上靠近合流點的物品已移開很遠（因為其離輸出線起點很遠），進而允許輸入線的物品提早前進或切入，最終導致物品在合流點完全重疊。
3. 此外，目前的 `isMergeInput` 只拿了 `otherTransfers[0]` 來比對，未考慮輸出線上可能有多個物品（有些在合流點前，有些在合流點後），必須對輸出線上的所有物品計算與合流點的相對距離，並取其最大限制以防重疊。

## 解決方案
1. 在 `WorkerSystem.js` 與 `LogisticsMergeNodeRuntime.js` 中實裝不帶外部依賴的 `getPathDistanceToPoint` 純函式，藉此精確計算輸出線物品到合流點的相對距離：
   `distFromMergeNode = otherDist - mergeNodeDistInOther`
2. 統一計算公式：如果物品與合流點在同一條輸出線上，則該物品對合流點的干涉距離為其與合流點的相對距離的絕對值：
   `needed = Math.max(0, spacing - Math.abs(distFromMergeNode))`
   對輸出線上所有物品取最大值，作為當前合流輸入物品的所需避讓間距。
3. 修正 `LogisticsMergeNodeRuntime.isOutputEntryOccupied`，同樣使用此公式判定合流點前後一格內是否已有物品佔用。

## 實施步驟
- [ ] 步驟 1：修改 `src/systems/logistics/LogisticsMergeNodeRuntime.js` 中的 `isOutputEntryOccupied` 判定，使其基於合流點的相對距離絕對值。
- [ ] 步驟 2：修改 `src/systems/WorkerSystem.js`，導入相對距離干涉避讓與 Stacking 限制。
- [ ] 步驟 3：修改 `src/systems/logistics/LogisticsTransferQueues.js`，同樣導入相對距離干涉避讓與 Stacking 限制。
- [ ] 步驟 4：執行 `node scratch/debug_run.js` 與 `npm run test:e2e` 自測驗證。
- [ ] 步驟 5：執行 `npm run finalize` 收尾。

# 2026-06-05 物流線中段合流物理切分與避讓 Stacking 修正

## 核心問題分析
1. 當支線合流至主線中段時，主線在此處可能只是單一的 segment (一筆劃繪製的輸送帶)。這會導致在 `registerLogisticsMergeNode` 中呼叫 `ordered.find(seg => canLineEnterMergePoint(seg, snapped))` 時無法找到 `splitSegment`（因為合流點 0 位於該 segment 的中段而非端點），進而使得主線完全沒有被物理切分。
2. 因為主線上游與下游未被物理切分，它們仍屬於同一個 Group ID。當回壓隊列計算避讓時，會將上游物品誤判為下游，最終導致物品卡在路上無法移動。
3. 同時，合流點回壓Staking時需要引入「只停不退」與「帶符號相對距離避讓」公式，避免往後推擠。

## 解決方案
1. **中段 Segment 物理切分**：在 `registerLogisticsMergeNode` 中，檢查 snapped 合流點是否穿過 `outputGroupId` 的某個線段的中段。若是，則將該線段在合流點處物理拆分為前半段與後半段，將後半段作為新線段加入 `state.logisticsLines`。這樣就能使 `splitSegment` 被成功找到，進而讓後半段被切分到新的 `newGroupId` (下游)。
2. **無推回 Stacking 與多分支避讓**：
   - 物品 progress 超過 `maxAllowed` 時不進行 progress 強行截斷（只停不退），僅標記 `queueBlocked = true`。
   - 使用帶符號的相對距離公式 `distFromMerge = otherDist - mergeNodeDistInOther` 來計算避讓間距：`needed = Math.max(0, spacing - distFromMerge)`，實現精確的排隊累加與多路分支避讓。

## 實施步驟
- [ ] 步驟 1：修改 `src/systems/logistics/LogisticsMergeNodeStore.js`，實裝穿過合流點的 Segment 物理拆分邏輯。
- [ ] 步驟 2：修改 `src/systems/WorkerSystem.js`，實裝帶符號的相對距離避讓間距計算與「只停不退」 progress 阻塞。
- [ ] 步驟 3：修改 `src/systems/logistics/LogisticsTransferQueues.js`，實裝一致的相對距離避讓與 progress 阻塞，確保 Stacking 限制同步。
- [ ] 步驟 4：修改 `src/systems/logistics/LogisticsMergeNodeRuntime.js` 中的 `isOutputEntryOccupied`。
- [ ] 步驟 5：執行單元測試 `scratch/test_logistics_merge_stacking.js` 與 E2E 自測驗證。
- [ ] 步驟 6：執行 `npm.cmd run finalize`。

# 2026-06-05 合流避讓同分支篩選修正

## 核心問題分析
1. `WorkerSystem.js` 與 `LogisticsTransferQueues.js` 在計算合流輸入線物品的最大允許進度（`maxAllowedProgress` / `maxAllowed`）時，會為合流輸入分支（`isMergeInput` 為真）的「最前車」計算與「輸出線及其他輸入分支」所有在途物品的避讓間距。
2. 然而，在過濾其他在途物品時，程式碼直接使用 `o.lineId === outputGroupId || (Array.isArray(node.inputGroupIds) && node.inputGroupIds.includes(o.lineId))`。
3. 這會把「目前這條輸入分支上的其他後方物品」（`o.lineId === t.lineId`，且 `progress` 較小，離合流點很遠）也一併算進避讓名單中。
4. 由於後方物品的 `progress` 較小，算出來的 `distFromMerge = otherDist - otherLength` 會是極大的負數。這會導致避讓公式 `spacing - distFromMerge` 計算出一個極大的正數，進而使 `maxAllowedProgress`（或 `maxDist`）被限制為 `0`，導致前車剛出生就無法前進、整條物流線卡死。

## 解決方案
在 `WorkerSystem.js` 與 `LogisticsTransferQueues.js` 中過濾 `otherTransfers` 時，明確排除與當前處理物品相同輸入分支的物品，即加上 `o.lineId !== t.lineId`（或 `o.lineId !== transfer.lineId`）的篩選條件。
過濾條件調整為：
`o.lineId === outputGroupId || (o.lineId !== t.lineId && Array.isArray(node.inputGroupIds) && node.inputGroupIds.includes(o.lineId))`

## 實施步驟
- [x] 步驟 1：修改 `src/systems/WorkerSystem.js` 中的 `otherTransfers` 過濾條件，排除同一個 `lineId` 的其他車輛。
- [x] 步驟 2：修改 `src/systems/logistics/LogisticsTransferQueues.js` 中的 `otherTransfers` 過濾條件，排除同一個 `lineId` 的其他車輛。
- [ ] 步驟 3：執行 `npm run test:e2e` 或自測腳本，觀察物品流動，確認起點物品不再卡死。
- [ ] 步驟 4：執行 `npm run finalize` 收尾。

# 2026-06-05 物流物品邏輯佔位防重疊修正

## 核心目標
1. 不導入物理碰撞系統，改用既有物流更新流程中的距離佔位與合流點回壓檢查。
2. 合流 output 入口一格內已有物品時，input 物品不得移入該合流 cell，必須停在自身路徑終點前一格。
3. WorkerSystem 的移動前限制與 LogisticsTransferQueues 的移動後整理必須使用同一套合流點相對距離公式，避免其中一方覆蓋 `queueBlocked` 狀態。
4. 既有物品若已經超過允許距離，只能停住並標記阻塞，不強制倒退修正。

## 實施步驟
- [x] 步驟 1：新增/執行合流不重疊與跨 Merge Node Stacking 回歸測試。
- [x] 步驟 2：修正 `LogisticsMergeNodeRuntime`，output 入口被佔用時將 input 停在合流點前一格。
- [x] 步驟 3：修正 `WorkerSystem`，在移動前依 output 線相對合流點距離限制 input 的 `maxAllowedProgress`。
- [x] 步驟 4：修正 `LogisticsTransferQueues`，同步套用相同合流 output cell 佔位公式並保留只停不退。
- [x] 步驟 5：執行 Playwright e2e 與 `npm.cmd run finalize`。

# 2026-06-05 回壓隊列空隔移除修正

## 核心目標
1. 移除回壓時「前方一堵住，後方全部跟著停住」的傳遞式阻塞。
2. 後方物品只在即將進入前車佔用距離時停止；若前方仍有空間，必須繼續移動補上空隔。
3. 保留只停不退規則：已經超過允許距離的物品不強制倒退，只標記阻塞。

## 實施步驟
- [x] 步驟 1：新增後車有空間時必須繼續前進的回歸測試。
- [x] 步驟 2：移除 `LogisticsTransferQueues` 的 `queueBlockedBehind` 傳遞式阻塞。
- [x] 步驟 3：執行物流回歸測試、Playwright e2e 與 `npm.cmd run finalize`。

# 2026-06-05 合流點入場隨機仲裁修正

## 核心目標
1. 同一合流點 output cell 空出時，多條 input 線不得同幀同時移入該空格。
2. 對已到達合流點前一格的多條 input 線建立隨機 winner；同一批 contenders 在同一幀使用相同 winner。
3. `WorkerSystem`、`LogisticsTransferQueues`、`LogisticsMergeNodeRuntime` 共用 `state._logisticsMergeAdmissionWinners`，避免三層判定抽到不同物品。
4. output 線合流點前後一格內有物品時，input 仍必須等待，不得重疊。

## 實施步驟
- [x] 步驟 1：新增雙 input 同時搶同一合流點空格時只能放行一個的回歸測試。
- [x] 步驟 2：在 WorkerSystem 移動前限制加入合流點 admission winner。
- [x] 步驟 3：在 LogisticsTransferQueues 後處理加入相同 admission winner。
- [x] 步驟 4：在 LogisticsMergeNodeRuntime 實際切換 output group 前加入相同 admission winner。
- [x] 步驟 5：執行物流回歸、Playwright e2e 與 `npm.cmd run finalize`。

# 2026-06-09 物流物品長條體路徑佔位修正

## 核心目標
1. 將傳送帶在途物品視為佔據 `ITEM_LENGTH = TILE_SIZE` 的路徑長條體，而不是單一座標點。
2. 回壓與排隊邏輯一律沿 `routePoints` 的累積路徑長度計算，轉角不得被視為獨立容器。
3. 渲染層在轉角段落加入外側位移補償，降低滿載轉彎時的視覺內側重疊感。

## 實施步驟
- [x] 步驟 1：定位 `applyBlockedTransferQueues`、路徑長度 helper 與物流物品渲染流程。
- [x] 步驟 2：調整阻塞隊列，使相鄰物品沿路徑長度嚴格維持 `ITEM_LENGTH` 差值，並加入 5% 遲滯死區與微位移保持。
- [x] 步驟 3：確保轉角位置計算與渲染補償使用同一條連續 route path，不新增第二套容器邏輯。
- [x] 步驟 4：執行相關物流測試、語法檢查與 `npm run finalize`。

# 2026-06-09 多路合流 Weighted Scheduler 修復

## 核心目標
1. 將多條物流線同時競爭同一合流點的即時爭搶邏輯改為合流節點狀態機排程。
2. 每個合流節點保存 `currentActiveSlot` 與輸入槽位順序，確保同一幀最多放行一條輸入線。
3. 在任何 `transfer.progress` 推進至合流入口前，必須先通過合流格點佔用與入場預約檢查。
4. 主線輸入優先維持供料；主線為空或被嚴重回堵時，才輪詢副輸入線，避免主線飢餓。

## 實施步驟
- [x] 步驟 1：定位既有 `LogisticsMergeNodeRuntime`、admission winner 與回壓測試資料流。
- [x] 步驟 2：新增三輸入同時到達合流點時，每輪只允許一條線入場且三線皆有機會入場的回歸測試。
- [x] 步驟 3：在合流 runtime 實作節點級 `currentActiveSlot`、主線優先與副線 round-robin 排程。
- [x] 步驟 4：將 WorkerSystem、LogisticsTransferQueues 與 MergeNodeRuntime 的入場判定改為共用排程結果，避免同幀多層判定不一致。
- [x] 步驟 5：執行物流回歸、Playwright 驗證與 `npm run finalize`。

# 2026-06-09 右鍵取消物流線建造虛影殘留卡住修復

## 核心目標
1. 解決當地圖上無任何已建造之靜態物流線時，右鍵取消物流線建造，綠色虛影依然卡在畫面上的 Bug。
2. 確保在沒有靜態物流線與傳輸粒子的情況下，只要物流線建造預覽曾被繪製過（`_logisticsPreviewLayerWasDrawn` 為 `true`），就必須強制執行 clear() 清除。

## 實施步驟
- [ ] 步驟 1：定位 `src/scenes/MainScene.js` 裡的 `updateLogisticsLayer`。
- [ ] 步驟 2：解耦靜態層與預覽層、傳輸層的 clear() 邏輯，當前置狀態為空時，只要 `_logisticsPreviewLayerWasDrawn` 或是 `_logisticsTransferLayerWasDrawn` 為 `true`，就獨立對其對應的 Graphics 進行 `clear()` 並將 flag 設為 `false`。
- [ ] 步驟 3：手動測試與執行 `npm run finalize` 完成收尾。

# 2026-06-09 物流線轉角視覺一致化修正

## 核心目標
1. 只調整物流線轉角的表現層繪製，不修改 ConveyorRouter、ConveyorSystem、物流群組、佔格、回壓或路徑資料結構。
2. 轉角外框必須與直線物流線同寬、同描邊、同底色，避免轉角看起來像破碎貼圖。
3. 轉角箭頭必須沿用既有直線物流線箭頭的顏色、透明度與尺寸語彙，只修正方向與排布，使轉角處不再出現突兀的錯誤箭頭。
4. 繪製參數必須集中在物流渲染 helper 中，避免在邏輯系統新增硬編碼或第二套自動鋪磚規則。

## 實施步驟
- [x] 步驟 1：使用 `tools/safe_search.cjs` 定位物流線轉角繪製與相關樣式來源。
- [x] 步驟 2：局部修改轉角繪製函式，讓轉角直接復用既有直線物流線的顏色、透明度、外框與箭頭樣式常數。
- [x] 步驟 3：檢查語法與未引用變數，避免新增除錯 log。
- [x] 步驟 4：執行 `npm run finalize` 完成收尾並回報渲染耗時與 Draw Calls。

# 2026-06-10 物流線圓角一致性回復修正

## 核心目標
1. 修復上一輪為了統一透明度而讓轉角退回直角格子的問題。
2. 保留既有圓角轉彎視覺，但直線段與轉角段必須使用同一套顏色、透明度與線寬繪製。
3. 避免轉角 cell 被先填矩形、再疊加圓角曲線造成透明度加深或像獨立拼接片。
4. 只修改 `LogisticsRenderer` 表現層，不改物流路徑、佔格、合流與回壓邏輯。

## 實施步驟
- [x] 步驟 1：確認上一輪移除圓角呼叫是直角化根因。
- [x] 步驟 2：將物流線底層改為以同一條 rounded thick stroke 繪製，不讓轉角額外疊色。
- [x] 步驟 3：保留箭頭與選取框既有行為，只修正底層線體外觀。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 物流線轉角樣式精準對齊修正

## 核心目標
1. 轉角風格必須與原本物流線一致：同色、同透明度、無額外框線。
2. 轉角箭頭必須使用 45 度對角方向，呈現進彎與出彎的合成方向。
3. 轉角底色只允許繪製一次，避免透明度疊加造成轉角比直線更深。
4. 僅修改 `LogisticsRenderer` 表現層，不改路由、佔格、合流與物流資料。

## 實施步驟
- [x] 步驟 1：確認目前轉角箭頭方向被改成出彎方向。
- [x] 步驟 2：恢復轉角箭頭的 45 度方向向量。
- [x] 步驟 3：檢查轉角繪製流程，確保不新增外框與重複疊色。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 物流線轉角繪製層級修正

## 核心目標
1. 消除圓角曲線後畫在直線段上造成的深色邊界，轉角不得看起來有框線。
2. 圓角背景必須先畫，直線物流線底色再覆蓋銜接處，避免透明度重疊。
3. 箭頭必須最後繪製，確保顯示在物流線背景上層。
4. 僅調整 `LogisticsRenderer` 的繪製順序，不改物流路徑、佔格、合流與回壓邏輯。

## 實施步驟
- [x] 步驟 1：確認框線來自圓角後畫與直線重疊區。
- [x] 步驟 2：將單段圓角背景移到直線矩形底色之前繪製。
- [x] 步驟 3：將 group 圓角背景移到 segment route 繪製之前，讓箭頭維持最後層級。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 物流線單片式轉角貼片修正

## 核心目標
1. 轉角不再由多段矩形與厚線重疊拼接，改成每個轉角只繪製一個完整圓角面片。
2. 圓角面片使用與物流線相同的顏色與透明度，不描邊、不額外加深。
3. 箭頭仍維持最後繪製，確保在轉角背景上層。
4. 僅修改 `LogisticsRenderer` 表現層，不改路由、佔格、合流與回壓邏輯。

## 實施步驟
- [x] 步驟 1：將圓角 thick stroke 改為填色 ribbon 面片。
- [x] 步驟 2：單段與 group 轉角共用同一個單片式繪製 helper。
- [x] 步驟 3：檢查箭頭仍在背景上層。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 物流線轉角單一箭頭修正

## 核心目標
1. 每個物流線轉角只顯示一個 45 度轉角箭頭。
2. 普通水平或垂直段箭頭必須跳過轉角 cell，避免與轉角箭頭重疊。
3. 轉角箭頭最後繪製，確保在背景上層。
4. 僅調整 `LogisticsRenderer` 箭頭繪製分流，不改物流路徑、佔格、合流與回壓邏輯。

## 實施步驟
- [x] 步驟 1：確認普通箭頭未跳過 group 轉角格是重疊根因。
- [x] 步驟 2：建立一般箭頭 skip set，包含所有 group turn cell。
- [x] 步驟 3：在 segment 背景與普通箭頭後，單獨繪製 group 45 度轉角箭頭。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 物流線箭頭全域縮放試調

## 核心目標
1. 將所有物流線箭頭等比縮小 30%，先觀察整體視覺是否更貼合軌道。
2. 直線箭頭、轉角箭頭與連接箭頭必須共用同一縮放比例，避免各處尺寸不一致。
3. 縮放比例寫入 `UI_CONFIG.LogisticsSystem`，避免在渲染器中散落硬編碼。

## 實施步驟
- [x] 步驟 1：確認所有物流箭頭集中經過 `LogisticsRenderer.drawArrowhead()`。
- [x] 步驟 2：在 `ui_config.js` 新增全域箭頭縮放比例 `arrowGlobalScale: 0.7`。
- [x] 步驟 3：在 `drawArrowhead()` 套用全域比例。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 物流線轉角箭頭內移微調

## 核心目標
1. 只調整轉角專用 45 度箭頭的位置，不改普通直線箭頭。
2. 轉角箭頭依 `outDir - inDir` 方向內移，使右轉下彎案例向左下約 6px。
3. 偏移量寫入 `UI_CONFIG.LogisticsSystem`，方便後續微調。

## 實施步驟
- [x] 步驟 1：新增轉角箭頭內移像素設定。
- [x] 步驟 2：在 `drawLogisticsGroupTurnArrows()` 套用方向化偏移。
- [x] 步驟 3：執行語法檢查與 `npm run finalize`。
