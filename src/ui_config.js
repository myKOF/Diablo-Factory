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
        descColor: "rgba(224, 224, 224, 0.7)", // 描述文字顏色（半透明）
        list: [
            { id: "village", name: "城鎮中心", desc: "主要的資源中心與村民訓練處。" },
            { id: "farmhouse", name: "民居", desc: "提供基礎人口上限，讓更多人加入工廠。" },
            { id: "timber_factory", name: "木材廠", desc: "可放置木材的建築。" },
            { id: "stone_factory", name: "石材廠", desc: "可放置石頭的建築。" },
            { id: "barn", name: "穀倉", desc: "可放置食物的建築。" },
            { id: "farmland", name: "農田", desc: "可自動生產食物的建築。" },
            { id: "tree_plantation", name: "樹木田", desc: "可自動生產木材的建築。" },
            { id: "mage_place", name: "魔法學院", desc: "法師的訓練所。" },
            { id: "swordsman_place", name: "劍士訓練所", desc: "劍士的訓練所。" },
            { id: "archer_place", name: "射箭場", desc: "弓箭手的訓練所。" }
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
        bgColor: "rgba(20, 10, 5, 0.9)",      // 深棕黑半透明背景
        borderColor: "#8d6e63",               // 邊框顏色（棕色）
        fontSize: "14px",
        padding: "15px",
        maxLines: 100,                        // 保留的最大訊息行數
        shadow: "0 10px 40px rgba(0,0,0,0.8)"
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
        bgColor: "rgba(45, 25, 15, 0.95)",  // 深黑棕半透明背景
        borderColor: "#fbc02d",   // 邊框顏色（琥珀黃，帶警示感）
        padding: "20px 50px",
        duration: 2000            // 顯示持續時間（毫秒）
    },
    // ── 地圖實體標籤（MapResourceLabels）───────────────────────
    // 懸浮在地圖上每個建築/資源頭頂的文字標籤（Phaser Text 物件）。
    // 座標均為相對於實體中心的世界座標偏移（offsetY 負值代表往上移動）。
    // outlineColor / outlineWidth：文字的描邊效果，增加可讀性。
    MapResourceLabels: {
        // 建築或資源的名稱標籤（顯示在頭頂上方）
        name: {
            fontSize: "bold 14px Arial",
            color: "#ffffff",          // 白色名稱
            offsetY: -30,              // 往上偏移 30px
            outlineColor: "rgba(0,0,0,0.8)",
            outlineWidth: 3
        },
        // 等級標籤（顯示在建築下方）
        level: {
            fontSize: "bold 11px Arial",
            color: "#fff176",          // 淺黃色等級數字
            offsetY: 30,               // 往下偏移 30px
            outlineColor: "rgba(0,0,0,0.8)",
            outlineWidth: 2
        },
        // 資源剩餘數量標籤（顯示在實體中央）
        amount: {
            fontSize: "bold 13px Arial",
            color: "#81d4fa",          // 天藍色數量文字
            offsetY: 0,
            outlineColor: "rgba(0,0,0,0.8)",
            outlineWidth: 3
        }
    },
    // ── 建築施工進度條（BuildingProgressBar）───────────────────
    // 建築在施工狀態時，顯示在建築底部的橫向進度條。
    // widthScale：進度條寬度相對於建築格寬的倍率（1.1 = 略寬於建築）。
    // overrides：針對特定建築類型覆蓋預設值（例如城鎮中心進度條只有 80% 寬）。
    BuildingProgressBar: {
        widthScale: 1.1,                  // 進度條寬度倍率（相對於建築格寬）
        height: 8,                        // 進度條高度（像素）
        bgColor: "rgba(0, 0, 0, 0.7)",   // 背景槽顏色（半透明黑）
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
        barBg: "rgba(0,0,0,0.7)",        // 進度條背景槽顏色
        barFill: "#4caf50",              // 訓練中：綠色填充
        barBlocked: "#f44336",           // 人口已滿：紅色填充（警示）
        badgeBg: "#c62828"               // 排隊數量徽章的深紅背景
    },
    // ── 村民狀態顏色（VillagerColors）──────────────────────────
    // 村民圖示的顏色會依據其當前工作狀態動態改變，方便玩家一眼區分。
    // 使用 CSS #rrggbb 格式，由 CharacterRenderer 讀取後轉為 Phaser tint。
    VillagerColors: {
        IDLE: "#42a5f5",  // 閒置：亮藍色
        CONSTRUCTING: "#ffa726",  // 建造中：橘色
        WOOD: "#66bb6a",  // 採木：綠色
        STONE: "#78909c",  // 採石：灰色
        FOOD: "#ef5350",  // 採食：紅色
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
        subAlpha: 0.03        // 細格線透明度（3%，幾乎不可見）
    },
    // ── 自然資源渲染配置（ResourceRenderer）────────────────────
    // 每種自然資源（樹木、石頭、漿果灌木）的程序化繪製參數。
    // 這些顏色由 ResourceRenderer.js 讀取，直接傳入 Phaser Graphics API，
    // 因此使用 Phaser 原生的 0xRRGGBB 十六進位數字格式（非 CSS 字串）。
    ResourceRenderer: {
        // 樹木（Tree）：由樹幹 + 多層樹葉圓形組成
        Tree: {
            trunkColor: 0x5d4037,                      // 樹幹：溫暖棕色
            leafColors: [0x1b5e20, 0x2e7d32, 0x43a047], // 樹葉：深→淺綠漸層
            outlineColor: 0x051b07,                     // 輪廓：深墨綠
            outlineWidth: 2
        },
        // 石頭（Rock）：隨機多邊形，使用灰黑色調
        Rock: {
            colors: [0x424242, 0x212121, 0x616161],  // 深灰、暗黑、中灰
            outlineColor: 0x000000,                  // 輪廓：純黑
            outlineWidth: 2
        },
        // 漿果灌木（BerryBush）：橘黃色葉簇 + 紅色莓果
        BerryBush: {
            leafColor: 0xffa000,  // 葉簇：橘黃色
            berryColor: 0xd50000,  // 莓果：鮮紅色
            outlineColor: 0xbf360c,  // 輪廓：深橘紅
            outlineWidth: 2
        }
    }
};
