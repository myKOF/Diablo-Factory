const { test, expect } = require('@playwright/test');

/**
 * 特徵測試：MainScene.getLogisticsRenderSignature 的「重繪觸發語義」。
 *
 * 此簽章用於物流靜態層的 dirty-check：每幀計算一次，與上幀比對，
 * 不同才重繪。本測試鎖定其「distinguishing power」不變式，使其實作
 * （字串串接 ↔ 數值滾動雜湊）可被安全重構：
 *   - 決定性：相同狀態 → 相同簽章。
 *   - 追蹤欄位變更 → 簽章必須改變（否則該變更不會觸發重繪 → 畫面陳舊）。
 *   - 非追蹤欄位變更 → 簽章不得改變（否則無謂重繪，吃掉 dirty-check 的意義）。
 *   - 量化：路徑點以 Math.round 量化，次像素變動不觸發、整數級變動觸發。
 */

async function waitForScene(page) {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => {
        const s = window.PhaserScene;
        return !!(s && typeof s.getLogisticsRenderSignature === 'function');
    }, { timeout: 15000 });
}

test('getLogisticsRenderSignature 重繪觸發語義特徵測試', async ({ page }) => {
    await waitForScene(page);

    const result = await page.evaluate(() => {
        const scene = window.PhaserScene;
        const sig = (st) => scene.getLogisticsRenderSignature(st);
        // 深拷貝，確保各變體互不污染
        const clone = (o) => JSON.parse(JSON.stringify(o));

        const base = {
            logisticsLines: [
                { id: 'L1', groupId: 'G1', filter: 'wood', routeWidth: 1, routePoints: [{ x: 10, y: 20 }, { x: 50, y: 20 }] },
                { id: 'L2', groupId: 'G1', filter: null, routeWidth: 2, routePoints: [{ x: 0, y: 0 }, { x: 0, y: 80 }, { x: 40, y: 80 }] }
            ],
            mapEntities: [
                { id: 'E1', outputTargets: [
                    { id: 'C1', lineId: 'L1', filter: 'wood', routePoints: [{ x: 10, y: 20 }, { x: 30, y: 20 }] }
                ] },
                { id: 'E2', outputTargets: [
                    { id: 'C2', lineId: null, filter: null, routePoints: [{ x: 100, y: 100 }, { x: 140, y: 100 }] }
                ] }
            ],
            selectedLogisticsLineId: 'L1',
            selectedLogisticsGroupId: 'G1'
        };

        const baseSig = sig(base);

        // 決定性：同內容、不同物件 → 同簽章
        const deterministic = sig(clone(base)) === baseSig;

        // 追蹤欄位：每個變更都必須改變簽章
        const trackedDiffers = {};
        const mutate = (fn) => { const st = clone(base); fn(st); return sig(st) !== baseSig; };

        trackedDiffers.lineAdded = mutate(st => st.logisticsLines.push({ id: 'L3', groupId: 'G2', filter: null, routeWidth: 1, routePoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }));
        trackedDiffers.lineRemoved = mutate(st => st.logisticsLines.pop());
        trackedDiffers.lineId = mutate(st => { st.logisticsLines[0].id = 'L1x'; });
        trackedDiffers.lineGroupId = mutate(st => { st.logisticsLines[0].groupId = 'G9'; });
        trackedDiffers.lineFilter = mutate(st => { st.logisticsLines[0].filter = 'stone'; });
        trackedDiffers.lineRouteWidth = mutate(st => { st.logisticsLines[0].routeWidth = 3; });
        trackedDiffers.lineRoutePointCount = mutate(st => { st.logisticsLines[0].routePoints.push({ x: 99, y: 20 }); });
        trackedDiffers.connId = mutate(st => { st.mapEntities[0].outputTargets[0].id = 'C1x'; });
        trackedDiffers.connLineId = mutate(st => { st.mapEntities[0].outputTargets[0].lineId = 'L2'; });
        trackedDiffers.connFilter = mutate(st => { st.mapEntities[0].outputTargets[0].filter = 'iron'; });
        trackedDiffers.connRoutePointMoved = mutate(st => { st.mapEntities[0].outputTargets[0].routePoints[1].x = 31; });
        trackedDiffers.connRoutePointCount = mutate(st => { st.mapEntities[0].outputTargets[0].routePoints.push({ x: 60, y: 20 }); });
        trackedDiffers.outputTargetAdded = mutate(st => { st.mapEntities[0].outputTargets.push({ id: 'C9', lineId: null, filter: null, routePoints: [{ x: 5, y: 5 }, { x: 6, y: 6 }] }); });
        trackedDiffers.selectedLine = mutate(st => { st.selectedLogisticsLineId = 'L2'; });
        trackedDiffers.selectedGroup = mutate(st => { st.selectedLogisticsGroupId = 'G2'; });

        // 量化：次像素變動（< 0.5）不觸發；整數級變動觸發
        const subPixelSame = mutate(st => { st.mapEntities[0].outputTargets[0].routePoints[1].x += 0.4; }) === false;
        const integerDiffers = mutate(st => { st.mapEntities[0].outputTargets[0].routePoints[1].x += 1; });

        // 非追蹤欄位：不得改變簽章
        const untrackedSame = {};
        const sameAfter = (fn) => { const st = clone(base); fn(st); return sig(st) === baseSig; };
        untrackedSame.connEfficiency = sameAfter(st => { st.mapEntities[0].outputTargets[0].efficiency = 0.5; });
        untrackedSame.lineExtraField = sameAfter(st => { st.logisticsLines[0]._internal = 'whatever'; });
        untrackedSame.unrelatedStateField = sameAfter(st => { st.someUnrelatedThing = 12345; });

        return { deterministic, trackedDiffers, subPixelSame, integerDiffers, untrackedSame };
    });

    expect(result.deterministic, '相同狀態必須產生相同簽章').toBe(true);

    for (const [field, differs] of Object.entries(result.trackedDiffers)) {
        expect(differs, `追蹤欄位 ${field} 變更必須改變簽章（否則不會觸發重繪）`).toBe(true);
    }

    expect(result.subPixelSame, '次像素（<0.5）路徑變動不應改變簽章').toBe(true);
    expect(result.integerDiffers, '整數級路徑變動必須改變簽章').toBe(true);

    for (const [field, same] of Object.entries(result.untrackedSame)) {
        expect(same, `非追蹤欄位 ${field} 變更不得改變簽章`).toBe(true);
    }
});
