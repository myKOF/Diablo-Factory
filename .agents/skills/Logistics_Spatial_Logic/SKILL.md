---
name: logistics-spatial-logic
description: Use when editing ConveyorRouter.js or ConveyorSystem.js, especially logistics routing, ghost preview validation, routeWidth occupancy, conveyor extension, logistics group merge/split, turnArrowOverride, splitSequenceOrder, or drag-based conveyor construction.
---

# Logistics Spatial Logic

## 核心規則

* Router 負責路徑與足跡計算
* ConveyorSystem 負責拖曳、建造、group 管理
* 不要把 UI 邏輯塞進 Router
* 不要重寫第二套 occupancy 系統
* 所有 footprint 判斷必須統一使用 Router

---

# Router 職責

ConveyorRouter.js 負責：

* findPath
* getLShapePath
* findAStarPath
* isValidPath
* isValidNode
* processPath
* getWidthOffsets
* getGhostOccupiedCells
* validateRouteFootprint

Router 是：

* pathfinding 核心
* footprint 核心
* occupancy 核心

不要在其它地方重寫 footprint 計算。

---

# ConveyorSystem 職責

ConveyorSystem.js 負責：

* startDrag
* updateDrag
* updateDragNow
* submitDrag
* cancelDrag
* createRoutingGrid
* collectLogisticsOccupiedKeys
* mergeLogisticsLineGroups
* splitSourceGroupForMiddleExtension
* applyExtensionTurnArrowOverride

ConveyorSystem 處理：

* 玩家拖曳
* ghost preview
* line merge
* line split
* logistics group
* turnArrowOverride
* selected group state

不要把 A* 演算法塞進 ConveyorSystem。

---

# 路徑規則

## L-Shape 優先

findPath 必須：

1. 先嘗試 getLShapePath
2. 失敗才 fallback 到 findAStarPath

不要直接移除 L-shape。

原因：

* 玩家預期直角拖曳
* 拖曳手感較穩定
* A* 只處理障礙與複雜情況

---

## U-Turn 規則

禁止產生 180 度回頭。

修改時：

* 必須同時考慮 X/Y 軸
* 不可只檢查單一軸

推薦概念：

```js
currentDir.x === -nextDir.x &&
currentDir.y === -nextDir.y
```

不要只寫：

```js
Math.sign(dx) === -Math.sign(startVec.x)
```

除非確認另一軸不參與移動。

---

## bendMode 規則

合法值只有：

```js
'x-first'
'y-first'
```

updateDragNow 內：

* 玩家拖曳方向會自動鎖定 bendMode
* 回到起點附近會解除鎖定
* toggleBendMode 後必須保持手動優先

不要讓自動判定覆蓋玩家手動切換。

---

# occupancy 規則

## Single Source Of Truth

所有 footprint 必須統一使用：

```js
this.router.getGhostOccupiedCells(...)
```

與：

```js
this.router.validateRouteFootprint(...)
```

不要：

* create 第二套 occupancy
* 手寫 routeWidth footprint
* ghost 用一套
* submit 用另一套

---

## routeWidth 規則

routeWidth 必須統一經過：

```js
this.router.getWidthOffsets(routeWidth)
```

不要自己手寫 offset。

修改 routeWidth 時，必須同步檢查：

* getWidthOffsets
* getGhostOccupiedCells
* validateRouteFootprint
* markLineOnGrid
* collectLogisticsOccupiedKeys

---

## Curve Footprint 規則

轉角必須同時計算：

* dirIn
* dirOut

不可只算單方向 footprint。

不要刪除：

```js
if (ghost.isCurve && ghost.dirIn && ghost.dirOut)
```

否則寬物流線轉角會漏格。

---

# Collision 規則

## onCollision 是唯一合法 bypass

所有碰撞例外都必須透過：

```js
this.router.onCollision
```

合法 bypass：

* sourcePort
* targetPort
* logistics extension
* 建築物內部
* port connector
* cursor building

不要直接：

```js
continue;
```

或：

```js
return true;
```

跳過碰撞。

---

## logistics extension 特例

isLineExtension 時：

* logisticsOccupiedKeys 可 pass-through
* sourceLine 不可阻擋自身延伸
* routeStartDir 應為 null
* 不可使用建築物方向偏好

不要把 logistics extension 當一般 building port。

---

# ghost preview 規則

ghost preview 與 submitDrag 必須完全一致。

如果 preview 顯示 valid：

* submit 必須能成功

如果 submit 會失敗：

* preview 必須提前 invalid

不要：

* preview 一套規則
* submit 一套規則

---

# Port 規則

## portConnector

以下點不應視為普通物流線：

* isPortConnector
* isVirtualEnd

validateRouteFootprint 必須排除它們。

不要讓：

* building port
* virtual endpoint

參與一般 collision。

---

## getPortAnchorGrid

建築物 port：

* 要往外推 routeScale

logistics line：

* 不可往外推

不要刪除：

```js
if (port.sourceType === "logistics_line")
```

否則延伸點會偏移。

---

# logistics extension 規則

## dedupeExtensionStart

不要改成：

```js
return path.slice(firstOpenIndex)
```

必須保留：

```js
return [path[0], ...path.slice(firstOpenIndex)]
```

原因：

extension 必須保留原始 anchor node。

否則：

* merge 後會 outward detour
* routePoints 可能斷裂

---

# turnArrowOverride 規則

## 使用時機

只有：

* logistics extension
* 形成轉角
* 非同向
* 非完全反向

才建立：

```js
turnArrowOverride
```

同向或反向時：

必須：

```js
delete sourceLine.turnArrowOverride
```

並同步清理：

```js
GameEngine.state.logisticsTurnArrowOverrides
```

不要只刪 line 上的 override。

---

## override 同步

建立 override 後：

必須同步到：

* 同 group
* 同位置

的其它 logistics segment。

不要只修改 sourceLine 本身。

---

# merge / split 規則

## group merge

mergeLogisticsLineGroups 不只是改 groupId。

還必須同步：

* order
* splitSequenceOrder
* prevId
* nextId
* sourceId
* targetId
* selectedLogisticsGroupId

merge 後必須：

```js
orderLogisticsSegmentsByDirection(...)
```

---

## splitSequenceOrder

如果存在：

```js
splitSequenceOrder
```

排序優先使用它。

沒有才 fallback：

```js
order
```

不要依賴陣列順序。

---

## splitSourceGroupForMiddleExtension

中段拉分支時：

* frontSegments
* backSegments

必須完整切開。

切開後：

* detachedGroup 必須重新 groupId
* prevId / nextId 必須重建
* detached turnArrowOverride 必須清除

不要只改 groupId。

---

# createRoutingGrid 規則

createRoutingGrid：

* 必須把既有物流線標進 routeGrid
* 但 extension sourceLine 必須忽略

否則：

* 自己的物流線會擋住自己

---

# SpatialHashGrid 規則

SpatialHashGrid：

* 只用於快速查找
* 不可當正式 footprint collision 系統

正式 collision：

仍然必須使用：

* routeGrid
* footprint validation
* getGhostOccupiedCells

---

# 修改流程

修改物流線系統時：

1. 優先局部修改
2. 不要整檔重寫
3. 先找現有 helper
4. 優先重用 Router footprint
5. 修改 routeWidth 時同步檢查所有 occupancy
6. 修改 merge/split 時同步檢查：

   * order
   * splitSequenceOrder
   * prevId
   * nextId
7. 修改 extension 時同步檢查：

   * turnArrowOverride
   * logisticsOccupiedKeys
   * dedupeExtensionStart

---

# 禁止事項

不要：

* 重寫第二套 occupancy
* 重寫第二套路由 footprint
* ghost 與 submit 使用不同規則
* 刪除 onCollision
* 讓 logistics extension 被自身阻擋
* 刪除 dedupeExtensionStart anchor
* 讓 turnArrowOverride 殘留
* merge 後不重排 order
* 依賴陣列順序判斷前後段
* 把 UI 邏輯塞進 Router
* 把 A* 當唯一 routing
* 忽略 routeWidth
* 忽略 curve footprint
* 忽略 isPortConnector
* 忽略 isVirtualEnd
* 讓自動 bendMode 覆蓋手動切換

---

# 關鍵欄位

重要欄位：

* ghosts
* routeWidth
* widthOffsets
* isLineExtension
* logisticsOccupiedKeys
* turnArrowOverride
* splitSequenceOrder
* prevId
* nextId
* groupId
* sourceLine
* sourcePort
* targetPort
* isPortConnector
* isVirtualEnd

修改時不要隨意改名。
