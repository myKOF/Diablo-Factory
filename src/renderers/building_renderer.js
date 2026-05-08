import { GameEngine } from "../systems/game_systems.js";
import { UI_CONFIG } from "../ui/ui_config.js";
import { CharacterRenderer } from "./character_renderer.js";

export class BuildingRenderer {
    static drawEntity(scene, g, ent, alpha, offX = 0, offY = 0) {
        const TS = GameEngine.TILE_SIZE;
        const type1 = ent.type1 || ent.type;
        const cfg = GameEngine.getEntityConfig(type1);
        const { uw, uh } = scene.getFootprint(cfg);

        const isUnderConstruction = ent.isUnderConstruction === true || ent.isUnderConstruction === 1;
        const finalAlpha = isUnderConstruction ? (alpha * 0.5) : Math.max(alpha, 0.6);
        const rotationSteps = ((Number(ent.rotationSteps) || 0) % 4 + 4) % 4;
        const manualRotationSteps = rotationSteps;

        // 如果是預覽模式，加強視覺引導：外框與高透明度
        if (alpha < 1.0) {
            const previewColor = ent.previewColor || 0x2196f3; // 預設藍色，若受阻則傳入紅色
            g.lineStyle(2, previewColor, 0.8);
            if (manualRotationSteps === 0) {
                g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            } else {
                const corners = [
                    { x: offX - (uw * TS) / 2, y: offY - (uh * TS) / 2 },
                    { x: offX + (uw * TS) / 2, y: offY - (uh * TS) / 2 },
                    { x: offX + (uw * TS) / 2, y: offY + (uh * TS) / 2 },
                    { x: offX - (uw * TS) / 2, y: offY + (uh * TS) / 2 }
                ].map(point => {
                    let relX = point.x - offX;
                    let relY = point.y - offY;
                    for (let i = 0; i < manualRotationSteps; i++) {
                        const nextX = -relY;
                        const nextY = relX;
                        relX = nextX;
                        relY = nextY;
                    }
                    return { x: offX + relX, y: offY + relY };
                });
                g.beginPath();
                g.moveTo(corners[0].x, corners[0].y);
                for (let i = 1; i < corners.length; i++) g.lineTo(corners[i].x, corners[i].y);
                g.closePath();
                g.strokePath();
            }
        }


        if (type1 === 'village' || type1 === 'town_center') {
            g.fillStyle(0x8d6e63, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(1, 0x5d4037, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (type1 === 'farmhouse') {
            g.fillStyle(0xbcaaa4, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(1, 0x8d6e63, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);

            g.fillStyle(0x795548, finalAlpha);
            g.beginPath();
            g.moveTo(offX - (uw * TS) / 2 - 5, offY - (uh * TS) / 2);
            g.lineTo(offX, offY - (uh * TS) / 2 - 20);
            g.lineTo(offX + (uw * TS) / 2 + 5, offY - (uh * TS) / 2);
            g.fillPath();
        } else if (type1 === 'timber_factory') {
            g.fillStyle(0x388e3c, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x1b5e20, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (type1 === 'stone_factory' || type1 === 'quarry') {
            g.fillStyle(0x455a64, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x263238, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (type1 === 'barn') {
            g.fillStyle(0xa1887f, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x5d4037, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (type1 === 'gold_mining_factory') {
            g.fillStyle(0xfbc02d, finalAlpha); // 鮮亮的黃色
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xf57f17, finalAlpha); // 橘黃色輪廓
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            // 加點晶體裝飾感
            g.fillStyle(0xfff176, finalAlpha);
            g.fillCircle(offX, offY, 15);
        } else if (type1 === 'farmland') {
            g.fillStyle(0xdce775, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(1, 0xafb42b, finalAlpha);
            for (let i = -(uw / 2); i < uw / 2; i += 0.5) {
                g.lineBetween(offX + i * TS, offY - (uh * TS) / 2 + 5, offX + i * TS, offY + (uh * TS) / 2 - 5);
            }
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (type1 === 'tree_plantation') {
            g.fillStyle(0x1b5e20, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x0a3d0d, finalAlpha);
            const step = TS;
            for (let i = -(uw * TS) / 2 + 10; i < (uw * TS) / 2; i += step) {
                for (let j = -(uh * TS) / 2 + 10; j < (uh * TS) / 2; j += step) {
                    g.fillStyle(0x2e7d32, finalAlpha);
                    g.fillCircle(offX + i, offY + j, 8);
                }
            }
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
        } else if (type1 === 'mage_place') {
            g.fillStyle(0x4a148c, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xe1f5fe, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.fillStyle(0xffd600, finalAlpha);
            g.fillCircle(offX, offY, 20);
        } else if (type1 === 'swordsman_place') {
            g.fillStyle(0x455a64, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xf44336, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.fillStyle(0xffccbc, finalAlpha);
            g.fillRect(offX - 10, offY - 10, 20, 20);
        } else if (type1 === 'archer_place') {
            g.fillStyle(0x795548, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xffeb3b, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0xf44336, finalAlpha);
            g.strokeCircle(offX, offY, 15);
            g.strokeCircle(offX, offY, 5);
        } else if (type1 === 'corpse') {
            // [核心修正] 呼叫專屬角色渲染器繪製屍體，達成自訂外觀效果
            CharacterRenderer.renderCorpse(g, offX, offY, ent);
        } else if (type1 === 'campfire') {
            const cfg = UI_CONFIG.ResourceRenderer.Campfire;
            g.fillStyle(cfg.groundColor, finalAlpha);
            g.fillCircle(offX, offY, 20);
            g.fillStyle(cfg.woodColor, finalAlpha);
            g.lineStyle(2, cfg.woodOutline, finalAlpha);
            g.strokeRect(offX - 14, offY - 4, 30, 8);

            g.save();
            g.fillRect(offX - 4, offY - 14, 10, 30);
            g.strokeRect(offX - 4, offY - 14, 10, 30);

            g.fillStyle(cfg.woodColor, finalAlpha);
            g.fillRect(offX - 8, offY - 8, 16, 16);
            g.strokeRect(offX - 8, offY - 8, 16, 16);

            g.restore();
        } else if (type1 === 'timber_processing_plant') {
            // 工廠主體
            g.fillStyle(0x2e7d32, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x1b5e20, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            // 鋸齒屋頂 (Factory Style)
            g.fillStyle(0x1b5e20, finalAlpha);
            for (let i = 0; i < 3; i++) {
                g.beginPath();
                const sx = offX - (uw * TS) / 2 + (i * (uw * TS) / 3);
                g.moveTo(sx, offY - (uh * TS) / 2);
                g.lineTo(sx + (uw * TS) / 3, offY - (uh * TS) / 2);
                g.lineTo(sx, offY - (uh * TS) / 2 - 15);
                g.fillPath();
            }
        } else if (type1 === 'smelting_plant') {
            g.fillStyle(0x37474f, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x212121, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            // 煙囪細節
            g.fillStyle(0x212121, finalAlpha);
            g.fillRect(offX + (uw * TS) / 4, offY - (uh * TS) / 2 - 20, 10, 25);
            g.fillStyle(0xff7043, finalAlpha);
            g.fillCircle(offX - 5, offY, 10);
        } else if (type1 === 'stone_processing_plant') {
            g.fillStyle(0x607d8b, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x455a64, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            // 石磚裝飾
            g.lineStyle(1, 0xffffff, finalAlpha * 0.3);
            g.strokeRect(offX - 10, offY - 10, 20, 20);
        } else if (type1 === 'tank_workshop') {
            g.fillStyle(0x455a64, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x263238, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            // 重型屋頂
            g.fillStyle(0x263238, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2 - 10, uw * TS, 10);
            // 標誌
            g.lineStyle(2, 0xfbc02d, finalAlpha);
            g.strokeCircle(offX, offY, 12);
        } else if (type1 === 'storehouse') {
            // 倉庫外觀：深灰色基座，帶有箱子裝飾
            g.fillStyle(0x546e7a, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);
            g.lineStyle(2, 0x263238, finalAlpha);
            g.strokeRect(offX - (uw * TS) / 2, offY - (uh * TS) / 2, uw * TS, uh * TS);

            // 屋頂
            g.fillStyle(0x37474f, finalAlpha);
            g.fillRect(offX - (uw * TS) / 2 - 2, offY - (uh * TS) / 2 - 5, uw * TS + 4, 10);

            // 箱子符號 (📦 簡化版)
            g.fillStyle(0xffa726, finalAlpha);
            g.fillRect(offX - 10, offY - 10, 20, 20);
            g.lineStyle(1, 0xe65100, finalAlpha);
            g.strokeRect(offX - 10, offY - 10, 20, 20);
            // 箱子蓋線
            g.lineBetween(offX - 10, offY, offX + 10, offY);
            g.lineBetween(offX, offY - 10, offX, offY);
        } else if (type1 && (type1.startsWith('tree') || type1.startsWith('wood'))) {
            g.fillStyle(0x2e7d32, finalAlpha);
            g.fillCircle(offX, offY, 20);
        } else if (type1 && type1.startsWith('stone')) {
            g.fillStyle(0x757575, finalAlpha);
            g.beginPath();
            g.moveTo(offX - 20, offY + 10);
            g.lineTo(offX, offY - 15);
            g.lineTo(offX + 25, offY + 15);
            g.fillPath();
        } else if (type1 && type1.startsWith('food')) {
            g.fillStyle(0xc2185b, finalAlpha);
            g.fillCircle(offX, offY, 18);
        }

        if (cfg && Array.isArray(cfg.ports) && cfg.ports.length > 0) {
            BuildingRenderer.drawBuildingPorts(g, offX, offY, uw, uh, cfg.ports, finalAlpha, manualRotationSteps);
        }
    }

    static drawBuildingPorts(g, offX, offY, uw, uh, ports, alpha = 1, rotationSteps = 0) {
        const TS = GameEngine.TILE_SIZE;
        const halfW = (uw * TS) / 2;
        const halfH = (uh * TS) / 2;
        const fillColor = 0xffeb3b;
        const edgeColor = 0xf57f17;
        const fillAlpha = Math.min(1, Math.max(0.2, alpha * 0.95));
        const edgeAlpha = Math.min(1, Math.max(0.2, alpha));
        const stripDepth = Math.max(4, TS * 0.45);
        const steps = ((Number(rotationSteps) || 0) % 4 + 4) % 4;

        const rotatePoint = (x, y) => {
            let relX = x - offX;
            let relY = y - offY;
            for (let i = 0; i < steps; i++) {
                const nextX = -relY;
                const nextY = relX;
                relX = nextX;
                relY = nextY;
            }
            return { x: offX + relX, y: offY + relY };
        };

        const drawPortRect = (x, y, w, h) => {
            const points = [
                rotatePoint(x, y),
                rotatePoint(x + w, y),
                rotatePoint(x + w, y + h),
                rotatePoint(x, y + h)
            ];
            g.fillStyle(fillColor, fillAlpha);
            g.beginPath();
            g.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
            g.closePath();
            g.fillPath();
            g.lineStyle(1.5, edgeColor, edgeAlpha);
            g.beginPath();
            g.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
            g.closePath();
            g.strokePath();
        };

        const drawSegment = (dir, segStart, segEnd, axisLen) => {
            const clampedStart = Math.max(0, segStart);
            const clampedEnd = Math.min(axisLen, segEnd);
            if (clampedEnd <= clampedStart) return;

            if (dir === 'up' || dir === 'down') {
                const x = offX - halfW + clampedStart * TS;
                const w = (clampedEnd - clampedStart) * TS;
                const y = (dir === 'up') ? (offY - halfH) : (offY + halfH - stripDepth);
                drawPortRect(x, y, w, stripDepth);
            } else {
                const y = offY - halfH + clampedStart * TS;
                const h = (clampedEnd - clampedStart) * TS;
                const x = (dir === 'left') ? (offX - halfW) : (offX + halfW - stripDepth);
                drawPortRect(x, y, stripDepth, h);
            }
        };

        ports.forEach(port => {
            const dir = (port.align || '').toLowerCase();
            const axisLen = (dir === 'up' || dir === 'down') ? uw : uh;
            if (!['up', 'down', 'left', 'right'].includes(dir) || axisLen <= 0) return;

            const width = Math.max(1, Number(port.width) || 1);
            const count = Math.max(1, Number(port.count) || 1);
            const gap = Math.max(0, Number(port.gap) || 0);

            const totalSpan = count * width + (count - 1) * gap;
            const start = (axisLen - totalSpan) / 2;

            for (let i = 0; i < count; i++) {
                const segStart = start + i * (width + gap);
                const segEnd = segStart + width;
                drawSegment(dir, segStart, segEnd, axisLen);
            }
        });
    }
}
