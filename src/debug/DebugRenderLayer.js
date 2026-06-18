import { GameEngine } from "../systems/game_systems.js";

/**
 * DebugRenderLayer — 工程 X 光模式 (Phase 1)
 *
 * 當 window.DEBUG_RENDER_MODE 為 true 時，於最上層額外繪製：
 *  1. 邊界與錨點：所有活動顯示物件的 bounding box + 中心錨點十字。
 *  2. 向量與連線：單位移動向量、輸送帶貨物速度向量、建築輸出邏輯連線。
 *  3. 狀態標籤：ID / Grid(x,y) / Z 層 / state 即時文字。
 *
 * 直接讀取場景中活的 Phaser 物件 (scene.entities / units / resourceBobs /
 * logisticsTransferSprites)，全部以世界座標繪製 (graphics 預設 scrollFactor=1)。
 */

const COLORS = {
    building: 0x00ff66,
    resource: 0xffcc00,
    unit: 0x00e5ff,
    transfer: 0xff44dd,
    vector: 0xff5252,
    link: 0xffd54f,
    anchor: 0xff1744
};
const DEPTH = 9000000;
const VECTOR_MAX_LEN = 80;

export class DebugRenderLayer {
    constructor(scene) {
        this.scene = scene;
        this.graphics = scene.add.graphics();
        this.graphics.setDepth(DEPTH);
        this.graphics.setScrollFactor(1);
        this.textPool = [];
        this.textIndex = 0;
        this._wasActive = false;
    }

    _getText() {
        let t = this.textPool[this.textIndex];
        if (!t) {
            t = this.scene.add.text(0, 0, "", {
                font: "12px monospace",
                fill: "#ffffff",
                backgroundColor: "rgba(0,0,0,0.65)",
                padding: { x: 3, y: 1 }
            }).setOrigin(0, 1);
            t.setDepth(DEPTH + 1);
            t.setScrollFactor(1);
            this.textPool.push(t);
        }
        this.textIndex++;
        return t;
    }

    _hexStr(colorInt) {
        return "#" + (colorInt & 0xffffff).toString(16).padStart(6, "0");
    }

    hide() {
        if (!this._wasActive) return;
        this.graphics.clear();
        for (const t of this.textPool) t.setVisible(false);
        this._wasActive = false;
    }

    /** 畫一條帶箭頭的向量 */
    _drawArrow(g, x1, y1, x2, y2, color) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        // 限制視覺長度，避免遠目標把線拉到畫面外
        const scale = Math.min(1, VECTOR_MAX_LEN / len);
        const ex = x1 + dx * scale;
        const ey = y1 + dy * scale;
        g.lineStyle(2, color, 0.95);
        g.lineBetween(x1, y1, ex, ey);
        const ang = Math.atan2(ey - y1, ex - x1);
        const head = 8;
        g.lineBetween(ex, ey, ex - head * Math.cos(ang - 0.4), ey - head * Math.sin(ang - 0.4));
        g.lineBetween(ex, ey, ex - head * Math.cos(ang + 0.4), ey - head * Math.sin(ang + 0.4));
    }

    /** 畫 bounding box + 錨點 + 標籤 */
    _drawObject(obj, color, anchorX, anchorY, idStr, stateStr) {
        if (!obj || obj.visible === false) return;
        const g = this.graphics;
        const TS = GameEngine.TILE_SIZE;
        const b = (typeof obj.getBounds === "function") ? obj.getBounds() : null;

        let ax = anchorX, ay = anchorY;
        if (ax === undefined || ay === undefined || (!ax && !ay)) {
            ax = obj.x; ay = obj.y;
            if ((!ax && !ay) && b) { ax = b.centerX; ay = b.centerY; }
        }

        if (b) {
            g.lineStyle(2, color, 0.9);
            g.strokeRect(b.x, b.y, b.width, b.height);
        }
        // 錨點十字
        g.lineStyle(1.5, COLORS.anchor, 1);
        g.lineBetween(ax - 6, ay, ax + 6, ay);
        g.lineBetween(ax, ay - 6, ax, ay + 6);

        const gx = Math.floor(ax / TS);
        const gy = Math.floor(ay / TS);
        const z = Math.round(Number(obj.depth) || 0);
        const lines = [idStr, `G(${gx},${gy}) Z:${z}`];
        if (stateStr) lines.push(stateStr);
        const t = this._getText();
        t.setText(lines.join("\n"));
        t.setColor(this._hexStr(color));
        const labelX = b ? b.x : ax;
        const labelY = (b ? b.y : ay - 10) - 2;
        t.setPosition(Math.round(labelX), Math.round(labelY));
        t.setVisible(true);
    }

    render() {
        const scene = this.scene;
        const g = this.graphics;
        const state = (typeof window !== "undefined" && window.GAME_STATE) ? window.GAME_STATE : null;
        g.clear();
        this.textIndex = 0;
        this._wasActive = true;

        // 1. 建築與單體資源
        const entById = new Map();
        if (state && Array.isArray(state.mapEntities)) {
            state.mapEntities.forEach(e => { if (e && e.id) entById.set(e.id, e); });
        }
        if (scene.entities && scene.entities.forEach) {
            scene.entities.forEach((obj, id) => {
                if (!obj || obj.visible === false) return;
                const ent = entById.get(id);
                const stateStr = ent ? (ent.state || ent.type1 || ent.type || "") : "";
                this._drawObject(obj, COLORS.building, obj.x, obj.y, String(id), stateStr);
            });
        }

        // 2. 大地圖資源
        if (scene.resourceBobs && scene.resourceBobs.forEach) {
            scene.resourceBobs.forEach((info, key) => {
                if (!info || !info.bob || info.bob.visible === false) return;
                this._drawObject(info.bob, COLORS.resource, info.bob.x, info.bob.y, info.type || "res", `lv${info.lv ?? 1}`);
            });
        }

        // 3. 單位 (本體 x/y=0，錨點取 state.renderX/Y) + 移動向量
        const unitById = new Map();
        if (state && state.units) {
            [...(state.units.villagers || []), ...(state.units.npcs || [])]
                .forEach(u => { if (u && u.id) unitById.set(u.id, u); });
        }
        if (scene.units && scene.units.forEach) {
            scene.units.forEach((obj, id) => {
                if (!obj || obj.visible === false) return;
                const u = unitById.get(id);
                const ax = u ? (u.renderX ?? u.x) : undefined;
                const ay = u ? (u.renderY ?? u.y) : undefined;
                this._drawObject(obj, COLORS.unit, ax, ay, String(id), u ? u.state : "");
                if (u && ax !== undefined) {
                    const target = u.idleTarget || u.pathTarget;
                    if (target && (target.x !== undefined)) {
                        this._drawArrow(g, ax, ay, target.x, target.y, COLORS.vector);
                    } else if (u.facing) {
                        // 無目標時用 facing 畫短朝向線
                        this._drawArrow(g, ax, ay, ax + (u.facing >= 0 ? 1 : -1) * 30, ay, COLORS.vector);
                    }
                }
            });
        }

        // 4. 移動中的輸送帶貨物 + 速度向量
        if (scene.logisticsTransferSprites && scene.logisticsTransferSprites.forEach) {
            scene.logisticsTransferSprites.forEach((sprite, key) => {
                if (!sprite || sprite.visible === false) return;
                this._drawObject(sprite, COLORS.transfer, sprite.x, sprite.y, `T:${key}`, "");
                const ang = sprite.rotation || 0;
                this._drawArrow(g, sprite.x, sprite.y,
                    sprite.x + Math.cos(ang) * 40, sprite.y + Math.sin(ang) * 40, COLORS.transfer);
            });
        }

        // 5. 建築輸出邏輯連線 (source 錨點 -> target 錨點)
        if (state && Array.isArray(state.mapEntities)) {
            g.lineStyle(1, COLORS.link, 0.55);
            for (const ent of state.mapEntities) {
                if (!ent || !Array.isArray(ent.outputTargets) || ent.outputTargets.length === 0) continue;
                for (const conn of ent.outputTargets) {
                    if (!conn) continue;
                    const target = entById.get(conn.id);
                    if (!target) continue;
                    this._drawDashedLine(g, ent.x, ent.y, target.x, target.y);
                }
            }
        }

        // 隱藏本幀未使用的文字物件
        for (let i = this.textIndex; i < this.textPool.length; i++) {
            this.textPool[i].setVisible(false);
        }
    }

    _drawDashedLine(g, x1, y1, x2, y2, dash = 10, gap = 8) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        const ux = dx / len;
        const uy = dy / len;
        let d = 0;
        while (d < len) {
            const s = d;
            const e = Math.min(d + dash, len);
            g.lineBetween(x1 + ux * s, y1 + uy * s, x1 + ux * e, y1 + uy * e);
            d += dash + gap;
        }
    }
}
