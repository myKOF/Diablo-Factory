
$path = "src/ui/ui.js"
$content = Get-Content $path -Raw

$fixedAnchor = '    static applyAnchorStyle(el, cfg) {
        if (!el || !cfg) return;

        el.style.position = "absolute";

        // [新增] 優先套用保存的位置 (只要有 ID 且有記錄就套用)
        let hasSavedPos = false;
        if (el.id && this.uiPositions && this.uiPositions[el.id]) {
            const saved = this.uiPositions[el.id];
            el.style.left = saved.left;
            el.style.top = saved.top;
            el.style.right = "auto";
            el.style.bottom = "auto";
            el.style.transform = "none";
            el.style.margin = "0";
            hasSavedPos = true;
        }

        if (!hasSavedPos && cfg.anchor) {
            const offX = cfg.offsetX || 0;
            const offY = cfg.offsetY || 0;

            // 重置可能的樣式
            el.style.left = el.style.right = el.style.top = el.style.bottom = el.style.transform = "";

            switch (cfg.anchor) {
            case "TOP_LEFT":
                el.style.left = `${offX}px`;
                el.style.top = `${offY}px`;
                break;
            case "TOP_CENTER":
                el.style.left = "50%";
                el.style.top = `${offY}px`;
                el.style.transform = `translateX(-50%)`;
                if (offX) el.style.marginLeft = `${offX}px`;
                break;
            case "TOP_RIGHT":
                el.style.right = `${offX}px`;
                el.style.top = `${offY}px`;
                break;
            case "BOTTOM_LEFT":
                el.style.left = `${offX}px`;
                el.style.bottom = `${offY}px`;
                break;
            case "BOTTOM_CENTER":
                el.style.left = "50%";
                el.style.bottom = `${offY}px`;
                el.style.transform = `translateX(-50%)`;
                if (offX) el.style.marginLeft = `${offX}px`;
                break;
            case "BOTTOM_RIGHT":
                el.style.right = `${offX}px`;
                el.style.bottom = `${offY}px`;
                break;
            case "CENTER":
                el.style.left = "50%";
                el.style.top = "50%";
                el.style.transform = `translate(-50%, -50%)`;
                if (offX || offY) el.style.transform += ` translate(${offX}px, ${offY}px)`;
                break;
            case "LEFT_CENTER":
                el.style.left = `${offX}px`;
                el.style.top = "50%";
                el.style.transform = `translateY(-50%)`;
                if (offY) el.style.marginTop = `${offY}px`;
                break;
            case "RIGHT_CENTER":
                el.style.right = `${offX}px`;
                el.style.top = "50%";
                el.style.transform = `translateY(-50%)`;
                if (offY) el.style.marginTop = `${offY}px`;
                break;
            }
        }'

# Replace the mangled applyAnchorStyle
# Match from "static applyAnchorStyle" until "const dimensions"
$oldPattern = '(?s)static applyAnchorStyle\(el, cfg\).*?const dimensions'
$newContent = $fixedAnchor + "`r`n`r`n        // 尺寸設定 (支援寬高及最小/最大值)`r`n        const dimensions"

$content = [regex]::Replace($content, $oldPattern, $newContent)
Set-Content $path $content
