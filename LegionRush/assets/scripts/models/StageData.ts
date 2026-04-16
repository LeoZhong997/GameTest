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
    count: number;
    gridRow: number;
    gridCol: number;
}

/** 关卡奖励 */
export interface StageRewards {
    exp: number;
    crystals: number;
    tokens: number;
    bottleCaps: number;
    items?: StageItemDrop[];
    firstClearBonus?: { crystals: number; tokens: number };
}

/** 物品掉落 */
export interface StageItemDrop {
    id: string;
    count: number;
    probability: number;  // 0-1
}
