/**
 * UnitManageUI - 兵种管理界面
 * 显示玩家拥有的所有兵种，选中后可使用经验书升级
 * 纯代码创建，挂载在 UIRoot 节点
 */

import { _decorator, Component, Node, Label, Graphics, UITransform, Color, director, view, Layers } from 'cc';
import { EventBus } from '../core/EventBus';
import { PlayerManager } from '../systems/PlayerManager';
import { LevelSystem } from '../systems/LevelSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { UnitInstanceData, UnitConfig, Quality } from '../models/UnitData';
import { drawShape, UnitShape } from './UnitView';

const { ccclass } = _decorator;

const CARD_W = 150, CARD_H = 190;
const CARD_GAP = 16;
const DETAIL_W = 420, DETAIL_H = 480;
const BTN_W = 120, BTN_H = 40, BTN_R = 20;

// Colors
const BG          = new Color(26, 26, 46, 255);
const TOPBAR_BG   = new Color(15, 52, 96, 230);
const CARD_BG     = new Color(15, 52, 96, 200);
const CARD_BORDER = new Color(74, 144, 217, 180);
const SEL_BORDER  = new Color(255, 215, 0, 255);
const GOLD        = new Color(255, 215, 0, 255);
const WHITE       = Color.WHITE;
const GRAY_TEXT   = new Color(160, 160, 180, 255);
const PROGRESS_BG = new Color(40, 40, 55, 255);
const PROGRESS_FG = new Color(80, 200, 140, 255);
const BACK_TEXT   = new Color(26, 26, 46, 255);
const DIM        = new Color(80, 80, 100, 255);

const RACE_NAMES: Record<string, string> = {
    human: '人族', beast: '兽族', spirit: '灵族', demon: '魔族',
};
const RACE_COLORS: Record<string, Color> = {
    human: new Color(80, 160, 255, 255),
    beast: new Color(200, 120, 50, 255),
    spirit: new Color(80, 200, 140, 255),
    demon: new Color(180, 60, 180, 255),
};
const RACE_ORDER = ['human', 'beast', 'spirit', 'demon'];

const QUALITY_NAMES: Record<string, string> = {
    green: '绿', blue: '蓝', purple: '紫', gold: '金',
    gold1: '金+1', gold2: '金+2', gold3: '金+3',
};
const QUALITY_COLORS: Record<string, Color> = {
    green: new Color(80, 200, 80, 255),
    blue: new Color(80, 160, 255, 255),
    purple: new Color(180, 80, 255, 255),
    gold: new Color(255, 215, 0, 255),
    gold1: new Color(255, 200, 50, 255),
    gold2: new Color(255, 180, 30, 255),
    gold3: new Color(255, 160, 0, 255),
};
/** 品质对应的卡片底色（稍带品质色调） */
const QUALITY_CARD_BG: Record<string, Color> = {
    green:  new Color(18, 40, 28, 230),
    blue:   new Color(15, 35, 60, 230),
    purple: new Color(30, 18, 50, 230),
    gold:   new Color(40, 35, 15, 230),
    gold1:  new Color(40, 35, 15, 230),
    gold2:  new Color(40, 35, 15, 230),
    gold3:  new Color(40, 35, 15, 230),
};

function getShape(role: string): UnitShape {
    switch (role) {
        case 'tank':     return 'rect';
        case 'melee':    return 'triangle';
        case 'ranged':   return 'circle';
        case 'support':  return 'hexagon';
        case 'assassin': return 'diamond';
        default:         return 'rect';
    }
}

@ccclass('UnitManageUI')
export class UnitManageUI extends Component {

    private _container: Node | null = null;
    private _configs: Map<string, UnitConfig> = new Map();
    private _playerUnits: UnitInstanceData[] = [];
    private _selectedUid: string | null = null;
    private _selectedRace: string = 'human';
    private _listContent: Node | null = null;
    private _detailPanel: Node | null = null;
    private _countLabel: Label | null = null;
    private _tabNode: Node | null = null;
    private _SW: number = 1280;
    private _SH: number = 720;
    private _qualityOrder: string[] = ['green', 'blue', 'purple', 'gold', 'gold1', 'gold2', 'gold3'];
    private _qualityMultipliers: Record<string, number> = {
        green: 1.0, blue: 1.3, purple: 1.7, gold: 2.2,
        gold1: 2.6, gold2: 3.0, gold3: 3.5,
    };
    private _detailTab: 'upgrade' | 'ascend' = 'upgrade';

    onLoad() {
        const design = view.getDesignResolutionSize();
        this._SW = design.width || 1280;
        this._SH = design.height || 720;
        this.node.layer = Layers.Enum.UI_2D;
        console.log(`[UnitManageUI] screen size: ${this._SW}x${this._SH}`);

        this.buildUI();

        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(this.node);

        EventBus.instance.on('deployment:ready', this.onConfigsReady, this);
        EventBus.instance.on('configs:ready', this.onConfigsReady, this);
    }

    onDestroy() {
        EventBus.instance.off('deployment:ready', this.onConfigsReady, this);
        EventBus.instance.off('configs:ready', this.onConfigsReady, this);
    }

    private onConfigsReady(configs: Map<string, UnitConfig>): void {
        console.log(`[UnitManageUI] onConfigsReady: configs size=${configs?.size}, isLoaded=${PlayerManager.instance.isLoaded}`);
        if (PlayerManager.instance.isLoaded) {
            const allUnits = PlayerManager.instance.getAllUnits();
            console.log(`[UnitManageUI] player units: ${allUnits.length}`, allUnits.map(u => `${u.configId}(uid=${u.uid})`));
        }
        this._configs = configs;
        this.refreshUnitList();
        console.log(`[UnitManageUI] after refreshUnitList: _playerUnits=${this._playerUnits.length}, _selectedUid=${this._selectedUid}, _selectedRace=${this._selectedRace}`);
        if (this._playerUnits.length > 0 && !this._selectedUid) {
            this._selectedUid = this._playerUnits[0].uid;
        }
        this.refreshDetail();
    }

    // ---- Build UI ----

    private buildUI(): void {
        const SW = this._SW, SH = this._SH;
        const container = new Node('UnitManageContainer');
        const ct = container.addComponent(UITransform);
        ct.setContentSize(SW, SH);
        ct.setAnchorPoint(0.5, 0.5);
        container.setPosition(0, 0, 0);
        this._container = container;
        this.node.addChild(container);

        this.drawRect(container, SW, SH, BG, 0, 0);

        this.buildTopBar(container);
        this.buildListArea(container);
        this.buildDetailPanel(container);
    }

    private buildTopBar(parent: Node): void {
        const SW = this._SW, SH = this._SH;
        const TB_H = 50;
        const topBar = new Node('TopBar');
        const tut = topBar.addComponent(UITransform);
        tut.setContentSize(SW, TB_H);
        tut.setAnchorPoint(0.5, 0.5);
        topBar.setPosition(0, SH / 2 - TB_H / 2, 0);

        this.drawRect(topBar, SW, TB_H, TOPBAR_BG, 0, 0);

        // Back button
        const backBtn = new Node('BtnBack');
        const but = backBtn.addComponent(UITransform);
        but.setContentSize(80, 36);
        but.setAnchorPoint(0.5, 0.5);
        backBtn.setPosition(-SW / 2 + 60, 0, 0);

        const backBg = new Node('BackBg');
        const bbgut = backBg.addComponent(UITransform);
        bbgut.setContentSize(80, 36);
        bbgut.setAnchorPoint(0.5, 0.5);
        backBg.setPosition(0, 0, 0);
        const bbg = backBg.addComponent(Graphics);
        bbg.fillColor = GOLD;
        bbg.roundRect(-40, -18, 80, 36, 18);
        bbg.fill();
        backBtn.insertChild(backBg, 0);

        const backTxt = this.addLabel(backBtn, '返回', 16, BACK_TEXT, 0, 0, 80, true);
        backBtn.on(Node.EventType.TOUCH_END, () => {
            director.loadScene('main');
        }, this);
        topBar.addChild(backBtn);

        // Title
        this.addLabel(topBar, '兵种管理', 22, GOLD, 0, 0, 200, true);

        parent.addChild(topBar);
    }

    private buildListArea(parent: Node): void {
        const SW = this._SW, SH = this._SH;
        // Left side: race tabs + unit card list
        const listArea = new Node('ListArea');
        const laut = listArea.addComponent(UITransform);
        laut.setContentSize(520, SH - 80);
        laut.setAnchorPoint(0.5, 0.5);
        listArea.setPosition(-SW / 2 + 270, -20, 0);

        // Race tabs
        const TAB_W = 90, TAB_H = 32;
        const tabNode = new Node('RaceTabs');
        const tut = tabNode.addComponent(UITransform);
        tut.setContentSize(520, TAB_H);
        tut.setAnchorPoint(0.5, 0.5);
        tabNode.setPosition(0, (SH - 80) / 2 - TAB_H / 2, 0);

        const totalTabW = RACE_ORDER.length * TAB_W + (RACE_ORDER.length - 1) * 12;
        const tabStartX = -totalTabW / 2 + TAB_W / 2;

        RACE_ORDER.forEach((race, i) => {
            const tab = new Node(`Tab_${race}`);
            const ut = tab.addComponent(UITransform);
            ut.setContentSize(TAB_W, TAB_H);
            ut.setAnchorPoint(0.5, 0.5);
            tab.setPosition(tabStartX + i * (TAB_W + 12), 0, 0);

            const bg = new Node('TabBg');
            const bgut = bg.addComponent(UITransform);
            bgut.setContentSize(TAB_W, TAB_H);
            bgut.setAnchorPoint(0.5, 0.5);
            bg.setPosition(0, 0, 0);
            const g = bg.addComponent(Graphics);
            g.fillColor = CARD_BG;
            g.roundRect(-TAB_W / 2, -TAB_H / 2, TAB_W, TAB_H, 6);
            g.fill();
            tab.insertChild(bg, 0);

            // 底部指示线
            const indicator = new Node('Indicator');
            const iut = indicator.addComponent(UITransform);
            iut.setContentSize(TAB_W - 10, 3);
            iut.setAnchorPoint(0.5, 0.5);
            indicator.setPosition(0, -TAB_H / 2 + 2, 0);
            indicator.active = false;
            const ig = indicator.addComponent(Graphics);
            ig.fillColor = RACE_COLORS[race] || GOLD;
            ig.rect(-(TAB_W - 10) / 2, -1, TAB_W - 10, 3);
            ig.fill();
            tab.addChild(indicator);

            this.addLabel(tab, RACE_NAMES[race] || race, 14, GRAY_TEXT, 0, 0, TAB_W, true);

            tab.on(Node.EventType.TOUCH_END, () => {
                this._selectedRace = race;
                this._selectedUid = null;
                this.refreshUnitList();
                this.refreshDetail();
                this.refreshTabStyles(tabNode);
            }, this);

            tabNode.addChild(tab);
        });

        listArea.addChild(tabNode);
        this._tabNode = tabNode;

        // 初始化 tab 样式
        this.refreshTabStyles(tabNode);

        // 总览数量
        const countNode = this.addLabel(listArea, '', 12, GRAY_TEXT, 0, (SH - 80) / 2 - TAB_H - 14, 400, true);
        this._countLabel = countNode.getComponent(Label);

        // Scrollable list content area
        this._listContent = new Node('ListContent');
        const lcut = this._listContent.addComponent(UITransform);
        lcut.setContentSize(520, SH - 80 - TAB_H - 40);
        lcut.setAnchorPoint(0.5, 0.5);
        this._listContent.setPosition(0, -44, 0);
        listArea.addChild(this._listContent);

        parent.addChild(listArea);
    }

    private refreshTabStyles(tabNode: Node): void {
        for (const tab of tabNode.children) {
            const bg = tab.getChildByName('TabBg');
            if (!bg) continue;
            const g = bg.getComponent(Graphics);
            if (!g) continue;
            const race = tab.name.replace('Tab_', '');
            const active = race === this._selectedRace;
            const raceColor = RACE_COLORS[race] || GOLD;
            const TAB_W = 90, TAB_H = 32;

            g.clear();
            g.fillColor = active ? new Color(raceColor.r * 0.3, raceColor.g * 0.3, raceColor.b * 0.3, 255) : CARD_BG;
            g.roundRect(-TAB_W / 2, -TAB_H / 2, TAB_W, TAB_H, 6);
            g.fill();
            if (active) {
                g.strokeColor = new Color(raceColor.r, raceColor.g, raceColor.b, 180);
                g.lineWidth = 2;
                g.roundRect(-TAB_W / 2, -TAB_H / 2, TAB_W, TAB_H, 6);
                g.stroke();
            }

            // 底部指示线
            const indicator = tab.getChildByName('Indicator');
            if (indicator) indicator.active = active;

            // 文字颜色
            const lbl = tab.getChildByName('Lbl');
            if (lbl) {
                const label = lbl.getComponent(Label);
                if (label) {
                    label.color = active ? WHITE : GRAY_TEXT;
                    label.isBold = active;
                }
            }
        }
    }

    private buildDetailPanel(parent: Node): void {
        const SW = this._SW;
        const panel = new Node('DetailPanel');
        const put = panel.addComponent(UITransform);
        put.setContentSize(DETAIL_W, DETAIL_H);
        put.setAnchorPoint(0.5, 0.5);
        panel.setPosition(SW / 2 - DETAIL_W / 2 - 10, -20, 0);

        // Panel background
        const bgNode = new Node('DetailBg');
        const bgut = bgNode.addComponent(UITransform);
        bgut.setContentSize(DETAIL_W, DETAIL_H);
        bgut.setAnchorPoint(0.5, 0.5);
        bgNode.setPosition(0, 0, 0);
        const bg = bgNode.addComponent(Graphics);
        bg.fillColor = new Color(20, 20, 40, 240);
        bg.roundRect(-DETAIL_W / 2, -DETAIL_H / 2, DETAIL_W, DETAIL_H, 12);
        bg.fill();
        bg.strokeColor = CARD_BORDER;
        bg.lineWidth = 1;
        bg.roundRect(-DETAIL_W / 2, -DETAIL_H / 2, DETAIL_W, DETAIL_H, 12);
        bg.stroke();
        panel.insertChild(bgNode, 0);

        this._detailPanel = panel;
        parent.addChild(panel);
    }

    // ---- Refresh ----

    private refreshUnitList(): void {
        if (!this._listContent) return;
        this._listContent.removeAllChildren();

        if (!PlayerManager.instance.isLoaded) {
            console.warn('[UnitManageUI] refreshUnitList: PlayerManager not loaded');
            return;
        }

        const allUnits = PlayerManager.instance.getAllUnits();

        // 每个 configId 只保留最高品质的单位
        const bestMap = new Map<string, UnitInstanceData>();
        const order = this._qualityOrder;
        for (const u of allUnits) {
            const existing = bestMap.get(u.configId);
            if (!existing) {
                bestMap.set(u.configId, u);
            } else {
                const idxNew = order.indexOf(u.quality);
                const idxOld = order.indexOf(existing.quality);
                if (idxNew > idxOld || (idxNew === idxOld && u.level > existing.level)) {
                    bestMap.set(u.configId, u);
                }
            }
        }

        const bestUnits = Array.from(bestMap.values());
        const totalCount = bestUnits.length;
        this._playerUnits = bestUnits.filter(u => {
            const cfg = this._configs.get(u.configId);
            return cfg && cfg.race === this._selectedRace;
        });
        console.log(`[UnitManageUI] filtered units for ${this._selectedRace}: ${this._playerUnits.length} (total=${allUnits.length}, unique=${bestUnits.length})`);

        // 更新总览数量
        if (this._countLabel) {
            const raceName = RACE_NAMES[this._selectedRace] || this._selectedRace;
            this._countLabel.string = `共 ${totalCount} 种  |  ${raceName} ${this._playerUnits.length} 种`;
        }

        if (this._playerUnits.length === 0) {
            this.addLabel(this._listContent, '该种族暂无兵种', 16, GRAY_TEXT, 0, 0, 300, true);
            return;
        }

        const cols = 3;
        const totalW = cols * CARD_W + (cols - 1) * CARD_GAP;
        const startX = -totalW / 2 + CARD_W / 2;
        const startY = (this._listContent.getComponent(UITransform)!.contentSize.height) / 2 - CARD_H / 2 - 10;

        this._playerUnits.forEach((unit, i) => {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const cx = startX + col * (CARD_W + CARD_GAP);
            const cy = startY - row * (CARD_H + CARD_GAP);

            const cfg = this._configs.get(unit.configId);
            if (!cfg) return;

            const card = new Node(`Unit_${unit.uid}`);
            const cut = card.addComponent(UITransform);
            cut.setContentSize(CARD_W, CARD_H);
            cut.setAnchorPoint(0.5, 0.5);
            card.setPosition(cx, cy, 0);

            const isSelected = unit.uid === this._selectedUid;
            const qColor = QUALITY_COLORS[unit.quality] || GRAY_TEXT;

            // Background (品质底色)
            const bgNode = new Node('CardBg');
            const bgut = bgNode.addComponent(UITransform);
            bgut.setContentSize(CARD_W, CARD_H);
            bgut.setAnchorPoint(0.5, 0.5);
            bgNode.setPosition(0, 0, 0);
            const cardGfx = bgNode.addComponent(Graphics);
            const cardBg = isSelected ? new Color(30, 70, 120, 255) : (QUALITY_CARD_BG[unit.quality] || CARD_BG);
            cardGfx.fillColor = cardBg;
            cardGfx.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
            cardGfx.fill();
            cardGfx.strokeColor = isSelected ? SEL_BORDER : new Color(qColor.r, qColor.g, qColor.b, 120);
            cardGfx.lineWidth = isSelected ? 2 : 1;
            cardGfx.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
            cardGfx.stroke();
            card.insertChild(bgNode, 0);

            // 品质竖条 (左侧)
            const stripNode = new Node('QualityStrip');
            const strput = stripNode.addComponent(UITransform);
            strput.setContentSize(4, CARD_H - 10);
            strput.setAnchorPoint(0.5, 0.5);
            stripNode.setPosition(-CARD_W / 2 + 6, 0, 0);
            const strg = stripNode.addComponent(Graphics);
            strg.fillColor = qColor;
            strg.rect(-2, -(CARD_H - 10) / 2, 4, CARD_H - 10);
            strg.fill();
            card.addChild(stripNode);

            // Shape icon
            const shape = getShape(cfg.role);
            const shapeNode = new Node('Shape');
            const sut = shapeNode.addComponent(UITransform);
            sut.setContentSize(36, 36);
            sut.setAnchorPoint(0.5, 0.5);
            shapeNode.setPosition(0, 48, 0);
            const sg = shapeNode.addComponent(Graphics);
            sg.fillColor = RACE_COLORS[cfg.race] || new Color(74, 144, 217, 255);
            drawShape(sg, shape, 36);
            sg.fill();
            card.addChild(shapeNode);

            // Name
            this.addLabel(card, cfg.name, 14, WHITE, 0, 16, CARD_W - 10, true);

            // Level + Quality
            this.addLabel(card, `Lv${unit.level}`, 12, GRAY_TEXT, -24, -4, 50, true);
            this.addLabel(card, QUALITY_NAMES[unit.quality] || unit.quality, 12, qColor, 36, -4, 40, true);

            // Deploy count
            const deployCount = LevelSystem.instance.getDeployCount(unit.level);
            this.addLabel(card, `上阵 ×${deployCount}`, 11, GOLD, 0, -24, CARD_W - 10, true);

            // 迷你属性 (带标签)
            const mult = this._qualityMultipliers[unit.quality] || 1.0;
            const lvl = unit.level - 1;
            const g = cfg.growths;
            const hp = Math.round(cfg.baseStats.hp + lvl * g.hp * mult);
            const atk = Math.round(cfg.baseStats.atk + lvl * g.atk * mult);
            const def = Math.round(cfg.baseStats.def + lvl * g.def * mult);
            this.addLabel(card, `血${hp} 攻${atk} 防${def}`, 10, DIM, 0, -42, CARD_W - 10, true);

            // Touch
            card.on(Node.EventType.TOUCH_END, () => {
                this._selectedUid = unit.uid;
                this.refreshUnitList();
                this.refreshDetail();
            }, this);

            this._listContent.addChild(card);
        });

        this._fixChildLayers(this._listContent);
    }

    private refreshDetail(): void {
        if (!this._detailPanel) return;
        const bg = this._detailPanel.getChildByName('DetailBg');
        this._detailPanel.removeAllChildren();
        if (bg) this._detailPanel.addChild(bg);
        this._detailPanel.insertChild(bg!, 0);

        if (!this._selectedUid || !PlayerManager.instance.isLoaded) {
            this.addLabel(this._detailPanel, '选择一个兵种查看详情', 16, GRAY_TEXT, 0, 0, DETAIL_W, true);
            this._fixChildLayers(this._detailPanel);
            return;
        }

        const unit = PlayerManager.instance.getUnit(this._selectedUid);
        if (!unit) return;
        const cfg = this._configs.get(unit.configId);
        if (!cfg) return;

        const raceColor = RACE_COLORS[cfg.race] || new Color(74, 144, 217, 255);
        const qColor = QUALITY_COLORS[unit.quality] || GRAY_TEXT;
        const topY = DETAIL_H / 2 - 25;
        let y = topY;

        // ---- Top: shape + name + level + quality ----
        // 头部底色条
        const headerBg = new Node('HeaderBg');
        const hbut = headerBg.addComponent(UITransform);
        hbut.setContentSize(DETAIL_W - 20, 50);
        hbut.setAnchorPoint(0.5, 0.5);
        headerBg.setPosition(0, y - 10, 0);
        const hbg = headerBg.addComponent(Graphics);
        hbg.fillColor = new Color(raceColor.r * 0.15, raceColor.g * 0.15, raceColor.b * 0.15, 200);
        hbg.roundRect(-(DETAIL_W - 20) / 2, -25, DETAIL_W - 20, 50, 6);
        hbg.fill();
        this._detailPanel.addChild(headerBg);

        const shape = getShape(cfg.role);
        const shapeNode = new Node('DetailShape');
        const sut = shapeNode.addComponent(UITransform);
        sut.setContentSize(36, 36);
        sut.setAnchorPoint(0.5, 0.5);
        shapeNode.setPosition(-DETAIL_W / 2 + 40, y, 0);
        const sg = shapeNode.addComponent(Graphics);
        sg.fillColor = raceColor;
        drawShape(sg, shape, 36);
        sg.fill();
        this._detailPanel.addChild(shapeNode);

        this.addLabel(this._detailPanel, cfg.name, 20, WHITE, 30, y, DETAIL_W - 80, false);
        this.addLabel(this._detailPanel, `Lv${unit.level}`, 15, GOLD, 30, y - 22, 80, false);
        const deployCount = LevelSystem.instance.getDeployCount(unit.level);
        this.addLabel(this._detailPanel, `×${deployCount}`, 13, GRAY_TEXT, 110, y - 22, 60, false);
        this.addLabel(this._detailPanel, QUALITY_NAMES[unit.quality] || unit.quality, 13, qColor, 170, y - 22, 60, false);

        // ---- Stats (quality-affected) ----
        y -= 55;

        const mult = this._qualityMultipliers[unit.quality] || 1.0;
        const lvl = unit.level - 1;
        const g = cfg.growths;
        const actualStats = {
            hp:  Math.round(cfg.baseStats.hp  + lvl * g.hp  * mult),
            atk: Math.round(cfg.baseStats.atk + lvl * g.atk * mult),
            def: Math.round(cfg.baseStats.def + lvl * g.def * mult),
            spd: Math.round(cfg.baseStats.spd + lvl * g.spd * mult),
            range:    cfg.baseStats.range,
            atkSpd:   cfg.baseStats.atkSpd,
        };

        // 属性条形图
        const STAT_BAR_W = 200, STAT_BAR_H = 10;
        const STAT_MAX: Record<string, number> = { hp: 3000, atk: 500, def: 400, spd: 200 };
        const STAT_NAMES: Record<string, string> = { hp: '生命', atk: '攻击', def: '防御', spd: '速度' };
        const STAT_COLORS: Record<string, Color> = {
            hp: new Color(80, 200, 120, 255),
            atk: new Color(255, 100, 80, 255),
            def: new Color(80, 160, 255, 255),
            spd: new Color(255, 200, 60, 255),
        };
        const statKeys = ['hp', 'atk', 'def', 'spd'];
        const statLabelX = -DETAIL_W / 2 + 30;
        const barStartX = statLabelX + 36;
        const valX = barStartX + STAT_BAR_W + 8;

        for (const key of statKeys) {
            const val = (actualStats as any)[key] || 0;
            const maxVal = STAT_MAX[key] || 500;
            const ratio = Math.min(1, val / maxVal);
            const fillWidth = Math.max(2, STAT_BAR_W * ratio);
            const barColor = STAT_COLORS[key];

            // 标签
            this.addLabel(this._detailPanel, STAT_NAMES[key], 11, GRAY_TEXT, statLabelX, y, 34, false);
            // 条背景
            const sbg = new Node(`StatBg_${key}`);
            const sbgut = sbg.addComponent(UITransform);
            sbgut.setContentSize(STAT_BAR_W, STAT_BAR_H);
            sbgut.setAnchorPoint(0, 0.5);
            sbg.setPosition(barStartX, y, 0);
            const sbgGfx = sbg.addComponent(Graphics);
            sbgGfx.fillColor = PROGRESS_BG;
            sbgGfx.roundRect(0, -STAT_BAR_H / 2, STAT_BAR_W, STAT_BAR_H, 3);
            sbgGfx.fill();
            this._detailPanel.addChild(sbg);
            // 条填充
            const sfg = new Node(`StatFill_${key}`);
            const sfgut = sfg.addComponent(UITransform);
            sfgut.setContentSize(STAT_BAR_W, STAT_BAR_H);
            sfgut.setAnchorPoint(0, 0.5);
            sfg.setPosition(barStartX, y, 0);
            const sfgGfx = sfg.addComponent(Graphics);
            sfgGfx.fillColor = barColor;
            sfgGfx.roundRect(0, -STAT_BAR_H / 2, fillWidth, STAT_BAR_H, 3);
            sfgGfx.fill();
            this._detailPanel.addChild(sfg);
            // 数值
            this.addLabel(this._detailPanel, `${val}`, 11, barColor, valX, y, 60, false);

            y -= 22;
        }

        // 成长系数 + 射程/攻速
        y -= 2;
        this.addLabel(this._detailPanel, `成长 ×${mult.toFixed(1)}`, 12,
            new Color(180, 160, 230, 255), statLabelX, y, 80, false);
        this.addLabel(this._detailPanel, `射程 ${actualStats.range}  攻速 ${actualStats.atkSpd}`, 12,
            new Color(200, 200, 220, 255), barStartX + 110, y, 200, false);

        // ---- EXP progress bar ----
        y -= 22;
        const expLabelX = -DETAIL_W / 2 + 30;
        this.addLabel(this._detailPanel, '经验', 13, WHITE, expLabelX, y, 40, false);

        const BAR_W = DETAIL_W - 120, BAR_H = 14;
        const barX = expLabelX + 40;
        const barY = y - 2;

        const barBg = new Node('ExpBarBg');
        const bbgut = barBg.addComponent(UITransform);
        bbgut.setContentSize(BAR_W, BAR_H);
        bbgut.setAnchorPoint(0, 0.5);
        barBg.setPosition(barX, barY, 0);
        const bbg = barBg.addComponent(Graphics);
        bbg.fillColor = PROGRESS_BG;
        bbg.roundRect(0, -BAR_H / 2, BAR_W, BAR_H, 4);
        bbg.fill();
        this._detailPanel.addChild(barBg);

        const progress = LevelSystem.instance.getLevelProgress(unit);
        const fillW = Math.max(2, BAR_W * Math.min(1, progress));
        const barFill = new Node('ExpBarFill');
        const bfut = barFill.addComponent(UITransform);
        bfut.setContentSize(BAR_W, BAR_H);
        bfut.setAnchorPoint(0, 0.5);
        barFill.setPosition(barX, barY, 0);
        const bfg = barFill.addComponent(Graphics);
        bfg.fillColor = PROGRESS_FG;
        bfg.roundRect(0, -BAR_H / 2, fillW, BAR_H, 4);
        bfg.fill();
        this._detailPanel.addChild(barFill);

        y = barY - 16;
        const currentThreshold = LevelSystem.instance.getExpForLevel(unit.level);
        const nextThreshold = LevelSystem.instance.getExpForLevel(unit.level + 1);
        const expInLevel = unit.exp - currentThreshold;
        const expNeeded = nextThreshold > currentThreshold ? nextThreshold - currentThreshold : 0;
        const maxLevel = LevelSystem.instance.getMaxLevel();
        const expText = unit.level >= maxLevel
            ? `已满级 (${unit.exp} EXP)`
            : `${expInLevel} / ${expNeeded} EXP`;
        this.addLabel(this._detailPanel, expText, 12, new Color(200, 200, 220, 255), barX, y, BAR_W, false);

        // ---- Divider ----
        y -= 18;
        const divNode = new Node('TabDivider');
        const dvut = divNode.addComponent(UITransform);
        dvut.setContentSize(DETAIL_W - 20, 1);
        dvut.setAnchorPoint(0.5, 0.5);
        divNode.setPosition(0, y, 0);
        const dvGfx = divNode.addComponent(Graphics);
        dvGfx.fillColor = new Color(74, 144, 217, 60);
        dvGfx.rect(-(DETAIL_W - 20) / 2, 0, DETAIL_W - 20, 1);
        dvGfx.fill();
        this._detailPanel.addChild(divNode);

        // ---- Tab buttons (at the bottom of panel) ----
        const TAB_BAR_H = 40;
        const tabBarY = -DETAIL_H / 2 + TAB_BAR_H / 2 + 12;
        const tabBtnW = (DETAIL_W - 40) / 2;
        this.buildDetailTab(unit, -tabBtnW / 2 - 5, tabBarY, tabBtnW, TAB_BAR_H, 'upgrade', '升  级');
        this.buildDetailTab(unit, tabBtnW / 2 + 5, tabBarY, tabBtnW, TAB_BAR_H, 'ascend', '合  成');

        // ---- Tab content area (between divider and tab bar) ----
        const contentTop = y - 14;
        const contentBottom = tabBarY + TAB_BAR_H / 2 + 8;

        if (this._detailTab === 'upgrade') {
            this.buildUpgradeContent(unit, contentTop, contentBottom);
        } else {
            this.buildAscendContent(unit, contentTop, contentBottom);
        }

        this._fixChildLayers(this._detailPanel);
    }

    /** Build one tab button at bottom of detail panel */
    private buildDetailTab(unit: UnitInstanceData, x: number, y: number, w: number, h: number,
        tabId: 'upgrade' | 'ascend', label: string): void {
        const active = this._detailTab === tabId;
        const tabBtn = new Node(`TabBtn_${tabId}`);
        const tut = tabBtn.addComponent(UITransform);
        tut.setContentSize(w, h);
        tut.setAnchorPoint(0.5, 0.5);
        tabBtn.setPosition(x, y, 0);

        const tabBg = new Node('TabBg');
        const tbgut = tabBg.addComponent(UITransform);
        tbgut.setContentSize(w, h);
        tbgut.setAnchorPoint(0.5, 0.5);
        tabBg.setPosition(0, 0, 0);
        const tabGfx = tabBg.addComponent(Graphics);
        tabGfx.fillColor = active ? new Color(30, 80, 140, 255) : new Color(20, 30, 50, 200);
        tabGfx.roundRect(-w / 2, -h / 2, w, h, h / 2);
        tabGfx.fill();
        if (active) {
            tabGfx.strokeColor = tabId === 'upgrade' ? PROGRESS_FG : new Color(180, 80, 255, 255);
            tabGfx.lineWidth = 2;
            tabGfx.roundRect(-w / 2, -h / 2, w, h, h / 2);
            tabGfx.stroke();
        }
        tabBtn.insertChild(tabBg, 0);

        this.addLabel(tabBtn, label, 14, active ? WHITE : GRAY_TEXT, 0, 0, w, true);

        if (!active) {
            tabBtn.on(Node.EventType.TOUCH_END, () => {
                this._detailTab = tabId;
                this.refreshDetail();
            }, this);
        }

        this._detailPanel.addChild(tabBtn);
    }

    /** Tab content: 升级 (经验书) */
    private buildUpgradeContent(unit: UnitInstanceData, topY: number, _bottomY: number): void {
        let y = topY;
        const leftX = -DETAIL_W / 2 + 30;

        this.addLabel(this._detailPanel, '使用经验书', 13, WHITE, 0, y, DETAIL_W, true);
        y -= 44;

        const bookIds = LevelSystem.instance.getExpBookIds();
        const bookW = 115, bookH = 50, bookGap = 12;
        const totalBookW = bookIds.length * bookW + (bookIds.length - 1) * bookGap;
        const bookStartX = -totalBookW / 2 + bookW / 2;

        // 经验书按钮颜色
        const BOOK_COLORS = [
            new Color(80, 200, 120, 255),   // 初级 - 绿
            new Color(80, 160, 255, 255),    // 中级 - 蓝
            new Color(180, 80, 255, 255),    // 高级 - 紫
        ];

        for (let i = 0; i < bookIds.length; i++) {
            const bookId = bookIds[i];
            const bookCfg = LevelSystem.instance.getExpBookConfig(bookId);
            if (!bookCfg) continue;

            const owned = PlayerManager.instance.getItemCount(bookId);
            const bx = bookStartX + i * (bookW + bookGap);
            const bookColor = BOOK_COLORS[i] || CARD_BORDER;

            const bookBtn = new Node(`BookBtn_${bookId}`);
            const but = bookBtn.addComponent(UITransform);
            but.setContentSize(bookW, bookH);
            but.setAnchorPoint(0.5, 0.5);
            bookBtn.setPosition(bx, y, 0);

            const btnBg = new Node('BookBtnBg');
            const btnbgut = btnBg.addComponent(UITransform);
            btnbgut.setContentSize(bookW, bookH);
            btnbgut.setAnchorPoint(0.5, 0.5);
            btnBg.setPosition(0, 0, 0);
            const btnbg = btnBg.addComponent(Graphics);
            btnbg.fillColor = owned > 0
                ? new Color(bookColor.r * 0.15, bookColor.g * 0.15, bookColor.b * 0.15, 230)
                : new Color(35, 35, 50, 230);
            btnbg.roundRect(-bookW / 2, -bookH / 2, bookW, bookH, 8);
            btnbg.fill();
            btnbg.strokeColor = owned > 0 ? bookColor : new Color(50, 50, 65, 180);
            btnbg.lineWidth = owned > 0 ? 1.5 : 1;
            btnbg.roundRect(-bookW / 2, -bookH / 2, bookW, bookH, 8);
            btnbg.stroke();
            bookBtn.insertChild(btnBg, 0);

            this.addLabel(bookBtn, bookCfg.name, 12, owned > 0 ? WHITE : DIM, 0, 8, bookW, true);
            this.addLabel(bookBtn, `+${bookCfg.exp}`, 11, owned > 0 ? GOLD : DIM, 0, -5, bookW, true);
            this.addLabel(bookBtn, `×${owned}`, 10, owned > 0 ? bookColor : DIM, 0, -18, bookW, true);

            if (owned > 0) {
                bookBtn.on(Node.EventType.TOUCH_END, () => {
                    this.useExpBook(unit.uid, bookId);
                }, this);
            }

            this._detailPanel.addChild(bookBtn);
        }
    }

    /** Tab content: 合成/升阶 (碎片系统) */
    private buildAscendContent(unit: UnitInstanceData, topY: number, _bottomY: number): void {
        let y = topY;
        const pm = PlayerManager.instance;
        const inv = pm.data.inventory || {};
        const configId = unit.configId;
        const leftX = -DETAIL_W / 2 + 24;
        const us = UpgradeSystem.instance;

        // ---- 碎片持有 (横排) ----
        const shardCounts = us.getShardCounts(configId, inv);
        this.addLabel(this._detailPanel, '碎片持有', 13, WHITE, 0, y, DETAIL_W, true);
        y -= 22;

        // 碎片横排：色点 + 名称 + 数量
        const shardTotalW = shardCounts.length * 72;
        let shardX = -shardTotalW / 2 + 36;
        for (const sc of shardCounts) {
            const qColor = QUALITY_COLORS[sc.quality] || GRAY_TEXT;
            const qName = QUALITY_NAMES[sc.quality] || sc.quality;
            // 色点
            const dot = new Node(`Dot_${sc.quality}`);
            dot.setPosition(shardX - 24, y, 0);
            const dut = dot.addComponent(UITransform);
            dut.setContentSize(10, 10);
            dut.setAnchorPoint(0.5, 0.5);
            const dg = dot.addComponent(Graphics);
            dg.fillColor = qColor;
            dg.circle(0, 0, 5);
            dg.fill();
            this._detailPanel.addChild(dot);
            // 名称 + 数量
            this.addLabel(this._detailPanel, `${qName} ${sc.count}`, 12, qColor, shardX + 4, y, 60, false);
            shardX += 72;
        }
        y -= 34;

        // ---- 碎片合成 (横排两个按钮) ----
        this.addLabel(this._detailPanel, '碎片合成', 13, WHITE, 0, y, DETAIL_W, true);
        y -= 26;

        const synthesisList = [
            { from: 'green', fromName: '绿', to: 'blue', toName: '蓝' },
            { from: 'blue',  fromName: '蓝', to: 'purple', toName: '紫' },
        ];
        const synthW = 170, synthH = 32, synthGap = 14;
        const synthStartX = -(synthesisList.length * synthW + (synthesisList.length - 1) * synthGap) / 2 + synthW / 2;

        for (let si = 0; si < synthesisList.length; si++) {
            const synth = synthesisList[si];
            const next = us.getNextShardQuality(synth.from);
            if (!next) continue;
            const count = us.getSynthesisCount(synth.from);
            const check = us.canSynthesize(configId, synth.from, inv);
            const toQColor = QUALITY_COLORS[next] || GRAY_TEXT;
            const sx = synthStartX + si * (synthW + synthGap);

            const synthBtn = new Node(`BtnSynth_${synth.from}`);
            const sbut = synthBtn.addComponent(UITransform);
            sbut.setContentSize(synthW, synthH);
            sbut.setAnchorPoint(0.5, 0.5);
            synthBtn.setPosition(sx, y, 0);

            const synthBg = new Node('SynthBg');
            const sbgut = synthBg.addComponent(UITransform);
            sbgut.setContentSize(synthW, synthH);
            sbgut.setAnchorPoint(0.5, 0.5);
            synthBg.setPosition(0, 0, 0);
            const sbgGfx = synthBg.addComponent(Graphics);
            sbgGfx.fillColor = check.can ? new Color(30, 60, 100, 230) : new Color(28, 28, 42, 200);
            sbgGfx.roundRect(-synthW / 2, -synthH / 2, synthW, synthH, 16);
            sbgGfx.fill();
            if (check.can) {
                sbgGfx.strokeColor = toQColor;
                sbgGfx.lineWidth = 1;
                sbgGfx.roundRect(-synthW / 2, -synthH / 2, synthW, synthH, 16);
                sbgGfx.stroke();
            }
            synthBtn.insertChild(synthBg, 0);

            this.addLabel(synthBtn, `${synth.fromName}碎片 ×${count} → ${synth.toName}碎片`, 12,
                check.can ? WHITE : DIM, 0, 0, synthW, true);

            if (check.can) {
                synthBtn.on(Node.EventType.TOUCH_END, () => {
                    this.performSynthesize(configId, synth.from);
                }, this);
            }

            this._detailPanel.addChild(synthBtn);
        }
        y -= 36;

        // ---- 分隔线 ----
        const sep = new Node('AscendSep');
        const seput = sep.addComponent(UITransform);
        seput.setContentSize(DETAIL_W - 40, 1);
        seput.setAnchorPoint(0.5, 0.5);
        sep.setPosition(0, y, 0);
        const sepGfx = sep.addComponent(Graphics);
        sepGfx.fillColor = new Color(74, 144, 217, 50);
        sepGfx.rect(-(DETAIL_W - 40) / 2, 0, DETAIL_W - 40, 1);
        sepGfx.fill();
        this._detailPanel.addChild(sep);
        y -= 22;

        // ---- 升阶区域 (三列并排) ----
        const nextQ = us.getNextQuality(unit.quality);
        if (!nextQ) {
            this.addLabel(this._detailPanel, '已达最高品质', 14, GOLD, 0, y, DETAIL_W, true);
            return;
        }

        const nextQColor = QUALITY_COLORS[nextQ] || GRAY_TEXT;
        const nextQName = QUALITY_NAMES[nextQ] || nextQ;
        const qColor = QUALITY_COLORS[unit.quality] || GRAY_TEXT;
        const qName = QUALITY_NAMES[unit.quality] || unit.quality;

        // 标题
        this.addLabel(this._detailPanel, '品质升阶', 13, WHITE, 0, y, DETAIL_W, true);
        y -= 30;

        // 三列 X 坐标
        const col1X = -DETAIL_W / 2 + 70;    // 品质跃迁
        const col2X = 0;                       // 碎片消耗
        const col3X = DETAIL_W / 2 - 80;      // 升阶按钮

        // 列1：品质跃迁
        this.addLabel(this._detailPanel, qName, 18, qColor, col1X - 16, y, 40, true);
        this.addLabel(this._detailPanel, '→', 20, WHITE, col1X + 16, y, 24, true);
        this.addLabel(this._detailPanel, nextQName, 18, nextQColor, col1X + 44, y, 50, true);

        // 列2：碎片消耗
        const cost = us.getCost(unit)!;
        const shardHave = inv[cost.materialId] || 0;
        const enough = shardHave >= cost.count;
        this.addLabel(this._detailPanel, `${qName}碎片`, 12, new Color(200, 200, 220, 255), col2X, y + 10, 80, true);
        this.addLabel(this._detailPanel, `${shardHave}/${cost.count}`, 14,
            enough ? GOLD : new Color(255, 100, 100, 255), col2X, y - 8, 80, true);

        // 列3：升阶按钮
        const check = us.canUpgrade(unit, inv);
        const upBtn = new Node('BtnUpgrade');
        const ubut = upBtn.addComponent(UITransform);
        ubut.setContentSize(120, 36);
        ubut.setAnchorPoint(0.5, 0.5);
        upBtn.setPosition(col3X, y, 0);

        const upBg = new Node('UpBtnBg');
        const upbgut = upBg.addComponent(UITransform);
        upbgut.setContentSize(120, 36);
        upbgut.setAnchorPoint(0.5, 0.5);
        upBg.setPosition(0, 0, 0);
        const upbgGfx = upBg.addComponent(Graphics);
        upbgGfx.fillColor = check.can ? new Color(180, 80, 255, 255) : new Color(50, 35, 70, 200);
        upbgGfx.roundRect(-60, -18, 120, 36, 18);
        upbgGfx.fill();
        if (check.can) {
            upbgGfx.strokeColor = new Color(220, 160, 255, 200);
            upbgGfx.lineWidth = 2;
            upbgGfx.roundRect(-60, -18, 120, 36, 18);
            upbgGfx.stroke();
        }
        upBtn.insertChild(upBg, 0);

        const btnText = check.can ? '升  阶' : (check.reason.length > 4 ? '不足' : check.reason);
        this.addLabel(upBtn, btnText, 14,
            check.can ? WHITE : new Color(100, 90, 120, 255), 0, 0, 120, true);

        if (check.can) {
            upBtn.on(Node.EventType.TOUCH_END, () => {
                this.performUpgrade(unit.uid);
            }, this);
        }

        this._detailPanel.addChild(upBtn);
    }

    /** 执行碎片合成 */
    private performSynthesize(configId: string, fromQuality: string): void {
        if (!PlayerManager.instance.isLoaded) return;
        const result = UpgradeSystem.instance.synthesize(configId, fromQuality, PlayerManager.instance.data.inventory || {});
        if (result.success) {
            console.log(`[UnitManageUI] 合成成功: ${fromQuality} → ${result.toQuality}`);
            PlayerManager.instance.save();
            this.refreshDetail();
        } else {
            console.warn(`[UnitManageUI] 合成失败: ${result.reason}`);
        }
    }

    /** 执行升阶 */
    private performUpgrade(unitUid: string): void {
        if (!PlayerManager.instance.isLoaded) return;
        const unit = PlayerManager.instance.getUnit(unitUid);
        if (!unit) return;

        const result = UpgradeSystem.instance.upgrade(unit, PlayerManager.instance.data.inventory || {});
        if (result.success) {
            console.log(`[UnitManageUI] 升阶成功: ${result.oldQuality} → ${result.newQuality}`);
            PlayerManager.instance.save();
            this.refreshUnitList();
            this.refreshDetail();
        } else {
            console.warn(`[UnitManageUI] 升品失败: ${result.reason}`);
        }
    }

    /** 递归修正子节点 layer 为 UI_2D */
    private _fixChildLayers(node: Node | null): void {
        if (!node) return;
        node.layer = Layers.Enum.UI_2D;
        node.children.forEach(c => this._fixChildLayers(c));
    }

    private useExpBook(unitUid: string, bookId: string): void {
        if (!PlayerManager.instance.isLoaded) return;

        const unit = PlayerManager.instance.getUnit(unitUid);
        if (!unit) return;

        const bookCfg = LevelSystem.instance.getExpBookConfig(bookId);
        if (!bookCfg) return;

        if (!PlayerManager.instance.removeItem(bookId, 1)) {
            console.warn(`[UnitManageUI] 经验书不足: ${bookId}`);
            return;
        }

        const result = LevelSystem.instance.addExp(unit, bookCfg.exp);
        PlayerManager.instance.save();

        if (result.levelsGained > 0) {
            const newCount = LevelSystem.instance.getDeployCount(result.newLevel);
            const oldCount = LevelSystem.instance.getDeployCount(result.oldLevel);
            console.log(`[UnitManageUI] ${unit.configId} 升级: Lv${result.oldLevel} -> Lv${result.newLevel} (上阵 ${oldCount} -> ${newCount})`);
        } else {
            console.log(`[UnitManageUI] ${unit.configId} +${bookCfg.exp} EXP (Lv${unit.level})`);
        }

        // Refresh display
        this.refreshUnitList();
        this.refreshDetail();
    }

    // ---- Draw helpers ----

    private drawRect(parent: Node, w: number, h: number, color: Color, x: number, y: number): Node {
        const n = new Node('BgRect');
        const ut = n.addComponent(UITransform);
        ut.setContentSize(w, h);
        ut.setAnchorPoint(0.5, 0.5);
        n.setPosition(x, y, 0);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        parent.insertChild(n, 0);
        return n;
    }

    private addLabel(parent: Node, text: string, fontSize: number, color: Color,
        x: number, y: number, w: number = 0, bold: boolean = false): Node {
        const n = new Node('Lbl');
        if (w > 0) {
            const ut = n.addComponent(UITransform);
            ut.setContentSize(w, fontSize + 4);
            ut.setAnchorPoint(0.5, 0.5);
        }
        n.setPosition(x, y, 0);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = fontSize;
        l.isBold = bold;
        l.color = color;
        if (w > 0) l.horizontalAlign = Label.HorizontalAlign.CENTER;
        parent.addChild(n);
        return n;
    }
}
