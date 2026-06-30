// 自動生成的 Playwright E2E 測試腳本
const { test, expect } = require('@playwright/test');

test('Recorded E2E Test', async ({ page }) => {
    // 確保重播時的視窗大小與錄製時完全一致，以免座標偏移
    await page.setViewportSize({ width: 1920, height: 911 });

    // 前往本地測試伺服器 (將依據 playwright.config.js 的 baseURL 自動解析)
    page.on('console', msg => console.log('BROWSER: ' + msg.text()));
    await page.goto('/');
    await page.waitForTimeout(1000);

    // --- 錄製開始 ---
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(795, 335);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (795, 335)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(795, 335);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [選取] 建築：倉庫
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(795, 335);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (795, 335)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(1066, 790);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] 傳送帶建造完成，共 33 節。
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(773, 619);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (773, 619)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(773, 619);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] 傳送帶建造完成，共 21 節。
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(739, 706);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵按下 (739, 706)
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(100);
    await page.mouse.move(739, 706);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵放開
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(100);
    // [遊戲系統] [Input-55vl0] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:121ms, CD:5713ms)
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] 已取消物流線建造。
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(622, 588);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (622, 588)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(914, 725);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [選取] 框選操作選中了 3 個我方單位。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [狀態轉進] villagers: IDLE -> IDLE (930, 680)
    
    await page.waitForTimeout(100);
    // [遊戲系統] [狀態轉進] female villagers: IDLE -> IDLE (970, 680)
    
    await page.waitForTimeout(100);
    // [遊戲系統] [狀態轉進] villagers: IDLE -> IDLE (1010, 680)
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(744, 340);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵按下 (744, 340)
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(100);
    await page.mouse.move(744, 340);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵放開
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(100);
    // [遊戲系統] [Input-55vl0] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:88ms, CD:7240ms)
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] villagers 正在前往 倉庫 報到。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] female villagers 正在前往 倉庫 報到。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] villagers 正在前往 倉庫 報到。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [狀態轉進] villagers: IDLE -> MOVING_TO_FACTORY (930, 680)
    
    await page.waitForTimeout(100);
    // [遊戲系統] [重新尋路] 距離目標: 999
    
    await page.waitForTimeout(100);
    // [遊戲系統] [狀態轉進] female villagers: IDLE -> MOVING_TO_FACTORY (970, 680)
    
    await page.waitForTimeout(100);
    // [遊戲系統] [重新尋路] 距離目標: 999
    
    await page.waitForTimeout(100);
    // [遊戲系統] [狀態轉進] villagers: IDLE -> MOVING_TO_FACTORY (1010, 680)
    
    await page.waitForTimeout(100);
    // [遊戲系統] [重新尋路] 距離目標: 999
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(778, 527);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (778, 527)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(778, 527);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [選取] 建築：城鎮中心
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(744, 341);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵按下 (744, 341)
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(100);
    await page.mouse.move(744, 341);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵放開
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(100);
    // [遊戲系統] [Input-55vl0] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:104ms, CD:8104ms)
    
    await page.waitForTimeout(100);
    // [遊戲系統] 城鎮中心 集結點已鎖定至：倉庫
    
    await page.waitForTimeout(100);
    // 👆 點擊了 UI 元素: [❓ 隨機招募]
    
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (895, 704)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] 城鎮中心 加入生產隊列：RANDOM (1/10)
    
    await page.waitForTimeout(100);
    // 👆 點擊了 UI 元素: [❓ 隨機招募 1]
    
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (895, 704)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] 城鎮中心 加入生產隊列：RANDOM (2/10)
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] villagers 已進入 倉庫 派駐。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] villagers 已進入 倉庫 派駐。
    
    await page.waitForTimeout(100);
    // 👆 點擊了 UI 元素: [❓ 隨機招募 2]
    
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (895, 704)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] 城鎮中心 加入生產隊列：RANDOM (3/10)
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] female villagers 已進入 倉庫 派駐。
    
    await page.waitForTimeout(100);
    // 👆 點擊了 UI 元素: [❓ 隨機招募 3]
    
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (895, 704)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] 城鎮中心 加入生產隊列：RANDOM (4/10)
    
    await page.waitForTimeout(100);
    // 👆 點擊了 UI 元素: [❓ 隨機招募 4]
    
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (895, 704)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] 城鎮中心 加入生產隊列：RANDOM (5/10)
    
    await page.waitForTimeout(100);
    // 👆 點擊了 UI 元素: [❓ 隨機招募 5]
    
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (895, 704)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] 城鎮中心 加入生產隊列：RANDOM (6/10)
    
    await page.waitForTimeout(100);
    // 👆 點擊了 UI 元素: [❓ 隨機招募 6]
    
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (895, 704)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] 城鎮中心 加入生產隊列：RANDOM (7/10)
    
    await page.waitForTimeout(100);
    // 👆 點擊了 UI 元素: [❓ 隨機招募 7]
    
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (895, 704)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(895, 704);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] 城鎮中心 加入生產隊列：RANDOM (8/10)
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(952, 487);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (952, 487)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(952, 487);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(753, 357);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (753, 357)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(753, 357);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [選取] 建築：倉庫
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(745, 390);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (745, 390)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] villagers 正在前往 倉庫 報到。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [集結] 已自動派駐至 倉庫。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] villagers 已進入 倉庫 派駐。
    
    await page.waitForTimeout(100);
    await page.mouse.move(1073, 427);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] 傳送帶建造完成，共 16 節。
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(863, 348);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵按下 (863, 348)
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(100);
    await page.mouse.move(863, 348);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵放開
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(100);
    // [遊戲系統] [Input-55vl0] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:115ms, CD:14947ms)
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] 已取消物流線建造。
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(750, 285);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (750, 285)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(1172, 209);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] 傳送帶建造完成，共 23 節。
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(1076, 424);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (1076, 424)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(1076, 424);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] 傳送帶建造完成，共 15 節。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] villagers 正在前往 倉庫 報到。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [集結] 已自動派駐至 倉庫。
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(1182, 617);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵按下 (1182, 617)
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] villagers 已進入 倉庫 派駐。
    
    await page.waitForTimeout(100);
    await page.mouse.move(1182, 617);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵放開
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(100);
    // [遊戲系統] [Input-55vl0] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:114ms, CD:19114ms)
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] 已取消物流線建造。
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(1171, 697);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵按下 (1171, 697)
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(100);
    await page.mouse.move(1173, 444);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵放開
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(100);
    // [遊戲系統] [Input-55vl0] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:299.9, Time:344ms, CD:0ms)
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(786, 121);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵按下 (786, 121)
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(100);
    await page.mouse.move(781, 304);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵放開
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(100);
    // [遊戲系統] [Input-55vl0] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:217.0, Time:272ms, CD:0ms)
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(790, 277);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (790, 277)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(790, 277);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [選取] 建築：倉庫
    
    await page.waitForTimeout(100);
    // 👆 點擊了 UI 元素: [木頭]
    
    await page.waitForTimeout(100);
    await page.mouse.move(1471, 436);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (1471, 436)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(1471, 436);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] 路線搬運品項已更新：木頭。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [DEBUG] Warehouse checking: wood, value: 2500
    
    await page.waitForTimeout(100);
    // [遊戲系統] [追蹤] 開始追蹤物品 wood
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(739, 333);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (739, 333)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(739, 333);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] villagers 正在前往 倉庫 報到。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [集結] 已自動派駐至 倉庫。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] villagers 已進入 倉庫 派駐。
    
    await page.waitForTimeout(100);
    // 👆 點擊了 UI 元素: [石頭]
    
    await page.waitForTimeout(100);
    await page.mouse.move(1526, 442);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (1526, 442)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(1526, 442);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] 路線搬運品項已更新：石頭。
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(746, 214);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (746, 214)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(746, 214);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // 👆 點擊了 UI 元素: [🟡 金礦石]
    
    await page.waitForTimeout(100);
    await page.mouse.move(1596, 427);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (1596, 427)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(1596, 427);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] 路線搬運品項已更新：金礦石。
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(1161, 618);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵按下 (1161, 618)
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(100);
    await page.mouse.move(1144, 576);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵放開
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(100);
    // [遊戲系統] [Input-55vl0] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:53.7, Time:655ms, CD:0ms)
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] female villagers 正在前往 倉庫 報到。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [集結] 已自動派駐至 倉庫。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] female villagers 已進入 倉庫 派駐。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] villagers 正在前往 倉庫 報到。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [集結] 已自動派駐至 倉庫。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] villagers 已進入 倉庫 派駐。
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(1125, 643);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵按下 (1125, 643)
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(100);
    await page.mouse.move(1120, 569);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵放開
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(100);
    // [遊戲系統] [Input-55vl0] 右鍵放開: 畫面有動 | 判定為拖動 | 不可移動 (Dist:87.9, Time:351ms, CD:0ms)
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(1120, 569);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵按下 (1120, 569)
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(100);
    await page.mouse.move(1120, 569);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵放開
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(100);
    // [遊戲系統] [追蹤] 物品 wood 已送達目的地。
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(1052, 625);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (1052, 625)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    await page.mouse.move(1052, 625);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [追蹤] 開始追蹤物品 gold_ore
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(1049, 625);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵按下 (1049, 625)
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] female villagers 正在前往 倉庫 報到。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [集結] 已自動派駐至 倉庫。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] female villagers 已進入 倉庫 派駐。
    
    await page.waitForTimeout(100);
    await page.mouse.move(703, 697);
    await page.waitForTimeout(100);
    // 滑鼠 left 鍵放開
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] 傳送帶建造完成，共 19 節。
    
    await page.waitForTimeout(100);
    // 👉 在遊戲世界中點擊
    
    await page.waitForTimeout(100);
    await page.mouse.move(706, 603);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵按下 (706, 603)
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(100);
    await page.mouse.move(706, 603);
    await page.waitForTimeout(100);
    // 滑鼠 right 鍵放開
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(100);
    // [遊戲系統] [Input-55vl0] 右鍵放開: 畫面沒動 | 判定為點擊 | 可移動 (Dist:0.0, Time:97ms, CD:5513ms)
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] 已取消物流線建造。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] female villagers 正在前往 倉庫 報到。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [集結] 已自動派駐至 倉庫。
    
    await page.waitForTimeout(100);
    // [遊戲系統] [物流] female villagers 已進入 倉庫 派駐。
    
    await page.waitForTimeout(100);
    // 按下鍵盤 Alt
    await page.keyboard.press('Alt');
    await page.waitForTimeout(100);
    // 按下鍵盤 r
    await page.keyboard.press('r');
    await page.waitForTimeout(100);
    // --- 錄製結束 ---
    // 自動截圖並儲存至指定路徑
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'src/debug/TestScreenshots/screenshot_' + Date.now() + '.png' });
});
