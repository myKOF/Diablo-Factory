/**
 * UI_CONFIG — 界面佈局與文字顯示的統一設定中心
 *
 * 所有與遊戲 HUD、面板、標籤有關的樣式數值都集中在這裡。
 * 修改此處的數值可直接調整 UI 位置、大小、顏色，
 * 無需改動任何渲染邏輯，方便快速做視覺微調。
 
    [錨點對齊]
 * 上方置中	anchor: "TOP_CENTER"
 * 下方置中	anchor: "BOTTOM_CENTER"
 * 左上角	anchor: "TOP_LEFT"
 * 右下角	anchor: "BOTTOM_RIGHT"
 * 畫面正中央	anchor: "CENTER"
 */
export const UI_CONFIG = {
    // ── 頂部資源列 ────────────────────────────────────────────────
    // 顯示在畫面最上方中央，列出當前所有資源數量（黃金、木材、石頭⋯⋯）。
    // anchor 決定錨點方向；offsetX/Y 是相對於錨點的像素偏移。
    // glass: true 會為元素套用毛玻璃背景效果（CSS backdrop-filter）。
    ResourceBar: {
        anchor: "TOP_CENTER",  // 錨點：頂部置中
        offsetX: 0,            // 水平偏移（像素）
        offsetY: 20,           // 與頂部的距離（像素）
        width: 1000, height: 44,
        fontSize: "20px",
        fontColor: "#ffca28",  // 資源數字的顏色（金黃色）
        glass: true,           // 啟用毛玻璃質感背景
        // labels：各資源的顯示前綴文字（含 emoji）
        labels: {
            gold: "🪙 黃金：",
            wood: "🪵 木材：",
            stone: "🪨 石頭：",
            food: "🍖 食物：",
            healthPotion: "🧪 藥水：",
            soulFragment: "👻 靈魂：",
            villagerCount: "👨‍🌾 村民："
        }
    },
    // ── 左側建築操作面板 ─────────────────────────────────────────
    // 顯示在畫面左側的建築選單，玩家從此拖曳或點選建築放置到地圖上。
    // list：可建造的建築清單，每項包含 id（對應 buildingConfigs 的 key）、
    //       顯示名稱（name）與描述文字（desc）。
    BuildingPanel: {
        anchor: "TOP_LEFT",               // 錨點：左上角
        offsetX: 30,                       // 距左側邊界的距離（像素）
        offsetY: 100,                      // 距頂部的距離（像素）
        width: 320, height: "calc(100% - 160px)",  // 寬高（高度動態計算）
        itemHeight: 90,                    // 每個建築項目列的高度
        titleSize: "24px",
        fontSize: "14px",
        title: "🛡️ 末日設施建造",
        titleColor: "#fbc02d",             // 面板標題顏色（琥珀黃）
        textColor: "#e0e0e0",              // 建築名稱文字顏色
        descColor: "#e0e0e0",              // 描述文字顏色
        descAlpha: 0.7,                    // 描述文字透明度
        list: [
            { id: "village" },
            { id: "farmhouse" },
            { id: "timber_factory" },
            { id: "stone_factory" },
            { id: "barn" },
            { id: "gold_mining_factory" },
            { id: "farmland" },
            { id: "tree_plantation" },
            { id: "mage_place" },
            { id: "swordsman_place" },
            { id: "archer_place" }
        ]
    },
    // ── 建築互動指令選單（ActionMenu）───────────────────────────
    // 當玩家點擊地圖上的建築物時，會彈出一個快捷指令面板
    // （例如：採集、收工、升級等操作按鈕）。
    // 此面板採用「智慧定位」，由 UIManager 根據建築的螢幕座標
    // 自動決定彈出位置，offsetX/Y 是相對於建築底部的微調偏移量。
    ActionMenu: {
        width: 380,    // 面板寬度（像素）
        height: 95,   // 面板高度（像素）
        offsetX: 15,  // 相對於建築底部中心的水平微調
        offsetY: 100  // 相對於建築底部中心的垂直微調
    },
    // ── 右下角日誌通知欄 ─────────────────────────────────────────
    // 顯示遊戲事件訊息的滾動日誌面板（如：「村民完成建造」、「資源耗盡」）。
    // maxLines：日誌最多保留的訊息行數，超過會自動刪除最舊的一條。
    LogPanel: {
        anchor: "BOTTOM_RIGHT",              // 錨點：右下角
        offsetX: 20,                          // 距右邊界的距離（像素）
        offsetY: 20,                          // 距底部邊界的距離（像素）
        width: 420, height: 200,
        bgColor: "#140a05",                  // 深棕黑
        bgAlpha: 0.9,                        // 背景透明度
        borderColor: "#8d6e63",               // 邊框顏色（棕色）
        fontSize: "14px",
        padding: "15px",
        maxLines: 100,                        // 保留的最大訊息行數
        shadowColor: "#000000",
        shadowAlpha: 0.8
    },
    // ── 中央警告提示 (HUD) ───────────────────────────────────────
    // 出現在畫面中央偏上的彈出式警告訊息，例如「人口已滿」、「資源不足」。
    // duration：訊息顯示的持續時間（毫秒），到期後自動淡出消失。
    WarningHUD: {
        anchor: "TOP_CENTER",         // 錨點：畫面正中央
        offsetX: 0,
        offsetY: 100,            // 稍微偏上方，避免遮住地圖中心
        width: 450,
        height: "auto",           // 高度依內容文字自動撐開
        fontSize: "18px",
        fontColor: "#fff176",     // 警告文字顏色（淺黃色）
        bgColor: "#2d190f",       // 深黑棕
        bgAlpha: 0.95,            // 背景透明度
        borderColor: "#fbc02d",   // 邊框顏色（琥珀黃，帶警示感）
        padding: "20px 50px",
        duration: 2000            // 顯示持續時間（毫秒）
    },
    // ── 地圖實體標籤（MapResourceLabels）───────────────────────
    // 懸浮在地圖上每個建築/資源頭頂的文字標籤（Phaser Text 物件）。
    // 座標均為相對於實體中心的世界座標偏移（offsetY 負值代表往上移動）。
    // outlineColor / outlineWidth：文字的描邊效果，增加可讀性。
    MapResourceLabels: {
        // 建築或資源的名稱標籤 (白)
        name: {
            fontSize: "bold 13px Arial",
            color: "#ffffff",
            offsetX: 0,                // 水平偏移 (正值右移, 負值左移)
            offsetY: -45,              // 資源標籤往上偏移 45px
            buildingOffsetY: -15,      // 建築標籤統一在中心偏上 15px
            align: 'center',           // 強制文字內部居中
            outlineColor: "#000000",
            outlineAlpha: 0.8,
            outlineWidth: 3
        },
        // 等級標籤 (黃) - 放在最頂部
        level: {
            fontSize: "bold 12px Arial",
            color: "#fff176",
            offsetX: 0,                // 水平偏移
            offsetY: -65,              // 資源標籤往上偏移 65px
            buildingLevelOffsetY: -35, // 建築標籤往上偏移 35px
            align: 'center',
            outlineColor: "#000000",
            outlineAlpha: 0.8,
            outlineWidth: 2
        },
        // 資源剩餘數量標籤 (藍) - 放在下方
        amount: {
            fontSize: "bold 13px Arial",
            color: "#81d4fa",
            offsetX: 0,                // 水平偏移
            offsetY: 35,               // 往下偏移 35px
            align: 'center',
            outlineColor: "#000000",
            outlineAlpha: 0.8,
            outlineWidth: 3
        }
    },
    // ── 自然資源渲染配置（ResourceRenderer）────────────────────
    // 每種自然資源（樹木、石頭、漿果灌木）的程序化繪製參數。
    // 這些顏色由 ResourceRenderer.js 讀取，直接傳入 Phaser Graphics API，
    // 因此使用 Phaser 原生的 0xRRGGBB 十六進位數字格式（非 CSS 字串）。
    ResourceRenderer: {
        // 樹木（Tree）：由樹幹 + 多層樹葉圓形組成
        Tree: {
            trunkColor: "#5d4037",                      // 樹幹：溫暖棕色
            leafColors: ["#1b5e20", "#2e7d32", "#43a047"], // 樹葉：深→淺綠漸層
            outlineColor: "#051b07",                     // 輪廓：深墨綠
            outlineWidth: 2,
            visualVariation: {
                minScale: 0.9,   // 最小隨機縮放倍率 (基礎 1.0)
                maxScale: 1.2,   // 最大隨機縮放倍率
                tintRange: 0.5   // 變色範圍 (0.2 表示色調亮度隨機在 80%~100% 之間浮動，數值越大隨機性越高)
            }
        },
        // 石頭（Rock）：隨機多邊形，使用灰黑色調
        Rock: {
            colors: ["#424242", "#212121", "#616161"],  // 深灰、暗黑、中灰
            outlineColor: "#000000",                  // 輪廓：純黑
            outlineWidth: 2,
            visualVariation: {
                minScale: 0.9,   // 最小隨機縮放
                maxScale: 1.2,   // 最大隨機縮放
                tintRange: 0.5  // 變色細數：用於營造岩石深淺不一的質感
            }
        },
        // 漿果灌木（BerryBush）：橘黃色葉簇 + 紅色莓果
        BerryBush: {
            leafColor: "#ffa000",  // 葉簇：橘黃色
            berryColor: "#d50000",  // 莓果：鮮紅色
            outlineColor: "#bf360c",  // 輪廓：深橘紅
            outlineWidth: 2,
            visualVariation: {
                minScale: 0.9,   // 灌木最小縮放
                maxScale: 1.2,   // 灌木最大縮放
                tintRange: 0.5   // 變色系數：使灌木叢色澤維持一致但有細微不同
            }
        },
        // 金礦（GoldMine）：金燦燦的結晶簇
        GoldMine: {
            colors: ["#ffd700", "#ffa000", "#ffea00"], // 金、橘金、鮮黃
            outlineColor: "#4e342e",                // 輪廓：深焦糖色
            outlineWidth: 2,
            visualVariation: {
                minScale: 0.9,
                maxScale: 1.2,
                tintRange: 0.3
            }
        },
        // 營火堆（Campfire）：底座木柴堆 + 上方火焰粒子
        Campfire: {
            groundColor: "#8f4c00d8",    // 焦土色：深木色
            woodColor: "#795548",      // 木頭色：溫暖棕色
            woodOutline: "#6d352bff",    // 木頭輪廓：深棕
            particle: {
                lifespan: { min: 700, max: 1200 },     // 粒子生命週期（毫秒），決定火焰高度
                speedY: { min: -70, max: -130 },      // 垂直上升速度（負值向上）
                scale: { start: 0.9, end: 0.1 },      // 比例變化：從大到小
                alpha: { start: 0.8, end: 0.05 },          // 透明度變化：從不透明到完全透明
                tints: ["#ffff00", "#ffa500", "#ff4500", "#ff0000"], // 火焰顏色演變（黃 -> 橙 -> 紅 -> 深紅）
                blendMode: 'NORMAL',                     // 混合模式：ADD 可產生發光疊加感，NORMAL 正常遮蓋
                frequency: 30,                        // 發射頻率（毫秒）：越小火勢越密
                spreadX: 18,                          // 水平擴散範圍（左右偏移量）
                offsetY: 10                           // 垂直初始偏移（調整火焰與木頭的中心點距離）
            }
        }
    },
    // ── 建築施工進度條（BuildingProgressBar）───────────────────
    // 建築在施工狀態時，顯示在建築底部的橫向進度條。
    // widthScale：進度條寬度相對於建築格寬的倍率（1.1 = 略寬於建築）。
    // overrides：針對特定建築類型覆蓋預設值（例如城鎮中心進度條只有 80% 寬）。
    BuildingProgressBar: {
        widthScale: 0.95,                  // 進度條寬度倍率 (相對於建築格寬)
        height: 8,                       // 進度條高度 (像素)
        align: "bottom",                 // 對齊位置：top (頂部), center (中心), bottom (底部)
        offsetY: 0,                      // 垂直偏移量 (相對於對齊位置)
        bgColor: "#000000",              // 背景槽
        bgAlpha: 0.7,                    // 背景透明度
        fillColor: "#fbc02d",             // 填充顏色（琥珀黃）
        outlineColor: "#000000",          // 外框線條顏色
        // overrides：針對特定建築類型覆蓋 widthScale（其他屬性繼承預設值）
        overrides: {
            village: { widthScale: 0.8 },
            town_center: { widthScale: 0.8 }
        }
    },
    // ── 城鎮中心生產 HUD（ProductionHUD）───────────────────────
    // 城鎮中心在訓練村民時，顯示在建築上方的小型生產進度條與數字徽章。
    // barFill：人口未滿時的進度條顏色；barBlocked：人口已滿時顯示的警示色。
    // badgeBg：顯示當前排隊數量的圓形徽章背景色。
    ProductionHUD: {
        width: 85,                       // 進度條寬度（像素）
        height: 12,                      // 進度條高度（像素）
        barBg: "#000000",                // 槽底色
        barAlpha: 0.7,                   // 透明度
        barFill: "#4caf50",              // 訓練中：綠色填充
        barBlocked: "#f44336",           // 人口已滿：紅色填充（警示）
        badgeBg: "#c62828"               // 排隊數量徽章的深紅背景
    },
    // ── 村民狀態顏色（VillagerColors）──────────────────────────
    // 村民圖示的顏色會依據其當前工作狀態動態改變，方便玩家一眼區分。
    // 使用 CSS #rrggbb 格式，由 CharacterRenderer 讀取後轉為 Phaser tint。
    VillagerColors: {
        IDLE: "#42a5f5",  // 閒置：亮藍色
        CONSTRUCTING: "#945a0491",  // 建造中：橘色
        WOOD: "#66bb6a",  // 採木：綠色
        STONE: "#78909c",  // 採石：灰色
        FOOD: "#ef5350",  // 採食：紅色
        GOLD: "#ffca28",  // 採金：金黃色
        SWORDSMAN: "#b0bec5", // 劍士：銀灰色（甲冑）
        MAGE: "#9575cd",      // 法師：亮紫色（長袍）
        ARCHER: "#81c784",    // 弓箭手：森綠色（皮甲）
        DEFAULT: "#42a5f5"   // 預設（同閒置）
    },
    // ── 地圖格網（Grid）──────────────────────────────────────────
    // 渲染在地圖底層的格線，分為「主格線」（每 80px）與「細格線」（每 20px）。
    // 顏色使用 CSS "#rrggbb" 字串格式，由 MainScene.drawGrid() 讀取時
    // 透過 parseInt(color.replace('#',''), 16) 轉為 Phaser lineStyle 所需的數字。
    // Alpha 值範圍 0~1，數值越小越透明（細格線故意很淡，避免視覺干擾）。
    Grid: {
        mainColor: "#000000",  // 主格線顏色（每 4 格一條粗線）
        mainAlpha: 0.12,       // 主格線透明度（12%）
        subColor: "#000000",  // 細格線顏色（每格一條細線）
        subAlpha: 0.03,       // 細格線透明度（3%，幾乎不可見）
        //   "#rrggbb"         → 標準 6 位 hex，例如 "#f5f5dc"（米白）
        floorColor: "#ffffff"  // 米白/亞麻色
    },
    // ── 設置選單 (SettingsPanel) ──────────────────────────────────
    // 左上角的齒輪按鈕以及對應的系統設置面板。
    SettingsButton: {
        anchor: "TOP_LEFT",
        offsetX: 20, offsetY: 20,          // 位於左上角最邊緣
        width: 50, height: 50,
        fontSize: "28px",
        bgColor: "#1e1e1e",
        bgAlpha: 0.8,
        borderColor: "#fbc02d",
        icon: "⚙️"
    },
    SettingsPanel: {
        anchor: "CENTER",
        width: 350, height: "auto",
        title: "⚙️ 系統核心設置",
        glass: true
    },
    // ── 座標顯示 (CoordsDisplay) ──────────────────────────────────
    // 顯示當前畫面中央的世界座標 (x, y)。
    CoordsDisplay: {
        anchor: "TOP_LEFT",
        offsetX: 85, offsetY: 20,          // 位於設置按鈕右側
        width: "auto", height: 50,
        fontSize: "18px",
        fontColor: "#ffffff",
        glass: true,
        padding: "0 20px"
    },
    // ── FPS 顯示 (FPSDisplay) ──────────────────────────────────
    // 顯示當前遊戲的每秒幀數 (Frames Per Second)。
    FPSDisplay: {
        anchor: "TOP_LEFT",
        offsetX: 280, offsetY: 20,          // 位於座標顯示右側
        width: "auto", height: 50,
        fontSize: "18px",
        fontColor: "#4caf50",              // 綠色，代表性能良好
        glass: true,
        padding: "0 20px"
    },
    // ── 村莊中心指針 (TownCenterPointer) ──────────────────────────
    // 當村莊中心（town_center）不在可見畫面時，出現在畫面邊緣的指針。
    TownCenterPointer: {
        width: 76, height: 76,            // 稍微變大一點更顯眼
        fontSize: "38px",
        bgColor: "#fbc02d",               // 琥珀金
        bgAlpha: 0.95,                    // 背景透明度
        borderColor: "#ffffff",
        icon: "🏰",
        arrowIcon: "▶",                   // 使用實心三角箭頭
        margin: 80,                       // 增加邊距，讓它遠離螢幕邊緣
        panSpeed: 800                     // 稍微加快移動速度
    },
    // ── 尋路系統設定 (Pathfinding) ─────────────────────────────────
    Pathfinding: {
        debugColor: "#00ff00",         // 路徑調試用的顏色 (HEX)
        iterationsPerFrame: 1000       // 每幀允許的尋路計算量 (效能優化)
    }
};

