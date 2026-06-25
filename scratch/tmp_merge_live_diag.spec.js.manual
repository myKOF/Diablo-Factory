// 真實遊戲內合流診斷：用遊戲拖曳 API 畫主線+三支線，注入物品流量測主線間隙
const { test } = require('@playwright/test');

test('合流主線間隙即時診斷', async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { } });
    await page.goto('/');
    await page.waitForFunction(() => typeof window.GAME_STATE !== 'undefined' && Array.isArray(window.GAME_STATE.logisticsLines), null, { timeout: 15000 });

    const result = await page.evaluate(async () => {
        const { conveyorSystem } = await import('/src/systems/ConveyorSystem.js');
        const { GameEngine } = await import('/src/systems/game_systems.js');
        const state = GameEngine.state;
        const TILE = GameEngine.TILE_SIZE || 20;
        state.resources = state.resources || {};
        ['wood', 'stone', 'gold', 'plank'].forEach(k => { state.resources[k] = 999999; });

        const drawLine = (x0, y0, x1, y1) => {
            conveyorSystem.startDrag(x0, y0);
            conveyorSystem.updateDragNow ? conveyorSystem.updateDragNow(x1, y1) : conveyorSystem.updateDrag(x1, y1);
            conveyorSystem.submitDrag();
        };

        // 找空地畫「主線 + 三支線」，地圖障礙會干擾佈線 → 多區域重試直到註冊滿 3 個合流節點
        let baseY = 0, x0 = 0, x1 = 0;
        for (let attempt = 0; attempt < 8; attempt++) {
            const beforeNodes = (state.logisticsMergeNodes || []).length;
            baseY = (45 + attempt * 12) * TILE + TILE / 2;
            x0 = (15 + attempt) * TILE + TILE / 2;
            x1 = x0 + 40 * TILE;
            drawLine(x0, baseY, x1, baseY); // 主線
            const branchXs = [10, 18, 26].map(g => x0 + g * TILE);
            branchXs.forEach(bx => drawLine(bx, baseY - 7 * TILE, bx, baseY)); // 三支線
            await new Promise(r => setTimeout(r, 200));
            if ((state.logisticsMergeNodes || []).length - beforeNodes >= 3) break;
        }

        const lines = state.logisticsLines || [];
        const nodes = state.logisticsMergeNodes || [];
        const groupsInfo = Array.from(new Set(lines.map(l => l.groupId || l.id))).map(gid => ({ gid }));
        const nodesInfo = nodes.map(n => ({
            point: n.point, inputs: n.inputGroupIds, output: n.outputGroupId, turn: n.zipperTurn
        }));

        // 找出主線群組與支線群組
        const mainGroupIds = new Set();
        const branchGroupIds = new Set();
        nodes.forEach(n => {
            if (n?.outputGroupId) mainGroupIds.add(n.outputGroupId);
            (n.inputGroupIds || []).forEach(id => branchGroupIds.add(id));
        });

        if (!nodes.length) return { error: '未註冊任何合流節點', groupsInfo, nodesInfo };

        // 注入物流物品流：上游主線隨機間隔，三支線回堵滿載
        let nextId = 1;
        let seed = 42;
        const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        let upstreamNextGap = 0;
        const routeLen = pts => { let t = 0; for (let i = 0; i < pts.length - 1; i++) t += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); return t; };
        const distOf = t => Math.max(0, Math.min(1, t.progress || 0)) * routeLen(t.routePoints);

        const groupRoute = (gid) => {
            const full = conveyorSystem.getLogisticsGroupRoutePoints
                ? conveyorSystem.getLogisticsGroupRoutePoints(gid)
                : null;
            if (Array.isArray(full) && full.length >= 2) return full.map(p => ({ x: p.x, y: p.y }));
            const segs = conveyorSystem.getLogisticsSegmentsByGroupId(gid);
            return segs.length ? segs[0].routePoints.map(p => ({ x: p.x, y: p.y })) : null;
        };
        // 終端輸出群組 = 是某節點 output 且不是任何節點 input；上游注入群組 = 路線起點最靠近 x0 的群組
        const allInputIds = new Set();
        nodes.forEach(n => (n.inputGroupIds || []).forEach(id => allInputIds.add(id)));
        const terminalGid = Array.from(mainGroupIds).find(gid => !allInputIds.has(gid)) || Array.from(mainGroupIds)[0];
        let rootGid = null, rootStartDist = Infinity;
        const allGids = new Set([...mainGroupIds, ...branchGroupIds]);
        allGids.forEach(gid => {
            const r = groupRoute(gid);
            if (!r) return;
            const d = Math.hypot(r[0].x - x0, r[0].y - baseY);
            if (d < rootStartDist) { rootStartDist = d; rootGid = gid; }
        });
        const mainGid = rootGid;
        const branchGids = Array.from(branchGroupIds).filter(gid => gid !== rootGid && !mainGroupIds.has(gid));
        state.activeTransfers = state.activeTransfers || [];

        const feeder = setInterval(() => {
            // 上游主線生成（隨機間隔 1.2~2.8 格）
            const mainRoute = groupRoute(mainGid);
            if (mainRoute) {
                const onMain = state.activeTransfers.filter(t => t.lineId === mainGid);
                const nearest = onMain.reduce((m, t) => Math.min(m, distOf(t)), Infinity);
                if (nearest >= upstreamNextGap) {
                    state.activeTransfers.push({
                        id: `diag_u${nextId}`, serialNumber: nextId++, lineId: mainGid,
                        routePoints: mainRoute, progress: 0, itemType: 'wood', efficiency: 4
                    });
                    upstreamNextGap = TILE * (1.2 + rand() * 1.6);
                }
                // 終端群組末段回收，避免末端堆積污染量測
                for (let i = state.activeTransfers.length - 1; i >= 0; i--) {
                    const t = state.activeTransfers[i];
                    if (String(t.id).startsWith('diag_') && t.lineId === terminalGid && (t.progress || 0) > 0.92) {
                        state.activeTransfers.splice(i, 1);
                    }
                }
            }
            // 支線回堵
            branchGids.forEach(gid => {
                const r = groupRoute(gid);
                if (!r) return;
                const onLine = state.activeTransfers.filter(t => t.lineId === gid);
                const nearest = onLine.reduce((m, t) => Math.min(m, distOf(t)), Infinity);
                if (nearest >= TILE) {
                    state.activeTransfers.push({
                        id: `diag_b${nextId}`, serialNumber: nextId++, lineId: gid,
                        routePoints: r, progress: 0, itemType: 'stone', efficiency: 4
                    });
                }
            });
        }, 50);

        // 儀器：監聽 commit 事件 + 終端節點周邊時間序列
        const lastNode = nodes.reduce((b, n) => ((n.point?.x || 0) > (b?.point?.x || -1) ? n : b), null);
        const commits = [];
        const runtime = conveyorSystem.mergeNodeRuntime;
        const origCommit = runtime.commitLogisticsMergeAdmission.bind(runtime);
        runtime.commitLogisticsMergeAdmission = (node, winnerId, st) => {
            if (node === lastNode || node?.point?.x === lastNode?.point?.x) {
                const outItems = (st || state).activeTransfers.filter(t => t.lineId === node.outputGroupId);
                const nearest = outItems.reduce((m, t) => Math.min(m, distOf(t)), Infinity);
                commits.push({
                    t: +(performance.now() / 1000).toFixed(2),
                    winner: winnerId,
                    winnerLine: ((st || state).activeTransfers.find(x => x.id === winnerId)?.lineId || '').slice(-8),
                    gapToPrevOut: Number.isFinite(nearest) ? +(nearest / TILE).toFixed(2) : null
                });
            }
            return origCommit(node, winnerId, st);
        };
        // 推回偵測：包裝 queues 與 mergeNodes，捕捉任何位置倒退
        const retreats = [];
        const snapshotHeads = () => {
            const m = {};
            state.activeTransfers.forEach(t => {
                if (String(t.id).startsWith('diag_')) m[t.id] = distOf(t);
            });
            return m;
        };
        const wrap = (obj, name, tag) => {
            const orig = obj[name].bind(obj);
            obj[name] = (...args) => {
                const before = snapshotHeads();
                const ret = orig(...args);
                const after = snapshotHeads();
                Object.keys(after).forEach(id => {
                    if (before[id] !== undefined && after[id] < before[id] - 0.5 && retreats.length < 30) {
                        retreats.push({ tag, id, from: +(before[id] / TILE).toFixed(2), to: +(after[id] / TILE).toFixed(2) });
                    }
                });
                return ret;
            };
        };
        wrap(conveyorSystem, 'applyBlockedTransferQueues', 'queues');
        wrap(conveyorSystem, 'applyLogisticsMergeNodes', 'mergeApply');

        const timeline = [];
        const sampler = setInterval(() => {
            const n = lastNode;
            const mp = n.point || { x: n.x, y: n.y };
            const winKey = `${n.outputGroupId || 'output'}:${Math.round(mp.x)},${Math.round(mp.y)}`;
            const winRec = (state._logisticsMergeAdmissionWinners || {})[winKey] || {};
            const inputs = (n.inputGroupIds || []).map(gid => {
                const r = groupRoute(gid) || [];
                const total = routeLen(r);
                const items = state.activeTransfers.filter(t => t.lineId === gid);
                const head = items.reduce((b, t) => { const d = distOf(t); return !b || d > b.d ? { t, d } : b; }, null);
                if (!head) return null;
                const ownTotal = routeLen(head.t.routePoints);
                const allowedToEnd = head.t.maxAllowedProgress !== undefined
                    ? +(((1 - head.t.maxAllowedProgress) * ownTotal) / TILE).toFixed(2)
                    : null;
                return {
                    id: head.t.id, toEnd: +((total - head.d) / TILE).toFixed(2),
                    cap: allowedToEnd, qb: head.t.queueBlocked ? 1 : 0
                };
            });
            const outItems = state.activeTransfers.filter(t => t.lineId === n.outputGroupId);
            const nearestOut = outItems.reduce((m, t) => Math.min(m, distOf(t)), Infinity);
            timeline.push({
                t: +(performance.now() / 1000).toFixed(2),
                win: winRec.winnerId || null, committed: winRec.committed,
                occ: n.currentOccupant?.transferId || null,
                in: inputs,
                out: Number.isFinite(nearestOut) ? +(nearestOut / TILE).toFixed(2) : null
            });
        }, 100);

        await new Promise(r => setTimeout(r, 25000));
        clearInterval(feeder);
        clearInterval(sampler);
        runtime.commitLogisticsMergeAdmission = origCommit;

        const lastMergeX = Math.max(...nodes.map(n => (n.point?.x || n.x || 0)));
        const samples = [];
        const mainItems = state.activeTransfers
            .filter(t => t.lineId === terminalGid)
            .map(t => {
                const r = t.routePoints;
                const d = distOf(t);
                // 沿水平主線：絕對 x = 起點 x + 距離（主線向右）
                return r[0].x + d;
            })
            .filter(x => x > lastMergeX + TILE)
            .sort((a, b) => b - a);
        for (let i = 1; i < mainItems.length; i++) samples.push(mainItems[i - 1] - mainItems[i]);

        const hist = {};
        samples.forEach(g => {
            const b = (Math.round(g / (TILE / 4)) * 0.25).toFixed(2);
            hist[b] = (hist[b] || 0) + 1;
        });
        // 每個節點的幾何與閘門狀態診斷
        const nodeDiag = nodes.map(n => {
            const mp = n.point || { x: n.x, y: n.y };
            const inputs = (n.inputGroupIds || []).map(gid => {
                const r = groupRoute(gid) || [];
                const end = r[r.length - 1] || {};
                const items = state.activeTransfers.filter(t => t.lineId === gid);
                const total = routeLen(r);
                const head = items.reduce((best, t) => {
                    const d = distOf(t);
                    return !best || d > best.d ? { t, d } : best;
                }, null);
                return {
                    gid: gid.slice(-8),
                    endVsMerge: `${Math.round((end.x || 0) - mp.x)},${Math.round((end.y || 0) - mp.y)}`,
                    headToEnd: head ? +((total - head.d) / TILE).toFixed(2) : null,
                    headQb: head ? !!head.t.queueBlocked : null
                };
            });
            const outR = conveyorSystem.getLogisticsMergeNodeOutputRoute(n) || [];
            const winner = conveyorSystem.getLogisticsMergeAdmissionWinner(n, state, { spacing: TILE, readyDistanceFromEnd: TILE });
            return {
                mp: `${mp.x},${mp.y}`,
                outStartVsMerge: outR.length ? `${Math.round(outR[0].x - mp.x)},${Math.round(outR[0].y - mp.y)}` : null,
                out: (n.outputGroupId || '').slice(-8),
                turn: n.zipperTurn, slot: n.currentActiveSlot,
                occupant: n.currentOccupant?.transferId || null,
                winner, inputs
            };
        });
        const blockedStates = nodeDiag;

        return {
            terminalGid,
            sampleCount: samples.length,
            hist, retreats,
            commitsTail: commits.slice(-20),
            commitIntervals: commits.slice(1).map((c, i) => +(c.t - commits[i].t).toFixed(2)).slice(-20),
            timelineTail: timeline.slice(-40)
        };
    });

    console.log('[診斷結果]', JSON.stringify(result, null, 1));
});
