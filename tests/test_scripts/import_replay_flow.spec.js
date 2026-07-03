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

test('Save Script No Reload Test', async ({ page }) => {
    // 1. 開啟遊戲頁面
    await page.goto('/');
    await page.waitForTimeout(1000);

    // 2. 在 window 上設定自訂標記，用以偵測是否刷新
    await page.evaluate(() => {
        window.NO_RELOAD_TEST_FLAG = 'STAY_SAME';
    });

    // 3. 模擬呼叫保存腳本 API 寫入 src/debug/ 目錄
    const saveResponse = await page.evaluate(async () => {
        const response = await fetch('/api/save-script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: 'test_scripts/temp_no_reload_test.spec.js',
                content: '// temporary file for testing'
            })
        });
        return await response.json();
    });

    expect(saveResponse.success).toBe(true);

    // 4. 等待 2 秒，確保 dev-server 檔案監聽反應時間已過
    await page.waitForTimeout(2000);

    // 5. 驗證 window 上的標記依然存在，未被重新整理刷新
    const flag = await page.evaluate(() => window.NO_RELOAD_TEST_FLAG);
    expect(flag).toBe('STAY_SAME');

    // 清理生成的臨時測試檔案
    const tempFile = path.join(__dirname, '../../src/debug/test_scripts/temp_no_reload_test.spec.js');
    try {
        fs.unlinkSync(tempFile);
    } catch (e) {}
});
