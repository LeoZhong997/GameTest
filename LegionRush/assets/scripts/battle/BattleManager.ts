/**
 * BattleManager - 战斗流程控制器
 * 管理战斗初始化、更新、结算全流程
 */

import { BattleUnit, TeamSide, UnitState } from './Unit';
import { UnitAI } from './UnitAI';
import { SkillExecutor } from './Skill';
import { Formation, FormationType } from './Formation';
import { UnitConfig, Quality } from '../models/UnitData';
import { SkillConfig } from '../models/SkillData';
import { SynergyConfig, ActiveSynergy } from '../models/SynergyData';
import { SynergySystem } from './SynergySystem';
import { BattleOrderEffect } from '../models/BattleOrderData';
import { GameConfig } from '../core/GameConfig';
import { EventBus } from '../core/EventBus';

/** 战斗状态 */
export enum BattleState {
    NONE = 'none',
    PREPARING = 'preparing',
    RUNNING = 'running',
    PAUSED = 'paused',
    FINISHED = 'finished'
}

/** 战斗结果 */
export enum BattleResult {
    WIN = 'win',
    LOSE = 'lose',
    DRAW = 'draw'
}

/** 战斗配置 */
export interface BattleConfig {
    leftFormation: FormationType;
    rightFormation: FormationType;
    leftUnits: { config: UnitConfig; level: number; quality: Quality; count: number; gridRow: number; gridCol: number; relicBonuses?: Record<string, number> }[];
    rightUnits: { config: UnitConfig; level: number; quality: Quality; count: number; gridRow: number; gridCol: number }[];
    timeLimit: number;
    battleOrderId?: string;
}

/** 战斗报告 */
export interface BattleReport {
    result: BattleResult;
    duration: number;
    leftSurvivors: number;
    rightSurvivors: number;
    totalLeft: number;
    totalRight: number;
    mvp: BattleUnit | null;
    units: BattleUnit[];
}

export class BattleManager {
    private static _instance: BattleManager = null!;

    private _state: BattleState = BattleState.NONE;
    private _allUnits: BattleUnit[] = [];
    private _leftUnits: BattleUnit[] = [];
    private _rightUnits: BattleUnit[] = [];
    private _ais: Map<string, UnitAI> = new Map();
    private _skillConfigs: Map<string, SkillConfig> = new Map();
    private _synergyConfigs: SynergyConfig[] = [];
    private _activeSynergies: ActiveSynergy[] = [];
    private _rightActiveSynergies: ActiveSynergy[] = [];
    private _battleTime: number = 0;
    private _timeLimit: number = 30;
    private _battleSpeed: number = 1.0;
    private _pendingOrders: { effect: BattleOrderEffect; triggered: boolean; triggerDelay: number }[] = [];

    public static get instance(): BattleManager {
        if (!this._instance) {
            this._instance = new BattleManager();
        }
        return this._instance;
    }

    // Getters
    get state(): BattleState { return this._state; }
    get battleTime(): number { return this._battleTime; }
    get timeLimit(): number { return this._timeLimit; }
    get battleSpeed(): number { return this._battleSpeed; }
    get allUnits(): readonly BattleUnit[] { return this._allUnits; }
    get leftUnits(): readonly BattleUnit[] { return this._leftUnits; }
    get rightUnits(): readonly BattleUnit[] { return this._rightUnits; }
    get activeSynergies(): readonly ActiveSynergy[] { return this._activeSynergies; }
    get rightActiveSynergies(): readonly ActiveSynergy[] { return this._rightActiveSynergies; }

    setBattleSpeed(speed: number): void {
        this._battleSpeed = Math.max(0.5, Math.min(4.0, speed));
    }

    /** 注册技能配置 */
    registerSkills(configs: SkillConfig[]): void {
        configs.forEach(c => this._skillConfigs.set(c.id, c));
    }

    /** 注册羁绊配置 */
    registerSynergies(configs: SynergyConfig[]): void {
        this._synergyConfigs = configs;
    }

    /** 布阵：创建单位并摆放阵型，但不开始战斗 */
    prepareBattle(config: BattleConfig): void {
        this.reset();
        this._timeLimit = config.timeLimit || 30;

        // 注册助攻回调：通过 UID 查找单位并增加助攻计数
        BattleUnit._onAssistCallback = (attackerUid: string) => {
            const unit = this._allUnits.find(u => u.uid === attackerUid);
            if (unit) unit.assists++;
        };

        // 生成左方单位（数量由等级系统决定，无需截断）
        for (const group of config.leftUnits) {
            const effectiveCount = group.count;
            const positions = Formation.getPositionsForCell(group.gridRow, group.gridCol, effectiveCount, true);
            for (let i = 0; i < effectiveCount; i++) {
                const unit = new BattleUnit(group.config, TeamSide.LEFT, group.level, group.quality, group.relicBonus);
                unit.position.set(positions[i]);
                this._leftUnits.push(unit);
                this._allUnits.push(unit);
                this._ais.set(unit.uid, new UnitAI(unit));
            }
        }

        // 生成右方单位（数量由等级系统决定，无需截断）
        for (const group of config.rightUnits) {
            const effectiveCount = group.count;
            const positions = Formation.getPositionsForCell(group.gridRow, group.gridCol, effectiveCount, false);
            for (let i = 0; i < effectiveCount; i++) {
                const unit = new BattleUnit(group.config, TeamSide.RIGHT, group.level, group.quality);
                unit.position.set(positions[i]);
                this._rightUnits.push(unit);
                this._allUnits.push(unit);
                this._ais.set(unit.uid, new UnitAI(unit));
            }
        }

        // 应用种族羁绊
        this._activeSynergies = [];
        this._rightActiveSynergies = [];
        if (this._synergyConfigs.length > 0) {
            const leftActives = SynergySystem.applySynergies(this._leftUnits, this._synergyConfigs);
            const rightActives = SynergySystem.applySynergies(this._rightUnits, this._synergyConfigs);
            // 交叉应用敌方 debuff（如魔族腐蚀）
            SynergySystem.applyEnemyEffects(this._leftUnits, this._rightUnits);
            SynergySystem.applyEnemyEffects(this._rightUnits, this._leftUnits);
            this._activeSynergies = leftActives;
            this._rightActiveSynergies = rightActives;
        }

        // 缓存军令效果（延迟触发）
        this._pendingOrders = [];
        if (config.battleOrderId) {
            const orderConfig = GameConfig.instance.getBattleOrderConfig(config.battleOrderId);
            if (orderConfig) {
                for (const effect of orderConfig.effects) {
                    this._pendingOrders.push({
                        effect,
                        triggered: false,
                        triggerDelay: effect.triggerDelay || 0,
                    });
                }
                // 立即触发 delay=0 的效果
                this.triggerPendingOrders(0);
                console.log(`[BattleManager] 军令「${orderConfig.name}」已加载`);
            }
        }

        this._state = BattleState.PREPARING;
        console.log(`[BattleManager] 布阵完成: ${this._leftUnits.length} vs ${this._rightUnits.length}`);
    }

    /** 开战：从布阵状态进入战斗 */
    beginBattle(): void {
        if (this._state !== BattleState.PREPARING) return;
        this._state = BattleState.RUNNING;

        EventBus.instance.emit('battle:start', {
            leftCount: this._leftUnits.length,
            rightCount: this._rightUnits.length,
        });

        console.log(`[BattleManager] 战斗开始: ${this._leftUnits.length} vs ${this._rightUnits.length}`);
    }

    /** 每帧更新 */
    update(dt: number): void {
        if (this._state !== BattleState.RUNNING) return;

        const scaledDt = dt * this._battleSpeed;
        this._battleTime += scaledDt;

        // 超时判定
        if (this._battleTime >= this._timeLimit) {
            this.endBattle(BattleResult.DRAW);
            return;
        }

        // 触发延迟军令
        this.triggerPendingOrders(this._battleTime);

        // 更新所有单位
        for (const unit of this._allUnits) {
            if (!unit.isAlive) continue;

            // 更新 Buff
            unit.buffs.update(scaledDt);

            // 更新 AI
            const ai = this._ais.get(unit.uid);
            if (ai) ai.update(scaledDt, this._allUnits);

            // 处理攻击
            if (unit.state === UnitState.ATTACK && unit.canAct) {
                this.processAttack(unit, scaledDt);
            }

            // 处理技能
            this.processSkills(unit, scaledDt);
        }

        // 胜负判定
        const leftAlive = this._leftUnits.filter(u => u.isAlive).length;
        const rightAlive = this._rightUnits.filter(u => u.isAlive).length;

        if (leftAlive === 0) { this.endBattle(BattleResult.LOSE); return; }
        if (rightAlive === 0) { this.endBattle(BattleResult.WIN); return; }
    }

    /** 处理普攻 */
    private processAttack(unit: BattleUnit, dt: number): void {
        unit.attackTimer += dt;
        const effectiveAtkSpd = unit.atkSpd * unit.buffs.getStatMultiplier('atkSpd');
        const interval = 1.0 / effectiveAtkSpd;

        if (unit.attackTimer >= interval) {
            unit.attackTimer -= interval;

            if (unit.target && unit.target.isAlive) {
                const isCrit = Math.random() < unit.critRate;
                let dmg = unit.atk;
                if (isCrit) dmg *= unit.critDmg;
                dmg *= unit.buffs.getAtkMultiplier();

                const actual = unit.target.takeDamage(dmg, unit);
                unit.damageDealt += actual;

                EventBus.instance.emit('battle:attack', {
                    attacker: unit.uid,
                    target: unit.target.uid,
                    damage: actual,
                    isCrit,
                    range: unit.range,
                });
            }
        }
    }

    /** 处理技能冷却和自动施放 */
    private processSkills(unit: BattleUnit, dt: number): void {
        for (const skill of unit.skills) {
            if (skill.currentCd > 0) {
                skill.currentCd -= dt;
            }

            if (skill.currentCd <= 0 && unit.canAct) {
                const cfg = this._skillConfigs.get(skill.configId);
                if (!cfg) continue;

                // 检查使用次数限制（maxUses > 0 表示有限制）
                if (cfg.maxUses > 0 && skill.uses >= cfg.maxUses) {
                    if (skill.uses === cfg.maxUses) {
                        console.log(`[技能] ${unit.tag} ${cfg.name} 已达上限(${cfg.maxUses}次)`);
                        skill.uses++; // 标记已跳过，避免重复日志
                    }
                    continue;
                }

                // 检查能量是否足够
                if (unit.energy < cfg.energyCost) continue;

                // 扣除能量，增加使用次数
                unit.energy -= cfg.energyCost;
                skill.uses++;
                console.log(`[技能] ${unit.tag} 释放 ${cfg.name} | 消耗能量:${cfg.energyCost} 剩余:${unit.energy}`);

                this.castSkill(unit, cfg);
                skill.currentCd = cfg.cooldown;
            }
        }
    }

    /** 施放技能 */
    private castSkill(caster: BattleUnit, config: SkillConfig): void {
        caster.state = UnitState.CAST_SKILL;
        SkillExecutor.execute(caster, config, this._allUnits);

        EventBus.instance.emit('battle:skill', {
            caster: caster.uid,
            skillId: config.id,
            skillName: config.name,
        });
    }

    /** 结束战斗 */
    private endBattle(result: BattleResult): void {
        this._state = BattleState.FINISHED;

        const leftSurvivors = this._leftUnits.filter(u => u.isAlive).length;
        const rightSurvivors = this._rightUnits.filter(u => u.isAlive).length;

        // 评选 MVP（我方综合评分最高）
        let mvp: BattleUnit | null = null;
        let maxScore = 0;
        for (const u of this._leftUnits) {
            const score = u.kills * 3
                + u.assists * 1.5
                + u.damageDealt / 100
                + u.damageTaken / 150
                + u.healingDone / 80;
            if (score > maxScore) {
                maxScore = score;
                mvp = u;
            }
        }

        const report: BattleReport = {
            result,
            duration: this._battleTime,
            leftSurvivors,
            rightSurvivors,
            totalLeft: this._leftUnits.length,
            totalRight: this._rightUnits.length,
            mvp,
            units: [...this._allUnits],
        };

        console.log(`[BattleManager] 战斗结束: ${result}, 用时 ${this._battleTime.toFixed(1)}s, 存活 ${leftSurvivors} vs ${rightSurvivors}`);
        if (mvp) {
            console.log(`[BattleManager] MVP: ${mvp.config.name} | 击杀:${mvp.kills} 助攻:${mvp.assists} 伤害:${mvp.damageDealt} 承伤:${mvp.damageTaken} 治疗:${mvp.healingDone}`);
        }

        EventBus.instance.emit('battle:end', report);
    }

    /** 暂停/恢复 */
    togglePause(): void {
        if (this._state === BattleState.RUNNING) {
            this._state = BattleState.PAUSED;
        } else if (this._state === BattleState.PAUSED) {
            this._state = BattleState.RUNNING;
        }
    }

    /** 重置 */
    reset(): void {
        this._allUnits = [];
        this._leftUnits = [];
        this._rightUnits = [];
        this._ais.clear();
        this._battleTime = 0;
        this._activeSynergies = [];
        this._rightActiveSynergies = [];
        this._pendingOrders = [];
        this._state = BattleState.NONE;
        BattleUnit._onAssistCallback = null;
    }

    /** 获取军令效果目标单位 */
    private getOrderTargets(scope: string): BattleUnit[] {
        switch (scope) {
            case 'team':
                return [...this._leftUnits];
            case 'frontline':
                return this._leftUnits.filter(u => u.position.y > 0);
            case 'backline':
                return this._leftUnits.filter(u => u.position.y <= 0);
            case 'enemy_backline':
                return this._rightUnits.filter(u => u.position.y <= 0);
            case 'melee':
                return this._leftUnits.filter(u => u.config.role === 'melee');
            case 'assassin':
                return this._leftUnits.filter(u => u.config.role === 'assassin');
            case 'ranged':
                return this._leftUnits.filter(u => u.config.role === 'ranged');
            case 'support':
                return this._leftUnits.filter(u => u.config.role === 'support');
            default:
                return [...this._leftUnits];
        }
    }

    /** 触发已到时间的延迟军令 */
    private triggerPendingOrders(currentTime: number): void {
        for (const pending of this._pendingOrders) {
            if (!pending.triggered && currentTime >= pending.triggerDelay) {
                pending.triggered = true;
                const targets = this.getOrderTargets(pending.effect.scope);
                for (const unit of targets) {
                    if (unit.isAlive) {
                        this.applyOrderEffect(unit, pending.effect);
                    }
                }
            }
        }
    }

    /** 应用军令效果到单个单位 */
    private applyOrderEffect(unit: BattleUnit, effect: BattleOrderEffect): void {
        const statKey = effect.stat as keyof typeof unit;
        const current = (unit as any)[statKey];
        if (typeof current === 'number') {
            const delta = current * effect.value;
            (unit as any)[statKey] = current + delta;
        }
    }

    /** 清理资源 */
    cleanup(): void {
        this.reset();
        this._skillConfigs.clear();
    }
}
