/**
 * Unit - 战斗单位（运行时）
 * 包含属性、状态机、技能、Buff
 */

import { Vec2 } from 'cc';
import { UnitConfig, UnitStats, Quality } from '../models/UnitData';
import { SkillState, SkillConfig } from '../models/SkillData';
import { BuffSystem } from './BuffSystem';

/** 全局常量配置（由 BattleScene 从 constants.json 注入） */
export interface GameConstants {
    qualityMultipliers: Record<string, number>;
    unitScale: { spdToPixelsPerSec: number; rangeToPixels: number };
    energy: { maxEnergy: number; killReward: number };
}

/** 单位状态 */
export enum UnitState {
    IDLE = 'idle',
    MOVE = 'move',
    ATTACK = 'attack',
    CAST_SKILL = 'cast_skill',
    DEAD = 'dead'
}

/** 阵营 */
export enum TeamSide {
    LEFT = 0,   // 玩家方
    RIGHT = 1   // 敌方
}

export class BattleUnit {
    // 身份
    readonly uid: string;
    readonly configId: string;
    readonly config: UnitConfig;
    readonly team: TeamSide;

    /** 可读标识：蓝坦克#12 / 红骑兵#3 */
    get tag(): string {
        const side = this.team === TeamSide.LEFT ? '蓝' : '红';
        return `${side}${this.config.name}#${this.uid.slice(1)}`;
    }

    // 属性
    level: number;
    quality: Quality;
    maxHp: number;
    hp: number;
    atk: number;
    def: number;
    spd: number;        // 像素/秒
    range: number;      // 像素
    atkSpd: number;     // 每秒攻击次数
    critRate: number;
    critDmg: number;

    // 能量
    energy: number = 0;
    maxEnergy: number = 100;

    // 状态
    state: UnitState = UnitState.IDLE;
    position: Vec2 = new Vec2();
    target: BattleUnit | null = null;
    attackTimer: number = 0;
    skills: SkillState[] = [];
    buffs: BuffSystem;

    // 控制标记
    isAlive: boolean = true;
    isStunned: boolean = false;
    isFeared: boolean = false;
    isFrozen: boolean = false;
    isSlowed: boolean = false;
    slowFactor: number = 1.0;

    // 战斗统计
    damageDealt: number = 0;
    damageTaken: number = 0;
    kills: number = 0;
    assists: number = 0;
    healingDone: number = 0;

    /** 对本单位造成过伤害的攻击者 UID 集合（用于助攻判定） */
    private _damageSources: Set<string> = new Set();

    private static _nextUid = 0;

    /** 全局常量（由外部注入，带默认值保证安全） */
    private static _constants: GameConstants = {
        qualityMultipliers: { green: 1.0, blue: 1.3, purple: 1.7, gold: 2.2, gold1: 2.6, gold2: 3.0, gold3: 3.5 },
        unitScale: { spdToPixelsPerSec: 60, rangeToPixels: 50 },
        energy: { maxEnergy: 30, killReward: 5 },
    };

    /** 技能配置表（由外部注入） */
    private static _skillConfigs: Map<string, SkillConfig> = new Map();

    /** 助攻回调（由 BattleManager 注册，用于在 Unit 内部通知助攻） */
    static _onAssistCallback: ((attackerUid: string) => void) | null = null;

    /** 注入全局常量 */
    static initConstants(constants: GameConstants): void {
        BattleUnit._constants = constants;
    }

    /** 注入技能配置表 */
    static initSkillConfigs(configs: Map<string, SkillConfig>): void {
        BattleUnit._skillConfigs = configs;
    }

    constructor(config: UnitConfig, team: TeamSide, level: number = 1, quality: Quality = Quality.GREEN, relicBonus?: Record<string, number>) {
        this.uid = `u${BattleUnit._nextUid++}`;
        this.configId = config.id;
        this.config = config;
        this.team = team;
        this.level = level;
        this.quality = quality;
        this.buffs = new BuffSystem(this);

        this.calculateStats();
        if (relicBonus) this.applyRelicBonuses(relicBonus);
        this.maxEnergy = BattleUnit._constants.energy.maxEnergy;
        this.hp = this.maxHp;
        this.initSkills();
    }

    /** 根据等级和品质计算最终属性 */
    private calculateStats(): void {
        const base = this.config.baseStats;
        const growth = this.config.growths;
        const lvl = this.level - 1;
        const qm = this.getQualityMultiplier();
        const scale = BattleUnit._constants.unitScale;

        this.maxHp = Math.floor((base.hp + growth.hp * lvl) * qm);
        this.atk = Math.floor((base.atk + growth.atk * lvl) * qm);
        this.def = Math.floor((base.def + growth.def * lvl) * qm);
        this.spd = base.spd * scale.spdToPixelsPerSec;
        this.range = base.range * scale.rangeToPixels;
        this.atkSpd = base.atkSpd;
        this.critRate = base.critRate;
        this.critDmg = base.critDmg;
    }

    private getQualityMultiplier(): number {
        return BattleUnit._constants.qualityMultipliers[this.quality] ?? 1.0;
    }

    /** 应用圣物加成（百分比，在品质乘数之后叠加） */
    private applyRelicBonuses(bonuses: Record<string, number>): void {
        if (bonuses.hp)     this.maxHp = Math.floor(this.maxHp * (1 + bonuses.hp / 100));
        if (bonuses.atk)    this.atk   = Math.floor(this.atk   * (1 + bonuses.atk / 100));
        if (bonuses.def)    this.def   = Math.floor(this.def   * (1 + bonuses.def / 100));
        if (bonuses.atkSpd) this.atkSpd *= (1 + bonuses.atkSpd / 100);
        this.hp = this.maxHp;
    }

    private initSkills(): void {
        this.skills = this.config.skills.map(id => {
            const cfg = BattleUnit._skillConfigs.get(id);
            // 从配置读 initialCd，若未配置则回退到 cooldown * 0.6 + random
            const initialCd = cfg?.initialCd ?? (cfg ? cfg.cooldown * 0.6 + Math.random() * 2 : 3 + Math.random() * 5);
            return {
                configId: id,
                level: 1,
                currentCd: initialCd,
                energy: 0,
                maxEnergy: 100,
                uses: 0,
            };
        });
    }

    /** 计算受伤（含防御减伤） */
    calcDamage(rawDamage: number): number {
        return Math.floor(rawDamage * (100 / (100 + this.def)));
    }

    /** 受到伤害 */
    takeDamage(rawDamage: number, source?: BattleUnit): number {
        const actual = this.calcDamage(rawDamage);
        this.hp = Math.max(0, this.hp - actual);
        this.damageTaken += actual;

        // 记录伤害来源（用于助攻判定）
        if (source) {
            this._damageSources.add(source.uid);
        }

        if (this.hp <= 0) {
            this.die();
            if (source) {
                source.kills++;
                const reward = BattleUnit._constants.energy.killReward;
                source.energy = Math.min(source.maxEnergy, source.energy + reward);

                // 助攻：所有对死者造成过伤害的非击杀者获得助攻
                for (const attackerUid of this._damageSources) {
                    if (attackerUid !== source.uid) {
                        // 需要从外部查找单位，这里用回调机制
                        BattleUnit._onAssistCallback?.(attackerUid);
                    }
                }

                console.log(`[击杀] ${source.tag} 击败 ${this.tag} | 伤害:${actual} 能量:${source.energy}/${source.maxEnergy}`);
            }
        }
        return actual;
    }

    /** 回血，返回实际治疗量 */
    heal(amount: number): number {
        const before = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + Math.floor(amount));
        return this.hp - before;
    }

    /** 死亡 */
    die(): void {
        this.isAlive = false;
        this.state = UnitState.DEAD;
        this.hp = 0;
        this.target = null;
    }

    get canAct(): boolean {
        return this.isAlive && !this.isStunned && !this.isFeared && !this.isFrozen;
    }

    get canMove(): boolean {
        return this.isAlive && !this.isStunned && !this.isFrozen;
    }

    get effectiveSpeed(): number {
        return this.isSlowed ? this.spd * this.slowFactor : this.spd;
    }

    get hpPercent(): number {
        return this.maxHp > 0 ? this.hp / this.maxHp : 0;
    }

    get energyPercent(): number {
        return this.maxEnergy > 0 ? this.energy / this.maxEnergy : 0;
    }

    /** 到另一个单位的距离 */
    distanceTo(other: BattleUnit): number {
        const dx = this.position.x - other.position.x;
        const dy = this.position.y - other.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
