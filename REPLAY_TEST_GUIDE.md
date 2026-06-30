# Playwright 錄製腳本重播指南

當使用者要求重播某個錄製腳本時，請先閱讀本檔案，然後依使用者提供的檔案名稱或檔案路徑執行。

## 使用者只需要提供

使用者可以只說：

```text
請閱讀 REPLAY_TEST_GUIDE.md，執行 LogisticsLinesMerge.spec.js
```

也可以提供完整或相對路徑：

```text
請閱讀 REPLAY_TEST_GUIDE.md，執行 tests/test_scripts/LogisticsLinesMerge.spec.js
```

## Agent 執行規則

1. 以專案根目錄為工作目錄。
2. 解析使用者提供的檔案名稱或路徑。
3. 若使用者只提供檔名，優先在 `tests/` 目錄底下尋找同名檔案。
4. 測試檔建議位於 `tests/` 或其子資料夾內，並使用 `.spec.js` 或 `.test.js` 檔名。
5. 預設使用可見瀏覽器執行，讓使用者能觀察重播流程。
6. 執行完成後，必須執行 `npm.cmd run finalize`。

## 可見重播指令

將 `<SPEC_PATH>` 替換成實際測試檔路徑：

```powershell
.\node_modules\.bin\playwright.cmd test <SPEC_PATH> --project=chromium --headed --reporter=list
```

## 背景驗證指令

只有使用者明確表示不需要觀看畫面時，才使用背景驗證：

```powershell
.\node_modules\.bin\playwright.cmd test <SPEC_PATH> --project=chromium --reporter=list
```

## 注意事項

- 使用 `playwright.cmd`，不要使用 `npx` 或 `npm`，避免 PowerShell 執行原則阻擋 `.ps1`。
- `--headed` 會開啟可見瀏覽器，適合觀察重播。
- 如果找不到檔案，不要猜測多個路徑反覆執行；先回報找不到的檔名或路徑。
- 跑完後依專案規範執行：

```powershell
npm.cmd run finalize
```
