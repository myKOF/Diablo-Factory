# 導入腳本功能實作計劃

## 2026-07-02 錄製腳本日誌選單改造

### 1. 核心目標
- 按下「錄製腳本」時不立刻開始錄製，改為先開啟錄製專用日誌選單。
- 使用者勾選要附帶錄製的日誌分類後，按「確定」才開始錄製。
- 錄製期間保留原本事件錄製，同時只把勾選分類的 `GameEngine.addLog` 內容寫入匯出腳本。
- 停止錄製與存檔流程維持原本行為。

### 2. 實作策略
- 在 `ScriptRecorder` 內新增錄製專用日誌分類狀態，避免依賴日誌面板目前的篩選器。
- 在 `UIManager` 中新增錄製日誌選單建立、顯示、取消、確認流程，並讓按鈕與 Alt+R 共用同一入口。
- 共用既有日誌分類名稱，確保錄製選單與日誌面板分類一致。

### 3. 驗證
- 新增 Playwright 規格，覆蓋「按錄製先開選單」、「確認後開始錄製」、「只錄勾選分類」。
- 完工後執行指定規格與 `npm run finalize`。

## 1. 核心目標
在遊戲左下角新增「導入腳本」按鈕，讓玩家能夠選擇本機的 Playwright 測試腳本 (`.spec.js`) 並在遊戲內直接重播。這項功能用以自動化大量重複性的測試動作（如覆蓋建築、延伸合併物流線等）。

## 2. 實作策略
- **無需後端修改**：利用 `<input type="file" accept=".js">` 讓使用者選擇本機腳本。
- **解析與執行框架 (`ScriptRunner.js`)**：
  - 在 `src/debug/` 下建立 `ScriptRunner.js`。
  - 攔截腳本中 `require('@playwright/test')` 的調用，替換為 Mock 的 `test` 和 `expect` 函式。
  - 攔截並解析腳本中與 Playwright 相關的指令 (如 `page.waitForTimeout`, `page.evaluate`)，並將其轉譯為在遊戲內部能運作的呼叫（例如使用 `setTimeout` 模擬等待，用 `new Function` 模擬 `evaluate`）。

## 3. UI 調整
- 於 `src/ui/ui.js` 中左下角 (`record_script_btn` 旁邊) 新增「導入腳本」按鈕。
- 點擊時觸發 `ScriptRunner.importAndRun()` 開啟檔案選擇。

## 4. 驗證
- 點擊按鈕能成功開啟檔案選擇。
- 選擇已有的測試腳本（如 `test_scripts_logical_test.spec.js`）後，遊戲能照著錄製好的流程自動建造。
- 確保腳本執行中若發生錯誤，會輸出到遊戲內的系統日誌 (`GameEngine.addLog`) 中。
