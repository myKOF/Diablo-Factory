/**
 * 界面佈局與文字顯示設置
 * 修改此處的數值可直接調整 UI 位置
 */
export const UI_CONFIG = {
    // 頂部資源列
    ResourceBar: {
        x: 20, y: 10,
        width: 1000, height: 30,
        fontSize: "20px",
        fontColor: "#ffca28",
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
    // 建築操作面板
    BuildingPanel: {
        x: 20, y: 80,
        width: 320, height: 600,
        itemHeight: 90,
        titleSize: "24px",
        fontSize: "14px",
        title: "🛡️ 末日設施建造",
        titleColor: "#fbc02d",
        textColor: "#e0e0e0",
        descColor: "rgba(224, 224, 224, 0.7)",
        list: [
            { id: "town_center", name: "城鎮中心", desc: "生產村民 (消耗黃金)" },
            { id: "alchemy_lab", name: "煉金實驗室", desc: "生產生命藥水 (需木材)" },
            { id: "cathedral", name: "遺忘教堂", desc: "自動感召牧師" },
            { id: "academy", name: "魔法學院", desc: "培養大魔導師" }
        ]
    },
    // 村莊底部指令快捷列 (採集、收工)
    ActionMenu: {
        width: 380,
        height: 95,
        offsetX: 15, // 相對於建築中點的水平偏移
        offsetY: 100  // 相對於建築中點的垂直偏移
    },
    // 日誌通知欄
    LogPanel: {
        x: 1480,  // 距離左邊的距離 (水平位置)
        y: 700,   // 距離頂部的距離 (垂直位置)
        width: 420, height: 200,    // 寬度及高度
        bgColor: "rgba(20, 10, 5, 0.85)",
        borderColor: "#5d4037",
        fontSize: "14px",
        padding: "10px",
        maxLines: 100
    },
    // 中央警告提示 (HUD)
    WarningHUD: {
        x: "50%",
        y: "40%",
        width: 400,
        height: 50,
        fontSize: "16px",
        fontColor: "#fff176",
        bgColor: "rgba(45, 25, 15, 0.95)",
        borderColor: "#8d6e63",
        padding: "15px 40px",
        duration: 1500
    },
    // 地圖資源標籤 (名稱、等級與數量)
    MapResourceLabels: {
        name: {
            fontSize: "bold 14px Arial", // 名稱字型
            color: "#ffffff",           // 白色
            offsetY: -25,               // 資源上方
            outlineColor: "rgba(0,0,0,0.8)",
            outlineWidth: 3
        },
        level: {
            fontSize: "bold 11px Arial", // 等級字型
            color: "#fff176",           // 亮黃色
            offsetY: 25,                 // 資源下方一點
            outlineColor: "rgba(0,0,0,0.8)",
            outlineWidth: 2
        },
        amount: {
            fontSize: "bold 13px Arial", // 數量字型
            color: "#81d4fa",           // 淺藍色 (與 ResourceBar 區分)
            offsetY: 0,                // 資源更下方
            outlineColor: "rgba(0,0,0,0.8)",
            outlineWidth: 3
        }
    },
    // 建築施工進度條
    BuildingProgressBar: {
        widthScale: 1.0,        // 寬度相對於建築寬度的比例
        height: 8,              // 高度
        offsetY: 75,           // 垂直偏移 (建築頂部上方)
        bgColor: "rgba(51, 51, 51, 1)", // 背景色
        fillColor: "rgba(0, 255, 34, 0.83)",   // 填充色 (建造中用黃色)
        outlineColor: "#020000ff" // 邊框顏色
    },
    // 建築生產 HUD (小人圖示與進度條)
    ProductionHUD: {
        width: 85,
        height: 12,
        barBg: "rgba(0,0,0,0.6)",
        barFill: "#4caf50",
        barBlocked: "#f44336",
        badgeBg: "#c62828",
        popLimitText: {
            fontSize: "bold 10px Arial",
            color: "#ff8a80",
            outlineColor: "rgba(0,0,0,0.8)",
            offsetY: -10
        }
    },
    // 村民狀態顏色
    VillagerColors: {
        IDLE: "#2d5effff",          // 閒置：亮藍色
        CONSTRUCTING: "#da9603ff",  // 施工中：土黃色
        WOOD: "#4fc532ff",          // 採木：綠色
        STONE: "#687175ff",         // 採石：深灰色
        FOOD: "#ec6250ff",          // 採糧：紅色
        DEFAULT: "#2d5effff"        // 預設：深藍色
    }
};
