/**
 * UpgradeSystem - 品质升阶系统
 * 管理升品消耗表、升阶判定
 */

import { UnitInstanceData, Quality } from '../models/UnitData';

export interface UpgradeCost {
    bottleCaps: number;
    [materialId: string]: number;   // 材料消耗
    minLevel: number;
}

export interface UpgradeResult {
    success: boolean;
    reason: string;
    oldQuality: string;
    newQuality: string;
}

export class UpgradeSystem {
    private static _instance: UpgradeSystem = null!;
    private _costs: Map<string, UpgradeCost> = new Map();  // "green_to_blue" -> cost
    private _qualityOrder: string[] = [];

    public static get instance(): UpgradeSystem {
        if (!this._instance) {
            this._instance = new UpgradeSystem();
        }
        return this._instance;
    }

    /** 从 constants 初始化 */
    init(constants: any): void {
        this._costs.clear();
        if (constants.qualityUpgradeCosts) {
            for (const [key, cost] of Object.entries(constants.qualityUpgradeCosts)) {
                this._costs.set(key, cost as UpgradeCost);
            }
        }
        if (constants.qualityOrder) {
            this._qualityOrder = constants.qualityOrder;
        }
        console.log(`[UpgradeSystem] 初始化: ${this._costs.size} 个升阶配置, 品质顺序: ${this._qualityOrder.join(' → ')}`);
    }

    /** 获取下一个品质 */
    getNextQuality(current: string): string | null {
        const idx = this._qualityOrder.indexOf(current);
        if (idx < 0 || idx >= this._qualityOrder.length - 1) return null;
        return this._qualityOrder[idx + 1];
    }

    /** 获取升品消耗 */
    getCost(unit: UnitInstanceData): UpgradeCost | null {
        const next = this.getNextQuality(unit.quality);
        if (!next) return null;
        const key = `${unit.quality}_to_${next}`;
        return this._costs.get(key) || null;
    }

    /** 检查是否可以升品 */
    canUpgrade(unit: UnitInstanceData, inventory: Record<string, number>): { can: boolean; reason: string } {
        const next = this.getNextQuality(unit.quality);
        if (!next) return { can: false, reason: '已达最高品质' };

        const cost = this.getCost(unit);
        if (!cost) return { can: false, reason: '无升阶配置' };

        if (unit.level < cost.minLevel) {
            return { can: false, reason: `需要等级 ${cost.minLevel}` };
        }

        for (const [itemId, amount] of Object.entries(cost)) {
            if (itemId === 'minLevel') continue;
            const have = inventory[itemId] || 0;
            if (have < amount) {
                return { can: false, reason: `${itemId} 不足 (需要${amount}, 拥有${have})` };
            }
        }

        return { can: true, reason: '' };
    }

    /** 执行升品（扣材料、改品质） */
    upgrade(unit: UnitInstanceData, inventory: Record<string, number>): UpgradeResult {
        const check = this.canUpgrade(unit, inventory);
        if (!check.can) {
            return { success: false, reason: check.reason, oldQuality: unit.quality, newQuality: unit.quality };
        }

        const cost = this.getCost(unit)!;
        const oldQuality = unit.quality;
        const newQuality = this.getNextQuality(unit.quality)!;

        // 扣除材料
        for (const [itemId, amount] of Object.entries(cost)) {
            if (itemId === 'minLevel') continue;
            inventory[itemId] = (inventory[itemId] || 0) - amount;
        }

        unit.quality = newQuality as Quality;
        console.log(`[UpgradeSystem] ${unit.configId} 升品: ${oldQuality} → ${newQuality}`);

        return { success: true, reason: '', oldQuality, newQuality };
    }
}
