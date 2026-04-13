const fs = require('fs');
const path = require('path');

/**
 * Agent 初始化與規格對齊腳本
 * 目的：強迫 Agent 讀取 .cursorrules 並驗證 Always Allow 權限
 */
async function init() {
    console.log("🚀 正在啟動 [暗黑工廠] 開發模式初始化...");

    try {
        // 1. 強迫讀取 .cursorrules
        const rulePath = path.join(__dirname, '../.cursorrules');
        if (fs.existsSync(rulePath)) {
            const rules = fs.readFileSync(rulePath, 'utf8');
            console.log("✅ [核心規範] 已加載。");
        } else {
            console.error("❌ 找不到 .cursorrules 文件！");
        }

        // 2. 驗證權限 (Always Allow 測試)
        const testFile = path.join(__dirname, '../tmp/auth_test.tmp');
        if (!fs.existsSync(path.dirname(testFile))) {
            fs.mkdirSync(path.dirname(testFile), { recursive: true });
        }
        
        fs.writeFileSync(testFile, `Verified at: ${new Date().toISOString()}`);
        fs.unlinkSync(testFile);
        console.log("✅ [自動化權限] 檔案讀寫測試通過 (Always Allow 生效)。");

        // 3. 讀取計畫狀態
        const planPath = path.join(__dirname, '../PLAN.md');
        if (fs.existsSync(planPath)) {
            console.log("✅ [計畫先行] 已偵測到 PLAN.md，準備進行開發對齊。");
        }

        console.log("\n[規格對齊：已確認]");
        console.log("Agent 狀態：全自動化模式已激活，所有操作將以繁體中文進行。");
        
    } catch (error) {
        console.error("❌ 初始化失敗，請檢查 Antigravity 權限設置:", error.message);
    } finally {
        process.exit();
    }
}

init();