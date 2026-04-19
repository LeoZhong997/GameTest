/**
 * RelicSystem - 圣物核心系统
 * 管理：生成、升级、装备、卸下、分解、属性计算
 */

import { RelicConfig, RelicInstance, RelicStat, RelicStatType } from '../models/RelicData';
import { GameConfig } from '../core/GameConfig';
import { PlayerManager } from './PlayerManager';

/** 生成唯一 uid */
function generateUid(): string {
    return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class RelicSystem {
    private static _instance: RelicSystem | null = null;
    static get instance(): RelicSystem {
        if (!RelicSystem._instance) RelicSystem._instance = new RelicSystem();
        return RelicSystem._instance;
    }

    // ---- 生成 ----

    /** 生成一个新的圣物实例 */
    generateRelic(configId: string, quality: string): RelicInstance {
        const mainStat = this.rollMainStat(quality);
        return {
            uid: generateUid(),
            configId,
            quality,
            level: 1,
            mainStat,
            subStats: [],
        };
    }

    // ---- 升级 ----

    /** 升级圣物，返回是否成功 */
    upgradeRelic(relicUid: string): boolean {
        const pm = PlayerManager.instance;
        const relic = pm.data.relics[relicUid];
        if (!relic) return false;

        const cfg = this.getRelicConstants();
        if (!cfg) return false;

        if (relic.level >= cfg.maxLevel) return false;

        const costGold = cfg.upgradeCost.goldPerLevel * relic.level;
        const costEssence = cfg.upgradeCost.essencePerLevel * relic.level;
        const essenceCount = pm.getItemCount('relic_essence');

        if (pm.data.gold < costGold || essenceCount < costEssence) return false;

        // 扣除资源
        pm.spendCurrency('gold', costGold);
        pm.removeItem('relic_essence', costEssence);

        relic.level++;

        // 检查是否到副属性解锁等级
        if (cfg.subStatLevels.includes(relic.level)) {
            const subStat = this.rollSubStat(relic.quality, relic.mainStat.stat);
            relic.subStats.push(subStat);
        }

        pm.save();
        console.log(`[RelicSystem] 圣物 ${relic.configId} 升到 Lv${relic.level}, 主属性: ${relic.mainStat.stat}+${this.calcMainStatValue(relic).toFixed(1)}%`);
        return true;
    }

    /** 获取升级消耗 */
    getUpgradeCost(relic: RelicInstance): { gold: number; essence: number } {
        const cfg = this.getRelicConstants();
        if (!cfg) return { gold: 0, essence: 0 };
        return {
            gold: cfg.upgradeCost.goldPerLevel * relic.level,
            essence: cfg.upgradeCost.essencePerLevel * relic.level,
        };
    }

    // ---- 装备 / 卸下 ----

    /** 将圣物装备到单位 */
    equipRelic(relicUid: string, unitUid: string): boolean {
        const pm = PlayerManager.instance;
        const relic = pm.data.relics[relicUid];
        const unit = pm.getUnit(unitUid);
        if (!relic || !unit) return false;

        // 检查种族/角色限制
        const relicCfg = GameConfig.instance.getRelicConfig(relic.configId);
        if (!relicCfg) return false;

        if (relicCfg.race) {
            const unitCfg = GameConfig.instance.getUnitConfig(unit.configId);
            if (unitCfg && unitCfg.race !== relicCfg.race) {
                console.warn(`[RelicSystem] 种族不匹配: 圣物需要 ${relicCfg.race}, 单位是 ${unitCfg.race}`);
                return false;
            }
        }
        if (relicCfg.role) {
            const unitCfg = GameConfig.instance.getUnitConfig(unit.configId);
            if (unitCfg && unitCfg.role !== relicCfg.role) {
                console.warn(`[RelicSystem] 角色不匹配: 圣物需要 ${relicCfg.role}, 单位是 ${unitCfg.role}`);
                return false;
            }
        }

        // 卸下该单位已装备的旧圣物
        for (const [uid, r] of Object.entries(pm.data.relics)) {
            if (r.equippedTo === unitUid) {
                r.equippedTo = undefined;
            }
        }

        // 卸下该圣物之前装备的单位
        relic.equippedTo = unitUid;

        pm.save();
        console.log(`[RelicSystem] 圣物 ${relicCfg.name} 装备到单位 ${unit.configId}`);
        return true;
    }

    /** 卸下圣物 */
    unequipRelic(relicUid: string): void {
        const pm = PlayerManager.instance;
        const relic = pm.data.relics[relicUid];
        if (!relic) return;
        relic.equippedTo = undefined;
        pm.save();
    }

    // ---- 分解 ----

    /** 批量分解圣物，产出精华 */
    dismantleRelics(relicUids: string[]): number {
        const pm = PlayerManager.instance;
        const cfg = this.getRelicConstants();
        if (!cfg) return 0;

        let totalEssence = 0;
        for (const uid of relicUids) {
            const relic = pm.data.relics[uid];
            if (!relic) continue;
            if (relic.equippedTo) continue; // 已装备的不能分解

            const yield_ = (cfg.dismantleYield as any)[relic.quality] || 5;
            totalEssence += yield_;
            delete pm.data.relics[uid];
        }

        if (totalEssence > 0) {
            pm.addItem('relic_essence', totalEssence);
            pm.save();
            console.log(`[RelicSystem] 分解 ${relicUids.length} 件圣物, 获得 ${totalEssence} 精华`);
        }
        return totalEssence;
    }

    /** 获取可分解的重复圣物 uid 列表（未装备、同 configId 有多个时保留品质最高的） */
    getDismantlableRelics(): string[] {
        const pm = PlayerManager.instance;
        const byConfig = new Map<string, RelicInstance[]>();

        for (const relic of Object.values(pm.data.relics)) {
            if (relic.equippedTo) continue;
            let arr = byConfig.get(relic.configId);
            if (!arr) { arr = []; byConfig.set(relic.configId, arr); }
            arr.push(relic);
        }

        const result: string[] = [];
        const QUALITY_ORDER = ['green', 'blue', 'purple', 'gold'];

        for (const [_, arr] of byConfig) {
            if (arr.length <= 1) continue;
            // 按品质排序，保留最高的
            arr.sort((a, b) => QUALITY_ORDER.indexOf(b.quality) - QUALITY_ORDER.indexOf(a.quality));
            // 其余标记分解
            for (let i = 1; i < arr.length; i++) {
                result.push(arr[i].uid);
            }
        }
        return result;
    }

    // ---- 属性计算 ----

    /** 计算圣物的主属性实际值（基础 + 等级成长） */
    calcMainStatValue(relic: RelicInstance): number {
        const cfg = this.getRelicConstants();
        if (!cfg) return relic.mainStat.value;

        const base = (cfg.mainStatBase as any)[relic.quality] ?? 3.0;
        const growth = (cfg.mainStatGrowth as any)[relic.quality] ?? 0.3;
        return base + (relic.level - 1) * growth;
    }

    /** 计算圣物提供的所有属性加成（用于战斗） */
    getStatBonuses(relic: RelicInstance): Record<string, number> {
        const bonuses: Record<string, number> = {};

        // 主属性
        const mainVal = this.calcMainStatValue(relic);
        bonuses[relic.mainStat.stat] = (bonuses[relic.mainStat.stat] || 0) + mainVal;

        // 副属性
        for (const sub of relic.subStats) {
            bonuses[sub.stat] = (bonuses[sub.stat] || 0) + sub.value;
        }

        return bonuses;
    }

    /** 获取指定单位装备的圣物 */
    getRelicEquippedByUnit(unitUid: string): RelicInstance | null {
        const pm = PlayerManager.instance;
        for (const relic of Object.values(pm.data.relics)) {
            if (relic.equippedTo === unitUid) return relic;
        }
        return null;
    }

    /** 获取所有可用圣物（未装备的） */
    getAvailableRelics(): RelicInstance[] {
        const pm = PlayerManager.instance;
        return Object.values(pm.data.relics).filter(r => !r.equippedTo);
    }

    /** 获取所有圣物 */
    getAllRelics(): RelicInstance[] {
        return Object.values(PlayerManager.instance.data.relics);
    }

    /** 获取单个圣物 */
    getRelic(uid: string): RelicInstance | null {
        return PlayerManager.instance.data.relics[uid] || null;
    }

    /** 检查圣物是否可装备到指定单位 */
    canEquipTo(relic: RelicInstance, unitUid: string): boolean {
        const pm = PlayerManager.instance;
        const unit = pm.getUnit(unitUid);
        if (!unit) return false;

        const relicCfg = GameConfig.instance.getRelicConfig(relic.configId);
        if (!relicCfg) return false;

        const unitCfg = GameConfig.instance.getUnitConfig(unit.configId);
        if (!unitCfg) return false;

        if (relicCfg.race && unitCfg.race !== relicCfg.race) return false;
        if (relicCfg.role && unitCfg.role !== relicCfg.role) return false;

        return true;
    }

    // ---- 随机 ----

    /** 随机主属性 */
    private rollMainStat(quality: string): RelicStat {
        const cfg = this.getRelicConstants();
        const pool: RelicStatType[] = cfg?.statPool || ['atk', 'hp', 'def', 'atkSpd'];
        const stat = pool[Math.floor(Math.random() * pool.length)];
        const base = (cfg?.mainStatBase as any)?.[quality] ?? 3.0;
        return { stat, value: base };
    }

    /** 随机副属性（不与主属性重复） */
    private rollSubStat(quality: string, mainStatType: RelicStatType): RelicStat {
        const cfg = this.getRelicConstants();
        const pool: RelicStatType[] = (cfg?.statPool || ['atk', 'hp', 'def', 'atkSpd'])
            .filter(s => s !== mainStatType);
        const stat = pool[Math.floor(Math.random() * pool.length)];
        const range = (cfg?.subStatRange as any)?.[quality] || [1.0, 3.0];
        const value = Math.round((range[0] + Math.random() * (range[1] - range[0])) * 10) / 10;
        return { stat, value };
    }

    // ---- 工具 ----

    private getRelicConstants(): any {
        return GameConfig.instance.constants?.relic;
    }
}
