/**
 * BattleOrderData - 军令数据模型
 * 战前选择1条军令，给全军或部分单位施加临时buff
 */

/** 军令配置（来自 battleOrders.json） */
export interface BattleOrderConfig {
    id: string;
    name: string;
    description: string;
    icon: string;           // emoji 图标
    effects: BattleOrderEffect[];
}

/** 军令效果 */
export interface BattleOrderEffect {
    stat: string;           // 'atk', 'atkSpd', 'def', 'spd', 'hp' 等
    value: number;          // 百分比（如 0.2 = +20%）
    duration: number;       // 秒, 9999=整场
    scope: 'team' | 'frontline' | 'backline' | 'enemy_backline' | 'melee' | 'assassin' | 'ranged' | 'support';
    triggerDelay?: number;  // 触发延迟（秒），0或不设=开战即触发
}
