/**
 * UnitAI - 战斗单位 AI
 * 自动寻敌、移动、攻击
 */

import { BattleUnit, UnitState } from './Unit';

/** AI 行为配置（可按 role 定制） */
interface AIBehavior {
    targetPriority: 'nearest' | 'lowestHp' | 'highestAtk';
    chaseRange: number;       // 追击距离（超出则换目标）
    aggressiveRange: number;  // 主动进攻距离
}

const DEFAULT_BEHAVIOR: AIBehavior = {
    targetPriority: 'nearest',
    chaseRange: 400,
    aggressiveRange: 300,
};

export class UnitAI {
    private _unit: BattleUnit;
    private _behavior: AIBehavior;

    constructor(unit: BattleUnit, behavior?: Partial<AIBehavior>) {
        this._unit = unit;
        this._behavior = { ...DEFAULT_BEHAVIOR, ...behavior };
    }

    /** 查找最近敌人 */
    findNearestEnemy(allUnits: BattleUnit[]): BattleUnit | null {
        let nearest: BattleUnit | null = null;
        let minDist = Infinity;

        for (const other of allUnits) {
            if (!other.isAlive || other.team === this._unit.team) continue;
            const dist = this._unit.distanceTo(other);
            if (dist < minDist) {
                minDist = dist;
                nearest = other;
            }
        }
        return nearest;
    }

    /** 查找血量最低敌人 */
    findLowestHpEnemy(allUnits: BattleUnit[]): BattleUnit | null {
        let target: BattleUnit | null = null;
        let lowestRatio = Infinity;

        for (const other of allUnits) {
            if (!other.isAlive || other.team === this._unit.team) continue;
            if (other.hpPercent < lowestRatio) {
                lowestRatio = other.hpPercent;
                target = other;
            }
        }
        return target;
    }

    /** 移向目标 */
    moveToward(target: BattleUnit, dt: number): void {
        if (!this._unit.canMove) return;

        const dx = target.position.x - this._unit.position.x;
        const dy = target.position.y - this._unit.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= this._unit.range) return; // 已在攻击范围

        const speed = this._unit.effectiveSpeed * dt;
        const nx = dx / dist;
        const ny = dy / dist;

        this._unit.position.x += nx * speed;
        this._unit.position.y += ny * speed;
    }

    /** 是否在攻击距离内 */
    canAttackTarget(): boolean {
        if (!this._unit.target || !this._unit.target.isAlive) return false;
        return this._unit.distanceTo(this._unit.target) <= this._unit.range;
    }

    /** 核心 AI 更新 - 每帧调用 */
    update(dt: number, allUnits: BattleUnit[]): void {
        if (!this._unit.canAct) {
            this._unit.state = UnitState.IDLE;
            return;
        }

        // 寻找/更新目标
        if (!this._unit.target || !this._unit.target.isAlive) {
            this._unit.target = this.findNearestEnemy(allUnits);
            if (!this._unit.target) {
                this._unit.state = UnitState.IDLE;
                return;
            }
        }

        // 目标距离过远则重新选择
        if (this._unit.distanceTo(this._unit.target) > this._behavior.chaseRange) {
            const nearer = this.findNearestEnemy(allUnits);
            if (nearer && this._unit.distanceTo(nearer) < this._unit.distanceTo(this._unit.target)) {
                this._unit.target = nearer;
            }
        }

        // 判断攻击/移动
        if (this.canAttackTarget()) {
            this._unit.state = UnitState.ATTACK;
        } else {
            this._unit.state = UnitState.MOVE;
            this.moveToward(this._unit.target, dt);
        }
    }
}
