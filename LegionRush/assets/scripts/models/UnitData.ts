/**
 * UnitData - 兵种数据模型
 */

/** 种族 */
export enum Race {
    GOBLIN = 'goblin',
    DEMON = 'demon',
    HUMAN = 'human',
    UNDEAD = 'undead',
    NEUTRAL = 'neutral'
}

/** 稀有度 */
export enum Rarity {
    NORMAL = 'normal',
    RARE = 'rare',
    LEGENDARY = 'legendary'
}

/** 角色定位 */
export enum Role {
    TANK = 'tank',
    DAMAGE = 'damage',
    CONTROL = 'control',
    ASSASSIN = 'assassin',
    SUPPORT = 'support',
    CAVALRY = 'cavalry',
    RANGED = 'ranged',
    MAGE = 'mage'
}

/** 品质等级 */
export enum Quality {
    GREEN = 'green',
    BLUE = 'blue',
    PURPLE = 'purple',
    GOLD = 'gold',
    GOLD1 = 'gold1',
    GOLD2 = 'gold2',
    GOLD3 = 'gold3'
}

/** 评级 */
export enum Rating {
    B = 'B',
    B_PLUS = 'B+',
    A = 'A',
    A_PLUS = 'A+',
    S = 'S',
    S_PLUS = 'S+'
}

/** 单位属性 */
export interface UnitStats {
    hp: number;
    atk: number;
    def: number;
    spd: number;       // 移动速度
    range: number;     // 攻击距离
    atkSpd: number;    // 每秒攻击次数
    critRate: number;  // 暴击率
    critDmg: number;   // 暴击倍率
}

/** 属性成长 */
export interface StatGrowths {
    hp: number;
    atk: number;
    def: number;
    spd: number;
}

/** 兵种配置（来自 JSON） */
export interface UnitConfig {
    id: string;
    name: string;
    race: Race;
    rarity: Rarity;
    role: Role;
    description: string;
    baseStats: UnitStats;
    growths: StatGrowths;
    skills: string[];
    unlockRating: Rating;
    passiveAPlus: string;
    ultimate?: string;
}

/** 玩家拥有的兵种实例数据 */
export interface UnitInstanceData {
    configId: string;
    uid: string;
    level: number;
    quality: Quality;
    rating: Rating;
    exp: number;
    skillLevels: number[];
    evolutionBranch?: string;
}
