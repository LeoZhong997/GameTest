/**
 * StageManager - 关卡配置管理
 * 从 stage-templates.json 模板生成 30 关/章
 * 支持手动 override（stages.json 中的关卡覆盖生成的）
 */

import { StageConfig, StageEnemy, StageRewards, DropPoolEntry, ChapterDropPools } from '../models/StageData';

/** 章节模板结构 */
interface ChapterTemplate {
    name: string;
    baseLevel: number;
    levelPerStage: number;
    enemyPool: {
        normal: string[];
        elite: string[];
        boss: string[];
    };
    qualityByStage: Record<string, string>;
    eliteQualityByStage: Record<string, string>;
    bossQualityByStage: Record<string, string>;
    rewardScale: number;
    dropPools: ChapterDropPools;
}

/** 模板 JSON 结构 */
interface StageTemplates {
    chapters: Record<string, ChapterTemplate>;
}

// 预定义阵型模式（3×3 九宫格坐标）
const FORMATIONS: { name: string; positions: { row: number; col: number }[] }[] = [
    { name: 'cross3', positions: [{ row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 2 }, { row: 2, col: 1 }] },
    { name: 'diamond', positions: [{ row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }] },
    { name: 'full6', positions: [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }] },
    { name: 'full7', positions: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 2 }, { row: 2, col: 0 }, { row: 2, col: 2 }] },
    { name: 'full9', positions: [
        { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 },
        { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 },
        { row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 },
    ] },
];

// miniBoss / boss 关卡编号
const MINIBOSS_STAGES = [5, 10, 15];
const BOSS_STAGES = [20];
const STAGES_PER_CHAPTER = 20;

export class StageManager {
    private static _instance: StageManager = null!;
    private _stages: Map<string, StageConfig> = new Map();
    private _dropPools: Map<string, ChapterDropPools> = new Map(); // chapter -> pools

    public static get instance(): StageManager {
        if (!this._instance) {
            this._instance = new StageManager();
        }
        return this._instance;
    }

    /** 从模板 JSON 生成所有关卡，再用 stages.json override */
    loadTemplates(templatesJson: any, overrideJson: { [key: string]: any } | null): void {
        this._stages.clear();
        this._dropPools.clear();

        const templates = templatesJson as StageTemplates;

        // 为每个章节生成 30 关
        for (const [chStr, chTpl] of Object.entries(templates.chapters)) {
            const chapter = parseInt(chStr);
            this._dropPools.set(chStr, chTpl.dropPools);

            for (let s = 1; s <= STAGES_PER_CHAPTER; s++) {
                const config = this.generateStage(chapter, s, chTpl);
                this._stages.set(config.id, config);
            }
        }

        // 手动 override：stages.json 中的关卡覆盖生成的
        if (overrideJson) {
            for (const [id, cfg] of Object.entries(overrideJson)) {
                this._stages.set(id, cfg as StageConfig);
            }
        }

        console.log(`[StageManager] 生成 ${this._stages.size} 个关卡`);
        const chapters = new Map<number, number>();
        this._stages.forEach(s => {
            chapters.set(s.chapter, (chapters.get(s.chapter) || 0) + 1);
        });
        chapters.forEach((count, ch) => {
            console.log(`[StageManager] 第${ch}章: ${count}关`);
        });
    }

    /** 从 JSON 对象加载所有关卡（兼容旧版，无模板） */
    loadConfigs(stagesJson: { [key: string]: any }): void {
        this._stages.clear();
        for (const [id, cfg] of Object.entries(stagesJson)) {
            this._stages.set(id, cfg as StageConfig);
        }
        console.log(`[StageManager] 加载 ${this._stages.size} 个关卡`);
    }

    /** 生成单个关卡 */
    private generateStage(chapter: number, stageNum: number, tpl: ChapterTemplate): StageConfig {
        const type = this.resolveType(stageNum);
        const id = `${chapter}-${stageNum}`;

        // 关卡名（用简单模板）
        const names: Record<string, string> = {
            normal: ['前哨战', '巡逻战', '遭遇战', '伏击战', '突击战', '围剿战', '截击战', '突围战'],
            miniBoss: ['精英战', '强敌战', '猛将战'],
            boss: ['BOSS 战', '守关战', '决战'],
        };
        const pool = names[type];
        const name = pool[stageNum % pool.length];

        // 等级
        const level = Math.max(1, Math.floor(tpl.baseLevel + (stageNum - 1) * tpl.levelPerStage));

        // 敌人数量
        let enemyCount: number;
        if (type === 'boss') {
            enemyCount = stageNum === 20 ? 9 : 7;
        } else if (type === 'miniBoss') {
            enemyCount = 6;
        } else {
            // normal: 3-6，随关卡进度递增
            enemyCount = 3 + Math.floor(stageNum / 10) + (Math.random() < 0.3 ? 1 : 0);
        }

        // 选阵型
        const formation = this.pickFormation(enemyCount);

        // 选敌人
        const enemyPoolKey = type === 'boss' ? 'boss' : (type === 'miniBoss' ? 'elite' : 'normal');
        const enemyPool = tpl.enemyPool[enemyPoolKey];
        const enemies = this.generateEnemies(enemyPool, formation, level, stageNum, tpl);

        // 奖励
        const rewards = this.generateRewards(stageNum, tpl);

        return {
            id,
            chapter,
            stage: stageNum,
            type,
            name: `${name}`,
            recommendedLevel: level,
            enemies,
            rewards,
        };
    }

    /** 确定关卡类型 */
    private resolveType(stageNum: number): 'normal' | 'miniBoss' | 'boss' {
        if (BOSS_STAGES.includes(stageNum)) return 'boss';
        if (MINIBOSS_STAGES.includes(stageNum)) return 'miniBoss';
        return 'normal';
    }

    /** 选择阵型 */
    private pickFormation(enemyCount: number): { row: number; col: number }[] {
        // 找最接近的阵型
        let best = FORMATIONS[0];
        for (const f of FORMATIONS) {
            if (f.positions.length >= enemyCount) {
                best = f;
                break;
            }
        }
        // 如果敌人比阵型少，截取前 N 个位置
        return best.positions.slice(0, enemyCount);
    }

    /** 生成敌人列表 */
    private generateEnemies(
        pool: string[],
        positions: { row: number; col: number }[],
        level: number,
        stageNum: number,
        tpl: ChapterTemplate
    ): StageEnemy[] {
        const enemies: StageEnemy[] = [];
        const qualityMap = this.getQualityForStage(stageNum, tpl, pool === tpl.enemyPool.boss);

        for (let i = 0; i < positions.length; i++) {
            const configId = pool[i % pool.length];
            // miniBoss/boss 关卡中心敌人等级 +1
            const lvl = (i === Math.floor(positions.length / 2) && stageNum % 5 === 0) ? level + 1 : level;
            enemies.push({
                configId,
                level: lvl,
                quality: qualityMap,
                gridRow: positions[i].row,
                gridCol: positions[i].col,
            });
        }
        return enemies;
    }

    /** 根据关卡号确定品质 */
    private getQualityForStage(stageNum: number, tpl: ChapterTemplate, isBoss: boolean): string {
        const qualityMap = isBoss ? tpl.bossQualityByStage : tpl.eliteQualityByStage;
        return this.resolveQualityFromMap(stageNum, qualityMap);
    }

    private resolveQualityFromMap(stageNum: number, map: Record<string, string>): string {
        // map 的 key 格式: "1_10" 表示第1-10关
        // 找到包含 stageNum 的范围
        for (const [range, quality] of Object.entries(map)) {
            const parts = range.split('_');
            const from = parseInt(parts[0]);
            const to = parseInt(parts[1]);
            if (stageNum >= from && stageNum <= to) return quality;
        }
        return 'green';
    }

    /** 生成奖励 */
    private generateRewards(stageNum: number, tpl: ChapterTemplate): StageRewards {
        const scale = tpl.rewardScale;

        // 基础奖励随关卡进度递增
        const baseExp = 40 + stageNum * 15;
        const baseGold = 20 + stageNum * 10;
        const baseCrystals = 5 + stageNum * 2;

        // miniBoss/boss 加成
        const type = this.resolveType(stageNum);
        const typeMulti = type === 'boss' ? 2.5 : type === 'miniBoss' ? 1.5 : 1.0;

        const rewards: StageRewards = {
            exp: Math.floor(baseExp * scale * typeMulti),
            gold: Math.floor(baseGold * scale * typeMulti),
            crystals: Math.floor(baseCrystals * scale * typeMulti),
        };

        // boss 关加首通奖励
        if (type === 'boss') {
            rewards.firstClearBonus = {
                crystals: Math.floor(80 * scale * typeMulti),
            };
        }

        return rewards;
    }

    /** 获取章节掉落池 */
    getDropPool(chapter: number, type: 'normal' | 'miniBoss' | 'boss'): DropPoolEntry[] {
        const pools = this._dropPools.get(String(chapter));
        if (!pools) return [];
        return pools[type] || [];
    }

    // ---- Query methods ----

    getStage(chapter: number, stage: number): StageConfig | null {
        return this._stages.get(`${chapter}-${stage}`) || null;
    }

    getCurrentStage(chapter: number, stage: number): StageConfig | null {
        return this.getStage(chapter, stage);
    }

    getNextStage(chapter: number, stage: number): StageConfig | null {
        let next = this.getStage(chapter, stage + 1);
        if (next) return next;
        next = this.getStage(chapter + 1, 1);
        return next;
    }

    hasStage(chapter: number, stage: number): boolean {
        return this._stages.has(`${chapter}-${stage}`);
    }

    getAllStages(): StageConfig[] {
        return Array.from(this._stages.values());
    }

    getChapterStages(chapter: number): StageConfig[] {
        const result: StageConfig[] = [];
        this._stages.forEach(s => {
            if (s.chapter === chapter) result.push(s);
        });
        return result.sort((a, b) => a.stage - b.stage);
    }
}
