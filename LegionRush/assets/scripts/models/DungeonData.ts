/**
 * DungeonData - 副本数据模型
 * 定义副本类型、进度、奖励等接口
 */

import { StageEnemy, StageItemDrop } from './StageData';
import { DUNGEON_LABELS } from '../core/DisplayNames';

/** 副本类型 */
export type DungeonType = 'relic' | 'timed_campaign' | 'stronghold' | 'chain_assault';

/** 副本进度（每种类型独立追踪） */
export interface DungeonProgress {
    type: DungeonType;
    highestLayer: number;       // 最高通关层数
    dailyClears: number;        // 今日已通关次数
    dailyResetTime: number;     // 上次日重置时间戳
    weeklyAttempts: number;     // 本周已用次数（限时征讨）
    weeklyResetTime: number;    // 上次周重置时间戳
    weeklyRace: string;         // 本周限定种族（限时征讨）
    chainStars: number[];       // 连环突击每关星级
}

/** 副本奖励 */
export interface DungeonRewards {
    gold: number;
    crystals: number;
    exp: number;
    relicEssence?: number;
    items?: StageItemDrop[];
}

/** 副本标签定义 */
export const DUNGEON_DEFS: { key: DungeonType; label: string }[] = [
    { key: 'relic', label: DUNGEON_LABELS.relic },
    { key: 'timed_campaign', label: DUNGEON_LABELS.timed_campaign },
    { key: 'stronghold', label: DUNGEON_LABELS.stronghold },
    { key: 'chain_assault', label: DUNGEON_LABELS.chain_assault },
];

/** 创建默认副本进度 */
export function createDefaultProgress(type: DungeonType): DungeonProgress {
    return {
        type,
        highestLayer: 0,
        dailyClears: 0,
        dailyResetTime: 0,
        weeklyAttempts: 0,
        weeklyResetTime: 0,
        weeklyRace: '',
        chainStars: [],
    };
}
