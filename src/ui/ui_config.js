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
    // ── 全局交互設定 ──────────────────────────────────────────────
    Interaction: {
        minDragDistance: 15,        // 最小拖動位移（像素），低於此值將被視為點擊，不觸發畫面拖動
    },

    // ── 頂部資源列 ────────────────────────────────────────────────
    ResourceBar: {
        anchor: "TOP_CENTER",  // 錨點：頂部置中
        offsetX: 0,            // 水平偏移（像素）
        offsetY: 20,           // 與頂部的距離（像素）
        width: 1000, height: 44,
        fontSize: "20px",
        fontColor: "#ffca28",  // 資源數字的顏色（金黃色）
        glass: true,           // 啟用毛玻璃質感背景
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
    BuildingPanel: {
        anchor: "TOP_LEFT",               // 錨點：左上角
        offsetX: 30,                       // 距左側邊界的距離（像素）
        offsetY: 100,                      // 距頂部的距離（像素）
        width: 280, height: "calc(90% - 160px)",  // 寬高（高度動態計算）
        itemHeight: 60,                    // 每個建築項目列的高度
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
    // ── 建築互動指令選單 ───────────────────────────
    ActionMenu: {
        anchor: "BOTTOM_CENTER",
        offsetX: 0,
        offsetY: 30,
        width: "auto",
        minWidth: 400,
        height: "auto",
        glass: true,
        shadowColor: "#000000",
        shadowAlpha: 0.8
    },
    // ── 右下角日誌通知欄 ─────────────────────────────────────────
    LogPanel: {
        anchor: "BOTTOM_RIGHT",
        offsetX: 20,
        offsetY: 20,
        width: 420, height: 200,
        bgColor: "#140a05",
        bgAlpha: 0.9,
        borderColor: "#8d6e63",
        fontSize: "14px",
        padding: "15px",
        maxLines: 100,
        shadowColor: "#000000",
        shadowAlpha: 0.8
    },
    // ── 中央警告提示 (HUD) ───────────────────────────────────────
    WarningHUD: {
        anchor: "TOP_CENTER",
        offsetX: 0,
        offsetY: 100,
        width: 450,
        height: "auto",
        fontSize: "18px",
        fontColor: "#fff176",
        bgColor: "#2d190f",
        bgAlpha: 0.95,
        borderColor: "#fbc02d",
        padding: "20px 50px",
        duration: 2000
    },
    // ── 地圖實體標籤（MapResourceLabels）───────────────────────
    MapResourceLabels: {
        name: {
            fontSize: "bold 13px Arial",
            color: "#ffffff",
            offsetX: 0,
            offsetY: 35,
            buildingOffsetY: -15,
            align: 'center',
            outlineColor: "#000000",
            outlineAlpha: 0.8,
            outlineWidth: 3
        },
        level: {
            fontSize: "bold 12px Arial",
            color: "#fff176",
            offsetX: 0,
            offsetY: -40,
            buildingLevelOffsetY: -35,
            align: 'center',
            outlineColor: "#000000",
            outlineAlpha: 0.8,
            outlineWidth: 2
        },
        amount: {
            fontSize: "bold 13px Arial",
            color: "#81d4fa",
            offsetX: 0,
            offsetY: 0,
            align: 'center',
            outlineColor: "#000000",
            outlineAlpha: 0.8,
            outlineWidth: 3
        }
    },
    // ── 自然資源渲染配置（ResourceRenderer）────────────────────
    ResourceRenderer: {
        Tree: {
            trunkColor: "#5d4037",
            leafColors: ["#1b5e20", "#2e7d32", "#43a047"],
            outlineColor: "#051b07",
            outlineWidth: 2,
            visualVariation: { minScale: 0.9, maxScale: 1.2, tintRange: 0.5 }
        },
        Rock: {
            colors: ["#424242", "#212121", "#616161"],
            outlineColor: "#000000",
            outlineWidth: 2,
            visualVariation: { minScale: 0.9, maxScale: 1.2, tintRange: 0.5 }
        },
        BerryBush: {
            leafColor: "#ffa000",
            berryColor: "#d50000",
            outlineColor: "#bf360c",
            outlineWidth: 2,
            visualVariation: { minScale: 0.9, maxScale: 1.2, tintRange: 0.5 }
        },
        GoldMine: {
            colors: ["#ffd700", "#ffa000", "#ffea00"],
            outlineColor: "#4e342e",
            outlineWidth: 2,
            visualVariation: { minScale: 0.9, maxScale: 1.2, tintRange: 0.3 }
        },
        Campfire: {
            groundColor: "#8f4c00d8",
            woodColor: "#795548",
            woodOutline: "#6d352bff",
            particle: {
                lifespan: { min: 700, max: 1200 },
                speedY: { min: -70, max: -130 },
                scale: { start: 0.9, end: 0.1 },
                alpha: { start: 0.8, end: 0.05 },
                tints: ["#ffff00", "#ffa500", "#ff4500", "#ff0000"],
                blendMode: 'NORMAL',
                frequency: 30,
                spreadX: 18,
                offsetY: 10
            }
        }
    },
    // ── 建築施工進度條（BuildingProgressBar）───────────────────
    BuildingProgressBar: {
        widthScale: 0.95,
        height: 8,
        align: "bottom",
        offsetY: 0,
        bgColor: "#000000",
        bgAlpha: 0.7,
        fillColor: "#fbc02d",
        outlineColor: "#000000",
        overrides: {
            village: { widthScale: 0.8 },
            town_center: { widthScale: 0.8 }
        }
    },
    // ── 城鎮中心生產 HUD（ProductionHUD）───────────────────────
    ProductionHUD: {
        width: 85,
        height: 12,
        barBg: "#000000",
        barAlpha: 0.7,
        barFill: "#4caf50",
        barBlocked: "#f44336",
        badgeBg: "#c62828"
    },
    // ── 工人村民狀態顏色（VillagerColors）──────────────────────────
    VillagerColors: {
        IDLE: "#42a5f5",
        CONSTRUCTING: "#b939068e",
        WOOD: "#388e3c",
        STONE: "#757575",
        FOOD: "#fd6563ff",
        GOLD: "#ffcd28ea",
        SWORDSMAN: "#b0bec5",
        MAGE: "#9575cd",
        ARCHER: "#81c784",
        ENEMY_LABEL: "#ff4444",
        DEFAULT: "#42a5f5"
    },
    // ── 工人背負資源顏色 (CargoColors) ──────────────────────────────────
    CargoColors: {
        WOOD: "#27ff32ff",
        STONE: "#acacacff",
        FOOD: "#ff3131ff",
        GOLD: "#bda21bff",
        DEFAULT: "#ad9191ff" // 預設籃子顏色
    },
    // ── NPC及敵人 文字標籤顯示 (NPCLabel) ──────────────────────────────────
    NPCLabel: {
        fontSize: "bold 14px Arial",
        enemyColor: "#ff4444",
        offsetY: -35,
        shadowColor: "rgba(0, 0, 0, 0.6)"
    },
    // ── 地圖格網（Grid）──────────────────────────────────────────
    Grid: {
        mainColor: "#000000",
        mainAlpha: 0.12,
        subColor: "#000000",
        subAlpha: 0.03,
        floorColor: "#ffffff"
    },
    // ── 設置選單 (SettingsPanel) ──────────────────────────────────
    SettingsButton: {
        anchor: "TOP_LEFT",
        offsetX: 20, offsetY: 20,
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
    // ── 座標顯示標籤 (CoordsDisplay) ──────────────────────────────────
    CoordsDisplay: {
        anchor: "TOP_LEFT",
        offsetX: 85, offsetY: 20,
        width: "auto", height: 50,
        fontSize: "18px",
        fontColor: "#ffffff",
        glass: true,
        padding: "0 20px"
    },
    // ── FPS 顯示 (FPSDisplay) ──────────────────────────────────
    FPSDisplay: {
        anchor: "TOP_LEFT",
        offsetX: 280, offsetY: 20,
        width: "auto", height: 50,
        fontSize: "18px",
        fontColor: "#4caf50",
        glass: true,
        padding: "0 20px"
    },
    // ── 村莊中心指針 (TownCenterPointer) ──────────────────────────
    TownCenterPointer: {
        width: 76, height: 76,
        fontSize: "38px",
        bgColor: "#fbc02d",
        bgAlpha: 0.95,
        borderColor: "#ffffff",
        icon: "🏰",
        arrowIcon: "▶",
        margin: 80,
        panSpeed: 800
    },
    // ── 尋路系統設定 (Pathfinding) ─────────────────────────────────
    Pathfinding: {
        debugColor: "#00ff00",
        iterationsPerFrame: 1000
    },
    // ── 建築集結點 (RallyPoint) ────────────────────────────────────
    RallyPoint: {
        lineColor: "#0026fcff",
        lineAlpha: 1,
        lineDash: [10, 5],
        circleColor: "#00e5ff",
        circleAlpha: 0.6,
        circleMinRadius: 8,
        circleMaxRadius: 15,
        pulseSpeed: 0.005
    },
    // ── 單位動畫設定 (Animation) ────────────────────────────────────
    Animation: {
        runningFreq: 5,
        wanderingFreq: 1.5,
        breathingFreq: 1,
        workFreq: 2,
        armSwingFreqRunning: 5,
        armSwingFreqWandering: 1
    },
    // ── 單位視界圈 (VisionRange) ──────────────────────────────────
    VisionRange: {
        lineColor: "#ff0000",
        lineAlpha: 0.8,
        lineWidth: 1.5,
    },
    // ── 單位血條 (UnitHealthBar) ──────────────────────────────────
    UnitHealthBar: {
        width: 40,
        height: 6,
        offsetY: 30,
        bgColor: "#000000",
        bgAlpha: 0.7,
        fillColor: "#ff5252",
        borderColor: "#ffffff",
        borderAlpha: 0.5,
        showTimer: 1.5
    },
    // ── 建築碰撞與對齊設置 (BuildingCollision) ─────────────────────────
    BuildingCollision: {
        buffer: 20,
        feetOffset: 18
    },
    // ── 尋路目標提示 (PathfindingTarget) ──────────────────────────
    PathfindingTarget: {
        enemyColor: "#ff4444",
        floorColor: "#00e5ff",
        circleMinRadius: 6,
        circleMaxRadius: 14,
        pulseSpeed: 0.01,
        alpha: 0.7,
        clickEffectDuration: 500
    },
    // ── 資源選取與描邊效果 (ResourceSelection) ──────────────────────────
    ResourceSelection: {
        glowColor: "#00ff0dd5",          // 選取發光顏色
        targetColor: "#00ff0dd5",        // 工人目標發光顏色
        glowOuterStrength: 5,          // 發光外部強度 (調整此值可讓框變厚)
        glowInnerStrength: 0,          // 發光內部強度
        glowAlpha: 0.2,                // 發光基礎透明度
        glowKnockOut: true,            // [重要] 是否隱藏本體圖形 (只留外框)
        glowQuality: 12,               // 發光品質
        selectionScale: 1,           // 僅縮放發光外框的大小，不改變物體圖形
        depth: 15                      // 顯示深度
    }
};
