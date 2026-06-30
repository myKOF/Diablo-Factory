const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 300 * 1000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // 物流與遊戲狀態具有全域單例與時序依賴，用單線程執行以保證穩定性
  reporter: 'list',
  outputDir: 'tmp/test-results/', // 嚴格遵守領地限制協議，產出物放入 tmp/
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node dev-server.js 8081',
    url: 'http://localhost:8081',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 60 * 1000,
  },
});
