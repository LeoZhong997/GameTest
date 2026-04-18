/**
 * SynergyData - 种族羁绊配置与运行时数据模型
 */

/** 羁绊效果 */
export interface SynergyEffect {
    stat: string;       // 影响的属性：atk / def / atkSpd / hp 等
    value: number;      // 百分比值（正=增益，负=减益）
    scope: 'race' | 'team' | 'enemy';  // 作用范围
}

/** 羁绊档位 */
export interface SynergyTier {
    threshold: number;              // 激活所需兵种种类数
    effects: SynergyEffect[];
}

/** 羁绊配置（从 synergies.json 加载） */
export interface SynergyConfig {
    race: string;           // 种族标识（human/beast/spirit/demon/mixed）
    name: string;           // 显示名称
    tiers: SynergyTier[];
}

/** 已激活的羁绊（运行时） */
export interface ActiveSynergy {
    config: SynergyConfig;
    activatedTier: number;  // 激活的最高档位索引（0-based）
    typeCount: number;      // 当前种类数
}
