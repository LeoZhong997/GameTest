/**
 * GachaSystem - 抽卡系统
 * 管理抽卡池、概率、消耗
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

/** 品质概率权重 */
const QUALITY_WEIGHTS: { quality: Quality; weight: number }[] = [
    { quality: Quality.GREEN,  weight: 55 },
    { quality: Quality.BLUE,   weight: 30 },
    { quality: Quality.PURPLE, weight: 12 },
    { quality: Quality.GOLD,   weight: 3  },
];

export const GACHA_COST = { bottleCaps: 1, tokens: 2 };
export const GACHA_TEN_COST = { bottleCaps: 10, tokens: 20 };

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

        const results: GachaResult[] = [];
        for (let i = 0; i < n; i++) {
            const [configId, config] = allEntries[Math.floor(Math.random() * allEntries.length)];
            const quality = this.rollQuality();
            const uid = `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;
            const isNew = !ownedConfigIds.has(configId);
            results.push({ configId, config, quality, uid, isNew });
            ownedConfigIds.add(configId);
        }
        return results;
    }

    private rollQuality(): Quality {
        const total = QUALITY_WEIGHTS.reduce((s, r) => s + r.weight, 0);
        let roll = Math.random() * total;
        for (const r of QUALITY_WEIGHTS) {
            roll -= r.weight;
            if (roll <= 0) return r.quality;
        }
        return Quality.GREEN;
    }
}
