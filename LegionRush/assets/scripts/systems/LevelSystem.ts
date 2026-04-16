/**
 * LevelSystem - 升级经验系统
 * 管理经验表、升级判定
 */

import { UnitInstanceData } from '../models/UnitData';

export interface LevelUpResult {
    levelsGained: number;
    newLevel: number;
    oldLevel: number;
}

export class LevelSystem {
    private static _instance: LevelSystem = null!;
    private _expTable: Map<number, number> = new Map();  // level -> cumulative exp
    private _maxLevel: number = 20;

    public static get instance(): LevelSystem {
        if (!this._instance) {
            this._instance = new LevelSystem();
        }
        return this._instance;
    }

    /** 从 constants 初始化 */
    init(constants: any): void {
        this._expTable.clear();
        if (constants.expTable) {
            for (const [lvl, exp] of Object.entries(constants.expTable)) {
                this._expTable.set(Number(lvl), Number(exp));
            }
        }
        if (constants.maxLevel) {
            this._maxLevel = constants.maxLevel;
        }
        console.log(`[LevelSystem] 初始化: maxLevel=${this._maxLevel}, expTable=${this._expTable.size} 条`);
    }

    /** 获取升到某级所需的总经验 */
    getExpForLevel(level: number): number {
        return this._expTable.get(level) ?? 0;
    }

    /** 获取当前等级的升级所需经验（从当前级到下一级的差值） */
    getExpToNextLevel(level: number): number {
        const current = this._expTable.get(level) ?? 0;
        const next = this._expTable.get(level + 1);
        if (next === undefined) return Infinity;  // 已满级
        return next - current;
    }

    /** 获取升级进度（0-1） */
    getLevelProgress(unit: UnitInstanceData): number {
        if (unit.level >= this._maxLevel) return 1;
        const currentThreshold = this.getExpForLevel(unit.level);
        const nextThreshold = this.getExpForLevel(unit.level + 1);
        if (nextThreshold <= currentThreshold) return 1;
        return (unit.exp - currentThreshold) / (nextThreshold - currentThreshold);
    }

    getMaxLevel(): number {
        return this._maxLevel;
    }

    /** 给单位增加经验，返回升级结果 */
    addExp(unit: UnitInstanceData, exp: number): LevelUpResult {
        const oldLevel = unit.level;
        unit.exp += exp;

        let levelsGained = 0;
        while (unit.level < this._maxLevel) {
            const nextExp = this._expTable.get(unit.level + 1);
            if (nextExp === undefined || unit.exp < nextExp) break;
            unit.level++;
            levelsGained++;
        }

        if (levelsGained > 0) {
            console.log(`[LevelSystem] ${unit.configId} 升级: ${oldLevel} -> ${unit.level} (+${levelsGained})`);
        }

        return { levelsGained, newLevel: unit.level, oldLevel };
    }
}
