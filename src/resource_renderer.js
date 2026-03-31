import { UI_CONFIG } from "./ui_config.js";

/**
 * 資源模型渲染器 - 材質生成版 (Texture Generation)
 * 將幾何圖形繪製到獨立的 RenderTexture 並轉換為 Phaser Texture
 * 使得 MainScene 可以像普通圖片一樣使用，並支援完整的等比縮放
 */
export class ResourceRenderer {
    static generateAllTextures(scene) {
        this.generateTreeTexture(scene);
        this.generateRockTexture(scene);
        this.generateBerryBushTexture(scene);
    }

    static generateTreeTexture(scene) {
        if (scene.textures.exists('tex_tree')) return;
        
        // 畫布大小：設定 100x100，中心為 50,50
        const cw = 110, ch = 110;
        const cx = cw / 2, cy = ch / 2 + 10; 
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        
        const cfg = UI_CONFIG.ResourceRenderer.Tree;
        const trunkW = 18, trunkH = 22;
        
        // 樹幹
        g.fillStyle(cfg.trunkColor, 1);
        g.lineStyle(cfg.outlineWidth, 0x1a0a00, 1);
        g.fillRect(cx - trunkW / 2, cy - 5, trunkW, trunkH);
        g.strokeRect(cx - trunkW / 2, cy - 5, trunkW, trunkH);

        // 樹葉
        this.drawTriangle(g, cx, cy + 5, 75, 50, cfg.leafColors[0], cfg.outlineColor, 1, cfg.outlineWidth);
        this.drawTriangle(g, cx, cy - 10, 60, 45, cfg.leafColors[1], cfg.outlineColor, 1, cfg.outlineWidth);
        this.drawTriangle(g, cx, cy - 25, 42, 33, cfg.leafColors[2], cfg.outlineColor, 1, cfg.outlineWidth);

        g.generateTexture('tex_tree', cw, ch);
        g.destroy();
    }

    static generateRockTexture(scene) {
        if (scene.textures.exists('tex_stone')) return;

        const cw = 120, ch = 120;
        const cx = cw / 2, cy = ch / 2 + 15;
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        const cfg = UI_CONFIG.ResourceRenderer.Rock;

        // 主岩石
        this.drawPolygon(g, [
            { dx: -35, dy: 15 }, { dx: -15, dy: -30 }, { dx: 25, dy: 5 }, { dx: 10, dy: 25 }
        ], cx, cy, cfg.colors[0], cfg.outlineColor, 1, cfg.outlineWidth);

        // 次岩石
        this.drawPolygon(g, [
            { dx: 10, dy: 20 }, { dx: 15, dy: -10 }, { dx: 40, dy: 15 }, { dx: 30, dy: 30 }
        ], cx, cy, cfg.colors[1], cfg.outlineColor, 1, cfg.outlineWidth);

        // 小石
        this.drawPolygon(g, [
            { dx: -10, dy: -15 }, { dx: -5, dy: -35 }, { dx: 15, dy: -20 }, { dx: 18, dy: -10 }
        ], cx, cy, cfg.colors[2], cfg.outlineColor, 1, cfg.outlineWidth);

        g.generateTexture('tex_stone', cw, ch);
        g.destroy();
    }

    static generateBerryBushTexture(scene) {
        if (scene.textures.exists('tex_food')) return;

        const cw = 110, ch = 110;
        const cx = cw / 2, cy = ch / 2 + 5;
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        const cfg = UI_CONFIG.ResourceRenderer.BerryBush;

        g.lineStyle(cfg.outlineWidth, cfg.outlineColor, 1);
        
        const blobs = [
            { dx: -20, dy: 0, r: 25, color: cfg.leafColor }, 
            { dx: 20, dy: 5, r: 22, color: 0xfb8c00 }, 
            { dx: 0, dy: -15, r: 28, color: cfg.leafColor }, 
            { dx: -10, dy: 15, r: 20, color: 0xffb300 }, 
            { dx: 15, dy: 12, r: 18, color: cfg.leafColor }
        ];

        blobs.forEach(b => {
            g.fillStyle(b.color, 1);
            g.fillCircle(cx + b.dx, cy + b.dy, b.r);
            g.strokeCircle(cx + b.dx, cy + b.dy, b.r);
        });

        // 莓果
        g.fillStyle(cfg.berryColor, 1);
        const berries = [
            { dx: -15, dy: -10, r: 5 }, { dx: 20, dy: 5, r: 4.5 }, 
            { dx: -5, dy: 15, r: 6 }, { dx: 10, dy: -12, r: 5 }, 
            { dx: -20, dy: 12, r: 4 }, { dx: 5, dy: -5, r: 5.5 },
            { dx: 5, dy: 10, r: 4.5 }
        ];
        berries.forEach(b => {
            g.fillCircle(cx + b.dx, cy + b.dy, b.r);
        });

        g.generateTexture('tex_food', cw, ch);
        g.destroy();
    }

    // --- 幾何輔助 ---

    static drawTriangle(g, x, y, w, h, color, outline, alpha, lw) {
        g.fillStyle(color, alpha);
        g.lineStyle(lw, outline, alpha);
        g.beginPath();
        g.moveTo(x - w / 2, y);
        g.lineTo(x, y - h);
        g.lineTo(x + w / 2, y);
        g.closePath();
        g.fillPath();
        g.strokePath();
    }

    static drawPolygon(g, points, x, y, color, outline, alpha, lw) {
        g.fillStyle(color, alpha);
        g.lineStyle(lw, outline, alpha);
        g.beginPath();
        g.moveTo(x + points[0].dx, y + points[0].dy);
        for (let i = 1; i < points.length; i++) {
            g.lineTo(x + points[i].dx, y + points[i].dy);
        }
        g.closePath();
        g.fillPath();
        g.strokePath();
    }
}
