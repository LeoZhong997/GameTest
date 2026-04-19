/**
 * RelicGachaSystem - 圣物抽卡系统
 * 钻石消耗，独立于兵种抽卡
 */

import { RelicInstance } from '../models/RelicData';
import { GameConfig } from '../core/GameConfig';
import { PlayerManager } from './PlayerManager';
import { RelicSystem } from './RelicSystem';

/** 抽卡结果 */
export interface RelicGachaResult {
    relic: RelicInstance;
    configName: string;
    quality: string;
    isNew: boolean;
}

const QUALITY_ORDER = ['green', 'blue', 'purple', 'gold'];

export class RelicGachaSystem {
    private static _instance: RelicGachaSystem | null = null;
    static get instance(): RelicGachaSystem {
        if (!RelicGachaSystem._instance) RelicGachaSystem._instance = new RelicGachaSystem();
        return RelicGachaSystem._instance;
    }

    /** 获取抽卡消耗 */
    getSingleCost(): number {
        return GameConfig.instance.constants?.relicGacha?.singleCost?.crystals ?? 50;
    }

    getTenCost(): number {
        return GameConfig.instance.constants?.relicGacha?.tenCost?.crystals ?? 500;
    }

    /** 抽取 n 件圣物 */
    pull(n: number): RelicGachaResult[] {
        const pm = PlayerManager.instance;
        const rates = this.getRates();
        const relicConfigs = Array.from(GameConfig.instance.relicConfigs.values());
        if (relicConfigs.length === 0) return [];

        const results: RelicGachaResult[] = [];
        let hasBlueOrAbove = false;

        for (let i = 0; i < n; i++) {
            // 随机选圣物配置
            const config = relicConfigs[Math.floor(Math.random() * relicConfigs.length)];

            // 最后几张如果没有蓝或以上，强制保底
            let quality: string;
            if (i === n - 1 && !hasBlueOrAbove && n >= 10) {
                quality = this.rollQualityMinBlue();
            } else {
                quality = this.rollQuality();
            }

            if (QUALITY_ORDER.indexOf(quality) >= QUALITY_ORDER.indexOf('blue')) {
                hasBlueOrAbove = true;
            }

            // 生成圣物实例
            const relic = RelicSystem.instance.generateRelic(config.id, quality);

            // 存入玩家数据
            pm.data.relics[relic.uid] = relic;

            results.push({
                relic,
                configName: config.name,
                quality,
                isNew: true,
            });
        }

        pm.save();
        return results;
    }

    /** 获取品质概率 */
    private getRates(): Record<string, number> {
        return GameConfig.instance.constants?.relicGacha?.rates ?? { green: 60, blue: 28, purple: 10, gold: 2 };
    }

    /** 随机品质 */
    private rollQuality(): string {
        const rates = this.getRates();
        const items = QUALITY_ORDER.map(q => ({ quality: q, weight: rates[q] ?? 0 }));
        return this.weightedRandom(items);
    }

    /** 保底至少蓝色 */
    private rollQualityMinBlue(): string {
        const rates = this.getRates();
        const items = QUALITY_ORDER
            .filter(q => QUALITY_ORDER.indexOf(q) >= QUALITY_ORDER.indexOf('blue'))
            .map(q => ({ quality: q, weight: rates[q] ?? 0 }));
        return this.weightedRandom(items);
    }

    private weightedRandom(items: { quality: string; weight: number }[]): string {
        const total = items.reduce((s, r) => s + r.weight, 0);
        if (total <= 0) return 'green';
        let roll = Math.random() * total;
        for (const item of items) {
            roll -= item.weight;
            if (roll <= 0) return item.quality;
        }
        return items[items.length - 1].quality;
    }
}
