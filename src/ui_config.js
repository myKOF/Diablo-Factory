/**
 * 界面佈局與文字顯示設置
 * 修改此處的數值可直接調整 UI 位置
 */
export const UI_CONFIG = {
    // 頂部資源列
    ResourceBar: {
        x: 20, y: 20,
        width: 1000, height: 60,
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
        x: 20, y: 100,
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
        x: 1480, y: 800,
        width: 420, height: 250,
        bgColor: "rgba(20, 10, 5, 0.85)",
        maxLines: 8
    }
};
