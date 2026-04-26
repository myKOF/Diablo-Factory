
$path = "src/ui/ui.js"
$content = Get-Content $path -Raw
# 移除兩次相連的大括號，且下方接的是 "// 尺寸設定"
$old = '(?m)^\s*\}\s*^\s*\}\s*^\s*// 尺寸設定'
$new = '            }

        // 尺寸設定'

$content = [regex]::Replace($content, $old, $new)
Set-Content $path $content
