/**
 * DisplayNames - 集中管理所有显示层文本
 * 代码层 ID（human/beast/spirit/demon）不变，只改显示名
 */

// ========== 阵营名 ==========
export const RACE_NAMES: Record<string, string> = {
    human: '铁誓庭',
    beast: '荒鬃部',
    spirit: '月枝会',
    demon: '深烬廷',
};

// ========== 货币名 ==========
export const CURRENCY: Record<string, string> = {
    gold: '黑铢',
    crystals: '灰晶',
    relic_essence: '遗器微尘',
    exp: '经验',
};

// ========== 货币图标 ==========
export const CURRENCY_ICONS: Record<string, string> = {
    gold: '🪙',
    crystals: '🔮',
    relic_essence: '✨',
    exp: '📜',
};

// ========== 品质名（短） ==========
export const QUALITY_SHORT: Record<string, string> = {
    green: '绿', blue: '蓝', purple: '紫', gold: '金',
    gold1: '金+1', gold2: '金+2', gold3: '金+3',
};

// ========== 品质名（全） ==========
export const QUALITY_FULL: Record<string, string> = {
    green: '普通', blue: '稀有', purple: '史诗', gold: '传说',
};

// ========== 角色定位 ==========
export const ROLE_NAMES: Record<string, string> = {
    tank: '重甲', melee: '近战', ranged: '远程', support: '辅助', assassin: '刺客',
};

// ========== 属性名 ==========
export const STAT_NAMES: Record<string, string> = {
    atk: '攻击', hp: '生命', def: '防御', atkSpd: '攻速', spd: '速度',
};

// ========== 场景入口标签 ==========
export const SCENE_LABELS = {
    gameTitle: '黑棘行垒',
    units: '兵  营',
    battle: '进  军',
    backpack: '军需库',
    gacha: '征  募',
    relics: '遗  器',
    dungeon: '副  本',
};

// ========== 副本标签 ==========
export const DUNGEON_LABELS: Record<string, string> = {
    relic: '遗器回收',
    timed_campaign: '试炼对抗',
    stronghold: '物资夺回',
    chain_assault: '边境扫荡',
};
