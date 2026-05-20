const { execSync } = require("child_process");

try {
  // Windows 通知
  execSync(
    `npx -y node-notifier-cli -t "Antigravity 系統" -m "作業與自測已完成，請回歸！"`,
    { stdio: "ignore" }
  );
} catch (e) {
  // fallback: 使用 PowerShell 腳本實現 Windows 原生橫幅通知與聲音
  try {
    execSync(
      `powershell -ExecutionPolicy Bypass -File scripts/notify.ps1`,
      { stdio: "ignore" }
    );
  } catch {}
}

process.exit(0);