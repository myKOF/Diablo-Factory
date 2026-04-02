import EasyStarNamespace from 'https://esm.sh/easystarjs@0.4.4';
import { UI_CONFIG } from '../ui_config.js';

/**
 * 核心尋路系統 (Pathfinding System)
 * 基於 EasyStar.js 實作，支援非同步計算與每幀量能限制
 */
export class PathfindingSystem {
    constructor() {
        // 兼容不同 ESM 包裝格式 (esm.sh 可能回傳 { js: [Function] } 或直接是類別)
        const ESClass = EasyStarNamespace.js || EasyStarNamespace.default || EasyStarNamespace;
        
        try {
            this.easystar = new ESClass();
        } catch (e) {
            // 如果 ESClass 本身不是構造函數，嘗試 .js
            if (ESClass.js) this.easystar = new ESClass.js();
            else throw new Error("無法初始化 EasyStar: 找不到構造函數");
        }

        this.tileSize = 20; // 預設值，應與 GameEngine 同步
        this.grid = [];
        this.isGridSet = false;
        
        // 從全域配置讀取 (核心協議：解耦規範)
        const cfg = UI_CONFIG.Pathfinding || { debugColor: '#00ff00', iterationsPerFrame: 1000 };
        this.debugColor = cfg.debugColor; 
        
        // 每幀限制計算量以確保拖動畫面不卡頓
        if (this.easystar) {
            this.easystar.setIterationsPerCalculation(cfg.iterationsPerFrame);
            // 實作 8 方向斜向尋路優化
            this.easystar.enableDiagonals();
            // 防止單位在經過建築物轉角時發生穿模
            this.easystar.disableCornerCutting();
        }
    }


    /**
     * 更新地圖格網
     * @param {number[][]} matrix 2D 陣列，0 為可通行，1 為障礙物
     */
    setGrid(matrix) {
        this.grid = matrix;
        this.easystar.setGrid(matrix);
        this.isGridSet = true;
    }

    /**
     * 設定可通行編號
     * @param {number[]} tiles 
     */
    setAcceptableTiles(tiles = [0]) {
        this.easystar.setAcceptableTiles(tiles);
    }

    /**
     * 非同步尋路
     * @param {number} startX 像素座標X
     * @param {number} startY 像素座標Y
     * @param {number} endX 像素座標X
     * @param {number} endY 像素座標Y
     * @param {Function} callback 尋路完成回呼
     */
    findPath(startX, startY, endX, endY, callback) {
        if (!this.isGridSet) return;

        const gx1 = Math.floor(startX / this.tileSize);
        const gy1 = Math.floor(startY / this.tileSize);
        let gx2 = Math.floor(endX / this.tileSize);
        let gy2 = Math.floor(endY / this.tileSize);

        // 邊界檢查
        if (gy1 < 0 || gy1 >= this.grid.length || gx1 < 0 || gx1 >= this.grid[0].length) { callback(null); return; }
        if (gy2 < 0 || gy2 >= this.grid.length || gx2 < 0 || gx2 >= this.grid[0].length) { callback(null); return; }

        // 核心修復：如果目標本身是不可行走區域（如倉庫、城鎮中心），自動導航到其「邊緣最近的空地」
        if (this.grid[gy2][gx2] !== 0) {
            const nearestEnd = this.getNearestWalkableTile(gx2, gy2, 5); // 在5格半徑內找最近著陸點
            if (nearestEnd) {
                gx2 = nearestEnd.x;
                gy2 = nearestEnd.y;
            } else {
                callback(null); return; // 目標完全被封死
            }
        }

        // 起點保護：如果村民目前被視為站在障礙物內，也協助將起點強制「漂移」到周圍最近的安全格，以順利起步
        let finalGx1 = gx1, finalGy1 = gy1;
        if (this.grid[finalGy1][finalGx1] !== 0) {
            // 觸發防卡死機制
            const nearestStart = this.getNearestWalkableTile(finalGx1, finalGy1, 3);
            if (nearestStart) { finalGx1 = nearestStart.x; finalGy1 = nearestStart.y; }
        }

        this.easystar.findPath(finalGx1, finalGy1, gx2, gy2, (path) => {
            const isSelected = (GameEngine.state.selectedUnitId && Date.now() - GameEngine.state.lastSelectionTime < 10000); // 這裡需要一個過濾方式，或者傳入 ID
            // 為了方便，我們預設印出所有關於選中單位的路徑請求
            if (path) {
                // 將格網座標轉回像素座標 (中心點)
                const pixelPath = path.map(p => ({
                    x: p.x * this.tileSize + this.tileSize / 2,
                    y: p.y * this.tileSize + this.tileSize / 2
                }));
                callback(pixelPath);
            } else {
                callback(null);
            }
        });
    }

    /**
     * getNearestWalkableTile: 螺旋搜尋最近的可行格
     * 連動脫困邏輯：支援 8 方向檢測，提高脫困效率
     * @param {number} gx 
     * @param {number} gy 
     * @param {number} maxRadius 
     * @returns {{x: number, y: number} | null}
     */
    getNearestWalkableTile(gx, gy, maxRadius = 10) {
        if (!this.isGridSet || !this.grid) return null;
        if (this.grid[gy] && this.grid[gy][gx] === 0) return { x: gx, y: gy };

        // 螺旋搜尋 (Spiral Search)
        for (let r = 1; r <= maxRadius; r++) {
            // 從上方橫向搜尋 (含對角線)
            for (let x = gx - r; x <= gx + r; x++) {
                if (this.isValidAndWalkable(x, gy - r)) return { x, y: gy - r };
            }
            // 從下方橫向搜尋
            for (let x = gx - r; x <= gx + r; x++) {
                if (this.isValidAndWalkable(x, gy + r)) return { x, y: gy + r };
            }
            // 從左側縱向搜尋
            for (let y = gy - r + 1; y < gy + r; y++) {
                if (this.isValidAndWalkable(gx - r, y)) return { x: gx - r, y };
            }
            // 從右側縱向搜尋
            for (let y = gy - r + 1; y < gy + r; y++) {
                if (this.isValidAndWalkable(gx + r, y)) return { x: gx + r, y };
            }
        }
        return null;
    }

    isValidAndWalkable(x, y) {
        return (y >= 0 && y < this.grid.length && x >= 0 && x < this.grid[0].length && this.grid[y][x] === 0);
    }

    /**
     * 每幀呼叫，執行尋路計算
     */
    update() {
        this.easystar.calculate();
    }
}
