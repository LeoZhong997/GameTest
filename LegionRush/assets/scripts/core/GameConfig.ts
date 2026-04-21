/**
 * GameConfig - 全局配置管理器（单例）
 * 所有场景共享的配置数据：兵种、技能、关卡
 * 由主场景初始化，其他场景直接读取
 */

import { UnitConfig } from '../models/UnitData';
import { SkillConfig } from '../models/SkillData';
import { SynergyConfig } from '../models/SynergyData';
import { RelicConfig } from '../models/RelicData';
import { BattleOrderConfig } from '../models/BattleOrderData';

export interface FontSizes {
    hero: number;
    titleLg: number;
    title: number;
    subtitle: number;
    body: number;
    small: number;
    caption: number;
}

export class GameConfig {
    private static _instance: GameConfig = null!;

    private _unitConfigs: Map<string, UnitConfig> = new Map();
    private _skillConfigs: Map<string, SkillConfig> = new Map();
    private _synergyConfigs: SynergyConfig[] = [];
    private _relicConfigs: Map<string, RelicConfig> = new Map();
    private _battleOrderConfigs: Map<string, BattleOrderConfig> = new Map();
    private _constants: any = null;
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

    get synergyConfigs(): SynergyConfig[] {
        return this._synergyConfigs;
    }

    get relicConfigs(): Map<string, RelicConfig> {
        return this._relicConfigs;
    }

    get constants(): any {
        return this._constants;
    }

    get fontSizes(): FontSizes {
        return this._constants?.fontSizes;
    }

    /** 设置配置数据（由主场景调用） */
    setConfigs(units: Map<string, UnitConfig>, skills: Map<string, SkillConfig>): void {
        this._unitConfigs = units;
        this._skillConfigs = skills;
        this._loaded = true;
    }

    /** 设置常量配置 */
    setConstants(constants: any): void {
        this._constants = constants;
    }

    /** 设置羁绊配置 */
    setSynergyConfigs(configs: SynergyConfig[]): void {
        this._synergyConfigs = configs;
    }

    /** 设置圣物配置 */
    setRelicConfigs(configs: RelicConfig[]): void {
        this._relicConfigs.clear();
        for (const c of configs) {
            this._relicConfigs.set(c.id, c);
        }
    }

    /** 设置军令配置 */
    setBattleOrderConfigs(configs: BattleOrderConfig[]): void {
        this._battleOrderConfigs.clear();
        for (const c of configs) {
            this._battleOrderConfigs.set(c.id, c);
        }
    }

    /** 获取军令配置 */
    getBattleOrderConfig(id: string): BattleOrderConfig | undefined {
        return this._battleOrderConfigs.get(id);
    }

    /** 获取所有军令配置 */
    get allBattleOrderConfigs(): BattleOrderConfig[] {
        return Array.from(this._battleOrderConfigs.values());
    }

    getUnitConfig(id: string): UnitConfig | undefined {
        return this._unitConfigs.get(id);
    }

    getSkillConfig(id: string): SkillConfig | undefined {
        return this._skillConfigs.get(id);
    }

    getRelicConfig(id: string): RelicConfig | undefined {
        return this._relicConfigs.get(id);
    }
}
