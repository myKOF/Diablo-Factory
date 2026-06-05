const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('遊戲加載與自測', () => {
  test.beforeAll(() => {
    // 確保 tmp 目錄存在（無痕測試領地限制）
    const tmpDir = path.join(__dirname, '../tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  test('首頁應成功載入並渲染 Canvas 遊戲畫面', async ({ page }) => {
    // 1. 導航至本地伺服器
    await page.goto('/');

    // 2. 等待 DOM 加載並驗證 Phaser 的 Canvas 元素存在且可見
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // 3. 驗證全域的 GAME_STATE 初始化成功
    const gameStateInitialized = await page.evaluate(() => {
      return typeof window.GAME_STATE !== 'undefined' && Array.isArray(window.GAME_STATE.logisticsLines);
    });
    expect(gameStateInitialized).toBe(true);

    // 4. 保存網頁截圖到 tmp 檔案夾以進行無痕視覺確認
    const screenshotPath = path.join(__dirname, '../tmp/game_launch.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`[自測] 遊戲加載截圖已成功保存至：${screenshotPath}`);
  });
});
