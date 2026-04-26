
$path = "src/ui/ui.js"
$content = Get-Content $path -Raw

# 修正 applyAnchorStyle 遺漏的結束大括號
$target = 'else if \(cfg\.shadow\) el\.style\.boxShadow = cfg\.shadow;\s*static refreshBuildingList'
$fix = 'else if (cfg.shadow) el.style.boxShadow = cfg.shadow;`r`n    }`r`n`r`n    static refreshBuildingList'

$content = [regex]::Replace($content, $target, $fix)
Set-Content $path $content
