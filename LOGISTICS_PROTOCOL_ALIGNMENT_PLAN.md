# 物流系統協議一致性修復計劃

> 狀態規則：每個任務完成實作與本機驗證後，只能標示為「待使用者驗證」。必須等使用者明確確認沒問題，才能改為「已完成」。

## 目標

逐步修復目前物流系統與 `AGENTS.md`、`.cursorrules`、`Logistics Spatial Logic` 不一致的問題，並以 Playwright 測試與 `npm run finalize` 作為最終收尾標準。

## 狀態圖例

- `未開始`：尚未實作。
- `實作中`：正在修改或補測試。
- `待使用者驗證`：已完成實作與本機驗證，等待使用者確認。
- `已完成`：使用者已驗證並明確同意標示完成。

## 任務清單

| 編號 | 狀態 | 任務 | 對應規範 |
| --- | --- | --- | --- |
| 1 | 已完成 | 建立物流回歸測試基線 | Playwright Only、TDD |
| 2 | 已完成 | 建立物流狀態 Action 層，收斂直接寫入 `GameEngine.state` 的入口 | State Encapsulation、Event-Driven |
| 3 | 已完成 | 統一 routeWidth / footprint SSOT，移除 Router 外的手寫 footprint | Router SSOT、routeWidth 規則 |
| 4 | 已完成 | 統一 ghost preview 與 submitDrag 的驗證上下文 | ghost preview 與 submit 一致 |
| 5 | 待使用者驗證 | 修正物流延伸跨越與切段規則 | 防穿透與斷點、不可任意合併 |
| 6 | 未開始 | 合流 winner 單一來源化，移除隨機 fallback | Round-Robin、無絕對優先權 |
| 7 | 未開始 | 刪除、復原、重路由失敗時回收產品至來源建築或銷毀 | 物品回流與銷毀 |
| 8 | 未開始 | 收斂運輸模型至陣列偏移運輸法 | Performance Critical |
| 9 | 未開始 | UI / Renderer 解耦與 config-driven 收斂 | Strict Separation、Config-Driven |
| 10 | 未開始 | 最終 Playwright 驗證與 `npm run finalize` 收尾 | Mandatory Finalization |

## 詳細計劃

### 任務 1：建立物流回歸測試基線

**狀態：已完成**

**目前進度**

- `待使用者驗證`：已新增「合流 winner 缺少 runtime 時不得使用隨機 fallback」Playwright 回歸測試，並確認新測試與既有合流測試通過。
- `待使用者驗證`：已新增「刪除運輸中物流線時產品必須退回來源建築」Playwright 回歸測試。
- `待使用者驗證`：已新增「刪除群組中段導致重路由失敗時產品必須退回來源建築」Playwright 回歸測試。
- `待使用者驗證`：已新增「物流線 routeWidth footprint 必須與 ConveyorRouter 一致」Playwright 回歸測試。
- `待使用者驗證`：已新增「物流延伸跨越其他物流線時不得合併被跨越群組」Playwright 回歸測試。
- `待後續任務處理`：preview / submit 完整上下文一致性仍留在任務 4 實作。

**目的**

先建立可重複驗證的測試，避免後續修復只靠人工觀察。

**預計檔案**

- 新增或修改：`tests/logistics/protocol_alignment.spec.js`
- 可能讀取：既有 `tests/logistics/*.spec.js`

**測試案例**

1. 刪除物流線後，線上產品不應直接消失，必須進入回收流程。
2. 三線合流 winner 不可使用隨機 fallback。
3. preview 顯示 valid 的物流線，submit 不應因另一套規則失敗。
4. routeWidth 佔格必須與 Router footprint 一致。
5. 物流延伸跨越其他物流線時，不應自動合併被跨越線。

**驗證方式**

- 執行指定 Playwright 測試。
- 預期第一輪應出現至少一個符合現況問題的失敗測試。

### 任務 2：建立物流狀態 Action 層

**狀態：已完成**

**目前進度**

- `待使用者驗證`：已新增 `src/systems/logistics/LogisticsStateActions.js`。
- `待使用者驗證`：已集中 `replaceLogisticsLines()`、`setSelectedLogistics()`、`clearSelectedLogisticsIfMatches()`、`upsertTurnArrowOverride()`、`removeTurnArrowOverride()`。
- `待使用者驗證`：`ConveyorSystem.upsertLogisticsLine()` 的 `logisticsLines` 替換已改用 Action。
- `待使用者驗證`：`LogisticsDragSubmission` 的物流選取狀態更新已改用 Action。
- `待使用者驗證`：`LogisticsExtensionCoordinator` 的 turnArrowOverride state 更新已改用 Action。
- `待使用者驗證`：`LogisticsDeletionService` 的物流線替換、turnArrowOverride 移除、選取清空已改用 Action。
- `待使用者驗證`：`LogisticsUndoStore.restore()` 的物流線還原與物流選取狀態還原已改用 Action。
- `未納入本任務`：`activeTransfers`、`logisticsMergeNodes`、`resources` 等高風險狀態仍保留原流程，留待對應任務處理。

**目前進度**

- `待使用者驗證`：`ConveyorSystem.getLogisticsSegmentOccupiedKeys()` 已改由 Router footprint 計算，移除該方法內手寫 routeWidth offset。
- `未開始`：`SpatialHashGrid` 與 `LogisticsLineHitTester` 尚未完全收斂到 Router footprint。

**目的**

將 `state.logisticsLines = ...`、物流選取狀態、turn override、active transfer 變更收斂到單一 Action 層。

**預計檔案**

- 新增：`src/systems/logistics/LogisticsStateActions.js`
- 修改：`src/systems/ConveyorSystem.js`
- 修改：`src/systems/logistics/LogisticsDragSubmission.js`
- 修改：`src/systems/logistics/LogisticsDeletionService.js`

**實作重點**

1. 提供 `replaceLogisticsLines(state, lines)`。
2. 提供 `setSelectedLogistics(state, selection)`。
3. 提供 `upsertTurnArrowOverride(state, override)` 與 `removeTurnArrowOverride(state, predicate)`。
4. 先保留既有資料結構，只收斂寫入入口。

**驗證方式**

- 任務 1 測試仍可執行。
- 既有物流建造、刪除、選取測試不退化。

### 任務 3：統一 routeWidth / footprint SSOT

**狀態：已完成**

**目前進度**

- `待使用者驗證`：`ConveyorSystem.getLogisticsSegmentOccupiedKeys()` 已改由 Router footprint 計算，移除該方法內手寫 routeWidth offset。
- `待使用者驗證`：新增 `src/systems/logistics/LogisticsFootprintRects.js`，以 `ConveyorRouter.getGhostOccupiedCells()` 產生可視與命中矩形。
- `待使用者驗證`：`SpatialHashGrid` 已改用 `LogisticsFootprintRects`，不再手寫寬線矩形。
- `待使用者驗證`：`LogisticsLineHitTester` 已改用 `LogisticsFootprintRects`，並保留 detached split cell 排除規則。
- `待後續任務處理`：`RoutingGridBuilder` 已使用 Router footprint；若後續任務改 routeScale / alignmentUnit，需再補 routeWidth 2/3 與轉角整合測試。

**目的**

所有物流線佔格、hit-test、routing grid 標記統一透過 `ConveyorRouter`，避免不同層對寬物流線與轉角有不同判定。

**預計檔案**

- 修改：`src/systems/ConveyorRouter.js`
- 修改：`src/systems/ConveyorSystem.js`
- 修改：`src/systems/logistics/RoutingGridBuilder.js`
- 修改：`src/systems/logistics/SpatialHashGrid.js`
- 修改：`src/systems/logistics/LogisticsLineHitTester.js`

**實作重點**

1. 在 Router 增加 line routePoints 轉 footprint cells 的 helper。
2. `ConveyorSystem.getLogisticsSegmentOccupiedKeys()` 改用 Router。
3. `SpatialHashGrid` 僅作快速查找，不作正式 footprint 判定。
4. `LogisticsLineHitTester` 改以 Router footprint cell 產生 hit 區。

**驗證方式**

- 寬物流線轉角測試必須通過。
- routeWidth 為 1、2、3 時，preview、submit、hit-test 佔格一致。

### 任務 4：統一 ghost preview 與 submitDrag 驗證上下文

**狀態：已完成**

**目前進度**

- `已完成`：`LogisticsDragSession.updateDragNow()` 已在 preview 階段建立 `routeContext`，記錄目標端口、目標建築、anchor grid、route path、ghost、routeWidth 與成本段數。
- `已完成`：`LogisticsDragSubmission.submitDrag()` 已優先使用 preview 的 `routeContext`，避免 submit 重新解析到不同 `targetPort` / `targetBuilding`。
- `已完成`：submit 前會以提交當下的物流佔用 footprint 與 routing grid 重新驗證 routeContext；若 preview 後路徑被佔用，會取消建造。
- `已完成`：已確認使用者後續端口磁吸修正不會破壞第 4 項目標鎖定；並補回 submit 前物流 footprint 佔用比對。

**目的**

確保 preview valid 與 submit 成功使用同一份路由、碰撞、成本與目標解析資料。

**預計檔案**

- 修改：`src/systems/logistics/LogisticsDragSession.js`
- 修改：`src/systems/logistics/LogisticsDragSubmission.js`
- 可能新增：`src/systems/logistics/LogisticsDragRouteContext.js`

**實作重點**

1. preview 階段產生 `routeContext`。
2. submit 階段只消耗 `routeContext`，不重新推導不同 target。
3. submit 前執行同一 Router footprint revalidation。
4. 建造成本段數在 preview 與 submit 共用同一算法。

**驗證方式**

- preview valid 後 submit 不得因 target resolve 差異失敗。
- submit 會失敗的場景，preview 必須提前 invalid。

### 任務 5：修正物流延伸跨越與切段規則

**狀態：待使用者驗證**

**目前進度**

- `待使用者驗證`：已檢查使用者自行修正的端口磁吸調整，`resolveDragTarget()` 保留上一個已鎖定端口的行為與 `routeContext` 不衝突。
- `待使用者驗證`：已補回 submit 前物流 footprint 佔用比對，並保留一般建造遇佔用時拒絕建造。
- `待使用者驗證`：已修正建築端口直接拉到既有物流線時被 submit 前佔用驗證誤擋的問題；終點接線可合併，中途重疊仍拒絕。
- `待使用者驗證`：延伸建造跨越其他物流線時，不再取消整次建造；會交由 placement 切掉交會段，保留被跨越點後方的斷開線段。
- `待使用者驗證`：新增「拖曳延伸跨越其他物流線時應建立斷開線段且不註冊合流」Playwright 回歸測試。
- `待使用者驗證`：新增「拖曳延伸接到同向物流線端點時必須合併群組」、「拖曳支線接到主線中段時必須註冊合流節點」、「建築端口直接拉到既有物流線時必須建立連接並註冊合流」Playwright 回歸測試。
- `待使用者驗證`：已恢復 `renderSourcePortCells()` 依物流線 metadata 繪製 source / target port cell，修正端口可點擊但選擇框消失的問題。

**目的**

讓物流線延伸時只允許自身 sourceLine pass-through，不允許跨越其他物流線後自動合併。

**預計檔案**

- 修改：`src/systems/logistics/LogisticsDragSession.js`
- 修改：`src/systems/logistics/LogisticsLinePlacement.js`
- 修改：`src/systems/logistics/LogisticsDragSubmission.js`

**實作重點**

1. extension collision bypass 僅限 sourceLine 自身。
2. 偵測跨越其他物流線時切成多段獨立線段。
3. 中途跨越不註冊 merge node，不併入被跨越群組。
4. 端點同向接續仍允許合法 merge。

**驗證方式**

- 延伸跨越他線不自動合併。
- 端點接續仍可合併。
- 方向相反合併仍被禁止。

### 任務 6：合流 winner 單一來源化

**狀態：未開始**

**目前進度**

- `待使用者驗證`：`LogisticsTransferQueues` 已移除缺少 runtime 時的 `Math.random()` winner fallback。
- `待使用者驗證`：已修正 `_mergeVisualTurn` 過彎中的輸出物品被 output entry 判定為佔用，導致下一個支線在匯合點前永久堵住的問題。
- `待使用者驗證`：新增「合流等待主線但主線無可通過物品時必須放行支線」與「合流過彎中的輸出物品不得永久阻塞下一個支線」Playwright 回歸測試。
- `未開始`：`WorkerSystem` 內重複 winner fallback 尚未收斂。
- `未開始`：確認 `_logisticsMergeAdmissionWinners` 僅由 runtime 寫入。

**目的**

合流輸入與主線讓行共用 `LogisticsMergeNodeRuntime`，移除不同層的隨機 winner fallback。

**預計檔案**

- 修改：`src/systems/logistics/LogisticsMergeNodeRuntime.js`
- 修改：`src/systems/logistics/LogisticsTransferQueues.js`
- 修改：`src/systems/WorkerSystem.js`

**實作重點**

1. `LogisticsTransferQueues` 不再自行抽 winner。
2. `WorkerSystem` 不再自行抽 winner。
3. `_logisticsMergeAdmissionWinners` 僅由 runtime 寫入。
4. 無 runtime 時回傳 null 並保持等待，不使用 `Math.random()`。

**驗證方式**

- 三線合流依序輪詢。
- 主線堵塞時支線停在合流點前一格。
- 多次執行測試結果穩定。

### 任務 7：刪除、復原、重路由失敗時回收產品

**狀態：未開始**

**目前進度**

- `待使用者驗證`：刪除整組物流線時，失效 transfer 會退回來源建築。
- `待使用者驗證`：重路由失敗並移除 active transfer 前，會先退回來源建築。
- `未開始`：獨立 `LogisticsTransferRecoveryService` 尚未建立；目前先復用 `LogisticsUndoStore.returnTransferToSource()`。

**目的**

符合「產品退回原建築，滿載才銷毀」規則。

**預計檔案**

- 新增：`src/systems/logistics/LogisticsTransferRecoveryService.js`
- 修改：`src/systems/logistics/LogisticsTransferRerouter.js`
- 修改：`src/systems/logistics/LogisticsDeletionService.js`
- 修改：`src/systems/WorkerSystem.js`

**實作重點**

1. 新增 `recoverTransferToSourceOrDestroy(state, transfer)`。
2. source 建築存在且可存放時退回 storage 或 outputBuffer。
3. source 不存在或容量滿時銷毀並留下可追蹤狀態。
4. 所有 `activeTransfers.splice()` 前先走 recovery service。

**驗證方式**

- 刪線時產品回到來源建築。
- 來源滿載時產品被銷毀。
- undo 導致路線斷裂時也走相同流程。

### 任務 8：收斂運輸模型至陣列偏移運輸法

**狀態：未開始**

**目的**

移除 `WorkerSystem.activeTransfers` 中重複的 per-transfer progress 核心運算，改由 transport array 的 index/offset 驅動。

**預計檔案**

- 修改：`src/systems/logistics/TransportLogic.js`
- 修改：`src/systems/logistics/LogisticsTransferQueues.js`
- 修改：`src/systems/WorkerSystem.js`
- 修改：`src/renderers/logistics_renderer.js`

**實作重點**

1. 將 active transfer 視覺資料改為 TransportLogic 的 view model。
2. 每幀更新只改 index/offset。
3. 合流與回壓操作 transport array。
4. renderer 只讀 view model，不參與運輸邏輯。

**驗證方式**

- 大量物品運輸時無逐物件獨立 update callback。
- 合流、堵塞、送達行為與既有功能一致。

### 任務 9：UI / Renderer 解耦與 config-driven 收斂

**狀態：未開始**

**目的**

降低 UI、renderer、system 的循環依賴與硬編碼樣式。

**預計檔案**

- 修改：`src/ui/ui_config.js`
- 修改：`src/ui/LogisticsUI.js`
- 修改：`src/renderers/logistics_renderer.js`
- 可能新增：`src/systems/logistics/LogisticsRenderModel.js`

**實作重點**

1. `LogisticsUI` tooltip/menu 樣式搬到 `UI_CONFIG`。
2. `logistics_renderer.js` 不直接 import `conveyorSystem`。
3. Renderer 改讀 render model。
4. 減少直接讀取 `GameEngine.state` 的 renderer 分支。

**驗證方式**

- UI 視覺不退化。
- renderer 不再依賴 system facade。
- 物流線狀態顏色仍符合中斷、接通、運輸中規則。

### 任務 10：最終驗證與收尾

**狀態：未開始**

**目的**

確認所有修復符合專案收尾協議。

**預計動作**

1. 執行物流 Playwright 測試。
2. 執行既有相關測試。
3. 執行 `npm run finalize`。
4. 回報 Debug 渲染耗時與 Draw Calls。

**驗證方式**

- 所有相關測試通過。
- `npm run finalize` 成功。
- 使用者確認後，將任務 10 標示為已完成。
