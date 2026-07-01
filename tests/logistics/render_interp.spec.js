const { test, expect } = require('@playwright/test');

// [體感 FPS 回歸] 渲染端等速插值:顯示進度每幀朝權威進度平滑追趕,讓 20Hz 的權威 progress
// 在 60Hz 畫面上平滑移動。並驗證路線換了(合流 remap)直接吸附、靜止物品不漂移。
test('渲染插值:平滑追趕 + 路線換線吸附 + 靜止不漂移', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => !!(window.GameEngine), { timeout: 15000 });

    const r = await page.evaluate(async () => {
        const { LogisticsRenderer } = await import('/src/renderers/logistics_renderer.js?v=' + Date.now());
        const { GameEngine } = await import('/src/systems/game_systems.js?v=' + Date.now());
        const TILE = GameEngine.TILE_SIZE || 20;

        const routeA = [{ x: 0, y: 0 }, { x: 400, y: 0 }];
        const routeB = [{ x: 0, y: 0 }, { x: 0, y: 400 }];
        let nowMs = 1000;
        const scene = { time: { get now() { return nowMs; } } };
        const tf = { id: 'x', efficiency: 4, routePoints: routeA };

        // 權威進度固定在小幅領先(0.04,模擬一個 20Hz tick 的位移,落在 5% 平滑窗口內),
        // 顯示從 0 開始;多幀後應「介於 0 與 auth 之間且單調上升」(平滑追趕,不瞬移)。
        const auth = 0.04;
        const series = [];
        // 第一次呼叫吸附到 auth? 不——首次吸附是吸附到當下 auth 值。為觀察追趕,先讓顯示落後:
        // 手動設定 _riProgress=0 模擬剛從停止/低處開始。先做一次首呼叫建立基準。
        LogisticsRenderer.getInterpolatedProgress(tf, 0, routeA, scene); // 基準 _riProgress=0
        for (let i = 0; i < 8; i++) {
            nowMs += 16; // ~60fps 幀距
            series.push(LogisticsRenderer.getInterpolatedProgress(tf, auth, routeA, scene));
        }
        const monotonic = series.every((v, i) => i === 0 || v >= series[i - 1] - 1e-9);
        const advancedSmoothly = series[0] > 0 && series[0] < auth && series[series.length - 1] <= auth + 1e-9;

        // 路線換線(合流 remap):routePoints 參照改變 → 應直接吸附回傳 auth,不跨路徑插值。
        const snapOnRouteChange = LogisticsRenderer.getInterpolatedProgress(tf, 0.2, routeB, scene);

        // 靜止物品(auth 不變)不應漂移:連續多幀同一 auth,顯示不超過 auth。
        const stat = { id: 's', efficiency: 4, routePoints: routeA };
        LogisticsRenderer.getInterpolatedProgress(stat, 0.3, routeA, scene);
        let maxStat = 0;
        for (let i = 0; i < 6; i++) { nowMs += 16; maxStat = Math.max(maxStat, LogisticsRenderer.getInterpolatedProgress(stat, 0.3, routeA, scene)); }

        // 關閉插值旗標應直接回傳 auth
        window.LOGISTICS_INTERP = false;
        const off = LogisticsRenderer.getInterpolatedProgress({ id: 'o', efficiency: 4, routePoints: routeA }, 0.77, routeA, scene);
        window.LOGISTICS_INTERP = true;

        return { series, monotonic, advancedSmoothly, snapOnRouteChange, maxStat, off };
    });

    expect(r.monotonic, '顯示進度應單調不回退').toBe(true);
    expect(r.advancedSmoothly, '應平滑追趕(介於起點與權威之間,不瞬移、不超過)').toBe(true);
    expect(r.snapOnRouteChange, '換線應吸附回傳新權威進度').toBeCloseTo(0.2, 5);
    expect(r.maxStat, '靜止物品不應漂移超過權威進度').toBeLessThanOrEqual(0.3 + 1e-6);
    expect(r.off, '關閉插值應直接回傳權威進度').toBeCloseTo(0.77, 5);
});

test('連續轉彎物品渲染取樣不可跳幀瞬移', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.GameEngine), { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsRenderer } = await import('/src/renderers/logistics_renderer.js?v=' + Date.now());
        const { GameEngine } = await import('/src/systems/game_systems.js?v=' + Date.now());
        const tile = GameEngine.TILE_SIZE || 20;
        const route = [
            { x: 0, y: 0 },
            { x: 0, y: tile },
            { x: tile, y: tile },
            { x: tile, y: tile * 2 }
        ];
        const geom = LogisticsRenderer._getTransferPathGeometry(route);
        const samples = [];
        for (let distance = 0; distance <= geom.totalPixels; distance += 1) {
            const point = LogisticsRenderer.getPointOnTransferPath(route, distance / geom.totalPixels);
            samples.push({ distance, x: point.x, y: point.y });
        }
        let maxStep = 0;
        let worst = null;
        for (let i = 1; i < samples.length; i++) {
            const prev = samples[i - 1];
            const curr = samples[i];
            const step = Math.hypot(curr.x - prev.x, curr.y - prev.y);
            if (step > maxStep) {
                maxStep = step;
                worst = { prev, curr, step };
            }
        }
        return { maxStep, worst, totalPixels: geom.totalPixels };
    });

    expect(result.maxStep, JSON.stringify(result.worst)).toBeLessThanOrEqual(2);
});

test('轉彎物品應沿固定半徑圓弧旋轉', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window.GameEngine), { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsRenderer } = await import('/src/renderers/logistics_renderer.js?v=' + Date.now());
        const { GameEngine } = await import('/src/systems/game_systems.js?v=' + Date.now());
        const tile = GameEngine.TILE_SIZE || 20;
        const route = [
            { x: 0, y: 0 },
            { x: 0, y: tile },
            { x: tile, y: tile }
        ];
        const geom = LogisticsRenderer._getTransferPathGeometry(route);
        const corner = geom.corners[0];
        const point = LogisticsRenderer.getPointOnTransferPath(route, corner.distAtCorner / geom.totalPixels);
        const center = {
            x: corner.curr.x - corner.inDir.x * corner.radius + corner.outDir.x * corner.radius,
            y: corner.curr.y - corner.inDir.y * corner.radius + corner.outDir.y * corner.radius
        };
        return {
            radius: corner.radius,
            distanceToCenter: Math.hypot(point.x - center.x, point.y - center.y),
            point,
            center
        };
    });

    expect(result.distanceToCenter).toBeCloseTo(result.radius, 5);
});

test('物流物品 sprite 必須套用轉彎角度旋轉', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
        const { LogisticsRenderer } = await import('/src/renderers/logistics_renderer.js?v=' + Date.now());
        const noop = () => {};
        const ctx = {
            clearRect: noop,
            fillRect: noop,
            strokeRect: noop,
            strokeText: noop,
            fillText: noop
        };
        let createdImage = null;
        const texture = {
            getContext: () => ctx,
            add: noop,
            refresh: noop,
            has: () => false
        };
        const scene = {
            logisticsTransferGraphics: { depth: 900000 },
            logisticsTransferAtlases: new Map(),
            textures: {
                exists: () => false,
                get: () => texture,
                createCanvas: () => texture
            },
            add: {
                image: (x, y, key, frame) => {
                    createdImage = {
                        x, y, key, frame,
                        rotation: 0,
                        visible: true,
                        depth: 0,
                        setOrigin(value) { this.origin = value; return this; },
                        setDepth(value) { this.depth = value; return this; },
                        setRotation(value) { this.rotation = value; return this; },
                        setPosition(nx, ny) { this.x = nx; this.y = ny; return this; },
                        setTexture(nextKey, nextFrame) { this.key = nextKey; this.frame = nextFrame; return this; },
                        setVisible(value) { this.visible = value; return this; },
                        setAlpha(value) { this.alpha = value; return this; },
                        destroy: noop
                    };
                    return createdImage;
                },
                blitter: () => ({
                    texture: { get: () => ({}) },
                    setDepth() { return this; },
                    create: () => ({})
                })
            }
        };
        const angle = Math.PI / 4;
        LogisticsRenderer.renderTransferSprite(scene, { id: 'turning-item' }, 100, 120, 0x00ff00, 20, 2, angle);
        return {
            usedImage: !!createdImage,
            rotation: createdImage?.rotation ?? null,
            x: createdImage?.x ?? null,
            y: createdImage?.y ?? null
        };
    });

    expect(result.usedImage).toBe(true);
    expect(result.rotation).toBeCloseTo(Math.PI / 4, 5);
    expect(result.x).toBe(100);
    expect(result.y).toBe(120);
});
