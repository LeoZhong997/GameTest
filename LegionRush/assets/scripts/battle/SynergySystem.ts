/**
 * SynergySystem - 种族羁绊系统
 * 根据上场的不同兵种种类数激活羁绊，通过 BuffSystem 施加 Buff
 */

import { BattleUnit } from './Unit';
import { SynergyConfig, SynergyTier, ActiveSynergy } from '../models/SynergyData';

const SYNERGY_DURATION = 9999; // 整场有效

export class SynergySystem {

    /**
     * 计算并应用羁绊 Buff
     * @param units 己方所有单位
     * @param configs 羁绊配置表
     * @returns 已激活的羁绊列表
     */
    static applySynergies(units: readonly BattleUnit[], configs: SynergyConfig[]): ActiveSynergy[] {
        if (units.length === 0 || configs.length === 0) return [];

        const actives: ActiveSynergy[] = [];

        // 统计各种族上场的不同兵种种类数
        const raceTypeCounts = this.countTypesByRace(units);
        const distinctRaceCount = this.countDistinctRaces(units);

        for (const config of configs) {
            let typeCount: number;

            if (config.race === 'mixed') {
                typeCount = distinctRaceCount;
            } else {
                typeCount = raceTypeCounts.get(config.race) || 0;
            }

            // 从低到高找最高激活档
            let bestTier = -1;
            for (let i = 0; i < config.tiers.length; i++) {
                if (typeCount >= config.tiers[i].threshold) {
                    bestTier = i;
                }
            }

            if (bestTier < 0) continue;

            // 激活最高档位（含以下所有档位的效果叠加）
            for (let i = 0; i <= bestTier; i++) {
                this.applyTierEffects(units, config, config.tiers[i], i);
            }

            actives.push({
                config,
                activatedTier: bestTier,
                typeCount,
            });

            console.log(`[SynergySystem] 激活 ${config.name} (种类数:${typeCount}, 档位:${bestTier})`);
        }

        return actives;
    }

    /** 统计各种族上场的不同兵种种类数（按 configId 去重） */
    private static countTypesByRace(units: readonly BattleUnit[]): Map<string, number> {
        const raceTypes = new Map<string, Set<string>>();
        for (const u of units) {
            const race = u.config.race;
            if (!raceTypes.has(race)) raceTypes.set(race, new Set());
            raceTypes.get(race)!.add(u.configId);
        }
        const result = new Map<string, number>();
        for (const [race, types] of raceTypes) {
            result.set(race, types.size);
        }
        return result;
    }

    /** 统计涉及的不同种族数 */
    private static countDistinctRaces(units: readonly BattleUnit[]): number {
        const races = new Set<string>();
        for (const u of units) {
            races.add(u.config.race);
        }
        return races.size;
    }

    /** 施加一档羁绊效果 */
    private static applyTierEffects(
        units: readonly BattleUnit[],
        config: SynergyConfig,
        tier: SynergyTier,
        tierIndex: number,
    ): void {
        for (const effect of tier.effects) {
            const source = `synergy_${config.race}_${tierIndex}`;

            switch (effect.scope) {
                case 'race':
                    // 只加成同族单位
                    for (const u of units) {
                        if (u.config.race === config.race) {
                            u.buffs.addBuff({
                                type: effect.value >= 0 ? 'buff' : 'debuff',
                                stat: effect.stat,
                                value: effect.value,
                                duration: SYNERGY_DURATION,
                                source,
                            });
                        }
                    }
                    break;
                case 'team':
                    // 全队加成
                    for (const u of units) {
                        u.buffs.addBuff({
                            type: effect.value >= 0 ? 'buff' : 'debuff',
                            stat: effect.stat,
                            value: effect.value,
                            duration: SYNERGY_DURATION,
                            source,
                        });
                    }
                    break;
                case 'enemy':
                    // 对敌方施加 debuff（在调用端处理：applySynergies 只处理己方单位，
                    // enemy scope 的效果需要特殊处理 —— 给敌方单位加 debuff）
                    // 这里记录到 units 的 buff 中，标记为 "对敌方" 效果
                    // 实际由 BattleManager 在双方都调用后处理
                    // 简化：在己方单位上记录，由 BattleManager 统一给敌方加
                    for (const u of units) {
                        u.buffs.addBuff({
                            type: 'debuff',
                            stat: `enemy_${effect.stat}`,
                            value: effect.value,
                            duration: SYNERGY_DURATION,
                            source,
                        });
                    }
                    break;
            }
        }
    }

    /**
     * 将敌方羁绊的 enemy scope 效果应用到对方单位
     * 在 BattleManager 中对双方调用 applySynergies 后，再调用此方法交叉应用
     */
    static applyEnemyEffects(friendlyUnits: readonly BattleUnit[], enemyUnits: readonly BattleUnit[]): void {
        // 收集所有 enemy_ 标记的 buff，避免遍历时修改
        const toApply: { source: string; stat: string; value: number }[] = [];
        for (const friend of friendlyUnits) {
            for (const buff of friend.buffs.buffs) {
                if (buff.stat && buff.stat.startsWith('enemy_')) {
                    toApply.push({
                        source: buff.source,
                        stat: buff.stat.replace('enemy_', ''),
                        value: buff.value,
                    });
                }
            }
        }

        // 应用到敌方 + 清理标记
        for (const item of toApply) {
            for (const enemy of enemyUnits) {
                enemy.buffs.addBuff({
                    type: 'debuff',
                    stat: item.stat,
                    value: item.value,
                    duration: SYNERGY_DURATION,
                    source: item.source,
                });
            }
            // 从所有友方单位移除标记
            for (const friend of friendlyUnits) {
                friend.buffs.removeBuffBySource(item.source);
            }
        }
    }
}
