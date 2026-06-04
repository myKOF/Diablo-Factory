# 物流線合流合併修正計畫

## 核心問題分析
當支線合流至主線末端時，由於主線此時沒有離開合流點，無法成功註冊為 `MergeNode`。當主線被延伸時，兩者在空間上相碰且尚未建立 `MergeNode`，這會觸發 `mergeConnectedGroups` 將兩者錯誤地合併為同一個群組（Logistics Group），導致整個物流線的編號和傳輸順序混亂。

## 解決方案
在 `LogisticsLineMergeCoordinator` 進行 `mergeConnectedGroups` 時，對於相碰且尚未透過 `MergeNode` 連接的兩個群組：
1. 收集兩組所有線段的端點，作為潛在的合流點（接觸點）。
2. 在每個接觸點上，利用 `LogisticsMergeNodeStore` 的 `canRegisterMergeDirection` 檢查是否能註冊為 `MergeNode`。
3. 若其中一個方向滿足註冊條件，則調用 `registerLogisticsMergeNode` 建立 `MergeNode`，並不合併這兩個群組（跳過合併）。

## 預期效果
1. 當主線延伸後，系統會自動在接觸點建立 `MergeNode`。
2. 支線和主線不會合併，維持各自獨立的群組與順序編號，符合預期合流行為。
