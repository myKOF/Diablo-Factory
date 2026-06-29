# 建造界面改造計劃

## 1. 修改設定檔與解析器
- **buildings.csv**: 新增 `group_index` 欄位 (格式如 `{群組類型, 順序}`)。為現有建築分配適當的群組與順序，例如核心建築群組 `{core, 1}`、資源群組 `{resource, 1}`、加工群組 `{processing, 1}` 等。
- **ConfigManager.js**: 在解析建築設定時，讀取並解析 `group_index`，並存入 `state.buildingConfigsByType` 中。

## 2. 修改 UI 設定 (ui_config.js)
- 刪除或取代舊的 `BuildingPanel` 設定。
- 新增 `BottomBuildingMenu` 設定，定義 1 級與 2 級選單的位置、高度、背景色、按鈕尺寸與顏色 (包含紅色的刪除按鈕)。

## 3. 修改 UI 渲染與互動邏輯 (ui.js)
- 移除原有的左側面板 (`building_panel`) 建立邏輯。
- 在 `renderAll()` 中，根據 `BottomBuildingMenu` 建立 1 級選單與 2 級選單容器，並置於畫面正下方 (`anchor: BOTTOM_CENTER`)。
- **1 級選單**: 
  - 動態讀取所有的 `group_index.type` 生成群組按鈕。
  - 在最右側生成紅色的「刪除」按鈕。
  - 當點擊群組按鈕時，選中該按鈕 (外框變黃色)，並展開顯示 2 級選單。
- **2 級選單**:
  - 根據當前選中的群組，讀取對應的建築列表，依照 `group_index.order` 排序並生成按鈕。
  - 點擊按鈕時觸發建造模式 (同舊有邏輯)。
- **刪除功能**:
  - 點擊「刪除」按鈕後，進入全域刪除模式 (`GameEngine.state.deleteToolActive = true`)。
  - 點擊任何建築或物流線時，彈出二次確認視窗 (`BuildingMenuUI.confirmDestroy`) 或進行物流線刪除邏輯。
