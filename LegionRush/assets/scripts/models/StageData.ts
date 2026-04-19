/**
 * StageData - 关卡数据模型
 */

/** 关卡配置（来自 stages.json） */
export interface StageConfig {
    id: string;                // "1-1"
    chapter: number;
    stage: number;
    type: 'normal' | 'miniBoss' | 'boss';
    name: string;
    recommendedLevel: number;
    enemies: StageEnemy[];
    rewards: StageRewards;
}

/** 关卡中的敌人定义 */
export interface StageEnemy {
    configId: string;
    level: number;
    quality: string;
    gridRow: number;
    gridCol: number;
}

/** 关卡奖励 */
export interface StageRewards {
    exp: number;
    gold: number;
    crystals: number;
    items?: StageItemDrop[];
    firstClearBonus?: { crystals: number };
}

/** 物品掉落 */
export interface StageItemDrop {
    id: string;
    count: number;
    probability: number;  // 0-1
}

// ---- 三选一奖励系统 ----

/** 掉落池条目（用于加权随机） */
export interface DropPoolEntry {
    itemId: string;
    weight: number;
    countMin: number;
    countMax: number;
    name: string;
    rarity: string;       // "common" | "rare" | "epic"
}

/** 章节掉落池（按关卡类型分） */
export interface ChapterDropPools {
    normal: DropPoolEntry[];
    miniBoss: DropPoolEntry[];
    boss: DropPoolEntry[];
}

/** 三选一奖励选项（发给 UI） */
export interface RewardOption {
    itemId: string;
    name: string;
    count: number;
    rarity: string;
}
