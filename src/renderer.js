import { GameEngine } from "./game_systems.js";

/**
 * 獨立 Canvas 渲染器
 */
export class AnimationRenderer {
    static canvas;
    static ctx;
    static camera = { x: 0, y: 0 };
    static isDragging = false;
    static lastMouse = { x: 0, y: 0 };

    static init() {
        this.canvas = document.getElementById("fx_canvas");
        if (!this.canvas) return;
        this.canvas.width = 1920;
        this.canvas.height = 1080;
        this.ctx = this.canvas.getContext("2d");

        this.canvas.addEventListener("mousedown", (e) => {
            // 如果正在拖拽 UI 建築，不觸發地圖拖動
            if (window.UIManager && window.UIManager.dragGhost) return;
            this.isDragging = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener("mousemove", (e) => {
            if (this.isDragging) {
                this.camera.x += e.clientX - this.lastMouse.x;
                this.camera.y += e.clientY - this.lastMouse.y;
                this.lastMouse = { x: e.clientX, y: e.clientY };
            }
        });
        window.addEventListener("mouseup", () => this.isDragging = false);

        this.renderLoop();
    }

    static renderLoop() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        this.ctx.translate(this.camera.x, this.camera.y);
        this.drawFloor();
        this.drawEntities();
        this.drawPlacementPreview(); // 繪製放置預覽
        this.drawUnits();
        this.ctx.restore();
        requestAnimationFrame(() => this.renderLoop());
    }

    static drawFloor() {
        const TS = GameEngine.TILE_SIZE;
        this.ctx.fillStyle = "#f5f5dc"; 
        this.ctx.fillRect(-2000, -2000, 6000, 6000);
        this.ctx.strokeStyle = "rgba(0,0,0,0.08)";
        this.ctx.beginPath();
        for(let x=-2000; x<4000; x+=TS) { this.ctx.moveTo(x, -2000); this.ctx.lineTo(x, 4000); }
        for(let y=-2000; y<4000; y+=TS) { this.ctx.moveTo(-2000, y); this.ctx.lineTo(4000, y); }
        this.ctx.stroke();
    }

    static drawEntities() {
        const state = window.GAME_STATE;
        if (!state || !state.mapEntities) return;
        state.mapEntities.forEach(ent => this.renderEntity(ent, 1.0));
    }

    static drawPlacementPreview() {
        const state = window.GAME_STATE;
        if (state && state.placingType && state.previewPos) {
            this.renderEntity({
                type: state.placingType,
                x: state.previewPos.x,
                y: state.previewPos.y
            }, 0.5); // 半透明預覽
        }
    }

    static renderEntity(ent, alpha) {
        const TS = GameEngine.TILE_SIZE;
        const cfg = window.GAME_STATE.buildingConfigs[ent.type];
        let uw = 1, uh = 1;
        if (cfg && cfg.size) {
            const match = cfg.size.match(/\{(\d+),(\d+)\}/);
            if (match) { uw = parseInt(match[1]); uh = parseInt(match[2]); }
        }

        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        this.ctx.translate(ent.x, ent.y);

        if (ent.type === 'village' || ent.type === 'town_center') {
            this.ctx.fillStyle = "#8d6e63";
            this.ctx.fillRect(-(uw*TS)/2, -(uh*TS)/2, uw*TS, uh*TS);
            this.ctx.strokeStyle = "#5d4037";
            this.ctx.strokeRect(-(uw*TS)/2, -(uh*TS)/2, uw*TS, uh*TS);
        } else if (ent.type === 'farmhouse') {
            this.ctx.fillStyle = "#bcaaa4";
            this.ctx.fillRect(-(uw*TS)/2, -(uh*TS)/2, uw*TS, uh*TS);
            this.ctx.strokeStyle = "#8d6e63";
            this.ctx.strokeRect(-(uw*TS)/2, -(uh*TS)/2, uw*TS, uh*TS);
            this.ctx.fillStyle = "#795548";
            this.ctx.beginPath();
            this.ctx.moveTo(-(uw*TS)/2 - 5, -(uh*TS)/2); this.ctx.lineTo(0, -(uh*TS)/2 - 20); this.ctx.lineTo((uw*TS)/2 + 5, -(uh*TS)/2);
            this.ctx.fill();
        } else if (ent.type === 'campfire') {
            this.ctx.fillStyle = "#ff5722";
            this.ctx.beginPath(); this.ctx.arc(0, 0, 15, 0, Math.PI * 2); this.ctx.fill();
        } else if (ent.type.startsWith('tree') || ent.type.startsWith('wood')) {
            this.ctx.fillStyle = "#2e7d32";
            this.ctx.beginPath(); this.ctx.arc(0, 0, 20, 0, Math.PI * 2); this.ctx.fill();
        } else if (ent.type.startsWith('stone')) {
            this.ctx.fillStyle = "#757575";
            this.ctx.beginPath(); this.ctx.moveTo(-20, 10); this.ctx.lineTo(0, -15); this.ctx.lineTo(25, 15); this.ctx.fill();
        } else if (ent.type.startsWith('food')) {
            this.ctx.fillStyle = "#c2185b";
            this.ctx.beginPath(); this.ctx.arc(0, 0, 18, 0, Math.PI * 2); this.ctx.fill();
        }

        this.ctx.restore();
    }

    static drawUnits() {
        const state = window.GAME_STATE;
        if (!state || !state.units || !state.units.villagers) return;
        state.units.villagers.forEach(v => {
            this.ctx.save();
            this.ctx.translate(v.x, v.y);
            this.ctx.fillStyle = "#1565c0";
            this.ctx.fillRect(-10, -25, 20, 45); 
            this.ctx.fillStyle = "#ffcc8c";
            this.ctx.fillRect(-8, -38, 16, 16);
            if (v.cargo > 0) { this.ctx.fillStyle = "#795548"; this.ctx.fillRect(5, -10, 10, 10); }
            this.ctx.restore();
        });
    }
}
