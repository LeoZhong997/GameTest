/**
 * UpgradeSystem - 品质升阶 + 碎片合成系统
 * 每个兵种有独立碎片 (configId_shard_quality)
 * 升阶消耗该兵种对应碎片，碎片可 3:1 合成
 */

import { UnitInstanceData, Quality } from '../models/UnitData';

export interface UpgradeCost {
    materialId: string;   // 碎片物品 ID
    count: number;
    scrollId: string;     // 卷轴物品 ID
    scrollCount: number;
}

export interface UpgradeResult {
    success: boolean;
    reason: string;
    oldQuality: string;
    newQuality: string;
}

export interface SynthesisResult {
    success: boolean;
    reason: string;
    fromQuality: string;
    toQuality: string;
}

/** 碎片品质阶位（绿/蓝/紫，gold+ 暂不开放碎片） */
const SHARD_QUALITIES = ['green', 'blue', 'purple'];

export class UpgradeSystem {
    private static _instance: UpgradeSystem = null!;
    private _qualityOrder: string[] = [];
    private _shardUpgradeCount: number = 3;
    private _scrollCosts: Map<string, number> = new Map();       // quality -> scroll count
    private _synthesisRecipes: Map<string, number> = new Map();  // "green_to_blue" -> count

    public static get instance(): UpgradeSystem {
        if (!this._instance) {
            this._instance = new UpgradeSystem();
        }
        return this._instance;
    }

    /** 从 constants 初始化 */
    init(constants: any): void {
        this._synthesisRecipes.clear();
        if (constants.qualityOrder) {
            this._qualityOrder = constants.qualityOrder;
        }
        if (constants.shardUpgradeCount) {
            this._shardUpgradeCount = constants.shardUpgradeCount;
        }
        if (constants.scrollUpgradeCost) {
            for (const [quality, count] of Object.entries(constants.scrollUpgradeCost) as [string, any][]) {
                this._scrollCosts.set(quality, count || 0);
            }
        }
        if (constants.shardSynthesis) {
            for (const [key, val] of Object.entries(constants.shardSynthesis) as [string, any][]) {
                this._synthesisRecipes.set(key, val.count || 3);
            }
        }
        console.log(`[UpgradeSystem] 初始化: 升阶消耗=${this._shardUpgradeCount}, 品质顺序: ${this._qualityOrder.join(' → ')}, 合成配方: ${this._synthesisRecipes.size}`);
    }

    /** 拼接碎片物品 ID */
    static shardId(configId: string, quality: string): string {
        return `${configId}_shard_${quality}`;
    }

    /** 获取下一个品质 */
    getNextQuality(current: string): string | null {
        const idx = this._qualityOrder.indexOf(current);
        if (idx < 0 || idx >= this._qualityOrder.length - 1) return null;
        // gold+ 暂不开放
        const next = this._qualityOrder[idx + 1];
        if (next === 'gold1') return null;
        return next;
    }

    /** 获取升阶消耗（碎片 + 卷轴） */
    getCost(unit: UnitInstanceData): UpgradeCost | null {
        const next = this.getNextQuality(unit.quality);
        if (!next) return null;
        return {
            materialId: UpgradeSystem.shardId(unit.configId, unit.quality),
            count: this._shardUpgradeCount,
            scrollId: 'ascension_scroll',
            scrollCount: this._scrollCosts.get(unit.quality) || 0,
        };
    }

    /** 检查是否可以升阶 */
    canUpgrade(unit: UnitInstanceData, inventory: Record<string, number>): { can: boolean; reason: string } {
        const next = this.getNextQuality(unit.quality);
        if (!next) return { can: false, reason: '已达最高品质' };

        const cost = this.getCost(unit);
        if (!cost) return { can: false, reason: '无升阶配置' };

        const haveShard = inventory[cost.materialId] || 0;
        if (haveShard < cost.count) {
            return { can: false, reason: `碎片不足 (${haveShard}/${cost.count})` };
        }

        if (cost.scrollCount > 0) {
            const haveScroll = inventory[cost.scrollId] || 0;
            if (haveScroll < cost.scrollCount) {
                return { can: false, reason: `卷轴不足 (${haveScroll}/${cost.scrollCount})` };
            }
        }

        return { can: true, reason: '' };
    }

    /** 执行升阶（扣碎片 + 卷轴、改品质） */
    upgrade(unit: UnitInstanceData, inventory: Record<string, number>): UpgradeResult {
        const check = this.canUpgrade(unit, inventory);
        if (!check.can) {
            return { success: false, reason: check.reason, oldQuality: unit.quality, newQuality: unit.quality };
        }

        const cost = this.getCost(unit)!;
        const oldQuality = unit.quality;
        const newQuality = this.getNextQuality(unit.quality)!;

        // 扣除碎片
        inventory[cost.materialId] = (inventory[cost.materialId] || 0) - cost.count;
        // 扣除卷轴
        if (cost.scrollCount > 0) {
            inventory[cost.scrollId] = (inventory[cost.scrollId] || 0) - cost.scrollCount;
        }

        unit.quality = newQuality as Quality;
        console.log(`[UpgradeSystem] ${unit.configId} 升阶: ${oldQuality} → ${newQuality} (碎片-${cost.count}, 卷轴-${cost.scrollCount})`);

        return { success: true, reason: '', oldQuality, newQuality };
    }

    /** 获取某品质碎片的下一级品质 */
    getNextShardQuality(quality: string): string | null {
        const idx = SHARD_QUALITIES.indexOf(quality);
        if (idx < 0 || idx >= SHARD_QUALITIES.length - 1) return null;
        return SHARD_QUALITIES[idx + 1];
    }

    /** 获取合成所需数量 */
    getSynthesisCount(fromQuality: string): number {
        const next = this.getNextShardQuality(fromQuality);
        if (!next) return Infinity;
        const key = `${fromQuality}_to_${next}`;
        return this._synthesisRecipes.get(key) || 3;
    }

    /** 检查是否可以合成 */
    canSynthesize(configId: string, fromQuality: string, inventory: Record<string, number>): { can: boolean; reason: string } {
        const next = this.getNextShardQuality(fromQuality);
        if (!next) return { can: false, reason: '已达最高碎片品质' };

        const count = this.getSynthesisCount(fromQuality);
        const shardItemId = UpgradeSystem.shardId(configId, fromQuality);
        const have = inventory[shardItemId] || 0;
        if (have < count) {
            return { can: false, reason: `碎片不足 (${have}/${count})` };
        }

        return { can: true, reason: '' };
    }

    /** 执行合成（扣 N 个低级碎片，加 1 个高级碎片） */
    synthesize(configId: string, fromQuality: string, inventory: Record<string, number>): SynthesisResult {
        const check = this.canSynthesize(configId, fromQuality, inventory);
        if (!check.can) {
            return { success: false, reason: check.reason, fromQuality, toQuality: fromQuality };
        }

        const next = this.getNextShardQuality(fromQuality)!;
        const count = this.getSynthesisCount(fromQuality);
        const fromItemId = UpgradeSystem.shardId(configId, fromQuality);
        const toItemId = UpgradeSystem.shardId(configId, next);

        // 扣低级
        inventory[fromItemId] = (inventory[fromItemId] || 0) - count;
        // 加高级
        inventory[toItemId] = (inventory[toItemId] || 0) + 1;

        console.log(`[UpgradeSystem] 合成: ${fromItemId} ×${count} → ${toItemId} ×1`);
        return { success: true, reason: '', fromQuality, toQuality: next };
    }

    /** 获取兵种所有碎片持有量 */
    getShardCounts(configId: string, inventory: Record<string, number>): { quality: string; count: number }[] {
        return SHARD_QUALITIES.map(q => ({
            quality: q,
            count: inventory[UpgradeSystem.shardId(configId, q)] || 0,
        }));
    }
}
