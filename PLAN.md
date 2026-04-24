# 加工廠特效修復計畫

## 問題描述
- `type2=processing_plant` 的建築在生產狀態時，煙霧特效顯示不穩定。
- 有時材料充足卻沒特效，或是停止生產後特效未消失。

## 根本原因分析
1. **邏輯判斷不夠精確**：目前的 `handleWorkingEffects` 僅檢查是否設定了配方 (`currentRecipe`)，未檢查生產系統是否真正處於「運作中」狀態 (`isCraftingActive`)。
2. **生產狀態同步**：當材料不足或工人不足時，雖然有配方，但不應有煙霧特效。

## 修復方案
1. **修改 `MainScene.js`**：
    - 在 `handleWorkingEffects` 中，將 `isWorking` 的判定邏輯從「僅檢查配方」改為「檢查配方且 `isCraftingActive` 為真」。
    - 確保 `isVisible` 與 `isWorking` 的組合能正確控制 Emitter 的 `visible` 與 `emitting` 狀態。
2. **驗證與測試**：
    - 啟動遊戲，建造加工廠。
    - 設定配方，觀察在：
        - 材料不足時（特效應消失）。
        - 材料充足但無工人時（特效應消失）。
        - 生產進行中（特效應出現且循環）。
        - 取消配方時（特效應消失）。

## 預計影響
- 僅影響視覺特效顯示邏輯。
- 不會改動生產系統的核心數據結構或邏輯。

## QA 驗證點
- [ ] 煙霧特效與生產狀態 100% 同步。
- [ ] 熔煉廠的火花特效也同步修復。
- [ ] 切換畫面（Visible/Invisible）時特效能正確回收與重啟。

## 流水線加工廠優化：階段三 - 物流搬運工 AI (當前任務)
- **目標**：賦予工廠內的工人「搬運」職責，自動將成品運往目標建築。
- **變更點**：
  - `WorkerSystem.js` 狀態機擴充：
    - [x] **階段三：物流搬運工 AI 狀態機**
    - [x] 擴展 `WorkerSystem.js` 處理 `WORKING_IN_FACTORY` 狀態。
    - [x] 實作 `TRANSPORTING_LOGISTICS`：從產出緩衝區取出成品並送往 `outputTargetId`。
    - [x] 實作 `RETURNING_TO_FACTORY`：送貨完成後自動回廠並隱身繼續工作。
    - [x] 視覺與邏輯同步：搬運時 `visible = true`，工作時 `visible = false`。，實現視覺上的進出效果。
- **驗證**：
  - 觀察工人是否從工廠帶著貨物走出。
  - 確認貨物是否正確進入下一個工廠的 `inputBuffer` 或全域倉庫。
  - 確認工人卸貨後會自動回歸原工廠。

## 物流網 2.0：多分支供應鏈與獨立過濾器 [已完成]
- [x] **ConfigManager 支援通用解析**：實作 `parseBracketArray` 並在 `loadBuildingConfig` 中解析物流權限。
- [x] **UI 互動與多連線機制**：支援拖曳建立多目標連線，實作線段點擊喚起過濾選單 (`logistics_menu`)。
- [x] **工人 AI 智慧派發**：更新 `WORKING_IN_FACTORY` 邏輯，實現基於成品類型的路徑過濾。
- [x] **渲染層陣列化繪製**：`MainScene.js` 已適配 `outputTargets` 陣列渲染，支援雙向位移視覺優化。
- [x] **全流程驗證**：已通過瀏覽器測試，確認多目標鎖定、過濾送貨與連線刪除功能完全正常。
