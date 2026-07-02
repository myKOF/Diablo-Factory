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
    static selectedLogTypes = new Set();

    static start(logTypes = []) {
        if (this.isRecording) return;
        this.isRecording = true;
        this.actions = [];
        this.startTime = Date.now();
        this.setLogTypes(logTypes);

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

    static setLogTypes(logTypes = []) {
        this.selectedLogTypes = new Set(
            (Array.isArray(logTypes) ? logTypes : [])
                .map(type => String(type || '').toUpperCase())
                .filter(Boolean)
        );
    }

    static shouldRecordLog(type, msg) {
        if (!this.isRecording || !msg || this.selectedLogTypes.size === 0) return false;
        if (String(msg).includes('腳本錄製')) return false;
        const category = String(type || 'COMMON').toUpperCase();
        return this.selectedLogTypes.has(category);
    }

    static _patchEngine() {
        const self = this;

        // 1. 攔截 GameEngine.addLog，依錄製開始前選定的分類寫入匯出腳本。
        this.originalHooks.addLog = GameEngine.addLog;
        GameEngine.addLog = function(msg, type) {
            const category = String(type || 'COMMON').toUpperCase();
            if (self.shouldRecordLog(category, msg)) {
                self.recordAction('', `// [${category}] ${msg}`);
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
                
                let targetIdStr = 'null';
                if (clickedTarget) {
                    if (clickedTarget.gx !== undefined && !clickedTarget.id) {
                        targetIdStr = `'res_${clickedTarget.gx}_${clickedTarget.gy}'`;
                    } else {
                        targetIdStr = `window.GameEngine.resolveDynamicId('${clickedTarget.id}', '${clickedTarget.type1 || clickedTarget.model}', ${clickedTarget.x}, ${clickedTarget.y})`;
                    }
                }
                const unitStr = `window.GameEngine.resolveDynamicId('${unit.id}', '${unit.type1}', ${unit.x}, ${unit.y})`;
                
                self.recordAction(`await executeLogic(page, () => window.GameEngine.issueCommand([${unitStr}], '${command}', ${targetIdStr}, ${pointer.worldX}, ${pointer.worldY}));`, `// 命令單位 ${unit.id} 執行 ${command}`);
            }
            return self.originalHooks.handleRightClickCommand.call(this, unit, pointer, clickedTarget, cmdCenter);
        };

        // 6.5 攔截 handleRallyPoint (建築設定集結點)
        this.originalHooks.handleRallyPoint = InputSystem.prototype.handleRallyPoint;
        InputSystem.prototype.handleRallyPoint = function(pointer, ent, bCfg) {
            if (self.isRecording) {
                const entFallback = `window.GameEngine.resolveDynamicId('${ent.id}', '${ent.type1}', ${ent.x}, ${ent.y})`;
                self.recordAction(`await executeLogic(page, () => {
    const bEnt = window.GameEngine.state.mapEntities.find(e => e.id === ${entFallback});
    if (bEnt && window.PhaserScene && window.PhaserScene.inputSystem) {
        window.PhaserScene.inputSystem.handleRallyPoint({worldX: ${pointer.worldX}, worldY: ${pointer.worldY}}, bEnt, window.GameEngine.state.buildingConfigs[bEnt.type1]);
    }
});`, `// 建築 ${ent.id} 設定集結點至 (${pointer.worldX.toFixed(0)}, ${pointer.worldY.toFixed(0)})`);
            }
            return self.originalHooks.handleRallyPoint.call(this, pointer, ent, bCfg);
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
                    const targetEntId = drag.targetBuilding ? drag.targetBuilding.id : null;
                    
                    self.recordAction(`await executeLogic(page, () => window.conveyorSystem.simulateDragAndSubmit(${startX}, ${startY}, ${endX}, ${endY}, ${entId ? `'${entId}'` : 'null'}, ${pPort}, ${lineId ? `'${lineId}'` : 'null'}, '${finalGroupId || ""}', '${bendMode}', ${ghostsStr}, ${targetEntId ? `'${targetEntId}'` : 'null'}));`, `// 拖曳建造物流線 (GroupId: ${finalGroupId || 'new'})`);
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

        // 9. 攔截 LogisticsUI (物流過濾器)
        if (window.LogisticsUI) {
            this.originalHooks.showLogisticsMenu = window.LogisticsUI.showLogisticsMenu;
            window.LogisticsUI.showLogisticsMenu = function(sourceEnt, targetId, mouseX, mouseY, lineId, connHint) {
                if (self.isRecording && sourceEnt) {
                    const id = sourceEnt.id || `${sourceEnt.type1}_${sourceEnt.x}_${sourceEnt.y}`;
                    self.recordAction(`await executeLogic(page, () => { const e = window.GameEngine.state.mapEntities.find(x => x.id === '${id}') || window.GameEngine.state.mapEntities.find(x => x.x === ${sourceEnt.x} && x.y === ${sourceEnt.y}); if(e && window.LogisticsUI) window.LogisticsUI.showLogisticsMenu(e, '${targetId}', 0, 0, ${lineId ? `'${lineId}'` : 'null'}); });`, `// 開啟物流線介面: ${sourceEnt.type1} -> ${targetId}`);
                }
                return self.originalHooks.showLogisticsMenu.call(window.LogisticsUI, sourceEnt, targetId, mouseX, mouseY, lineId, connHint);
            };

            this.originalHooks.setLogisticsFilter = window.LogisticsUI.setLogisticsFilter;
            window.LogisticsUI.setLogisticsFilter = function(event, filterItem) {
                if (self.isRecording) {
                    const activeConn = window.LogisticsUI.activeLogisticsConnection;
                    if (activeConn && activeConn.source) {
                        const id = activeConn.source.id || `${activeConn.source.type1}_${activeConn.source.x}_${activeConn.source.y}`;
                        const targetId = activeConn.targetId;
                        const lineId = activeConn.lineId;
                        self.recordAction(`await executeLogic(page, () => {
    const src = window.GameEngine.state.mapEntities.find(x => x.id === '${id}') || window.GameEngine.state.mapEntities.find(x => x.x === ${activeConn.source.x} && x.y === ${activeConn.source.y});
    if (src && window.LogisticsUI) {
        window.LogisticsUI.showLogisticsMenu(src, '${targetId}', 0, 0, ${lineId ? `'${lineId}'` : 'null'});
        window.LogisticsUI.setLogisticsFilter(null, '${filterItem}');
        const menu = document.getElementById('logistics_menu');
        if (menu) menu.style.display = 'none'; // 模擬設定後隱藏或維持不干擾
    }
});`, `// 設定物流線過濾器: ${filterItem}`);
                    }
                }
                return self.originalHooks.setLogisticsFilter.call(window.LogisticsUI, event, filterItem);
            };

            this.originalHooks.clearLogisticsFilter = window.LogisticsUI.clearLogisticsFilter;
            window.LogisticsUI.clearLogisticsFilter = function(event) {
                if (self.isRecording) {
                    const activeConn = window.LogisticsUI.activeLogisticsConnection;
                    if (activeConn && activeConn.source) {
                        const id = activeConn.source.id || `${activeConn.source.type1}_${activeConn.source.x}_${activeConn.source.y}`;
                        const targetId = activeConn.targetId;
                        const lineId = activeConn.lineId;
                        self.recordAction(`await executeLogic(page, () => {
    const src = window.GameEngine.state.mapEntities.find(x => x.id === '${id}') || window.GameEngine.state.mapEntities.find(x => x.x === ${activeConn.source.x} && x.y === ${activeConn.source.y});
    if (src && window.LogisticsUI) {
        window.LogisticsUI.showLogisticsMenu(src, '${targetId}', 0, 0, ${lineId ? `'${lineId}'` : 'null'});
        window.LogisticsUI.clearLogisticsFilter(null);
    }
});`, `// 清除物流線過濾器`);
                    }
                }
                return self.originalHooks.clearLogisticsFilter.call(window.LogisticsUI, event);
            };
        }

        // 10. 攔截 UIManager 面板操作
        if (window.UIManager) {
            this.originalHooks.selectRecipe = window.UIManager.selectRecipe;
            window.UIManager.selectRecipe = function(event, uid, type) {
                if (self.isRecording) {
                    self.recordAction(`await executeLogic(page, () => { if (window.UIManager) window.UIManager.selectRecipe(null, '${uid}', '${type}'); });`, `// 選擇生產配方: ${type}`);
                }
                return self.originalHooks.selectRecipe.call(window.UIManager, event, uid, type);
            };

            this.originalHooks.clearFactoryProduct = window.UIManager.clearFactoryProduct;
            window.UIManager.clearFactoryProduct = function(event) {
                if (self.isRecording) {
                    self.recordAction(`await executeLogic(page, () => { if (window.UIManager) window.UIManager.clearFactoryProduct(null); });`, `// 清除生產配方`);
                }
                return self.originalHooks.clearFactoryProduct.call(window.UIManager, event);
            };

            this.originalHooks.adjustWorkers = window.UIManager.adjustWorkers;
            window.UIManager.adjustWorkers = function(event, delta) {
                if (self.isRecording) {
                    self.recordAction(`await executeLogic(page, () => { if (window.UIManager) window.UIManager.adjustWorkers(null, ${delta}); });`, `// 調整工人數量: ${delta > 0 ? '+' : ''}${delta}`);
                }
                return self.originalHooks.adjustWorkers.call(window.UIManager, event, delta);
            };

            this.originalHooks.dismissWorkers = window.UIManager.dismissWorkers;
            window.UIManager.dismissWorkers = function(event) {
                if (self.isRecording) {
                    self.recordAction(`await executeLogic(page, () => { if (window.UIManager) window.UIManager.dismissWorkers(null); });`, `// 解散工人`);
                }
                return self.originalHooks.dismissWorkers.call(window.UIManager, event);
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
        if (this.originalHooks.handleRallyPoint) {
            InputSystem.prototype.handleRallyPoint = this.originalHooks.handleRallyPoint;
        }
        if (this.originalHooks.submitDrag) {
            LogisticsDragSubmission.prototype.submitDrag = this.originalHooks.submitDrag;
        }
        
        if (window.UIManager && this.originalHooks.showEntityHUD) {
            window.UIManager.showEntityHUD = this.originalHooks.showEntityHUD;
        }

        if (window.LogisticsUI && this.originalHooks.setLogisticsFilter) {
            window.LogisticsUI.showLogisticsMenu = this.originalHooks.showLogisticsMenu;
            window.LogisticsUI.setLogisticsFilter = this.originalHooks.setLogisticsFilter;
            window.LogisticsUI.clearLogisticsFilter = this.originalHooks.clearLogisticsFilter;
        }

        if (window.UIManager && this.originalHooks.selectRecipe) {
            window.UIManager.selectRecipe = this.originalHooks.selectRecipe;
            window.UIManager.clearFactoryProduct = this.originalHooks.clearFactoryProduct;
            window.UIManager.adjustWorkers = this.originalHooks.adjustWorkers;
            window.UIManager.dismissWorkers = this.originalHooks.dismissWorkers;
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
