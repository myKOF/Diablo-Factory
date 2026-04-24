const { execSync } = require("child_process");

try {
  // Windows 通知
  execSync(
    `npx -y node-notifier-cli -t "Antigravity 系統" -m "作業與自測已完成，請回歸！"`,
    { stdio: "ignore" }
  );
} catch (e) {
  // fallback 聲音
  try {
    execSync(
      `powershell -c (New-Object Media.SoundPlayer 'C:\\Windows\\Media\\notify.wav').PlaySync()`
    );
  } catch {}
}

process.exit(0);