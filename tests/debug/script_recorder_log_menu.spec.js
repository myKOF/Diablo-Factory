const { test, expect } = require('@playwright/test');

test('錄製按鈕需先開啟日誌選單，確認後才錄製勾選分類', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.UIManager && window.ScriptRecorder && document.getElementById('record_script_btn'));

    await page.evaluate(() => {
        window.ScriptRecorder.stop();
        window.ScriptRecorder.exportScript = async () => {};
        window.ScriptRecorder.actions = [];
    });

    await page.click('#record_script_btn');

    await expect(page.locator('#script_record_log_menu')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.ScriptRecorder.isRecording)).toBe(false);

    await page.evaluate(() => {
        document.querySelectorAll('#script_record_log_menu input[data-log-category]').forEach((input) => {
            input.checked = input.dataset.logCategory === 'LOGISTICS';
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
    });
    await page.click('#script_record_log_confirm');

    await expect.poll(() => page.evaluate(() => window.ScriptRecorder.isRecording)).toBe(true);
    await expect(page.locator('#script_record_log_menu')).toBeHidden();

    const result = await page.evaluate(() => {
        window.GameEngine.addLog('只應錄下物流訊息', 'LOGISTICS');
        window.GameEngine.addLog('不應錄下一般訊息', 'COMMON');
        return {
            selected: Array.from(window.ScriptRecorder.selectedLogTypes),
            comments: window.ScriptRecorder.actions.map(action => action.comment).filter(Boolean)
        };
    });

    expect(result.selected).toEqual(['LOGISTICS']);
    expect(result.comments.some(comment => comment.includes('[LOGISTICS] 只應錄下物流訊息'))).toBe(true);
    expect(result.comments.some(comment => comment.includes('不應錄下一般訊息'))).toBe(false);

    await page.evaluate(() => {
        window.ScriptRecorder.stop();
        window.UIManager.updateScriptRecorderBtnState(false);
    });
});
