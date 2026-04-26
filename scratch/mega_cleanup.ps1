
$path = "src/ui/ui.js"
$content = Get-Content $path -Raw

# 1. Clean up the duplicated updateFactoryRecipeButtons section
$badBlock = '(?s)// 2\. 更新當前生產進度\s*let count = 0;.*?if \(badge\) \{.*?badge\.style\.display = count > 0 \? "flex" : "none";\s*\}\s*// 2\. 更新當前生產進度'
$fixedPart = '// 2. 更新當前生產進度'
$content = [regex]::Replace($content, $badBlock, $fixedPart)

# 2. Fix showContextMenu and applyAnchorStyle call
$scmPattern = '(?s)static showContextMenu\(entity, isConfirming = false\) \{.*?if \(cfg\.anchor\) \{.*?this\.applyAnchorStyle\(menu, cfg\);.*?\}'
$scmReplacement = 'static showContextMenu(entity, isConfirming = false) {
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
$content = [regex]::Replace($content, $scmPattern, $scmReplacement)

# 3. Fix the end of the file mangling
$endPattern = '(?s)GameEngine\.addLog\(`相機移動至城鎮中心 \(距離: \$\{Math\.round\(dist\)\}px\)`\);\s*\}\s*`r`n\}\s*`r`n`r`nwindow\.GameEngine = GameEngine;'
$endReplacement = 'GameEngine.addLog(`相機移動至城鎮中心 (距離: ${Math.round(dist)}px)`);
    }
}

window.GameEngine = GameEngine;'
$content = [regex]::Replace($content, $endPattern, $endReplacement)

Set-Content $path $content
