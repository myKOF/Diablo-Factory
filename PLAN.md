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
