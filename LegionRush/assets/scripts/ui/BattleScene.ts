/**
 * BattleScene - 战斗场景主控制器
 * 挂载在 Canvas 节点，自动查找子节点，纯代码创建单位视图
 * 流程：加载配置 → 显示布阵界面 → 玩家确认 → 创建单位 → 开战
 */

import { _decorator, Component, Node, resources, JsonAsset, UITransform, Label, Color, Graphics } from 'cc';
import { BattleManager, BattleConfig, BattleReport } from '../battle/BattleManager';
import { BattleUnit, TeamSide, GameConstants } from '../battle/Unit';
import { UnitConfig, Quality } from '../models/UnitData';
import { SkillConfig } from '../models/SkillData';
import { EventBus } from '../core/EventBus';
import { UnitView, UnitShape, drawShape } from './UnitView';
import { BattleEffectManager } from './BattleEffectManager';
import { FormationType } from '../battle/Formation';

const { ccclass } = _decorator;

/** 玩家布阵数据（由 DeploymentUI 发出） */
interface DeployEntry {
    configId: string;
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
    private _skillConfigs: Map<string, SkillConfig> = new Map();
    private _running: boolean = false;

    onLoad() {
        this.battleField = this.node.getChildByName('BattleField')!;
        this.uiRoot = this.node.getChildByName('UIRoot')!;

        if (!this.battleField) console.error('[BattleScene] 未找到 BattleField 子节点');
        if (!this.uiRoot) console.error('[BattleScene] 未找到 UIRoot 子节点');

        // 特效管理器挂载在 BattleField 上
        this._effectMgr = this.battleField.addComponent(BattleEffectManager);

        EventBus.instance.on('battle:start', this.onBattleStart, this);
        EventBus.instance.on('battle:end', this.onBattleEnd, this);
        EventBus.instance.on('battle:restart', this.onRestart, this);
        EventBus.instance.on('battle:start_request', this.onStartRequest, this);
        EventBus.instance.on('battle:deploy', this.onBattleDeploy, this);

        this.loadConfigs();
    }

    private async loadConfigs(): Promise<void> {
        try {
            // 加载全局常量
            const constantsAsset = await this.loadJson('configs/constants');
            if (constantsAsset) {
                BattleUnit.initConstants(constantsAsset as GameConstants);
            }

            // 加载兵种
            const unitsAsset = await this.loadJson('configs/units');
            if (unitsAsset) {
                for (const [id, cfg] of Object.entries(unitsAsset)) {
                    this._unitConfigs.set(id, cfg as UnitConfig);
                }
            }

            // 加载技能
            const skillsAsset = await this.loadJson('configs/skills');
            if (skillsAsset) {
                const skills: SkillConfig[] = Object.values(skillsAsset);
                skills.forEach(s => this._skillConfigs.set(s.id, s));
                this._bm.registerSkills(skills);
                BattleUnit.initSkillConfigs(this._skillConfigs);
            }

            console.log(`[BattleScene] 配置加载完成: ${this._unitConfigs.size} 兵种, ${this._skillConfigs.size} 技能`);

            // 通知 DeploymentUI 配置已就绪
            EventBus.instance.emit('deployment:ready', this._unitConfigs);
        } catch (e) {
            console.error('[BattleScene] 配置加载失败:', e);
        }
    }

    private loadJson(path: string): Promise<any> {
        return new Promise((resolve) => {
            resources.load(path, JsonAsset, (err, asset) => {
                if (err) {
                    console.warn(`[BattleScene] 加载 ${path} 失败: ${err.message}`);
                    resolve(null);
                    return;
                }
                resolve(asset!.json);
            });
        });
    }

    /** 收到玩家布阵数据，创建单位并展示阵型 */
    private onBattleDeploy(entries: DeployEntry[]): void {
        const leftUnits = entries.map(e => {
            const cfg = this._unitConfigs.get(e.configId);
            return { config: cfg!, level: 5, quality: Quality.BLUE, count: e.count, gridRow: e.gridRow, gridCol: e.gridCol };
        }).filter(u => u.config);

        // 右方（AI）：5 个角色各随机选一个种族，组成十字阵
        const roles: string[] = ['tank', 'melee', 'ranged', 'support', 'assassin'];
        const races: string[] = ['human', 'beast', 'spirit', 'demon'];
        const allConfigs = Array.from(this._unitConfigs.values());
        const crossPositions = [
            { row: 0, col: 1 }, // 上
            { row: 1, col: 0 }, // 左
            { row: 1, col: 1 }, // 中
            { row: 1, col: 2 }, // 右
            { row: 2, col: 1 }, // 下
        ];
        const rightUnits: { config: UnitConfig; level: number; quality: Quality; count: number; gridRow: number; gridCol: number }[] = [];
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

        const config: BattleConfig = {
            leftFormation: FormationType.DEFAULT,
            rightFormation: FormationType.DEFAULT,
            leftUnits,
            rightUnits,
            timeLimit: 30,
        };

        this._bm.prepareBattle(config);
        this.createUnitViews();
    }

    update(dt: number) {
        if (!this._running) return;
        this._bm.update(dt);
        this.syncUnitViews();
    }

    onDestroy() {
        EventBus.instance.off('battle:start', this.onBattleStart, this);
        EventBus.instance.off('battle:end', this.onBattleEnd, this);
        EventBus.instance.off('battle:restart', this.onRestart, this);
        EventBus.instance.off('battle:start_request', this.onStartRequest, this);
        EventBus.instance.off('battle:deploy', this.onBattleDeploy, this);
    }

    private onBattleStart(data: any): void {
        console.log(`[BattleScene] 战斗开始: ${data.leftCount} vs ${data.rightCount}`);
        this._running = true;
        this.createUnitViews();
    }

    private onBattleEnd(_report: BattleReport): void {
        this._running = false;
    }

    private onRestart(): void {
        this.clearUnitViews();
        EventBus.instance.emit('deployment:ready', this._unitConfigs);
    }

    private onStartRequest(): void {
        this._bm.beginBattle();
    }

    // --- 单位视图：纯代码创建 ---

    private createUnitViews(): void {
        this.clearUnitViews();
        if (!this.battleField) return;

        for (const unit of this._bm.allUnits) {
            const view = this.createUnitNode(unit);
            this._unitViews.set(unit.uid, view);
        }

        // 同步给特效管理器
        if (this._effectMgr) {
            this._effectMgr.setUnitViews(this._unitViews);
        }
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

        // 血条+能量条：同一区域，上半HP下半能量
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

        // HP 填充（上半，高度 halfH）
        const hpFill = new Node('HpFill');
        hpFill.setParent(node);
        const hpFillT = hpFill.addComponent(UITransform);
        hpFillT.setContentSize(hpWidth, halfH);
        hpFill.setPosition(0, barY + halfH / 2, 0);
        const hpFillG = hpFill.addComponent(Graphics);
        hpFillG.fillColor = new Color(0, 255, 80, 255);
        hpFillG.rect(-hpWidth / 2, -halfH / 2, hpWidth, halfH);
        hpFillG.fill();

        // 能量填充（下半，高度 halfH）
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
        this._unitViews.forEach(view => {
            if (view && view.node) view.node.destroy();
        });
        this._unitViews.clear();
    }
}
