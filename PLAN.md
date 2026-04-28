# 物流線建造虛影修復計畫

## 問題分析
物流線（Conveyor/Logistics Line）在建造時的虛影（Ghost）消失了。經過初步分析，問題可能源於 `ConveyorSystem.js` 中的座標轉換邏輯與尋路格網（Routing Grid）不匹配。

### 核心原因
1. **座標縮放不一致**：`ConveyorSystem.toGrid` 目前使用 `GameEngine.TILE_SIZE` (20px) 進行取整，這適用於 1.0 Tile 的建築系統。但物流系統（Logistics）採用了 0.5 Tile 的細分網格（`routeScale = 2`），因此座標應該以 10px 為單位進行轉換。
2. **尋路失敗**：由於輸入尋路算法的起始點和終點座標錯誤（縮小了一倍），尋路器（Router）可能找不到路徑，導致 `conveyorGhosts` 為空，進而使渲染層無法繪製虛影。

## 執行步驟

### 1. 修正 `ConveyorSystem.js`
- 更新 `toGrid` 方法，使其根據 `alignmentUnit` (預設 0.5) 動態計算格網單位。
- 確保所有座標轉換（世界座標到格網座標）都考慮到 `routeScale`。
- 修正 `getPortAnchorGrid` 中的硬編碼縮放。

### 2. 驗證 `MainScene.js` 渲染邏輯
- 檢查 `MainScene.js` 中的 `update` 循環，確保 `logisticsGraphics` 正確處理 `state.conveyorGhosts`。
- 確認座標還原邏輯 `(point.x + offset.x * offsetScale) * gridUnit` 是否與修正後的 `toGrid` 對齊。

### 3. 熱修復 (Hotfix)
- 修正 `ConveyorSystem.js` 中的 `ReferenceError: offset is not defined`。
- 確保 `submitDrag` 方法中正確定義了 `offset` 變數。

### 4. 自動化測試與 QA
- 執行 `npm run finalize` 進行自動化驗證。
- 確保物流線拉取時虛影顯示正常，且顏色（有效/無效）正確反映建造限制。

## 定義完成 (DoD)
- 物流線拉取時，綠色/紅色的虛影正常顯示。
- 虛影位置與鼠標對齊，且符合 0.5 Tile 的網格吸附。
- `npm run finalize` 通過。
