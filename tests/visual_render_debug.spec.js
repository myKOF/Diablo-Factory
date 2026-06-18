const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * Phase 3 — 端對端視覺驗證腳本
 *
 * 以 headless 啟動遊戲 → 凍結背景邏輯迴圈以注入確定性狀態 → 模擬行為
 * (放置建築 / 注入移動貨物) → 呼叫 Phase 2 的 exportCurrentVisualState()
 * → 斷言渲染結果 (邏輯網格、螢幕對位、Z-index 排序、貨物落點)。
 *
 * 本測試自我包含，不依賴既有 flaky 的 test_split_merge_bug。
 */

const TMP = path.join(__dirname, '../tmp');

test.beforeAll(() => {
    if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
});

async function waitForGameReady(page) {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => {
        const s = window.PhaserScene;
        return !!(window.GAME_STATE && window.GameEngine && s && s.cameras && s.cameras.main &&
            typeof window.exportCurrentVisualState === 'function' && window.RenderDebugger);
    }, { timeout: 15000 });
}

// 推進數個渲染幀，讓 MainScene.update 建立/更新 Phaser 顯示物件
async function advanceFrames(page, count = 5) {
    await page.evaluate((n) => new Promise((resolve) => {
        let i = 0;
        const tick = () => { if (++i >= n) resolve(); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
    }), count);
}

test.describe('視覺渲染自動化驗證', () => {

    test('座標數學：worldToScreen 為 screenToWorldPoint 的反運算', async ({ page }) => {
        await waitForGameReady(page);
        const errors = await page.evaluate(() => {
            const scene = window.PhaserScene;
            const cam = scene.cameras.main;
            const RD = window.RenderDebugger;
            const samples = [[0, 0], [123, 456], [-200, 300], [5000, 5000], [3333, 1111]];
            const errs = [];
            for (const [wx, wy] of samples) {
                const s = RD.worldToScreen(cam, wx, wy);
                const back = scene.screenToWorldPoint(s.x, s.y);
                if (Math.abs(back.x - wx) > 0.01 || Math.abs(back.y - wy) > 0.01) {
                    errs.push({ wx, wy, screen: s, back });
                }
            }
            return errs;
        });
        expect(errors).toEqual([]);
    });

    test('建築：邏輯網格、螢幕中心對位、Y軸 Z-index 排序', async ({ page }) => {
        await waitForGameReady(page);

        const setup = await page.evaluate(() => {
            const GE = window.GameEngine, st = window.GAME_STATE, scene = window.PhaserScene;
            const TS = GE.TILE_SIZE;
            // 凍結邏輯迴圈，確保注入狀態不被背景 tick 改寫
            st.isPaused = true;

            // 以地圖中心附近作為放置點，保證落在相機可捲動範圍內 (置中不會被 bounds 夾住)
            const rect = scene.getMapWorldRect();
            const gx = Math.floor(rect.centerX / TS);
            const gy = Math.floor(rect.centerY / TS);
            const ax = gx * TS + TS / 2, ay = gy * TS + TS / 2;
            const gbx = gx + 4, gby = gy + 6; // B 的 y 較大 → 應渲染在 A 之上
            const bx = gbx * TS + TS / 2, by = gby * TS + TS / 2;

            st.mapEntities = st.mapEntities.filter(e => e.id !== 'vrd_A' && e.id !== 'vrd_B');
            st.mapEntities.push({ id: 'vrd_A', type1: 'village', x: ax, y: ay, rotationSteps: 0, isUnderConstruction: false, name: 'A' });
            st.mapEntities.push({ id: 'vrd_B', type1: 'village', x: bx, y: by, rotationSteps: 0, isUnderConstruction: false, name: 'B' });
            st.renderVersion++;
            GE.updateSpatialGrid();
            scene.pendingVisibleEntities = true;
            scene.setCameraCenter(ax, ay, 1);

            const cam = scene.cameras.main;
            return { gx, gy, gbx, gby, ax, ay, bx, by, camW: cam.width, camH: cam.height };
        });

        // 等待渲染器實際建立兩棟建築的 Phaser 物件
        await page.waitForFunction(() => {
            const v = window.exportCurrentVisualState();
            return v.elements.some(e => e.id === 'vrd_A') && v.elements.some(e => e.id === 'vrd_B');
        }, { timeout: 10000 });
        await advanceFrames(page, 3);

        const v = await page.evaluate(() => window.exportCurrentVisualState());
        fs.writeFileSync(path.join(TMP, 'visual_state_buildings.json'), JSON.stringify(v, null, 2));
        await page.screenshot({ path: path.join(TMP, 'visual_state_buildings.png') });

        const A = v.elements.find(e => e.id === 'vrd_A');
        const B = v.elements.find(e => e.id === 'vrd_B');
        expect(A, 'building A should be serialized').toBeTruthy();
        expect(B, 'building B should be serialized').toBeTruthy();

        // 1. 邏輯網格 = 放置網格
        expect(A.logicalGrid.x).toBe(setup.gx);
        expect(A.logicalGrid.y).toBe(setup.gy);
        expect(B.logicalGrid.x).toBe(setup.gbx);
        expect(B.logicalGrid.y).toBe(setup.gby);

        // 2. A 置於相機中心 → 螢幕中心 (非循環驗證：透過相機定位)
        expect(Math.abs(A.screenPos.x - setup.camW / 2)).toBeLessThanOrEqual(2);
        expect(Math.abs(A.screenPos.y - setup.camH / 2)).toBeLessThanOrEqual(2);

        // 3. Y 軸排序：B 的世界 y 較大 → zIndex 較大 → 渲染在 A 之上
        expect(B.worldPos.y).toBeGreaterThan(A.worldPos.y);
        expect(B.zIndex).toBeGreaterThan(A.zIndex);
        expect(A.logicalGrid.layer).toBe(1);
        expect(B.logicalGrid.layer).toBe(1);

        // 4. elements 依 zIndex 升序排列 → B 在陣列中位於 A 之後
        const idxA = v.elements.findIndex(e => e.id === 'vrd_A');
        const idxB = v.elements.findIndex(e => e.id === 'vrd_B');
        expect(idxB).toBeGreaterThan(idxA);

        // 5. bounding box 應為正值
        expect(A.boundingBox.w).toBeGreaterThan(0);
        expect(A.boundingBox.h).toBeGreaterThan(0);
    });

    test('物流貨物：序列化落點在路徑線段上且渲染於建築層之上', async ({ page }) => {
        await waitForGameReady(page);

        const info = await page.evaluate(() => {
            const GE = window.GameEngine, st = window.GAME_STATE, scene = window.PhaserScene;
            const TS = GE.TILE_SIZE;
            st.isPaused = true; // 凍結邏輯迴圈，避免 WorkerSystem 改寫 activeTransfers

            const rect = scene.getMapWorldRect();
            const gx = Math.floor(rect.centerX / TS);
            const gy = Math.floor(rect.centerY / TS);
            const ax = gx * TS + TS / 2, ay = gy * TS + TS / 2;
            const bx = (gx + 8) * TS + TS / 2, by = ay; // 水平線段

            // 注入一筆帶有 stored route 的移動貨物 (progress 0.5 → 線段中點)
            st.activeTransfers = [{
                id: 'vrd_T1', itemType: 'wood', progress: 0.5, serialNumber: 1,
                routePoints: [{ x: ax, y: ay }, { x: bx, y: by }]
            }];
            scene.setCameraCenter((ax + bx) / 2, ay, 1);
            scene.pendingVisibleEntities = true;

            return { midX: (ax + bx) / 2, midY: (ay + by) / 2 };
        });

        await page.waitForFunction(() => {
            const v = window.exportCurrentVisualState();
            return v.elements.some(e => e.id === 'transfer_vrd_T1');
        }, { timeout: 10000 });
        await advanceFrames(page, 4);

        const v = await page.evaluate(() => window.exportCurrentVisualState());
        fs.writeFileSync(path.join(TMP, 'visual_state_transfer.json'), JSON.stringify(v, null, 2));
        await page.screenshot({ path: path.join(TMP, 'visual_state_transfer.png') });

        const T = v.elements.find(e => e.id === 'transfer_vrd_T1');
        expect(T, 'transfer item should be serialized').toBeTruthy();

        // 1. 移動貨物層級 = 2 (物流貨物層)
        expect(T.logicalGrid.layer).toBe(2);

        // 2. progress 0.5 → 落在水平線段中點
        expect(Math.abs(T.worldPos.x - info.midX)).toBeLessThanOrEqual(3);
        expect(Math.abs(T.worldPos.y - info.midY)).toBeLessThanOrEqual(3);

        // 3. 渲染於建築層之上 (zIndex 高於任何 layer 1 物件)
        const buildingZ = v.elements.filter(e => e.logicalGrid.layer === 1).map(e => e.zIndex);
        if (buildingZ.length > 0) {
            expect(T.zIndex).toBeGreaterThan(Math.max(...buildingZ));
        }
    });

    test('X 光模式：開關可切換、繪製不報錯且 exportCurrentVisualState 結構正確', async ({ page }) => {
        const pageErrors = [];
        page.on('pageerror', (err) => pageErrors.push(String(err)));
        await waitForGameReady(page);

        const result = await page.evaluate(async () => {
            window.RenderDebugger.enableXray();
            const enabled = window.DEBUG_RENDER_MODE === true;
            // 連推數幀讓 X 光層實際繪製 (box/錨點/向量/標籤/連線)
            await new Promise((resolve) => {
                let i = 0;
                const tick = () => { if (++i >= 6) resolve(); else requestAnimationFrame(tick); };
                requestAnimationFrame(tick);
            });
            const v = window.exportCurrentVisualState();
            return {
                enabled,
                disabled: window.DEBUG_RENDER_MODE === false,
                hasTimestamp: typeof v.timestamp === 'number',
                coordSpace: v.coordSpace,
                hasCamera: v.camera && typeof v.camera.zoom === 'number',
                elementsIsArray: Array.isArray(v.elements),
                sortedAsc: v.elements.every((e, i) => i === 0 || v.elements[i - 1].zIndex <= e.zIndex)
            };
        });

        // 截圖保存 X 光疊圖供肉眼/AI 比對，再關閉
        await page.screenshot({ path: path.join(TMP, 'visual_state_xray.png') });
        await page.evaluate(() => window.RenderDebugger.disableXray());

        expect(result.enabled).toBe(true);
        expect(result.hasTimestamp).toBe(true);
        expect(result.coordSpace).toBe('canvas-1920x1080');
        expect(result.hasCamera).toBe(true);
        expect(result.elementsIsArray).toBe(true);
        expect(result.sortedAsc).toBe(true);
        // X 光繪製期間不得拋出任何未捕捉錯誤
        expect(pageErrors).toEqual([]);
    });
});
