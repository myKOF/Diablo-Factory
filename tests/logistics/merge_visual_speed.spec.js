const { test, expect } = require('@playwright/test');

test('側向合流轉彎後的視覺位移保持等速', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined', null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { LogisticsRenderer } = await import('/src/renderers/logistics_renderer.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');
        GameEngine.TILE_SIZE = 20;

        const nodePoint = { x: 20, y: 20 };
        const inDir = { x: 1, y: 0 };
        const outDir = { x: 0, y: 1 };
        const inputPoints = [{ x: 0, y: 20 }, { x: 20, y: 20 }];
        const outputPoints = [{ x: 20, y: 20 }, { x: 20, y: 120 }];
        const transfer = {
            id: 'side_turn_item',
            lineId: 'output_line',
            _mergeVisualTurn: {
                x: nodePoint.x,
                y: nodePoint.y,
                outputGroupId: 'output_line',
                inDir,
                outDir
            }
        };

        const inputTotal = 20;
        const outputTotal = 100;
        const samples = [
            LogisticsRenderer.getMergeInputTerminalArcPoint(inputPoints, transfer, nodePoint, inDir, outDir, inputTotal - 5, inputTotal),
            LogisticsRenderer.getMergeInputTerminalArcPoint(inputPoints, transfer, nodePoint, inDir, outDir, inputTotal, inputTotal),
            LogisticsRenderer.getMergeOutputVisualHandoffPoint(outputPoints, 5 / outputTotal, 5, outputTotal, transfer),
            LogisticsRenderer.getMergeOutputVisualHandoffPoint(outputPoints, 10 / outputTotal, 10, outputTotal, transfer),
            LogisticsRenderer.getMergeOutputVisualHandoffPoint(outputPoints, 15 / outputTotal, 15, outputTotal, transfer),
            LogisticsRenderer.getMergeOutputVisualHandoffPoint(outputPoints, 20 / outputTotal, 20, outputTotal, transfer)
        ];

        const stepDistances = [];
        for (let i = 1; i < samples.length; i++) {
            const a = samples[i - 1];
            const b = samples[i];
            stepDistances.push(Math.hypot(b.x - a.x, b.y - a.y));
        }

        const min = Math.min(...stepDistances);
        const max = Math.max(...stepDistances);
        return {
            stepDistances,
            ratio: min / max
        };
    });

    expect(result.ratio, JSON.stringify(result.stepDistances)).toBeGreaterThan(0.82);
});
