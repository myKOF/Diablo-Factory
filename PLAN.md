# 導入腳本功能實作計劃

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
