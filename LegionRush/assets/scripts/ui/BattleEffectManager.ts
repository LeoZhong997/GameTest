/**
 * BattleEffectManager - 战斗特效管理器
 * 管理伤害飘字、治疗飘字、受击闪烁、技能施放脉冲
 * + 近战斩击特效 + 远程弹丸特效
 * 挂载在 BattleField 节点
 */

import { _decorator, Component, Node, Label, Color, Graphics, UITransform, UIOpacity, tween, Vec3, Layers } from 'cc';
import { EventBus } from '../core/EventBus';
import { UnitView } from './UnitView';
import { BattleManager, BattleState } from '../battle/BattleManager';
import { GameConfig } from '../core/GameConfig';

const { ccclass } = _decorator;

const DMG_NORMAL_COLOR = new Color(255, 255, 255, 255);
const DMG_CRIT_COLOR = new Color(255, 215, 0, 255);
const DMG_SKILL_COLOR = new Color(255, 165, 0, 255);
const HEAL_COLOR = new Color(0, 255, 100, 255);

const MAX_FLOATING = 30;
const FLOAT_DURATION = 0.8;
const FLOAT_RISE = 40;

// 近战/远程阈值
const RANGE_THRESHOLD = 2.0;

// 弹丸限制
const MAX_PROJECTILES = 20;
const PROJECTILE_SPEED = 1200; // 像素/秒
const PROJECTILE_RADIUS = 4;

// 斩击参数
const SLASH_DURATION = 0.25;
const MAX_SLASHES = 20;

@ccclass('BattleEffectManager')
export class BattleEffectManager extends Component {
    private _unitViews: Map<string, UnitView> = new Map();
    private _activeFloats: Node[] = [];
    private _activeProjectiles: Node[] = [];
    private _activeSlashes: Node[] = [];

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

    private onAttack(data: { attacker: string; target: string; damage: number; isCrit: boolean; range: number }): void {
        const attackerView = this._unitViews.get(data.attacker);
        const targetView = this._unitViews.get(data.target);
        const targetPos = targetView ? targetView.node.position : null;

        // 攻击特效
        if (targetPos && attackerView) {
            if (data.range > RANGE_THRESHOLD) {
                // 远程：弹丸
                const attackerPos = attackerView.node.position;
                this.spawnProjectile(attackerPos.x, attackerPos.y, targetPos.x, targetPos.y, data.isCrit);
            } else {
                // 近战：斩击弧
                this.spawnSlash(targetPos.x, targetPos.y, data.isCrit);
            }
        }

        // 伤害飘字
        if (targetPos) {
            const text = data.isCrit ? `暴击 ${Math.floor(data.damage)}` : `${Math.floor(data.damage)}`;
            const color = data.isCrit ? DMG_CRIT_COLOR : DMG_NORMAL_COLOR;
            const fontSize = data.isCrit ? 18 : 14;
            this.spawnFloatingText(targetPos.x, targetPos.y + 20, text, color, fontSize);
        }
        if (targetView) targetView.flashHit();
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

    private spawnFloatingText(x: number, y: number, text: string, color: Color, rawFontSize: number): void {
        const fontSize = this.mapFS(rawFontSize);
        if (this._activeFloats.length >= MAX_FLOATING) {
            const oldest = this._activeFloats.shift();
            if (oldest && oldest.isValid) oldest.destroy();
        }

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
        node.layer = Layers.Enum.UI_2D;
        this._activeFloats.push(node);

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

    // ---- Melee slash effect ----

    private spawnSlash(x: number, y: number, isCrit: boolean): void {
        if (this._activeSlashes.length >= MAX_SLASHES) {
            const oldest = this._activeSlashes.shift();
            if (oldest && oldest.isValid) oldest.destroy();
        }

        const node = new Node('Slash');
        const ut = node.addComponent(UITransform);
        ut.setContentSize(60, 60);
        ut.setAnchorPoint(0.5, 0.5);
        // 随机角度让斩击方向多样
        const angle = Math.random() * 360;
        node.setPosition(x, y, 0);
        node.setRotationFromEuler(0, 0, angle);

        const g = node.addComponent(Graphics);
        const slashColor = isCrit
            ? new Color(255, 200, 50, 255)
            : new Color(200, 220, 255, 220);

        // 画两条交叉弧线模拟斩击
        g.strokeColor = slashColor;
        g.lineWidth = isCrit ? 4 : 2.5;
        g.lineCap = Graphics.LineCap.ROUND;

        // 弧线1
        const r1 = isCrit ? 22 : 16;
        g.arc(0, 0, r1, -0.8, 0.8, false);
        g.stroke();

        // 弧线2（反向）
        g.strokeColor = new Color(slashColor.r, slashColor.g, slashColor.b, slashColor.a * 0.6);
        g.lineWidth = isCrit ? 3 : 2;
        g.arc(0, 0, r1 * 0.7, Math.PI - 0.6, Math.PI + 0.6, false);
        g.stroke();

        const opacity = node.addComponent(UIOpacity);

        this.node.addChild(node);
        node.layer = Layers.Enum.UI_2D;
        this._activeSlashes.push(node);

        // 缩放 + 旋转 + 淡出
        const scaleTo = isCrit ? 2.0 : 1.5;
        const rotExtra = isCrit ? 45 : 30;
        tween(node)
            .to(SLASH_DURATION, {
                scale: new Vec3(scaleTo, scaleTo, 1),
            }, { easing: 'sineOut' })
            .start();

        // 同时旋转
        tween(node)
            .to(SLASH_DURATION, {
                eulerAngles: new Vec3(0, 0, angle + rotExtra),
            })
            .start();

        tween(opacity)
            .to(SLASH_DURATION, { opacity: 0 })
            .call(() => {
                const idx = this._activeSlashes.indexOf(node);
                if (idx >= 0) this._activeSlashes.splice(idx, 1);
                if (node.isValid) node.destroy();
            })
            .start();
    }

    // ---- Ranged projectile effect ----

    private spawnProjectile(fromX: number, fromY: number, toX: number, toY: number, isCrit: boolean): void {
        if (this._activeProjectiles.length >= MAX_PROJECTILES) {
            const oldest = this._activeProjectiles.shift();
            if (oldest && oldest.isValid) oldest.destroy();
        }

        const dx = toX - fromX;
        const dy = toY - fromY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) return;

        const duration = Math.min(dist / PROJECTILE_SPEED, 0.4);

        const node = new Node('Projectile');
        const ut = node.addComponent(UITransform);
        ut.setContentSize(PROJECTILE_RADIUS * 4, PROJECTILE_RADIUS * 4);
        ut.setAnchorPoint(0.5, 0.5);
        node.setPosition(fromX, fromY, 0);

        const g = node.addComponent(Graphics);
        const projColor = isCrit
            ? new Color(255, 220, 50, 255)
            : new Color(120, 200, 255, 240);

        // 弹丸主体
        g.fillColor = projColor;
        g.circle(0, 0, PROJECTILE_RADIUS);
        g.fill();

        // 发光光晕
        g.fillColor = new Color(projColor.r, projColor.g, projColor.b, 80);
        g.circle(0, 0, PROJECTILE_RADIUS * 2);
        g.fill();

        this.node.addChild(node);
        node.layer = Layers.Enum.UI_2D;
        this._activeProjectiles.push(node);

        // 飞向目标
        tween(node)
            .to(duration, { position: new Vec3(toX, toY, 0) })
            .call(() => {
                const idx = this._activeProjectiles.indexOf(node);
                if (idx >= 0) this._activeProjectiles.splice(idx, 1);
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

        for (const n of this._activeProjectiles) {
            if (n && n.isValid) n.destroy();
        }
        this._activeProjectiles = [];

        for (const n of this._activeSlashes) {
            if (n && n.isValid) n.destroy();
        }
        this._activeSlashes = [];
    }

    private mapFS(raw: number): number {
        const fs = GameConfig.instance.fontSizes;
        if (!fs) return raw;
        if (raw >= 44) return fs.hero;
        if (raw >= 34) return fs.titleLg;
        if (raw >= 26) return fs.title;
        if (raw >= 22) return fs.subtitle;
        if (raw >= 18) return fs.body;
        if (raw >= 14) return fs.small;
        return fs.caption;
    }
}
