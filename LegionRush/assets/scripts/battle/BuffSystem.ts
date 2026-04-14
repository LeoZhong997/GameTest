/**
 * BuffSystem - Buff/Debuff/控制效果管理
 */

import { BattleUnit } from './Unit';
import { ControlType } from '../models/SkillData';

export interface Buff {
    type: 'buff' | 'debuff' | 'control';
    stat?: string;             // 影响的属性名
    value: number;             // 百分比值（正=增益，负=减益）
    duration: number;          // 持续时间（秒）
    source: string;            // 来源标识
    controlType?: ControlType;
    remainingTime: number;     // 剩余时间（运行时）
}

export class BuffSystem {
    private _unit: BattleUnit;
    private _buffs: Buff[] = [];

    constructor(unit: BattleUnit) {
        this._unit = unit;
    }

    /** 添加一个 Buff */
    addBuff(buff: Omit<Buff, 'remainingTime'>): void {
        // 同类 Buff 刷新而非叠加
        const existing = this._buffs.find(b =>
            b.type === buff.type && b.source === buff.source &&
            b.controlType === buff.controlType
        );
        if (existing) {
            existing.remainingTime = buff.duration;
            existing.value = buff.value;
            return;
        }

        this._buffs.push({ ...buff, remainingTime: buff.duration });
    }

    /** 每帧更新 */
    update(dt: number): void {
        if (this._buffs.length === 0) return;

        const expired: Buff[] = [];

        for (const buff of this._buffs) {
            buff.remainingTime -= dt;
            if (buff.remainingTime <= 0) {
                expired.push(buff);
            }
        }

        for (const buff of expired) {
            this.removeBuffEffect(buff);
            const idx = this._buffs.indexOf(buff);
            if (idx >= 0) this._buffs.splice(idx, 1);
        }
    }

    /** 移除 Buff 效果（恢复状态） */
    private removeBuffEffect(buff: Buff): void {
        if (buff.type === 'control') {
            switch (buff.controlType) {
                case ControlType.STUN: this._unit.isStunned = false; break;
                case ControlType.FEAR: this._unit.isFeared = false; break;
                case ControlType.FREEZE: this._unit.isFrozen = false; break;
                case ControlType.SLOW:
                    this._unit.isSlowed = false;
                    this._unit.slowFactor = 1.0;
                    break;
            }
        }
    }

    /** 攻击力乘数（综合所有 buff/debuff） */
    getAtkMultiplier(): number {
        let mult = 1.0;
        for (const b of this._buffs) {
            if (b.stat === 'atk') {
                mult *= (1 + b.value / 100);
            }
        }
        return mult;
    }

    /** 防御力乘数 */
    getDefMultiplier(): number {
        let mult = 1.0;
        for (const b of this._buffs) {
            if (b.stat === 'def') {
                mult *= (1 + b.value / 100);
            }
        }
        return mult;
    }

    get buffs(): readonly Buff[] {
        return this._buffs;
    }

    /** 清除所有 Buff */
    clear(): void {
        for (const b of this._buffs) {
            this.removeBuffEffect(b);
        }
        this._buffs.length = 0;
    }
}
