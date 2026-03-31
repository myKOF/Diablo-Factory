/**
 * 界面佈局與文字顯示設置
 * 修改此處的數值可直接調整 UI 位置
 */
export const UI_CONFIG = {
    // 頂部資源列
    ResourceBar: {
        anchor: "TOP_CENTER",
        offsetX: 0,
        offsetY: 20,
        width: 1000, height: 44,
        fontSize: "20px",
        fontColor: "#ffca28",
        glass: true, // 啟用毛玻璃質感
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
        anchor: "TOP_LEFT",
        offsetX: 30,
        offsetY: 100,
        width: 320, height: "calc(100% - 160px)",
        itemHeight: 90,
        titleSize: "24px",
        fontSize: "14px",
        title: "🛡️ 末日設施建造",
        titleColor: "#fbc02d",
        textColor: "#e0e0e0",
        descColor: "rgba(224, 224, 224, 0.7)",
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
    // 村莊底部指令快捷列 (採集、收工)
    ActionMenu: {
        // 命令面板通常是黏性/智慧定位，這裡定義其基礎參數
        width: 380,
        height: 95,
        offsetX: 15,
        offsetY: 100
    },
    // 日誌通知欄
    LogPanel: {
        anchor: "BOTTOM_RIGHT",
        offsetX: 20,
        offsetY: 20,
        width: 420, height: 200,
        bgColor: "rgba(20, 10, 5, 0.9)",
        borderColor: "#8d6e63",
        fontSize: "14px",
        padding: "15px",
        maxLines: 100,
        shadow: "0 10px 40px rgba(0,0,0,0.8)"
    },
    // 中央警告提示 (HUD)
    WarningHUD: {
        anchor: "CENTER",
        offsetX: 0,
        offsetY: -100, // 稍微偏上方一點
        width: 450,
        height: "auto",
        fontSize: "18px",
        fontColor: "#fff176",
        bgColor: "rgba(45, 25, 15, 0.95)",
        borderColor: "#fbc02d",
        padding: "20px 50px",
        duration: 2000
    },
    // 地圖資源標籤 (名稱、等級與數量) - 這些是 Phaser 世界座標標籤
    MapResourceLabels: {
        name: {
            fontSize: "bold 14px Arial",
            color: "#ffffff",
            offsetY: -30,
            outlineColor: "rgba(0,0,0,0.8)",
            outlineWidth: 3
        },
        // ... (其餘配置保持不變，因為它們是相對於世界實體的偏移)
        level: {
            fontSize: "bold 11px Arial",
            color: "#fff176",
            offsetY: 30,
            outlineColor: "rgba(0,0,0,0.8)",
            outlineWidth: 2
        },
        amount: {
            fontSize: "bold 13px Arial",
            color: "#81d4fa",
            offsetY: 0,
            outlineColor: "rgba(0,0,0,0.8)",
            outlineWidth: 3
        }
    },
    // 建築施工進度條
    BuildingProgressBar: {
        widthScale: 1.1,
        height: 10,
        offsetY: 85,
        bgColor: "rgba(0, 0, 0, 0.7)",
        fillColor: "linear-gradient(90deg, #fbc02d, #ef6c00)",
        outlineColor: "#000000",
        // 特定建築的自定義偏移
        overrides: {
            village: { offsetY: 120, widthScale: 0.8 },
            town_center: { offsetY: 120, widthScale: 0.8 },
            farmhouse: { offsetY: 60, widthScale: 1.0 },
            timber_factory: { offsetY: 70 },
            stone_factory: { offsetY: 70 },
            mage_place: { offsetY: 80 }
        }
    },
    // 建築生產 HUD
    ProductionHUD: {
        width: 85,
        height: 12,
        barBg: "rgba(0,0,0,0.7)",
        barFill: "#4caf50",
        barBlocked: "#f44336",
        badgeBg: "#c62828"
    },
    // 村民狀態顏色
    VillagerColors: {
        IDLE: "#42a5f5",          // 亮藍色
        CONSTRUCTING: "#ffa726",  // 建造中，橘色
        WOOD: "#66bb6a",          // 綠色
        STONE: "#78909c",          // 灰色
        FOOD: "#ef5350",          // 紅色
        DEFAULT: "#42a5f5"         //預設值
    }
};
