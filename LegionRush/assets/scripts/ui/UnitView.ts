/**
 * UnitView - 战斗单位的视觉表现（简化版）
 * 由 BattleScene 纯代码创建，设置引用后 init
 */

import { _decorator, Component, Label, Color, Node, Graphics, UITransform } from 'cc';
import { BattleUnit, TeamSide, UnitState } from '../battle/Unit';

const { ccclass } = _decorator;

const TEAM_COLORS: Record<number, Color> = {
    [TeamSide.LEFT]: new Color(80, 160, 255, 255),
    [TeamSide.RIGHT]: new Color(255, 80, 80, 255),
};

/** 醒目的血条颜色 */
const HP_COLORS = {
    HIGH: new Color(0, 255, 80, 255),     // 鲜绿
    MID: new Color(255, 220, 0, 255),     // 亮黄
    LOW: new Color(255, 50, 50, 255),     // 亮红
};

export type UnitShape = 'rect' | 'circle' | 'triangle' | 'pentagon' | 'hexagon';

/** 绘制正多边形（三角形=3, 五边形=5, 六边形=6） */
function drawRegularPolygon(gfx: Graphics, sides: number, radius: number): void {
    const step = (2 * Math.PI) / sides;
    const start = Math.PI / 2;  // 第一个顶点朝上
    gfx.moveTo(Math.cos(start) * radius, Math.sin(start) * radius);
    for (let i = 1; i <= sides; i++) {
        const a = start + i * step;
        gfx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    gfx.close();
}

/** 绘制指定形状（供 BattleScene 和 UnitView 共用） */
export function drawShape(gfx: Graphics, shape: UnitShape, size: number): void {
    const r = size / 2;
    switch (shape) {
        case 'circle':
            gfx.circle(0, 0, r);
            break;
        case 'rect':
            gfx.rect(-r, -r, size, size);
            break;
        case 'triangle':
            drawRegularPolygon(gfx, 3, r);
            break;
        case 'pentagon':
            drawRegularPolygon(gfx, 5, r);
            break;
        case 'hexagon':
            drawRegularPolygon(gfx, 6, r);
            break;
        default:
            gfx.rect(-r, -r, size, size);
    }
}

@ccclass('UnitView')
export class UnitView extends Component {
    // 由 BattleScene 创建时赋值
    public bodyGraphics: Graphics | null = null;
    public shapeType: UnitShape = 'rect';
    public hpBarNode: Node = null!;
    public hpBarFill: Graphics | null = null;
    public nameLabel: Label = null!;

    private _unit: BattleUnit | null = null;
    private _hpBarWidth: number = 40;
    private _hpBarHeight: number = 10;
    private _bodySize: number = 32;
    private _lastColor: Color = new Color(0, 0, 0, 0);

    init(unit: BattleUnit): void {
        this._unit = unit;

        // 记录身体尺寸（Graphics 重绘用）
        const transform = this.node.getComponent(UITransform);
        if (transform) {
            this._bodySize = transform.contentSize.width;
        }

        // 名称
        if (this.nameLabel) {
            this.nameLabel.string = unit.config.name.substring(0, 3);
        }

        // 记录血条尺寸
        if (this.hpBarFill && this.hpBarFill.node) {
            const t = this.hpBarFill.node.getComponent(UITransform);
            if (t) {
                this._hpBarWidth = t.contentSize.width;
                this._hpBarHeight = t.contentSize.height;
            }
        }

        this.refresh(unit);
    }

    refresh(unit: BattleUnit): void {
        if (!this._unit || unit.uid !== this._unit.uid) return;
        this._unit = unit;

        // 位置同步
        this.node.setPosition(unit.position.x, unit.position.y, 0);

        // 血条（重绘填充宽度 + 颜色）
        if (this.hpBarFill) {
            const pct = unit.hpPercent;
            const w = this._hpBarWidth * pct;
            const h = this._hpBarHeight;
            this.hpBarFill.clear();
            this.hpBarFill.fillColor = pct > 0.6 ? HP_COLORS.HIGH : pct > 0.3 ? HP_COLORS.MID : HP_COLORS.LOW;
            this.hpBarFill.rect(-this._hpBarWidth / 2, -h / 2, w, h);
            this.hpBarFill.fill();
        }

        // 死亡
        if (!unit.isAlive) {
            this.node.active = false;
            return;
        }

        // 攻击状态缩放反馈
        if (unit.state === UnitState.ATTACK) {
            this.node.setScale(1.15, 1.15, 1.0);
        } else if (unit.state === UnitState.CAST_SKILL) {
            this.node.setScale(1.2, 1.2, 1.0);
        } else {
            this.node.setScale(1.0, 1.0, 1.0);
        }

        // 身体颜色
        const targetColor = (unit.isStunned || unit.isFrozen)
            ? new Color(200, 200, 255, 200)
            : (TEAM_COLORS[unit.team] || Color.WHITE);

        if (this.bodyGraphics) {
            const lc = this._lastColor;
            if (lc.r !== targetColor.r || lc.g !== targetColor.g
                || lc.b !== targetColor.b || lc.a !== targetColor.a) {
                this.bodyGraphics.clear();
                this.bodyGraphics.fillColor = targetColor;
                drawShape(this.bodyGraphics, this.shapeType, this._bodySize);
                this.bodyGraphics.fill();
                this._lastColor = targetColor;
            }
        }
    }

    get unit(): BattleUnit | null {
        return this._unit;
    }
}
