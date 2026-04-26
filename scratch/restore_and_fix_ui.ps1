
$path = "src/ui/ui.js"
$content = Get-Content $path -Raw

# Correct handleWorldClick clicked block
$correctBlock = '        if (clicked) {
            const now = Date.now();
            const buildingId = clicked.id || `${clicked.type1}_${clicked.x}_${clicked.y}`;

            // 雙擊全選邏輯
            const isDoubleClick = (GameEngine.state.lastSelectedBuildingId === buildingId && (now - GameEngine.state.lastSelectionTime < 500));

            if (isDoubleClick) {
                const type1 = clicked.type1;
                const scene = window.PhaserScene;
                if (scene) {
                    const view = scene.cameras.main.worldView;
                    const visibleBuildings = GameEngine.state.mapEntities.filter(e => 
                        e.type1 === type1 && 
                        e.x >= view.x && e.x <= view.x + view.width && 
                        e.y >= view.y && e.y <= view.y + view.height
                    );
                    GameEngine.state.selectedBuildingIds = visibleBuildings.map(e => e.id || `${e.type1}_${e.x}_${e.y}`);
                    GameEngine.addLog(`[選取] 相同類型建築共 ${visibleBuildings.length} 個。`);
                }
            } else {
                GameEngine.state.selectedBuildingIds = [buildingId];
                GameEngine.state.selectedBuildingId = clicked.id;
            }

            GameEngine.state.lastSelectionTime = now;
            GameEngine.state.lastSelectedBuildingId = buildingId;
            GameEngine.state.selectedUnitIds = [];
            GameEngine.state.selectedResourceId = null;

            if (!clicked.isUnderConstruction && (clicked.type1 === "storehouse" || clicked.type2 === "storehouse")) {
                const panel = document.getElementById("warehouse_panel");
                if (panel && panel.style.display === "none") {
                    this.toggleWarehousePanel(clicked);
                }
            } else {
                this.showContextMenu(clicked);
            }
            return;
        }'

# Pattern to find the mangled if (clicked) block until the logistics menu loop
$oldPattern = '(?s)if \(clicked\) \{.*?const distToSegmentSquared'
$newContent = $correctBlock + "`r`n`r`n        // [核心修復] 物流線點擊優先級降至建築之下`r`n        const distToSegmentSquared"

$content = [regex]::Replace($content, $oldPattern, $newContent)

# Also fix the showContextMenu method while we are at it
$showContextStart = '    static showContextMenu\(entity, isConfirming = false\) \{'
$showContextEnd = '        // 套用錨點樣式 \(包含寬高、最小寬度等尺寸設定\)'
$newShowContext = '    static showContextMenu(entity, isConfirming = false) {
        this.activeMenuEntity = entity;
        const menu = document.getElementById("context_menu");
        const cfg = UI_CONFIG.ActionMenu;

        // 設置動態識別碼，使不同建築擁有獨立位置
        const customId = `context_menu_${entity.id || `${entity.type1}_${entity.x}_${entity.y}`}`;
        menu.dataset.dragId = customId;'

$content = [regex]::Replace($content, '(?s)' + $showContextStart + '.*?' + $showContextEnd, $newShowContext + "`r`n`r`n        // 套用錨點樣式 (包含寬高、最小寬度等尺寸設定)")

# Update applyAnchorStyle call inside showContextMenu
$oldApply = 'if \(cfg\.anchor\) \{.*?this\.applyAnchorStyle\(menu, cfg\);.*?\}'
$newApply = 'if (cfg.anchor) {
            this.applyAnchorStyle(menu, cfg, customId);
        }'
$content = [regex]::Replace($content, $oldApply, $newApply)

Set-Content $path $content
