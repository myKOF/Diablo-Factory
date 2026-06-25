const { test, expect } = require('@playwright/test');

// P1#5 回歸覆蓋：PathfindingSystem（先前無任何行為斷言）。
// 僅測「同步、決定性」的格網幾何邏輯：setGrid / isValidAndWalkable /
// getNearestWalkableTile / hasGridLineOfSight / smoothGridPath，
// 以及 findPath 的「同步守衛分支」（未設格網、座標越界）。
// 非同步的 easystar 路徑計算（findPath 主體 / update）不在此覆蓋，避免 flaky。
// 斷言「領域上應為真」的不變量（最近可行格、轉角防穿模、平滑保端點且逐段視線通暢），
// 而非照抄實作的搜尋順序；若日後改壞這些不變量即會變紅。
test('PathfindingSystem 行為回歸基準', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { PathfindingSystem } = await import('/src/systems/PathfindingSystem.js?v=' + Date.now());
        const fails = [];
        const eq = (got, want, label) => { if (got !== want) fails.push(`${label}: 期望 ${JSON.stringify(want)}，得到 ${JSON.stringify(got)}`); };
        const ok = (cond, label) => { if (!cond) fails.push(label); };

        // 全程以 isAbsolute=false（純格網索引、不扣 offset）呼叫格網方法以保持決定性；
        // 仍將 mapOffset 歸零並於 finally 還原，作為對 isAbsolute 路徑的縱深防護。
        const snapOffset = window.GAME_STATE.mapOffset;
        window.GAME_STATE.mapOffset = { x: 0, y: 0 };
        try {
            // 建構新實例：easystar 來自 esm.sh，但本頁先前已載入過 → 快取命中。
            const pf = new PathfindingSystem();

            // --- setGrid：設定後 isGridSet 為真 ---
            {
                ok(pf.isGridSet === false, 'setGrid 前 isGridSet 為 false');
                pf.setGrid([[0, 0, 0], [0, 1, 0], [0, 0, 0]]); // grid[row=y][col=x]，1=障礙
                ok(pf.isGridSet === true, 'setGrid 後 isGridSet 為 true');
            }

            // --- isValidAndWalkable：界內且 cell==0 才為真；越界或障礙皆為假 ---
            {
                // 此格網中心 (1,1)=1 為障礙，其餘為可行
                ok(pf.isValidAndWalkable(0, 0, false) === true, 'isValidAndWalkable 界內空地 → true');
                ok(pf.isValidAndWalkable(2, 2, false) === true, 'isValidAndWalkable 界內角落空地 → true');
                ok(pf.isValidAndWalkable(1, 1, false) === false, 'isValidAndWalkable 障礙格(==1) → false');
                ok(pf.isValidAndWalkable(3, 0, false) === false, 'isValidAndWalkable x 越界 → false');
                ok(pf.isValidAndWalkable(0, 3, false) === false, 'isValidAndWalkable y 越界 → false');
                ok(pf.isValidAndWalkable(-1, 0, false) === false, 'isValidAndWalkable 負索引 → false');
            }

            // --- getNearestWalkableTile：當前可行則回傳自身；被封則螺旋找最近可行；
            //     skipCurrent 強制找鄰格；超出 maxRadius 找不到回傳 null ---
            {
                // (a) 當前可行且不跳過 → 原樣回傳自身座標
                const self = pf.getNearestWalkableTile(0, 0, 5, false, false);
                ok(self && self.x === 0 && self.y === 0, 'getNearestWalkableTile 當前可行 → 回傳自身');

                // (b) 站在障礙格 (1,1) → 回傳一個「可行」且為「最近」(Chebyshev 半徑 1)的鄰格
                const near = pf.getNearestWalkableTile(1, 1, 5, false, false);
                ok(near != null, 'getNearestWalkableTile 障礙格 → 找到鄰近可行格(非 null)');
                ok(near && pf.isValidAndWalkable(near.x, near.y, false), 'getNearestWalkableTile 回傳的格確實可行');
                ok(near && Math.max(Math.abs(near.x - 1), Math.abs(near.y - 1)) === 1, 'getNearestWalkableTile 回傳為最近(半徑1)鄰格');

                // (c) skipCurrent=true：即使當前可行也須改回傳「不同的、仍可行」的鄰格
                const skipped = pf.getNearestWalkableTile(0, 0, 5, false, true);
                ok(skipped && !(skipped.x === 0 && skipped.y === 0), 'getNearestWalkableTile skipCurrent 強制避開自身');
                ok(skipped && pf.isValidAndWalkable(skipped.x, skipped.y, false), 'getNearestWalkableTile skipCurrent 回傳仍為可行格');

                // (d) 全障礙格網 → maxRadius 內無可行 → null
                const blocked = new PathfindingSystem();
                blocked.setGrid([[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
                eq(blocked.getNearestWalkableTile(1, 1, 5, false, false), null, 'getNearestWalkableTile 全封死 → null');

                // (e) 唯一可行格在遠處：半徑太小找不到，放大半徑則找到（最近性的另一面）
                const farPf = new PathfindingSystem();
                farPf.setGrid([
                    [1, 1, 1, 1, 1],
                    [1, 1, 1, 1, 1],
                    [1, 1, 1, 1, 1],
                    [1, 1, 1, 1, 1],
                    [1, 1, 1, 1, 0],
                ]);
                eq(farPf.getNearestWalkableTile(0, 0, 2, false, false), null, 'getNearestWalkableTile 半徑不足 → null');
                const found = farPf.getNearestWalkableTile(0, 0, 10, false, false);
                ok(found && found.x === 4 && found.y === 4, 'getNearestWalkableTile 半徑足夠 → 找到唯一可行格');

                // (f) isAbsolute=true：世界座標須扣 mapOffset 換算為本地格，回傳值再加回 offset
                //     （覆蓋「世界↔格網」座標換算這條真實領域邏輯，前述皆走 isAbsolute=false）
                const offPf = new PathfindingSystem();
                offPf.setGrid([[0, 0, 0], [0, 1, 0], [0, 0, 0]]); // 本地中心 (1,1)=障礙
                window.GAME_STATE.mapOffset = { x: 10, y: 10 };
                const w0 = offPf.getNearestWalkableTile(10, 10, 5, true, false); // 世界(10,10)→本地(0,0) 可行
                ok(w0 && w0.x === 10 && w0.y === 10, 'getNearestWalkableTile(isAbsolute) 世界座標可行 → 回傳同一世界座標');
                const w1 = offPf.getNearestWalkableTile(11, 11, 5, true, false); // 世界(11,11)→本地(1,1) 障礙
                ok(w1 && offPf.isValidAndWalkable(w1.x, w1.y, true), 'getNearestWalkableTile(isAbsolute) 障礙 → 回傳可行的世界座標鄰格');
                ok(w1 && Math.max(Math.abs(w1.x - 11), Math.abs(w1.y - 11)) === 1, 'getNearestWalkableTile(isAbsolute) 回傳為最近(半徑1)世界鄰格');
                window.GAME_STATE.mapOffset = { x: 0, y: 0 }; // 還原為本測試其餘部分假設的零偏移
            }

            // --- hasGridLineOfSight：直線無阻擋 true；中途有障礙 false；
            //     斜線「切角」遇障礙因 disableCornerCutting 行為而 false ---
            {
                const clear = new PathfindingSystem();
                clear.setGrid([[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]);
                ok(clear.hasGridLineOfSight({ x: 0, y: 0 }, { x: 4, y: 0 }) === true, 'hasGridLineOfSight 水平淨空 → true');
                ok(clear.hasGridLineOfSight({ x: 0, y: 0 }, { x: 2, y: 2 }) === true, 'hasGridLineOfSight 斜線淨空 → true');

                const wall = new PathfindingSystem();
                wall.setGrid([[0, 0, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 0, 0]]); // (2,1)=障礙
                ok(wall.hasGridLineOfSight({ x: 0, y: 1 }, { x: 4, y: 1 }) === false, 'hasGridLineOfSight 直線被障礙阻斷 → false');

                // 斜穿障礙轉角：(0,0)→(2,2) 經過 (1,1)=障礙 → false（同時亦防切角穿模）
                ok(pf.hasGridLineOfSight({ x: 0, y: 0 }, { x: 2, y: 2 }) === false, 'hasGridLineOfSight 斜線穿障礙/切角 → false');
            }

            // --- smoothGridPath：<=2 點原樣；直線共線塌縮成端點；遇障礙須保留轉折 ---
            {
                // (a) <=2 點原樣回傳：斷言「內容不變」而非參考身分（回傳淺拷貝亦屬正確）
                const two = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
                const twoOut = pf.smoothGridPath(two);
                eq(twoOut.length, 2, 'smoothGridPath <=2 點：點數不變');
                ok(twoOut[0].x === 0 && twoOut[0].y === 0 && twoOut[1].x === 1 && twoOut[1].y === 0, 'smoothGridPath <=2 點：內容原樣（不綁定參考身分）');

                // (b) 共線直線：淨空 → 塌縮成「首尾兩點」
                const clear = new PathfindingSystem();
                clear.setGrid([[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]);
                const collapsed = clear.smoothGridPath([
                    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 },
                ]);
                eq(collapsed.length, 2, 'smoothGridPath 共線直線塌縮成 2 點');
                ok(collapsed[0].x === 0 && collapsed[0].y === 0, 'smoothGridPath 保留起點');
                ok(collapsed[1].x === 4 && collapsed[1].y === 0, 'smoothGridPath 保留終點');

                // (c) 繞障礙的 L 形路徑：起終直線視線被擋 → 須保留轉折(>2 點)，
                //     且首尾不變、每段子路徑視線皆通暢（領域不變量）。
                const bend = new PathfindingSystem();
                bend.setGrid([
                    [0, 0, 1, 0, 0],
                    [0, 0, 1, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                    [0, 0, 0, 0, 0],
                ]);
                const bendPath = [
                    { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
                    { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 },
                ];
                // 前置確認：起終直線視線確實被障礙阻斷（故必須保留轉折）
                ok(bend.hasGridLineOfSight({ x: 0, y: 0 }, { x: 4, y: 2 }) === false, 'smoothGridPath 前置：起終直線被擋');
                const sm = bend.smoothGridPath(bendPath);
                ok(sm.length > 2, 'smoothGridPath 障礙逼迫下保留轉折(>2 點)');
                ok(sm[0].x === 0 && sm[0].y === 0, 'smoothGridPath 繞行仍保留起點');
                ok(sm[sm.length - 1].x === 4 && sm[sm.length - 1].y === 2, 'smoothGridPath 繞行仍保留終點');
                let allSegLOS = true;
                for (let i = 0; i < sm.length - 1; i++) {
                    if (!bend.hasGridLineOfSight(sm[i], sm[i + 1])) { allSegLOS = false; break; }
                }
                ok(allSegLOS, 'smoothGridPath 每段子路徑視線皆通暢(平滑不穿牆)');
            }

            // --- findPath 同步守衛：未設格網 / 座標越界 → 同步以 null 回呼 ---
            {
                // (a) 未設格網 → 立即同步 callback(null)
                const noGrid = new PathfindingSystem();
                let cap1 = 'NOTCALLED';
                noGrid.findPath(0, 0, 40, 40, (v) => { cap1 = v; });
                eq(cap1, null, 'findPath 未設格網 → 同步回呼 null');

                // 以下使用 tileSize=20、3x3 格網（像素界線：col/row 索引 0..2，像素 < 60 為界內）
                // (b) 起點越界（負像素 → 負索引）→ 同步 null
                let cap2 = 'NOTCALLED';
                pf.findPath(-100, -100, 20, 20, (v) => { cap2 = v; });
                eq(cap2, null, 'findPath 起點越界 → 同步回呼 null');

                // (c) 終點越界（像素遠超格網寬）→ 同步 null（起點 (0,0) 有效，方能進到終點界檢）
                let cap3 = 'NOTCALLED';
                pf.findPath(0, 0, 100000, 0, (v) => { cap3 = v; });
                eq(cap3, null, 'findPath 終點越界 → 同步回呼 null');
            }
        } finally {
            window.GAME_STATE.mapOffset = snapOffset;
        }

        return { fails };
    });

    expect(result.fails, JSON.stringify(result.fails, null, 2)).toEqual([]);
});