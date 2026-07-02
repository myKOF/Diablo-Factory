import { GameEngine } from "../systems/game_systems.js";

/**
 * ScriptRunner - 負責在遊戲內直接讀取並執行 Playwright 錄製的 E2E 腳本
 */
export class ScriptRunner {
    static selectedScriptContent = null;
    static selectedScriptName = null;

    static importAndRun() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.js';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (evt) => {
                const content = evt.target.result;
                document.body.removeChild(input);
                
                ScriptRunner.selectedScriptContent = content;
                ScriptRunner.selectedScriptName = file.name;
                
                if (window.UIManager && typeof window.UIManager.showSelectedScriptUI === 'function') {
                    window.UIManager.showSelectedScriptUI(file.name);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    static async runScript(scriptContent, filename = "script") {
        GameEngine.addLog(`開始執行導入的腳本: ${filename}`, "SYSTEM");

        const testPromises = [];

        const mockTest = async (name, testFn) => {
            GameEngine.addLog(`執行測試段落: ${name}`, "SYSTEM");
            
            const pageMock = {
                setViewportSize: async () => {},
                goto: async (url) => {
                    GameEngine.addLog(`[模擬] 跳過頁面跳轉: ${url}`, "SYSTEM");
                },
                waitForTimeout: async (ms) => {
                    return new Promise(resolve => setTimeout(resolve, ms));
                },
                evaluate: async (fn, arg) => {
                    try {
                        if (typeof fn === 'function') {
                            return await fn(arg);
                        } else {
                            const func = new Function('return ' + fn)();
                            return await func(arg);
                        }
                    } catch (e) {
                        console.warn("腳本 evaluate 發生錯誤:", e);
                    }
                }
            };
            
            const page = new Proxy(pageMock, {
                get: function(target, prop) {
                    if (prop in target) {
                        return target[prop];
                    }
                    return async () => {
                        return new Proxy({}, {
                            get: () => async () => {}
                        });
                    };
                }
            });

            const testPromise = testFn({ page }).catch(err => {
                GameEngine.addLog(`測試段落 [${name}] 發生錯誤: ${err.message}`, "ERROR");
                console.error(err);
            });
            testPromises.push(testPromise);
        };

        mockTest.setTimeout = () => {};
        mockTest.describe = (name, fn) => { fn(); };

        const mockExpect = () => {
            return new Proxy({}, {
                get: () => () => {}
            });
        };

        const dummyRequire = (moduleName) => {
            if (moduleName === '@playwright/test') {
                return { test: mockTest, expect: mockExpect };
            }
            return {};
        };

        try {
            const runner = new Function('require', `return (async () => {
                try {
                    ${scriptContent}
                } catch(e) {
                    throw e;
                }
            })();`);

            await runner(dummyRequire);
            
            if (testPromises.length > 0) {
                GameEngine.addLog(`等待腳本內的動作執行完畢...`, "SYSTEM");
                await Promise.all(testPromises);
            }
            
            GameEngine.addLog(`腳本 [${filename}] 執行完成！`, "SYSTEM");
        } catch (err) {
            console.error("腳本執行失敗:", err);
            GameEngine.addLog(`腳本執行失敗: ${err.message}`, "ERROR");
        }
    }
}
