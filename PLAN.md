# 2026-06-03 物流系統模組化拆分計畫

## 核心目標
1. 保留 `ConveyorSystem.js` 對外 facade 與 `conveyorSystem` 單例，避免破壞 `ui.js`、`LogisticsUI.js`、`WorkerSystem.js`、`logistics_renderer.js` 既有引用。
2. 維持 `ConveyorRouter.js` 作為 pathfinding、footprint、occupancy 的 SSOT，不建立第二套路由足跡判定。
3. 依低風險到高風險順序拆分 `ConveyorSystem.js`：先搬無狀態/低耦合工具，再搬 state store、routing grid、drag/build、group graph、transfer updater。
4. 每階段保留同名公開方法，讓外部呼叫不需要一次性改動。

## 實施步驟
- [x] 步驟 1：重新讀取 `.cursorrules` 與物流空間邏輯技能，使用 `tools/safe_search.cjs` 檢查 `conveyorSystem` / `ConveyorRouter` 引用。
- [x] 步驟 2：抽離 `SpatialHashGrid` 與物流幾何工具，降低 `ConveyorSystem.js` 命中偵測職責。
- [x] 步驟 3：抽離物流建造 Undo store，讓建造流程不混入 snapshot 細節。
- [x] 步驟 4：抽離 `LogisticsLineStore` 與 routing grid builder，集中 state 存取與路由格建立。
- [x] 步驟 4.5：抽離 `LogisticsSegmentBuilder`，集中 snap、物流線 ID、路徑展開與 segment 建立。
- [x] 步驟 4.6：抽離 `LogisticsPortUtils` 與 `LogisticsLineBuildContext`，集中 `upsertLogisticsLine` 的 port clone 與建造上下文正規化。
- [x] 步驟 4.7：抽離 `LogisticsLinePlacement`，集中 `upsertLogisticsLine` 的 occupied map、同路由去重、同向重疊合併與 additions 建立。
- [x] 步驟 4.8：抽離 `LogisticsLineMetadata`，集中 `splitSequenceOrder`、同群組 metadata 同步與 connection 回寫。
- [x] 步驟 4.9：抽離 `LogisticsLineMergeCoordinator`，集中 overlap group merge、blocked overlap 與 affected group 暫存範圍。
- [x] 步驟 4.10：抽離 `LogisticsLineFinalizer`，集中建造後排序、端點重算、spatial hash 重建、transfer 更新與回傳線段選擇。
- [x] 步驟 4.11：抽離 `LogisticsLineQuery`，集中物流線 route clone、節點取樣、點在線上判斷與有向 cell 查詢。
- [x] 步驟 4.12：抽離 `LogisticsLineHitTester`，集中物流線 spatial grid 命中偵測與可點擊矩形排序。
- [x] 步驟 4.13：抽離 `LogisticsSourcePortQuery`，集中 source-port connection、port cell info、port cell hit 與 source-port hit 查詢。
- [x] 步驟 4.14：抽離 `LogisticsGroupConnectivity`，集中物流群組 endpoint/cell 接觸判定。
- [x] 步驟 4.15：擴充 `LogisticsLineMergeCoordinator`，集中連通群組掃描與 `mergeConnectedLogisticsGroups` 委派。
- [x] 步驟 4.16：擴充 `LogisticsLineMergeCoordinator`，集中 `mergeLogisticsLineGroups` 的群組 metadata 合併、排序與端點重算。
- [x] 步驟 4.17：擴充 `LogisticsLineMergeCoordinator`，集中 deleted-gap continuation 關係判定與重接。
- [x] 步驟 4.18：抽離 `LogisticsLineOrdering`，集中物流線段方向排序、prev/next 指標與 splitSequenceOrder 重整。
- [x] 步驟 4.19：完成步驟 4 收斂盤點；剩餘大型方法歸入步驟 5 的拖曳、建造、群組拓撲與 transfer 更新，不在本階段再拆。
- [ ] 步驟 5：保留 facade API，逐步委派拖曳、建造、群組拓撲與 transfer 更新到子模組。
- [x] 步驟 5.1：抽離 `LogisticsTransferQueues`，集中阻塞 transfer queue 排序、回壓與 broken-line breakpoint 限制。
- [x] 步驟 5.2：抽離 `LogisticsMergeNodeRuntime`，集中 merge-node transfer 切換與 output route 接續。
- [x] 步驟 5.3：抽離 `LogisticsTransferRerouter`，集中 active transfer 在物流線變更後的重路由與 progress 投影。
- [ ] 步驟 6：執行語法檢查與 `npm run finalize`，回報 Debug 渲染耗時與 Draw Calls 可用性。

### 步驟 5 子任務總覽（共 12 項）
| 子任務 | 狀態 | 預計/已建立檔案 | 用途 | 主要改善方法 | ConveyorSystem 保留 facade 方法 |
| --- | --- | --- | --- | --- | --- |
| 5.1 | 已完成 | `src/systems/logistics/LogisticsTransferQueues.js` | 集中 transfer queue、回壓與 broken-line breakpoint 限制 | 移出排序、距離換算與 queueBlocked 寫回，降低 `ConveyorSystem` 每幀運輸細節 | `applyBlockedTransferQueues` |
| 5.2 | 已完成 | `src/systems/logistics/LogisticsMergeNodeRuntime.js` | 集中 merge-node input transfer 到 output route 的切換 | 移出 progress 門檻、output route 接續、transfer metadata 重設 | `applyLogisticsMergeNodes` |
| 5.3 | 已完成 | `src/systems/logistics/LogisticsTransferRerouter.js` | 集中物流線變更後 active transfer 重路由 | 移出候選線段 bucket、最短連通路徑、progress 投影與 transfer 清理 | `updateActiveTransfersOnLogisticsChange` |
| 5.4 | 待做 | `src/systems/logistics/LogisticsDragSession.js` | 集中拖曳生命週期與 bendMode 狀態 | 將 `activeDrag` 建立、更新、取消、目標解析與手動/自動 bendMode 規則封裝；不改 Router SSOT | `startDrag`、`updateDrag`、`updateDragNow`、`toggleBendMode`、`resolveDragTarget`、`cancelDrag` |
| 5.5 | 待做 | `src/systems/logistics/LogisticsDragSubmission.js` | 集中拖曳提交與建造交易 | 將 `submitDrag` 拆為驗證、成本扣除、物流線 upsert、undo snapshot、target/source 回寫；保留一次性提交語意 | `submitDrag`、`buildSingleSegmentAt` |
| 5.6 | 待做 | `src/systems/logistics/LogisticsPathAdapters.js` | 集中端口 anchor、port-safe path 與正交路徑輔助 | 將路徑前後處理從建造流程剝離，仍委派 `ConveyorRouter` 做 footprint/occupancy 判定 | `getPortAnchorGrid`、`buildPortSafePath`、`dedupeExtensionStart`、`buildOrthogonalRoute` |
| 5.7 | 待做 | `src/systems/logistics/LogisticsExtensionCoordinator.js` | 集中物流線延伸、轉角箭頭 override 與中段分支拆分 | 封裝 extension sourceLine、turnArrowOverride 同步、split 前後段 metadata 重建，避免 extension 規則散落 | `applyExtensionTurnArrowOverride`、`splitSourceGroupForMiddleExtension` |
| 5.8 | 待做 | `src/systems/logistics/LogisticsMergeNodeStore.js` | 集中 merge-node 註冊、查詢與 deleted-gap input 重指派 | 將 merge-node store mutation 與 intact 檢查相關查詢收斂；runtime 只負責執行 transfer 切換 | `registerLogisticsMergeNode`、`reassignDeletedGapContinuationToMergeInput`、`getLogisticsMergeNodeOutputRoute`、`getLogisticsMergeNodeForInputTransfer`、`isLogisticsMergeInputTransfer` |
| 5.9 | 待做 | `src/systems/logistics/LogisticsTopologyQuery.js` | 集中 physical/display group graph 與 merge-component 查詢 | 將群組連通、merge-component、display connected group 的圖查詢統一，避免同類 BFS/Set 操作重複 | `areLogisticsGroupsLinkedByMergeNode`、`areLogisticsGroupsInSameMergeComponent`、`getLogisticsGroupsConnectedThroughMergeNodes`、`getLogisticsPhysicalGroupGraph`、`getLogisticsPhysicalGroupComponents`、`findLogisticsPhysicalGroupPath`、`getLogisticsPortConnectedPhysicalGroupIds`、`getLogisticsDisplayConnectedGroupIds` |
| 5.10 | 待做 | `src/systems/logistics/LogisticsDeletionService.js` | 集中刪除單線與刪除群組流程 | 將 merge lock、deleted-gap marker、turnArrowOverride cleanup、merge-node cleanup、transfer reroute 串成單一刪除交易 | `deleteLogisticsLineById`、`deleteLogisticsLineGroupById`、`cleanupDeletedLinePreviousTurnOverride`、`cleanupLogisticsMergeNodesForDeletedLine` |
| 5.11 | 待做 | `src/systems/logistics/LogisticsEndpointResolver.js` | 集中端點、建築連線與 group route 查詢 | 將 source/target building port 對齊、connection route 與 endpoint 重算收斂，減少 UIManager 查詢散落 | `recalculateLogisticsGroupEndpoints`、`getLogisticsTargetBuildingAt`、`getConnectionRoute`、`getConnectionTransferRoute`、`getLogisticsGroupRoutePoints`、`buildLogisticsGraphRoutePoints` |
| 5.12 | 待做 | `src/systems/logistics/LogisticsConfigCostAdapter.js` | 集中物流線 config、尺寸與成本判定 | 將 UI_CONFIG/GameEngine config 讀取集中，移除重複數值換算，方便後續參數化 | `getAlignmentUnit`、`getGridUnitSize`、`getRouteScale`、`getTransportLineConfig`、`getTransportLineCost`、`canAffordTransportLine` |

# ConveyorSystem 核心重構計畫 (四階段方案)

## 核心目標與實施步驟
- [ ] **第一階段：消除非確定性邏輯 (Deterministic State)**
  - 移除 mergeLock 的 ticks 與 setTimeout，改用 `isProcessingMerge` 旗標與 `try...finally` 區塊，阻斷刪除期間的所有合併。
- [ ] **第二階段：資料結構升級 (Doubly Linked List)**
  - 為 `LogisticsSegment` 新增 `prevId` 與 `nextId`。
  - 在增加、刪除、合併線段時，直接修改節點指標。
  - 重構 `orderLogisticsSegmentsByDirection`，直接遍歷指標鏈。
- [ ] **第三階段：效能優化 (Spatial Partitioning)**
  - 實作 64x64 大小的 `SpatialHashGrid`。
  - 在線段變更時註冊到 Hash Grid。
  - 重構 `getLogisticsLinesAt`，僅查詢鄰近 9 格。
- [ ] **第四階段：數值精度強制 (Numerical Precision)**
  - 定義全域 `GRID_SIZE = 10` 常數。
  - 強制 `toGrid` 使用 `Math.floor(value / GRID_SIZE)` 映射。
  - 網格點比對一律改為精確的 `a.x === b.x && a.y === b.y` 比較。

# MVC 領域驅動重構模式 (DDD Refactoring Mode) 物流拓樸搬移計畫

## 核心目標
1. 將原本位於 `ui.js` 的 27 個底層物流狀態與拓樸計算方法，完整搬移至 `ConveyorSystem.js`。
2. 將這些靜態方法 (Static Methods) 改寫為 `ConveyorSystem` 的實例方法 (Instance Methods)，移除 `static` 關鍵字。
3. 修正搬移方法內部的 UI 輔助方法呼叫，如 `this.getBuildingPortSlots` 或 `this.getNearestPortSlot` 等替換為 `window.UIManager.getBuildingPortSlots` / `window.UIManager.getNearestPortSlot`。
4. 修補 `ConveyorSystem.js` 內部的自我呼叫：將 `window.UIManager.[被搬移方法]` 改為 `this.[被搬移方法]`。
5. 修補外部調用斷點：全專案搜尋並替換所有 `window.UIManager.[被搬移的方法]` 或 `UIManager.[被搬移的方法]` 為 `conveyorSystem.[被搬移的方法]`。
6. 驗證並測試，執行 `npm run finalize` 完成收尾。

## 實施步驟
- [x] 步驟 1：更新 `PLAN.md` 並規劃。
- [x] 步驟 2：從 `ui.js` 剪下 27 個物流拓樸與狀態管理方法，將其貼入 `ConveyorSystem.js` 並改為實例方法。
- [x] 步驟 3：修正 `ConveyorSystem.js` 中對 these 搬移方法的內部呼叫，將原本的 `window.UIManager` 或 `UIManager` 或 `this.getNearestPortSlot` 等正確替換（自己呼叫自己用 `this.xxx`，呼叫剩餘 UI 方法用 `window.UIManager.xxx`）。
- [x] 步驟 4：從 `ui.js` 移除這些方法，保留未搬移的輔助方法 (如 `getBuildingPortSlots`, `getNearestPortSlot` 等)。
- [x] 步驟 5：使用安全搜尋工具全域尋找 `window.UIManager.xxx` 和 `UIManager.xxx` (其中 `xxx` 是被搬移的方法名稱)，在各個系統與渲染器中將其替換成對 `conveyorSystem` 的呼叫，並確保對 `conveyorSystem` 的正確導入。
- [x] 步驟 6：執行系統驗證與 `npm run finalize`。

# 2026-05-15 transport line build-system update

- [x] Parse new buildings.csv fields: ui_location and efficiency.
- [x] Route ui_location=1 entries into the building panel and ui_location=2 entries into the bottom shortcut bar.
- [x] Attach building-table transport line config to logistics segments: lineType, efficiency, and build cost.
- [x] Drive transfer progress from transport line efficiency in tiles per second.
- [x] Add basic transport_line building preview/rendering support.
- [x] Shortcut transport-line placement now creates the original logistics segment objects directly instead of map building entities.
- [x] Preserve zero build time from CSV so transport_line rows can represent instant/no-worker construction.
- [x] Single-click transport-line placement now creates the same logistics_segment object/render path as drag placement.
- [x] Disable single-cell transport-line placement; transport lines now require at least two dragged segments.
- [x] Show the remaining transport_line resource count on the bottom shortcut bar and refresh it after spending.
- [x] Reorder selected merged transport-line numbering from the source building output port after connecting to prebuilt lines.
- [x] Redefine transport-line merging so groups connect only when at least one grid cell overlaps with the same travel direction.
- [x] Allow same-direction overlap attempts to merge with occupied prebuilt logistics lines without placing duplicate overlap segments.
- [x] Block transport-line group merging whenever an opposite-direction overlap exists, even if another cell in the group overlaps in the same direction.
- [x] Route drag-end target-line merging through the same overlap/direction validation instead of merging touched lines unconditionally.

# 建築升級系統改造計畫

## 核心目標
1.  **限制升級權限**：僅「城鎮中心」(type2='core') 可啟動升級。
2.  **自動全域升級**：當城鎮中心升級完成時，所有地圖上的建築自動提升至相同等級。
3.  **資源消耗規則**：僅城鎮中心升級時消耗資源，其它建築自動升級不消耗資源。
4.  **UI 精簡**：除了城鎮中心外，移除其它建築界面中的升級按鈕及相關資訊。

## 實施步驟

### 1. 修改 BuildingSystem.js (邏輯層)
-   **`startUpgrade` 函式**：
    -   增加判斷：若建築 `type2 !== 'core'`，禁止啟動升級。
    -   確保只有核心建築能扣除資源並進入 `isUpgrading` 狀態。
-   **`updateBuildingsLogic` 函式**：
    -   當 `isUpgrading` 完成（進度達 1.0）且建築為 `type2 === 'core'` 時：
        -   除了更新自身的等級 (`lv`)，增加一個迴圈。
        -   遍歷 `state.mapEntities` 中所有的建築。
        -   將所有建築的 `lv` 設為核心建築的新等級。
        -   呼叫 `engine.getBuildingConfig` 更新每個建築的 `name` 與 `model`（確保外觀隨等級改變）。

### 2. 修改 ui.js (表現層)
-   **`showContextMenu` 函式**：
    -   在渲染 `rightHeader`（升級資訊區）前增加判斷。
    -   僅當 `entity.type2 === 'core'` 時才生成升級資訊與按鈕的 HTML。
    -   若非核心建築，則不顯示升級框。

### 3. 自動化驗證
-   確認城鎮中心升級後，其它建築（如伐木場、農田等）是否同步變更等級與外觀。
-   確認非核心建築的選單中已無升級按鈕。
-   執行 `npm run finalize` 完成收尾。

## 預期結果
-   玩家只需專注於升級城鎮中心。
-   整個領地的技術水平隨城鎮中心同步提升。
-   介面更加簡潔，避免不必要的資源檢查與點擊。

# 自動化物流渲染與建築建造癱瘓修復計畫

## 核心目標
1.  **修復 WorkerSystem.js 建造指派邏輯**：重啟工人驅動的建築任務，修復 `CONSTRUCTING` 狀態與 `assignNextConstructionTask` 的觸發。
2.  **避免建築派駐阻礙新建項目**：確保已被指派的專屬建築工人不會阻止或妨礙新建築的落實。
3.  **驗證 processAutomatedLogistics 邏輯**：在 `LogisticsRenderer.js` 的座標轉換修正後，確保物流處理流程正確無誤。
4.  **確保物流資源圖示平滑輸送**：資源箱必須平滑地在功能性建築的 Port 之間沿著輸送帶運行，且不阻礙遊戲主更新循環。
5.  **全系統死鎖與連動測試**：確保建造任務與自動物流線能同時進行，沒有任何死鎖。

## 實施步驟
1.  **修改 WorkerSystem.js 建造與指派邏輯**：
    -   在 `assignNextConstructionTask` 中，若視覺半徑內無建造任務，則 fallback 至全專案地圖的建造任務，打破「距離過遠不建造」的限制。
    -   在 `updateWorkerAssignments` 定時器更新中，將所有剩餘無所事事的 IDLE 村民自動拉取分配至下一個建造任務 (優先) 或下一個生產任務，防止工人保持永久 IDLE。
2.  **確保派駐工人不影響新建築落實**：
    -   只有未被指定專屬建築（如生產工廠）的閒置村民 (`!v.assignedWarehouseId`) 會參與自動建造指派。
    -   已手動指派的工人會被正確保留在建築中，新任務不會強行破壞既有的物流/生產工廠職位。
3.  **驗證物流系統與資源輸送**：
    -   檢查 `createActiveTransfer` 與 `processAutomatedLogistics`，確保 `activeTransfers` 的 `progress` 更新與 speed/distance 計算完全吻合。
    -   確認動態物品能在 Phaser 的 `graphics` 繪製下穩定跟隨多段 pathpoints 移動，不與主 update 循環產生衝突或掉幀。
4.  **系統測試與 finalize 收尾**：
    -   進行自動化系統測試。
    -   執行 `npm run finalize` 完成最終代碼洗滌與檢驗。

# 傳送帶轉角抖動與堆積問題修復計畫
- [ ] **任務 A：轉角識別 (Corner Flagging)**
  - 在 `ConveyorSystem.js` 中的 `buildLogisticsSegments` 和 `orderLogisticsSegmentsByDirection` 函數中，為 Segment 新增 `isCorner: boolean` 屬性。
- [ ] **任務 B：優化隊列阻塞邏輯 (Queue Tolerance)**
  - 修改 `applyBlockedTransferQueues` 函數，引入 `TS * 0.5` 的距離容差，避免微小誤差導致的轉角堆積。
- [x] **任務 C：視覺插值修正 (Visual Interpolation)**
  - 在 `ConveyorSystem.js` 的 `getPointOnPath` 以及 `logistics_renderer.js` 的 `LogisticsRenderer.getPointOnTransferPath` 中實作二次貝茲曲線插值，平滑轉彎視覺效果。（已依用戶要求移除了貝茲平滑，還原回 90 度切角轉彎）
- [x] **任務 D：編寫驗證腳本與自動化測試**
  - 建立 `scratch/verify_conveyor_corner_flow.js`，對上述邏輯進行單元與集成測試。
  - 執行 `npm run finalize` 完成最終代碼收尾。

## 核心目標與實施步驟
- [ ] **第一階段：消除非確定性邏輯 (Deterministic State)**
  - 移除 mergeLock 的 ticks 與 setTimeout，改用 `isProcessingMerge` 旗標與 `try...finally` 區塊，阻斷刪除期間的所有合併。
- [ ] **第二階段：資料結構升級 (Doubly Linked List)**
  - 為 `LogisticsSegment` 新增 `prevId` 與 `nextId`。
  - 在增加、刪除、合併線段時，直接修改節點指標。
  - 重構 `orderLogisticsSegmentsByDirection`，直接遍歷指標鏈。
- [ ] **第三階段：效能優化 (Spatial Partitioning)**
  - 實作 64x64 大小的 `SpatialHashGrid`。
  - 在線段變更時註冊到 Hash Grid。
  - 重構 `getLogisticsLinesAt`，僅查詢鄰近 9 格。
- [ ] **第四階段：數值精度強制 (Numerical Precision)**
  - 定義全域 `GRID_SIZE = 10` 常數。
  - 強制 `toGrid` 使用 `Math.floor(value / GRID_SIZE)` 映射。
  - 網格點比對一律改為精確的 `a.x === b.x && a.y === b.y` 比較。

# MVC 領域驅動重構模式 (DDD Refactoring Mode) 物流拓樸搬移計畫

## 核心目標
1. 將原本位於 `ui.js` 的 27 個底層物流狀態與拓樸計算方法，完整搬移至 `ConveyorSystem.js`。
2. 將這些靜態方法 (Static Methods) 改寫為 `ConveyorSystem` 的實例方法 (Instance Methods)，移除 `static` 關鍵字。
3. 修正搬移方法內部的 UI 輔助方法呼叫，如 `this.getBuildingPortSlots` 或 `this.getNearestPortSlot` 等替換為 `window.UIManager.getBuildingPortSlots` / `window.UIManager.getNearestPortSlot`。
4. 修補 `ConveyorSystem.js` 內部的自我呼叫：將 `window.UIManager.[被搬移方法]` 改為 `this.[被搬移方法]`。
5. 修補外部調用斷點：全專案搜尋並替換所有 `window.UIManager.[被搬移的方法]` 或 `UIManager.[被搬移的方法]` 為 `conveyorSystem.[被搬移的方法]`。
6. 驗證並測試，執行 `npm run finalize` 完成收尾。

## 實施步驟
- [x] 步驟 1：更新 `PLAN.md` 並規劃。
- [x] 步驟 2：從 `ui.js` 剪下 27 個物流拓樸與狀態管理方法，將其貼入 `ConveyorSystem.js` 並改為實例方法。
- [x] 步驟 3：修正 `ConveyorSystem.js` 中對 these 搬移方法的內部呼叫，將原本的 `window.UIManager` 或 `UIManager` 或 `this.getNearestPortSlot` 等正確替換（自己呼叫自己用 `this.xxx`，呼叫剩餘 UI 方法用 `window.UIManager.xxx`）。
- [x] 步驟 4：從 `ui.js` 移除這些方法，保留未搬移的輔助方法 (如 `getBuildingPortSlots`, `getNearestPortSlot` 等)。
- [x] 步驟 5：使用安全搜尋工具全域尋找 `window.UIManager.xxx` 和 `UIManager.xxx` (其中 `xxx` 是被搬移的方法名稱)，在各個系統與渲染器中將其替換成對 `conveyorSystem` 的呼叫，並確保對 `conveyorSystem` 的正確導入。
- [x] 步驟 6：執行系統驗證與 `npm run finalize`。

# 2026-05-15 transport line build-system update

- [x] Parse new buildings.csv fields: ui_location and efficiency.
- [x] Route ui_location=1 entries into the building panel and ui_location=2 entries into the bottom shortcut bar.
- [x] Attach building-table transport line config to logistics segments: lineType, efficiency, and build cost.
- [x] Drive transfer progress from transport line efficiency in tiles per second.
- [x] Add basic transport_line building preview/rendering support.
- [x] Shortcut transport-line placement now creates the original logistics segment objects directly instead of map building entities.
- [x] Preserve zero build time from CSV so transport_line rows can represent instant/no-worker construction.
- [x] Single-click transport-line placement now creates the same logistics_segment object/render path as drag placement.
- [x] Disable single-cell transport-line placement; transport lines now require at least two dragged segments.
- [x] Show the remaining transport_line resource count on the bottom shortcut bar and refresh it after spending.
- [x] Reorder selected merged transport-line numbering from the source building output port after connecting to prebuilt lines.
- [x] Redefine transport-line merging so groups connect only when at least one grid cell overlaps with the same travel direction.
- [x] Allow same-direction overlap attempts to merge with occupied prebuilt logistics lines without placing duplicate overlap segments.
- [x] Block transport-line group merging whenever an opposite-direction overlap exists, even if another cell in the group overlaps in the same direction.
- [x] Route drag-end target-line merging through the same overlap/direction validation instead of merging touched lines unconditionally.

# 建築升級系統改造計畫

## 核心目標
1.  **限制升級權限**：僅「城鎮中心」(type2='core') 可啟動升級。
2.  **自動全域升級**：當城鎮中心升級完成時，所有地圖上的建築自動提升至相同等級。
3.  **資源消耗規則**：僅城鎮中心升級時消耗資源，其它建築自動升級不消耗資源。
4.  **UI 精簡**：除了城鎮中心外，移除其它建築界面中的升級按鈕及相關資訊。

## 實施步驟

### 1. 修改 BuildingSystem.js (邏輯層)
-   **`startUpgrade` 函式**：
    -   增加判斷：若建築 `type2 !== 'core'`，禁止啟動升級。
    -   確保只有核心建築能扣除資源並進入 `isUpgrading` 狀態。
-   **`updateBuildingsLogic` 函式**：
    -   當 `isUpgrading` 完成（進度達 1.0）且建築為 `type2 === 'core'` 時：
        -   除了更新自身的等級 (`lv`)，增加一個迴圈。
        -   遍歷 `state.mapEntities` 中所有的建築。
        -   將所有建築的 `lv` 設為核心建築的新等級。
        -   呼叫 `engine.getBuildingConfig` 更新每個建築的 `name` 與 `model`（確保外觀隨等級改變）。

### 2. 修改 ui.js (表現層)
-   **`showContextMenu` 函式**：
    -   在渲染 `rightHeader`（升級資訊區）前增加判斷。
    -   僅當 `entity.type2 === 'core'` 時才生成升級資訊與按鈕的 HTML。
    -   若非核心建築，則不顯示升級框。

### 3. 自動化驗證
-   確認城鎮中心升級後，其它建築（如伐木場、農田等）是否同步變更等級與外觀。
-   確認非核心建築的選單中已無升級按鈕。
-   執行 `npm run finalize` 完成收尾。

## 預期結果
-   玩家只需專注於升級城鎮中心。
-   整個領地的技術水平隨城鎮中心同步提升。
-   介面更加簡潔，避免不必要的資源檢查與點擊。

# 自動化物流渲染與建築建造癱瘓修復計畫

## 核心目標
1.  **修復 WorkerSystem.js 建造指派邏輯**：重啟工人驅動的建築任務，修復 `CONSTRUCTING` 狀態與 `assignNextConstructionTask` 的觸發。
2.  **避免建築派駐阻礙新建項目**：確保已被指派的專屬建築工人不會阻止或妨礙新建築的落實。
3.  **驗證 processAutomatedLogistics 邏輯**：在 `LogisticsRenderer.js` 的座標轉換修正後，確保物流處理流程正確無誤。
4.  **確保物流資源圖示平滑輸送**：資源箱必須平滑地在功能性建築的 Port 之間沿著輸送帶運行，且不阻礙遊戲主更新循環。
5.  **全系統死鎖與連動測試**：確保建造任務與自動物流線能同時進行，沒有任何死鎖。

## 實施步驟
1.  **修改 WorkerSystem.js 建造與指派邏輯**：
    -   在 `assignNextConstructionTask` 中，若視覺半徑內無建造任務，則 fallback 至全專案地圖的建造任務，打破「距離過遠不建造」的限制。
    -   在 `updateWorkerAssignments` 定時器更新中，將所有剩餘無所事事的 IDLE 村民自動拉取分配至下一個建造任務 (優先) 或下一個生產任務，防止工人保持永久 IDLE。
2.  **確保派駐工人不影響新建築落實**：
    -   只有未被指定專屬建築（如生產工廠）的閒置村民 (`!v.assignedWarehouseId`) 會參與自動建造指派。
    -   已手動指派的工人會被正確保留在建築中，新任務不會強行破壞既有的物流/生產工廠職位。
3.  **驗證物流系統與資源輸送**：
    -   檢查 `createActiveTransfer` 與 `processAutomatedLogistics`，確保 `activeTransfers` 的 `progress` 更新與 speed/distance 計算完全吻合。
    -   確認動態物品能在 Phaser 的 `graphics` 繪製下穩定跟隨多段 pathpoints 移動，不與主 update 循環產生衝突或掉幀。
4.  **系統測試與 finalize 收尾**：
    -   進行自動化系統測試。
    -   執行 `npm run finalize` 完成最終代碼洗滌與檢驗。

# 傳送帶轉角抖動與堆積問題修復計畫
- [ ] **任務 A：轉角識別 (Corner Flagging)**
  - 在 `ConveyorSystem.js` 中的 `buildLogisticsSegments` 和 `orderLogisticsSegmentsByDirection` 函數中，為 Segment 新增 `isCorner: boolean` 屬性。
- [ ] **任務 B：優化隊列阻塞邏輯 (Queue Tolerance)**
  - 修改 `applyBlockedTransferQueues` 函數，引入 `TS * 0.5` 的距離容差，避免微小誤差導致的轉角堆積。
- [x] **任務 C：視覺插值修正 (Visual Interpolation)**
  - 在 `ConveyorSystem.js` 的 `getPointOnPath` 以及 `logistics_renderer.js` 的 `LogisticsRenderer.getPointOnTransferPath` 中實作二次貝茲曲線插值，平滑轉彎視覺效果。（已依用戶要求移除了貝茲平滑，還原回 90 度切角轉彎）
- [x] **任務 D：編寫驗證腳本與自動化測試**
  - 建立 `scratch/verify_conveyor_corner_flow.js`，對上述邏輯進行單元與集成測試。
  - 執行 `npm run finalize` 完成最終代碼收尾。

# 傳送帶轉角合併偏移與重疊修復計畫 (續)
- [ ] **任務 E：建造/延伸/合併時同步更新在途物品軌跡**
  - 在 `ConveyorSystem.js` 的 `upsertLogisticsLine` 結束前調用 `updateActiveTransfersOnLogisticsChange`，保證所有在途物品路徑隨結構變更即時重新計算，獲取最新的完整起終點 Port，使 `pathKey` 對齊，解決重疊。
- [ ] **任務 F：在途物品重組路徑的方向對齊與去重**
  - 在 `updateActiveTransfersOnLogisticsChange` 中，對最短路徑進行方向對齊（利用 `sourceAnchor` 或舊軌跡起點的距離檢測），必要時反轉路徑以避免反向折返，解決視覺偏離與抖動。
- [ ] **任務 G：修正 fallback 的轉角標記錯位問題**
  - 在 `updateActiveTransfersOnLogisticsChange` 中，若走 fallback 組裝路徑，修正其錯位的 `isCorner` 網格點標註，改用與 `annotateRoutePoints` 相同的方向拐向判定，確保拐彎排隊間距加成能正確施加。

# 2026-06-04 傳送帶合流物品反向與堵塞問題修復計畫

## 核心目標
1. 解決多分支物流線路合流時，非全局起點分支上的在途物品被全局端點覆寫、投影出錯以及因 `sourceEnt` 錯亂導致被反向 reverse 的 Bug。
2. 透過為每個物流群組（Group）建立有向圖拓撲結構，動態為每個在途物品定位其分支專屬的 `startPt`（起點）與 `endPt`（終點）。
3. 根據專屬起終點尋找真正鄰近的建築物以計算 `sourceAnchor` 和 `targetAnchor`，確保最短路徑方向正確。

## 實施步驟
- [ ] 步驟 1：建立 implementation_plan.md 與 task.md。
- [ ] 步驟 2：修改 `LogisticsTransferRerouter.js`，實作物流群組有向圖拓撲分析、分支專屬起終點尋路、與鄰近真實建築物端口錨定。
- [ ] 步驟 3：使用 `node scratch/test_confluence_stuck.js` 與 `node scratch/verify_conveyor_corner_flow.js` 進行自測。
- [ ] 步驟 4：執行 `npm run finalize` 完成最終代碼收尾。

# 2026-06-04 實裝有向圖尋路以徹底解決合流物品逆流

## 核心目標
1. 在 `LogisticsTransferRerouter.js` 中實作有向尋路 `findDirectedShortestPath`。
2. 預設使用有向尋路重置在途物品軌跡，從根本上避免方向反轉判定誤判造成的逆流 Bug。

## 實施步驟
- [ ] 步驟 1：修改 `LogisticsTransferRerouter.js` 實作有向尋路。
- [ ] 步驟 2：進行語法檢查與自測驗證。
- [ ] 步驟 3：執行 `node scripts/finalize.js` 進行收尾驗證。
