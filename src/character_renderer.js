/**
 * 獨立的角色繪製與動畫渲染引擎 (純 Canvas API 實作)
 * 不依賴任何外部圖片資產，支援標準 Canvas 2D 與 Phaser Graphics
 */
export class CharacterRenderer {
    /**
     * 繪製角色主入口
     * @param {CanvasRenderingContext2D|Phaser.GameObjects.Graphics} ctx 
     * @param {number x
     * @param {number} y
     * @param {object} unitData
     * @param {number} time
     */
    static render(ctx, x, y, unitData, time) {
        const state = unitData.state || 'IDLE';

        const animationSpeed = 0.01;
        const t = time * animationSpeed;

        // 步行動畫：雙腿交替
        let legOffset = 0;
        let bodyBob = 0;
        if (state.includes('MOVING')) {
            legOffset = Math.sin(t * 15) * 8;
            bodyBob = Math.abs(Math.cos(t * 15)) * 4;
        } else if (state === 'CONSTRUCTING' || state === 'GATHERING') {
            bodyBob = Math.sin(t * 10) * 2;
        }

        // 1. 繪製陰影
        this.drawShadow(ctx, x, y);

        // 2. 繪製腿部
        this.renderLegs(ctx, x, y, legOffset);

        // 3. 繪製身體
        const bodyY = y - 25 - bodyBob;
        this.renderBody(ctx, x, bodyY, unitData);

        // 4. 繪製頭部
        this.renderHead(ctx, x, bodyY - 15, unitData);

        // 5. 繪製手臂與工具
        this.renderArmsAndTools(ctx, x, bodyY, unitData, t);
    }

    static drawShadow(ctx, x, y) {
        if (ctx.fillStyle !== undefined && typeof ctx.fillStyle === 'string') {
            ctx.fillStyle = "rgba(0,0,0,0.2)";
            ctx.beginPath();
            if (ctx.ellipse) ctx.ellipse(x, y + 18, 15, 6, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle(0x000000, 0.2);
            ctx.fillEllipse(x, y + 18, 30, 12);
        }
    }

    static renderLegs(ctx, x, y, offset) {
        this.setCtxStyle(ctx, 0x333333, 1);
        ctx.fillRect(x - 8, y + 5 + offset, 6, 12);
        ctx.fillRect(x + 2, y + 5 - offset, 6, 12);
    }

    static renderBody(ctx, x, y, data) {
        let clothColor = 0x1565c0; // 預設藍色

        if (data.state === 'IDLE') {
            clothColor = 0x1e88e5; // 閒置狀態：亮藍色
        } else {
            if (data.type === 'WOOD') clothColor = 0x2e7d32;
            else if (data.type === 'STONE') clothColor = 0x546e7a;
            else if (data.type === 'FOOD') clothColor = 0xc62828;
        }

        this.setCtxStyle(ctx, clothColor, 1);
        ctx.fillRect(x - 10, y, 20, 30);

        this.setCtxStyle(ctx, 0xffffff, 0.3);
        ctx.fillRect(x - 10, y, 20, 4);
    }

    static renderHead(ctx, x, y, data) {
        this.setCtxStyle(ctx, 0xffcc8c, 1);
        ctx.fillRect(x - 8, y, 16, 16);

        this.setCtxStyle(ctx, 0x333333, 1);
        ctx.fillRect(x - 5, y + 5, 2, 2);
        ctx.fillRect(x + 3, y + 5, 2, 2);

        this.setCtxStyle(ctx, 0x4e342e, 1);
        if (data.configName === 'female villagers') {
            ctx.fillRect(x - 10, y - 4, 20, 6);
            ctx.fillRect(x - 10, y + 2, 4, 10);
            ctx.fillRect(x + 6, y + 2, 4, 10);
        } else {
            ctx.fillRect(x - 9, y - 2, 18, 4);
        }
    }

    static renderArmsAndTools(ctx, x, y, data, t) {
        const state = data.state;
        this.setCtxStyle(ctx, 0xffcc8c, 1);

        if (state === 'CONSTRUCTING') {
            const angle = Math.sin(t * 20) * 0.8;
            this.drawTool(ctx, x + 5, y + 15, 'HAMMER', angle);
        } else if (state === 'GATHERING') {
            const angle = Math.sin(t * 20) * 0.8;
            const toolType = data.type === 'WOOD' ? 'AXE' : (data.type === 'STONE' ? 'PICKAXE' : 'BASKET');
            this.drawTool(ctx, x + 5, y + 15, toolType, angle);
        } else if (data.cargo > 0) {
            this.setCtxStyle(ctx, 0x795548, 1);
            ctx.fillRect(x - 8, y + 10, 16, 12);
        } else {
            ctx.fillRect(x - 14, y + 5, 4, 18);
            ctx.fillRect(x + 10, y + 5, 4, 18);
        }
    }

    static drawTool(ctx, x, y, type, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const drawRectRotated = (rx, ry, rw, rh, color) => {
            this.setCtxStyle(ctx, color, 1);
            const pts = [
                { dx: rx, dy: ry },
                { dx: rx + rw, dy: ry },
                { dx: rx + rw, dy: ry + rh },
                { dx: rx, dy: ry + rh }
            ];

            const rotatedPts = pts.map(p => ({
                px: x + (p.dx * cos - p.dy * sin),
                py: y + (p.dx * sin + p.dy * cos)
            }));

            if (ctx.beginPath) ctx.beginPath();
            if (ctx.moveTo) ctx.moveTo(rotatedPts[0].px, rotatedPts[0].py);
            if (ctx.lineTo) {
                for (let i = 1; i < 4; i++) ctx.lineTo(rotatedPts[i].px, rotatedPts[i].py);
            }
            if (ctx.closePath) ctx.closePath();

            if (ctx.fillPath) ctx.fillPath();
            else if (ctx.fill) ctx.fill();
        };

        if (type === 'AXE') {
            drawRectRotated(0, -15, 3, 20, 0x5d4037);
            drawRectRotated(0, -20, 10, 8, 0x9e9e9e);
        } else if (type === 'PICKAXE') {
            drawRectRotated(0, -15, 3, 20, 0x5d4037);
            drawRectRotated(-10, -18, 20, 4, 0x757575);
        } else if (type === 'HAMMER') {
            drawRectRotated(0, -15, 4, 25, 0x5d4037);
            drawRectRotated(-8, -25, 20, 12, 0x424242);
        } else if (type === 'BASKET') {
            drawRectRotated(-8, 0, 16, 12, 0x8d6e63);
        }
    }

    static setCtxStyle(ctx, color, alpha) {
        if (ctx.fillStyle !== undefined && typeof ctx.fillStyle === 'string') {
            const r = (color >> 16) & 255;
            const g = (color >> 8) & 255;
            const b = color & 255;
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        } else if (ctx.fillStyle) {
            ctx.fillStyle(color, alpha);
        }
    }
}
