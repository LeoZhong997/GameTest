/**
 * BattleScene - 战斗场景主控制器
 * 挂载在 Canvas 节点，自动查找子节点，纯代码创建单位视图
 */

import { _decorator, Component, Node, resources, JsonAsset, UITransform, Label, Color, Vec3, Graphics } from 'cc';
import { BattleManager, BattleConfig, BattleState, BattleReport } from '../battle/BattleManager';
import { BattleUnit, TeamSide } from '../battle/Unit';
import { UnitConfig, Quality } from '../models/UnitData';
import { SkillConfig } from '../models/SkillData';
import { EventBus } from '../core/EventBus';
import { UnitView, UnitShape, drawShape } from './UnitView';
import { Formation, FormationType } from '../battle/Formation';

const { ccclass } = _decorator;

@ccclass('BattleScene')
export class BattleScene extends Component {
    private battleField: Node = null!;
    private uiRoot: Node = null!;
    private _bm: BattleManager = BattleManager.instance;
    private _unitViews: Map<string, UnitView> = new Map();
    private _unitConfigs: Map<string, UnitConfig> = new Map();
    private _skillConfigs: Map<string, SkillConfig> = new Map();
    private _running: boolean = false;

    onLoad() {
        // 自动查找子节点
        this.battleField = this.node.getChildByName('BattleField')!;
        this.uiRoot = this.node.getChildByName('UIRoot')!;

        if (!this.battleField) console.error('[BattleScene] 未找到 BattleField 子节点');
        if (!this.uiRoot) console.error('[BattleScene] 未找到 UIRoot 子节点');

        // 注册事件
        EventBus.instance.on('battle:start', this.onBattleStart, this);
        EventBus.instance.on('battle:end', this.onBattleEnd, this);
        EventBus.instance.on('battle:restart', this.onRestart, this);
        EventBus.instance.on('battle:start_request', this.onStartRequest, this);

        this.loadConfigs();
    }

    /** 加载配置表 */
    private async loadConfigs(): Promise<void> {
        try {
            const unitsAsset = await this.loadJson('configs/units');
            if (unitsAsset) {
                for (const [id, cfg] of Object.entries(unitsAsset)) {
                    this._unitConfigs.set(id, cfg as UnitConfig);
                }
            }

            const skillsAsset = await this.loadJson('configs/skills');
            if (skillsAsset) {
                const skills: SkillConfig[] = Object.values(skillsAsset);
                skills.forEach(s => this._skillConfigs.set(s.id, s));
                this._bm.registerSkills(skills);
            }

            console.log(`[BattleScene] 配置加载完成: ${this._unitConfigs.size} 兵种, ${this._skillConfigs.size} 技能`);
            this.setupFormation();        } catch (e) {
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

    /** 布阵：创建单位并展示阵型（不开始战斗） */
    private setupFormation(): void {
        const cavalry = this._unitConfigs.get('cavalry');
        const ranged = this._unitConfigs.get('ranged');
        const warrior = this._unitConfigs.get('warrior');
        const support = this._unitConfigs.get('support');
        const mage = this._unitConfigs.get('mage');
        const tank = this._unitConfigs.get('tank');

        if (!cavalry || !tank) {
            console.warn('[BattleScene] 缺少兵种配置，跳过测试战斗');
            return;
        }

        const config: BattleConfig = {
            leftFormation: FormationType.DEFAULT,
            rightFormation: FormationType.DEFAULT,
            leftUnits: [
                { config: cavalry, level: 5, quality: Quality.BLUE, count: 5 },
                { config: ranged!, level: 5, quality: Quality.BLUE, count: 5 },
                { config: warrior!, level: 5, quality: Quality.GREEN, count: 5 },
                { config: support!, level: 5, quality: Quality.GREEN, count: 5 },
                { config: mage!, level: 5, quality: Quality.BLUE, count: 5 },
            ],
            rightUnits: [
                { config: tank, level: 5, quality: Quality.BLUE, count: 5 },
                { config: cavalry, level: 5, quality: Quality.BLUE, count: 5 },
                { config: ranged!, level: 5, quality: Quality.BLUE, count: 5 },
                { config: mage!, level: 5, quality: Quality.BLUE, count: 5 },
                { config: support!, level: 5, quality: Quality.GREEN, count: 5 },
            ],
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
    }

    // --- 事件回调 ---

    private onBattleStart(data: any): void {
        console.log(`[BattleScene] 战斗开始: ${data.leftCount} vs ${data.rightCount}`);
        this._running = true;
        this.createUnitViews();
    }

    private onBattleEnd(report: BattleReport): void {
        this._running = false;
    }

    private onRestart(): void {
        this.clearUnitViews();
        this.setupFormation();
    }

    /** 收到开战请求 */
    private onStartRequest(): void {
        this._bm.beginBattle();
    }

    // --- 单位视图：纯代码创建 ---

    private createUnitViews(): void {
        this.clearUnitViews();
        if (!this.battleField) return;

        for (const unit of this._bm.allUnits) {
            const node = this.createUnitNode(unit);
            this._unitViews.set(unit.uid, node);
        }
    }

    /** 根据角色获取单位外观配置 */
    private getUnitStyle(role: string): { size: number; shape: UnitShape } {
        switch (role) {
            case 'tank':    return { size: 28, shape: 'rect' };       // 坦克：方形
            case 'cavalry': return { size: 28, shape: 'triangle' };   // 骑兵：三角形
            case 'ranged':  return { size: 28, shape: 'circle' };     // 远程：圆形
            case 'mage':    return { size: 28, shape: 'pentagon' };   // 法师：五边形
            case 'support': return { size: 28, shape: 'hexagon' };    // 辅助：六边形
            case 'damage':  return { size: 28, shape: 'rect' };       // 输出：方形
            default:        return { size: 28, shape: 'rect' };
        }
    }

    /** 纯代码创建一个单位节点（不依赖 Prefab） */
    private createUnitNode(unit: BattleUnit): UnitView {
        const style = this.getUnitStyle(unit.config.role);
        const hpWidth = style.size + 20;
        const hpHeight = 10;
        const teamColor = unit.team === TeamSide.LEFT
            ? new Color(80, 160, 255, 255)
            : new Color(255, 80, 80, 255);

        const node = new Node(`U_${unit.config.name}_${unit.uid}`);
        node.addComponent(UITransform).contentSize.set(style.size, style.size);

        // 身体：用 Graphics 绘制（方形/圆形/三角形/五边形/六边形）
        let bodyGraphics: Graphics | null = null;

        bodyGraphics = node.addComponent(Graphics);
        bodyGraphics.fillColor = teamColor;
        drawShape(bodyGraphics, style.shape, style.size);
        bodyGraphics.fill();

        // HP 边框（黑色外框，让血条更醒目）
        const hpBorder = new Node('HpBorder');
        hpBorder.setParent(node);
        const hpBorderT = hpBorder.addComponent(UITransform);
        hpBorderT.contentSize.set(hpWidth + 4, hpHeight + 4);
        hpBorder.setPosition(0, style.size / 2 + 10, 0);
        const hpBorderG = hpBorder.addComponent(Graphics);
        hpBorderG.fillColor = new Color(0, 0, 0, 255);
        hpBorderG.rect(-(hpWidth + 4) / 2, -(hpHeight + 4) / 2, hpWidth + 4, hpHeight + 4);
        hpBorderG.fill();

        // HP 背景（深灰底）
        const hpBg = new Node('HpBg');
        hpBg.setParent(node);
        const hpBgT = hpBg.addComponent(UITransform);
        hpBgT.contentSize.set(hpWidth, hpHeight);
        hpBg.setPosition(0, style.size / 2 + 10, 0);
        const hpBgG = hpBg.addComponent(Graphics);
        hpBgG.fillColor = new Color(40, 40, 40, 255);
        hpBgG.rect(-hpWidth / 2, -hpHeight / 2, hpWidth, hpHeight);
        hpBgG.fill();

        // HP 填充（Graphics，动态宽度）
        const hpFill = new Node('HpFill');
        hpFill.setParent(node);
        const hpFillT = hpFill.addComponent(UITransform);
        hpFillT.contentSize.set(hpWidth, hpHeight);
        hpFill.setPosition(0, style.size / 2 + 10, 0);
        const hpFillG = hpFill.addComponent(Graphics);
        hpFillG.fillColor = new Color(0, 255, 80, 255);
        hpFillG.rect(-hpWidth / 2, -hpHeight / 2, hpWidth, hpHeight);
        hpFillG.fill();

        // 名称 Label
        const nameNode = new Node('Name');
        nameNode.setParent(node);
        nameNode.setPosition(0, -(style.size / 2 + 16), 0);
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = unit.config.name.substring(0, 3);
        nameLabel.fontSize = 12;
        nameLabel.color = new Color(255, 255, 255, 255);

        // 挂载 UnitView 组件
        const view = node.addComponent(UnitView);
        view.bodyGraphics = bodyGraphics;
        view.shapeType = style.shape;
        view.hpBarNode = hpBg;
        view.hpBarFill = hpFillG;
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
        this._unitViews.forEach(view => {
            if (view && view.node) view.node.destroy();
        });
        this._unitViews.clear();
    }
}
