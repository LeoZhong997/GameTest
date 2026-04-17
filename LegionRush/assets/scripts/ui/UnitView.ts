/**
 * UnitView - 战斗单位的视觉表现（简化版）
 * 由 BattleScene 纯代码创建，设置引用后 init
 */

import { _decorator, Component, Label, Color, Node, Graphics, UITransform, UIOpacity, tween, Vec3, Vec2, EventTouch } from 'cc';
import { BattleUnit, TeamSide, UnitState } from '../battle/Unit';
import { BattleManager, BattleState } from '../battle/BattleManager';

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

export type UnitShape = 'rect' | 'circle' | 'triangle' | 'hexagon' | 'diamond';

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
        case 'hexagon':
            drawRegularPolygon(gfx, 6, r);
            break;
        case 'diamond':
            gfx.moveTo(0, r);
            gfx.lineTo(r, 0);
            gfx.lineTo(0, -r);
            gfx.lineTo(-r, 0);
            gfx.close();
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
    public energyBarFill: Graphics | null = null;
    public nameLabel: Label = null!;

    private _unit: BattleUnit | null = null;
    private _hpBarWidth: number = 40;
    private _hpBarHeight: number = 5;       // 上半 HP
    private _epBarWidth: number = 40;
    private _epBarHeight: number = 5;       // 下半能量
    private _bodySize: number = 32;
    private _lastColor: Color = new Color(0, 0, 0, 0);
    private _dying: boolean = false;
    private _flashing: boolean = false;
    private _opacity: UIOpacity | null = null;
    private static _viewMap: Map<string, UnitView> = new Map();

    /** LEFT 方九宫格中心坐标（index = row*3+col） */
    private static readonly GRID_CENTERS: Vec2[] = (() => {
        const halfW = 960 * 0.35;
        const centers: Vec2[] = [];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                centers.push(new Vec2(-halfW + (c - 1) * 120, (1 - r) * 160));
            }
        }
        return centers;
    })();

    private _dragging: boolean = false;
    private _dragStartPos: Vec2 = new Vec2();
    private _dragGroupOrigins: Map<string, Vec2> = new Map();
    private _dragOrigCellIdx: number = -1;
    private _dragCellOccupancy: Map<number, string> = new Map();

    init(unit: BattleUnit): void {
        this._unit = unit;
        this._dying = false;

        // 添加 UIOpacity（用于死亡动画）
        this._opacity = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);

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

        // 记录能量条尺寸
        if (this.energyBarFill && this.energyBarFill.node) {
            const t = this.energyBarFill.node.getComponent(UITransform);
            if (t) {
                this._epBarWidth = t.contentSize.width;
                this._epBarHeight = t.contentSize.height;
            }
        }

        this.refresh(unit);

        // 注册视图
        UnitView._viewMap.set(unit.uid, this);

        // 布阵阶段允许拖拽（仅左方单位）
        this.registerDrag();
    }

    refresh(unit: BattleUnit): void {
        if (!this._unit || unit.uid !== this._unit.uid) return;
        this._unit = unit;

        // 拖拽中跳过位置同步，避免和拖拽冲突
        if (!this._dragging) {
            this.node.setPosition(unit.position.x, unit.position.y, 0);
        }

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

        // 能量条（蓝色）
        if (this.energyBarFill) {
            const pct = unit.energyPercent;
            const w = this._epBarWidth * pct;
            const h = this._epBarHeight;
            this.energyBarFill.clear();
            this.energyBarFill.fillColor = new Color(60, 140, 255, 255);
            this.energyBarFill.rect(-this._epBarWidth / 2, -h / 2, w, h);
            this.energyBarFill.fill();
        }

        // 死亡动画
        if (!unit.isAlive) {
            if (!this._dying) {
                this._dying = true;
                this.playDeathAnimation();
            }
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

    /** 受击闪烁：短暂变白后恢复 */
    flashHit(): void {
        if (this._flashing || !this.bodyGraphics || !this._unit) return;
        this._flashing = true;

        const white = new Color(255, 255, 255, 255);
        this.bodyGraphics.clear();
        this.bodyGraphics.fillColor = white;
        drawShape(this.bodyGraphics, this.shapeType, this._bodySize);
        this.bodyGraphics.fill();
        this._lastColor = white;

        // 100ms 后恢复原色
        setTimeout(() => {
            this._flashing = false;
            if (!this._unit || !this.bodyGraphics) return;
            const restore = (this._unit.isStunned || this._unit.isFrozen)
                ? new Color(200, 200, 255, 200)
                : (TEAM_COLORS[this._unit.team] || Color.WHITE);
            this.bodyGraphics.clear();
            this.bodyGraphics.fillColor = restore;
            drawShape(this.bodyGraphics, this.shapeType, this._bodySize);
            this.bodyGraphics.fill();
            this._lastColor = restore;
        }, 100);
    }

    /** 死亡动画：缩小 + 淡出 */
    private playDeathAnimation(): void {
        if (this._opacity) {
            tween(this.node)
                .to(0.4, { scale: new Vec3(0.3, 0.3, 1) }, { easing: 'sineIn' })
                .start();
            tween(this._opacity)
                .to(0.4, { opacity: 0 })
                .call(() => { this.node.active = false; })
                .start();
        } else {
            this.node.active = false;
        }
    }

    /** 清除全局视图注册表（BattleScene 清理时调用） */
    static clearViewMap(): void {
        UnitView._viewMap.clear();
    }

    /** 找到距离 pos 最近的格子索引 */
    private static findNearestCell(pos: { x: number; y: number }): number {
        let bestIdx = 0, bestDist = Infinity;
        for (let i = 0; i < UnitView.GRID_CENTERS.length; i++) {
            const c = UnitView.GRID_CENTERS[i];
            const d = (pos.x - c.x) ** 2 + (pos.y - c.y) ** 2;
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        return bestIdx;
    }

    /** 注册触摸拖拽（仅布阵阶段、仅左方单位） */
    private registerDrag(): void {
        if (!this._unit || this._unit.team !== TeamSide.LEFT) return;
        this.node.on(Node.EventType.TOUCH_START, this.onDragStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onDragMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onDragEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onDragEnd, this);
    }

    private onDragStart(event: EventTouch): void {
        if (BattleManager.instance.state !== BattleState.PREPARING) return;
        if (!this._unit || this._unit.team !== TeamSide.LEFT) return;

        const uiPos = event.getUILocation();
        this._dragStartPos.set(uiPos.x - this.node.position.x, uiPos.y - this.node.position.y);

        // 记录同兵种所有单位的起始位置，标记 dragging
        this._dragGroupOrigins.clear();
        const myConfigId = this._unit.configId;
        for (const [uid, view] of UnitView._viewMap) {
            if (view._unit && view._unit.configId === myConfigId && view._unit.team === TeamSide.LEFT) {
                this._dragGroupOrigins.set(uid, new Vec2(view._unit.position.x, view._unit.position.y));
                view._dragging = true;
                view.node.setSiblingIndex(view.node.parent!.children.length - 1);
            }
        }

        // 记录九宫格当前占位：cellIdx → configId
        this._dragCellOccupancy.clear();
        const seen = new Set<string>();
        for (const view of UnitView._viewMap.values()) {
            if (!view._unit || view._unit.team !== TeamSide.LEFT) continue;
            if (seen.has(view._unit.configId)) continue;
            seen.add(view._unit.configId);
            const center = this.getGroupCenter(view._unit.configId);
            if (center) {
                this._dragCellOccupancy.set(UnitView.findNearestCell(center), view._unit.configId);
            }
        }

        // 记录本组起始格子
        const myCenter = this.getGroupCenter(myConfigId);
        this._dragOrigCellIdx = myCenter ? UnitView.findNearestCell(myCenter) : -1;
    }

    private onDragMove(event: EventTouch): void {
        if (!this._dragging || !this._unit) return;

        const uiPos = event.getUILocation();
        const newX = uiPos.x - this._dragStartPos.x;
        const newY = uiPos.y - this._dragStartPos.y;

        const myStart = this._dragGroupOrigins.get(this._unit.uid);
        if (!myStart) return;
        const deltaX = newX - myStart.x;
        const deltaY = newY - myStart.y;

        for (const [uid, view] of UnitView._viewMap) {
            if (view._unit && view._unit.configId === this._unit.configId && view._unit.team === TeamSide.LEFT) {
                const orig = this._dragGroupOrigins.get(uid);
                if (orig) {
                    view._unit.position.set(orig.x + deltaX, orig.y + deltaY);
                    view.node.setPosition(view._unit.position.x, view._unit.position.y, 0);
                }
            }
        }
    }

    private onDragEnd(_event: EventTouch): void {
        if (!this._dragging || !this._unit) { this.resetGroupDrag(); return; }

        const myConfigId = this._unit.configId;
        const myCenter = this.getGroupCenter(myConfigId);
        if (!myCenter || this._dragOrigCellIdx < 0) { this.resetGroupDrag(); return; }

        const targetCellIdx = UnitView.findNearestCell(myCenter);

        if (targetCellIdx !== this._dragOrigCellIdx) {
            // 目标格子有其他兵种 → 先把对方移到本组原格子
            const occupant = this._dragCellOccupancy.get(targetCellIdx);
            if (occupant && occupant !== myConfigId) {
                this.snapGroupToCell(occupant, this._dragOrigCellIdx);
            }
            // 本组吸附到目标格子
            this.snapGroupToCell(myConfigId, targetCellIdx);
        } else {
            // 放回原位
            this.snapGroupToCell(myConfigId, this._dragOrigCellIdx);
        }

        this.resetGroupDrag();
    }

    /** 将指定兵种组吸附到指定格子（平移整个组，保持内部散布） */
    private snapGroupToCell(configId: string, cellIdx: number): void {
        const cellCenter = UnitView.GRID_CENTERS[cellIdx];
        const groupCenter = this.getGroupCenter(configId);
        if (!groupCenter) return;

        const dx = cellCenter.x - groupCenter.x;
        const dy = cellCenter.y - groupCenter.y;
        for (const view of UnitView._viewMap.values()) {
            if (view._unit && view._unit.configId === configId && view._unit.team === TeamSide.LEFT) {
                view._unit.position.set(view._unit.position.x + dx, view._unit.position.y + dy);
                view.node.setPosition(view._unit.position.x, view._unit.position.y, 0);
            }
        }
    }

    /** 获取某兵种组所有左方单位的中心坐标 */
    private getGroupCenter(configId: string): Vec2 | null {
        let sx = 0, sy = 0, n = 0;
        for (const view of UnitView._viewMap.values()) {
            if (view._unit && view._unit.configId === configId && view._unit.team === TeamSide.LEFT) {
                sx += view._unit.position.x;
                sy += view._unit.position.y;
                n++;
            }
        }
        return n > 0 ? new Vec2(sx / n, sy / n) : null;
    }

    /** 重置拖拽状态 */
    private resetGroupDrag(): void {
        if (this._unit) {
            for (const view of UnitView._viewMap.values()) {
                if (view._unit && view._unit.configId === this._unit.configId && view._unit.team === TeamSide.LEFT) {
                    view._dragging = false;
                }
            }
        }
        this._dragGroupOrigins.clear();
        this._dragCellOccupancy.clear();
        this._dragOrigCellIdx = -1;
    }

    get unit(): BattleUnit | null {
        return this._unit;
    }
}
