import { GameEngine } from "../systems/game_systems.js";

/**
 * RenderDebugger — 視覺狀態序列化 (Phase 2)
 *
 * 把「當前畫面上真正被畫出來的」Phaser 顯示物件轉成 AI 可讀的 JSON。
 *
 * 防幻覺核心原則：所有幾何資訊 (錨點、bounding box、scale、rotation、zIndex)
 * 一律讀取場景中「活的」Phaser 顯示物件 (scene.entities / scene.units /
 * scene.resourceBobs / scene.logisticsTransferSprites)，而不是從 GAME_STATE
 * 重新推算。GAME_STATE 只用來補 ID / 類型 / 邏輯狀態。
 *
 * 座標空間：Canvas 設計空間 (1920×1080，Phaser 基準解析度)。
 * 不疊加 Scale.FIT 或 game_container 的 CSS transform，確保確定性、利於斷言。
 */
export class RenderDebugger {
    static scene = null;

    static init(scene) {
        this.scene = scene || (typeof window !== "undefined" ? window.PhaserScene : null) || null;
        return this.scene;
    }

    static getScene() {
        if (this.scene) return this.scene;
        if (typeof window !== "undefined" && window.PhaserScene) return window.PhaserScene;
        return null;
    }

    /**
     * 世界座標 → 螢幕 (canvas 設計空間) 座標。
     * 為 MainScene.screenToWorldPoint 的反運算，與既有相機邏輯一致。
     */
    static worldToScreen(cam, worldX, worldY) {
        const zoom = cam.zoom || 1;
        const originX = cam.scrollX + (cam.width * (1 - 1 / zoom)) / 2;
        const originY = cam.scrollY + (cam.height * (1 - 1 / zoom)) / 2;
        return {
            x: (worldX - originX) * zoom,
            y: (worldY - originY) * zoom
        };
    }

    /**
     * 將 Phaser depth 歸類為邏輯層級。
     * 場景慣例：背景/格線/物流線 < 500000；世界實體與單位 = 500000 + y；
     * 物流貨物 ≈ 900000；HUD / 預覽 / 框選 ≥ 2000000。
     */
    static depthToLayer(depth) {
        const d = Number(depth) || 0;
        if (d >= 2000000) return 3; // HUD / 疊加層
        if (d >= 800000) return 2;  // 物流貨物 / 連接埠
        if (d >= 500000) return 1;  // 世界實體與單位 (Y 軸排序)
        return 0;                   // 地表 / 格線 / 物流線
    }

    static _round(n) {
        return Math.round((Number(n) || 0) * 10000) / 10000;
    }

    /**
     * 把單一顯示物件序列化為元素。
     * @param {object} opts - { anchorX, anchorY, state } 可覆寫錨點 (單位的 Graphics 本體 x/y 為 0)。
     */
    static buildElement(id, type, obj, opts = {}) {
        const scene = this.getScene();
        const cam = scene.cameras.main;
        const zoom = cam.zoom || 1;
        const TS = GameEngine.TILE_SIZE;

        const bounds = (typeof obj.getBounds === "function") ? obj.getBounds() : null;

        // 決定錨點世界座標：優先用呼叫端提供，其次物件 x/y，最後退回 bounds 中心
        let ax = (opts.anchorX !== undefined) ? opts.anchorX : obj.x;
        let ay = (opts.anchorY !== undefined) ? opts.anchorY : obj.y;
        if ((ax === undefined || ay === undefined || (!ax && !ay)) && bounds) {
            ax = bounds.centerX;
            ay = bounds.centerY;
        }

        const screen = this.worldToScreen(cam, ax, ay);

        const element = {
            id,
            type,
            screenPos: { x: Math.round(screen.x), y: Math.round(screen.y) },
            worldPos: { x: Math.round(ax), y: Math.round(ay) },
            logicalGrid: {
                x: Math.floor(ax / TS),
                y: Math.floor(ay / TS),
                layer: this.depthToLayer(obj.depth)
            },
            zIndex: Math.round(Number(obj.depth) || 0),
            boundingBox: {
                w: bounds ? Math.round(bounds.width * zoom) : 0,
                h: bounds ? Math.round(bounds.height * zoom) : 0
            },
            scale: { x: this._round(obj.scaleX ?? 1), y: this._round(obj.scaleY ?? 1) },
            rotation: this._round(obj.rotation ?? 0),
            visible: obj.visible !== false
        };
        if (opts.state !== undefined && opts.state !== null) element.state = opts.state;
        return element;
    }

    /**
     * 主要 API：匯出當前畫面的視覺狀態。
     * @param {object} options - { includeHidden=false }
     */
    static exportCurrentVisualState(options = {}) {
        const includeHidden = !!options.includeHidden;
        const scene = this.getScene();
        if (!scene || !scene.cameras || !scene.cameras.main) {
            return { error: "Scene not ready", timestamp: Date.now(), elements: [] };
        }
        const cam = scene.cameras.main;
        const state = (typeof window !== "undefined" && window.GAME_STATE)
            ? window.GAME_STATE
            : (GameEngine && GameEngine.state) || null;

        const elements = [];
        const push = (id, type, obj, opts) => {
            if (!obj) return;
            if (!includeHidden && obj.visible === false) return;
            elements.push(this.buildElement(id, type, obj, opts || {}));
        };

        // 1. 建築與單體實體化資源 (scene.entities: id -> Image/Graphics，本體已 setPosition)
        if (scene.entities && typeof scene.entities.forEach === "function") {
            const entById = new Map();
            if (state && Array.isArray(state.mapEntities)) {
                state.mapEntities.forEach(e => { if (e && e.id) entById.set(e.id, e); });
            }
            scene.entities.forEach((obj, id) => {
                const ent = entById.get(id);
                const type = ent ? (ent.type1 || ent.type || "entity") : "entity";
                push(id, type, obj, { state: ent ? ent.state : undefined });
            });
        }

        // 2. 大地圖資源 (scene.resourceBobs: gx_gy -> { type, bob:Image })
        if (scene.resourceBobs && typeof scene.resourceBobs.forEach === "function") {
            scene.resourceBobs.forEach((info, key) => {
                if (info && info.bob) push(`res_${key}`, info.type || "resource", info.bob, {});
            });
        }

        // 3. 單位 (scene.units: id -> Graphics，本體 x/y=0，錨點取 state.renderX/Y)
        if (scene.units && typeof scene.units.forEach === "function") {
            const unitById = new Map();
            if (state && state.units) {
                [...(state.units.villagers || []), ...(state.units.npcs || [])]
                    .forEach(u => { if (u && u.id) unitById.set(u.id, u); });
            }
            scene.units.forEach((obj, id) => {
                const u = unitById.get(id);
                push(`unit_${id}`, (u && u.config && u.config.type) || "unit", obj, {
                    anchorX: u ? (u.renderX ?? u.x) : undefined,
                    anchorY: u ? (u.renderY ?? u.y) : undefined,
                    state: u ? u.state : undefined
                });
            });
        }

        // 4. 移動中的輸送帶貨物 (scene.logisticsTransferSprites: key -> Image)
        if (scene.logisticsTransferSprites && typeof scene.logisticsTransferSprites.forEach === "function") {
            scene.logisticsTransferSprites.forEach((sprite, key) => {
                if (!sprite) return;
                if (!includeHidden && sprite.visible === false) return;
                push(`transfer_${key}`, "transfer_item", sprite, {});
            });
        }

        // 依 zIndex 升序排序 (數字越大越在前/上層)
        elements.sort((a, b) => a.zIndex - b.zIndex);

        return {
            timestamp: Date.now(),
            coordSpace: "canvas-1920x1080",
            camera: {
                x: Math.round(cam.scrollX),
                y: Math.round(cam.scrollY),
                zoom: this._round(cam.zoom || 1)
            },
            viewport: { w: cam.width, h: cam.height },
            elementCount: elements.length,
            elements
        };
    }

    static exportToJSON(options = {}) {
        return JSON.stringify(this.exportCurrentVisualState(options));
    }

    static exportToConsole(options = {}) {
        const data = this.exportCurrentVisualState(options);
        // eslint-disable-next-line no-console
        console.log("[RenderDebugger] exportCurrentVisualState:", data);
        return data;
    }

    // --- X 光模式開關包裝 (Phase 1) ---
    static enableXray() { if (typeof window !== "undefined") window.DEBUG_RENDER_MODE = true; }
    static disableXray() { if (typeof window !== "undefined") window.DEBUG_RENDER_MODE = false; }
    static toggleXray() {
        if (typeof window === "undefined") return false;
        window.DEBUG_RENDER_MODE = !window.DEBUG_RENDER_MODE;
        return window.DEBUG_RENDER_MODE;
    }
}
