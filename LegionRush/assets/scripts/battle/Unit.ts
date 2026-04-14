/**
 * Unit - 战斗单位（运行时）
 * 包含属性、状态机、技能、Buff
 */

import { Vec2 } from 'cc';
import { UnitConfig, UnitStats, Quality } from '../models/UnitData';
import { SkillState } from '../models/SkillData';
import { BuffSystem } from './BuffSystem';

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

    private static _nextUid = 0;

    constructor(config: UnitConfig, team: TeamSide, level: number = 1, quality: Quality = Quality.GREEN) {
        this.uid = `u${BattleUnit._nextUid++}`;
        this.configId = config.id;
        this.config = config;
        this.team = team;
        this.level = level;
        this.quality = quality;
        this.buffs = new BuffSystem(this);

        this.calculateStats();
        this.hp = this.maxHp;
        this.initSkills();
    }

    /** 根据等级和品质计算最终属性 */
    private calculateStats(): void {
        const base = this.config.baseStats;
        const growth = this.config.growths;
        const lvl = this.level - 1;
        const qm = this.getQualityMultiplier();

        this.maxHp = Math.floor((base.hp + growth.hp * lvl) * qm);
        this.atk = Math.floor((base.atk + growth.atk * lvl) * qm);
        this.def = Math.floor((base.def + growth.def * lvl) * qm);
        this.spd = base.spd * 60;         // 转 像素/秒
        this.range = base.range * 50;      // 转 像素
        this.atkSpd = base.atkSpd;
        this.critRate = base.critRate;
        this.critDmg = base.critDmg;
    }

    private getQualityMultiplier(): number {
        const map: Record<string, number> = {
            [Quality.GREEN]: 1.0,
            [Quality.BLUE]: 1.3,
            [Quality.PURPLE]: 1.7,
            [Quality.GOLD]: 2.2,
            [Quality.GOLD1]: 2.6,
            [Quality.GOLD2]: 3.0,
            [Quality.GOLD3]: 3.5,
        };
        return map[this.quality] ?? 1.0;
    }

    private initSkills(): void {
        this.skills = this.config.skills.map(id => ({
            configId: id,
            level: 1,
            currentCd: 3 + Math.random() * 5, // 初始CD 3~8秒，避免开局全屏控制链
            energy: 0,
            maxEnergy: 100,
        }));
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

        if (this.hp <= 0) {
            this.die();
            if (source) source.kills++;
        }
        return actual;
    }

    /** 回血 */
    heal(amount: number): void {
        this.hp = Math.min(this.maxHp, this.hp + Math.floor(amount));
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

    /** 到另一个单位的距离 */
    distanceTo(other: BattleUnit): number {
        const dx = this.position.x - other.position.x;
        const dy = this.position.y - other.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
