/**
 * BattleScene - 战斗场景主控制器
 * 挂载在 Canvas 节点，纯代码创建单位视图
 * 流程：检查配置 → 显示布阵界面 → 玩家确认 → 创建单位 → 开战
 * 结束后返回主场景
 */

import { _decorator, Component, Node, UITransform, Label, Color, Graphics, Layers } from 'cc';
import { BattleManager, BattleState, BattleConfig, BattleReport } from '../battle/BattleManager';
import { BattleUnit, TeamSide } from '../battle/Unit';
import { UnitConfig, Quality, UnitInstanceData } from '../models/UnitData';
import { StageConfig } from '../models/StageData';
import { StageSelectUI } from './StageSelectUI';
import { EventBus } from '../core/EventBus';
import { UnitView, UnitShape, drawShape } from './UnitView';
import { BattleEffectManager } from './BattleEffectManager';
import { FormationType } from '../battle/Formation';
import { ActiveSynergy } from '../models/SynergyData';
import { PlayerManager } from '../systems/PlayerManager';
import { LevelSystem } from '../systems/LevelSystem';
import { GameConfig } from '../core/GameConfig';

const { ccclass } = _decorator;

// 替换弹窗用常量
const RACE_ORDER = ['human', 'beast', 'spirit', 'demon'];
const RACE_NAMES: Record<string, string> = { human: '人族', beast: '兽族', spirit: '灵族', demon: '魔族' };
const QUALITY_ORDER = ['green', 'blue', 'purple', 'gold', 'gold1', 'gold2', 'gold3'];
const QUALITY_NAMES: Record<string, string> = {
    green: '绿', blue: '蓝', purple: '紫', gold: '金',
    gold1: '金+1', gold2: '金+2', gold3: '金+3',
};
const QUALITY_COLORS: Record<string, Color> = {
    green: new Color(80, 200, 80, 255), blue: new Color(80, 160, 255, 255),
    purple: new Color(180, 80, 255, 255), gold: new Color(255, 215, 0, 255),
};

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
    private _currentDeploy: DeployEntry[] = [];
    private _replacePanel: Node | null = null;
    private _synergyDisplayNodes: Node[] = [];

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
        const MAX_TYPES = 5;

        // 有保存的阵型 → 只复用阵型中已有的兵种（最多 5 种）
        if (this._savedFormation.size > 0) {
            const entries: DeployEntry[] = [];
            for (const [configId, pos] of this._savedFormation) {
                if (entries.length >= MAX_TYPES) break;
                const unit = playerUnits.find(u => u.configId === configId);
                if (unit) {
                    entries.push({
                        configId,
                        unitUid: unit.uid,
                        count: LevelSystem.instance.getDeployCount(unit.level),
                        gridRow: pos.gridRow,
                        gridCol: pos.gridCol,
                    });
                }
            }
            return entries;
        }

        // 首次：默认十字阵位置 + 对应兵种（固定 5 种）
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

        console.log(`[BattleScene] 自动布阵: ${entries.map(e => `${e.configId}×${e.count}@(${e.gridRow},${e.gridCol})`).join(', ')}`);
        return entries;
    }

    /** 收到玩家布阵数据，创建单位并展示阵型，自动开战 */
    private onBattleDeploy(entries: DeployEntry[]): void {
        this._currentDeploy = entries;
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
        // 隐藏羁绊显示
        this._synergyDisplayNodes.forEach(n => { if (n) n.active = false; });
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

    // --- 羁绊天赋显示 ---

    private createSynergyDisplay(): void {
        this._synergyDisplayNodes.forEach(n => { if (n) n.destroy(); });
        this._synergyDisplayNodes = [];

        const leftActives = this._bm.activeSynergies;
        const rightActives = this._bm.rightActiveSynergies;

        if (leftActives.length === 0 && rightActives.length === 0) return;

        const halfW = 960 * 0.35; // 336 — 阵型中心 X

        // 蓝方（左）
        if (leftActives.length > 0) {
            const node = this.createSynergyNode(leftActives, -halfW, 270, new Color(80, 160, 255, 255));
            this._synergyDisplayNodes.push(node);
        }
        // 红方（右）
        if (rightActives.length > 0) {
            const node = this.createSynergyNode(rightActives, halfW, 270, new Color(255, 80, 80, 255));
            this._synergyDisplayNodes.push(node);
        }

        console.log(`[BattleScene] 羁绊显示: 蓝方 ${leftActives.length} 个, 红方 ${rightActives.length} 个`);
        if (leftActives.length === 0 && rightActives.length === 0) {
            console.log('[BattleScene] 无羁绊激活，检查 synergies 配置和兵种种族分布');
        }
    }

    private createSynergyNode(actives: readonly ActiveSynergy[], cx: number, cy: number, teamColor: Color): Node {
        const container = new Node('SynergyDisplay');
        container.setParent(this.battleField);
        container.setPosition(cx, cy, 0);
        container.layer = Layers.Enum.UI_2D;

        const ut = container.addComponent(UITransform);
        ut.setContentSize(320, 60);
        ut.setAnchorPoint(0.5, 0.5);

        // 半透明背景
        const bgGfx = container.addComponent(Graphics);
        bgGfx.fillColor = new Color(10, 14, 30, 180);
        bgGfx.roundRect(-160, -30, 320, 60, 8);
        bgGfx.fill();
        bgGfx.strokeColor = new Color(teamColor.r, teamColor.g, teamColor.b, 60);
        bgGfx.lineWidth = 1;
        bgGfx.roundRect(-160, -30, 320, 60, 8);
        bgGfx.stroke();

        // 每个羁绊一个图标+文字，横排排列
        const iconSize = 16;
        const spacing = 105;
        const startX = -(actives.length - 1) * spacing / 2;

        for (let i = 0; i < actives.length; i++) {
            const synergy = actives[i];
            const x = startX + i * spacing;

            // 品质色小方块作为图标
            const iconNode = new Node(`Icon_${i}`);
            iconNode.setParent(container);
            iconNode.setPosition(x - 42, 4, 0);
            const iconUT = iconNode.addComponent(UITransform);
            iconUT.setContentSize(iconSize, iconSize);
            const iconGfx = iconNode.addComponent(Graphics);
            const raceColor = this.getRaceColor(synergy.config.race);
            iconGfx.fillColor = raceColor;
            iconGfx.roundRect(-iconSize / 2, -iconSize / 2, iconSize, iconSize, 3);
            iconGfx.fill();

            // 羁绊名 + 档位
            const labelNode = new Node(`Label_${i}`);
            labelNode.setParent(container);
            labelNode.setPosition(x + 2, 4, 0);
            const labelUT = labelNode.addComponent(UITransform);
            labelUT.setContentSize(80, 20);
            const label = labelNode.addComponent(Label);
            label.string = synergy.config.name;
            label.fontSize = 13;
            label.color = new Color(240, 240, 255, 255);

            // 效果描述
            const descNode = new Node(`Desc_${i}`);
            descNode.setParent(container);
            descNode.setPosition(x + 2, -14, 0);
            const descUT = descNode.addComponent(UITransform);
            descUT.setContentSize(90, 16);
            const descLbl = descNode.addComponent(Label);
            descLbl.string = this.describeSynergy(synergy);
            descLbl.fontSize = 10;
            descLbl.color = new Color(180, 200, 220, 200);
        }

        // 递归设置所有子节点 layer
        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(container);

        return container;
    }

    private getRaceColor(race: string): Color {
        switch (race) {
            case 'human':  return new Color(80, 160, 255, 255);
            case 'beast':  return new Color(255, 140, 60, 255);
            case 'spirit': return new Color(100, 220, 180, 255);
            case 'demon':  return new Color(200, 80, 255, 255);
            case 'mixed':  return new Color(255, 215, 0, 255);
            default:       return new Color(180, 180, 180, 255);
        }
    }

    private describeSynergy(synergy: ActiveSynergy): string {
        const parts: string[] = [];
        for (let t = 0; t <= synergy.activatedTier; t++) {
            for (const eff of synergy.config.tiers[t].effects) {
                const sign = eff.value >= 0 ? '+' : '';
                const statName = this.statDisplayName(eff.stat);
                parts.push(`${statName}${sign}${eff.value}`);
            }
        }
        return parts.join(' ');
    }

    private statDisplayName(stat: string): string {
        switch (stat) {
            case 'atk':    return '攻击';
            case 'def':    return '防御';
            case 'atkSpd': return '攻速';
            case 'hp':     return '生命';
            default:       return stat;
        }
    }

    // --- 单位视图：纯代码创建 ---

    private createUnitViews(): void {
        this.clearUnitViews();
        if (!this.battleField) return;

        for (const unit of this._bm.allUnits) {
            const view = this.createUnitNode(unit);
            this._unitViews.set(unit.uid, view);
            // 左侧（玩家方）单位可点击替换（仅点击，拖拽不触发）
            if (unit.team === TeamSide.LEFT) {
                const deployEntry = this._currentDeploy.find(e => e.configId === unit.configId);
                if (deployEntry) {
                    let touchStartX = 0, touchStartY = 0;
                    view.node.on(Node.EventType.TOUCH_START, (e: any) => {
                        touchStartX = e.getUILocation().x;
                        touchStartY = e.getUILocation().y;
                    });
                    view.node.on(Node.EventType.TOUCH_END, (e: any) => {
                        const loc = e.getUILocation();
                        const dx = loc.x - touchStartX;
                        const dy = loc.y - touchStartY;
                        if (dx * dx + dy * dy < 100) { // 移动距离 < 10px 才算点击
                            if (this._bm.state === BattleState.PREPARING && !this._replacePanel) {
                                this.showReplacePanel(unit.configId, deployEntry.gridRow, deployEntry.gridCol);
                            }
                        }
                    });
                }
            }
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
        // 显示双方羁绊天赋
        this.createSynergyDisplay();
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

    // --- 替换兵种弹窗 ---

    private showReplacePanel(replacedConfigId: string, gridRow: number, gridCol: number): void {
        this.closeReplacePanel();

        const pm = PlayerManager.instance;
        const allUnits = pm.getAllUnits();

        // 每个 configId 只保留最高品质/最高等级的实例
        const bestMap = new Map<string, UnitInstanceData>();
        for (const u of allUnits) {
            const exist = bestMap.get(u.configId);
            if (!exist) { bestMap.set(u.configId, u); continue; }
            const qOld = QUALITY_ORDER.indexOf(exist.quality);
            const qNew = QUALITY_ORDER.indexOf(u.quality);
            if (u.level > exist.level || (u.level === exist.level && qNew > qOld)) {
                bestMap.set(u.configId, u);
            }
        }
        const sorted = Array.from(bestMap.values()).sort((a, b) => {
            if (b.level !== a.level) return b.level - a.level;
            return QUALITY_ORDER.indexOf(b.quality) - QUALITY_ORDER.indexOf(a.quality);
        });

        // 已上阵的 configId 集合
        const deployedIds = new Set(this._currentDeploy.map(e => e.configId));

        // 遮罩
        const mask = new Node('ReplaceMask');
        const maskUT = mask.addComponent(UITransform);
        maskUT.setContentSize(2000, 2000);
        maskUT.setAnchorPoint(0.5, 0.5);
        const maskGfx = mask.addComponent(Graphics);
        maskGfx.fillColor = new Color(0, 0, 0, 160);
        maskGfx.rect(-1000, -1000, 2000, 2000);
        maskGfx.fill();
        mask.on(Node.EventType.TOUCH_END, () => this.closeReplacePanel());
        mask.layer = Layers.Enum.UI_2D;

        // 弹窗主体
        const panel = new Node('ReplacePanel');
        const panelUT = panel.addComponent(UITransform);
        panelUT.setContentSize(520, 600);
        panelUT.setAnchorPoint(0.5, 0.5);
        const panelGfx = panel.addComponent(Graphics);
        panelGfx.fillColor = new Color(30, 35, 50, 245);
        panelGfx.roundRect(-260, -300, 520, 600, 12);
        panelGfx.fill();
        panelGfx.strokeColor = new Color(80, 120, 180, 120);
        panelGfx.lineWidth = 2;
        panelGfx.roundRect(-260, -300, 520, 600, 12);
        panelGfx.stroke();
        panel.layer = Layers.Enum.UI_2D;
        panel.on(Node.EventType.TOUCH_END, (e: any) => e.propagationStopped = true);

        // 标题
        const titleNode = new Node('Title');
        titleNode.setParent(panel);
        titleNode.setPosition(0, 260, 0);
        const titleUT = titleNode.addComponent(UITransform);
        titleUT.setContentSize(200, 30);
        const titleLbl = titleNode.addComponent(Label);
        titleLbl.string = '替换兵种';
        titleLbl.fontSize = 22;
        titleLbl.color = new Color(255, 255, 255, 255);

        // 关闭按钮
        const closeBtn = new Node('CloseBtn');
        closeBtn.setParent(panel);
        closeBtn.setPosition(235, 275, 0);
        const closeUT = closeBtn.addComponent(UITransform);
        closeUT.setContentSize(30, 30);
        const closeGfx = closeBtn.addComponent(Graphics);
        closeGfx.strokeColor = new Color(200, 200, 200, 200);
        closeGfx.lineWidth = 2;
        closeGfx.moveTo(-8, 8); closeGfx.lineTo(8, -8);
        closeGfx.moveTo(8, 8); closeGfx.lineTo(-8, -8);
        closeGfx.stroke();
        closeBtn.on(Node.EventType.TOUCH_END, () => this.closeReplacePanel());

        // 兵种列表（手动定位）
        const listStartY = 210;
        const cardW = 90, cardH = 55, cardGapX = 8, cardGapY = 10;
        const cols = 5;
        const startX = -((cols * (cardW + cardGapX) - cardGapX) / 2) + cardW / 2;

        // 按 race 分组
        let currentY = listStartY;
        for (const race of RACE_ORDER) {
            const raceUnits = sorted.filter(u => {
                const cfg = this._unitConfigs.get(u.configId);
                return cfg && cfg.race === race;
            });
            if (raceUnits.length === 0) continue;

            // 种族标题
            const raceTitle = new Node(`Race_${race}`);
            raceTitle.setParent(panel);
            raceTitle.setPosition(-220, currentY, 0);
            const raceTitleUT = raceTitle.addComponent(UITransform);
            raceTitleUT.setContentSize(80, 22);
            const raceLbl = raceTitle.addComponent(Label);
            raceLbl.string = RACE_NAMES[race] || race;
            raceLbl.fontSize = 16;
            raceLbl.color = new Color(180, 200, 255, 220);
            currentY -= 38;

            // 该种族的卡片
            for (let i = 0; i < raceUnits.length; i++) {
                const u = raceUnits[i];
                const cfg = this._unitConfigs.get(u.configId);
                if (!cfg) continue;

                const col = i % cols;
                const row = Math.floor(i / cols);
                const cx = startX + col * (cardW + cardGapX);
                const cy = currentY - row * (cardH + cardGapY);

                const isDeployed = deployedIds.has(u.configId);
                const isCurrent = u.configId === replacedConfigId;
                const qColor = QUALITY_COLORS[u.quality] || QUALITY_COLORS['green'];

                const card = new Node(`Card_${u.configId}`);
                card.setParent(panel);
                card.setPosition(cx, cy, 0);
                const cardUT = card.addComponent(UITransform);
                cardUT.setContentSize(cardW, cardH);
                cardUT.setAnchorPoint(0.5, 0.5);
                const cardGfx = card.addComponent(Graphics);

                if (isDeployed && !isCurrent) {
                    // 已上阵、非当前 → 灰色不可选
                    cardGfx.fillColor = new Color(50, 50, 55, 200);
                    cardGfx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
                    cardGfx.fill();
                    cardGfx.strokeColor = new Color(80, 80, 80, 100);
                    cardGfx.lineWidth = 1;
                    cardGfx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
                    cardGfx.stroke();
                } else {
                    // 可选或当前
                    cardGfx.fillColor = new Color(45, 50, 65, 220);
                    cardGfx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
                    cardGfx.fill();
                    cardGfx.strokeColor = isCurrent
                        ? new Color(255, 215, 0, 200)
                        : new Color(qColor.r, qColor.g, qColor.b, 160);
                    cardGfx.lineWidth = isCurrent ? 2 : 1;
                    cardGfx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
                    cardGfx.stroke();

                    // 品质色条
                    cardGfx.fillColor = new Color(qColor.r, qColor.g, qColor.b, 180);
                    cardGfx.rect(-cardW / 2, -cardH / 2, 4, cardH);
                    cardGfx.fill();
                }

                // 兵种名
                const nameNode = new Node('CardName');
                nameNode.setParent(card);
                nameNode.setPosition(4, 8, 0);
                const nameUT = nameNode.addComponent(UITransform);
                nameUT.setContentSize(cardW - 10, 18);
                const nameLbl = nameNode.addComponent(Label);
                nameLbl.string = cfg.name.substring(0, 4);
                nameLbl.fontSize = 13;
                nameLbl.color = (isDeployed && !isCurrent)
                    ? new Color(100, 100, 100, 255)
                    : new Color(230, 230, 240, 255);

                // 等级品阶
                const infoNode = new Node('CardInfo');
                infoNode.setParent(card);
                infoNode.setPosition(4, -10, 0);
                const infoUT = infoNode.addComponent(UITransform);
                infoUT.setContentSize(cardW - 10, 16);
                const infoLbl = infoNode.addComponent(Label);
                const qName = QUALITY_NAMES[u.quality] || u.quality;
                infoLbl.string = `Lv${u.level} ${qName}`;
                infoLbl.fontSize = 11;
                infoLbl.color = (isDeployed && !isCurrent)
                    ? new Color(80, 80, 80, 255)
                    : new Color(qColor.r, qColor.g, qColor.b, 255);

                // 标记
                if (isCurrent) {
                    const markNode = new Node('CurrentMark');
                    markNode.setParent(card);
                    markNode.setPosition(cardW / 2 - 18, cardH / 2 - 10, 0);
                    const markUT = markNode.addComponent(UITransform);
                    markUT.setContentSize(30, 14);
                    const markLbl = markNode.addComponent(Label);
                    markLbl.string = '当前';
                    markLbl.fontSize = 10;
                    markLbl.color = new Color(255, 215, 0, 255);
                } else if (isDeployed) {
                    const markNode = new Node('DeployedMark');
                    markNode.setParent(card);
                    markNode.setPosition(cardW / 2 - 22, cardH / 2 - 10, 0);
                    const markUT = markNode.addComponent(UITransform);
                    markUT.setContentSize(36, 14);
                    const markLbl = markNode.addComponent(Label);
                    markLbl.string = '已上阵';
                    markLbl.fontSize = 10;
                    markLbl.color = new Color(100, 100, 100, 255);
                }

                // 可选兵种点击事件
                if (!isDeployed || isCurrent) {
                    card.on(Node.EventType.TOUCH_END, () => {
                        if (isCurrent) {
                            this.closeReplacePanel();
                            return;
                        }
                        this.replaceUnit(replacedConfigId, u.configId, u.uid, gridRow, gridCol);
                    });
                }
            }

            const rows = Math.ceil(raceUnits.length / cols);
            currentY -= rows * (cardH + cardGapY) + 10;
        }

        // 取消按钮
        const cancelBtn = new Node('CancelBtn');
        cancelBtn.setParent(panel);
        cancelBtn.setPosition(0, -270, 0);
        const cancelUT = cancelBtn.addComponent(UITransform);
        cancelUT.setContentSize(120, 36);
        const cancelGfx = cancelBtn.addComponent(Graphics);
        cancelGfx.fillColor = new Color(60, 70, 90, 220);
        cancelGfx.roundRect(-60, -18, 120, 36, 6);
        cancelGfx.fill();
        cancelGfx.strokeColor = new Color(120, 140, 180, 120);
        cancelGfx.lineWidth = 1;
        cancelGfx.roundRect(-60, -18, 120, 36, 6);
        cancelGfx.stroke();
        const cancelLbl = new Node('CancelText');
        cancelLbl.setParent(cancelBtn);
        const cancelLblUT = cancelLbl.addComponent(UITransform);
        cancelLblUT.setContentSize(60, 24);
        const cancelLblC = cancelLbl.addComponent(Label);
        cancelLblC.string = '取消';
        cancelLblC.fontSize = 16;
        cancelLblC.color = new Color(200, 200, 210, 255);
        cancelBtn.on(Node.EventType.TOUCH_END, () => this.closeReplacePanel());

        // 组装
        panel.setParent(mask);
        mask.setParent(this.uiRoot);
        // 递归设置所有子节点的 layer
        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(mask);
        this._replacePanel = mask;

        console.log(`[BattleScene] 替换弹窗打开: 替换 ${replacedConfigId}, 可选 ${sorted.length - deployedIds.size + 1} 种`);
    }

    private replaceUnit(oldConfigId: string, newConfigId: string, newUnitUid: string, gridRow: number, gridCol: number): void {
        const idx = this._currentDeploy.findIndex(e => e.configId === oldConfigId);
        if (idx < 0) { console.warn(`[BattleScene] 未找到旧兵种 ${oldConfigId}`); return; }

        const pm = PlayerManager.instance;
        const unit = pm.getUnit(newUnitUid);
        const count = unit ? LevelSystem.instance.getDeployCount(unit.level) : 1;

        this._currentDeploy[idx] = {
            configId: newConfigId,
            unitUid: newUnitUid,
            count,
            gridRow,
            gridCol,
        };

        console.log(`[BattleScene] 替换: ${oldConfigId} → ${newConfigId} ×${count} @(${gridRow},${gridCol})`);
        this.closeReplacePanel();
        this.onBattleDeploy([...this._currentDeploy]);
    }

    private closeReplacePanel(): void {
        if (this._replacePanel) {
            this._replacePanel.destroy();
            this._replacePanel = null;
        }
    }

    private clearUnitViews(): void {
        if (this._effectMgr) this._effectMgr.clearEffects();
        UnitView.clearViewMap();
        if (this._gridOverlay) { this._gridOverlay.destroy(); this._gridOverlay = null; }
        this._synergyDisplayNodes.forEach(n => { if (n) n.destroy(); });
        this._synergyDisplayNodes = [];
        this._unitViews.forEach(view => {
            if (view && view.node) view.node.destroy();
        });
        this._unitViews.clear();
    }
}
