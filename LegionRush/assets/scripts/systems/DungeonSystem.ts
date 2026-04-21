/**
 * DungeonSystem - 副本核心系统
 * 管理：进入检查、敌人生成、奖励计算、日/周重置
 */

import { DungeonType, DungeonProgress, DungeonRewards, createDefaultProgress } from '../models/DungeonData';
import { StageEnemy } from '../models/StageData';
import { GameConfig } from '../core/GameConfig';
import { PlayerManager } from './PlayerManager';
import { EventBus } from '../core/EventBus';

/** 副本配置（从 constants.json 加载） */
interface DungeonConfigs {
    relic: RelicDungeonConfig;
    timedCampaign: TimedCampaignConfig;
    stronghold: StrongholdConfig;
    chainAssault: ChainAssaultConfig;
}

interface RelicDungeonConfig {
    maxLayers: number;
    dailySmallLimit: number;
    unlockStage: { chapter: number; stage: number };
    essencePerLayer: number[];
    goldPerLayer: number[];
    enemyScalePerLayer: number;
}

interface TimedCampaignConfig {
    stages: number;
    freeStages: number;
    weeklyAttemptLimit: number;
    raceRotation: string[];
    unlockStage: { chapter: number; stage: number };
    crystalsPerStage: number[];
    expPerStage: number[];
}

interface StrongholdConfig {
    waves: number;
    unlockStage: { chapter: number; stage: number };
    goldPerWave: number[];
    itemDrops: { id: string; count: number; probability: number }[];
}

interface ChainAssaultConfig {
    dailyAttempts: number;
    refreshCost: number;
    maxStars: number;
    unlockStage: { chapter: number; stage: number };
    starRewards: Record<string, { gold: number; items?: { id: string; count: number }[] }>;
}

/** 所有种族的所有兵种 configId（用于敌人生成） */
const RACE_UNIT_POOLS: Record<string, string[]> = {
    human: ['iron_guard', 'swordsman', 'mage', 'apothecary', 'shadow_blade'],
    beast: ['bone_golem', 'berserker', 'thunder_shaman', 'witch_doctor', 'blood_moon'],
    spirit: ['treant', 'blade_dancer', 'wind_archer', 'moon_singer', 'faceless'],
    demon: ['demon_golem', 'demon_blade', 'shadow_demon', 'warlock', 'nightmare'],
};

/** 所有兵种（不限种族） */
const ALL_UNITS = Object.values(RACE_UNIT_POOLS).flat();

/** 角色对应的行偏好（坦克前排，远程后排等） */
const ROLE_ROW_MAP: Record<string, number> = {
    tank: 0, melee: 0, assassin: 0,
    ranged: 1, support: 1,
};

export class DungeonSystem {
    private static _instance: DungeonSystem | null = null;
    static get instance(): DungeonSystem {
        if (!DungeonSystem._instance) DungeonSystem._instance = new DungeonSystem();
        return DungeonSystem._instance;
    }

    private _configs: DungeonConfigs | null = null;

    /** 从 constants.json 加载配置 */
    init(dungeonConstants: any): void {
        this._configs = dungeonConstants as DungeonConfigs;
        console.log('[DungeonSystem] 初始化完成');

        // 监听副本战斗结束
        EventBus.instance.on('dungeon:battle_end', this.onDungeonBattleEnd, this);
    }

    // ---- 进度管理 ----

    /** 获取或创建副本进度 */
    getProgress(type: DungeonType): DungeonProgress {
        const pm = PlayerManager.instance;
        if (!pm.data.dungeons) pm.data.dungeons = {};
        if (!pm.data.dungeons[type]) {
            pm.data.dungeons[type] = createDefaultProgress(type);
        }
        return pm.data.dungeons[type];
    }

    /** 检查日/周重置 */
    checkAndReset(type: DungeonType): void {
        const progress = this.getProgress(type);
        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;

        // 日重置
        const lastDay = new Date(progress.dailyResetTime);
        const today = new Date(now);
        if (lastDay.toDateString() !== today.toDateString()) {
            progress.dailyClears = 0;
            progress.dailyResetTime = now;
        }

        // 周重置（限时征讨）
        if (type === 'timed_campaign') {
            const weekMs = 7 * DAY_MS;
            if (now - progress.weeklyResetTime > weekMs || progress.weeklyResetTime === 0) {
                progress.weeklyAttempts = 0;
                progress.weeklyResetTime = now;
                progress.weeklyRace = this.getCurrentWeekRace();
            }
        }
    }

    /** 检查是否解锁 — 目前全部直接开放 */
    isUnlocked(_type: DungeonType): boolean {
        return true;
    }

    /** 检查能否进入 */
    canEnter(type: DungeonType): { ok: boolean; reason?: string } {
        if (!this.isUnlocked(type)) return { ok: false, reason: '尚未解锁' };
        this.checkAndReset(type);
        const progress = this.getProgress(type);

        switch (type) {
            case 'relic': {
                const limit = this._configs!.relic.dailySmallLimit;
                if (progress.dailyClears >= limit) return { ok: false, reason: `今日次数已用完(${limit}/${limit})` };
                return { ok: true };
            }
            case 'timed_campaign': {
                const limit = this._configs!.timedCampaign.weeklyAttemptLimit;
                if (progress.weeklyAttempts >= limit) return { ok: false, reason: `本周次数已用完` };
                return { ok: true };
            }
            case 'stronghold': {
                // 每天可打3次
                if (progress.dailyClears >= 3) return { ok: false, reason: '今日次数已用完' };
                return { ok: true };
            }
            case 'chain_assault': {
                const limit = this._configs!.chainAssault.dailyAttempts;
                if (progress.dailyClears >= limit) return { ok: false, reason: `今日次数已用完(${limit}/${limit})` };
                return { ok: true };
            }
        }
        return { ok: true };
    }

    // ---- 圣物副本 ----

    /** 计算前5单位战力 */
    getTop5Power(): number {
        const pm = PlayerManager.instance;
        if (!pm.isLoaded) return 100;
        const units = pm.getAllUnits();
        const qm = GameConfig.instance.constants?.qualityMultipliers || {};
        const powers = units.map(u => {
            const cfg = GameConfig.instance.getUnitConfig(u.configId);
            if (!cfg) return 0;
            const mult = (qm as any)[u.quality] || 1.0;
            const bs = cfg.baseStats;
            return (bs.hp + bs.atk * 10 + bs.def * 5) * mult * (1 + u.level * 0.1);
        });
        powers.sort((a, b) => b - a);
        return powers.slice(0, 5).reduce((s, v) => s + v, 0);
    }

    /** 生成圣物副本敌人 */
    generateRelicEnemies(layer: number): StageEnemy[] {
        const cfg = this._configs!.relic;
        const power = this.getTop5Power();
        const scale = 1 + (layer - 1) * cfg.enemyScalePerLayer;
        const targetPower = power * scale * 0.12; // 缩放到合适难度

        // 随机选 5 个兵种
        const enemies: StageEnemy[] = [];
        const count = 5;
        const used = new Set<string>();

        for (let i = 0; i < count; i++) {
            let unitId: string;
            do {
                unitId = ALL_UNITS[Math.floor(Math.random() * ALL_UNITS.length)];
            } while (used.has(unitId));
            used.add(unitId);

            const unitCfg = GameConfig.instance.getUnitConfig(unitId);
            const bs = unitCfg?.baseStats;
            const unitPower = bs ? (bs.hp + bs.atk * 10 + bs.def * 5) : 500;
            const level = Math.max(1, Math.round(targetPower / (unitPower * (0.8 + Math.random() * 0.4))));
            const qualityIndex = Math.min(Math.floor(layer / 2), 3);
            const qualities = ['green', 'blue', 'purple', 'gold'];

            enemies.push({
                configId: unitId,
                level: Math.min(level, 20),
                quality: qualities[qualityIndex],
                gridRow: ROLE_ROW_MAP[unitCfg?.role || 'melee'] || 0,
                gridCol: i % 3,
            });
        }
        return enemies;
    }

    /** 计算圣物副本奖励 */
    calculateRelicRewards(layer: number): DungeonRewards {
        const cfg = this._configs!.relic;
        const idx = Math.min(layer - 1, cfg.essencePerLayer.length - 1);
        return {
            gold: cfg.goldPerLayer[idx],
            crystals: 0,
            exp: 0,
            relicEssence: cfg.essencePerLayer[idx],
        };
    }

    /** 获取圣物副本当前可挑战层 */
    getRelicCurrentLayer(): number {
        const progress = this.getProgress('relic');
        const maxLayers = this._configs!.relic.maxLayers;
        return Math.min(progress.highestLayer + 1, maxLayers);
    }

    // ---- 限时征讨 ----

    /** 获取本周限定种族 */
    getCurrentWeekRace(): string {
        const rotation = this._configs?.timedCampaign.raceRotation || ['human', 'beast', 'spirit', 'demon'];
        const weekNum = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
        return rotation[weekNum % rotation.length];
    }

    /** 生成限时征讨敌人 */
    generateTimedEnemies(stage: number): StageEnemy[] {
        const cfg = this._configs!.timedCampaign;
        const isRaceRestricted = stage > cfg.freeStages;
        const race = this.getCurrentWeekRace();
        const pool = isRaceRestricted ? (RACE_UNIT_POOLS[race] || ALL_UNITS) : ALL_UNITS;

        // 关卡越高难度越大
        const levelBase = 3 + stage * 2;
        const qualityIdx = Math.min(Math.floor(stage / 3), 3);
        const qualities = ['green', 'blue', 'purple', 'gold'];

        const enemies: StageEnemy[] = [];
        const count = 5;
        const used = new Set<string>();

        for (let i = 0; i < count; i++) {
            let unitId: string;
            do {
                unitId = pool[Math.floor(Math.random() * pool.length)];
            } while (used.has(unitId));
            used.add(unitId);

            const unitCfg = GameConfig.instance.getUnitConfig(unitId);
            enemies.push({
                configId: unitId,
                level: Math.min(levelBase + Math.floor(Math.random() * 3), 20),
                quality: qualities[qualityIdx],
                gridRow: ROLE_ROW_MAP[unitCfg?.role || 'melee'] || 0,
                gridCol: i % 3,
            });
        }
        return enemies;
    }

    /** 计算限时征讨奖励 */
    calculateTimedRewards(stage: number): DungeonRewards {
        const cfg = this._configs!.timedCampaign;
        const idx = Math.min(stage - 1, cfg.crystalsPerStage.length - 1);
        return {
            gold: 0,
            crystals: cfg.crystalsPerStage[idx],
            exp: cfg.expPerStage[idx],
        };
    }

    // ---- 据点防守 ----

    /** 生成据点防守敌人 */
    generateStrongholdEnemies(wave: number): StageEnemy[] {
        const level = 5 + wave * 3;
        const qualityIdx = Math.min(wave - 1, 2);
        const qualities = ['green', 'blue', 'purple'];

        // 远程偏重：更多远程+辅助
        const rangedPool = [...(RACE_UNIT_POOLS.human), ...(RACE_UNIT_POOLS.spirit)];
        const enemies: StageEnemy[] = [];
        const count = 5;

        for (let i = 0; i < count; i++) {
            const unitId = rangedPool[Math.floor(Math.random() * rangedPool.length)];
            const unitCfg = GameConfig.instance.getUnitConfig(unitId);
            enemies.push({
                configId: unitId,
                level: Math.min(level, 20),
                quality: qualities[qualityIdx],
                gridRow: ROLE_ROW_MAP[unitCfg?.role || 'ranged'] || 1,
                gridCol: i % 3,
            });
        }
        return enemies;
    }

    /** 计算据点防守奖励 */
    calculateStrongholdRewards(wave: number): DungeonRewards {
        const cfg = this._configs!.stronghold;
        const idx = Math.min(wave - 1, cfg.goldPerWave.length - 1);
        const items = cfg.itemDrops.map(d => ({
            id: d.id,
            count: d.count,
            probability: d.probability,
        }));
        return { gold: cfg.goldPerWave[idx], crystals: 0, exp: 0, items };
    }

    // ---- 连环突击 ----

    /** 生成连环突击敌人（基于日期种子） */
    generateChainEnemies(): StageEnemy[] {
        const today = new Date().toDateString();
        let seed = 0;
        for (let i = 0; i < today.length; i++) seed += today.charCodeAt(i);

        const pm = PlayerManager.instance;
        const level = Math.max(3, Math.round((pm.data.highestChapter || 1) * 5 + (pm.data.highestStage || 1) * 0.5));

        const enemies: StageEnemy[] = [];
        const count = 5;

        for (let i = 0; i < count; i++) {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            const unitId = ALL_UNITS[seed % ALL_UNITS.length];
            const unitCfg = GameConfig.instance.getUnitConfig(unitId);
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            const qIdx = seed % 3;
            const qualities = ['green', 'blue', 'purple'];

            enemies.push({
                configId: unitId,
                level: Math.min(level + Math.floor(Math.random() * 3), 20),
                quality: qualities[qIdx],
                gridRow: ROLE_ROW_MAP[unitCfg?.role || 'melee'] || 0,
                gridCol: i % 3,
            });
        }
        return enemies;
    }

    /** 计算星级 */
    calculateStars(leftSurvivors: number, totalLeft: number): number {
        const ratio = totalLeft > 0 ? leftSurvivors / totalLeft : 0;
        if (ratio >= 0.8) return 3;
        if (ratio >= 0.5) return 2;
        if (ratio > 0) return 1;
        return 0;
    }

    /** 计算连环突击奖励 */
    calculateChainRewards(stars: number): DungeonRewards {
        const cfg = this._configs!.chainAssault;
        const reward = cfg.starRewards[String(stars)];
        if (!reward) return { gold: 0, crystals: 0, exp: 0 };
        const items = reward.items?.map(it => ({ id: it.id, count: it.count, probability: 1.0 }));
        return { gold: reward.gold, crystals: 0, exp: 0, items };
    }

    // ---- 战斗结束处理 ----

    /** 副本战斗结束（独立于 PlayerManager.onBattleEnd） */
    private onDungeonBattleEnd(data: { type: DungeonType; layer: number; result: string; report: any }): void {
        const { type, layer, result, report } = data;
        if (result !== 'win') {
            console.log(`[DungeonSystem] ${type} 第${layer}层 战败，不扣次数`);
            PlayerManager.instance.save();
            return;
        }

        const pm = PlayerManager.instance;
        let rewards: DungeonRewards;

        switch (type) {
            case 'relic': {
                rewards = this.calculateRelicRewards(layer);
                const progress = this.getProgress(type);
                if (layer > progress.highestLayer) progress.highestLayer = layer;
                progress.dailyClears++;
                break;
            }
            case 'timed_campaign': {
                rewards = this.calculateTimedRewards(layer);
                const progress = this.getProgress(type);
                if (layer > progress.highestLayer) progress.highestLayer = layer;
                progress.weeklyAttempts++;
                break;
            }
            case 'stronghold': {
                rewards = this.calculateStrongholdRewards(layer);
                const progress = this.getProgress(type);
                progress.dailyClears++;
                if (layer > progress.highestLayer) progress.highestLayer = layer;
                break;
            }
            case 'chain_assault': {
                const stars = this.calculateStars(report.leftSurvivors, report.totalLeft);
                rewards = this.calculateChainRewards(stars);
                const progress = this.getProgress(type);
                progress.dailyClears++;
                progress.chainStars.push(stars);
                break;
            }
            default:
                return;
        }

        // 发放奖励
        if (rewards.gold > 0) pm.addCurrency('gold', rewards.gold);
        if (rewards.crystals > 0) pm.addCurrency('crystals', rewards.crystals);
        if (rewards.relicEssence) pm.addItem('relic_essence', rewards.relicEssence);
        if (rewards.items) {
            for (const item of rewards.items) {
                if (Math.random() < item.probability) {
                    pm.addItem(item.id, item.count);
                }
            }
        }
        // 经验分给所有出战单位
        if (rewards.exp > 0) {
            // 战斗中存活的单位获得经验
            EventBus.instance.emit('dungeon:exp_reward', rewards.exp);
        }

        pm.save();
        console.log(`[DungeonSystem] ${type} 第${layer}层 通关！奖励: ${JSON.stringify(rewards)}`);

        // 通知 UI
        EventBus.instance.emit('dungeon:complete', { type, layer, rewards });
    }

    // ---- 辅助 ----

    private getUnlockStage(type: DungeonType): { chapter: number; stage: number } | null {
        if (!this._configs) return null;
        switch (type) {
            case 'relic': return this._configs.relic.unlockStage;
            case 'timed_campaign': return this._configs.timedCampaign.unlockStage;
            case 'stronghold': return this._configs.stronghold.unlockStage;
            case 'chain_assault': return this._configs.chainAssault.unlockStage;
        }
        return null;
    }

    /** 获取解锁条件文本 */
    getUnlockText(type: DungeonType): string {
        const stage = this.getUnlockStage(type);
        if (!stage) return '';
        return `通关 ${stage.chapter}-${stage.stage} 解锁`;
    }
}
