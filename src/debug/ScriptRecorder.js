/**
 * ScriptRecorder - Playwright E2E 腳本錄製工具
 * 
 * 負責攔截使用者行為並產生可用於 Playwright 測試的腳本。
 */

import { GameEngine } from "../systems/game_systems.js";
import { InputSystem } from "../systems/InputSystem.js";
import { LogisticsDragSubmission } from "../systems/logistics/LogisticsDragSubmission.js";

export class ScriptRecorder {
    static isRecording = false;
    static actions = [];
    static startTime = 0;
    static originalHooks = {};

    static start() {
        if (this.isRecording) return;
        this.isRecording = true;
        this.actions = [];
        this.startTime = Date.now();

        this.recordAction('// --- 邏輯錄製開始 ---');
        this._patchEngine();
        GameEngine.addLog("🔴 邏輯腳本錄製已開始", "SYSTEM");
    }

    static stop() {
        if (!this.isRecording) return;
        this.isRecording = false;
        
        this.recordAction('// --- 邏輯錄製結束 ---');
        this._unpatchEngine();

        GameEngine.addLog("⏹ 邏輯腳本錄製已停止，準備儲存檔案...", "SYSTEM");
        this.exportScript();
    }

    static toggle() {
        if (this.isRecording) {
            this.stop();
            return false;
        } else {
            this.start();
            return true;
        }
    }

    static recordAction(codeLine, comment = '') {
        const timeOffset = Date.now() - this.startTime;
        this.actions.push({ time: timeOffset, code: codeLine, comment: comment });
    }

    static _patchEngine() {
        const self = this;

        // 1. 攔截 GameEngine.addLog
        this.originalHooks.addLog = GameEngine.addLog;
        GameEngine.addLog = function(msg, type) {
            if (self.isRecording && msg && !msg.includes('腳本錄製')) {
                self.recordAction('', `// [系統日誌] ${msg}`);
            }
            return self.originalHooks.addLog.call(GameEngine, msg, type);
        };

        // 2. 攔截 placeBuilding
        this.originalHooks.placeBuilding = GameEngine.placeBuilding;
        GameEngine.placeBuilding = function(type1, x, y) {
            if (self.isRecording) {
                self.recordAction(`await executeLogic(page, () => window.GameEngine.placeBuilding('${type1}', ${x}, ${y}));`, `// 在 (${x}, ${y}) 建造了 ${type1}`);
            }
            return self.originalHooks.placeBuilding.call(GameEngine, type1, x, y);
        };

        // 3. 攔截 placeBuildingLine (物流線)
        this.originalHooks.placeBuildingLine = GameEngine.placeBuildingLine;
        GameEngine.placeBuildingLine = function(type1, startX, startY, endX, endY) {
            if (self.isRecording) {
                self.recordAction(`await executeLogic(page, () => window.GameEngine.placeBuildingLine('${type1}', ${startX}, ${startY}, ${endX}, ${endY}));`, `// 從 (${startX}, ${startY}) 到 (${endX}, ${endY}) 建造了 ${type1} 物流線`);
            }
            return self.originalHooks.placeBuildingLine.call(GameEngine, type1, startX, startY, endX, endY);
        };

        // 4. 攔截 destroyBuilding
        this.originalHooks.destroyBuilding = GameEngine.destroyBuilding;
        GameEngine.destroyBuilding = function(ent) {
            if (self.isRecording && ent) {
                const id = ent.id || `${ent.type1}_${ent.x}_${ent.y}`;
                self.recordAction(`await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === '${id}') || window.GameEngine.state.mapEntities.find(x => x.x === ${ent.x} && x.y === ${ent.y}); if(e) window.GameEngine.destroyBuilding(e); });`, `// 拆除了 ${ent.type1} (${id})`);
            }
            return self.originalHooks.destroyBuilding.call(GameEngine, ent);
        };

        // 5. 攔截 addToProductionQueue
        this.originalHooks.addToProductionQueue = GameEngine.addToProductionQueue;
        GameEngine.addToProductionQueue = function(event, configName, sourceBuilding) {
            if (self.isRecording) {
                if (sourceBuilding) {
                    const id = sourceBuilding.id || `${sourceBuilding.type1}_${sourceBuilding.x}_${sourceBuilding.y}`;
                    self.recordAction(`await executeLogic(page, () => { const b = window.GameEngine.state.mapEntities.find(x => x.id === '${id}') || window.GameEngine.state.mapEntities.find(x => x.x === ${sourceBuilding.x} && x.y === ${sourceBuilding.y}); if (b) window.GameEngine.addToProductionQueue(null, '${configName}', b); });`, `// 在 ${sourceBuilding.type1} (${id}) 生產 ${configName}`);
                } else {
                    self.recordAction(`await executeLogic(page, () => window.GameEngine.addToProductionQueue(null, '${configName}'));`, `// 全局生產 ${configName}`);
                }
            }
            return self.originalHooks.addToProductionQueue.call(GameEngine, event, configName, sourceBuilding);
        };

        // 6. 攔截 handleRightClickCommand (工人指令錄製)
        this.originalHooks.handleRightClickCommand = InputSystem.prototype.handleRightClickCommand;
        InputSystem.prototype.handleRightClickCommand = function(unit, pointer, clickedTarget, cmdCenter) {
            if (self.isRecording) {
                const isResource = !!(clickedTarget && (clickedTarget.gx !== undefined || clickedTarget.resourceType || clickedTarget.type1 === 'farmland' || clickedTarget.type1 === 'tree_plantation'));
                const isEnemy = clickedTarget && (clickedTarget.camp === 'enemy' || clickedTarget.camp === 'neutral' || clickedTarget.isEnemy);
                const command = isResource ? 'GATHER' : (isEnemy ? 'ATTACK' : 'MOVE');
                let targetId = clickedTarget ? (clickedTarget.id || `${clickedTarget.gx}_${clickedTarget.gy}`) : null;
                // 防止 null 字串化問題
                targetId = targetId ? `'${targetId}'` : 'null';
                self.recordAction(`await executeLogic(page, () => window.GameEngine.issueCommand(['${unit.id}'], '${command}', ${targetId}, ${pointer.worldX}, ${pointer.worldY}));`, `// 命令單位 ${unit.id} 執行 ${command}`);
            }
            return self.originalHooks.handleRightClickCommand.call(this, unit, pointer, clickedTarget, cmdCenter);
        };

        // 7. 攔截 LogisticsDragSubmission.submitDrag (物流線錄製)
        this.originalHooks.submitDrag = LogisticsDragSubmission.prototype.submitDrag;
        LogisticsDragSubmission.prototype.submitDrag = function(routeContext, finalGroupId, points) {
            if (self.isRecording) {
                const drag = this.system.activeDrag;
                if (drag) {
                    const startX = drag.startX;
                    const startY = drag.startY;
                    const endX = drag.lastWorldPoint ? drag.lastWorldPoint.x : startX;
                    const endY = drag.lastWorldPoint ? drag.lastWorldPoint.y : startY;
                    const entId = drag.sourceEntity ? drag.sourceEntity.id : null;
                    const pPort = JSON.stringify(drag.sourcePort || null);
                    const lineId = drag.sourceLine ? (drag.sourceLine.id || drag.sourceLine.groupId) : null;
                    const bendMode = drag.bendMode || 'x-first';
                    const ghostsStr = JSON.stringify(this.system.ghosts || []);
                    
                    self.recordAction(`await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(${startX}, ${startY}, ${endX}, ${endY}, ${entId ? `'${entId}'` : 'null'}, ${pPort}, ${lineId ? `'${lineId}'` : 'null'}, '${finalGroupId || ""}', '${bendMode}', ${ghostsStr}));`, `// 拖曳建造物流線 (GroupId: ${finalGroupId || 'new'})`);
                }
            }
            return self.originalHooks.submitDrag.call(this, routeContext, finalGroupId, points);
        };

        // 8. 攔截 UIManager.showEntityHUD
        if (window.UIManager) {
            this.originalHooks.showEntityHUD = window.UIManager.showEntityHUD;
            window.UIManager.showEntityHUD = function(entity) {
                if (self.isRecording && entity) {
                    const id = entity.id || `${entity.type1}_${entity.x}_${entity.y}`;
                    self.recordAction(`await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === '${id}') || window.GameEngine.state.mapEntities.find(x => x.x === ${entity.x} && x.y === ${entity.y}); if(e) window.UIManager.showEntityHUD(e); });`, `// 開啟介面: ${entity.type1} (${id})`);
                }
                return self.originalHooks.showEntityHUD.call(window.UIManager, entity);
            };
        }
    }

    static _unpatchEngine() {
        if (this.originalHooks.addLog) GameEngine.addLog = this.originalHooks.addLog;
        if (this.originalHooks.placeBuilding) GameEngine.placeBuilding = this.originalHooks.placeBuilding;
        if (this.originalHooks.placeBuildingLine) GameEngine.placeBuildingLine = this.originalHooks.placeBuildingLine;
        if (this.originalHooks.destroyBuilding) GameEngine.destroyBuilding = this.originalHooks.destroyBuilding;
        if (this.originalHooks.addToProductionQueue) GameEngine.addToProductionQueue = this.originalHooks.addToProductionQueue;
        
        if (this.originalHooks.handleRightClickCommand) {
            InputSystem.prototype.handleRightClickCommand = this.originalHooks.handleRightClickCommand;
        }
        if (this.originalHooks.submitDrag) {
            LogisticsDragSubmission.prototype.submitDrag = this.originalHooks.submitDrag;
        }
        
        if (window.UIManager && this.originalHooks.showEntityHUD) {
            window.UIManager.showEntityHUD = this.originalHooks.showEntityHUD;
        }
        
        this.originalHooks = {};
    }

    static async exportScript() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        let scriptContent = `// 自動生成的 Playwright 邏輯化 E2E 測試腳本\n`;
        scriptContent += `const { test, expect } = require('@playwright/test');\n\n`;
        
        // 加入 executeLogic 輔助函式
        scriptContent += `const executeLogic = async (page, fn, ...args) => {\n`;
        scriptContent += `    await page.evaluate(({fnStr, args}) => {\n`;
        scriptContent += `        try {\n`;
        scriptContent += `            const func = new Function('return ' + fnStr)();\n`;
        scriptContent += `            func(...args);\n`;
        scriptContent += `        } catch (e) {\n`;
        scriptContent += `            console.warn('指令忽略:', e);\n`;
        scriptContent += `        }\n`;
        scriptContent += `    }, { fnStr: fn.toString(), args });\n`;
        scriptContent += `    await page.waitForTimeout(200);\n`;
        scriptContent += `};\n\n`;

        scriptContent += `test('Recorded Logical E2E Test', async ({ page }) => {\n`;
        scriptContent += `    await page.setViewportSize({ width: ${width}, height: ${height} });\n\n`;
        scriptContent += `    // 帶上原本的隨機種子，確保地圖生成與錄製時一模一樣\n`;
        scriptContent += `    await page.goto('/?seed=${window.GAME_SEED}');\n`;
        scriptContent += `    await page.waitForTimeout(1000);\n\n`;

        // 依照時間戳記計算每個動作之間的等待時間，精確重現操作時序
        let lastActionTime = 0;
        for (const action of this.actions) {
            if (action.comment) {
                scriptContent += `    ${action.comment}\n`;
            }
            if (action.code) {
                // 計算與上一個「有效動作」之間的時間差，並插入等待
                const delta = action.time - lastActionTime;
                if (delta > 300) {
                    // 超過 300ms 才插入 wait，避免短暫系統日誌造成大量冗餘 wait
                    scriptContent += `    await page.waitForTimeout(${delta});\n`;
                }
                scriptContent += `    ${action.code}\n`;
                lastActionTime = action.time;
            }
        }

        // 錄製結束後再觀察 5 秒以確認最終狀態
        scriptContent += `\n    await page.waitForTimeout(5000);\n`;
        scriptContent += `    await page.screenshot({ path: 'tmp/screenshot_' + Date.now() + '.png' });\n`;
        scriptContent += `});\n`;

        this.triggerDownload(scriptContent, 'test_scripts/logical_test.spec.js');
    }

    static async triggerDownload(content, defaultFilename) {
        const filename = prompt("請輸入腳本檔名 (將自動存入專案目錄下的 src/debug/test_scripts/)：", defaultFilename);
        if (!filename) {
            GameEngine.addLog("已取消儲存錄製腳本。", "SYSTEM");
            return;
        }

        try {
            const response = await fetch('/api/save-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, content })
            });
            const result = await response.json();
            
            if (result.success) {
                GameEngine.addLog(`✅ 腳本已成功存入 src/debug/test_scripts/${filename}`, "SYSTEM");
            } else {
                throw new Error(result.error || "伺服器錯誤");
            }
        } catch (err) {
            console.error('儲存腳本失敗:', err);
            GameEngine.addLog(`❌ 腳本儲存失敗，請確認 dev-server.js 是否已重啟。改用下載模式...`, "SYSTEM");
            this.fallbackDownload(content, filename);
        }
    }

    static fallbackDownload(content, filename) {
        const blob = new Blob([content], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
