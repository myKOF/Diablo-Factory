const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('Import and Replay Flow E2E Test', async ({ page }) => {
    // 1. 確保 /tmp 目錄存在並寫入 dummy_script.js
    const tmpDir = path.join(__dirname, '../../tmp');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }
    const dummyPath = path.join(tmpDir, 'dummy_script.js');
    fs.writeFileSync(dummyPath, `
        const { test } = require('@playwright/test');
        test('dummy test', async ({ page }) => {
            await page.evaluate(() => console.log('AUTOPLAY_SCRIPT_E2E_CONFIRM'));
        });
    `, 'utf8');

    // 2. 開啟遊戲頁面
    await page.goto('/');
    await page.waitForTimeout(1000);

    // 3. 驗證導入按鈕存在
    const importBtn = page.locator('#import_script_btn');
    await expect(importBtn).toBeVisible();

    // 4. 點擊導入按鈕，使用 setInputFiles 選擇 dummy_script.js
    const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        importBtn.click()
    ]);
    await fileChooser.setFiles(dummyPath);

    // 5. 確定腳本後，導入按鈕上方顯示已選擇的腳本名稱
    const label = page.locator('#selected_script_label');
    await expect(label).toBeVisible();
    await expect(label).toContainText('dummy_script.js');

    // 6. 按鈕旁顯示一個重播箭頭按鈕
    const replayBtn = page.locator('#replay_script_btn');
    await expect(replayBtn).toBeVisible();
    await expect(replayBtn).toContainText('重播');

    // 7. 按下重播按鈕後，瀏覽器刷新，然後開始重播 (監聽 console 輸出)
    const consolePromise = new Promise((resolve) => {
        page.on('console', msg => {
            if (msg.text() === 'AUTOPLAY_SCRIPT_E2E_CONFIRM') {
                resolve(true);
            }
        });
    });

    await replayBtn.click();

    // 8. 確保自動重播執行成功
    const confirmed = await Promise.race([
        consolePromise,
        page.waitForTimeout(10000).then(() => false)
    ]);

    expect(confirmed).toBe(true);

    // 清理臨時檔案
    try {
        fs.unlinkSync(dummyPath);
    } catch (e) {}
});
