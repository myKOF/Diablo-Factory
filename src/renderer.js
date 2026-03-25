import { GameEngine } from "./game_systems.js";
import { UI_CONFIG } from "./ui_config.js";

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
        for (let x = -2000; x < 4000; x += TS) { this.ctx.moveTo(x, -2000); this.ctx.lineTo(x, 4000); }
        for (let y = -2000; y < 4000; y += TS) { this.ctx.moveTo(-2000, y); this.ctx.lineTo(4000, y); }
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
            this.ctx.fillRect(-(uw * TS) / 2, -(uh * TS) / 2, uw * TS, uh * TS);
            this.ctx.strokeStyle = "#5d4037";
            this.ctx.strokeRect(-(uw * TS) / 2, -(uh * TS) / 2, uw * TS, uh * TS);
        } else if (ent.type === 'farmhouse') {
            this.ctx.fillStyle = "#bcaaa4";
            this.ctx.fillRect(-(uw * TS) / 2, -(uh * TS) / 2, uw * TS, uh * TS);
            this.ctx.strokeStyle = "#8d6e63";
            this.ctx.strokeRect(-(uw * TS) / 2, -(uh * TS) / 2, uw * TS, uh * TS);
            this.ctx.fillStyle = "#795548";
            this.ctx.beginPath();
            this.ctx.moveTo(-(uw * TS) / 2 - 5, -(uh * TS) / 2); this.ctx.lineTo(0, -(uh * TS) / 2 - 20); this.ctx.lineTo((uw * TS) / 2 + 5, -(uh * TS) / 2);
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
        } else if (ent.type.startsWith('ston')) {
            this.ctx.fillStyle = "#757575";
            this.ctx.beginPath(); this.ctx.moveTo(-15, 15); this.ctx.lineTo(0, -15); this.ctx.lineTo(15, 15); this.ctx.closePath(); this.ctx.fill();
        } else if (ent.type.startsWith('food')) {
            this.ctx.fillStyle = "#c2185b";
            this.ctx.beginPath(); this.ctx.arc(0, 0, 18, 0, Math.PI * 2); this.ctx.fill();
        }

        // 繪製資源等級 (上方)
        const mapCfg = UI_CONFIG.MapResourceLabels;
        if (ent.level !== undefined && mapCfg) {
            this.ctx.save();
            this.ctx.font = mapCfg.level.fontSize;
            this.ctx.textAlign = "center";
            this.ctx.strokeStyle = mapCfg.level.outlineColor;
            this.ctx.lineWidth = mapCfg.level.outlineWidth;
            const lvLabel = `Lv.${ent.level}`;
            this.ctx.strokeText(lvLabel, 0, mapCfg.level.offsetY);
            this.ctx.fillStyle = mapCfg.level.color;
            this.ctx.fillText(lvLabel, 0, mapCfg.level.offsetY);
            this.ctx.restore();
        }

        // 繪製資源剩餘數值 (下方)
        if (ent.amount !== undefined && ent.amount > 0 && mapCfg) {
            this.ctx.save();
            this.ctx.font = mapCfg.amount.fontSize;
            this.ctx.textAlign = "center";
            this.ctx.strokeStyle = mapCfg.amount.outlineColor;
            this.ctx.lineWidth = mapCfg.amount.outlineWidth;
            const amtLabel = `[${Math.ceil(ent.amount)}]`;
            this.ctx.strokeText(amtLabel, 0, mapCfg.amount.offsetY);
            this.ctx.fillStyle = mapCfg.amount.color;
            this.ctx.fillText(amtLabel, 0, mapCfg.amount.offsetY);
            this.ctx.restore();
        }

        // 繪製生產進度 (如果有的話)
        if (ent.type === 'village') this.renderProductionHUD(ent, uw, uh, TS);

        this.ctx.restore();
    }

    static renderProductionHUD(ent, uw, uh, TS) {
        const state = window.GAME_STATE;
        if (!state || state.villageQueue.length === 0) return;

        const cfg = UI_CONFIG.ProductionHUD;
        const maxPop = GameEngine.getMaxPopulation();
        const isPopFull = state.units.villagers.length >= maxPop;
        const progress = 1.0 - (state.villageProductionTimer / 5);
        
        const bx = -(uw * TS) / 2 + 15;
        const by = (uh * TS) / 2 - 35;

        // 1. 進度條背景
        this.ctx.fillStyle = cfg.barBg;
        this.ctx.fillRect(bx + 45, by + 12, 85, 12);

        // 2. 進度條填充 (如果人口滿了則顯示紅色)
        this.ctx.fillStyle = isPopFull ? cfg.barBlocked : cfg.barFill;
        this.ctx.fillRect(bx + 45, by + 12, 85 * Math.max(0, Math.min(1, progress)), 12);

        // 如果人口已滿，顯示提示文字
        if (isPopFull) {
            this.ctx.save();
            this.ctx.font = cfg.popLimitText.fontSize;
            this.ctx.fillStyle = cfg.popLimitText.color;
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            
            // 移除厚重的描邊，改用更乾淨的文字顯示
            const popMsg = GameEngine.getMessage("2"); // ID 2: 人口已達上限
            this.ctx.fillText(popMsg, bx + 45 + 42, by + 12 + cfg.popLimitText.offsetY);
            this.ctx.restore();
        }

        // 3. 單位圖示 (紫色小人)
        this.ctx.fillStyle = "#311b92";
        this.ctx.beginPath();
        this.ctx.arc(bx + 15, by + 15, 15, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = "#5e35b1";
        this.ctx.beginPath();
        this.ctx.arc(bx + 15, by + 10, 8, 0, Math.PI * 2);
        this.ctx.fill();

        // 4. 隊列數量圓圈 (紅色)
        this.ctx.fillStyle = cfg.badgeBg;
        this.ctx.beginPath();
        this.ctx.arc(bx + 30, by + 5, 8, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = "white";
        this.ctx.font = "bold 10px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText(state.villageQueue.length, bx + 30, by + 9);
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
