# 2026-06-25 物流線連續延伸建造流程改造計畫

## 核心目標
1. 物流線完成一次建造後，不退出延伸流程，而是自動以剛建好物流線末端作為新起點建立虛影。
2. 新虛影不需要持續按住左鍵，會跟隨滑標移動；玩家在場景任意處再次左鍵點擊即可提交下一段延伸。
3. 保留既有 Router footprint、ConveyorSystem group merge/split、turnArrowOverride 與 submit/preview 一致性，不新增第二套碰撞或路由規則。

## 實施步驟
- [x] 步驟 1：使用 `tools/safe_search.cjs` 定位 `startDrag`、`updateDrag`、`submitDrag` 與滑標事件分流。
- [x] 步驟 2：局部擴充 ConveyorSystem 的建造狀態，讓提交後可從上一段末端自動啟動免按壓延伸虛影。
- [x] 步驟 3：確保左鍵點擊提交、右鍵/取消仍可清除虛影，且 preview 與 submit 共用既有路由驗證。
- [x] 步驟 4：執行語法/收尾檢查與 `npm run finalize`，回報 Debug 渲染耗時與 Draw Calls。

# 2026-06-25 同建築第二端口接入後終點延遲堵死補修計畫

## 核心目標
1. 重現同一建築第一條物流線已接通運輸時，第二個端口再拉線接入主線後，終點端口約數秒後堵死的情境。
2. 追蹤同源多 `outputTargets` 經合流切分後的派貨路徑、合流 winner 與終點交付狀態，找出延遲堵死根因。
3. 局部修正物流 runtime / merge node / transfer queue，不改 Router footprint 與渲染層職責。

## 實施步驟
- [x] 步驟 1：新增同建築雙端口接入主線的紅燈回歸測試。
- [x] 步驟 2：以測試資料定位同源多輸出合流後堵死的根因。
- [x] 步驟 3：局部修正並保持既有物流合流回歸通過。
- [x] 步驟 4：執行相關 Playwright 回歸與 `npm run finalize`。

# 2026-06-25 第二條物流線接入後終點端口堵死修復計畫

## 核心目標
1. 修正第一條物流線已接通並正常運輸時，接入第二條線後，主線在終點端口前直接堵死的問題。
2. 確認合流/接入造成的 topology 重算不會破壞原本 target port handoff、output route 或終點消費判定。
3. 僅局部修正物流 runtime / merge node / transfer handoff 根因，保留既有 Router footprint、群組與渲染職責分離。

## 實施步驟
- [x] 步驟 1：使用 `tools/safe_search.cjs` 盤點終點端口 handoff、merge node runtime、transfer queue 與接通狀態重算流程。
- [x] 步驟 2：新增紅燈回歸測試，重現「已接通主線運輸中，第二條線接入後終點端口不應堵死」。
- [x] 步驟 3：局部修正堵塞根因，確保接入第二條線後主線物品仍能交付到終點端口。
- [x] 步驟 4：執行相關回歸與 `npm run finalize`，回報 Debug 渲染耗時與 Draw Calls。

## 延遲堵死補查
- [x] 步驟 5：針對「接入後 5~10 秒才堵死」新增雙來源持續派貨回歸，觀察 merge scheduler 是否在數輪後卡住。
- [x] 步驟 6：修正合流排程/終點回壓的延遲死鎖根因。
- [x] 步驟 7：重跑物流回歸與 `npm run finalize`。
- [x] 步驟 8：補查支線物品切入多段 output group 後 `targetId` 被第一段空 metadata 清掉的延遲堵塞根因，並修正終點 metadata 繼承。
- [x] 步驟 9：補查不同 `lineId` 但同一物理路徑的物品未共用 stacking 分組，導致接入線物品穿越主線堵塞物品的重疊根因，並改以共享 route signature 合併排隊分組。

# 2026-06-23 物流匯點堵死與產品選擇界面修復計畫

## 核心目標
1. 修正多條物流線視覺顯示接通，但黃色物品所在路線在匯點前堵死、實際 runtime 未接通的問題。
2. 修正中間物流線產品選擇界面消失，導致無法設定/顯示產品 filter 的問題。
3. 區分「顯示接通」與「運輸接通」，避免只靠 physical component 顏色掩蓋缺少 merge node / output route 的實際物流問題。

## 實施步驟
- [x] 步驟 1：使用 `tools/safe_search.cjs` 盤點產品選擇 UI、filter 來源、merge runtime 與 transfer handoff。
- [x] 步驟 2：新增紅燈回歸測試，覆蓋同一 physical component 但未註冊 merge node 時不可標示為實際接通，以及 merge component source port/filter UI 查詢。
- [x] 步驟 3：局部修正拓樸接通判定與產品選擇查詢來源，確保視覺接通與 runtime merge node 一致。
- [x] 步驟 4：執行物流回歸、端口回歸與 `npm run finalize`。

# 2026-06-23 物流線接通顯示與端口覆蓋補修計畫

## 核心目標
1. 修正實際渲染畫面中，第三條物流線接入既有網路後仍維持灰色未接通的問題。
2. 修正物流線從端口拉出後，未選中建築的橘色端口被全域顯示的問題。
3. 修正合併/匯合後 source port 連線查詢找不到原 `outputTargets`，導致綠色輸出端口未重畫、看起來消失的問題。

## 實施步驟
- [x] 步驟 1：使用 `tools/safe_search.cjs` 盤點端口渲染、source port 查詢與接通 overlay 分支。
- [x] 步驟 2：新增紅燈回歸測試，覆蓋未選中建築橘色端口不可顯示與 merge component source port 查詢。
- [x] 步驟 3：局部修正 `renderSourcePortCells` / `LogisticsSourcePortQuery`，避免全域橘色端口污染並保留綠色連接端口。
- [x] 步驟 4：執行 Playwright 回歸與 `npm run finalize`。

# 2026-06-23 物流線三向合併接通狀態修復計畫

## 核心目標
1. 修正兩條已接通物流線匯合後，再由第三條物流線合併到同一匯合點時，第三條線未被標示為接通的問題。
2. 修正第三條物流線合併到主線任意非匯合點後，整個物流網路被誤判為未接通的問題。
3. 保留既有群組合併、匯合點、回壓與渲染職責分離，只修正接通狀態重算與拓樸判定根因。

## 實施步驟
- [x] 步驟 1：使用 `tools/safe_search.cjs` 盤點物流線接通狀態、群組合併與 merge node 重算流程。
- [x] 步驟 2：新增紅燈回歸測試，覆蓋第三條線接到既有匯合點與接到主線中段兩種情境。
- [x] 步驟 3：局部修正接通狀態重算，確保相連網路內所有可達端口的線段同步更新接通狀態。
- [x] 步驟 4：執行相關測試與 `npm run finalize`，回報 Debug 渲染耗時與 Draw Calls。

# 2026-06-18 物流線端口格建造改造計畫

## 核心目標
1. 選取建築後，在該建築所有物流接口顯示 1x1 綠色端口格，沿用既有物流端口格視覺樣式。
2. 只有在端口格內按下左鍵並拖曳，才允許從建築拉出物流線虛影；建築本體其它位置不再自動吸附到最近端口。
3. 外部物流線連到建築時，游標必須落在端口格內才建立 targetPort 與建築連接；只停在前一格或建築非端口區域都不得視為已連接。
4. 點擊物流線建造按鈕進入建造狀態時，顯示畫面中所有可物流輸入/輸出的建築端口格，並套用同一套端口命中規則。

## 實施步驟
- [x] 步驟 1：新增 Playwright 紅燈測試，覆蓋建築端口起拖限制與 targetPort 精準命中限制。
- [x] 步驟 2：在 `UIManager` 補上端口格矩形與命中 helper，統一來源與目標端口判定。
- [x] 步驟 3：修改 `handleWorldMouseDown` 與物流建造模式起拖邏輯，只允許端口格啟動建築物流拖曳。
- [x] 步驟 4：修改 `LogisticsDragSession.resolveDragTarget` 與 `LogisticsDragSubmission.submitDrag`，移除非端口落點的最近端口 fallback。
- [x] 步驟 5：在選取高亮/物流建造狀態渲染端口格，並讀取 `UI_CONFIG.LogisticsSystem` 既有樣式參數。
- [x] 步驟 6：執行窄範圍 Playwright 測試與 `npm run finalize`，回報 Debug 渲染耗時與 Draw Calls。

# 2026-06-18 建築出貨計時器因起點佔用誤清零造成出貨空隙 Bug 修復計畫

## 核心目標
1. 解決倉庫/工廠等建築在出貨時，如果因起點被佔用（`canStartTransfer` 返回 `false`）導致出貨失敗，其出貨計時器 `logisticsTimer` 卻已被錯誤清零的 Bug。這會迫使該建築白白浪費一整個出貨週期，導致在途物品之間產生不規則的大幅空隙（如每出貨三個空出一格）。
2. 改為「成功出貨才扣減計時器」原則：只有在 `itemSpawned === true` 時才將 `logisticsTimer` 扣減 `itemDispatchInterval`。若出貨失敗，計時器保持原值，在下一幀起點空出時可以立刻出貨，實現完美的無縫緊貼排列。

## 實施步驟
- [ ] 步驟 1：修改 `WorkerSystem.js` 中的 `state.mapEntities.forEach(ent => ...)` 邏輯，延遲並按需扣減 `ent.logisticsTimer`。
- [ ] 步驟 2：執行 `npm.cmd run test:e2e` 確保全套 10 個測試套件順利通過。
- [ ] 步驟 3：執行 `npm.cmd run finalize`。

# 2026-06-18 轉彎物品合流後小幅煞車修復計畫

## 核心目標
1. 解決轉彎合流物品在過彎剛切換到 output 路徑的瞬間，其 progress 被重置為 0，而後方直行車 progress 較高（例如 0.4），導致 Stacking 排序出錯，將直行車誤判為前車，從而對已合流的轉彎車套用 backpressure 物理限速，使其產生小幅度煞車的 Bug。
2. 實現「Canonical 統一座標系排序與 Stacking 物理限制計算」：在 `WorkerSystem.js` 中對 transfers 進行 Stacking 前的 group 排序時，使用與 `LogisticsTransferQueues.js` 一致的 `useCanonical` 判斷與 `getDistance(canonical)`。
3. 對於 `useCanonical` 成立的組，排序以 canonical 距離為準，且 `j > 0` 的物理限制計算也在 canonical 座標系上進行，最後再將限制 `limitCanonical` 還原為局部座標系的 `maxDist`。

## 實施步驟
- [ ] 步驟 1：修改 `WorkerSystem.js` 的 `processAutomatedLogistics` Stacking 計算，引入 `useCanonical` 判斷、`getPointOnPathByDistance` 與 `getDistance`，使用對齊後的 canonical 距離重新排序 `groupTransfers`，並在 canonical 座標系上計算 `physicalLimitCanonical`，還原為局部 `maxDist`。
- [ ] 步驟 2：執行 `npm.cmd run test:e2e` 確保所有 10 個測試套件順利通過。
- [ ] 步驟 3：執行 `npm.cmd run finalize`。

# 2026-06-17 物流多線合流後物品無縫接合與避免轉彎車煞車修復計畫

## 核心目標
1. 解決合流之後轉彎的物品 A 會莫名煞車等待後方的直行物品 B 跟上的怪異行為。
2. 改為「前進無煞車」原則：轉彎物品 A 轉彎後以 100% 正常速度前進，絕不煞車或減速。
3. 實現「足夠空間平滑放行」：後方直行物品 B 在等待線時，若前車 A 正好在轉彎或前進，B 的最大前進限制 `limit` 應根據 A 已經在輸出路徑上的前進距離 `distance_A` 來動態放寬（即 `mergeDistance - spacing + distance_A`），使 B 能在 A 前進的同時平滑往前跟進，最終正好無縫貼上 A。
4. 避免物品瞬移、忽然煞車、加速或無故旋轉等 regression，確保既有 Fair Merge 與 Backpressure Stacking 運作正常。

## 實施步驟
- [ ] 步驟 1：在 `LogisticsMergeNodeRuntime.js` 的 `getMergeThroughYieldLimit` 最前面，當 `transfer._mergeVisualTurn` 存在時直接返回 `Infinity`，避免轉彎物品被誤判定為穿越車限制速度。
- [ ] 步驟 2：在 `getMergeThroughYieldLimit` 對穿越車進行讓行限制時，若 node 處於支線輪次（`zipperTurn === 'branch'` 或等待支線），尋找剛合流的支線車 A（`node.lastAdmittedTransferId`），若 A 正在輸出線上前進，則將 B 的讓行距離動態縮小（`dynamicSpacing = Math.max(0, spacing - distance_A)`），使 B 平滑前進跟上，達成無縫拼接。
- [ ] 步驟 3：運行 Playwright 測試與物流線合流驗證，確保所有功能通過。
- [ ] 步驟 4：執行 `npm run finalize`。

# 2026-06-17 物流線合流死鎖與塞車問題修復計畫（續）

## 核心目標
1. 解決在修正瞬移問題後，主線直行車與支線合流車在合流點因限速而互卡死鎖的問題。
2. 確立「已越過合流點的車，前進是為了讓出空間」的物理邏輯原則。
3. 修正 `LogisticsMergeNodeRuntime.js` 的 `getMergeThroughYieldLimit` 函式，當 `mergeDistance <= 0.1`（車已越過合流點在輸出線上）時，不對其進行限速（不設定 `limit`），以利其前進拉開安全間距，避免與待合流物品產生死鎖。
4. 確保不影響既有的 Round-Robin 公平輪詢與 Stacking 回壓邏輯，所有 10 個 Playwright E2E 測試套件均順利通過。
5. 完成後執行 `npm run finalize`。

## 實施步驟
- [ ] 步驟 1：建立或更新 `implementation_plan.md`，並設定 `request_feedback = true` 來請求使用者批准。
- [ ] 步驟 2：修改 `LogisticsMergeNodeRuntime.js`，在 `mergeDistance <= 0.1` 區塊中，當 `winnerId` 存在時，不再限制其 `limit = Math.min(limit, distance)`，而是直接 `return;`。
- [ ] 步驟 3：運行 Playwright 測試與物流線合流驗證，確保完全修復且無 regression。
- [ ] 步驟 4：執行 `npm run finalize`。

# 2026-06-17 直行與轉彎合流之堆積定位跳躍與瞬移修復計畫

## 核心目標
1. 解決直行物流物品在合流點前產生大幅度「回跳兩格」瞬移的嚴重問題。
2. 確立「職責分離」：邏輯層（物理層）嚴禁提早切換 `lineId`，統一於抵達合流點 0.5px 內才進行路線切換，避免因起點坐標系不同造成 backpressure/stacking 計算出錯而將物品拉回。
3. 表現層（渲染層）負責在合流前 20px 內渲染圓角弧線（若轉彎），邏輯層維持 100% 精確且無損的自然移動。
4. 恢復 `isAtMergeGate` 距離判定至 `0.5`px，移除邏輯層的 `virtualTurnRoute`（完全由渲染層的 `getMergeOutputVisualHandoffPoint` 圓滑承接）。

## 實施步驟
- [ ] 步驟 1：修改 `LogisticsMergeNodeRuntime.js` 的 `apply`，將 `isAtMergeGate` 門禁判定恢复為原來的 `inputTotal - 0.5`（0.5px）。
- [ ] 步驟 2：移除 `apply` 中邏輯層的 `virtualTurnRoute` 相關操作，所有物品在切換時統一使用 `route.map(...)` 輸出線路徑且 `progress = 0`。
- [ ] 步驟 3：運行 Playwright 自測及手動驗證，確保物流暢通、無瞬移且零 regression。
- [ ] 步驟 4：執行 `npm run finalize`。

# 2026-06-17 多線合流死鎖與堵死問題修復計畫


## 核心目標
1. 解決多條物流輸入線合流至同一輸出線起點時，剛合流過去的物品與待合流物品互相等待導致堵死死鎖的 Bug。
2. 藉由記錄 `node.lastAdmittedTransferId`，在 `getMergeThroughYieldLimit` 中對其放行，消除剛合流車與待合流車的死鎖。
3. 確保不影響既有的 Round-Robin 公平輪詢與 Stacking 回壓邏輯。

## 實施步驟
- [x] 步驟 1：在 `LogisticsMergeNodeRuntime.js` 的 `commitLogisticsMergeAdmission` 中記錄 `node.lastAdmittedTransferId = winnerId`。
- [x] 步驟 2：在 `getMergeThroughYieldLimit` 中加入針對 `lastAdmittedTransferId` 且在合流點一格範圍內的車的忽略邏輯。
- [x] 步驟 3：運行 Playwright 測試與物流線合流驗證，確保完全修復且無 regression。
- [x] 步驟 4：執行 `npm run finalize`。

# 2026-06-17 三線壅塞連續輪替修正計畫

## 核心目標
1. 在三條 input 都持續壅塞、持續補貨的情況下，合流放行紀錄必須穩定輪替 A>B>C>A>B>C，不得固定左側或任一單線連續通過。
2. 修正輪詢狀態在 pending winner、through slot、merge node 註冊或測試補貨時被重置/跳過的根因。
3. 保留物品自然直行/轉彎與「只停不退」原則，不使用瞬移或強制拉回位置。
4. 完成後執行物流回歸與 `npm run finalize`。

## 實施步驟
- [x] 步驟 1：用安全搜尋盤點 merge node 註冊、inputGroupIds 更新、admission winner 與 through slot 狀態流。
- [x] 步驟 2：新增三線持續壅塞補貨紅燈測試，重現單線連續優先。
- [x] 步驟 3：局部修正輪詢狀態或 input 註冊根因，確保 commit 後下一條 ready input 取得路權。（已修正 `commitLogisticsMergeThroughAdmission` 中插隊主線車覆寫 `currentActiveSlot` 的 Bug）
- [/] 步驟 4：執行合流/回壓回歸、語法檢查與 finalize。

# 2026-06-17 三線匯流公平輪詢與滿載修復計畫

## 核心目標
1. 三條 input 匯入同一 output 時，放行順序必須依穩定 input 順序輪流通過，例如 A>B>C>A>B>C，不再讓單一路線長期優先。
2. 未輪到或 output 空間不足的物品必須停在匯合點前一格等待，不得佔住 merge cell。
3. 前車離開 output 入口達到安全間距時，下一個輪到的 input 要能提前啟動轉彎，讓合流後主線維持一格滿載且不重疊。
4. 匯流物品仍使用既有正常直行/轉彎取樣，不新增瞬移、強制拉位或表現層修正邏輯。

## 實施步驟
- [x] 步驟 1：使用 `tools/safe_search.cjs` 盤點 `LogisticsMergeNodeRuntime`、`LogisticsTransferQueues` 與相關合流回歸測試。
- [x] 步驟 2：新增紅燈回歸測試，重現三入口同時等待時必須 A>B>C 輪流放行，且非 winner 停在前一格。
- [x] 步驟 3：局部修正合流 winner 選擇與等待線限制，保留 output entry spacing 作為唯一安全放行條件。
- [x] 步驟 4：執行物流回歸、語法檢查與 `npm run finalize`，回報 Debug 渲染耗時與 Draw Calls。

# 2026-06-16 匯流轉彎弧線方向修復計畫

## 核心目標
1. 修正匯流 input 轉彎尾端先往輸出反方向偏移，再拉回 merge node 的生硬軌跡。
2. 讓匯流點轉彎使用與一般物流線一致的圓滑弧線方向，沿 output 方向自然收斂。
3. 僅調整 renderer 的視覺曲線控制點，不改合流 admission、回壓與主線滿載相位。

## 實施步驟
- [x] 步驟 1：新增/更新匯流轉彎方向回歸測試，確認舊控制點會讓曲線往 output 反方向偏移。
- [x] 步驟 2：修正 `LogisticsRenderer.getMergeInputTerminalArcPoint()` 的末端控制點方向。
- [x] 步驟 3：執行物流/渲染回歸、語法檢查與 `npm.cmd run finalize`。

# 2026-06-16 匯流 input 尾端曲線速度修復計畫

## 核心目標
1. 移除匯流 input 尾端「最後一小段拉回 output 起點」造成的非線性吸附感。
2. 改為建立自然抵達 merge node 的 input terminal 視覺路徑，讓進度接近 1 時位置與速度連續。
3. 保留 output 主線一格滿載相位，不恢復 output 虛擬圓角。

## 實施步驟
- [x] 步驟 1：新增尾端速度平滑回歸測試，確認 90→95 與 95→100 不會暴增。
- [x] 步驟 2：以 input terminal 視覺路徑取代尾端 smoothstep 拉回。
- [x] 步驟 3：執行 renderer/物流回歸、語法檢查與 `npm.cmd run finalize`。

# 2026-06-16 匯流轉彎末端瞬移修復計畫

## 核心目標
1. 匯流 input 物品在 progress=1 時，渲染位置必須與切換到 output group 後的 progress=0 位置一致。
2. 保留 output 主線一格滿載相位，不恢復會壓縮主線距離的 output 虛擬圓角。
3. 僅調整匯流 input 視覺取樣，不改合流 admission、回壓與物流拓樸。

## 實施步驟
- [x] 步驟 1：更新 renderer 回歸測試，確認 input 末端與 output 起點無跳躍。
- [x] 步驟 2：修正 `LogisticsRenderer.getPointOnMergeTransferPath()` 的匯流 input 尾端映射。
- [x] 步驟 3：執行渲染回歸、物流回歸、語法檢查與 `npm.cmd run finalize`。

# 2026-06-16 匯流後主線視覺等速與不重疊修復計畫

## 核心目標
1. 消除匯流後 output 主線上 `_mergeVisualTurn` 物品與一般 output 物品的渲染距離差，避免同一條線出現重疊、空隔與忽快忽慢。
2. 讓匯流圓角只負責切線瞬間的視覺連續，不改變 output 主線上物品之間的一格邏輯間距。
3. 保留既有合流 admission、回壓與批次移動架構，不新增每格 Update。

## 實施步驟
- [x] 步驟 1：新增渲染距離回歸測試，證明 output 主線上邏輯相差一格的物品必須渲染相差一格。
- [x] 步驟 2：修正 `LogisticsRenderer` 的 merge output 虛擬圓角取樣，使其不改變 output 主線相位。
- [x] 步驟 3：執行渲染回歸、物流回歸、語法檢查與 `npm.cmd run finalize`。

# 2026-06-16 三方匯流滿載無間隔修復計畫

## 核心目標
1. 移除合流 admission 對固定線別槽位的優先語意，二線或三線匯流皆以「物品實際先抵達等待區」決定下一個通過者。
2. 前一個物品尚在匯流轉彎時，下一個 winner 只要 output 已釋出足夠空間，就必須開始向前跟進，讓最終主線維持一格緊貼且不重疊。
3. 保留既有 MergeNode、回壓與批次物流架構，不新增每格輸送帶 Update，也不改 Router/occupancy。

## 實施步驟
- [x] 步驟 1：新增回歸測試，證明先抵達者不可被 round-robin 線別槽位延後。
- [x] 步驟 2：調整 `LogisticsMergeNodeRuntime` 的 winner 選擇，以 ready transfer 的實際距離/序號決定，而不是固定線別槽位。
- [x] 步驟 3：確認合流 winner 在 output 半釋放時不被標記阻塞，可跟隨前車逐步貼近。
- [x] 步驟 4：執行物流回歸、語法檢查與 `npm run finalize`。

# 2026-06-12 拉鏈式合流（Zipper Merge）碎片間隙修復

## 根因
主線穿越車流不受合流閘門管制；支線物品插入到「逼近中的穿越車」前方時，留下的小數間隙因同速永遠無法閉合，形成「數個緊密＋半格空隙」的循環圖樣。

## 解法
1. 穿越車在「輪到支線」（`node.zipperTurn === 'branch'`）且支線有就緒物品時，於合流點前一格讓行（只停不退）。
2. 支線物品插入後輪次交還主線（commit 時設 `zipperTurn = 'main'`）；穿越車通過合流點時輪次交還支線。
3. 1:1 拉鏈互插，離線模擬驗證：隨機上游車流下主線間隙 100%（單支線）/ 96.6%（三支線穩態）恰好一格，零重疊、零後退。

## 實裝位置
- `LogisticsMergeNodeRuntime.getMergeThroughYieldLimit`（新增）＋ commit 輪次切換
- `ConveyorSystem.getLogisticsMergeThroughYieldLimit`（委派）
- `LogisticsTransferQueues` 與 `WorkerSystem` 的 maxAllowed 計算掛載讓行上限

## 補強：防碎片視界（輪次條件式）
- 輪到主線（`zipperTurn !== 'branch'`）時，支線禁止插入三格視界內逼近中的來車前方，改為等其通過後緊貼插入。
- 輪到支線時來車必停讓行線（合流點前一格），插入必然緊密，視界不生效（否則互等死鎖）。
- 最終模擬：隨機上游車流 + 三支線串聯，主線間隙 100%（1420/1420 樣本）恰好一格，零重疊、無死鎖。

# 2026-06-12 合流 Gate 連續放行重構計畫

## 核心目標
1. 取消「上一個物品完全通過/鎖釋放後才選下一個 winner」的合流獨占規則。
2. 將合流點改為入口空間 Gate：只要 output 起點後方已空出 `itemSpacing`，下一個 input 物品即可取得 slot 並切入 output。
3. Round-Robin 仍只決定下一個輸入分支，安全性由 output 起點空間檢查保證，避免重疊與推擠。

## 實施步驟
- [x] 步驟 1：建立紅燈測試，證明 currentOccupant 存在但 output 已空出時仍應選出下一個 winner。
- [x] 步驟 2：移除 currentOccupant 作為 admission 獨占鎖的語意，改由 output entry spacing 決定是否可放行。
- [x] 步驟 3：允許已抵達等待線的 winner 直接切入 output 起點，不要求 input progress 到 1。
- [x] 步驟 4：同步合流 runtime 與 transfer queue 的 itemSpacing，保留不重疊與 Round-Robin。
- [x] 步驟 5：執行物流回歸、Playwright E2E、清理 tmp 並執行 `npm.cmd run finalize`。

# 物流線匯合處流水線優化計畫

## 目標

重構物流線匯合處的物品移動與交通管制，避免匯合點重疊後才回推，改為預判煞車、空間詢問、Round-Robin 輪流放行與高密度緊貼跟隨。

## 設計原則

1. 維持物流邏輯批次更新，不替每格輸送帶新增獨立 Update。
2. 新增輕量 Merger Controller 作為純邏輯資料結構，不直接操作 Phaser Sprite/UI。
3. 物品移動採用路徑距離與前車間距計算，拒絕依賴物理推擠修正重疊。
4. 匯合點以 incoming lane key 排隊，依 lastServed 實作 1-2-3-1-2-3 輪流路權。
5. 鎖釋放以物品尾端離開入口判定區為準，不等待中心點走完整格。

## 實作步驟

1. 透過安全搜尋盤點 LogisticsManager、物品移動、logisticsLines 與既有測試位置。
2. 先新增 Merger Controller 與 kinematics 的單元測試，覆蓋 2 路/3 路匯合、拒絕路權即停、前車空間足夠立即跟上。
3. 建立純邏輯 Merger Controller 模組，提供重建匯合點、申請路權、釋放鎖與排隊清理。
4. 將物品更新改成空間詢問式，整合 look-ahead 路權申請與 WAITING/MOVING 狀態。
5. 執行測試、建置驗證與 `npm run finalize`，並回報 Debug 渲染耗時與 Draw Calls 數。

# 2026-06-10 合流點輪詢放行修復計畫

## 核心目標
1. 修正二條或三條物流線同時匯入同一合流點時，物品因互相等待而堵死的問題。
2. 在既有 `MergeNode` 與回壓機制上加入公平輪詢放行，由第一個實際抵達者起跑，之後按固定槽位循環讓每條輸入各通過一個物品。
3. 保留物流群組、路徑足跡與渲染層既有架構，不重寫 Router 或 occupancy 系統。

## 2026-06-11 仍會堵死的二次修正
1. 初判根因：合流 winner 可能在佇列階段被提前鎖定，但該物品尚未真正到達合流點；後續真正到達的其他輸入線會持續等待 stale winner，形成死鎖。
2. 修正方向：合流 admission winner 只能在「確實仍可前進到合流點」時被承諾；若 winner 尚未抵達且被卡在等待線，必須釋放鎖定並重選已到達或可前進的輸入。
3. 驗證方向：新增 stale winner 場景，確認先被選中的等待物品不會永久阻擋其他已到達合流點的物品。

## 2026-06-11 Winner 反向限速死鎖修正
1. 實測根因：winner 已被選出後，`LogisticsTransferQueues` 仍會因其他 input 靠近合流點而對 winner 套用 input 間距限制，導致 winner 停在 0.9 進度，永遠無法到達 `progress >= 1` 觸發真正合流。
2. 修正方向：只有非 winner 需要受其他 input 等待線限制；winner 只需受 output 入口佔用限制，讓它可以完成進站並把輪詢槽位推進到下一條 input。
3. 驗證方向：新增「winner_at_gate + nearby_waiters」回歸測試，並以 120 tick 長時間腳本確認三條 input 依序進入 output。

## 實施步驟
- [x] 步驟 1：使用安全搜尋定位 `MergeNode`、回壓與物品移動邏輯。
- [x] 步驟 2：在合流資料層補上輪詢狀態與輸入排序 helper。
- [x] 步驟 3：調整合流點通行判定，讓同一合流點每次只允許目前輪到的輸入通過。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。
- [x] 步驟 5：修正 stale winner 鎖定造成的合流死鎖。
- [x] 步驟 6：新增 stale winner 回歸腳本並執行 finalize。
- [x] 步驟 7：修正 winner 被其他 input 反向限速造成的死鎖。
- [x] 步驟 8：執行常設回歸、長時間合流驗證與 finalize。

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

# 2026-06-10 物流線圓角面片裁切修正

## 核心目標
1. 消除圓角面片與方形直線格重疊造成的透明度疊加。
2. 圓角面片只延伸到轉角 cell 的半格邊界，與前後方形格剛好貼合。
3. 僅修改 `LogisticsRenderer` 的轉角視覺端點，不改路由、佔格、合流與回壓邏輯。

## 實施步驟
- [x] 步驟 1：確認圓角端點使用整格距離是重疊根因。
- [x] 步驟 2：將 group 轉角面片端點從整格距離裁到半格距離。
- [x] 步驟 3：將單段轉角面片端點同步裁到半格距離。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 物流線圓角端點貼合修正

## 核心目標
1. 消除半格裁切後仍殘留的細縫。
2. 圓角面片起點切口必須垂直於進入方向，終點切口必須垂直於離開方向。
3. 只調整轉角面片幾何，不改箭頭、物流路徑、佔格、合流與回壓邏輯。

## 實施步驟
- [x] 步驟 1：確認細縫來自端點使用曲線切線法線造成的斜切口。
- [x] 步驟 2：讓 group 轉角面片傳入進入/離開方向作為端點切口方向。
- [x] 步驟 3：讓單段轉角面片同步使用進入/離開方向作為端點切口方向。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 物流線匯流點朝主線彎曲視覺修正

## 核心目標
1. 多條物流線匯入主線時，支線在匯合點必須朝 output 主線方向彎曲，而不是各自以獨立直角或星形箭頭收尾。
2. 僅調整 `LogisticsRenderer` 表現層，沿用 `logisticsMergeNodes`、inputGroupIds 與 outputGroupId，不修改物流路徑、佔格、排程、回壓或合流邏輯。
3. 匯流 cell 的普通轉角底圖與普通箭頭必須讓位，由 merge 視覺轉角與單一 45 度箭頭負責顯示。

## 實施步驟
- [x] 步驟 1：定位 renderer 既有 merge node route helper 與 group turn 判定。
- [x] 步驟 2：依 merge node input/output group 計算每個匯流 cell 的進入方向與主線輸出方向。
- [x] 步驟 3：在 group 繪製時讓普通轉角/普通箭頭跳過 merge cell，改由 merge 視覺轉角補上。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 物流線匯流中段命中修正

## 核心目標
1. merge node 位於 route 中段或 segment 上時，也要能推導 input 進入方向與 output 主線方向。
2. 修復右側支線未朝主線向下彎曲的問題。
3. 僅修改 `LogisticsRenderer` 視覺方向推導，不改物流路徑、佔格、排程、回壓或合流邏輯。

## 實施步驟
- [x] 步驟 1：確認原本只檢查 route 起終點是右側匯流未命中的根因。
- [x] 步驟 2：新增 route 中段/segment 命中方向推導。
- [x] 步驟 3：merge 視覺轉角改用新的方向推導函式。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 物流線匯流物理交會 fallback 修正

## 核心目標
1. 未登記在 `logisticsMergeNodes.inputGroupIds` 的物理交會線，也要能顯示朝主線方向彎曲。
2. 同一 cell 內若某 group 進入、另一 group 具有可輸出的主線方向，支線 group 產生 merge 視覺轉角。
3. 僅作為 renderer fallback，不寫入物流狀態，不改路徑、佔格、排程、回壓或合流邏輯。

## 實施步驟
- [x] 步驟 1：確認右側線可能未登記在 merge node input group。
- [x] 步驟 2：建立跨 group cell incoming/outgoing 方向索引。
- [x] 步驟 3：為同格物理交會補上支線朝主線方向的 merge 視覺轉角。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 物流線同群組匯流視覺補齊

## 核心目標
1. 同一匯合點上，後續已併入主線 group 的線段也要能顯示朝主線方向彎曲。
2. 只在同格接觸方向數達到匯流型節點時放寬同 group 限制，避免普通單一路徑轉角被誤判。
3. 僅修改 `LogisticsRenderer` 視覺 fallback，不改物流狀態、路徑、佔格、排程或回壓。

## 實施步驟
- [x] 步驟 1：確認同 group 限制會排除第二條匯流線。
- [x] 步驟 2：在物理交會 fallback 中加入匯流型節點判定。
- [x] 步驟 3：匯流型節點允許同 group input/output 形成視覺彎角。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 物流線匯流主線方向校正

## 核心目標
1. 匯流點視覺彎角必須優先使用 merge node 註冊時保存的 `outputDir`，避免 debug route 在分叉節點用座標排序猜錯主線方向。
2. 選中物流線的編號延伸路徑也必須依 `outputDir` 挑選匯流後路線，避免匯合後誤往右側外圈繞行。
3. 僅修改 `LogisticsRenderer` 的表現層方向選擇，不改物流路徑、佔格、合流註冊、排程或回壓邏輯。

## 實施步驟
- [x] 步驟 1：確認錯誤編號來自 debug route 在多分支交會點猜錯 output 方向。
- [x] 步驟 2：讓 merge 視覺方向優先讀取 `node.outputDir` 與 `node.inputDirections`。
- [x] 步驟 3：讓 debug route 延伸依 `outputDir` 篩選匯流後候選路徑。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 三向匯流雙圓角補齊

## 核心目標
1. 三條物流線匯合為一條主線時，兩個支線方向都必須各自生成朝主線 outputDir 的圓角。
2. 同一 merge cell 內，所有普通底圖與普通箭頭必須讓位，避免後畫的 group 把匯流圓角蓋掉。
3. 僅調整 `LogisticsRenderer` 的匯流視覺，不改物流路徑、佔格、合流註冊、排程或回壓邏輯。

## 實施步驟
- [x] 步驟 1：確認三向匯流缺角來自同格其他 group 普通底圖覆蓋與 incoming 方向未完整補齊。
- [x] 步驟 2：依 merge node `outputDir` 從同格物理接觸補齊所有 incoming 圓角。
- [x] 步驟 3：建立全域 merge cell skip，讓所有 group 的普通底圖/箭頭在匯流格讓位。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 三向匯流主線底圖保留

## 核心目標
1. 三向匯流 cell 必須保留直線主線的方形底圖，避免看起來少一格。
2. 同一 cell 的兩個匯流圓角仍維持顯示，普通箭頭與普通轉角箭頭仍需讓位。
3. 僅調整 `LogisticsRenderer` 的底圖 skip 條件，不改物流路徑、佔格、合流註冊、排程或回壓邏輯。

## 實施步驟
- [x] 步驟 1：確認缺格來自 merge cell 被加入 `roundedBaseSkipCellKeys`。
- [x] 步驟 2：移除 merge cell 對普通方形底圖的全域 skip。
- [x] 步驟 3：保留 merge cell 對普通箭頭與普通轉角箭頭的 skip。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-10 接通後匯流主線格保留

## 核心目標
1. 接通狀態下，`connectedCellPaths` 判定出的 turn cell 不可讓匯流主線方形底圖消失。
2. 底圖 skip 與普通圓角 skip 必須分離：匯流格保留底圖，但仍跳過普通圓角與普通箭頭。
3. 僅修改 `LogisticsRenderer` 的繪製參數，不改物流路徑、佔格、合流註冊、排程或回壓邏輯。

## 實施步驟
- [x] 步驟 1：確認接通後缺格來自 `turnCellKeys` 重新把匯流格加入底圖 skip。
- [x] 步驟 2：拆分方形底圖 skip 與普通圓角 skip。
- [x] 步驟 3：匯流格從底圖 skip 移除，但保留在普通圓角/普通箭頭 skip。
- [x] 步驟 4：執行語法檢查與 `npm run finalize`。

# 2026-06-11 匯流物品圓角轉彎

## 核心目標
1. 物品進入 merge node 時，最後半格必須沿匯流圓角曲線轉入 outputDir，而不是在合流中心直角切換。
2. 物品剛被接入 output group 後，渲染位置必須延續圓角出口，避免從圓角末端跳回合流中心。
3. 僅增加渲染用 metadata 與 transfer 顯示座標修正，不改物流路徑、佔格、合流排程、回壓或實際 progress。

## 實施步驟
- [x] 步驟 1：確認普通轉角已用圓角路徑取樣，匯流不平滑來自 input/output 兩段分開渲染。
- [x] 步驟 2：在 merge admission 時保存剛進入 output 的視覺轉角方向 metadata。
- [x] 步驟 3：renderer 對 input 尾端與 output 起點套用匯流圓角視覺取樣。
- [x] 步驟 4：執行語法檢查、回歸腳本與 `npm run finalize`。

# 2026-06-11 匯流物品轉彎速度對齊

## 核心目標
1. 匯流物品在 merge 圓角上的移動速度必須與一般物流線圓角一致。
2. 匯流 input 尾端只依原本移動距離前進同等曲線距離，不可壓縮整段圓角，也不可在 output 起點淡出剎車。
3. 僅調整 `LogisticsRenderer` 的 transfer 視覺取樣，不改實際物流 progress、排程、回壓或佔格。

## 實施步驟
- [x] 步驟 1：確認速度偏快來自半格距離映射整段圓角曲線。
- [x] 步驟 2：input 末端以原始距離逐像素推進圓角，不在 input 內跑完整段圓角。
- [x] 步驟 3：output 起點接續剩餘圓角距離，不使用 fade 補償。
- [x] 步驟 4：執行語法檢查、回歸腳本與 `npm run finalize`。

# 2026-06-11 匯流物品改用正常轉彎取樣

## 核心目標
1. 匯流物品轉彎必須使用與正常物流線完全相同的 `buildRoundedLogisticsPathPoints()` 取樣。
2. 移除匯流專用二次曲線取樣，避免速度、曲線形狀與正常轉彎不一致。
3. 僅調整 `LogisticsRenderer` 的 transfer 顯示路徑，不改實際物流 progress、排程、回壓或佔格。

## 實施步驟
- [x] 步驟 1：確認舊 helper 是匯流專用曲線，與正常物流線轉彎不同源。
- [x] 步驟 2：input/output 匯流轉彎都建立正常三點虛擬路徑並走原本 transfer 取樣。
- [x] 步驟 3：刪除不再使用的匯流專用曲線 helper，更新回歸測試比對正常轉彎路徑。
- [x] 步驟 4：執行語法檢查、回歸腳本與 `npm run finalize`。

# 2026-06-11 撤銷物流線清除在途物品

## 核心目標
1. Ctrl+Z 復原物流線建造快照時，已不屬於復原後物流線群組的在途物品必須立即清除。
2. 被清除物品若能找到起始建築，優先回收到該建築 `outputBuffer`；若起始建築容量已滿或不存在，直接刪除。
3. 僅修改 `LogisticsUndoStore` 的狀態復原與回收邏輯，不改物流路徑、渲染、排程、回壓或合流演算法。

## 實施步驟
- [x] 步驟 1：新增撤銷後清除消失物流線物品的回歸測試。
- [x] 步驟 2：確認測試在現況下失敗，鎖定根因為 undo restore 未同步 `activeTransfers`。
- [x] 步驟 3：在 `LogisticsUndoStore.restore()` 復原物流線後清理失效 transfer 並嘗試回收到來源建築。
- [x] 步驟 4：執行回歸測試、語法檢查與 `npm run finalize`。

# 2026-06-11 撤銷同群組改線物品清除補強

## 核心目標
1. Ctrl+Z 復原時，即使 `groupId` 仍存在，只要該群組路徑拓撲被復原改動，該群組上的在途物品也必須清除。
2. 避免物品沿著已不存在的舊 routePoints 被重新投影到建築門口，形成堵門口堆疊。
3. 僅補強 `LogisticsUndoStore` 的 affected group 判定，不改路由、渲染、排程、回壓或物流合流邏輯。

## 實施步驟
- [x] 步驟 1：新增同 group 但 routePoints 改變時物品應清除的回歸測試。
- [x] 步驟 2：確認測試在現況下失敗，根因為只檢查 group 是否存在。
- [x] 步驟 3：在 restore 前比對復原前/後 logistics line signature，將 changed group 上的 transfer 一併清除回收。
- [x] 步驟 4：執行回歸測試、語法檢查與 `npm run finalize`。

# 2026-06-11 撤銷消失線段物品精準清除

## 核心目標
1. Ctrl+Z 後只清除位於「復原後不存在的物流線段」上的物品。
2. 同一 group 仍存在且物品目前位置仍落在復原後物流線上的情況，物品必須保留。
3. 僅修改 `LogisticsUndoStore` 的 transfer 清理判定，不改物流路由、合流排程、回壓或渲染。

## 實施步驟
- [x] 步驟 4：執行回歸測試、語法檢查與 `npm run finalize`。

# 2026-06-12 物流線拆分與合流卡死修復計畫

## 核心目標
1. 解決在途物品（activeTransfers）在物流線拆分時，非受影響支線的物品被誤清除的問題。
2. 解決物流線拆分後，MergeNode 缺少後半段新群組（newGroupId）的 input 資訊，導致合流點卡死、物品無法通過的問題。

## 實施步驟
- [ ] 步驟 1：修改 src/systems/logistics/LogisticsTransferRerouter.js，限制僅在 affectedSet 包含其 lineId 或是該 lineId 已不存於 allLines 時更新對應在途物品。
- [ ] 步驟 2：修改 src/systems/logistics/LogisticsDeletionService.js，在拆分群組後更新對應 MergeNode 的 inputGroupIds 與 inputDirections。
- [ ] 步驟 3：執行物流回歸測試與自測，驗證物流暢通。
- [ ] 步驟 4：執行 npm run finalize 完成收尾。
