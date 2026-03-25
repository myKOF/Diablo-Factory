import { GameEngine } from "./game_systems.js";
import { AnimationRenderer } from "./renderer.js";
import { UIManager } from "./ui.js";

/**
 * 遊戲啟動與環境限制
 * 這部分負責初始化遊戲、屏蔽右鍵與縮放，並保留 F5 功能。
 */
window.onload = () => {
    // 屏蔽全域右鍵菜單 (防止用戶覺得是網頁遊戲)
    document.oncontextmenu = (e) => {
        e.preventDefault();
        return false;
    };

    // 屏蔽特定的快捷鍵（如 Ctrl+S, Ctrl+U），只保留 F5 (KeyCode 116)
    window.addEventListener("keydown", (e) => {
        // 允許 F5 (刷新) 或 F12 (測試用，可選)
        if (e.key === "F5" || e.key === "F12") return;

        // 屏蔽 Ctrl/Meta 組合鍵
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            e.preventDefault();
        }
    });

    initGame();
};

async function initGame() {
    console.log("暗黑煉金工廠：核心模組加載中...");

    // 1. 初始化渲染系統
    window.AnimationRenderer = AnimationRenderer;
    AnimationRenderer.init();

    // 2. 初始化 UI 管理器
    UIManager.init();

    // 3. 啟動遊戲邏輯循環 (非同步加載表單)
    await GameEngine.start();
    console.log("所有系統啟動完畢。");
}
