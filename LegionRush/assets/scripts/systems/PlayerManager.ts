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

const SAVE_KEY = 'player';

export class PlayerManager {
    private static _instance: PlayerManager = null!;
    private _data: PlayerData | null = null;
    private _dirty: boolean = false;

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

        // 监听战斗结束
        EventBus.instance.on('battle:end', this.onBattleEnd, this);

        EventBus.instance.emit('player:loaded', this._data);
    }

    /** 保存到本地 */
    save(): void {
        if (!this._data) return;
        this._data.lastSaveTime = Date.now();
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

    // --- 关卡推进 ---

    advanceStage(): void {
        if (!this._data) return;
        const next = StageManager.instance.getNextStage(this._data.currentChapter, this._data.currentStage);
        if (next) {
            this._data.currentChapter = next.chapter;
            this._data.currentStage = next.stage;
            // 更新最高进度
            const current = this._data.currentChapter * 100 + this._data.currentStage;
            const highest = this._data.highestChapter * 100 + this._data.highestStage;
            if (current > highest) {
                this._data.highestChapter = this._data.currentChapter;
                this._data.highestStage = this._data.currentStage;
            }
            this.markDirty();
            console.log(`[PlayerManager] 关卡推进: ${this._data.currentChapter}-${this._data.currentStage}`);
            EventBus.instance.emit('stage:advanced', { chapter: this._data.currentChapter, stage: this._data.currentStage });
        }
    }

    // --- 战斗结束处理 ---

    private onBattleEnd(report: BattleReport): void {
        if (!this._data) return;

        if (report.result === BattleResult.WIN) {
            // 获取当前关卡配置
            const stage = StageManager.instance.getCurrentStage(this._data.currentChapter, this._data.currentStage);
            if (!stage) {
                console.warn('[PlayerManager] 未找到当前关卡配置');
                return;
            }

            const rewards = stage.rewards;
            const rewardInfo: any = { exp: rewards.exp, crystals: rewards.crystals, tokens: rewards.tokens, bottleCaps: rewards.bottleCaps, items: [] as any[] };

            // 发放经验给参战单位（左方存活+死亡单位都获得经验）
            const deployedConfigIds = new Set(this._data.units ? Object.keys(this._data.units) : []);
            // 这里用参战单位的 configId 来匹配
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

            // 推进关卡
            this.advanceStage();

            console.log(`[PlayerManager] 奖励发放: EXP+${rewards.exp} 氪晶+${rewards.crystals} 筹码+${rewards.tokens} 瓶盖+${rewards.bottleCaps}`);
            if (rewardInfo.items.length > 0) {
                console.log(`[PlayerManager] 物品掉落: ${rewardInfo.items.map((i: any) => `${i.id}x${i.count}`).join(', ')}`);
            }

            EventBus.instance.emit('rewards:distributed', rewardInfo);
        }

        this.save();
    }

    /** 销毁时取消监听 */
    destroy(): void {
        EventBus.instance.off('battle:end', this.onBattleEnd, this);
    }
}
