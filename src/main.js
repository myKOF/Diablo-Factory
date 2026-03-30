import { GameEngine } from "./game_systems.js";
import { PhaserRenderer } from "./phaser_renderer.js";
import { UIManager } from "./ui.js";

/**
 * 遊戲啟動與環境限制
 * 這部分負責初始化遊戲、屏蔽右鍵與縮放，並保留 F5 功能。
 */
window.onload = () => {
    // 屏蔽全域右鍵菜單
    document.oncontextmenu = (e) => {
        e.preventDefault();
        return false;
    };

    // 屏蔽特定的快捷鍵，只保留 F5 (KeyCode 116)
    window.addEventListener("keydown", (e) => {
        if (e.key === "F5" || e.key === "F12") return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            e.preventDefault();
        }
    });

    initResizeHandler();
    initGame();
};

function initResizeHandler() {
    const container = document.getElementById("game_container");
    if (!container) return;

    const handleResize = () => {
        const ww = window.innerWidth;
        const wh = window.innerHeight;
        const baseW = 1920;
        const baseH = 1080;

        const scaleX = ww / baseW;
        const scaleY = wh / baseH;
        const scale = Math.min(scaleX, scaleY);

        container.style.transform = `scale(${scale})`;
        
        // 將容器置中
        const left = (ww - (baseW * scale)) / 2;
        const top = (wh - (baseH * scale)) / 2;
        container.style.left = `${left}px`;
        container.style.top = `${top}px`;
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // 初始執行一次
}

async function initGame() {
    console.log("暗黑煉金工廠：核心模組加載中...");
    PhaserRenderer.init();
    UIManager.init();
    await GameEngine.start();
    console.log("所有系統啟動完畢。");
}
