/**
 * RelicData - 圣物数据模型
 */

/** 圣物配置（来自 relics.json） */
export interface RelicConfig {
    id: string;
    name: string;
    race?: string | null;   // 种族限制（可选）
    role?: string | null;   // 角色限制（可选）
    description: string;
}

/** 圣物属性类型 */
export type RelicStatType = 'atk' | 'hp' | 'def' | 'atkSpd';

/** 圣物属性条目 */
export interface RelicStat {
    stat: RelicStatType;
    value: number;   // 百分比值（如 5.0 = 5%）
}

/** 圣物实例（存储在 PlayerData.relics 中） */
export interface RelicInstance {
    uid: string;
    configId: string;
    quality: string;        // green/blue/purple/gold
    level: number;          // 1-20
    mainStat: RelicStat;    // 随机主属性，随等级成长
    subStats: RelicStat[];  // 5/10/15 级各加一个，最多 3 个
    equippedTo?: string;    // 装备到的 unitUid
}

/** 属性显示名 */
export const STAT_NAMES: Record<RelicStatType, string> = {
    atk: '攻击',
    hp: '生命',
    def: '防御',
    atkSpd: '攻速',
};
