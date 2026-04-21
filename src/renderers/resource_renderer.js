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
        this.generateGoldOreMineTexture(scene);
        this.generateIronMineTexture(scene);
        this.generateCoalMineTexture(scene);
        this.generateRareHerbTexture(scene);
        this.generateWolfCorpseTexture(scene);
        this.generateBearCorpseTexture(scene);
    }

    static toNum(c) {
        if (typeof c === 'number') return c;
        if (typeof c === 'string' && c.startsWith('#')) {
            const raw = c.replace('#', '');
            // 如果是 8 位 (#RRGGBBAA)，截斷前 6 位，避免 Phaser 解析出錯
            const cleaned = raw.length > 6 ? raw.substring(0, 6) : raw;
            return parseInt(cleaned, 16);
        }
        return 0xffffff;
    }

    static generateTreeTexture(scene) {
        if (scene.textures.exists('tex_tree')) return;
        
        const cw = 120, ch = 120;
        const cx = cw / 2, cy = ch / 2; 
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        
        const cfg = UI_CONFIG.ResourceRenderer.Tree;
        const trunkW = 12, trunkH = 16;

        g.fillStyle(this.toNum(cfg.trunkColor), 1);
        g.lineStyle(cfg.outlineWidth, 0x1a0a00, 1);
        g.fillRect(cx - trunkW / 2, cy + 17, trunkW, trunkH);
        g.strokeRect(cx - trunkW / 2, cy + 17, trunkW, trunkH);

        this.drawTriangle(g, cx, cy + 19, 56, 40, this.toNum(cfg.leafColors[0]), this.toNum(cfg.outlineColor), 1, cfg.outlineWidth);
        this.drawTriangle(g, cx, cy + 5, 44, 34, this.toNum(cfg.leafColors[1]), this.toNum(cfg.outlineColor), 1, cfg.outlineWidth);
        this.drawTriangle(g, cx, cy - 8, 32, 25, this.toNum(cfg.leafColors[2]), this.toNum(cfg.outlineColor), 1, cfg.outlineWidth);

        g.generateTexture('tex_tree', cw, ch);
        g.destroy();
    }

    static generateRockTexture(scene) {
        if (scene.textures.exists('tex_stone')) return;

        const cw = 120, ch = 120;
        const cx = cw / 2, cy = ch / 2;
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        const cfg = UI_CONFIG.ResourceRenderer.Rock;

        this.drawPolygon(g, [
            { dx: -22.5, dy: 7 }, { dx: -8.5, dy: -23 }, { dx: 19.5, dy: 1 }, { dx: 11.5, dy: 15 }
        ], cx, cy, this.toNum(cfg.colors[0]), this.toNum(cfg.outlineColor), 1, cfg.outlineWidth);

        this.drawPolygon(g, [
            { dx: -9, dy: 3 }, { dx: -5, dy: -17 }, { dx: 11, dy: -1 }, { dx: 3, dy: 11 }
        ], cx + 15, cy + 7, this.toNum(cfg.colors[1]), this.toNum(cfg.outlineColor), 1, cfg.outlineWidth);

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
 
    static generateGoldOreMineTexture(scene) {
        if (scene.textures.exists('tex_gold_ore')) return;
 
        const cw = 120, ch = 120, cx = cw / 2, cy = ch / 2;
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        const cfg = UI_CONFIG.ResourceRenderer.GoldOreMine;
 
        const crystals = [
            { points: [{dx:0, dy:-25}, {dx:18, dy:0}, {dx:0, dy:20}, {dx:-18, dy:0}], x: cx, y: cy, color: this.toNum(cfg.colors[0]) },
            { points: [{dx:0, dy:-15}, {dx:12, dy:0}, {dx:0, dy:12}, {dx:-12, dy:0}], x: cx - 20, y: cy + 5, color: this.toNum(cfg.colors[1]) },
            { points: [{dx:0, dy:-12}, {dx:10, dy:0}, {dx:0, dy:10}, {dx:-10, dy:0}], x: cx + 18, y: cy + 8, color: this.toNum(cfg.colors[2]) }
        ];
 
        crystals.forEach(c => {
            this.drawPolygon(g, c.points, c.x, c.y, c.color, this.toNum(cfg.outlineColor), 1, cfg.outlineWidth);
        });
 
        g.generateTexture('tex_gold_ore', cw, ch);
        g.destroy();
    }

    static generateIronMineTexture(scene) {
        if (scene.textures.exists('tex_iron_ore')) return;
        const cw = 120, ch = 120, cx = cw / 2, cy = ch / 2;
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        const cfg = UI_CONFIG.ResourceRenderer.IronMine;
        const rocks = [
            { points: [{dx:-25, dy:5}, {dx:-10, dy:-20}, {dx:25, dy:0}, {dx:15, dy:20}], x: cx, y: cy, color: this.toNum(cfg.colors[0]) },
            { points: [{dx:-15, dy:0}, {dx:0, dy:-15}, {dx:15, dy:5}], x: cx + 10, y: cy - 5, color: this.toNum(cfg.colors[2]) }
        ];
        rocks.forEach(r => this.drawPolygon(g, r.points, r.x, r.y, r.color, this.toNum(cfg.outlineColor), 1, cfg.outlineWidth));
        g.fillStyle(0xffffff, 0.4);
        g.fillCircle(cx - 5, cy - 5, 4);
        g.generateTexture('tex_iron_ore', cw, ch);
        g.destroy();
    }

    static generateCoalMineTexture(scene) {
        if (scene.textures.exists('tex_coal')) return;
        const cw = 120, ch = 120, cx = cw / 2, cy = ch / 2;
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        const cfg = UI_CONFIG.ResourceRenderer.CoalMine;
        const chunks = [
            { points: [{dx:-20, dy:10}, {dx:0, dy:-25}, {dx:20, dy:10}], x: cx, y: cy, color: this.toNum(cfg.colors[0]) },
            { points: [{dx:-10, dy:5}, {dx:10, dy:5}, {dx:0, dy:-15}], x: cx - 15, y: cy + 10, color: this.toNum(cfg.colors[1]) }
        ];
        chunks.forEach(c => this.drawPolygon(g, c.points, c.x, c.y, c.color, this.toNum(cfg.outlineColor), 1, cfg.outlineWidth));
        g.generateTexture('tex_coal', cw, ch);
        g.destroy();
    }

    static generateRareHerbTexture(scene) {
        if (scene.textures.exists('tex_magic_herb')) return;
        const cw = 120, ch = 120, cx = cw / 2, cy = ch / 2;
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        const cfg = UI_CONFIG.ResourceRenderer.RareHerb;
        g.lineStyle(cfg.outlineWidth, this.toNum(cfg.outlineColor), 1);
        g.fillStyle(this.toNum(cfg.leafColor), 1);
        for (let i = 0; i < 3; i++) {
            const angle = (i * 120) * (Math.PI / 180);
            g.beginPath();
            g.ellipse(cx + Math.cos(angle) * 15, cy + Math.sin(angle) * 15, 12, 6, angle);
            g.fillPath(); g.strokePath();
        }
        g.fillStyle(this.toNum(cfg.flowerColor), 1);
        g.fillCircle(cx, cy, 6); g.strokeCircle(cx, cy, 6);
        g.generateTexture('tex_magic_herb', cw, ch);
        g.destroy();
    }

    static generateWolfCorpseTexture(scene) {
        if (scene.textures.exists('tex_wolf_corpse')) return;
        const cw = 120, ch = 120, cx = cw / 2, cy = ch / 2;
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        const cfg = UI_CONFIG.ResourceRenderer.WolfCorpse;
        g.fillStyle(this.toNum(cfg.furColor), 1);
        g.lineStyle(cfg.outlineWidth, this.toNum(cfg.outlineColor), 1);
        g.fillEllipse(cx, cy + 5, 40, 18); g.strokeEllipse(cx, cy + 5, 40, 18);
        g.fillCircle(cx - 25, cy, 12); g.strokeCircle(cx - 25, cy, 12);
        g.beginPath(); g.moveTo(cx - 32, cy - 8); g.lineTo(cx - 35, cy - 18); g.lineTo(cx - 28, cy - 8); g.fillPath(); g.strokePath();
        g.generateTexture('tex_wolf_corpse', cw, ch);
        g.destroy();
    }

    static generateBearCorpseTexture(scene) {
        if (scene.textures.exists('tex_bear_corpse')) return;
        const cw = 120, ch = 120, cx = cw / 2, cy = ch / 2;
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        const cfg = UI_CONFIG.ResourceRenderer.BearCorpse;
        g.fillStyle(this.toNum(cfg.furColor), 1);
        g.lineStyle(cfg.outlineWidth, this.toNum(cfg.outlineColor), 1);
        g.fillEllipse(cx, cy + 5, 50, 30); g.strokeEllipse(cx, cy + 5, 50, 30);
        g.fillCircle(cx - 35, cy, 16); g.strokeCircle(cx - 35, cy, 16);
        g.generateTexture('tex_bear_corpse', cw, ch);
        g.destroy();
    }

    static drawTriangle(g, x, y, w, h, color, outline, alpha, lw) {
        g.fillStyle(color, alpha); g.lineStyle(lw, outline, alpha);
        g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x, y - h); g.lineTo(x + w / 2, y); g.closePath(); g.fillPath(); g.strokePath();
    }

    static drawPolygon(g, points, x, y, color, outline, alpha, lw) {
        g.fillStyle(color, alpha); g.lineStyle(lw, outline, alpha);
        g.beginPath(); g.moveTo(x + points[0].dx, y + points[0].dy);
        for (let i = 1; i < points.length; i++) g.lineTo(x + points[i].dx, y + points[i].dy);
        g.closePath(); g.fillPath(); g.strokePath();
    }
}
