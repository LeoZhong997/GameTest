/**
 * PlayerData - 玩家数据模型
 */

import { UnitInstanceData, Quality } from './UnitData';

/** 存档版本号（结构变更时递增，用于迁移） */
export const SAVE_VERSION = 3;

export interface PlayerData {
    version: number;
    uid: string;
    name: string;
    level: number;
    exp: number;

    // 货币
    crystals: number;          // 氪晶
    magicCrystals: number;     // 魔晶
    tokens: number;            // 筹码
    bottleCaps: number;        // 瓶盖
    arenaCoins: number;        // 竞技场币
    relicFragments: number;    // 宝物碎片

    // 推图进度
    currentChapter: number;
    currentStage: number;
    highestChapter: number;
    highestStage: number;

    // 拥有的兵种实例（uid -> UnitInstanceData）
    units: Record<string, UnitInstanceData>;

    // 物品背包（itemId -> 数量）
    inventory: Record<string, number>;

    // 离线
    lastOnlineTime: number;
    offlineRewardHours: number; // 默认 8，月卡 10

    // 建筑
    buildings: Record<string, number>; // buildingId -> level

    // 时间戳
    createdAt: number;
    lastSaveTime: number;
}

/** 生成唯一 uid */
function generateUid(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 创建默认玩家数据（赠送 5 个人族兵种） */
export function createDefaultPlayerData(name: string = '魔王'): PlayerData {
    const now = Date.now();
    const starterUnits: Record<string, UnitInstanceData> = {};
    const starterIds = ['iron_guard', 'swordsman', 'mage', 'apothecary', 'shadow_blade'];
    for (const configId of starterIds) {
        const uid = generateUid();
        starterUnits[uid] = {
            configId,
            uid,
            level: 1,
            quality: Quality.GREEN,
            rating: undefined as any,
            exp: 0,
            skillLevels: [1, 1, 1],
        };
    }

    return {
        version: SAVE_VERSION,
        uid: `player_${now}`,
        name,
        level: 1,
        exp: 0,
        crystals: 0,
        magicCrystals: 0,
        tokens: 10,
        bottleCaps: 0,
        arenaCoins: 0,
        relicFragments: 0,
        currentChapter: 1,
        currentStage: 1,
        highestChapter: 1,
        highestStage: 1,
        units: starterUnits,
        inventory: {
            'exp_book_s': 5,
            'exp_book_m': 2,
            'iron_guard_shard_green': 3,
            'swordsman_shard_green': 3,
            'mage_shard_green': 3,
            'apothecary_shard_green': 3,
            'shadow_blade_shard_green': 3,
        },
        lastOnlineTime: now,
        offlineRewardHours: 8,
        buildings: {},
        createdAt: now,
        lastSaveTime: now,
    };
}
