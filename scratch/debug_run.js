const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// 啟動開發伺服器
const serverProcess = exec('node dev-server.js', (err) => {
  if (err && !err.killed) {
    console.error("開發伺服器啟動失敗:", err);
  }
});

setTimeout(async () => {
  let browser;
  try {
    console.log("啟動瀏覽器進行真實網頁環境物流合流碰撞自測...");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // 導航到遊戲網頁
    await page.goto('http://localhost:8080');
    
    // 等待遊戲加載完成
    await page.waitForSelector('canvas', { timeout: 10000 });
    console.log("Phaser 遊戲 Canvas 已加載，注入測試合流數據與物品...");

    page.on('console', msg => {
      console.log('PAGE LOG:', msg.text());
    });

    // 在網頁端環境手動建置一組 T 字合流點與物品
    await page.evaluate(() => {
      const state = window.GAME_STATE;
      const TS = 20;

      // 清空原有在途物品
      state.activeTransfers = [];
      state.logisticsLines = [];
      state.logisticsMergeNodes = [];

      // 1. 建立兩條物流段落 (Segments)
      const inputSeg = {
        id: 'seg_input_1',
        groupId: 'input_line',
        lineType: 'transport_line',
        efficiency: 4,
        routePoints: [{ x: 0, y: 100 }, { x: 100, y: 100 }]
      };
      const outputSeg = {
        id: 'seg_output_1',
        groupId: 'output_line',
        lineType: 'transport_line',
        efficiency: 0, // 設為 0，速度最小
        routePoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }]
      };
      state.logisticsLines.push(inputSeg, outputSeg);

      // 2. 建立 Merge Node 在 100, 100
      const mergeNode = {
        id: 'merge_100,100_output_line',
        nodeId: 'merge_100,100_output_line',
        cellKey: '100,100',
        x: 100,
        y: 100,
        point: { x: 100, y: 100 },
        inputGroupIds: ['input_line'],
        outputGroupId: 'output_line',
        roundRobinIndex: 0
      };
      state.logisticsMergeNodes.push(mergeNode);

      // 3. 塞入兩個物品：
      // t1: 輸出線起點 (progress = 0)
      // t2: 輸入線前進中 (progress = 0.5)
      const t1 = {
        id: 'transfer_output',
        lineId: 'output_line',
        routePoints: [{ x: 100, y: 100 }, { x: 200, y: 100 }],
        progress: 0.0,
        itemType: 'WOOD',
        efficiency: 0,
        targetId: 'dummy_target'
      };
      const t2 = {
        id: 'transfer_input',
        lineId: 'input_line',
        routePoints: [{ x: 0, y: 100 }, { x: 100, y: 100 }],
        progress: 0.5,
        itemType: 'WOOD',
        efficiency: 4,
        targetId: null
      };
      state.activeTransfers.push(t1, t2);

      // 模擬一個虛設的目標建築
      state.mapEntities.push({
        id: 'dummy_target',
        type1: 'warehouse',
        x: 200,
        y: 100
      });

      console.log("[網頁端] 測試資料與物品注入完成，開始啟動間隔追蹤監控...");
      window._debugLogs = [];
      window._debugInterval = setInterval(() => {
        const current = state.activeTransfers.map(t => ({
          id: t.id,
          lineId: t.lineId,
          progress: t.progress
        }));
        window._debugLogs.push(current);
      }, 200);
    });

    // 等待 3 秒讓 Phaser 運行
    await page.waitForTimeout(3000);

    // 取得追蹤歷史與最終結果
    const result = await page.evaluate(() => {
      clearInterval(window._debugInterval);
      return {
        logs: window._debugLogs,
        finalTransfers: window.GAME_STATE.activeTransfers
      };
    });

    console.log("=== 物流追蹤歷史 (每 200ms) ===");
    result.logs.forEach((log, index) => {
      console.log(`Step ${index}:`, log);
    });

    console.log("=== 最終在途物品 ===");
    console.log(result.finalTransfers);

  } catch (err) {
    console.error("❌ 測試出錯:", err.message || err);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
    serverProcess.kill();
    process.exit(process.exitCode || 0);
  }
}, 3000);
