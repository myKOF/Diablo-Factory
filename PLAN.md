# 任務計畫：修復物流線 L-Shape 尋路 U-Turn Bug

## 問題描述
在拖曳物流線時，如果目標點位於出口的反方向，目前的 L-Shape 尋路會導致 180 度大迴轉並穿透起點建築物。需要加入「防呆機制 (U-Turn Prevention)」。

## 執行步驟
1. [x] 讀取 `src/systems/ConveyorRouter.js` 確認現有的 `getLShapePath` 實作。
2. [x] 依照使用者提供的邏輯，完整替換 `getLShapePath` 函數。
3. [x] 確認尋路邏輯中包含對 `startDir` 的判斷，防止第一步與出口方向相反。
4. [x] 執行語法檢查與基本驗證。
5. [x] 執行收尾協定：`npm run finalize`。

## 預期結果
- L-Shape 尋路在遇到逆向目標時，會優先選擇不穿透建築物的路徑（如果 secondary 路徑安全）。
- 修復 dx 或 dy 為 0 時遺漏起點的潛在問題。
