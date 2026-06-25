# Logistics Public API Audit

更新日期：2026-06-04

## 稽核來源

- 搜尋工具：`node tools/safe_search.cjs "conveyorSystem."`
- 盤點範圍：`src/**/*.js`、`src/**/*.html`
- facade 位置：`src/systems/ConveyorSystem.js`

## 外部公開 API

下列方法仍被 facade 外部呼叫，後續拆分時必須保留同名方法或提供無破壞轉接。

| API | 主要引用檔案 | 保留原因 |
| --- | --- | --- |
| `startDrag` / `updateDrag` / `submitDrag` / `cancelDrag` / `toggleBendMode` | `src/ui/ui.js`、`src/ui/LogisticsUI.js` | 玩家拖曳建造與 bendMode 操作入口 |
| `undoLastLogisticsBuild` | `src/ui/ui.js` | 建造復原快捷鍵 |
| `deleteLogisticsLineById` / `deleteLogisticsLineGroupById` | `src/ui/LogisticsUI.js` | 物流線刪除與群組刪除入口 |
| `ensureLogisticsLineStore` | `src/ui/ui.js`、`src/ui/LogisticsUI.js` | UI 讀取物流線列表 |
| `getLogisticsLineAt` / `getLogisticsLinesAt` / `getLogisticsSourcePortHitAt` | `src/ui/ui.js`、`src/scenes/MainScene.js` | 滑鼠命中偵測與選取 |
| `getLogisticsLineById` / `getLogisticsLineSelectionKey` / `isSelectedLogisticsLine` | `src/ui/LogisticsUI.js`、`src/ui/ui.js`、`src/renderers/logistics_renderer.js` | 選取狀態、側欄顯示、renderer 高亮 |
| `getConnectionRoute` / `getConnectionTransferRoute` / `getLogisticsLineRoute` | `src/renderers/logistics_renderer.js`、`src/systems/WorkerSystem.js` | 自動物流渲染與 transfer 路徑 |
| `getLogisticsDisplayConnectedGroupIds` / `getLogisticsGroupsConnectedThroughMergeNodes` / `getLogisticsMergeConnectedGroupIds` | `src/renderers/logistics_renderer.js`、`src/ui/LogisticsUI.js`、`src/ui/ui.js` | 顯示群組、合流群組與刪除提示 |
| `applyLogisticsMergeNodes` / `applyBlockedTransferQueues` / `isLogisticsMergeInputTransfer` | `src/systems/WorkerSystem.js` | 每幀 transfer runtime、合流節點與回壓 |
| `buildGridRoutePoints` / `buildLogisticsSegments` / `upsertLogisticsLine` | `src/renderers/logistics_renderer.js` | 既有 renderer 建構物流線段 |

## 內部 facade API

下列方法目前主要由 `ConveyorSystem` 自身或物流子模組呼叫；可逐步下沉到子模組，但在完成全部引用切換前仍需保留 facade 轉接。

| 類別 | 方法 |
| --- | --- |
| Config / cost | `getAlignmentUnit`、`getGridUnitSize`、`getRouteScale`、`getTransportLineConfig`、`getTransportLineCost`、`canAffordTransportLine` |
| Router / port path | `toGrid`、`validateGhosts`、`getPortAnchorGrid`、`buildPortSafePath`、`dedupeExtensionStart`、`buildOrthogonalRoute`、`createRoutingGrid`、`collectLogisticsOccupiedKeys`、`markLineOnGrid` |
| Line query / ordering | `getLogisticsSegmentsByGroupId`、`getLogisticsLineNodePoints`、`isPointOnLogisticsLine`、`getLogisticsLineDirectedCells`、`orderLogisticsSegmentsByDirection` |
| Merge / split / extension | `mergeConnectedLogisticsGroups`、`mergeLogisticsLineGroups`、`splitSourceGroupForMiddleExtension`、`applyExtensionTurnArrowOverride`、`registerLogisticsMergeNode`、`reassignDeletedGapContinuationToMergeInput` |
| Endpoint / deletion | `recalculateLogisticsGroupEndpoints`、`cleanupDeletedLinePreviousTurnOverride`、`cleanupLogisticsMergeNodesForDeletedLine` |

## 第六步驟收斂紀錄

- `LogisticsRuntimeContext` 集中 `GameEngine`、`UI_CONFIG`、`BuildingSystem`、`window.UIManager` 讀取入口。
- `LogisticsPathMetrics` 集中 path length、progress 取點、距離投影與 point-to-path 距離。
- `LogisticsRouteGraph` 集中物流線段 graph 建構、最短路徑、可達 source/sink 與 expanded grid route。
- `LogisticsStateGuards` 集中 array/point/route 防呆。
- `LogisticsConfigCostAdapter`、`LogisticsPathAdapters`、`LogisticsTopologyQuery`、`LogisticsMergeNodeStore` 已由搬移期 `function + apply(this.system)` 收斂為實例方法。
- 交易型流程 `LogisticsDragSession`、`LogisticsDragSubmission`、`LogisticsDeletionService`、`LogisticsExtensionCoordinator`、`LogisticsEndpointResolver` 仍保留搬移期 wrapper，後續要以拖曳/刪除/延伸完整回歸測試保護後再逐步收斂。
