/**
 * 診斷測試：第三條物流線接至已有合流拓撲的線段時，為何判定未接通
 */
const { test } = require('@playwright/test');

test('第三條物流線合流接通診斷', async ({ page }) => {
    test.setTimeout(60000);
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { } });
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined' && Array.isArray(window.GAME_STATE.logisticsLines), null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');
        const state = GameEngine.state;
        const TILE = GameEngine.TILE_SIZE || 20;
        state.resources = state.resources || {};
        ['wood', 'stone', 'gold', 'plank', 'iron', 'copper'].forEach(k => { state.resources[k] = 999999; });

        const diag = {};

        // 找一塊空地起始點
        const baseX = 30 * TILE + TILE / 2;
        const baseY = 30 * TILE + TILE / 2;

        // === 線路 1：水平往右走 10 格，然後垂直往下走 8 格（L 型）===
        const line1StartX = baseX;
        const line1StartY = baseY;
        const line1TurnX = baseX + 10 * TILE;  // 水平終點 = 垂直段起點
        const line1EndY = baseY + 8 * TILE;    // 垂直段終點

        conveyorSystem.startDrag(line1StartX, line1StartY);
        conveyorSystem.updateDragNow(line1TurnX, line1StartY);
        conveyorSystem.submitDrag();

        // 線路 1 的垂直段
        conveyorSystem.startDrag(line1TurnX, line1StartY);
        conveyorSystem.updateDragNow(line1TurnX, line1EndY);
        conveyorSystem.submitDrag();
        await new Promise(r => setTimeout(r, 200));

        const lines1 = (state.logisticsLines || []).filter(l => l);
        const groups1 = [...new Set(lines1.map(l => l.groupId || l.id))];
        diag.after_line1 = { groups: groups1.length, segments: lines1.length };

        // === 線路 2：從左邊往右水平走，碰到線路 1 的垂直段中段 ===
        const line2StartX = baseX;
        const line2StartY = baseY + 4 * TILE;  // 垂直段的中間位置
        const line2EndX = line1TurnX;           // 碰到垂直段

        conveyorSystem.startDrag(line2StartX, line2StartY);
        conveyorSystem.updateDragNow(line2EndX, line2StartY);
        conveyorSystem.submitDrag();
        await new Promise(r => setTimeout(r, 200));

        const lines2 = (state.logisticsLines || []).filter(l => l);
        const groups2 = [...new Set(lines2.map(l => l.groupId || l.id))];
        const mergeNodes2 = (state.logisticsMergeNodes || []).filter(n => n);
        diag.after_line2 = {
            groups: groups2.length,
            segments: lines2.length,
            mergeNodes: mergeNodes2.map(n => ({
                cellKey: n.cellKey,
                inputGroupIds: n.inputGroupIds?.map(id => id.slice(-8)),
                outputGroupId: n.outputGroupId?.slice(-8)
            }))
        };

        // === 線路 3：從上方繞路，最終碰到線路 1 垂直段的另一個中段位置 ===
        const line3StartX = baseX;
        const line3StartY = baseY - 3 * TILE;  // 往上偏移
        const line3RightX = line1TurnX + 4 * TILE;  // 往右超過垂直段
        const line3TargetY = baseY + 6 * TILE;  // 垂直段中的另一個位置
        const line3TargetX = line1TurnX;         // 回到垂直段的 X

        // 先往右
        conveyorSystem.startDrag(line3StartX, line3StartY);
        conveyorSystem.updateDragNow(line3RightX, line3StartY);
        conveyorSystem.submitDrag();
        await new Promise(r => setTimeout(r, 100));

        // 再往下
        conveyorSystem.startDrag(line3RightX, line3StartY);
        conveyorSystem.updateDragNow(line3RightX, line3TargetY);
        conveyorSystem.submitDrag();
        await new Promise(r => setTimeout(r, 100));

        // 最後往左，觸碰垂直段
        conveyorSystem.startDrag(line3RightX, line3TargetY);
        conveyorSystem.updateDragNow(line3TargetX, line3TargetY);
        conveyorSystem.submitDrag();
        await new Promise(r => setTimeout(r, 200));

        // === 最終診斷 ===
        const linesAll = (state.logisticsLines || []).filter(l => l);
        const groupsAll = [...new Set(linesAll.map(l => l.groupId || l.id))];
        const mergeNodesAll = (state.logisticsMergeNodes || []).filter(n => n);

        diag.final = {
            groups: groupsAll.length,
            segments: linesAll.length,
            mergeNodes: mergeNodesAll.map(n => ({
                cellKey: n.cellKey,
                inputGroupIds: n.inputGroupIds?.map(id => id.slice(-8)),
                outputGroupId: n.outputGroupId?.slice(-8)
            }))
        };

        // 檢查每個 group 是否「接通」
        const connectedByMerge = new Set();
        mergeNodesAll.forEach(n => {
            if (n.outputGroupId) connectedByMerge.add(n.outputGroupId);
            (n.inputGroupIds || []).forEach(id => connectedByMerge.add(id));
        });

        const connectedByBuilding = new Set();
        linesAll.forEach(l => {
            if (l.sourceId || l.targetId) connectedByBuilding.add(l.groupId || l.id);
        });

        // 合流互連：如果 groupA 是 mergeNode 的 input，而 groupB 是同一 mergeNode 的 output，則 A B 互連
        const mergeComponents = new Map(); // groupId -> componentId
        let componentId = 0;
        mergeNodesAll.forEach(n => {
            const allIds = [...(n.inputGroupIds || []), n.outputGroupId].filter(Boolean);
            const existingComponents = allIds.map(id => mergeComponents.get(id)).filter(c => c !== undefined);
            const targetComponent = existingComponents.length > 0 ? Math.min(...existingComponents) : componentId++;
            allIds.forEach(id => mergeComponents.set(id, targetComponent));
        });

        // 同一個 component 內的都算接通
        const allConnected = new Set([...connectedByMerge, ...connectedByBuilding]);
        mergeComponents.forEach((comp, gid) => {
            mergeComponents.forEach((comp2, gid2) => {
                if (comp === comp2) {
                    allConnected.add(gid);
                    allConnected.add(gid2);
                }
            });
        });

        const disconnectedGroups = groupsAll.filter(g => !allConnected.has(g));
        diag.disconnectedGroups = disconnectedGroups.map(g => g.slice(-8));
        diag.disconnectedGroupsFull = disconnectedGroups;

        // 對每個 disconnected group 診斷為何不接通
        disconnectedGroups.forEach(gid => {
            const segs = linesAll.filter(l => (l.groupId || l.id) === gid);
            const allPts = [];
            segs.forEach(s => (s.routePoints || []).forEach(p => allPts.push(p)));
            
            // 找末端點
            const orderedSegs = conveyorSystem.orderLogisticsSegmentsByDirection(segs);
            const lastSeg = orderedSegs[orderedSegs.length - 1];
            const firstSeg = orderedSegs[0];
            
            const endpoints = [];
            if (firstSeg?.routePoints?.length >= 2) endpoints.push(firstSeg.routePoints[0]);
            if (lastSeg?.routePoints?.length >= 2) endpoints.push(lastSeg.routePoints[lastSeg.routePoints.length - 1]);

            endpoints.forEach((ep, idx) => {
                const key = `disconn_${gid.slice(-8)}_ep${idx}`;
                diag[key] = { point: `(${ep.x},${ep.y})` };

                // 模擬 findTouchedLogisticsLineAt
                const tol = TILE * 0.55;
                let bestLine = null;
                let bestDist = Infinity;
                linesAll.forEach(line => {
                    if ((line.groupId || line.id) === gid) return;
                    const pts = line.routePoints || [];
                    for (let i = 0; i < pts.length - 1; i++) {
                        const isOn = conveyorSystem.isPointOnSegment(ep, pts[i], pts[i + 1], tol);
                        if (isOn) {
                            const dist = Math.min(
                                Math.hypot(ep.x - pts[i].x, ep.y - pts[i].y),
                                Math.hypot(ep.x - pts[i + 1].x, ep.y - pts[i + 1].y)
                            );
                            if (dist < bestDist) {
                                bestDist = dist;
                                bestLine = line;
                            }
                        }
                    }
                });

                if (bestLine) {
                    const touchedGroupId = bestLine.groupId || bestLine.id;
                    diag[key].touchedGroupId = touchedGroupId.slice(-8);
                    diag[key].touchedDist = Math.round(bestDist * 100) / 100;

                    const snapped = conveyorSystem.snapPointToGridCenter(ep);
                    diag[key].snapped = `(${snapped.x},${snapped.y})`;

                    // 檢查 canRegisterMergeDirection
                    const canEnter = conveyorSystem.mergeNodeStore.getCandidateLines(gid)
                        .some(l => conveyorSystem.mergeNodeStore.canLineEnterMergePoint(l, snapped));
                    const canLeave = conveyorSystem.mergeNodeStore.getCandidateLines(touchedGroupId)
                        .some(l => conveyorSystem.mergeNodeStore.canLineLeaveMergePoint(l, snapped));
                    diag[key].canEnter = canEnter;
                    diag[key].canLeave = canLeave;

                    // 詳細 canLineLeaveMergePoint 診斷
                    if (!canLeave) {
                        const candidateLines = conveyorSystem.mergeNodeStore.getCandidateLines(touchedGroupId);
                        const tolerance = conveyorSystem.mergeNodeStore.getMergeDirectionTolerance();
                        diag[key].leaveDetails = candidateLines.map(line => {
                            const pts = line.routePoints || [];
                            const detail = { pts: pts.map(p => `(${p.x},${p.y})`), checks: [] };
                            for (let i = 0; i < pts.length - 1; i++) {
                                const start = pts[i];
                                const end = pts[i + 1];
                                const isOnSeg = conveyorSystem.isPointOnSegment(snapped, start, end, tolerance);
                                if (isOnSeg) {
                                    const nearEnd = Math.hypot(snapped.x - end.x, snapped.y - end.y) <= tolerance;
                                    const isLastSeg = i >= pts.length - 2;
                                    detail.checks.push({
                                        segIdx: i,
                                        isOnSeg: true,
                                        nearEnd,
                                        isLastSeg,
                                        endDist: Math.round(Math.hypot(snapped.x - end.x, snapped.y - end.y) * 100) / 100,
                                        tolerance: tolerance,
                                        verdict: nearEnd ? (isLastSeg ? 'FAIL:last_seg' : 'check_next') : 'PASS:not_near_end'
                                    });
                                }
                            }
                            return detail;
                        });
                    }

                    // 同方向檢查
                    const inputDir = conveyorSystem.getLogisticsLineDirectionAtPoint(lastSeg, ep);
                    const outputDir = conveyorSystem.getLogisticsLineDirectionAtPoint(bestLine, ep);
                    diag[key].inputDir = inputDir;
                    diag[key].outputDir = outputDir;
                    diag[key].isSameDir = inputDir && outputDir && inputDir.x === outputDir.x && inputDir.y === outputDir.y;
                } else {
                    diag[key].touchedLine = 'NOT_FOUND';
                    // 列出最近的線段
                    const nearby = [];
                    linesAll.forEach(line => {
                        if ((line.groupId || line.id) === gid) return;
                        const pts = line.routePoints || [];
                        pts.forEach(p => {
                            const dist = Math.hypot(ep.x - p.x, ep.y - p.y);
                            nearby.push({ gid: (line.groupId || line.id).slice(-8), pt: `(${p.x},${p.y})`, dist: Math.round(dist) });
                        });
                    });
                    nearby.sort((a, b) => a.dist - b.dist);
                    diag[key].nearestPoints = nearby.slice(0, 5);
                }
            });
        });

        return diag;
    });

    console.log('\n=== 第三條線診斷結果 ===');
    console.log(JSON.stringify(result, null, 2));

    if (result.disconnectedGroups?.length > 0) {
        console.log(`\n❌ 失敗：有 ${result.disconnectedGroups.length} 個 group 未接通`);
    } else {
        console.log('\n✅ 全部接通');
    }
});
