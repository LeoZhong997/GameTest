/**
 * SkillData - 技能数据模型
 */

/** 技能类型 */
export enum SkillType {
    DAMAGE = 'damage',
    HEAL = 'heal',
    BUFF = 'buff',
    DEBUFF = 'debuff',
    CONTROL = 'control',
    SUMMON = 'summon',
    AOE = 'aoe',
    CHARGE = 'charge'
}

/** 目标类型 */
export enum TargetType {
    SELF = 'self',
    ENEMY_NEAREST = 'enemy_nearest',
    ENEMY_ALL = 'enemy_all',
    ENEMY_RANGE = 'enemy_range',
    ALLY_NEAREST = 'ally_nearest',
    ALLY_ALL = 'ally_all',
    ALLY_LOWEST_HP = 'ally_lowest_hp',
    POSITION = 'position'
}

/** 控制类型 */
export enum ControlType {
    STUN = 'stun',
    FEAR = 'fear',
    FREEZE = 'freeze',
    SLOW = 'slow',
    SILENCE = 'silence'
}

/** 技能效果 */
export interface SkillEffect {
    type: SkillType;
    targetType: TargetType;
    value: number;           // 基础数值（伤害/治疗量）
    ratio: number;           // ATK 加成系数
    range: number;           // AOE 范围
    duration: number;        // 持续时间（秒）
    controlType?: ControlType;
    summonId?: string;       // 召唤单位 ID
    summonCount?: number;    // 召唤数量
}

/** 技能配置（来自 JSON） */
export interface SkillConfig {
    id: string;
    name: string;
    description: string;
    type: SkillType;
    effects: SkillEffect[];
    cooldown: number;        // 冷却时间（秒）
    castTime: number;        // 施法时间（秒）
    range: number;           // 施法距离
    unlockRating: string;
    initialCd: number;       // 战斗开始时的初始 CD（秒）
    energyCost: number;      // 能量消耗（0 = 免费）
    maxUses: number;         // 最大使用次数（0 = 无限）
}

/** 运行时技能状态 */
export interface SkillState {
    configId: string;
    level: number;
    currentCd: number;       // 剩余冷却
    energy: number;          // 必杀技能量（已废弃，改用 Unit.energy）
    maxEnergy: number;
    uses: number;            // 已使用次数
}
