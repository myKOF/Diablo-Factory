
$path = "src/ui/ui.js"
$content = Get-Content $path -Raw

# 1. Fix showContextMenu
$oldSCM = '(?s)static showContextMenu\(entity, isConfirming = false\) \{.*?if \(cfg\.anchor\) \{.*?this\.applyAnchorStyle\(menu, cfg\);.*?\}'
$newSCM = 'static showContextMenu(entity, isConfirming = false) {
        this.activeMenuEntity = entity;
        const menu = document.getElementById("context_menu");
        const cfg = UI_CONFIG.ActionMenu;

        // 設置動態識別碼，使不同建築擁有獨立位置
        const customId = `context_menu_${entity.id || `${entity.type1}_${entity.x}_${entity.y}`}`;
        menu.dataset.dragId = customId;

        // 套用錨點樣式 (包含寬高、最小寬度等尺寸設定)
        if (cfg.anchor) {
            this.applyAnchorStyle(menu, cfg, customId);
        }'

$content = [regex]::Replace($content, $oldSCM, $newSCM)

# 2. Fix toggleWarehousePanel
$oldTWP = '(?s)static toggleWarehousePanel\(entity = null\) \{.*?if \(panel\.style\.display === "none"\) \{.*?this\.hideContextMenu\(\);.*?this\.hideSettingsPanel\(\);.*?this\.renderWarehousePanel\(\);.*?panel\.style\.display = "flex";'
$newTWP = 'static toggleWarehousePanel(entity = null) {
        const panel = document.getElementById("warehouse_panel");
        if (!panel) return;

        if (entity) {
            this.activeWarehouseEntity = entity;
        }

        if (panel.style.display === "none") {
            this.hideContextMenu(); // 先關閉其它選單
            this.hideSettingsPanel();
            
            const ent = this.activeWarehouseEntity;
            const customId = ent ? `warehouse_panel_${ent.id || `${ent.type1}_${ent.x}_${ent.y}`}` : "warehouse_panel_global";
            panel.dataset.dragId = customId;
            this.applyAnchorStyle(panel, UI_CONFIG.WarehousePanel, customId);

            this.renderWarehousePanel();
            panel.style.display = "flex";'

$content = [regex]::Replace($content, $oldTWP, $newTWP)

# 3. Fix the extra brace at the end of the file
# If Final level is -1, it means we have one too many }
# But let's be careful. Let's just remove the very last } before window.UIManager = UIManager;
$oldEnd = '(?s)\}\s*\}\s*window\.GameEngine'
$newEnd = '    }`r`n}`r`n`r`nwindow.GameEngine' # Restore standard ending
$content = [regex]::Replace($content, $oldEnd, $newEnd)

Set-Content $path $content
