
$path = "src/ui/ui.js"
$content = Get-Content $path -Raw

# 刪除 applyAnchorStyle 內部的重複部分與錯誤的大括號
$badBlock = '(?s)\s*\}\s*// 尺寸設定 \(支援寬高及最小/最大值\)\s*const dimensions = \[''width'', ''height'', ''minWidth'', ''maxWidth'', ''minHeight'', ''maxHeight''\];.*?else if \(cfg\.shadow\) el\.style\.boxShadow = cfg\.shadow;\s*\}'
$content = [regex]::Replace($content, $badBlock, "")

# 確保末尾只有兩個大括號
$content = $content.TrimEnd()
while ($content.EndsWith("}")) { $content = $content.Substring(0, $content.Length - 1).TrimEnd() }
$content += "`r`n    }`r`n}`r`n`r`nwindow.GameEngine = GameEngine;`r`nwindow.UIManager = UIManager;"

Set-Content $path $content
