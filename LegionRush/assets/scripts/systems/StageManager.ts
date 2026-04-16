/**
 * StageManager - 关卡配置管理
 * 从 stages.json 加载关卡数据，提供查询接口
 */

import { StageConfig } from '../models/StageData';

export class StageManager {
    private static _instance: StageManager = null!;
    private _stages: Map<string, StageConfig> = new Map();

    public static get instance(): StageManager {
        if (!this._instance) {
            this._instance = new StageManager();
        }
        return this._instance;
    }

    /** 从 JSON 对象加载所有关卡 */
    loadConfigs(stagesJson: { [key: string]: any }): void {
        this._stages.clear();
        for (const [id, cfg] of Object.entries(stagesJson)) {
            this._stages.set(id, cfg as StageConfig);
        }
        console.log(`[StageManager] 加载 ${this._stages.size} 个关卡`);
    }

    /** 获取指定关卡 */
    getStage(chapter: number, stage: number): StageConfig | null {
        return this._stages.get(`${chapter}-${stage}`) || null;
    }

    /** 获取当前关卡（基于玩家进度） */
    getCurrentStage(chapter: number, stage: number): StageConfig | null {
        return this.getStage(chapter, stage);
    }

    /** 获取下一关 */
    getNextStage(chapter: number, stage: number): StageConfig | null {
        // 先尝试同章下一关
        let next = this.getStage(chapter, stage + 1);
        if (next) return next;
        // 尝试下一章第一关
        next = this.getStage(chapter + 1, 1);
        return next;
    }

    /** 关卡是否存在 */
    hasStage(chapter: number, stage: number): boolean {
        return this._stages.has(`${chapter}-${stage}`);
    }

    /** 获取所有关卡 */
    getAllStages(): StageConfig[] {
        return Array.from(this._stages.values());
    }

    /** 获取某章所有关卡 */
    getChapterStages(chapter: number): StageConfig[] {
        const result: StageConfig[] = [];
        this._stages.forEach(s => {
            if (s.chapter === chapter) result.push(s);
        });
        return result.sort((a, b) => a.stage - b.stage);
    }
}
