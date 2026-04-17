/**
 * UnitManageScene - 兵种管理场景控制器
 * 确保配置已加载，通知 UnitManageUI 显示
 */

import { _decorator, Component } from 'cc';
import { GameConfig } from '../core/GameConfig';
import { EventBus } from '../core/EventBus';

const { ccclass } = _decorator;

@ccclass('UnitManageScene')
export class UnitManageScene extends Component {

    onLoad() {
        console.log('[UnitManageScene] 兵种管理场景加载');
    }

    start() {
        console.log(`[UnitManageScene] start: GameConfig.isLoaded=${GameConfig.instance.isLoaded}`);
        if (GameConfig.instance.isLoaded) {
            console.log(`[UnitManageScene] 发送 configs:ready, unitConfigs.size=${GameConfig.instance.unitConfigs.size}`);
            EventBus.instance.emit('configs:ready', GameConfig.instance.unitConfigs);
        } else {
            console.warn('[UnitManageScene] 配置未加载，请从主场景进入');
        }
    }
}
