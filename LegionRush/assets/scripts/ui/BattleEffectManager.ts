/**
 * BattleEffectManager - 战斗特效管理器
 * 管理伤害飘字、治疗飘字、受击闪烁、技能施放脉冲
 * 挂载在 BattleField 节点
 */

import { _decorator, Component, Node, Label, Color, UITransform, UIOpacity, tween, Vec3 } from 'cc';
import { EventBus } from '../core/EventBus';
import { UnitView } from './UnitView';
import { BattleManager, BattleState } from '../battle/BattleManager';

const { ccclass } = _decorator;

const DMG_NORMAL_COLOR = new Color(255, 255, 255, 255);
const DMG_CRIT_COLOR = new Color(255, 215, 0, 255);
const DMG_SKILL_COLOR = new Color(255, 165, 0, 255);
const HEAL_COLOR = new Color(0, 255, 100, 255);

const MAX_FLOATING = 30;
const FLOAT_DURATION = 0.8;
const FLOAT_RISE = 40;

@ccclass('BattleEffectManager')
export class BattleEffectManager extends Component {
    private _unitViews: Map<string, UnitView> = new Map();
    private _activeFloats: Node[] = [];

    onLoad() {
        EventBus.instance.on('battle:attack', this.onAttack, this);
        EventBus.instance.on('battle:skill_hit', this.onSkillHit, this);
        EventBus.instance.on('battle:heal', this.onHeal, this);
        EventBus.instance.on('battle:skill', this.onSkillCast, this);
    }

    onDestroy() {
        EventBus.instance.off('battle:attack', this.onAttack, this);
        EventBus.instance.off('battle:skill_hit', this.onSkillHit, this);
        EventBus.instance.off('battle:heal', this.onHeal, this);
        EventBus.instance.off('battle:skill', this.onSkillCast, this);
    }

    /** 由 BattleScene 传入 unitViews 引用 */
    setUnitViews(views: Map<string, UnitView>): void {
        this._unitViews = views;
    }

    // ---- Event handlers ----

    private onAttack(data: { attacker: string; target: string; damage: number; isCrit: boolean }): void {
        const view = this._unitViews.get(data.target);
        const pos = view ? view.node.position : null;
        if (pos) {
            const text = data.isCrit ? `暴击 ${Math.floor(data.damage)}` : `${Math.floor(data.damage)}`;
            const color = data.isCrit ? DMG_CRIT_COLOR : DMG_NORMAL_COLOR;
            const fontSize = data.isCrit ? 18 : 14;
            this.spawnFloatingText(pos.x, pos.y + 20, text, color, fontSize);
        }
        if (view) view.flashHit();
    }

    private onSkillHit(data: { caster: string; target: string; damage: number; isCrit: boolean }): void {
        const view = this._unitViews.get(data.target);
        const pos = view ? view.node.position : null;
        if (pos) {
            const text = data.isCrit ? `暴击 ${Math.floor(data.damage)}` : `${Math.floor(data.damage)}`;
            const color = data.isCrit ? DMG_CRIT_COLOR : DMG_SKILL_COLOR;
            const fontSize = data.isCrit ? 18 : 16;
            this.spawnFloatingText(pos.x, pos.y + 20, text, color, fontSize);
        }
        if (view) view.flashHit();
    }

    private onHeal(data: { caster: string; target: string; amount: number }): void {
        const view = this._unitViews.get(data.target);
        const pos = view ? view.node.position : null;
        if (pos) {
            this.spawnFloatingText(pos.x, pos.y + 20, `+${Math.floor(data.amount)}`, HEAL_COLOR, 14);
        }
    }

    private onSkillCast(data: { caster: string; skillId: string; skillName: string }): void {
        const view = this._unitViews.get(data.caster);
        if (view && view.node.active) {
            this.playCastPulse(view);
        }
    }

    // ---- Floating text ----

    private spawnFloatingText(x: number, y: number, text: string, color: Color, fontSize: number): void {
        // 限制同时存在的飘字数量
        if (this._activeFloats.length >= MAX_FLOATING) {
            const oldest = this._activeFloats.shift();
            if (oldest && oldest.isValid) oldest.destroy();
        }

        // 随机水平偏移避免重叠
        const offsetX = (Math.random() - 0.5) * 20;

        const node = new Node('DmgNum');
        const ut = node.addComponent(UITransform);
        ut.setContentSize(100, 24);
        ut.setAnchorPoint(0.5, 0.5);
        node.setPosition(x + offsetX, y, 0);

        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.isBold = true;
        label.color = color;
        label.enableOutline = true;
        label.outlineColor = new Color(0, 0, 0, 180);
        label.outlineWidth = 2;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;

        const opacity = node.addComponent(UIOpacity);

        this.node.addChild(node);
        this._activeFloats.push(node);

        // 动画：上移 + 淡出
        tween(node)
            .to(FLOAT_DURATION, { position: new Vec3(x + offsetX, y + FLOAT_RISE, 0) })
            .start();
        tween(opacity)
            .to(FLOAT_DURATION, { opacity: 0 })
            .call(() => {
                const idx = this._activeFloats.indexOf(node);
                if (idx >= 0) this._activeFloats.splice(idx, 1);
                if (node.isValid) node.destroy();
            })
            .start();
    }

    // ---- Cast pulse ----

    private playCastPulse(view: UnitView): void {
        const node = view.node;
        if (!node.isValid) return;
        tween(node)
            .to(0.15, { scale: new Vec3(1.4, 1.4, 1) }, { easing: 'sineOut' })
            .to(0.15, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'sineIn' })
            .start();
    }

    /** 清理所有活跃特效 */
    clearEffects(): void {
        for (const n of this._activeFloats) {
            if (n && n.isValid) n.destroy();
        }
        this._activeFloats = [];
    }
}
