/**
 * PlayerData - 玩家数据模型
 */

import { UnitInstanceData, Quality } from './UnitData';
import { RelicInstance } from './RelicData';
import { DungeonProgress } from './DungeonData';

/** 存档版本号（结构变更时递增，用于迁移） */
export const SAVE_VERSION = 7;

export interface PlayerData {
    version: number;
    uid: string;
    name: string;
    level: number;
    exp: number;

    // 货币
    gold: number;              // 金币（通用货币）
    crystals: number;          // 钻石（高级货币）

    // 推图进度
    currentChapter: number;
    currentStage: number;
    highestChapter: number;
    highestStage: number;

    // 拥有的兵种实例（uid -> UnitInstanceData）
    units: Record<string, UnitInstanceData>;

    // 物品背包（itemId -> 数量）
    inventory: Record<string, number>;

    // 已通关关卡（首通奖励判断）
    clearedStages: string[];

    // 离线
    lastOnlineTime: number;
    offlineRewardHours: number; // 默认 8，月卡 10

    // 建筑
    buildings: Record<string, number>; // buildingId -> level

    // 圣物实例（uid -> RelicInstance）
    relics: Record<string, RelicInstance>;

    // 副本进度（dungeonType -> DungeonProgress）
    dungeons: Record<string, DungeonProgress>;

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
        gold: 100,
        crystals: 0,
        currentChapter: 1,
        currentStage: 1,
        highestChapter: 0,
        highestStage: 0,
        units: starterUnits,
        clearedStages: [],
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
        relics: {},
        dungeons: {},
        createdAt: now,
        lastSaveTime: now,
    };
}
