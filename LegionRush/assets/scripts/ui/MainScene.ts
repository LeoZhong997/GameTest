/**
 * MainScene - 主场景控制器
 * 游戏入口：加载所有配置 → 初始化系统 → 显示 MainUI
 * 通过 director.loadScene() 跳转到其他场景
 */

import { _decorator, Component, Node, resources, JsonAsset } from 'cc';
import { director } from 'cc';
import { UnitConfig } from '../models/UnitData';
import { SkillConfig } from '../models/SkillData';
import { SynergyConfig } from '../models/SynergyData';
import { BattleUnit, GameConstants } from '../battle/Unit';
import { BattleManager } from '../battle/BattleManager';
import { LevelSystem } from '../systems/LevelSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { StageManager } from '../systems/StageManager';
import { PlayerManager } from '../systems/PlayerManager';
import { GameConfig } from '../core/GameConfig';
import { EventBus } from '../core/EventBus';

const { ccclass } = _decorator;

@ccclass('MainScene')
export class MainScene extends Component {

    onLoad() {
        console.log('[MainScene] 主场景加载');

        if (GameConfig.instance.isLoaded) {
            console.log('[MainScene] 配置已加载，直接显示主界面');
            EventBus.instance.emit('configs:ready', GameConfig.instance.unitConfigs);
            return;
        }

        this.loadConfigs();
    }

    private async loadConfigs(): Promise<void> {
        try {
            const constantsAsset = await this.loadJson('configs/constants');
            if (constantsAsset) {
                BattleUnit.initConstants(constantsAsset as GameConstants);
                LevelSystem.instance.init(constantsAsset);
                UpgradeSystem.instance.init(constantsAsset);
                GameConfig.instance.setConstants(constantsAsset as any);
            }

            const unitsAsset = await this.loadJson('configs/units');
            const unitConfigs = new Map<string, UnitConfig>();
            if (unitsAsset) {
                for (const [id, cfg] of Object.entries(unitsAsset)) {
                    unitConfigs.set(id, cfg as UnitConfig);
                }
            }

            const skillsAsset = await this.loadJson('configs/skills');
            const skillConfigs = new Map<string, SkillConfig>();
            if (skillsAsset) {
                const skills: SkillConfig[] = Object.values(skillsAsset);
                skills.forEach(s => skillConfigs.set(s.id, s));
                BattleManager.instance.registerSkills(skills);
                BattleUnit.initSkillConfigs(skillConfigs);
            }

            const stagesAsset = await this.loadJson('configs/stages');
            if (stagesAsset) {
                StageManager.instance.loadConfigs(stagesAsset);
            }

            const synergiesAsset = await this.loadJson('configs/synergies');
            if (synergiesAsset) {
                const synergyConfigs = synergiesAsset as SynergyConfig[];
                GameConfig.instance.setSynergyConfigs(synergyConfigs);
                BattleManager.instance.registerSynergies(synergyConfigs);
            }

            GameConfig.instance.setConfigs(unitConfigs, skillConfigs);

            await PlayerManager.instance.init();

            console.log(`[MainScene] 配置加载完成: ${unitConfigs.size} 兵种, ${skillConfigs.size} 技能`);

            EventBus.instance.emit('configs:ready', GameConfig.instance.unitConfigs);
        } catch (e) {
            console.error('[MainScene] 配置加载失败:', e);
        }
    }

    private loadJson(path: string): Promise<any> {
        return new Promise((resolve) => {
            resources.load(path, JsonAsset, (err, asset) => {
                if (err) {
                    console.warn(`[MainScene] 加载 ${path} 失败: ${err.message}`);
                    resolve(null);
                    return;
                }
                resolve(asset!.json);
            });
        });
    }
}
