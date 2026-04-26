
$path = "src/ui/ui.js"
$content = Get-Content $path -Raw

# 修正被毀損的字串與多餘的大括號
$badEnd = '(?s)GameEngine\.addLog\(相機移動至城鎮中心 \(距離: \\px\)\);\s*\}\s*\}\s*window\.GameEngine = GameEngine;'
$goodEnd = 'GameEngine.addLog(`相機移動至城鎮中心 (距離: ${Math.round(dist)}px)`);
    }
}

window.GameEngine = GameEngine;'

$content = [regex]::Replace($content, $badEnd, $goodEnd)
Set-Content $path $content
