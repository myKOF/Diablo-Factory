/**
 * UI_CONFIG — 界面佈局與文字顯示的統一設定中心
 *
 * 所有與遊戲 HUD、面板、標籤有關的樣式數值都集中在這裡。
 * 修改此處的數值可直接調整 UI 位置、大小、顏色，
 * 無需改動任何渲染邏輯，方便快速做視覺微調。
 *
 * [錨點對齊]
 * 上方置中	anchor: "TOP_CENTER"
 * 下方置中	anchor: "BOTTOM_CENTER"
 * 左上角	anchor: "TOP_LEFT"
 * 右下角	anchor: "BOTTOM_RIGHT"
 * 畫面正中央	anchor: "CENTER"
 */
export const UI_CONFIG = {
    // -- 全局交互設定 ----------------------------------------------
    Interaction: {
        minDragDistance: 10,        // 最小拖動位移（像素），低於此值將被視為點擊，不觸發畫面拖動
    },

    // -- 框選範圍 (Selection Marquee) ----------------------------------
    SelectionMarquee: {
        fillColor: "#00ff00",         // 填滿顏色
        fillAlpha: 0.20,               // 填滿透明度
        borderColor: "#000000a4",       // 外框線條顏色
        borderAlpha: 0.8,              // 外框線條透明度
        borderWidth: 1                // 外框線條寬度
    },

    // -- 邊緣捲動系統 (EdgeScrolling) ------------------------------
    EdgeScrolling: {
        enabled: true,
        edgeWidth: 50,              // 邊緣感測寬度 (像素)
        moveSpeed: 1500,            // 移動速度 (像素/秒)
        mapCenter: { x: 960, y: 560 }
    },

    // -- 頂部資源列 ------------------------------------------------
    ResourceBar: {
        anchor: "TOP_CENTER",  // 錨點：頂部置中
        offsetX: 0,            // 水平偏移（像素）
        offsetY: 20,           // 與頂部的距離（像素）
        width: 1000, height: 44,
        fontSize: "20px",
        fontColor: "#ffca28",  // 資源數字的顏色（金黃色）
        glass: true,           // 啟用毛玻璃質感背景
        labels: {
            gold_ore: "🪙 金礦：",
            wood: "🪵 木材：",
            stone: "🪨 石頭：",
            fruit: "🍓 水果：",
            food: "🍖 食物：",
            iron_ore: "⛓️ 鐵礦：",
            coal_ore: "💎 煤炭：",
            magic_herb: "🌿 草藥：",
            wolf_hide: "🐺 狼皮：",
            bear_pelt: "🐻 熊皮：",
            healthPotion: "🧪 藥水：",
            soulFragment: "👻 靈魂：",
            villagerCount: "👨‍🌾 村民："
        }
    },
    // -- 左側建築操作面板 -----------------------------------------
    BuildingPanel: {
        anchor: "TOP_LEFT",               // 錨點：左上角
        offsetX: 30,                       // 距左側邊界的距離（像素）
        offsetY: 100,                      // 距頂部的距離（像素）
        width: 280, height: "calc(90% - 160px)",  // 寬高（高度動態計算）
        itemWidth: 240,                    // [核心新增] 全局統一項目寬度
        itemHeight: 60,                    // [核心修改] 全局統一項目高度 
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
            { id: "archer_place" },
            // -- 加工廠系列 [新加入，參數將從 buildings.csv 讀取] --
            { id: "timber_processing_plant" },
            { id: "smelting_plant" },
            { id: "stone_processing_plant" },
            { id: "tank_workshop" }
        ]
    },

    // -- 右下角日誌通知欄 -----------------------------------------
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
    // -- 中央警告提示 (HUD) ---------------------------------------
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
    // -- 地圖資源實體標籤（MapResourceLabels）-----------------------
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
            corpseOffsetY: 15,     // 屍體資源量顯示偏移
            align: 'center',
            outlineColor: "#000000",
            outlineAlpha: 0.8,
            outlineWidth: 3
        }
    },
    // -- 屍體外觀渲染配置 (CorpseRenderer) ---------------------------
    CorpseRenderer: {
        sheep: {
            bodyColor: "#ffffffff",
            bodyWidth: 50,         // 增加寬度 (原 32)
            bodyHeight: 30,        // 增加高度 (原 18)
            offsetY: 0,
            rotation: 0.25
        },
        wolf: {
            bodyColor: 0x546e7a,
            bodyWidth: 50,
            bodyHeight: 20,
            offsetY: 8,
            rotation: 0.25
        },
        bear: {
            bodyColor: 0x4e342e,
            bodyWidth: 60,
            bodyHeight: 30,
            offsetY: 8,
            rotation: 0.25
        },
        default: {
            bodyColor: 0x9e9e9e,
            bodyWidth: 28,
            bodyHeight: 16,
            offsetY: 8,
            rotation: 0.25
        }
    },
    // -- 大地圖建築標籤 (MapBuildingLabels) -----------------------
    MapBuildingLabels: {
        name: {
            fontSize: "bold 15px Arial",
            color: "#fbc02d",               // 建築名稱顏色 (琥珀黃)
            offsetX: 0,
            offsetY: 0,
            outlineColor: "#000000",
            outlineAlpha: 0.8,
            outlineWidth: 3
        },
        level: {
            fontSize: "14px Arial",
            color: "#ccf9ffff",
            offsetX: 0,
            offsetY: -20,
            outlineColor: "#000000",
            outlineAlpha: 0.8,
            outlineWidth: 2
        }
    },
    // -- 自然資源與實體幾何渲染配置（ResourceRenderer）--------------------
    // 控制渲染器在生成材質時的多邊形顏色、粗細與隨機變異範圍
    ResourceRenderer: {
        Tree: { // 樹木 (產出木材)
            trunkColor: "#795548",
            leafColors: ["#2e7d32", "#388e3c", "#43a047"],
            outlineColor: "#1b2d00",
            outlineWidth: 2,
            visualVariation: { tintRange: 0.2, minScale: 0.8, maxScale: 1.3 }
        },
        Rock: { // 岩石 (產出石頭)
            colors: ["#979797ff", "#9e9e9e", "#bdbdbd"],
            outlineColor: "#212121",
            outlineWidth: 2,
            visualVariation: { tintRange: 0.15, minScale: 0.7, maxScale: 1.2 }
        },
        BerryBush: { // 漿果叢 (產出水果/食物)
            leafColor: "#00d10aff",
            berryColor: "#ff5252",
            outlineColor: "#1b2d00",
            outlineWidth: 2,
            visualVariation: { tintRange: 0.1, minScale: 0.9, maxScale: 1.1 }
        },
        GoldMine: { // 金礦脈 (產出金礦)
            colors: ["#ffd740", "#ffc400", "#ffb300"],
            outlineColor: "#3e2723",
            outlineWidth: 2,
            visualVariation: { tintRange: 0.15, minScale: 0.8, maxScale: 1.25 }
        },
        IronMine: { // 鐵礦脈 (產出鐵礦)
            colors: ["#1c2b6eff", "#003550ff", "#424242ff"],
            outlineColor: "#263238",
            outlineWidth: 2,
            visualVariation: { tintRange: 0.15, minScale: 0.8, maxScale: 1.2 }
        },
        CoalMine: { // 煤礦脈 (產出煤炭)
            colors: ["#000000ff", "#080707ff", "#050202ff"],
            outlineColor: "#000000",
            outlineWidth: 2,
            visualVariation: { tintRange: 0.1, minScale: 0.8, maxScale: 1.15 }
        },
        RareHerb: { // 稀有草藥 (產出草藥/藥水材料)
            leafColor: "#43a047",
            flowerColor: "#e91e63",
            outlineColor: "#1b5e20",
            outlineWidth: 1.5,
            visualVariation: { tintRange: 0.2, minScale: 0.7, maxScale: 1.1 }
        },
        CrystalMine: { // 水晶礦脈 (產出稀有水晶資源)
            colors: ["#ffffffff", "#edf4f7ff", "#c4e2f0ff"],
            outlineColor: "#c1edffff",
            outlineWidth: 2,
            visualVariation: { tintRange: 0.2, minScale: 0.8, maxScale: 1.3 }
        },
        CopperMine: { // 銅礦脈 (產出銅礦)
            colors: ["#ad370cff", "#8d6e63", "#795548"],
            outlineColor: "#3e2723",
            outlineWidth: 2,
            visualVariation: { tintRange: 0.15, minScale: 0.8, maxScale: 1.2 }
        },
        SilverMine: { // 銀礦脈 (產出銀礦)
            colors: ["#e0e0e0", "#bdbdbd", "#9e9e9e"],
            outlineColor: "#424242",
            outlineWidth: 2,
            visualVariation: { tintRange: 0.1, minScale: 0.8, maxScale: 1.2 }
        },
        MithrilMine: { // 秘銀礦脈 (產出高級秘銀金屬)
            colors: ["#ddf35eff", "#42d5e9ff", "#20f19aff"],
            outlineColor: "#006064",
            outlineWidth: 2,
            visualVariation: { tintRange: 0.3, minScale: 0.9, maxScale: 1.4 }
        },
        WolfCorpse: { // 狼的屍體 (可採集狼皮)
            furColor: "#757575",
            outlineColor: "#212121",
            outlineWidth: 1.5,
            visualVariation: { tintRange: 0.1, minScale: 1.0, maxScale: 1.0 }
        },
        BearCorpse: { // 熊的屍體 (可採集熊皮)
            furColor: "#5d4037",
            outlineColor: "#212121",
            outlineWidth: 2,
            visualVariation: { tintRange: 0.1, minScale: 1.0, maxScale: 1.0 }
        },
        Campfire: { // 營火 (環境/功能實體)
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

    // -- 建築施工進度條（BuildingProgressBar）-------------------
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
    // -- 城鎮中心生產 HUD（ProductionHUD）-----------------------
    ProductionHUD: {
        width: 85,
        height: 12,
        barBg: "#000000",
        barAlpha: 0.7,
        barFill: "#4caf50",
        barBlocked: "#f44336",
        badgeBg: "#c62828"
    },
    // -- 工人村民狀態顏色（VillagerColors）--------------------------
    VillagerColors: {
        IDLE: "#42a5f5",
        CONSTRUCTING: "#b939068e",
        WOOD: "#388e3c",
        STONE: "#757575",
        FOOD: "#fd8763ff",
        FRUIT: "#fd8763ff",
        GOLD_ORE: "#e4b20dea",
        IRON_ORE: "#b0bec5",
        COAL_ORE: "#424242",
        MAGIC_HERB: "#81c784",
        WOLF_HIDE: "#a1887f",
        BEAR_PELT: "#5d4037",
        SWORDSMAN: "#b0bec5",
        MAGE: "#9575cd",
        ARCHER: "#81c784",
        ENEMY_LABEL: "#ff4444",
        DEFAULT: "#42a5f5"
    },
    // -- 工人背負資源顏色 (CargoColors) ----------------------------------
    CargoColors: {
        WOOD: "#1ce026ff",
        STONE: "#acacacff",
        FOOD: "#ff5816ff",
        FRUIT: "#ff5816ff",
        GOLD_ORE: "#ffe047ff",
        IRON_ORE: "#90a4aeff",
        COAL_ORE: "#212121ff",
        MAGIC_HERB: "#b9f6ca",
        WOLF_HIDE: "#d7ccc8",
        BEAR_PELT: "#8d6e63",
        DEFAULT: "#ad9191ff" // 預設籃子顏色
    },

    // -- NPC及敵人 文字標籤顯示 (NPCLabel) ----------------------------------
    NPCLabel: {
        fontSize: "bold 14px Arial",
        enemyColor: "#ff4444",
        neutralColor: "#4caf50",         // 中立單位顏色 (綠色)
        offsetY: -35,
        shadowColor: "rgba(0, 0, 0, 0.6)"
    },
    // -- 地圖格網（Grid）------------------------------------------
    Grid: {
        mainColor: "#000000",
        mainAlpha: 0.12,
        subColor: "#000000",
        subAlpha: 0.03,
        floorColor: "#ffffff",
        texture: "assets/grass_simple.png", // 已換成簡單版紋理
        useTexture: true,
        textureAlpha: 0.75, // 透明度
        textureScale: 0.2, // 尺寸密度 
        textureTint: "#ffffff" //貼圖混色
    },
    // -- 倉庫選單 (WarehousePanel) ----------------------------------
    WarehouseButton: {
        anchor: "BOTTOM_LEFT",
        offsetX: 80, offsetY: 80,
        width: 60, height: 60,
        fontSize: "30px",
        bgColor: "#1e1e1e",
        bgAlpha: 0.8,
        borderColor: "#fbc02d",
        icon: "📦"
    },
    WarehousePanel: {
        anchor: "CENTER",
        width: 600, height: "auto",
        title: "📦 資源倉庫",
        glass: true
    },
    // -- 設置選單 (SettingsPanel) ----------------------------------
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
    // -- 座標顯示標籤 (CoordsDisplay) ----------------------------------
    CoordsDisplay: {
        anchor: "TOP_LEFT",
        offsetX: 85, offsetY: 20,
        width: "auto", height: 50,
        fontSize: "18px",
        fontColor: "#ffffff",
        glass: true,
        padding: "0 20px"
    },
    // -- FPS 顯示 (FPSDisplay) ----------------------------------
    FPSDisplay: {
        anchor: "TOP_LEFT",
        offsetX: 280, offsetY: 20,
        width: "auto", height: 50,
        fontSize: "18px",
        fontColor: "#4caf50",
        glass: true,
        padding: "0 20px"
    },
    // -- 村莊中心指針 (TownCenterPointer) --------------------------
    TownCenterPointer: {
        width: 76, height: 76,
        fontSize: "38px",
        bgColor: "#71ffa0ff",              // 亮綠色
        bgAlpha: 0.95,
        borderColor: "#ffffff",
        icon: "🏰",
        arrowIcon: "▶",
        distanceFontSize: "12px",        // 距離文字大小
        distanceColor: "#ffffff",        // 距離文字顏色
        margin: 80,
        panSpeed: 800
    },
    // -- 尋路系統設定 (Pathfinding) ---------------------------------
    Pathfinding: {
        debugColor: "#00ff00",
        iterationsPerFrame: 1000
    },
    // -- 建築集結點 (RallyPoint) ------------------------------------
    RallyPoint: {
        lineColor: "#ffffffff",
        lineAlpha: 1,
        lineDash: [10, 5],
        circleColor: "#ffffffff",
        circleAlpha: 0.6,
        circleMinRadius: 8,
        circleMaxRadius: 15,
        pulseSpeed: 0.005
    },
    // -- 單位動畫設定 (Animation) ------------------------------------
    Animation: {
        runningFreq: 5,
        wanderingFreq: 1.5,
        breathingFreq: 1,
        workFreq: 2,
        armSwingFreqRunning: 5,
        armSwingFreqWandering: 1
    },
    // -- 單位視界圈 (VisionRange) ----------------------------------
    VisionRange: {
        lineColor: "#ff0000",
        lineAlpha: 0.8,
        lineWidth: 1.5,
    },
    // -- 單位血條 (UnitHealthBar) ----------------------------------
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
    // -- 建築碰撞與對齊設置 (BuildingCollision) -------------------------
    BuildingCollision: {
        buffer: 10,
        feetOffset: 8
    },
    // -- 尋路目標提示 (PathfindingTarget) --------------------------
    PathfindingTarget: {
        enemyColor: "#ffffffff",
        floorColor: "#ffffffff",
        circleMinRadius: 6,
        circleMaxRadius: 14,
        pulseSpeed: 0.01,
        alpha: 0.7,
        clickEffectDuration: 500
    },
    // -- 資源選取與描邊效果 (ResourceSelection) --------------------------
    ResourceSelection: {
        glowColor: "#00ff0dd5",          // 選取發光顏色
        targetColor: "#00ff0dd5",        // 工人目標發光顏色
        glowOuterStrength: 5,          // 發光外部強度 (調整此值可讓框變厚)
        glowInnerStrength: 0,          // 發光內部強度
        glowAlpha: 0.2,                // 發光基礎透明度
        glowKnockOut: true,            // [重要] 是否隱藏本體圖形 (只留外框)
        glowQuality: 6,               // 發光品質
        selectionScale: 1,           // 僅縮放發光外框的大小，不改變物體圖形
        corpseSelectionScale: 2.5,   // [新增] 屍體特有的選取框比例 (寬高係數)
        depth: 15                      // 顯示深度
    },
    // -- 建築指令選單 ---------------------------
    ActionMenu: {
        anchor: "BOTTOM_CENTER",         // 錨點位置 (底部置中)
        offsetX: 0,                      // 水平偏移
        offsetY: 30,                     // 垂直偏移 (距底部距離)
        width: 440,                      // 面板寬度
        minWidth: 440,                   // 最小寬度
        height: 200,                     // 面板高度 (確保內容量充足)
        glass: true,                     // 啟用毛玻璃質感背景
        shadowColor: "#000000",          // 陰影顏色
        shadowAlpha: 0.8                 // 陰影透明度
    },
    // -- 建築指令選單標頭 (ActionMenuHeader) --------------------------
    ActionMenuHeader: {
        levelFontSize: "20px",          // 大等級文字
        nameFontSize: "20px",           // 建築名稱文字
        nameColor: "#fbc02d",           // 建築名稱顏色
        requirementFontSize: "15px",    // 升級條件文字大小
        requirementColor: "#ff9100ff",    // 升級條件顏色
        // -- 升級資訊區尺寸 (Upgrade Info Panel) --
        upgradeInfoWidth: 230,          // 升級框寬度
        upgradeInfoHeight: 60,          // 升級框高度
        upgradeInfoPadding: "0 8px",   // 內部間距 (第一個數字是上下、第二個是左右)
        upgradeInfoLabelFontSize: "13px", // "升級至 Lv.X" 標籤字體大小
        upgradeInfoCostFontSize: "11px",  // 資源消耗數字字體大小
        upgradeInfoResourceGap: 2,     // 每個資源之間的間隙
        upgradeBtnSize: 46,             // 升級按鈕大小 (正方形)
        // -- 區塊偏移自訂 (Offsets) --
        leftOffset: { x: 0, y: 0 },     // 左側標題區偏移
        rightOffset: { x: 0, y: -5 },    // 右側升級框區偏移
        requirementOffset: { x: -10, y: -15 }, // 升級條件文字偏移
        actionGridOffset: { x: 0, y: 5 },  // 指令按鈕區偏移
        workerControlOffset: { x: 0, y: 8 }, // 採集人數面板偏移 (當錨點為 CENTER 時)
        // -- 其他設定 --
        upgradeBtnBg: "#4caf50",         // 升級按鈕背景色
        upgradeBtnHoverBg: "#66bb6a",    // 懸停色
        upgradeBtnShadow: "0 4px 12px rgba(76, 175, 80, 0.3)",
        resSufficientColor: "#ffca28",  // 資源足夠時的顏色
        resInsufficientColor: "#ff5252", // 資源不足時的顏色
        cancelBtnBg: "#d32f2f",         // 取消按鈕背景色
        cancelBtnHoverBg: "#f44336",    // 取消按鈕懸停色
        cancelBtnFontSize: "13px",      // 取消按鈕字體大小
        // -- 升級進度條顏色 --
        progressColorStart: "#4caf50",  // 選單內進度條漸層起點
        progressColorEnd: "#81c784",    // 選單內進度條漸層終點
        worldProgressColor: "#4caf50",  // 建築物上方進度條顏色
        worldProgressBg: "rgba(0,0,0,0.6)" // 建築物上方進度條背景
    },

    // -- 戰鬥表現相關參數 (Combat Visuals) -----------------------
    Combat: {
        scanInterval: 0.3,          // 自動尋敵頻率 (秒)
        chaseSearchInterval: 10,    // 追擊路徑刷新頻率 (幀)

        arrow: {
            speed: 600,             // 飛行速度
            color: "#d62d2d63",       // 顏色
            size: 4,                // 粗細/大小
            arcHeightMax: 60,      // 最大弧度高度
            arcHeightFactor: 0.3    // 距離對弧度的影響係數
        },
        fireball: {
            speed: 450,             // 飛行速度
            colorCore: "#ffff00",   // 核心顏色 (黃)
            colorGlow: "#ffa500",   // 發光顏色 (橘)
            colorTrail: "#ff5500",  // 拖尾顏色 (紅)
            sizeBase: 6             // 基礎大小
        }
    },
    // -- 中立npc外框選取樣式 (NeutralSelection) --------------------------
    NeutralSelection: {
        glowColor: "#ff9100",           // 橘色外框 (橘黃)
        hpFillColor: "#ff9100",         // 橘色血條
        selectionRingColor: 0xff9100    // 橘色選取圈
    },

    // -- 投石車攻擊特效相關配置 (Effects) ---------------------------------------
    effects: {
        // [保留] 前面的採礦與灰塵設定 (預留擴展空間)

        // 3. 投石車火球拖尾 (複合特效)
        flamingBoulder: {
            // 上層：高熱火焰拖尾
            fire: {
                speed: { min: 10, max: 30 },        // 速度放慢，讓火焰留在軌跡上
                angle: { min: 0, max: 360 },        // 微弱的向外擴散
                gravityY: -100,                     // 火焰極輕，明顯向上飄升
                scale: { start: 1, end: 0 },      // 從大火縮小至消失
                alpha: { start: 1, end: 0 },        // 透明度漸弱
                lifespan: 300,                      // 存活極短，製造「閃爍」感
                blendMode: 'ADD',                   // 核心：發光疊加
                tint: [0xffffff, 0xffaa00, 0xff0000], // 白 -> 黃 -> 紅 (高溫退散)
                frequency: 15                       // 高頻率噴發，形成連續火線
            },

            // 底層：焦黑煙塵拖尾
            smoke: {
                speed: { min: 5, max: 20 },
                angle: { min: 0, max: 360 },
                gravityY: -20,                      // 煙霧較重，微向上飄
                scale: { start: 0.3, end: 1.5 },    // 核心：煙霧會隨著時間「膨脹散開」
                alpha: { start: 0.5, end: 0 },      // 半透明開始
                lifespan: 700,                      // 存活較長，留在空中
                blendMode: 'NORMAL',                // 正常遮罩，用來蓋住背景
                tint: 0x222222,                     // 接近黑色的深灰
                frequency: 30                       // 噴發頻率比火低，節省效能
            }
        }
    },
    // -- 流水線加工廠 UI (SynthesisUI) --------------------------
    SynthesisUI: {
        panelWidth: 320,                // 加工選單面板寬度 (像素)
        lockedItemAlpha: 0.5,           // 未解鎖項目的透明度 (0.0 ~ 1.0)
        lockedItemTint: 0x555555,        // 未解鎖項目的色調 (置灰效果)
        progressBarColor: "#4caf50",    // 生產進度條填充顏色 (綠色)
        workerEfficiencyText: "生產效率: {0}%" // 效率顯示文字格式，{0} 會被替換為百分比數字
    }
};
