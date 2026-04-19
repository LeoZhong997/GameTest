/**
 * GachaSystem - 抽卡系统
 * 管理抽卡池、概率、消耗
 * 品质概率从 constants.json 的 gacha.rates 读取
 * 10连抽限制紫卡上限由 gacha.tenPullMaxPurple 控制
 */

import { UnitConfig, Quality } from '../models/UnitData';
import { GameConfig } from '../core/GameConfig';

/** 抽卡结果 */
export interface GachaResult {
    configId: string;
    config: UnitConfig;
    quality: Quality;
    uid: string;
    isNew: boolean;
}

/** 可抽到的品质（仅绿/蓝/紫） */
const GACHA_QUALITIES = [Quality.GREEN, Quality.BLUE, Quality.PURPLE];

/** 默认概率权重（会被 constants.json 覆盖） */
const DEFAULT_RATES: Record<string, number> = {
    green: 70,
    blue: 25,
    purple: 5,
};

export const GACHA_COST = { gold: 100 };
export const GACHA_TEN_COST = { gold: 900 };

export class GachaSystem {
    private static _instance: GachaSystem | null = null;
    static get instance(): GachaSystem {
        if (!GachaSystem._instance) GachaSystem._instance = new GachaSystem();
        return GachaSystem._instance;
    }

    /** 拼接碎片物品 ID */
    static getShardId(configId: string, quality: Quality): string {
        return `${configId}_shard_${quality}`;
    }

    /** 抽取 n 个 */
    pull(n: number, ownedConfigIds: Set<string>): GachaResult[] {
        const allEntries = Array.from(GameConfig.instance.unitConfigs.entries());
        if (allEntries.length === 0) return [];

        const maxPurple = this.getMaxPurple(n);
        const results: GachaResult[] = [];
        let purpleCount = 0;

        for (let i = 0; i < n; i++) {
            const [configId, config] = allEntries[Math.floor(Math.random() * allEntries.length)];

            let quality: Quality;
            if (purpleCount >= maxPurple) {
                // 紫卡已达上限，只能抽绿或蓝
                quality = this.rollQualityExclude(Quality.PURPLE);
            } else {
                quality = this.rollQuality();
            }

            if (quality === Quality.PURPLE) purpleCount++;

            const uid = `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;
            const isNew = !ownedConfigIds.has(configId);
            results.push({ configId, config, quality, uid, isNew });
            ownedConfigIds.add(configId);
        }
        return results;
    }

    /** 获取当前配置的品质概率权重 */
    private getRates(): Record<string, number> {
        const constants = GameConfig.instance.constants;
        if (constants?.gacha?.rates) {
            return constants.gacha.rates;
        }
        return DEFAULT_RATES;
    }

    /** 获取 n 连抽的紫卡上限 */
    private getMaxPurple(n: number): number {
        const constants = GameConfig.instance.constants;
        const maxPerTen = constants?.gacha?.tenPullMaxPurple ?? 2;
        // 按比例换算：10 抽 maxPerTen 张，n 抽最多 ceil(n / 10 * maxPerTen)
        if (n <= 10) return maxPerTen;
        return Math.ceil(n / 10 * maxPerTen);
    }

    /** 正常摇品质（绿/蓝/紫） */
    private rollQuality(): Quality {
        const rates = this.getRates();
        const items = GACHA_QUALITIES.map(q => ({
            quality: q,
            weight: rates[q] ?? DEFAULT_RATES[q] ?? 0,
        }));
        return this.weightedRandom(items);
    }

    /** 排除某品质后摇（紫卡达上限时用） */
    private rollQualityExclude(exclude: Quality): Quality {
        const rates = this.getRates();
        const items = GACHA_QUALITIES
            .filter(q => q !== exclude)
            .map(q => ({
                quality: q,
                weight: rates[q] ?? DEFAULT_RATES[q] ?? 0,
            }));
        return this.weightedRandom(items);
    }

    /** 通用加权随机 */
    private weightedRandom(items: { quality: Quality; weight: number }[]): Quality {
        const total = items.reduce((s, r) => s + r.weight, 0);
        if (total <= 0) return Quality.GREEN;
        let roll = Math.random() * total;
        for (const item of items) {
            roll -= item.weight;
            if (roll <= 0) return item.quality;
        }
        return items[items.length - 1].quality;
    }
}
