/**
 * GameConfig - 全局配置管理器（单例）
 * 所有场景共享的配置数据：兵种、技能、关卡
 * 由主场景初始化，其他场景直接读取
 */

import { UnitConfig } from '../models/UnitData';
import { SkillConfig } from '../models/SkillData';

export class GameConfig {
    private static _instance: GameConfig = null!;

    private _unitConfigs: Map<string, UnitConfig> = new Map();
    private _skillConfigs: Map<string, SkillConfig> = new Map();
    private _loaded: boolean = false;

    public static get instance(): GameConfig {
        if (!this._instance) {
            this._instance = new GameConfig();
        }
        return this._instance;
    }

    get isLoaded(): boolean {
        return this._loaded;
    }

    get unitConfigs(): Map<string, UnitConfig> {
        return this._unitConfigs;
    }

    get skillConfigs(): Map<string, SkillConfig> {
        return this._skillConfigs;
    }

    /** 设置配置数据（由主场景调用） */
    setConfigs(units: Map<string, UnitConfig>, skills: Map<string, SkillConfig>): void {
        this._unitConfigs = units;
        this._skillConfigs = skills;
        this._loaded = true;
    }

    getUnitConfig(id: string): UnitConfig | undefined {
        return this._unitConfigs.get(id);
    }

    getSkillConfig(id: string): SkillConfig | undefined {
        return this._skillConfigs.get(id);
    }
}
