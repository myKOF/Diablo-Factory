import { GameEngine } from "../systems/game_systems.js";
import { UI_CONFIG } from "../ui/ui_config.js";
export class HUDRenderer {
    static drawWorkerLights(scene, g, ent, offX, offY, uw, uh, TS, alpha) {
            // 只有已完成的加工廠才顯示
            if (ent.isUnderConstruction) return;
            const cfg = UI_CONFIG.WorkerOccupancy || {
                lightWidth: 10, lightHeight: 5, spacing: 3, offsetY: -12,
                bgColor: "#212121", bgAlpha: 0.8, activeColor: "#76ff03", inactiveColor: "#424242"
            };
            // 使用引擎標準方法獲獲取建築配置
            const bCfg = GameEngine.getBuildingConfig(ent.type1, ent.lv || 1);
            if (!bCfg) return;
            const buildingId = ent.id || `${ent.type1}_${ent.x}_${ent.y}`;
            const assignedById = GameEngine.state.units && GameEngine.state.units.villagers
                ? GameEngine.state.units.villagers.filter(v => v.assignedWarehouseId === buildingId).length
                : 0;
            const current = Math.max(ent.assignedWorkers ? ent.assignedWorkers.length : 0, assignedById);
            const isLogisticsNode = bCfg.logistics && (bCfg.logistics.canInput || bCfg.logistics.canOutput);
            const baseCapacity = bCfg.need_villagers > 0 ? bCfg.need_villagers : (isLogisticsNode ? 5 : 0);
            const max = Math.max(1, baseCapacity, ent.targetWorkerCount || 0, current);
            if (max <= 0) return;
            let lw = cfg.lightWidth;
            const lh = cfg.lightHeight;
            let sp = cfg.spacing;
            const baseTotalW = (lw + sp) * max - sp;
            const maxAllowedW = Math.max(18, uw * TS * 0.86);
            if (baseTotalW > maxAllowedW) {
                const scale = maxAllowedW / baseTotalW;
                lw = Math.max(4, Math.floor(lw * scale));
                sp = Math.max(1, Math.floor(sp * scale));
            }
            const totalW = (lw + sp) * max - sp;
            // 背景深色底座
            const bg = scene.hexOrRgba(cfg.bgColor);
            const padding = cfg.basePadding || 2;
            const startX = offX - totalW / 2;
            const bottomInset = cfg.bottomInset !== undefined ? cfg.bottomInset : 8;
            const startY = offY + (uh * TS) / 2 - lh - padding - bottomInset;
            g.fillStyle(bg.color, alpha * (cfg.bgAlpha || 0.8));
            g.fillRect(startX - padding, startY - padding, totalW + padding * 2, lh + padding * 2);
            for (let i = 0; i < max; i++) {
                const lx = startX + i * (lw + sp);
                const isOn = i < current;
                // 底座/空格 (黑色)
                g.fillStyle(scene.hexOrRgba(cfg.inactiveColor).color, alpha);
                g.fillRect(lx, startY, lw, lh);
                if (isOn) {
                    // 亮燈 (亮綠色)
                    const active = scene.hexOrRgba(cfg.activeColor);
                    g.fillStyle(active.color, alpha);
                    g.fillRect(lx, startY, lw, lh);
                    // 增加發光質感
                    g.fillStyle(0xffffff, alpha * 0.5);
                    g.fillRect(lx, startY, lw, 1.5);
                    // 外發光
                    const glow = scene.hexOrRgba(cfg.glowColor || "#b2ff59");
                    g.lineStyle(1, glow.color, alpha * (cfg.glowAlpha || 0.6));
                    g.strokeRect(lx - 0.5, startY - 0.5, lw + 1, lh + 1);
                }
            }
        }
    static drawBuildProgressBar(scene, g, ent, uw, uh, TS) {
            const cfg = UI_CONFIG.BuildingProgressBar;
            const progress = ent.buildProgress / (ent.buildTime || 1);
            const overrides = cfg.overrides && cfg.overrides[ent.type1] ? cfg.overrides[ent.type1] : {};
            const widthScale = overrides.widthScale !== undefined ? overrides.widthScale : (cfg.widthScale || 1.1);
            const bh = overrides.height !== undefined ? overrides.height : (cfg.height || 10);
            const bw = (uw * TS) * widthScale;
            const bx = ent.x - bw / 2;
            // 計算垂直位置 (對齊邏輯)
            const align = overrides.align || cfg.align || "bottom";
            const offsetY = overrides.offsetY !== undefined ? overrides.offsetY : (cfg.offsetY || 0);
            let by = 0;
            switch (align) {
                case "top":
                    by = ent.y - (uh * TS) / 2 + offsetY;
                    break;
                case "center":
                    by = ent.y - bh / 2 + offsetY;
                    break;
                case "bottom":
                default:
                    by = ent.y + (uh * TS) / 2 - bh + offsetY;
                    break;
            }
            const bgColor = scene.hexOrRgba(cfg.bgColor);
            g.fillStyle(bgColor.color, cfg.bgAlpha || bgColor.alpha);
            g.fillRect(bx, by, bw, bh);
            const fillColor = scene.hexOrRgba(cfg.fillColor);
            g.fillStyle(fillColor.color, fillColor.alpha);
            g.fillRect(bx, by, bw * Math.max(0, Math.min(1, progress)), bh);
            const outlineColor = scene.hexOrRgba(cfg.outlineColor);
            g.lineStyle(1, outlineColor.color, outlineColor.alpha);
            g.strokeRect(bx, by, bw, bh);
        }
    static drawUpgradeProgressBar(scene, g, ent, uw, uh, TS) {
            const prog = ent.upgradeProgress || 0;
            const hCfg = UI_CONFIG.ActionMenuHeader;
            const barW = uw * TS * 0.8;
            const barH = 8;
            const x = ent.x - barW / 2;
            const y = ent.y + (uh * TS) / 2 + 10;
            // 背景
            const bgVal = scene.hexOrRgba(hCfg.worldProgressBg);
            g.fillStyle(bgVal.color, bgVal.alpha);
            g.fillRoundedRect(x, y, barW, barH, 4);
            // 進度
            if (prog > 0) {
                const fillVal = scene.hexOrRgba(hCfg.worldProgressColor);
                g.fillStyle(fillVal.color, fillVal.alpha);
                g.fillRoundedRect(x + 1, y + 1, Math.max(0, (barW - 2) * prog), barH - 2, 3);
            }
            // 外框
            g.lineStyle(1.5, 0xffffff, 0.8);
            g.strokeRoundedRect(x, y, barW, barH, 4);
        }
    static drawProductionHUD(scene, g, ent, uw, uh, TS) {
            const id = ent.id || `${ent.type}_${ent.x}_${ent.y}`;
            // 讀取此建築自己的隊列
            const queue = ent.queue || [];
            const timer = ent.productionTimer || 0;
            if (queue.length === 0) {
                if (scene.queueTexts.has(id)) scene.queueTexts.get(id).setVisible(false);
                if (scene.unitIconTexts.has(id)) scene.unitIconTexts.get(id).setVisible(false);
                return;
            }
            const cfg = UI_CONFIG.ProductionHUD;
            const maxPop = GameEngine.getMaxPopulation();
            const currentPop = GameEngine.getCurrentPopulation();
            // [視覺同步] 判斷當前首位單位是否能產出
            const currentUnitId = queue[0];
            const unitName = GameEngine.state.idToNameMap[currentUnitId] || currentUnitId;
            const nextCfg = GameEngine.state.npcConfigs[unitName] || GameEngine.state.npcConfigs[currentUnitId];
            const unitPop = nextCfg ? (nextCfg.population || 1) : 1;
            const canSpawn = (currentPop + unitPop) <= maxPop;
            const progress = 1.0 - (timer / 5);
            // 智慧型對齊：計算整體 HUD 寬度並居中
            const iconReserved = 30;
            const barWidth = Math.max(50, (uw * TS) * 0.6);
            const totalHudWidth = iconReserved + 15 + barWidth; // 圖示 + 間距 + 進度條
            const bx = ent.x - totalHudWidth / 2;
            const by = ent.y + (uh * TS) / 2 - 35; // 稍微往上提一點，避免被底部邊緣切掉
            // 1. 繪製進度條背景
            g.fillStyle(parseInt(cfg.barBg.replace('#', ''), 16), cfg.barAlpha || 0.7);
            g.fillRect(bx + iconReserved + 5, by + 12, barWidth, 10);
            // 2. 繪製進度內容 (若產出受阻則顯示紅色)
            const fillColor = !canSpawn ? 0xf44336 : 0x4caf50;
            g.fillStyle(fillColor, 1);
            g.fillRect(bx + iconReserved + 5, by + 12, barWidth * Math.max(0, Math.min(1, progress)), 10);
            // 3. 繪製底座圖示圓圈
            g.fillStyle(0x311b92, 0.8);
            g.fillCircle(bx + 15, by + 17, 15);
            // 4. 更新單位圖示 (Emoji)
            const iconMap = {
                'villagers': '👤', 'female villagers': '👩', 'mage': '🧙', 'swordsman': '⚔️', 'archer': '🏹',
                '1': '👤', '2': '👩', '3': '⚔️', '4': '🧙', '5': '🏹'
            };
            const emoji = iconMap[currentUnitId] || iconMap[unitName] || '👤';
            let iconTxt = scene.unitIconTexts.get(id);
            if (!iconTxt) {
                iconTxt = scene.add.text(bx + 15, by + 17, emoji, { fontSize: '18px' }).setOrigin(0.5);
                iconTxt.setDepth(1500000);
                scene.unitIconTexts.set(id, iconTxt);
            }
            if (iconTxt.text !== emoji) iconTxt.setText(emoji);
            iconTxt.setPosition(bx + 15, by + 17);
            iconTxt.setVisible(true);
            // 5. 更新隊列數量角標 (紅色圓圈)
            g.fillStyle(0xc62828, 1);
            g.fillCircle(bx + 30, by + 7, 8);
            let qTxt = scene.queueTexts.get(id);
            const queueStr = queue.length.toString();
            if (!qTxt) {
                qTxt = scene.add.text(bx + 30, by + 7, queueStr, {
                    fontSize: '10px',
                    fontStyle: 'bold',
                    fontFamily: 'Arial',
                    color: '#ffffff'
                }).setOrigin(0.5);
                qTxt.setDepth(1500001);
                scene.queueTexts.set(id, qTxt);
            }
            if (qTxt.text !== queueStr) qTxt.setText(queueStr);
            qTxt.setPosition(bx + 30, by + 7);
            qTxt.setVisible(true);
        }
    static drawRallyPoint(g, ent) {
            const cfg = UI_CONFIG.RallyPoint;
            const color = typeof cfg.lineColor === 'string' ? parseInt(cfg.lineColor.replace('#', ''), 16) : cfg.lineColor;
            const circleColor = typeof cfg.circleColor === 'string' ? parseInt(cfg.circleColor.replace('#', ''), 16) : cfg.circleColor;
            const dx = ent.rallyPoint.x - ent.x;
            const dy = ent.rallyPoint.y - ent.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 5) return;
            // 1. 繪製虛線
            const dashLen = cfg.lineDash[0];
            const gapLen = cfg.lineDash[1];
            const totalStep = dashLen + gapLen;
            g.lineStyle(2, color, cfg.lineAlpha);
            for (let i = 0; i < dist; i += totalStep) {
                const startRatio = i / dist;
                const endRatio = Math.min((i + dashLen) / dist, 1);
                g.lineBetween(
                    ent.x + dx * startRatio, ent.y + dy * startRatio,
                    ent.x + dx * endRatio, ent.y + dy * endRatio
                );
            }
            // 2. 繪製縮放光圈
            const time = Date.now() * cfg.pulseSpeed;
            const scale = (Math.sin(time) + 1) / 2; // 0 ~ 1
            const radius = cfg.circleMinRadius + (cfg.circleMaxRadius - cfg.circleMinRadius) * scale;
            g.lineStyle(2, circleColor, cfg.circleAlpha);
            g.strokeCircle(ent.rallyPoint.x, ent.rallyPoint.y, radius);
            g.fillStyle(circleColor, cfg.circleAlpha * 0.3);
            g.fillCircle(ent.rallyPoint.x, ent.rallyPoint.y, radius * 0.6);
        }
}
