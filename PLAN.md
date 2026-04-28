# 修復物流線拖曳時「最後一格無法渲染」問題計畫

## 問題描述
目前物流線在空地拖曳時，游標所在的最後一格無法顯示綠色虛影。這是因為渲染邏輯為 Edge-based（N個節點渲染 N-1 個實體）。

## 解決方案
在路徑陣列末端動態延伸一個「虛擬節點 (Virtual End)」，並讓渲染器識別此節點以補足最後一格的渲染，同時在碰撞驗證中忽略該節點。

## 執行步驟
1. **修改 `src/systems/ConveyorSystem.js`**
    - 在 `updateDragNow` 函數中，於 `buildPortSafePath` 呼叫後加入路徑延伸邏輯。
    - 在 `validateGhosts` 函數中，過濾掉 `isVirtualEnd` 的節點，避免碰撞驗證失敗。
2. **修改 `src/systems/ConveyorRouter.js`**
    - 在 `processPath` 函數中，確保 `isVirtualEnd` 屬性被傳遞到結果物件中。
3. **驗證與收尾**
    - 檢查代碼語法。
    - 執行 `npm run finalize`。

## 預期結果
拖曳物流線時，游標所在的最後一格能正確顯示綠色虛影，且不會因虛擬節點導致建造非法。
