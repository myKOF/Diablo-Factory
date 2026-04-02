import { UI_CONFIG } from "../ui/ui_config.js";

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
        this.generateGoldMineTexture(scene);
    }

    static toNum(c) {
        if (typeof c === 'number') return c;
        if (typeof c === 'string' && c.startsWith('#')) return parseInt(c.replace('#', ''), 16);
        return 0xffffff;
    }

    static generateTreeTexture(scene) {
        if (scene.textures.exists('tex_tree')) return;
        
        // 畫布大小：統一使用 120x120 以利精確置中
        const cw = 120, ch = 120;
        const cx = cw / 2, cy = ch / 2; 
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        
        const cfg = UI_CONFIG.ResourceRenderer.Tree;
        const trunkW = 12, trunkH = 16;

        // 樹幹 - 調整座標使整棵樹的視覺中心位於 cy
        
        // 樹幹 - 調整座標使整棵樹的視覺中心位於 cy
        // 樹頂約在 cy+17-33=cy-16, 樹底約在 cy+17+16=cy+33. 
        // 視覺範圍約 [cy-33, cy+33]
        g.fillStyle(this.toNum(cfg.trunkColor), 1);
        g.lineStyle(cfg.outlineWidth, 0x1a0a00, 1);
        g.fillRect(cx - trunkW / 2, cy + 17, trunkW, trunkH);
        g.strokeRect(cx - trunkW / 2, cy + 17, trunkW, trunkH);

        // 樹葉 - 使用偶數寬度與優化後的垂直分佈
        this.drawTriangle(g, cx, cy + 19, 56, 40, this.toNum(cfg.leafColors[0]), this.toNum(cfg.outlineColor), 1, cfg.outlineWidth);
        this.drawTriangle(g, cx, cy + 5, 44, 34, this.toNum(cfg.leafColors[1]), this.toNum(cfg.outlineColor), 1, cfg.outlineWidth);
        this.drawTriangle(g, cx, cy - 8, 32, 25, this.toNum(cfg.leafColors[2]), this.toNum(cfg.outlineColor), 1, cfg.outlineWidth);

        g.generateTexture('tex_tree', cw, ch);
        g.destroy();
    }

    static generateRockTexture(scene) {
        if (scene.textures.exists('tex_stone')) return;

        const cw = 120, ch = 120;
        const cx = cw / 2, cy = ch / 2; // 修正：移除 +15 偏移
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        const cfg = UI_CONFIG.ResourceRenderer.Rock;

        // 主岩石 - 重新精算頂點，確保幾何中心在 (0,0)

        // 主岩石 - 重新精算頂點，確保幾何中心在 (0,0)
        this.drawPolygon(g, [
            { dx: -22.5, dy: 7 }, { dx: -8.5, dy: -23 }, { dx: 19.5, dy: 1 }, { dx: 11.5, dy: 15 }
        ], cx, cy, this.toNum(cfg.colors[0]), this.toNum(cfg.outlineColor), 1, cfg.outlineWidth);

        // 次岩石 - 修正偏移 (由原本平均 dx=15, dy=7 修改為置中)
        this.drawPolygon(g, [
            { dx: -9, dy: 3 }, { dx: -5, dy: -17 }, { dx: 11, dy: -1 }, { dx: 3, dy: 11 }
        ], cx + 15, cy + 7, this.toNum(cfg.colors[1]), this.toNum(cfg.outlineColor), 1, cfg.outlineWidth);

        // 小石 - 修正偏移 (由原本平均 dx=3, dy=-14 修改為置中)
        this.drawPolygon(g, [
            { dx: -11, dy: 4 }, { dx: -7, dy: -10 }, { dx: 9, dy: 0 }, { dx: 11, dy: 6 }
        ], cx + 2, cy - 14, this.toNum(cfg.colors[2]), this.toNum(cfg.outlineColor), 1, cfg.outlineWidth);

        g.generateTexture('tex_stone', cw, ch);
        g.destroy();
    }

    static generateBerryBushTexture(scene) {
        if (scene.textures.exists('tex_food')) return;

        const cw = 120, ch = 120;
        const cx = cw / 2, cy = ch / 2;
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        const cfg = UI_CONFIG.ResourceRenderer.BerryBush;

        g.lineStyle(cfg.outlineWidth, this.toNum(cfg.outlineColor), 1);
        
        const blobs = [
            { dx: -18, dy: -4, r: 18, color: this.toNum(cfg.leafColor) }, 
            { dx: 18, dy: -4, r: 18, color: this.toNum(cfg.leafColor) }, 
            { dx: 0, dy: -15, r: 20, color: this.toNum(cfg.leafColor) }, 
            { dx: -10, dy: 12, r: 16, color: 0xfb8c00 }, 
            { dx: 10, dy: 12, r: 16, color: 0xfb8c00 }
        ];

        blobs.forEach(b => {
            g.fillStyle(b.color, 1);
            g.fillCircle(cx + b.dx, cy + b.dy, b.r);
            g.strokeCircle(cx + b.dx, cy + b.dy, b.r);
        });

        // 莓果
        g.fillStyle(this.toNum(cfg.berryColor), 1);
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
 
    static generateGoldMineTexture(scene) {
        if (scene.textures.exists('tex_gold')) return;
 
        const cw = 120, ch = 120;
        const cx = cw / 2, cy = ch / 2;
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        const cfg = UI_CONFIG.ResourceRenderer.GoldMine;
 
        // 使用多個菱形/晶體堆疊成金礦
        const crystals = [
            // 大主晶體
            { points: [{dx:0, dy:-25}, {dx:18, dy:0}, {dx:0, dy:20}, {dx:-18, dy:0}], x: cx, y: cy, color: this.toNum(cfg.colors[0]) },
            // 左側晶體
            { points: [{dx:0, dy:-15}, {dx:12, dy:0}, {dx:0, dy:12}, {dx:-12, dy:0}], x: cx - 20, y: cy + 5, color: this.toNum(cfg.colors[1]) },
            // 右側晶體
            { points: [{dx:0, dy:-12}, {dx:10, dy:0}, {dx:0, dy:10}, {dx:-10, dy:0}], x: cx + 18, y: cy + 8, color: this.toNum(cfg.colors[2]) },
            // 頂部小尖晶
            { points: [{dx:0, dy:-10}, {dx:6, dy:0}, {dx:0, dy:6}, {dx:-6, dy:0}], x: cx + 5, y: cy - 15, color: this.toNum(cfg.colors[2]) }
        ];
 
        crystals.forEach(c => {
            this.drawPolygon(g, c.points, c.x, c.y, c.color, this.toNum(cfg.outlineColor), 1, cfg.outlineWidth);
            // 加個高光線條
            g.lineStyle(1, 0xffffff, 0.4);
            g.beginPath();
            g.moveTo(c.x + c.points[0].dx, c.y + c.points[0].dy);
            g.lineTo(c.x + c.points[1].dx, c.y + c.points[1].dy);
            g.strokePath();
        });
 
        g.generateTexture('tex_gold', cw, ch);
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
