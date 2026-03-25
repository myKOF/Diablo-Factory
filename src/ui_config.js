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
        title: "🛡️ 末日設施建造",
        list: [
            { id: "town_center", name: "城鎮中心", desc: "生產村民 (消耗黃金)" },
            { id: "alchemy_lab", name: "煉金實驗室", desc: "生產生命藥水 (需木材)" },
            { id: "cathedral", name: "遺忘教堂", desc: "自動感召牧師" },
            { id: "academy", name: "魔法學院", desc: "培養大魔導師" }
        ]
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
        y: "30%", // 垂直位置 (百分比或像素)
        fontSize: "16px",
        fontColor: "#fff176", // 亮黃色
        bgColor: "rgba(45, 25, 15, 0.95)", // 深褐色背景
        borderColor: "#8d6e63", // 淺褐色邊框
        padding: "15px 40px",
        duration: 3000 // 顯示時長 (毫秒)
    },
    // 地圖資源標籤 (等級與數量)
    MapResourceLabels: {
        level: {
            fontSize: "bold 12px Arial", // 文字大小與字型
            color: "#fff176",           // 文字顏色 (亮黃色)
            offsetY: 0,               // 垂直偏移 (負值向上，顯示在資源上方)
            outlineColor: "rgba(0,0,0,0.8)", // 描邊顏色 (深色背景增加辨識度)
            outlineWidth: 3             // 描邊寬度
        },
        amount: {
            fontSize: "bold 13px Arial", // 文字大小與字型
            color: "#ffffff",           // 文字顏色 (白色)
            offsetY: 25,                // 垂直偏移 (正值向下，顯示在資源下方)
            outlineColor: "rgba(0,0,0,0.8)", // 描邊顏色
            outlineWidth: 3             // 描邊寬度
        }
    },
    // 建築生產 HUD (小人圖示與進度條)
    ProductionHUD: {
        barBg: "rgba(0,0,0,0.6)",       // 進度條背景
        barFill: "#4caf50",             // 進度條填充色 (綠色)
        barBlocked: "#f44336",          // 進度條受阻色 (紅色)
        badgeBg: "#c62828",             // 隊列數量圓圈背景
        popLimitText: {
            fontSize: "bold 10px Arial",
            color: "#ff8a80",           // 淺粉紅
            outlineColor: "rgba(0,0,0,0.8)",
            offsetY: -10                  // 相對於進度條頂部的偏移
        }
    }
};
