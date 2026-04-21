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
import { RelicSystem } from '../systems/RelicSystem';
import { STAT_NAMES as RELIC_STAT_NAMES } from '../models/RelicData';
import { GameConfig } from '../core/GameConfig';
import { RACE_NAMES, QUALITY_SHORT, SCENE_LABELS } from '../core/DisplayNames';

const { ccclass } = _decorator;

const CARD_W = 150, CARD_H = 190;
const CARD_GAP = 16;
const DETAIL_W = 420, DETAIL_H = 560;
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

// RACE_NAMES imported from DisplayNames
const RACE_COLORS: Record<string, Color> = {
    human: new Color(80, 160, 255, 255),
    beast: new Color(200, 120, 50, 255),
    spirit: new Color(80, 200, 140, 255),
    demon: new Color(180, 60, 180, 255),
};
const RACE_ORDER = ['human', 'beast', 'spirit', 'demon'];

const QUALITY_NAMES = QUALITY_SHORT;
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
    private _detailTab: 'upgrade' | 'ascend' | 'relic' = 'upgrade';
    private _selectedShardIndices: Set<number> = new Set();
    private _shardSelectUnitUid: string = '';

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
        this.addLabel(topBar, SCENE_LABELS.units, 22, GOLD, 0, 0, 200, true);

        parent.addChild(topBar);
    }

    private buildListArea(parent: Node): void {
        const SW = this._SW, SH = this._SH;
        // Left side: race tabs + unit card list
        const listArea = new Node('ListArea');
        const laut = listArea.addComponent(UITransform);
        laut.setContentSize(520, SH - 100);
        laut.setAnchorPoint(0.5, 0.5);
        listArea.setPosition(-SW / 2 + 270, -10, 0);

        // Race tabs
        const TAB_W = 90, TAB_H = 32;
        const tabNode = new Node('RaceTabs');
        const tut = tabNode.addComponent(UITransform);
        tut.setContentSize(520, TAB_H);
        tut.setAnchorPoint(0.5, 0.5);
        tabNode.setPosition(0, (SH - 100) / 2 - TAB_H / 2, 0);

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
        const countNode = this.addLabel(listArea, '', 12, GRAY_TEXT, 0, (SH - 100) / 2 - TAB_H - 14, 400, true);
        this._countLabel = countNode.getComponent(Label);

        // Scrollable list content area
        this._listContent = new Node('ListContent');
        const lcut = this._listContent.addComponent(UITransform);
        lcut.setContentSize(520, SH - 100 - TAB_H - 40);
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
        panel.setPosition(SW / 2 - DETAIL_W / 2 - 10, -10, 0);

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

        // ═══════ 计算实际属性 ═══════
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
        const relic = RelicSystem.instance.getRelicEquippedByUnit(unit.uid);
        if (relic) {
            const bonuses = RelicSystem.instance.getStatBonuses(relic);
            if (bonuses.hp)     actualStats.hp     = Math.round(actualStats.hp   * (1 + bonuses.hp / 100));
            if (bonuses.atk)    actualStats.atk    = Math.round(actualStats.atk  * (1 + bonuses.atk / 100));
            if (bonuses.def)    actualStats.def    = Math.round(actualStats.def  * (1 + bonuses.def / 100));
            if (bonuses.atkSpd) actualStats.atkSpd  = Math.round(actualStats.atkSpd * (1 + bonuses.atkSpd / 100));
        }

        // 布局：topY=265, 从上到下分区排列
        const topY = DETAIL_H / 2 - 15;
        let y = topY;

        // ═══════ Zone 1: Header (60px) ═══════
        const HEADER_H = 60;
        const headerBg = new Node('HeaderBg');
        const hbut = headerBg.addComponent(UITransform);
        hbut.setContentSize(DETAIL_W - 16, HEADER_H);
        hbut.setAnchorPoint(0.5, 0.5);
        headerBg.setPosition(0, y - HEADER_H / 2, 0);
        const hbg = headerBg.addComponent(Graphics);
        hbg.fillColor = new Color(raceColor.r * 0.15, raceColor.g * 0.15, raceColor.b * 0.15, 200);
        hbg.roundRect(-(DETAIL_W - 16) / 2, -HEADER_H / 2, DETAIL_W - 16, HEADER_H, 8);
        hbg.fill();
        this._detailPanel.addChild(headerBg);

        const shape = getShape(cfg.role);
        const shapeNode = new Node('DetailShape');
        const sut = shapeNode.addComponent(UITransform);
        sut.setContentSize(42, 42);
        sut.setAnchorPoint(0.5, 0.5);
        shapeNode.setPosition(-DETAIL_W / 2 + 38, y - HEADER_H / 2, 0);
        const sg = shapeNode.addComponent(Graphics);
        sg.fillColor = raceColor;
        drawShape(sg, shape, 42);
        sg.fill();
        this._detailPanel.addChild(shapeNode);

        this.addLabel(this._detailPanel, cfg.name, 20, WHITE, 35, y - HEADER_H / 2 + 10, DETAIL_W - 90, false);
        // Info row (flow): Lv + deploy + quality
        const deployCount = LevelSystem.instance.getDeployCount(unit.level);
        const infoY = y - HEADER_H / 2 - 12;
        let infoX = -DETAIL_W / 2 + 68;
        infoX = this.addFlowLabel(this._detailPanel, `Lv${unit.level}`, 14, GOLD, infoX, infoY, 50) + 4;
        infoX = this.addFlowLabel(this._detailPanel, `×${deployCount}`, 12, GRAY_TEXT, infoX, infoY, 36) + 4;
        this.addFlowLabel(this._detailPanel, QUALITY_NAMES[unit.quality] || unit.quality, 12, qColor, infoX, infoY, 40);

        y -= HEADER_H + 8;

        // ═══════ Zone 2: Stats section (含成长/射程/攻速，合成页不显示) ═══════
        if (this._detailTab === 'upgrade') {
        const STATS_H = 156;
        const statsBg = new Node('StatsSectionBg');
        const stut = statsBg.addComponent(UITransform);
        stut.setContentSize(DETAIL_W - 16, STATS_H);
        stut.setAnchorPoint(0.5, 0.5);
        statsBg.setPosition(0, y - STATS_H / 2, 0);
        const stGfx = statsBg.addComponent(Graphics);
        stGfx.fillColor = new Color(22, 22, 42, 200);
        stGfx.roundRect(-(DETAIL_W - 16) / 2, -STATS_H / 2, DETAIL_W - 16, STATS_H, 8);
        stGfx.fill();
        stGfx.strokeColor = new Color(74, 144, 217, 40);
        stGfx.lineWidth = 1;
        stGfx.roundRect(-(DETAIL_W - 16) / 2, -STATS_H / 2, DETAIL_W - 16, STATS_H, 8);
        stGfx.stroke();
        this._detailPanel.addChild(statsBg);

        this.addLabel(this._detailPanel, '属  性', 14, new Color(150, 150, 170, 255),
            0, y - 10, DETAIL_W - 16, true);

        const statFS = this.mapFS(12);
        const STAT_LABEL_W = 48;
        const STAT_BAR_W = 190;
        const STAT_BAR_H = 12;
        const STAT_MAX: Record<string, number> = { hp: 3000, atk: 500, def: 400, spd: 200 };
        const STAT_NAMES_MAP: Record<string, string> = { hp: '生命', atk: '攻击', def: '防御', spd: '速度' };
        const STAT_COLORS: Record<string, Color> = {
            hp: new Color(80, 200, 120, 255),
            atk: new Color(255, 100, 80, 255),
            def: new Color(80, 160, 255, 255),
            spd: new Color(255, 200, 60, 255),
        };
        const statKeys = ['hp', 'atk', 'def', 'spd'];
        // 行总宽 = 标签 + 间距 + 条 + 间距 + 数值
        const rowW = STAT_LABEL_W + 4 + STAT_BAR_W + 6 + 60;
        const rowLeft = -rowW / 2;

        let statY = y - 30;
        for (const key of statKeys) {
            const val = (actualStats as any)[key] || 0;
            const maxVal = STAT_MAX[key] || 500;
            const ratio = Math.min(1, val / maxVal);
            const fillWidth = Math.max(2, STAT_BAR_W * ratio);
            const barColor = STAT_COLORS[key];
            let curX = rowLeft;

            // ① 标签 — anchor(0, 0.5)，LEFT 对齐，固定宽度
            const lblNode = new Node(`StatLbl_${key}`);
            const lblUt = lblNode.addComponent(UITransform);
            lblUt.setContentSize(STAT_LABEL_W, statFS + 4);
            lblUt.setAnchorPoint(0, 0.5);
            lblNode.setPosition(curX, statY, 0);
            const lbl = lblNode.addComponent(Label);
            lbl.string = STAT_NAMES_MAP[key];
            lbl.fontSize = statFS;
            lbl.color = new Color(180, 180, 200, 255);
            lbl.horizontalAlign = Label.HorizontalAlign.LEFT;
            this._detailPanel.addChild(lblNode);
            curX += STAT_LABEL_W + 4;

            // ② 属性条背景 — anchor(0, 0.5)
            const sbg = new Node(`StatBg_${key}`);
            const sbgut = sbg.addComponent(UITransform);
            sbgut.setContentSize(STAT_BAR_W, STAT_BAR_H);
            sbgut.setAnchorPoint(0, 0.5);
            sbg.setPosition(curX, statY, 0);
            const sbgGfx = sbg.addComponent(Graphics);
            sbgGfx.fillColor = PROGRESS_BG;
            sbgGfx.roundRect(0, -STAT_BAR_H / 2, STAT_BAR_W, STAT_BAR_H, 3);
            sbgGfx.fill();
            this._detailPanel.addChild(sbg);

            // ③ 属性条填充 — anchor(0, 0.5)
            const sfg = new Node(`StatFill_${key}`);
            const sfgut = sfg.addComponent(UITransform);
            sfgut.setContentSize(STAT_BAR_W, STAT_BAR_H);
            sfgut.setAnchorPoint(0, 0.5);
            sfg.setPosition(curX, statY, 0);
            const sfgGfx = sfg.addComponent(Graphics);
            sfgGfx.fillColor = barColor;
            sfgGfx.roundRect(0, -STAT_BAR_H / 2, fillWidth, STAT_BAR_H, 3);
            sfgGfx.fill();
            this._detailPanel.addChild(sfg);
            curX += STAT_BAR_W + 6;

            // ④ 数值 — anchor(0, 0.5)，LEFT 对齐
            const valNode = new Node(`StatVal_${key}`);
            const valUt = valNode.addComponent(UITransform);
            valUt.setContentSize(60, statFS + 4);
            valUt.setAnchorPoint(0, 0.5);
            valNode.setPosition(curX, statY, 0);
            const valLbl = valNode.addComponent(Label);
            valLbl.string = `${val}`;
            valLbl.fontSize = statFS;
            valLbl.color = barColor;
            valLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
            this._detailPanel.addChild(valNode);

            statY -= 26;
        }

        // 成长/射程/攻速（flow layout，在属性卡片内）
        const secCY = statY - 10;
        let secX = -(100 + 10 + 90 + 10 + 90) / 2;
        secX = this.addFlowLabel(this._detailPanel, `成长 ×${mult.toFixed(1)}`, 12,
            new Color(180, 160, 230, 255), secX, secCY, 100) + 10;
        secX = this.addFlowLabel(this._detailPanel, `射程 ${actualStats.range}`, 12,
            new Color(200, 200, 220, 255), secX, secCY, 90) + 10;
        this.addFlowLabel(this._detailPanel, `攻速 ${actualStats.atkSpd}`, 12,
            new Color(200, 200, 220, 255), secX, secCY, 90);

        y -= STATS_H + 14;
        } // end stats section

        // ═══════ Zone 3: EXP progress（仅升级 tab 显示） ═══════
        if (this._detailTab === 'upgrade') {
            const EXP_LABEL_W = 48;
            const EXP_BAR_W = 300;
            const EXP_BAR_H = 14;
            const expRowW = EXP_LABEL_W + 4 + EXP_BAR_W;
            let expX = -expRowW / 2;
            const barY = y;

            expX = this.addFlowLabel(this._detailPanel, '经验', 13, WHITE, expX, barY, EXP_LABEL_W) + 4;
            const barStartX = expX;

            const barBg = new Node('ExpBarBg');
            const bbgut = barBg.addComponent(UITransform);
            bbgut.setContentSize(EXP_BAR_W, EXP_BAR_H);
            bbgut.setAnchorPoint(0, 0.5);
            barBg.setPosition(barStartX, barY, 0);
            const bbg = barBg.addComponent(Graphics);
            bbg.fillColor = PROGRESS_BG;
            bbg.roundRect(0, -EXP_BAR_H / 2, EXP_BAR_W, EXP_BAR_H, 4);
            bbg.fill();
            this._detailPanel.addChild(barBg);

            const progress = LevelSystem.instance.getLevelProgress(unit);
            const fillW = Math.max(2, EXP_BAR_W * Math.min(1, progress));
            const barFill = new Node('ExpBarFill');
            const bfut = barFill.addComponent(UITransform);
            bfut.setContentSize(EXP_BAR_W, EXP_BAR_H);
            bfut.setAnchorPoint(0, 0.5);
            barFill.setPosition(barStartX, barY, 0);
            const bfg = barFill.addComponent(Graphics);
            bfg.fillColor = PROGRESS_FG;
            bfg.roundRect(0, -EXP_BAR_H / 2, fillW, EXP_BAR_H, 4);
            bfg.fill();
            this._detailPanel.addChild(barFill);

            const currentThreshold = LevelSystem.instance.getExpForLevel(unit.level);
            const nextThreshold = LevelSystem.instance.getExpForLevel(unit.level + 1);
            const expInLevel = unit.exp - currentThreshold;
            const expNeeded = nextThreshold > currentThreshold ? nextThreshold - currentThreshold : 0;
            const maxLevel = LevelSystem.instance.getMaxLevel();
            const expText = unit.level >= maxLevel
                ? `已满级 (${unit.exp} EXP)`
                : `${expInLevel} / ${expNeeded} EXP`;
            this.addFlowLabel(this._detailPanel, expText, 12,
                new Color(200, 200, 220, 255), barStartX, barY - 22, EXP_BAR_W);
            y = barY - 46;
        }

        // ═══════ Divider ═══════
        y -= 8;
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

        // ═══════ Tab buttons ═══════
        const TAB_BAR_H = 40;
        const tabBarY = -DETAIL_H / 2 + TAB_BAR_H / 2 + 12;
        const tabBtnW = (DETAIL_W - 50) / 3;
        this.buildDetailTab(unit, -tabBtnW - 5, tabBarY, tabBtnW, TAB_BAR_H, 'upgrade', '升  级');
        this.buildDetailTab(unit, 0, tabBarY, tabBtnW, TAB_BAR_H, 'ascend', '合  成');
        this.buildDetailTab(unit, tabBtnW + 5, tabBarY, tabBtnW, TAB_BAR_H, 'relic', '圣  物');

        // ═══════ Tab content area ═══════
        const contentTop = y - 6;
        const contentBottom = tabBarY + TAB_BAR_H / 2 + 6;

        if (this._detailTab === 'upgrade') {
            this.buildUpgradeContent(unit, contentTop, contentBottom);
        } else if (this._detailTab === 'ascend') {
            this.buildAscendContent(unit, contentTop, contentBottom);
        } else {
            this.buildRelicContent(unit, contentTop, contentBottom);
        }

        this._fixChildLayers(this._detailPanel);
    }

    /** Build one tab button at bottom of detail panel */
    private buildDetailTab(unit: UnitInstanceData, x: number, y: number, w: number, h: number,
        tabId: 'upgrade' | 'ascend' | 'relic', label: string): void {
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
            tabGfx.strokeColor = tabId === 'upgrade' ? PROGRESS_FG : tabId === 'ascend' ? new Color(180, 80, 255, 255) : new Color(255, 215, 0, 255);
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

    /** Tab content: 圣物装备 */
    private buildRelicContent(unit: UnitInstanceData, topY: number, bottomY: number): void {
        const W = DETAIL_W - 30;
        let y = topY;
        const sectionTitleH = this.mapFS(14) + 4;

        const RELIC_Q_COLORS: Record<string, Color> = {
            green: new Color(80, 200, 80, 255), blue: new Color(80, 160, 255, 255),
            purple: new Color(180, 80, 255, 255), gold: new Color(255, 215, 0, 255),
        };

        const relic = RelicSystem.instance.getRelicEquippedByUnit(unit.uid);

        // ═══════ 当前装备 ═══════
        this.addLabel(this._detailPanel, '当前装备', 14, new Color(150, 150, 170, 255),
            0, y, DETAIL_W, true);
        y -= 2 * sectionTitleH;

        if (relic) {
            const cfg = GameConfig.instance.getRelicConfig(relic.configId);
            const qColor = RELIC_Q_COLORS[relic.quality] || new Color(80, 200, 80, 255);
            const mainVal = RelicSystem.instance.calcMainStatValue(relic);
            const nameStr = cfg ? cfg.name : relic.configId;

            // 卡片高度：名称行 + 等级行 + 主属性行 + 副属性行(最多3) + 底部padding
            const cardH = 80 + relic.subStats.length * 20;

            const card = new Node('RelicCard');
            card.addComponent(UITransform).setContentSize(W, cardH);
            card.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
            card.setPosition(0, y - cardH / 2, 0);
            const cardG = card.addComponent(Graphics);
            cardG.fillColor = new Color(25, 35, 55, 220);
            cardG.roundRect(-W / 2, -cardH / 2, W, cardH, 10);
            cardG.fill();
            cardG.strokeColor = qColor;
            cardG.lineWidth = 2;
            cardG.roundRect(-W / 2, -cardH / 2, W, cardH, 10);
            cardG.stroke();
            // 左侧品质色条
            cardG.fillColor = new Color(qColor.r, qColor.g, qColor.b, 180);
            cardG.roundRect(-W / 2, -cardH / 2, 4, cardH, 2);
            cardG.fill();

            // 名称（居中）
            this.addLabel(card, nameStr, 15, qColor, 0, cardH / 2 - 20, W - 16, true);
            // 等级（居中）
            this.addLabel(card, `Lv.${relic.level}`, 12, GOLD, 0, cardH / 2 - 40, W, true);
            // 主属性（居中）
            this.addLabel(card, `${RELIC_STAT_NAMES[relic.mainStat.stat]} +${mainVal.toFixed(1)}%`, 13,
                WHITE, 0, cardH / 2 - 60, W, true);
            // 副属性（居中）
            for (let si = 0; si < relic.subStats.length; si++) {
                const sub = relic.subStats[si];
                this.addLabel(card, `${RELIC_STAT_NAMES[sub.stat]} +${sub.value.toFixed(1)}%`, 11,
                    GRAY_TEXT, 0, cardH / 2 - 78 - si * 20, W, true);
            }

            this._detailPanel.addChild(card);
            y -= cardH + 8;

            // 卸下按钮（居中，红色调）
            const unequipBtn = new Node('BtnUnequip');
            unequipBtn.addComponent(UITransform).setContentSize(120, 32);
            unequipBtn.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
            unequipBtn.setPosition(0, y - 16, 0);
            const ubg = new Node('UnequipBg');
            ubg.addComponent(UITransform).setContentSize(120, 32);
            ubg.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
            ubg.setPosition(0, 0, 0);
            const ubgG = ubg.addComponent(Graphics);
            ubgG.fillColor = new Color(120, 50, 40, 220);
            ubgG.roundRect(-60, -16, 120, 32, 16);
            ubgG.fill();
            ubgG.strokeColor = new Color(200, 80, 60, 150);
            ubgG.lineWidth = 1;
            ubgG.roundRect(-60, -16, 120, 32, 16);
            ubgG.stroke();
            unequipBtn.insertChild(ubg, 0);
            this.addLabel(unequipBtn, '卸  下', 13, WHITE, 0, 0, 120, true);
            unequipBtn.on(Node.EventType.TOUCH_END, () => {
                RelicSystem.instance.unequipRelic(relic.uid);
                this.refreshDetail();
            }, this);
            this._detailPanel.addChild(unequipBtn);
            y -= 48;
        } else {
            // 空卡片
            const emptyH = 50;
            const emptyCard = new Node('EmptyRelic');
            emptyCard.addComponent(UITransform).setContentSize(W, emptyH);
            emptyCard.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
            emptyCard.setPosition(0, y - emptyH / 2, 0);
            const eg = emptyCard.addComponent(Graphics);
            eg.fillColor = new Color(22, 22, 42, 200);
            eg.roundRect(-W / 2, -emptyH / 2, W, emptyH, 10);
            eg.fill();
            eg.strokeColor = new Color(60, 60, 80, 120);
            eg.lineWidth = 1;
            eg.roundRect(-W / 2, -emptyH / 2, W, emptyH, 10);
            eg.stroke();
            this.addLabel(emptyCard, '未装备圣物', 14, GRAY_TEXT, 0, 0, W, true);
            this._detailPanel.addChild(emptyCard);
            y -= emptyH + 12;
        }

        // ═══════ 可用圣物 ═══════
        const availableRelics = RelicSystem.instance.getAvailableRelics()
            .filter(r => RelicSystem.instance.canEquipTo(r, unit.uid));

        if (availableRelics.length > 0) {
            // 分隔线
            const sep = new Node('RelicSep');
            sep.addComponent(UITransform).setContentSize(DETAIL_W - 40, 1);
            sep.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
            sep.setPosition(0, y, 0);
            const sepG = sep.addComponent(Graphics);
            sepG.fillColor = new Color(74, 144, 217, 50);
            sepG.rect(-(DETAIL_W - 40) / 2, 0, DETAIL_W - 40, 1);
            sepG.fill();
            this._detailPanel.addChild(sep);
            y -= 8;

            this.addLabel(this._detailPanel, '可用圣物', 14, new Color(150, 150, 170, 255),
                0, y, DETAIL_W, true);
            y -= 2 * sectionTitleH;

            // 迷你卡片网格
            const miniW = 80, miniH = 56, gap = 10;
            const cols = 4;
            const gridW = cols * (miniW + gap) - gap;
            const startX = -gridW / 2 + miniW / 2;

            for (let i = 0; i < availableRelics.length && i < 12; i++) {
                const r = availableRelics[i];
                const col = i % cols;
                const row = Math.floor(i / cols);
                const cx = startX + col * (miniW + gap);
                const cy = y - row * (miniH + gap) - miniH / 2;

                const rCfg = GameConfig.instance.getRelicConfig(r.configId);
                const rqColor = RELIC_Q_COLORS[r.quality] || new Color(80, 200, 80, 255);

                const miniCard = new Node(`MiniRelic_${i}`);
                miniCard.addComponent(UITransform).setContentSize(miniW, miniH);
                miniCard.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
                miniCard.setPosition(cx, cy, 0);
                const mcG = miniCard.addComponent(Graphics);
                mcG.fillColor = new Color(rqColor.r * 0.1, rqColor.g * 0.1, rqColor.b * 0.1, 230);
                mcG.roundRect(-miniW / 2, -miniH / 2, miniW, miniH, 8);
                mcG.fill();
                mcG.strokeColor = rqColor;
                mcG.lineWidth = 1;
                mcG.roundRect(-miniW / 2, -miniH / 2, miniW, miniH, 8);
                mcG.stroke();
                // 顶部品质色小条
                mcG.fillColor = new Color(rqColor.r, rqColor.g, rqColor.b, 160);
                mcG.roundRect(-miniW / 2 + 6, miniH / 2 - 4, miniW - 12, 3, 1);
                mcG.fill();

                this.addLabel(miniCard, rCfg ? rCfg.name.substring(0, 4) : r.configId.substring(0, 4),
                    11, WHITE, 0, 6, miniW - 4, true);
                this.addLabel(miniCard, `Lv.${r.level}`, 10, GOLD, 0, -10, miniW, true);

                miniCard.on(Node.EventType.TOUCH_END, () => {
                    RelicSystem.instance.equipRelic(r.uid, unit.uid);
                    this.refreshDetail();
                });
                this._detailPanel.addChild(miniCard);
            }
        } else if (!relic) {
            this.addLabel(this._detailPanel, '背包中无可用圣物', 13, DIM, 0, y - 10, W, true);
        }
    }

    /** Tab content: 升级 (经验书) */
    private buildUpgradeContent(unit: UnitInstanceData, topY: number, _bottomY: number): void {
        let y = topY;

        // 标题
        const titleH = this.mapFS(14) + 4;
        this.addLabel(this._detailPanel, '使用经验书', 14, new Color(150, 150, 170, 255),
            0, y, DETAIL_W, true);
        y -= 2 * titleH + 6;

        const bookIds = LevelSystem.instance.getExpBookIds();
        const bookW = 120, bookH = 76, bookGap = 14;
        const totalBookW = bookIds.length * bookW + (bookIds.length - 1) * bookGap;
        const bookStartX = -totalBookW / 2 + bookW / 2;

        // 经验书品质色
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
            const hasBook = owned > 0;

            // ---- 卡片节点 ----
            const bookBtn = new Node(`BookBtn_${bookId}`);
            const but = bookBtn.addComponent(UITransform);
            but.setContentSize(bookW, bookH);
            but.setAnchorPoint(0.5, 0.5);
            bookBtn.setPosition(bx, y, 0);

            // 背景框
            const btnBg = new Node('BookBtnBg');
            const btnbgut = btnBg.addComponent(UITransform);
            btnbgut.setContentSize(bookW, bookH);
            btnbgut.setAnchorPoint(0.5, 0.5);
            btnBg.setPosition(0, 0, 0);
            const btnbg = btnBg.addComponent(Graphics);
            btnbg.fillColor = hasBook
                ? new Color(bookColor.r * 0.15, bookColor.g * 0.15, bookColor.b * 0.15, 230)
                : new Color(35, 35, 50, 230);
            btnbg.roundRect(-bookW / 2, -bookH / 2, bookW, bookH, 8);
            btnbg.fill();
            btnbg.strokeColor = hasBook ? bookColor : new Color(50, 50, 65, 180);
            btnbg.lineWidth = hasBook ? 1.5 : 1;
            btnbg.roundRect(-bookW / 2, -bookH / 2, bookW, bookH, 8);
            btnbg.stroke();
            // 左侧品质色条
            btnbg.fillColor = hasBook ? bookColor : DIM;
            btnbg.rect(-bookW / 2, -bookH / 2 + 6, 4, bookH - 12);
            btnbg.fill();
            bookBtn.insertChild(btnBg, 0);

            // ---- 卡片内容（流水布局） ----
            const innerLeft = -bookW / 2 + 12;
            const nameFS = this.mapFS(12);
            const expFS = this.mapFS(13);
            const countFS = this.mapFS(11);

            // 第一行：名称（左对齐）
            const nameRow = new Node('NameRow');
            const nrut = nameRow.addComponent(UITransform);
            nrut.setContentSize(bookW - 16, nameFS + 4);
            nrut.setAnchorPoint(0, 0.5);
            nameRow.setPosition(innerLeft, bookH / 2 - 18, 0);
            const nameLbl = nameRow.addComponent(Label);
            nameLbl.string = bookCfg.name;
            nameLbl.fontSize = nameFS;
            nameLbl.color = hasBook ? WHITE : DIM;
            nameLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
            bookBtn.addChild(nameRow);

            // 第二行：经验值（左对齐，金色突出）
            const expRow = new Node('ExpRow');
            const erut = expRow.addComponent(UITransform);
            erut.setContentSize(bookW - 16, expFS + 4);
            erut.setAnchorPoint(0, 0.5);
            expRow.setPosition(innerLeft, 0, 0);
            const expLbl = expRow.addComponent(Label);
            expLbl.string = `+${bookCfg.exp} EXP`;
            expLbl.fontSize = expFS;
            expLbl.isBold = true;
            expLbl.color = hasBook ? GOLD : DIM;
            expLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
            bookBtn.addChild(expRow);

            // 第三行：持有数量（左对齐）
            const countRow = new Node('CountRow');
            const crut = countRow.addComponent(UITransform);
            crut.setContentSize(bookW - 16, countFS + 4);
            crut.setAnchorPoint(0, 0.5);
            countRow.setPosition(innerLeft, -bookH / 2 + 16, 0);
            const countLbl = countRow.addComponent(Label);
            countLbl.string = `持有 ×${owned}`;
            countLbl.fontSize = countFS;
            countLbl.color = hasBook ? bookColor : DIM;
            countLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
            bookBtn.addChild(countRow);

            // 点击使用
            if (hasBook) {
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
        const us = UpgradeSystem.instance;
        const sectionTitleH = this.mapFS(14) + 4;

        // 切换单位时清空选中
        if (this._shardSelectUnitUid !== (this._selectedUid || '')) {
            this._selectedShardIndices.clear();
            this._shardSelectUnitUid = this._selectedUid || '';
        }

        // ═══════ 碎片持有 ═══════
        const shardCounts = us.getShardCounts(configId, inv);
        this.addLabel(this._detailPanel, '碎片持有', 14, new Color(150, 150, 170, 255),
            0, y, DETAIL_W, true);
        y -= 2 * sectionTitleH;

        // 扁平化碎片列表（每个碎片一个圆圈）
        const allShards: string[] = [];
        for (const sc of shardCounts) {
            for (let i = 0; i < sc.count; i++) {
                allShards.push(sc.quality);
            }
        }

        if (allShards.length === 0) {
            this.addLabel(this._detailPanel, '暂无碎片', 13, DIM, 0, y, DETAIL_W, true);
            y -= sectionTitleH;
        } else {
            // 圆圈网格
            const CIRCLE_R = 12;
            const CIRCLE_GAP = 6;
            const MAX_COLS = 9;
            const cellSize = CIRCLE_R * 2 + CIRCLE_GAP;
            const gridW = MAX_COLS * cellSize - CIRCLE_GAP;
            const gridStartX = -gridW / 2 + CIRCLE_R;
            const totalRows = Math.ceil(allShards.length / MAX_COLS);

            for (let i = 0; i < allShards.length; i++) {
                const row = Math.floor(i / MAX_COLS);
                const col = i % MAX_COLS;
                const cx = gridStartX + col * cellSize;
                const cy = y - CIRCLE_R - row * cellSize;

                const quality = allShards[i];
                const isSelected = this._selectedShardIndices.has(i);
                const qColor = QUALITY_COLORS[quality] || GRAY_TEXT;

                const circleNode = new Node(`Shard_${i}`);
                const cut = circleNode.addComponent(UITransform);
                cut.setContentSize(CIRCLE_R * 2, CIRCLE_R * 2);
                cut.setAnchorPoint(0.5, 0.5);
                circleNode.setPosition(cx, cy, 0);

                const g = circleNode.addComponent(Graphics);
                g.fillColor = qColor;
                g.circle(0, 0, CIRCLE_R);
                g.fill();
                if (isSelected) {
                    g.strokeColor = GOLD;
                    g.lineWidth = 2;
                    g.circle(0, 0, CIRCLE_R + 2);
                    g.stroke();
                }

                circleNode.on(Node.EventType.TOUCH_END, () => {
                    if (this._selectedShardIndices.has(i)) {
                        this._selectedShardIndices.delete(i);
                    } else {
                        this._selectedShardIndices.add(i);
                    }
                    this.refreshDetail();
                });

                this._detailPanel.addChild(circleNode);
            }

            y -= totalRows * cellSize + 8;
        }

        // ═══════ 合成按钮 ═══════
        // 统计选中碎片品质
        const selectedByQuality: Record<string, number> = {};
        for (const idx of this._selectedShardIndices) {
            if (idx < allShards.length) {
                const q = allShards[idx];
                selectedByQuality[q] = (selectedByQuality[q] || 0) + 1;
            }
        }
        // 合成：选中 ≥3 同色且该色可升级
        const canSynth = Object.entries(selectedByQuality).some(
            ([q, c]) => c >= 3 && !!us.getNextShardQuality(q));
        // 一键合成：任一品质总量 ≥3 且可升级
        const canOneClick = shardCounts.some(
            sc => sc.count >= 3 && !!us.getNextShardQuality(sc.quality));

        const btnW = 140, btnH = 34, btnGap = 16;
        const btnY = y - btnH / 2;

        // 合成按钮
        const synthBtn = new Node('BtnSynth');
        synthBtn.addComponent(UITransform).setContentSize(btnW, btnH);
        synthBtn.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        synthBtn.setPosition(-btnW / 2 - btnGap / 2, btnY, 0);

        const sBg = new Node('SynthBg');
        sBg.addComponent(UITransform).setContentSize(btnW, btnH);
        sBg.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        sBg.setPosition(0, 0, 0);
        const sGfx = sBg.addComponent(Graphics);
        sGfx.fillColor = canSynth ? new Color(30, 80, 160, 230) : new Color(30, 30, 45, 200);
        sGfx.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
        sGfx.fill();
        if (canSynth) {
            sGfx.strokeColor = new Color(80, 160, 255, 180);
            sGfx.lineWidth = 1.5;
            sGfx.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
            sGfx.stroke();
        }
        synthBtn.insertChild(sBg, 0);
        this.addLabel(synthBtn, '合  成', 14, canSynth ? WHITE : DIM, 0, 0, btnW, true);

        if (canSynth) {
            synthBtn.on(Node.EventType.TOUCH_END, () => {
                this.performSelectedSynthesize(configId, allShards);
            }, this);
        }
        this._detailPanel.addChild(synthBtn);

        // 一键合成按钮
        const oneClickBtn = new Node('BtnOneClick');
        oneClickBtn.addComponent(UITransform).setContentSize(btnW, btnH);
        oneClickBtn.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        oneClickBtn.setPosition(btnW / 2 + btnGap / 2, btnY, 0);

        const oBg = new Node('OneClickBg');
        oBg.addComponent(UITransform).setContentSize(btnW, btnH);
        oBg.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        oBg.setPosition(0, 0, 0);
        const oGfx = oBg.addComponent(Graphics);
        oGfx.fillColor = canOneClick ? new Color(30, 100, 60, 230) : new Color(30, 30, 45, 200);
        oGfx.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
        oGfx.fill();
        if (canOneClick) {
            oGfx.strokeColor = new Color(80, 200, 120, 180);
            oGfx.lineWidth = 1.5;
            oGfx.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
            oGfx.stroke();
        }
        oneClickBtn.insertChild(oBg, 0);
        this.addLabel(oneClickBtn, '一键合成', 14, canOneClick ? WHITE : DIM, 0, 0, btnW, true);

        if (canOneClick) {
            oneClickBtn.on(Node.EventType.TOUCH_END, () => {
                this.performOneClickSynthesize(configId);
            }, this);
        }
        this._detailPanel.addChild(oneClickBtn);

        y -= btnH + 8;

        // ═══════ 分隔线 ═══════
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
        y -= 5;

        // ═══════ 升阶区域 ═══════
        const nextQ = us.getNextQuality(unit.quality);
        if (!nextQ) {
            this.addLabel(this._detailPanel, '已达最高品质', 14, GOLD, 0, y, DETAIL_W, true);
            return;
        }

        const nextQColor = QUALITY_COLORS[nextQ] || GRAY_TEXT;
        const nextQName = QUALITY_NAMES[nextQ] || nextQ;
        const qColor = QUALITY_COLORS[unit.quality] || GRAY_TEXT;
        const qName = QUALITY_NAMES[unit.quality] || unit.quality;

        const cost = us.getCost(unit)!;
        const shardHave = inv[cost.materialId] || 0;
        const shardEnough = shardHave >= cost.count;
        const scrollHave = inv[cost.scrollId] || 0;
        const scrollEnough = scrollHave >= cost.scrollCount;
        const check = us.canUpgrade(unit, inv);

        // ---- 升阶卡片 ----
        const ascendCardH = 130;
        const ascendCardW = DETAIL_W - 30;
        const ascendCard = new Node('AscendCard');
        const acut = ascendCard.addComponent(UITransform);
        acut.setContentSize(ascendCardW, ascendCardH);
        acut.setAnchorPoint(0.5, 0.5);
        ascendCard.setPosition(0, y - ascendCardH / 2, 0);

        const acBg = new Node('AscendCardBg');
        const acbgut = acBg.addComponent(UITransform);
        acbgut.setContentSize(ascendCardW, ascendCardH);
        acbgut.setAnchorPoint(0.5, 0.5);
        acBg.setPosition(0, 0, 0);
        const acGfx = acBg.addComponent(Graphics);
        acGfx.fillColor = check.can ? new Color(35, 25, 55, 230) : new Color(25, 25, 38, 200);
        acGfx.roundRect(-ascendCardW / 2, -ascendCardH / 2, ascendCardW, ascendCardH, 10);
        acGfx.fill();
        if (check.can) {
            acGfx.strokeColor = new Color(180, 80, 255, 120);
            acGfx.lineWidth = 1.5;
            acGfx.roundRect(-ascendCardW / 2, -ascendCardH / 2, ascendCardW, ascendCardH, 10);
            acGfx.stroke();
        }
        ascendCard.insertChild(acBg, 0);

        // 行1：标题"升级品阶"（居中，与碎片合成同风格）
        this.addLabel(ascendCard, '升级品阶', 13, new Color(150, 150, 170, 255),
            0, ascendCardH / 2 - 18, ascendCardW - 28, true);

        // 行2：品质跃迁（居中）— 三个 addLabel 以中心对称排列
        const qRowY = ascendCardH / 2 - 48;
        this.addLabel(ascendCard, qName, 18, qColor, -40, qRowY, 50, true);
        this.addLabel(ascendCard, '→', 16, new Color(200, 200, 220, 180), 0, qRowY, 24, true);
        this.addLabel(ascendCard, nextQName, 18, nextQColor, 40, qRowY, 60, true);

        // 行3：材料需求（居中）
        const matY = ascendCardH / 2 - 78;
        const shardColor = shardEnough ? GOLD : new Color(255, 100, 100, 255);
        const scrollColor = scrollEnough ? GOLD : new Color(255, 100, 100, 255);
        this.addLabel(ascendCard, `${qName}碎片 ${shardHave}/${cost.count}`, 13,
            shardColor, -70, matY, 120, true);
        this.addLabel(ascendCard, `卷轴 ${scrollHave}/${cost.scrollCount}`, 13,
            scrollColor, 70, matY, 100, true);

        // 行4：升阶按钮
        const upBtnW = 120, upBtnH = 32;
        const upBtn = new Node('BtnUpgrade');
        const ubut = upBtn.addComponent(UITransform);
        ubut.setContentSize(upBtnW, upBtnH);
        ubut.setAnchorPoint(0.5, 0.5);
        upBtn.setPosition(0, -ascendCardH / 2 + 26, 0);

        const upBg = new Node('UpBtnBg');
        const upbgut = upBg.addComponent(UITransform);
        upbgut.setContentSize(upBtnW, upBtnH);
        upbgut.setAnchorPoint(0.5, 0.5);
        upBg.setPosition(0, 0, 0);
        const upbgGfx = upBg.addComponent(Graphics);
        upbgGfx.fillColor = check.can ? new Color(180, 80, 255, 255) : new Color(50, 35, 70, 200);
        upbgGfx.roundRect(-upBtnW / 2, -upBtnH / 2, upBtnW, upBtnH, upBtnH / 2);
        upbgGfx.fill();
        if (check.can) {
            upbgGfx.strokeColor = new Color(220, 160, 255, 200);
            upbgGfx.lineWidth = 2;
            upbgGfx.roundRect(-upBtnW / 2, -upBtnH / 2, upBtnW, upBtnH, upBtnH / 2);
            upbgGfx.stroke();
        }
        upBtn.insertChild(upBg, 0);

        const btnText = check.can ? '升  阶' : (check.reason.length > 4 ? '材料不足' : check.reason);
        this.addLabel(upBtn, btnText, 13,
            check.can ? WHITE : new Color(100, 90, 120, 255), 0, 0, upBtnW, true);

        if (check.can) {
            upBtn.on(Node.EventType.TOUCH_END, () => {
                this.performUpgrade(unit.uid);
            }, this);
        }

        ascendCard.addChild(upBtn);
        this._detailPanel.addChild(ascendCard);
    }

    /** 选中碎片合成（手动选3个同色） */
    private performSelectedSynthesize(configId: string, allShards: string[]): void {
        if (!PlayerManager.instance.isLoaded) return;

        // 找到第一个满足 ≥3 同色的品质
        const selQ: Record<string, number> = {};
        for (const idx of this._selectedShardIndices) {
            if (idx < allShards.length) {
                const q = allShards[idx];
                selQ[q] = (selQ[q] || 0) + 1;
            }
        }
        let targetQ: string | null = null;
        for (const [q, c] of Object.entries(selQ)) {
            if (c >= 3 && UpgradeSystem.instance.getNextShardQuality(q)) {
                targetQ = q;
                break;
            }
        }
        if (!targetQ) return;

        const inv = PlayerManager.instance.data.inventory || {};
        const result = UpgradeSystem.instance.synthesize(configId, targetQ, inv);
        if (result.success) {
            console.log(`[UnitManageUI] 选中合成成功: ${targetQ} → ${result.toQuality}`);
            this._selectedShardIndices.clear();
            PlayerManager.instance.save();
            this.refreshDetail();
        } else {
            console.warn(`[UnitManageUI] 选中合成失败: ${result.reason}`);
        }
    }

    /** 一键合成所有可合成的碎片 */
    private performOneClickSynthesize(configId: string): void {
        if (!PlayerManager.instance.isLoaded) return;
        const inv = PlayerManager.instance.data.inventory || {};
        let anyChange = false;

        // 从低品质到高品质依次合成
        const qualities = ['green', 'blue'];
        for (const q of qualities) {
            while (UpgradeSystem.instance.canSynthesize(configId, q, inv).can) {
                const result = UpgradeSystem.instance.synthesize(configId, q, inv);
                if (result.success) {
                    anyChange = true;
                } else {
                    break;
                }
            }
        }

        if (anyChange) {
            this._selectedShardIndices.clear();
            PlayerManager.instance.save();
            this.refreshDetail();
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

    private mapFS(raw: number): number {
        const fs = GameConfig.instance.fontSizes;
        if (!fs) return raw;
        if (raw >= 44) return fs.hero;
        if (raw >= 34) return fs.titleLg;
        if (raw >= 26) return fs.title;
        if (raw >= 22) return fs.subtitle;
        if (raw >= 18) return fs.body;
        if (raw >= 14) return fs.small;
        return fs.caption;
    }

    private addLabel(parent: Node, text: string, fontSize: number, color: Color,
        x: number, y: number, w: number = 0, bold: boolean = false): Node {
        const actualSize = this.mapFS(fontSize);
        const n = new Node('Lbl');
        if (w > 0) {
            const ut = n.addComponent(UITransform);
            ut.setContentSize(w, actualSize + 4);
            ut.setAnchorPoint(0.5, 0.5);
        }
        n.setPosition(x, y, 0);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = actualSize;
        l.isBold = bold;
        l.color = color;
        if (w > 0) l.horizontalAlign = Label.HorizontalAlign.CENTER;
        parent.addChild(n);
        return n;
    }

    /** 流水布局标签 — anchor(0, 0.5) 左对齐，返回 endX 供 curX 游标定位 */
    private addFlowLabel(parent: Node, text: string, fontSize: number, color: Color,
        x: number, y: number, w: number): number {
        const fs = this.mapFS(fontSize);
        const n = new Node('FLbl');
        const ut = n.addComponent(UITransform);
        ut.setContentSize(w, fs + 4);
        ut.setAnchorPoint(0, 0.5);
        n.setPosition(x, y, 0);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = fs;
        l.color = color;
        l.horizontalAlign = Label.HorizontalAlign.LEFT;
        parent.addChild(n);
        return x + w;
    }

    /** 材料卡片（名称 + 数量，带背景框） */
    private addMaterialCard(cx: number, cy: number, w: number, h: number,
        name: string, count: string, enough: boolean): void {
        const card = new Node('MatCard');
        const cut = card.addComponent(UITransform);
        cut.setContentSize(w, h);
        cut.setAnchorPoint(0.5, 0.5);
        card.setPosition(cx, cy, 0);

        // 背景
        const bg = new Node('MatBg');
        const bgut = bg.addComponent(UITransform);
        bgut.setContentSize(w, h);
        bgut.setAnchorPoint(0.5, 0.5);
        bg.setPosition(0, 0, 0);
        const bgGfx = bg.addComponent(Graphics);
        bgGfx.fillColor = new Color(30, 35, 55, 230);
        bgGfx.roundRect(-w / 2, -h / 2, w, h, 8);
        bgGfx.fill();
        const borderClr = enough ? new Color(80, 200, 120, 160) : new Color(255, 100, 100, 120);
        bgGfx.strokeColor = borderClr;
        bgGfx.lineWidth = 1;
        bgGfx.roundRect(-w / 2, -h / 2, w, h, 8);
        bgGfx.stroke();
        card.insertChild(bg, 0);

        // 名称
        this.addLabel(card, name, 12, new Color(200, 200, 220, 255), 0, 8, w, true);
        // 数量
        this.addLabel(card, count, 16, enough ? GOLD : new Color(255, 100, 100, 255), 0, -10, w, true);

        this._detailPanel.addChild(card);
    }
}
