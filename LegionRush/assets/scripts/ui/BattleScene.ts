/**
 * BattleScene - 战斗场景主控制器
 * 挂载在 Canvas 节点，纯代码创建单位视图
 * 流程：检查配置 → 显示布阵界面 → 玩家确认 → 创建单位 → 开战
 * 结束后返回主场景
 */

import { _decorator, Component, Node, UITransform, Label, Color, Graphics, Layers } from 'cc';
import { BattleManager, BattleState, BattleConfig, BattleReport } from '../battle/BattleManager';
import { BattleUnit, TeamSide } from '../battle/Unit';
import { UnitConfig, Quality } from '../models/UnitData';
import { StageConfig } from '../models/StageData';
import { StageSelectUI } from './StageSelectUI';
import { EventBus } from '../core/EventBus';
import { UnitView, UnitShape, drawShape } from './UnitView';
import { BattleEffectManager } from './BattleEffectManager';
import { FormationType } from '../battle/Formation';
import { PlayerManager } from '../systems/PlayerManager';
import { LevelSystem } from '../systems/LevelSystem';
import { GameConfig } from '../core/GameConfig';
import { UnitInstanceData } from '../models/UnitData';

const { ccclass } = _decorator;

interface DeployEntry {
    configId: string;
    unitUid: string;
    count: number;
    gridRow: number;
    gridCol: number;
}

@ccclass('BattleScene')
export class BattleScene extends Component {
    private battleField: Node = null!;
    private uiRoot: Node = null!;
    private _bm: BattleManager = BattleManager.instance;
    private _unitViews: Map<string, UnitView> = new Map();
    private _effectMgr: BattleEffectManager | null = null;
    private _unitConfigs: Map<string, UnitConfig> = new Map();
    private _selectedStage: StageConfig | null = null;
    private _running: boolean = false;
    private _gridOverlay: Node | null = null;
    private _savedFormation: Map<string, { gridRow: number; gridCol: number }> = new Map();

    onLoad() {
        this.battleField = this.node.getChildByName('BattleField')!;
        this.uiRoot = this.node.getChildByName('UIRoot')!;

        if (!this.battleField) console.error('[BattleScene] 未找到 BattleField 子节点');
        if (!this.uiRoot) console.error('[BattleScene] 未找到 UIRoot 子节点');

        // 确保节点在 UI_2D layer 上
        this.battleField.layer = Layers.Enum.UI_2D;
        this.uiRoot.layer = Layers.Enum.UI_2D;

        // 给 BattleField 设置正确尺寸和背景色
        const bfUT = this.battleField.getComponent(UITransform) || this.battleField.addComponent(UITransform);
        bfUT.setContentSize(1280, 720);
        bfUT.setAnchorPoint(0.5, 0.5);

        // 战场背景（深蓝灰色）
        const bgNode = new Node('BattleBg');
        const bgUT = bgNode.addComponent(UITransform);
        bgUT.setContentSize(1280, 720);
        bgUT.setAnchorPoint(0.5, 0.5);
        bgNode.setPosition(0, 0, 0);
        const bgGfx = bgNode.addComponent(Graphics);
        bgGfx.fillColor = new Color(20, 24, 40, 255);
        bgGfx.rect(-640, -360, 1280, 720);
        bgGfx.fill();
        this.battleField.insertChild(bgNode, 0);

        this._effectMgr = this.battleField.addComponent(BattleEffectManager);

        // 使用全局配置
        this._unitConfigs = GameConfig.instance.unitConfigs;

        EventBus.instance.on('battle:end', this.onBattleEnd, this);
        EventBus.instance.on('battle:restart', this.onRestart, this);
        EventBus.instance.on('stage:selected', this.onStageSelected, this);
        EventBus.instance.on('battle:start_request', this.onStartRequest, this);

        console.log('[BattleScene] 战斗场景加载完成');
    }

    start() {
        // 不再自动发 deployment:ready，等玩家在 StageSelectUI 中选关
    }

    /** 玩家选择了关卡 → 自动布阵直接开战 */
    private onStageSelected(stage: StageConfig): void {
        this._selectedStage = stage;
        console.log(`[BattleScene] 选中关卡: ${stage.id} "${stage.name}"`);

        // 告诉 PlayerManager 实际打的是哪关
        PlayerManager.instance.setPlayingStage(stage.chapter, stage.stage);

        // 隐藏 StageSelectUI
        const stageSelectNode = this.uiRoot.getChildByName('StageSelectContainer');
        if (stageSelectNode) stageSelectNode.active = false;

        // 自动生成默认布阵，直接开战
        const deployData = this.buildAutoDeploy();
        this.onBattleDeploy(deployData);
    }

    /** 自动生成布阵，优先使用玩家上次保存的阵型 */
    private buildAutoDeploy(): DeployEntry[] {
        const pm = PlayerManager.instance;
        if (!pm.isLoaded) return [];

        const playerUnits = pm.getAllUnits();

        // 有保存的阵型 → 直接复用
        if (this._savedFormation.size > 0) {
            return playerUnits.map(unit => {
                const saved = this._savedFormation.get(unit.configId);
                return {
                    configId: unit.configId,
                    unitUid: unit.uid,
                    count: LevelSystem.instance.getDeployCount(unit.level),
                    gridRow: saved?.gridRow ?? 1,
                    gridCol: saved?.gridCol ?? 1,
                };
            });
        }

        // 首次：默认十字阵位置 + 对应兵种
        const defaultSlots = [
            { configId: 'mage',        gridRow: 0, gridCol: 1 },
            { configId: 'swordsman',   gridRow: 1, gridCol: 0 },
            { configId: 'iron_guard',  gridRow: 1, gridCol: 1 },
            { configId: 'apothecary',  gridRow: 1, gridCol: 2 },
            { configId: 'shadow_blade',gridRow: 2, gridCol: 1 },
        ];

        const entries: DeployEntry[] = [];
        for (const slot of defaultSlots) {
            const unit = playerUnits.find(u => u.configId === slot.configId);
            if (unit) {
                entries.push({
                    configId: slot.configId,
                    unitUid: unit.uid,
                    count: LevelSystem.instance.getDeployCount(unit.level),
                    gridRow: slot.gridRow,
                    gridCol: slot.gridCol,
                });
            }
        }

        // 如果默认兵种不够，把剩余兵种填入剩余格子
        const usedConfigIds = new Set(entries.map(e => e.configId));
        const remainingSlots = [
            { row: 0, col: 0 }, { row: 0, col: 2 },
            { row: 2, col: 0 }, { row: 2, col: 2 },
        ];
        let slotIdx = 0;
        for (const unit of playerUnits) {
            if (usedConfigIds.has(unit.configId)) continue;
            if (slotIdx >= remainingSlots.length) break;
            const slot = remainingSlots[slotIdx++];
            entries.push({
                configId: unit.configId,
                unitUid: unit.uid,
                count: LevelSystem.instance.getDeployCount(unit.level),
                gridRow: slot.row,
                gridCol: slot.col,
            });
        }

        console.log(`[BattleScene] 自动布阵: ${entries.map(e => `${e.configId}×${e.count}@(${e.gridRow},${e.gridCol})`).join(', ')}`);
        return entries;
    }

    /** 收到玩家布阵数据，创建单位并展示阵型，自动开战 */
    private onBattleDeploy(entries: DeployEntry[]): void {
        const pm = PlayerManager.instance;

        const leftUnits = entries.map(e => {
            const cfg = this._unitConfigs.get(e.configId);
            const unitInstance = pm.getUnit(e.unitUid);
            const level = unitInstance ? unitInstance.level : 1;
            const quality = unitInstance ? unitInstance.quality as Quality : Quality.GREEN;
            return { config: cfg!, level, quality, count: e.count, gridRow: e.gridRow, gridCol: e.gridCol };
        }).filter(u => u.config);

        const stage = this._selectedStage;
        const rightUnits: { config: UnitConfig; level: number; quality: Quality; count: number; gridRow: number; gridCol: number }[] = [];

        if (stage) {
            for (const enemy of stage.enemies) {
                const cfg = this._unitConfigs.get(enemy.configId);
                if (cfg) {
                    rightUnits.push({
                        config: cfg,
                        level: enemy.level,
                        quality: enemy.quality as Quality,
                        count: LevelSystem.instance.getDeployCount(enemy.level),
                        gridRow: enemy.gridRow,
                        gridCol: enemy.gridCol,
                    });
                }
            }
            console.log(`[BattleScene] 关卡 ${stage.id} "${stage.name}": ${rightUnits.reduce((s, e) => s + e.count, 0)} 个敌人`);
        } else {
            console.warn('[BattleScene] 未找到关卡配置，使用备用随机敌人');
            const roles: string[] = ['tank', 'melee', 'ranged', 'support', 'assassin'];
            const races: string[] = ['human', 'beast', 'spirit', 'demon'];
            const allConfigs = Array.from(this._unitConfigs.values());
            const crossPositions = [
                { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 },
                { row: 1, col: 2 }, { row: 2, col: 1 },
            ];
            for (let i = 0; i < roles.length; i++) {
                const race = races[Math.floor(Math.random() * races.length)];
                const cfg = allConfigs.find(c => c.role === roles[i] && c.race === race);
                if (cfg) {
                    rightUnits.push({
                        config: cfg, level: 5, quality: Quality.BLUE, count: 3,
                        gridRow: crossPositions[i].row, gridCol: crossPositions[i].col,
                    });
                }
            }
        }

        const config: BattleConfig = {
            leftFormation: FormationType.DEFAULT,
            rightFormation: FormationType.DEFAULT,
            leftUnits,
            rightUnits,
            timeLimit: 180,
        };

        this._bm.prepareBattle(config);
        this.createUnitViews();

        // 不自动开战，等玩家点"开战"按钮
        console.log(`[BattleScene] 布阵完成: ${leftUnits.length} vs ${rightUnits.length}，等待玩家开战`);
    }

    update(dt: number) {
        if (!this._running) return;
        this._bm.update(dt);
        this.syncUnitViews();
    }

    onDestroy() {
        EventBus.instance.off('battle:end', this.onBattleEnd, this);
        EventBus.instance.off('battle:restart', this.onRestart, this);
        EventBus.instance.off('stage:selected', this.onStageSelected, this);
        EventBus.instance.off('battle:start_request', this.onStartRequest, this);
    }

    private onBattleEnd(_report: BattleReport): void {
        this._running = false;
    }

    private onStartRequest(): void {
        if (this._bm.state !== BattleState.PREPARING) return;

        // 保存当前布阵（configId → 格子坐标）
        this._savedFormation.clear();
        const seen = new Set<string>();
        for (const unit of this._bm.leftUnits) {
            if (seen.has(unit.configId)) continue;
            seen.add(unit.configId);
            const cellIdx = this.findNearestCell(unit.position.x, unit.position.y);
            this._savedFormation.set(unit.configId, {
                gridRow: Math.floor(cellIdx / 3),
                gridCol: cellIdx % 3,
            });
        }

        this._bm.beginBattle();
        this._running = true;
        // 开战后隐藏九宫格
        if (this._gridOverlay) this._gridOverlay.active = false;
        console.log(`[BattleScene] 战斗开始: ${this._bm.allUnits.length} 个单位, 保存阵型: ${this._savedFormation.size} 种`);
    }

    private onRestart(): void {
        this.clearUnitViews();
        this._running = false;
        // 回到关卡选择界面
        const container = this.uiRoot.getChildByName('StageSelectContainer');
        if (container) container.active = true;
        const sUI = this.uiRoot.getComponent(StageSelectUI);
        if (sUI) sUI.refresh();
    }

    // --- 九宫格工具 ---

    /** 根据像素坐标找最近的格子索引（index = row*3+col） */
    private findNearestCell(x: number, y: number): number {
        const halfW = 960 * 0.35;
        const cw = 120, ch = 160;
        let bestIdx = 0, bestDist = Infinity;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const cx = -halfW + (c - 1) * cw;
                const cy = (1 - r) * ch;
                const d = (x - cx) ** 2 + (y - cy) ** 2;
                if (d < bestDist) { bestDist = d; bestIdx = r * 3 + c; }
            }
        }
        return bestIdx;
    }

    // --- 九宫格辅助线（布阵阶段可见） ---

    private createGridOverlay(): void {
        if (this._gridOverlay) { this._gridOverlay.destroy(); this._gridOverlay = null; }

        const gridNode = new Node('GridOverlay');
        const ut = gridNode.addComponent(UITransform);
        ut.setContentSize(1280, 720);
        ut.setAnchorPoint(0.5, 0.5);
        gridNode.setPosition(0, 0, 0);

        const gfx = gridNode.addComponent(Graphics);
        const halfW = 960 * 0.35; // 336
        const cellW = 120, cellH = 160;
        const gap = 8; // 格子间隙
        const drawW = cellW - gap;
        const drawH = cellH - gap;

        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const cx = -halfW + (c - 1) * cellW;
                const cy = (1 - r) * cellH;
                // 极淡蓝色填充
                gfx.fillColor = new Color(60, 90, 140, 18);
                gfx.roundRect(cx - drawW / 2, cy - drawH / 2, drawW, drawH, 8);
                gfx.fill();
                // 淡蓝色边框
                gfx.strokeColor = new Color(100, 150, 220, 45);
                gfx.lineWidth = 1;
                gfx.roundRect(cx - drawW / 2, cy - drawH / 2, drawW, drawH, 8);
                gfx.stroke();
            }
        }

        // 插在背景之上、单位之下
        this.battleField.insertChild(gridNode, 1);
        gridNode.layer = Layers.Enum.UI_2D;
        this._gridOverlay = gridNode;
    }

    // --- 单位视图：纯代码创建 ---

    private createUnitViews(): void {
        this.clearUnitViews();
        if (!this.battleField) return;

        for (const unit of this._bm.allUnits) {
            const view = this.createUnitNode(unit);
            this._unitViews.set(unit.uid, view);
            console.log(`[BattleScene] unit ${unit.config.name} team=${unit.team} pos=(${unit.position.x.toFixed(1)}, ${unit.position.y.toFixed(1)})`);
        }

        // 修正所有动态创建节点的 layer
        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(this.battleField);

        if (this._effectMgr) {
            this._effectMgr.setUnitViews(this._unitViews);
        }

        // 布阵阶段显示九宫格辅助线
        this.createGridOverlay();
    }

    private getUnitStyle(role: string): { size: number; shape: UnitShape } {
        switch (role) {
            case 'tank':     return { size: 28, shape: 'rect' };
            case 'melee':    return { size: 28, shape: 'triangle' };
            case 'ranged':   return { size: 28, shape: 'circle' };
            case 'support':  return { size: 28, shape: 'hexagon' };
            case 'assassin': return { size: 28, shape: 'diamond' };
            default:         return { size: 28, shape: 'rect' };
        }
    }

    private createUnitNode(unit: BattleUnit): UnitView {
        const style = this.getUnitStyle(unit.config.role);
        const hpWidth = style.size + 20;
        const hpHeight = 10;
        const teamColor = unit.team === TeamSide.LEFT
            ? new Color(80, 160, 255, 255)
            : new Color(255, 80, 80, 255);

        const node = new Node(`U_${unit.config.name}_${unit.uid}`);
        node.addComponent(UITransform).contentSize.set(style.size, style.size);

        let bodyGraphics: Graphics | null = null;
        bodyGraphics = node.addComponent(Graphics);
        bodyGraphics.fillColor = teamColor;
        drawShape(bodyGraphics, style.shape, style.size);
        bodyGraphics.fill();

        const barY = style.size / 2 + 10;
        const halfH = hpHeight / 2;

        const hpBorder = new Node('HpBorder');
        hpBorder.setParent(node);
        const hpBorderT = hpBorder.addComponent(UITransform);
        hpBorderT.contentSize.set(hpWidth + 4, hpHeight + 4);
        hpBorder.setPosition(0, barY, 0);
        const hpBorderG = hpBorder.addComponent(Graphics);
        hpBorderG.fillColor = new Color(0, 0, 0, 255);
        hpBorderG.rect(-(hpWidth + 4) / 2, -(hpHeight + 4) / 2, hpWidth + 4, hpHeight + 4);
        hpBorderG.fill();

        const hpBg = new Node('HpBg');
        hpBg.setParent(node);
        const hpBgT = hpBg.addComponent(UITransform);
        hpBgT.contentSize.set(hpWidth, hpHeight);
        hpBg.setPosition(0, barY, 0);
        const hpBgG = hpBg.addComponent(Graphics);
        hpBgG.fillColor = new Color(40, 40, 40, 255);
        hpBgG.rect(-hpWidth / 2, -hpHeight / 2, hpWidth, hpHeight);
        hpBgG.fill();

        const hpFill = new Node('HpFill');
        hpFill.setParent(node);
        const hpFillT = hpFill.addComponent(UITransform);
        hpFillT.setContentSize(hpWidth, halfH);
        hpFill.setPosition(0, barY + halfH / 2, 0);
        const hpFillG = hpFill.addComponent(Graphics);
        hpFillG.fillColor = new Color(0, 255, 80, 255);
        hpFillG.rect(-hpWidth / 2, -halfH / 2, hpWidth, halfH);
        hpFillG.fill();

        const epFill = new Node('EpFill');
        epFill.setParent(node);
        const epFillT = epFill.addComponent(UITransform);
        epFillT.setContentSize(hpWidth, halfH);
        epFill.setPosition(0, barY - halfH / 2, 0);
        const epFillG = epFill.addComponent(Graphics);
        epFillG.fillColor = new Color(60, 140, 255, 255);
        epFillG.rect(-hpWidth / 2, -halfH / 2, hpWidth, halfH);
        epFillG.fill();

        const nameNode = new Node('Name');
        nameNode.setParent(node);
        nameNode.setPosition(0, -(style.size / 2 + 16), 0);
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = unit.config.name.substring(0, 3);
        nameLabel.fontSize = 12;
        nameLabel.color = new Color(255, 255, 255, 255);

        const view = node.addComponent(UnitView);
        view.bodyGraphics = bodyGraphics;
        view.shapeType = style.shape;
        view.hpBarNode = hpBg;
        view.hpBarFill = hpFillG;
        view.energyBarFill = epFillG;
        view.nameLabel = nameLabel;
        view.init(unit);

        node.setParent(this.battleField);
        return view;
    }

    private syncUnitViews(): void {
        for (const [uid, view] of this._unitViews) {
            const unit = this._bm.allUnits.find(u => u.uid === uid);
            if (unit) view.refresh(unit);
        }
    }

    private clearUnitViews(): void {
        if (this._effectMgr) this._effectMgr.clearEffects();
        UnitView.clearViewMap();
        if (this._gridOverlay) { this._gridOverlay.destroy(); this._gridOverlay = null; }
        this._unitViews.forEach(view => {
            if (view && view.node) view.node.destroy();
        });
        this._unitViews.clear();
    }
}
