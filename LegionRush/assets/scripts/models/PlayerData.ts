/**
 * PlayerData - 玩家数据模型
 */

export interface PlayerData {
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

    // 拥有的兵种 UID 列表
    unitUids: string[];

    // 离线
    lastOnlineTime: number;
    offlineRewardHours: number; // 默认 8，月卡 10

    // 建筑
    buildings: Record<string, number>; // buildingId -> level

    // 时间戳
    createdAt: number;
    lastSaveTime: number;
}

/** 创建默认玩家数据 */
export function createDefaultPlayerData(name: string = '魔王'): PlayerData {
    return {
        uid: `player_${Date.now()}`,
        name,
        level: 1,
        exp: 0,
        crystals: 0,
        magicCrystals: 0,
        tokens: 10,          // 初始筹码
        bottleCaps: 0,
        arenaCoins: 0,
        relicFragments: 0,
        currentChapter: 1,
        currentStage: 1,
        highestChapter: 1,
        highestStage: 1,
        unitUids: [],
        lastOnlineTime: Date.now(),
        offlineRewardHours: 8,
        buildings: {},
        createdAt: Date.now(),
        lastSaveTime: Date.now(),
    };
}
