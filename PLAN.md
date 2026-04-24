# 加工廠工人進度條渲染層級優化計畫

## 1. 問題分析
- **現狀**：加工廠的「工人派駐進度條」（WorkerOccupancy Lights）目前繪製在全域的 `hudGraphics` 上，其 `depth` 設定為 `2,500,000`。
- **衝突**：工人（村民）單位的 `depth` 為 `500,000 + y`。由於 `2,500,000` 遠大於單位層級，進度條會遮擋住工人（如用戶截圖所示，擋住了工人的臉部）。
- **需求**：進度條應該在工人後面，但仍在建築前面。

## 2. 解決方案
- **層級重構**：將工人進度條從全域置頂的 `hudGraphics` 移出，改為與建築實體綁定的動態渲染物件。
- **深度排序**：進度條的 `depth` 應設定為 `500,000 + ent.y + 0.5`。
  - 這樣它會高於建築（`500,000 + ent.y`）。
  - 若工人站在建築前方（`worker.y > ent.y`），則工人的深度 `500,000 + worker.y` 會高於進度條，實現「在工人後面」的效果。
- **效能考量**：
  - 採用「每實體獨立 Graphics」模式：僅針對可見的加工廠實體建立一個 Graphics 物件，並將其深度與實體 Y 軸綁定。

## 3. 執行步驟
1. **修改 `src/ui/ui_config.js`**：
   - 確認 `WorkerOccupancy` 的參數，特別是 `offsetY` 是否需要配合新的渲染方式進行微調。
2. **修改 `src/scenes/MainScene.js`**：
   - 在 `updateEntities` 中，為加工廠實體管理一個專屬的 `occupancyGraphics` 物件。
   - 在 `updateDynamicHUD` 中，移除對全域 `hudGraphics` 的 `drawWorkerLights` 呼叫。
   - 將渲染邏輯移至 `updateEntities` 的循環中，或建立專屬的 `updateEntityOccupancy` 方法。
   - 確保深度設定為 `500,000 + ent.y + 0.5`。
3. **驗證與測試**：
   - 啟動遊戲並指派工人進入加工廠。
   - 檢查工人穿過進度條時的視覺遮擋關係。
   - 確保標籤（名稱、等級）仍維持在最頂層。
