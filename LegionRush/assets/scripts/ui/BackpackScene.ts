/**
 * BackpackScene - 背包场景控制器
 */

import { _decorator, Component } from 'cc';
import { GameConfig } from '../core/GameConfig';

const { ccclass } = _decorator;

@ccclass('BackpackScene')
export class BackpackScene extends Component {

    onLoad() {
        console.log('[BackpackScene] 背包场景加载');
        if (!GameConfig.instance.isLoaded) {
            console.warn('[BackpackScene] 配置未加载，请从主场景进入');
        }
    }
}
