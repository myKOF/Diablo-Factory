# 物流線合流合併修正計畫

## 核心問題分析
1. 當支線合流至主線末端時，由於主線此時沒有離開合流點，無法成功註冊為 `MergeNode`。當主線被延伸時，兩者在空間上相碰且尚未建立 `MergeNode`，這會觸發 `mergeConnectedGroups` 將兩者錯誤地合併為同一個群組（Logistics Group），導致整個物流線的編號和傳輸順序混亂。
2. 為了修復此問題而引入的 `tryRegisterMergeNodeForTouchingGroups` 雖能解決 T 字合流點的合併問題，但卻未對「方向完全一致的順接（直線連接）」進行過濾。這導致直線順接的輸送帶也在中間被錯誤地註冊了 `MergeNode` 且未合併，進而使一整條直線主線被拆碎成多個 Group，物流順序和物品移動方向因此錯亂。

## 解決方案
在 `LogisticsLineMergeCoordinator` 進行 `mergeConnectedGroups` 時，對於相碰且尚未透過 `MergeNode` 連接的兩個群組：
1. 收集兩組所有線段的端點，作為潛在的合流點（接觸點）。
2. 在每個接觸點上，利用 `LogisticsMergeNodeStore` 的 `canRegisterMergeDirection` 檢查是否能註冊為 `MergeNode`。
3. **新增方向一致性檢查**：若進入方向與離開方向完全一致（代表為直線順接而非合流），則**不註冊** `MergeNode`，並回傳 `false` 讓系統將其合併。
4. 若方向不一致（代表為合流或轉角），則調用 `registerLogisticsMergeNode` 建立 `MergeNode`，並不合併這兩個群組（跳過合併）。

## 預期效果
1. 當主線延伸後，系統會自動在接觸點建立 `MergeNode`。
2. 支線和主線不會合併，維持各自獨立的群組與順序編號，符合預期合流行為。
3. 直線順接的輸送帶會如預期合併成同一個 Group，編號和物品移動方向回復正常。

## 三、點選物流線顯示物品完整移動路徑修正
### 1. 核心需求
當選取或點擊任意物流線（不論是主線還是支線）時，除了其自身的黃色數字編號（保持原樣，只標記到合流點），紅色高亮路線必須沿著下游的所有 `MergeNode` 一路延伸到最終的物品移動終點。

### 2. 解決方案
1. **下游遞迴延伸**：在 `LogisticsRenderer.getSelectedGroupDebugRoutePoints` 獲取原始選取群組的點集後，利用當前的 `MergeNode` 連接關係，若路徑終點落在某個 `MergeNode` 的輸入接口上，則透過 `getLogisticsMergeNodeOutputRoute` 取得其在下游群組的物品移動軌跡，並拼接到路徑尾端，遞迴直到無下游連接為止。
2. **高亮白名單擴充**：渲染紅線與紅點的 `drawRoutePointsDebug` 原先只允許在選取群組內的格點繪製。我們修改為使用包含延伸後完整路徑所有格點的 Set（`extendedAllowedCellKeys`），使高亮紅線能穿過合流點一直畫到終點。
3. **黃色數字編號限制**：在 `renderDebugRouteNumberSprites` 中依然限制使用原群組格點白名單，確保編號僅在當前群組內顯示，不會溢出到下游。

### 3. 雙端首尾自適應拼接與延伸
由於前端的 `buildSelectedGroupDebugGraphRoutes` 生成的線段路徑方向可能受鋪設順序或起迄點設定影響，導致紅線在幾何上的 `lastPt` 剛好為起點而非終點，進而無法以單純的 `lastPt` 匹配到 `MergeNode`。
我們修改為同時檢索路徑的 `firstPt`（起點）與 `lastPt`（終點），並在對接下一級物流路徑 `nextRoute` 時進行幾何方向判斷，實現首尾自適應拼接：
- **正向匹配**（終點靠近合流點）：將 `nextRoute` 拼接到尾端。在拼接前，若發現 `nextRoute` 的尾端比起點更靠近 `lastPt`（即路徑方向相反），則將 `nextRoute` 反轉後拼接，以確保在多級合流中拼接後的最末端點仍落在下游，不會使路徑幾何「折返」而截斷後續延伸。
- **反向匹配**（起點靠近合流點）：將 `nextRoute` 拼接到開頭（首端拼接）。在拼接前，若發現 `nextRoute` 的起點離 `firstPt` 較近，說明其下游朝向與當前路徑相反，需將其反轉後拼接到開頭；否則直接拼接，確保在不破壞支線原本數字編號順序下，完整打通反向延伸路徑。

# 2026-06-05 三線合流完整路徑顯示修復計畫

## 核心目標
1. 選取位於三線合流接合點上的 output 物流線時，也要顯示 input 分支到 output 下游的完整物品移動路徑。
2. 保留既有 input 分支選取時向下游延伸的顯示行為。
3. 避免在 renderer 中重建物流拓樸系統，只重用既有 merge-node 與 group route 查詢。

## 實施步驟
- [x] 步驟 1：補上 output group 選取時的完整路徑回歸測試。
- [x] 步驟 2：調整 `LogisticsRenderer.getSelectedGroupDebugRoutePoints`，在 selected group 為 merge output 時補入 input route。
- [x] 步驟 3：執行 debug route 測試、物流方向守門測試、語法檢查與 `npm.cmd run finalize`。

# 2026-06-05 第三合流線路徑 fallback 修復

## 核心目標
1. 當第三條合流線缺少可匹配的 merge-node 延伸資訊時，仍能依照「當前路徑終點貼到另一群組起點」補上紅色完整下游 debug route。
2. 僅允許起點貼合的下游線作為 fallback，避免把反向終點誤接回來。

## 實施步驟
- [x] 步驟 1：新增無 merge-node、但終點接下游起點的回歸測試。
- [x] 步驟 2：在 `getSelectedGroupDebugRoutePoints` 補入幾何下游 fallback。
- [x] 步驟 3：重新執行 debug route 測試與 finalize。

# 2026-06-05 實際運輸路徑中段接合修復

## 核心目標
1. 紅色 debug route 必須能沿用 `conveyorSystem.getLogisticsGroupRoutePoints` 的實際群組路徑。
2. 當接合點位於下游路徑中段時，從該接合點切出後半段，而不是要求接合點必須是下游第一點。

## 實施步驟
- [x] 步驟 1：新增「接到下游 route 中段」回歸測試。
- [x] 步驟 2：調整 renderer fallback，優先讀取系統群組路徑並從 anchor 切片。
- [x] 步驟 3：重新執行 debug route 測試與 finalize。

# 2026-06-05 合流候選方向優先級修復

## 核心目標
1. 同一接合點同時存在直行候選與轉向候選時，選取路徑必須優先接往實際轉向離開的下游。
2. 明確排除反向候選，避免紅線或後續路徑回接到上游造成回堵判讀錯誤。

## 實施步驟
- [x] 步驟 1：新增左側進入 junction 時，必須選擇向下轉向而非向右直行的回歸測試。
- [x] 步驟 2：在 renderer 幾何 fallback 加入方向評分：反向拒絕、轉向優先、同向次之。
- [x] 步驟 3：重新執行 debug route 測試與 finalize。
