/**
 * PlayerManager - 玩家数据管理器
 * 管理玩家存档的加载、保存、变更
 * 监听 battle:end 发放奖励
 */

import { PlayerData, SAVE_VERSION, createDefaultPlayerData } from '../models/PlayerData';
import { UnitInstanceData, Quality } from '../models/UnitData';
import { SaveSystem } from '../core/SaveSystem';
import { EventBus } from '../core/EventBus';
import { BattleReport, BattleResult } from '../battle/BattleManager';
import { LevelSystem } from './LevelSystem';
import { StageManager } from './StageManager';
import { StageItemDrop } from '../models/StageData';
import { GameConfig } from '../core/GameConfig';

const SAVE_KEY = 'player';

export class PlayerManager {
    private static _instance: PlayerManager = null!;
    private _data: PlayerData | null = null;
    private _dirty: boolean = false;
    private _playingChapter: number = 0;
    private _playingStage: number = 0;

    public static get instance(): PlayerManager {
        if (!this._instance) {
            this._instance = new PlayerManager();
        }
        return this._instance;
    }

    get data(): PlayerData {
        if (!this._data) throw new Error('[PlayerManager] 数据未加载，请先调用 init()');
        return this._data;
    }

    get isLoaded(): boolean {
        return this._data !== null;
    }

    /** 初始化：从存档加载或创建默认数据 */
    async init(): Promise<void> {
        const saved = SaveSystem.instance.load<PlayerData>(SAVE_KEY, null as any);
        if (saved && saved.version === SAVE_VERSION) {
            this._data = saved;
            console.log(`[PlayerManager] 存档加载: ${this._data.name}, 关卡 ${this._data.currentChapter}-${this._data.currentStage}, ${Object.keys(this._data.units).length} 个兵种`);
        } else {
            this._data = createDefaultPlayerData();
            this.save();
            console.log('[PlayerManager] 新存档创建: 赠送 5 个人族兵种');
        }

        // 计算离线收益
        this.calculateOfflineRewards();

        // 监听战斗结束
        EventBus.instance.on('battle:end', this.onBattleEnd, this);

        EventBus.instance.emit('player:loaded', this._data);
    }

    /** 保存到本地 */
    save(): void {
        if (!this._data) return;
        this._data.lastSaveTime = Date.now();
        this._data.lastOnlineTime = Date.now();
        SaveSystem.instance.save(SAVE_KEY, this._data);
        this._dirty = false;
    }

    markDirty(): void {
        this._dirty = true;
    }

    /** 获取单位 */
    getUnit(uid: string): UnitInstanceData | null {
        return this._data?.units[uid] || null;
    }

    /** 获取所有单位 */
    getAllUnits(): UnitInstanceData[] {
        if (!this._data) return [];
        return Object.values(this._data.units);
    }

    /** 根据 configId 获取所有同配置的单位 */
    getUnitsByConfigId(configId: string): UnitInstanceData[] {
        return this.getAllUnits().filter(u => u.configId === configId);
    }

    /** 添加单位，返回 uid */
    addUnit(configId: string, quality: Quality = Quality.GREEN, level: number = 1): string {
        const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const unit: UnitInstanceData = {
            uid,
            configId,
            level,
            quality,
            rating: undefined as any,
            exp: 0,
            skillLevels: [1, 1, 1],
        };
        this._data!.units[uid] = unit;
        this.markDirty();
        return uid;
    }

    // --- 货币 ---

    addCurrency(type: string, amount: number): void {
        if (!this._data) return;
        if (type in this._data) {
            (this._data as any)[type] += amount;
        }
        this.markDirty();
    }

    spendCurrency(type: string, amount: number): boolean {
        if (!this._data) return false;
        if ((this._data as any)[type] >= amount) {
            (this._data as any)[type] -= amount;
            this.markDirty();
            return true;
        }
        return false;
    }

    // --- 物品 ---

    addItem(itemId: string, count: number): void {
        if (!this._data) return;
        if (!this._data.inventory) this._data.inventory = {};
        this._data.inventory[itemId] = (this._data.inventory[itemId] || 0) + count;
        this.markDirty();
    }

    removeItem(itemId: string, count: number): boolean {
        if (!this._data) return false;
        const have = this._data.inventory?.[itemId] || 0;
        if (have < count) return false;
        this._data.inventory[itemId] = have - count;
        this.markDirty();
        return true;
    }

    getItemCount(itemId: string): number {
        return this._data?.inventory?.[itemId] || 0;
    }

    /** 设置当前正在打的关卡（由 BattleScene 在开战前调用） */
    setPlayingStage(chapter: number, stage: number): void {
        this._playingChapter = chapter;
        this._playingStage = stage;
    }

    // --- 关卡推进 ---

    advanceStage(): void {
        if (!this._data) return;

        // 先把刚打完的关卡标记为最高进度
        const justCleared = this._data.currentChapter * 100 + this._data.currentStage;
        const prevHighest = this._data.highestChapter * 100 + this._data.highestStage;
        if (justCleared > prevHighest) {
            this._data.highestChapter = this._data.currentChapter;
            this._data.highestStage = this._data.currentStage;
        }

        // 推进到下一关（作为当前可玩关卡，不等于已通关）
        const next = StageManager.instance.getNextStage(this._data.currentChapter, this._data.currentStage);
        if (next) {
            this._data.currentChapter = next.chapter;
            this._data.currentStage = next.stage;
            this.markDirty();
            console.log(`[PlayerManager] 关卡推进: ${this._data.currentChapter}-${this._data.currentStage}，最高进度: ${this._data.highestChapter}-${this._data.highestStage}`);
            EventBus.instance.emit('stage:advanced', { chapter: this._data.currentChapter, stage: this._data.currentStage });
        }
    }

    // --- 战斗结束处理 ---

    private onBattleEnd(report: BattleReport): void {
        if (!this._data) return;

        if (report.result === BattleResult.WIN) {
            // 获取实际打的关卡配置
            const playedChapter = this._playingChapter || this._data.highestChapter;
            const playedStage = this._playingStage || this._data.highestStage;
            const stage = StageManager.instance.getCurrentStage(playedChapter, playedStage);
            if (!stage) {
                console.warn('[PlayerManager] 未找到关卡配置');
                return;
            }

            const playedValue = playedChapter * 100 + playedStage;
            const highest = this._data.highestChapter * 100 + this._data.highestStage;

            const rewards = stage.rewards;
            const rewardInfo: any = {
                stageId: stage.id,
                exp: rewards.exp,
                crystals: rewards.crystals,
                tokens: rewards.tokens,
                bottleCaps: rewards.bottleCaps,
                items: [] as any[],
                firstClear: false,
                firstClearBonus: null as any,
            };

            // 首通判定
            if (!this._data.clearedStages.includes(stage.id)) {
                rewardInfo.firstClear = true;
                this._data.clearedStages.push(stage.id);
                if (rewards.firstClearBonus) {
                    rewardInfo.firstClearBonus = rewards.firstClearBonus;
                    this.addCurrency('crystals', rewards.firstClearBonus.crystals || 0);
                    this.addCurrency('tokens', rewards.firstClearBonus.tokens || 0);
                    rewardInfo.crystals += rewards.firstClearBonus.crystals || 0;
                    rewardInfo.tokens += rewards.firstClearBonus.tokens || 0;
                }
            }

            // 发放经验给所有单位
            for (const uid of Object.keys(this._data.units)) {
                const unit = this._data.units[uid];
                const result = LevelSystem.instance.addExp(unit, rewards.exp);
                if (result.levelsGained > 0) {
                    EventBus.instance.emit('unit:leveled_up', { uid, oldLevel: result.oldLevel, newLevel: result.newLevel });
                }
            }

            // 发放货币
            this.addCurrency('crystals', rewards.crystals);
            this.addCurrency('tokens', rewards.tokens);
            this.addCurrency('bottleCaps', rewards.bottleCaps);

            // 发放物品（按概率掉落）
            if (rewards.items) {
                for (const drop of rewards.items) {
                    if (Math.random() < drop.probability) {
                        this.addItem(drop.id, drop.count);
                        rewardInfo.items.push(drop);
                    }
                }
            }

            // 推进关卡：打的关超过当前最高进度才推进
            if (playedValue > highest) {
                this.advanceStage();
            } else {
                console.log(`[PlayerManager] 重玩关卡 ${playedChapter}-${playedStage}，不推进进度`);
            }

            console.log(`[PlayerManager] 奖励发放: EXP+${rewards.exp} 氪晶+${rewardInfo.crystals} 筹码+${rewardInfo.tokens} 瓶盖+${rewards.bottleCaps}${rewardInfo.firstClear ? ' (首通)' : ''}`);
            if (rewardInfo.items.length > 0) {
                console.log(`[PlayerManager] 物品掉落: ${rewardInfo.items.map((i: any) => `${i.id}x${i.count}`).join(', ')}`);
            }

            EventBus.instance.emit('rewards:distributed', rewardInfo);
        }

        this.save();
    }

    // --- 离线收益 ---

    private calculateOfflineRewards(): void {
        if (!this._data || !this._data.lastOnlineTime) return;

        const now = Date.now();
        const elapsed = now - this._data.lastOnlineTime;
        const maxMs = (this._data.offlineRewardHours || 8) * 3600 * 1000;
        const offlineMs = Math.min(elapsed, maxMs);

        // 至少离线 60 秒才发放
        if (offlineMs < 60000) {
            this._data.lastOnlineTime = now;
            return;
        }

        const hours = offlineMs / 3600000;
        const progress = this._data.highestChapter * 100 + this._data.highestStage;

        // 读取离线配置
        const constants = GameConfig.instance.constants;
        const offlineConfig = constants?.offline;
        if (!offlineConfig) {
            this._data.lastOnlineTime = now;
            return;
        }

        const multiplier = 1 + progress * (offlineConfig.stageMultiplier || 0.15);
        const exp = Math.floor((offlineConfig.baseExpPerHour || 30) * hours * multiplier);
        const crystals = Math.floor((offlineConfig.baseCrystalsPerHour || 5) * hours * multiplier);
        const tokens = Math.floor((offlineConfig.baseTokensPerHour || 2) * hours * multiplier);

        // 发放经验
        if (exp > 0) {
            for (const uid of Object.keys(this._data.units)) {
                LevelSystem.instance.addExp(this._data.units[uid], Math.floor(exp / Object.keys(this._data.units).length));
            }
        }

        // 发放货币
        if (crystals > 0) this.addCurrency('crystals', crystals);
        if (tokens > 0) this.addCurrency('tokens', tokens);

        this._data.lastOnlineTime = now;

        const info = {
            hours: Math.round(hours * 10) / 10,
            exp,
            crystals,
            tokens,
        };

        console.log(`[PlayerManager] 离线收益: ${info.hours}小时 EXP+${exp} 氪晶+${crystals} 筹码+${tokens}`);
        EventBus.instance.emit('offline:rewards', info);

        this.save();
    }

    /** 销毁时取消监听 */
    destroy(): void {
        EventBus.instance.off('battle:end', this.onBattleEnd, this);
    }
}
