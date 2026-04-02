import { MainScene } from "../scenes/MainScene.js";

/**
 * Phaser 渲染器封裝
 */
export class PhaserRenderer {
    static game;

    static init() {
        const config = {
            type: Phaser.AUTO,
            parent: "phaser_container",
            width: 1920,
            height: 1080,
            transparent: true,
            scene: [MainScene],
            fps: {
                target: 60,
                forceSetTimeOut: true
            },
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH
            }
        };

        this.game = new Phaser.Game(config);
        
        // 將 phaser 實例掛到 window 方便 UI 訪問 (暫時過渡)
        window.PhaserGame = this.game;
    }
}
