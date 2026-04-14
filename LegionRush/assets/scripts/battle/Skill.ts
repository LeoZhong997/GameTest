/**
 * Skill - 技能执行系统
 * 根据技能配置，在战斗中执行各种效果
 */

import { BattleUnit } from './Unit';
import { SkillConfig, SkillType, TargetType, SkillEffect, ControlType } from '../models/SkillData';

export class SkillExecutor {
    /**
     * 执行一个技能的所有效果
     */
    static execute(caster: BattleUnit, config: SkillConfig, allUnits: BattleUnit[]): void {
        for (const effect of config.effects) {
            const targets = this.resolveTargets(caster, effect, allUnits);
            if (targets.length === 0) continue;

            switch (effect.type) {
                case SkillType.DAMAGE:
                case SkillType.AOE:
                    this.applyDamage(caster, targets, effect);
                    break;
                case SkillType.HEAL:
                    this.applyHeal(caster, targets, effect);
                    break;
                case SkillType.BUFF:
                    this.applyBuff(targets, effect);
                    break;
                case SkillType.DEBUFF:
                    this.applyDebuff(targets, effect);
                    break;
                case SkillType.CONTROL:
                    this.applyControl(targets, effect);
                    break;
                case SkillType.SUMMON:
                    // 召唤逻辑由 BattleManager 处理
                    break;
            }
        }
    }

    /** 解析目标 */
    private static resolveTargets(caster: BattleUnit, effect: SkillEffect, allUnits: BattleUnit[]): BattleUnit[] {
        const isAlly = effect.targetType.startsWith('ally') || effect.targetType === 'self';
        const candidates = allUnits.filter(u =>
            u.isAlive && (isAlly ? u.team === caster.team : u.team !== caster.team)
        );

        switch (effect.targetType) {
            case TargetType.SELF:
                return [caster];
            case TargetType.ENEMY_NEAREST:
                return this.getNearest(caster, candidates, 1);
            case TargetType.ENEMY_ALL:
                return candidates;
            case TargetType.ENEMY_RANGE:
                return this.getUnitsInRange(caster, candidates, effect.range);
            case TargetType.ALLY_NEAREST:
                return this.getNearest(caster, candidates, 1);
            case TargetType.ALLY_ALL:
                return candidates;
            case TargetType.ALLY_LOWEST_HP:
                return this.getLowestHp(candidates, 1);
            default:
                return [];
        }
    }

    /** 造成伤害 */
    private static applyDamage(caster: BattleUnit, targets: BattleUnit[], effect: SkillEffect): void {
        for (const target of targets) {
            const baseDmg = effect.value + caster.atk * effect.ratio;
            const isCrit = Math.random() < caster.critRate;
            let finalDmg = isCrit ? baseDmg * caster.critDmg : baseDmg;
            finalDmg *= caster.buffs.getAtkMultiplier();

            const actual = target.takeDamage(finalDmg, caster);
            caster.damageDealt += actual;
        }
    }

    /** 治疗 */
    private static applyHeal(caster: BattleUnit, targets: BattleUnit[], effect: SkillEffect): void {
        for (const target of targets) {
            const amount = effect.value + caster.atk * effect.ratio;
            target.heal(amount);
        }
    }

    /** 施加增益 */
    private static applyBuff(targets: BattleUnit[], effect: SkillEffect): void {
        for (const target of targets) {
            target.buffs.addBuff({
                type: 'buff',
                stat: 'atk',
                value: effect.value,
                duration: effect.duration,
                source: 'skill',
            });
        }
    }

    /** 施加减益 */
    private static applyDebuff(targets: BattleUnit[], effect: SkillEffect): void {
        for (const target of targets) {
            target.buffs.addBuff({
                type: 'debuff',
                stat: 'atk',
                value: effect.value,
                duration: effect.duration,
                source: 'skill',
            });
        }
    }

    /** 施加控制 */
    private static applyControl(targets: BattleUnit[], effect: SkillEffect): void {
        for (const target of targets) {
            target.buffs.addBuff({
                type: 'control',
                controlType: effect.controlType || ControlType.STUN,
                value: effect.value,
                duration: effect.duration,
                source: 'skill',
            });

            // 立即生效
            switch (effect.controlType) {
                case ControlType.STUN: target.isStunned = true; break;
                case ControlType.FEAR: target.isFeared = true; break;
                case ControlType.FREEZE: target.isFrozen = true; break;
                case ControlType.SLOW:
                    target.isSlowed = true;
                    target.slowFactor = 1 - (effect.value / 100);
                    break;
            }
        }
    }

    private static getNearest(caster: BattleUnit, units: BattleUnit[], count: number): BattleUnit[] {
        return [...units]
            .sort((a, b) => caster.distanceTo(a) - caster.distanceTo(b))
            .slice(0, count);
    }

    private static getUnitsInRange(caster: BattleUnit, units: BattleUnit[], range: number): BattleUnit[] {
        const nearest = this.getNearest(caster, units, 1);
        if (nearest.length === 0) return [];
        const center = nearest[0];
        return units.filter(u => center.distanceTo(u) <= range);
    }

    private static getLowestHp(units: BattleUnit[], count: number): BattleUnit[] {
        return [...units]
            .sort((a, b) => a.hpPercent - b.hpPercent)
            .slice(0, count);
    }
}
