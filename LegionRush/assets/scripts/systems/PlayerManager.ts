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
import { StageItemDrop, RewardOption, DropPoolEntry } from '../models/StageData';
import { GameConfig } from '../core/GameConfig';

const SAVE_KEY = 'player';

export class PlayerManager {
    private static _instance: PlayerManager = null!;
    private _data: PlayerData | null = null;
    private _dirty: boolean = false;
    private _playingChapter: number = 0;
    private _playingStage: number = 0;
    private _pendingReward: { rewardInfo: any; stage: any } | null = null;

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
        if (saved) {
            // 版本迁移
            if (saved.version < SAVE_VERSION) {
                this.migrateData(saved);
            }
            if (saved.version === SAVE_VERSION) {
                this._data = saved;
            console.log(`[PlayerManager] 存档加载: ${this._data.name}, 关卡 ${this._data.currentChapter}-${this._data.currentStage}, ${Object.keys(this._data.units).length} 个兵种`);
        } else {
            }
        }
        if (!this._data) {
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

    /** 存档版本迁移 */
    private migrateData(data: any): void {
        if (data.version < 6) {
            // v5 → v6: 新增圣物系统
            data.relics = data.relics || {};
            data.version = 6;
            console.log('[PlayerManager] 迁移 v5→v6: 新增 relics 字段');
        }
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

    /** 推进关卡，传入实际通关的章节/关卡号 */
    advanceStage(chapter: number, stage: number): void {
        if (!this._data) return;

        // 用实际通关的关卡更新最高进度
        const justCleared = chapter * 100 + stage;
        const prevHighest = this._data.highestChapter * 100 + this._data.highestStage;
        if (justCleared > prevHighest) {
            this._data.highestChapter = chapter;
            this._data.highestStage = stage;
        }

        // 推进到下一关（从实际通关的关卡推进）
        const next = StageManager.instance.getNextStage(chapter, stage);
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
            const isAlreadyCleared = this._data.clearedStages.includes(stage.id);

            const rewards = stage.rewards;
            const rewardInfo: any = {
                stageId: stage.id,
                exp: 0,
                gold: 0,
                crystals: 0,
                items: [] as any[],
                firstClear: false,
                firstClearBonus: null as any,
                isReplay: isAlreadyCleared,
            };

            // 重玩已通关关卡：不给任何奖励
            if (isAlreadyCleared) {
                console.log(`[PlayerManager] 重玩关卡 ${playedChapter}-${playedStage}，无奖励`);
                EventBus.instance.emit('rewards:distributed', rewardInfo);
                this.save();
                return;
            }

            // 首通奖励
            rewardInfo.exp = rewards.exp;
            rewardInfo.gold = rewards.gold;
            rewardInfo.crystals = rewards.crystals;
            rewardInfo.firstClear = true;
            this._data.clearedStages.push(stage.id);
            if (rewards.firstClearBonus) {
                rewardInfo.firstClearBonus = rewards.firstClearBonus;
                this.addCurrency('crystals', rewards.firstClearBonus.crystals || 0);
                rewardInfo.crystals += rewards.firstClearBonus.crystals || 0;
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
            this.addCurrency('gold', rewards.gold);
            this.addCurrency('crystals', rewards.crystals);

            // 推进关卡：打的关超过当前最高进度才推进
            if (playedValue > highest) {
                this.advanceStage(playedChapter, playedStage);
            } else {
                console.log(`[PlayerManager] 重玩关卡 ${playedChapter}-${playedStage}，不推进进度`);
            }

            // ---- 三选一奖励 ----
            // 从掉落池生成 3 个选项
            const dropPool = StageManager.instance.getDropPool(stage.chapter, stage.type);
            if (dropPool && dropPool.length > 0) {
                const chooseOptions = this.rollDropOptions(dropPool, 3);
                rewardInfo.chooseOptions = chooseOptions;

                // 保存 pending 状态，等待玩家选择
                this._pendingReward = { rewardInfo, stage };

                console.log(`[PlayerManager] 固定奖励已发放: EXP+${rewards.exp} 💰+${rewardInfo.gold} 💎+${rewardInfo.crystals}${rewardInfo.firstClear ? ' (首通)' : ''}`);
                console.log(`[PlayerManager] 三选一选项: ${chooseOptions.map((o: RewardOption) => `${o.name}x${o.count}`).join(', ')}`);

                // 发出选择事件（不发 rewards:distributed，等玩家选完再发）
                EventBus.instance.emit('rewards:choose', {
                    fixedRewards: {
                        exp: rewardInfo.exp,
                        gold: rewardInfo.gold,
                        crystals: rewardInfo.crystals,
                        firstClear: rewardInfo.firstClear,
                        firstClearBonus: rewardInfo.firstClearBonus,
                    },
                    chooseOptions,
                });
            } else {
                // 无掉落池：兼容旧 stages.json 手动配置
                if (rewards.items) {
                    for (const drop of rewards.items) {
                        if (Math.random() < drop.probability) {
                            this.addItem(drop.id, drop.count);
                            rewardInfo.items.push(drop);
                        }
                    }
                }
                console.log(`[PlayerManager] 奖励发放: EXP+${rewards.exp} 💰+${rewardInfo.gold} 💎+${rewardInfo.crystals}${rewardInfo.firstClear ? ' (首通)' : ''}`);
                EventBus.instance.emit('rewards:distributed', rewardInfo);
            }
        }

        this.save();
    }

    /** 玩家确认选择奖励 */
    confirmRewardSelection(index: number): void {
        if (!this._pendingReward) return;
        const { rewardInfo } = this._pendingReward;
        const options: RewardOption[] = rewardInfo.chooseOptions;
        if (index < 0 || index >= options.length) return;

        const chosen = options[index];
        this.addItem(chosen.itemId, chosen.count);
        rewardInfo.items = [{ id: chosen.itemId, count: chosen.count }];

        console.log(`[PlayerManager] 玩家选择: ${chosen.name} x${chosen.count}`);

        this._pendingReward = null;
        EventBus.instance.emit('rewards:distributed', rewardInfo);
    }

    /** 从掉落池加权随机 N 个不重复选项 */
    private rollDropOptions(pool: DropPoolEntry[], count: number): RewardOption[] {
        const results: RewardOption[] = [];
        const used = new Set<string>();

        for (let i = 0; i < count && used.size < pool.length; i++) {
            // 过滤已选
            const available = pool.filter(e => !used.has(e.itemId));
            if (available.length === 0) break;

            const totalWeight = available.reduce((sum, e) => sum + e.weight, 0);
            let roll = Math.random() * totalWeight;

            let picked: DropPoolEntry | null = null;
            for (const entry of available) {
                roll -= entry.weight;
                if (roll <= 0) {
                    picked = entry;
                    break;
                }
            }
            if (!picked) picked = available[available.length - 1];

            used.add(picked.itemId);
            const numCount = picked.countMin + Math.floor(Math.random() * (picked.countMax - picked.countMin + 1));
            results.push({
                itemId: picked.itemId,
                name: picked.name,
                count: numCount,
                rarity: picked.rarity,
            });
        }

        return results;
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
        const gold = Math.floor((offlineConfig.baseGoldPerHour || 20) * hours * multiplier);
        const crystals = Math.floor((offlineConfig.baseCrystalsPerHour || 3) * hours * multiplier);

        // 发放经验
        if (exp > 0) {
            for (const uid of Object.keys(this._data.units)) {
                LevelSystem.instance.addExp(this._data.units[uid], Math.floor(exp / Object.keys(this._data.units).length));
            }
        }

        // 发放货币
        if (gold > 0) this.addCurrency('gold', gold);
        if (crystals > 0) this.addCurrency('crystals', crystals);

        this._data.lastOnlineTime = now;

        const info = {
            hours: Math.round(hours * 10) / 10,
            exp,
            gold,
            crystals,
        };

        console.log(`[PlayerManager] 离线收益: ${info.hours}小时 EXP+${exp} 金币+${gold} 钻石+${crystals}`);
        EventBus.instance.emit('offline:rewards', info);

        this.save();
    }

    /** 销毁时取消监听 */
    destroy(): void {
        EventBus.instance.off('battle:end', this.onBattleEnd, this);
    }
}
