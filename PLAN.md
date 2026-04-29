# 修復物流線端口朝上碰撞判定異常計畫

## 問題分析
- **現狀**：當建築端口朝上時，拉出的物流線在建築邊緣被標記為不合法（紅色），但端口朝左時正常（綠色）。
- **預期**：所有方向的端口拉出物流線時，在緊貼建築邊緣的位置應視為合法，不應觸發碰撞。
- **潛在原因**：
    1. `ConveyorRouter` 或 `ConveyorSystem` 中的碰撞邊界計算存在偏移（Offset）。
    2. 端口（Port）的「安全區域」或「免碰撞判定」邏輯在垂直方向（UP/DOWN）與水平方向（LEFT/RIGHT）不對稱。
    3. `isValidNode` 或 `validateRouteFootprint` 中的邊界檢查邏輯對於 Y 軸的判定過於嚴格。

## 執行步驟
1. [x] **分析程式碼**：
    - 檢查 `src/systems/ConveyorSystem.js` 中的 `updateDragNow` 邏輯，特別是碰撞免除（Collision Exemption）的部分。
    - 檢查 `src/systems/ConveyorRouter.js` 中的 `isValidNode` 和 `getLogisticsCellRects`。
2. [x] **定位錯誤**：
    - 發現 `getWidthOffsets` 被寫死為 `[-1, 0]`，在 1.0 網格系統中會導致不必要的雙倍佔用。
    - 發現 `isPointInsideEntity` 在垂直方向對頂部邊緣判定不友善（座標未考慮 `feetOffset` 且為開區間）。
3. [x] **修復與驗證**：
    - 修正 `ConveyorRouter.getWidthOffsets` 使其支援動態縮放判定。
    - 在 `ConveyorSystem.updateDragNow` 中實裝「安全氣泡 (Safe Bubble)」機制。
    - 執行自動化測試驗證。
4. [ ] **收尾**：
    - 執行 `npm run finalize`。

## 定義完成 (DoD)
- [x] 端口朝上時，物流線可緊貼建築邊緣拉出且顯示為綠色。
- [x] 不影響現有的端口朝左/朝右/朝下的正常功能。
- [ ] 通過 `npm run finalize` 驗證。
