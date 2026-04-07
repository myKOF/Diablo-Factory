/**
 * 大地圖數據系統 (Map Data System)
 * 遵循 [大地圖渲染與數據分離協議]
 * 使用 Uint16Array 儲存全地圖資源數據，極大化效能並支持萬級資源。
 */
export class MapDataSystem {
    constructor(cols, rows, offset) {
        this.cols = cols;
        this.rows = rows;
        this.offset = offset; // { x, y } 地圖偏移起點 (格網座標)
        this.totalTiles = cols * rows;

        // 1. 資源類型網格 (Uint16Array: 0=無, 1=樹, 2=石, 3=糧, 4=金)
        this.typeGrid = new Uint16Array(this.totalTiles);

        // 2. 資源數量網格 (Uint16Array: 儲存剩餘採集量)
        this.amountGrid = new Uint16Array(this.totalTiles);

        // 3. 視覺變量網格 (Uint32Array: 儲存 [Tint: 24bit, ScaleIndex: 8bit])
        this.variationGrid = new Uint32Array(this.totalTiles);

        // 4. 等級網格 (Uint8Array)
        this.levelGrid = new Uint8Array(this.totalTiles);

        // 5. 重繪標記 (Dirty Flags) - 以 Chunk 為單位 (32x32)
        this.chunkSize = 32;
        this.chunkCols = Math.ceil(cols / this.chunkSize);
        this.chunkRows = Math.ceil(rows / this.chunkSize);
        this.dirtyChunks = new Uint8Array(this.chunkCols * this.chunkRows);

        console.log(`[MapDataSystem] 初始化完成: ${cols}x${rows} (${this.totalTiles} 總格數)`);
    }

    /**
     * 獲取格網索引
     */
    getIndex(gx, gy) {
        const lx = gx - this.offset.x;
        const ly = gy - this.offset.y;
        if (lx < 0 || lx >= this.cols || ly < 0 || ly >= this.rows) return -1;
        return lx + ly * this.cols;
    }

    /**
     * 設置資源
     */
    setResource(gx, gy, type, amount, level = 1) {
        const idx = this.getIndex(gx, gy);
        if (idx === -1) return;

        this.typeGrid[idx] = type;
        this.amountGrid[idx] = amount;
        this.levelGrid[idx] = level;

        this.markChunkDirty(gx, gy);
    }

    /**
     * 獲取資源數據
     */
    getResource(gx, gy) {
        const idx = this.getIndex(gx, gy);
        if (idx === -1) return null;

        const type = this.typeGrid[idx];
        if (type === 0) return null;

        return {
            type: type,
            amount: this.amountGrid[idx],
            level: this.levelGrid[idx]
        };
    }

    /**
     * 扣除資源量
     */
    consumeResource(gx, gy, delta) {
        const idx = this.getIndex(gx, gy);
        if (idx === -1 || this.typeGrid[idx] === 0) return 0;

        const current = this.amountGrid[idx];
        const consumed = Math.min(current, delta);
        const remaining = current - consumed;

        this.amountGrid[idx] = remaining;
        this.markChunkDirty(gx, gy); // 通知渲染層該格數據已變動

        // 若資源耗盡，清除類型
        if (remaining <= 0) {
            this.typeGrid[idx] = 0;
            return consumed;
        }

        return consumed;
    }

    /**
     * 標記區塊為髒值，用於增量更新渲染
     */
    markChunkDirty(gx, gy) {
        const lx = gx - this.offset.x;
        const ly = gy - this.offset.y;
        const cx = Math.floor(lx / this.chunkSize);
        const cy = Math.floor(ly / this.chunkSize);
        if (cx >= 0 && cx < this.chunkCols && cy >= 0 && cy < this.chunkRows) {
            this.dirtyChunks[cx + cy * this.chunkCols] = 1;
        }
    }

    /**
     * 獲取指定範圍內的所有可見資源 (Viewport Culling)
     * 用於渲染器查詢
     */
    getVisibleResources(viewX, viewY, viewW, viewH, tileSize) {
        const startGX = Math.floor(viewX / tileSize);
        const endGX = Math.floor((viewX + viewW) / tileSize);
        const startGY = Math.floor(viewY / tileSize);
        const endGY = Math.floor((viewY + viewH) / tileSize);

        const results = [];
        for (let gy = startGY; gy <= endGY; gy++) {
            for (let gx = startGX; gx <= endGX; gx++) {
                const idx = this.getIndex(gx, gy);
                if (idx !== -1 && this.typeGrid[idx] !== 0) {
                    results.push({
                        gx: gx,
                        gy: gy,
                        type: this.typeGrid[idx],
                        amount: this.amountGrid[idx],
                        level: this.levelGrid[idx] || 1
                    });
                }
            }
        }
        return results;
    }
}
