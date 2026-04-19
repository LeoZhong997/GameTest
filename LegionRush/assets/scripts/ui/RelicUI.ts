/**
 * RelicUI - 圣物管理界面
 * 左侧筛选标签 + 右侧圣物卡片网格
 * 点击卡片弹出详情（升级/装备/卸下/分解）
 */

import { _decorator, Component, Node, Label, Graphics, UITransform, Color, director, view, Layers, ScrollView, Mask } from 'cc';
import { EventBus } from '../core/EventBus';
import { PlayerManager } from '../systems/PlayerManager';
import { GameConfig } from '../core/GameConfig';
import { RelicSystem } from '../systems/RelicSystem';
import { RelicInstance, RelicConfig, RelicStatType, STAT_NAMES } from '../models/RelicData';
import { UnitInstanceData } from '../models/UnitData';

const { ccclass } = _decorator;

// Layout
const TAB_W = 90;
const TAB_GAP = 8;
const CARD_W = 180, CARD_H = 180;
const CARD_GAP = 14;
const COLS = 4;

// Race / Role 中文映射
const RACE_NAMES: Record<string, string> = { human: '人族', beast: '兽族', spirit: '灵族', demon: '魔族' };
const ROLE_NAMES: Record<string, string> = { tank: '坦克', melee: '近战', ranged: '远程', support: '辅助', assassin: '刺客' };

// Colors
const BG = new Color(26, 26, 46, 255);
const TOPBAR_BG = new Color(15, 52, 96, 230);
const CARD_BG = new Color(15, 52, 96, 200);
const GOLD = new Color(255, 215, 0, 255);
const WHITE = Color.WHITE;
const GRAY_TEXT = new Color(160, 160, 180, 255);
const BACK_TEXT = new Color(26, 26, 46, 255);
const TAB_ACTIVE = new Color(20, 50, 90, 255);
const TAB_INACTIVE = new Color(18, 22, 40, 255);

const QUALITY_COLORS: Record<string, Color> = {
    green: new Color(80, 200, 80, 255),
    blue: new Color(80, 160, 255, 255),
    purple: new Color(180, 80, 255, 255),
    gold: new Color(255, 215, 0, 255),
};
const QUALITY_NAMES: Record<string, string> = { green: '普通', blue: '稀有', purple: '史诗', gold: '传说' };

const TAB_DEFS = [
    { key: 'all', label: '全部' },
    { key: 'human', label: '人族' },
    { key: 'beast', label: '兽族' },
    { key: 'spirit', label: '灵族' },
    { key: 'demon', label: '魔族' },
    { key: 'universal', label: '通用' },
    { key: 'unequipped', label: '未装备' },
];

@ccclass('RelicUI')
export class RelicUI extends Component {

    private _container: Node | null = null;
    private _content: Node | null = null;
    private _tabNodes: Node[] = [];
    private _tabIndex: number = 0;
    private _detailPanel: Node | null = null;
    private _SW: number = 1280;
    private _SH: number = 720;

    onLoad() {
        const design = view.getDesignResolutionSize();
        this._SW = design.width || 1280;
        this._SH = design.height || 720;
        this.node.layer = Layers.Enum.UI_2D;

        this.buildUI();
        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(this.node);
    }

    onDestroy() {}

    // ---- Build UI ----

    private buildUI(): void {
        const SW = this._SW, SH = this._SH;
        const container = new Node('RelicContainer');
        const ct = container.addComponent(UITransform);
        ct.setContentSize(SW, SH);
        ct.setAnchorPoint(0.5, 0.5);
        container.setPosition(0, 0, 0);
        this._container = container;
        this.node.addChild(container);

        // 背景
        this.drawRect(container, SW, SH, BG, 0, 0);
        this.buildTopBar(container);
        this.buildTabs(container);

        // 内容区域
        const contentW = SW - TAB_W - 50;
        const contentH = SH - 120;
        const viewX = TAB_W / 2 + 20;
        const viewY = -30;

        const scrollNode = new Node('ScrollView');
        const scrollUT = scrollNode.addComponent(UITransform);
        scrollUT.setContentSize(contentW, contentH);
        scrollUT.setAnchorPoint(0.5, 0.5);
        scrollNode.setPosition(viewX, viewY, 0);

        const viewNode = new Node('view');
        const viewUT = viewNode.addComponent(UITransform);
        viewUT.setContentSize(contentW, contentH);
        viewUT.setAnchorPoint(0.5, 0.5);
        viewNode.setPosition(0, 0, 0);
        viewNode.addComponent(Mask);
        scrollNode.addChild(viewNode);

        this._content = new Node('Content');
        const cut = this._content.addComponent(UITransform);
        cut.setContentSize(contentW, contentH);
        cut.setAnchorPoint(0.5, 1.0);
        this._content.setPosition(0, contentH / 2, 0);
        viewNode.addChild(this._content);

        const sv = scrollNode.addComponent(ScrollView);
        sv.content = this._content;
        sv.horizontal = false;
        sv.vertical = true;
        sv.elastic = true;
        sv.brake = 0.5;

        container.addChild(scrollNode);

        // 底部按钮栏
        this.buildBottomBar(container);

        this.refreshItems();
    }

    private buildTopBar(parent: Node): void {
        const SW = this._SW;
        const TB_H = 50;
        const topBar = new Node('TopBar');
        const tut = topBar.addComponent(UITransform);
        tut.setContentSize(SW, TB_H);
        tut.setAnchorPoint(0.5, 0.5);
        topBar.setPosition(0, this._SH / 2 - TB_H / 2, 0);
        this.drawRect(topBar, SW, TB_H, TOPBAR_BG, 0, 0);

        // 返回
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
        this.addLabel(backBtn, '返回', 16, BACK_TEXT, 0, 0, 80, true);
        backBtn.on(Node.EventType.TOUCH_END, () => director.loadScene('main'));
        topBar.addChild(backBtn);

        // 标题
        this.addLabel(topBar, '圣  物', 22, GOLD, 0, 0, 200, true);

        // 金币数量
        const goldCount = PlayerManager.instance.isLoaded ? PlayerManager.instance.data.gold : 0;
        this.addLabel(topBar, `💰${goldCount}`, 14, new Color(255, 215, 0, 255), SW / 2 - 180, 0, 100, true);

        // 精华数量
        const essenceCount = PlayerManager.instance.isLoaded ? PlayerManager.instance.getItemCount('relic_essence') : 0;
        this.addLabel(topBar, `精华: ${essenceCount}`, 14, new Color(100, 220, 180, 255), SW / 2 - 60, 0, 120, true);

        parent.addChild(topBar);
    }

    private buildTabs(parent: Node): void {
        const SH = this._SH;
        const tabAreaH = SH - 120;
        const tabAreaY = -30;

        const tabArea = new Node('TabArea');
        const tabUT = tabArea.addComponent(UITransform);
        tabUT.setContentSize(TAB_W, tabAreaH);
        tabUT.setAnchorPoint(0.5, 0.5);
        tabArea.setPosition(-this._SW / 2 + TAB_W / 2 + 10, tabAreaY, 0);
        parent.addChild(tabArea);

        const tabBg = new Node('TabBg');
        const tabBgUT = tabBg.addComponent(UITransform);
        tabBgUT.setContentSize(TAB_W, tabAreaH);
        tabBgUT.setAnchorPoint(0.5, 0.5);
        tabBg.setPosition(0, 0, 0);
        const tabBgG = tabBg.addComponent(Graphics);
        tabBgG.fillColor = new Color(14, 18, 34, 255);
        tabBgG.rect(-TAB_W / 2, -tabAreaH / 2, TAB_W, tabAreaH);
        tabBgG.fill();
        tabArea.insertChild(tabBg, 0);

        const tabH = (tabAreaH - (TAB_DEFS.length + 1) * TAB_GAP) / TAB_DEFS.length;
        const totalH = TAB_DEFS.length * tabH + (TAB_DEFS.length - 1) * TAB_GAP;
        const startY = totalH / 2 - tabH / 2;

        this._tabNodes = [];
        for (let i = 0; i < TAB_DEFS.length; i++) {
            const def = TAB_DEFS[i];
            const ty = startY - i * (tabH + TAB_GAP);
            const tabNode = this.createTabNode(def.label, TAB_W - 8, tabH, i);
            tabNode.setPosition(0, ty, 0);
            tabArea.addChild(tabNode);
            this._tabNodes.push(tabNode);
        }
    }

    private createTabNode(label: string, w: number, h: number, index: number): Node {
        const node = new Node(`Tab_${index}`);
        const ut = node.addComponent(UITransform);
        ut.setContentSize(w, h);
        ut.setAnchorPoint(0.5, 0.5);

        const bg = new Node('TabBg');
        const bgUT = bg.addComponent(UITransform);
        bgUT.setContentSize(w, h);
        bgUT.setAnchorPoint(0.5, 0.5);
        bg.setPosition(0, 0, 0);
        bg.addComponent(Graphics);
        node.insertChild(bg, 0);

        this.addLabel(node, label, 13, WHITE, 0, 0, w - 6, true);

        node.on(Node.EventType.TOUCH_END, () => {
            this._tabIndex = index;
            this.refreshTabStyles();
            this.refreshItems();
        });
        return node;
    }

    private buildBottomBar(parent: Node): void {
        const btnW = 200, btnH = 36;
        const btnY = -this._SH / 2 + 40;

        const btn = new Node('DismantleBtn');
        const btnUT = btn.addComponent(UITransform);
        btnUT.setContentSize(btnW, btnH);
        btnUT.setAnchorPoint(0.5, 0.5);
        btn.setPosition(0, btnY, 0);
        const btnG = btn.addComponent(Graphics);
        btnG.fillColor = new Color(180, 60, 60, 220);
        btnG.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
        btnG.fill();
        btnG.strokeColor = new Color(220, 100, 100, 120);
        btnG.lineWidth = 1;
        btnG.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
        btnG.stroke();
        this.addLabel(btn, '一键分解重复', 14, WHITE, 0, 0, btnW, true);

        btn.on(Node.EventType.TOUCH_END, () => {
            const uids = RelicSystem.instance.getDismantlableRelics();
            if (uids.length === 0) {
                console.log('[RelicUI] 没有可分解的重复圣物');
                return;
            }
            const essence = RelicSystem.instance.dismantleRelics(uids);
            console.log(`[RelicUI] 分解 ${uids.length} 件, 获得 ${essence} 精华`);
            this.refreshItems();
            this.updateEssenceDisplay();
        });

        parent.addChild(btn);
    }

    // ---- 刷新 ----

    private refreshTabStyles(): void {
        for (let i = 0; i < this._tabNodes.length; i++) {
            const tabNode = this._tabNodes[i];
            const isActive = i === this._tabIndex;
            const ut = tabNode.getComponent(UITransform)!;
            const w = ut.contentSize.width;
            const h = ut.contentSize.height;
            const bg = tabNode.getChildByName('TabBg')!;
            const bgG = bg.getComponent(Graphics)!;
            bgG.clear();
            bgG.fillColor = isActive ? TAB_ACTIVE : TAB_INACTIVE;
            bgG.roundRect(-w / 2, -h / 2, w, h, 4);
            bgG.fill();
            if (isActive) {
                bgG.fillColor = GOLD;
                bgG.rect(-w / 2, -h / 2 + 6, 3, h - 12);
                bgG.fill();
            }
            const lblNode = tabNode.children.find(c => c.getComponent(Label))!;
            lblNode.getComponent(Label)!.color = isActive ? GOLD : GRAY_TEXT;
        }
    }

    private refreshItems(): void {
        if (!this._content) return;
        this._content.removeAllChildren();
        this.refreshTabStyles();

        if (!PlayerManager.instance.isLoaded) {
            this.addLabel(this._content, '加载中...', 16, GRAY_TEXT, 0, 0, 300, true);
            return;
        }

        const relics = RelicSystem.instance.getAllRelics();
        const tabKey = TAB_DEFS[this._tabIndex].key;

        const filtered = relics.filter(r => {
            const cfg = GameConfig.instance.getRelicConfig(r.configId);
            if (!cfg) return false;
            switch (tabKey) {
                case 'all': return true;
                case 'human': case 'beast': case 'spirit': case 'demon':
                    return cfg.race === tabKey;
                case 'universal':
                    return !cfg.race && !cfg.role;
                case 'unequipped':
                    return !r.equippedTo;
                default: return true;
            }
        });

        if (filtered.length === 0) {
            this.addLabel(this._content, '暂无圣物', 16, GRAY_TEXT, 0, 0, 300, true);
            return;
        }

        const totalRows = Math.ceil(filtered.length / COLS);
        const neededH = totalRows * (CARD_H + CARD_GAP) + CARD_GAP;
        const contentUT = this._content.getComponent(UITransform)!;
        const contentW = contentUT.contentSize.width;
        const viewH = this._SH - 120;
        contentUT.setContentSize(contentW, Math.max(neededH, viewH));

        const totalW = COLS * CARD_W + (COLS - 1) * CARD_GAP;
        const startX = -totalW / 2 + CARD_W / 2;
        const startY = -CARD_H / 2 - 10;

        filtered.forEach((relic, i) => {
            const row = Math.floor(i / COLS);
            const col = i % COLS;
            const cx = startX + col * (CARD_W + CARD_GAP);
            const cy = startY - row * (CARD_H + CARD_GAP);

            this.createRelicCard(this._content!, relic, cx, cy);
        });

        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        this._content.children.forEach(c => setLayer(c));
    }

    private createRelicCard(parent: Node, relic: RelicInstance, x: number, y: number): void {
        const cfg = GameConfig.instance.getRelicConfig(relic.configId);
        const qColor = QUALITY_COLORS[relic.quality] || QUALITY_COLORS['green'];
        const mainVal = RelicSystem.instance.calcMainStatValue(relic);
        const nameFS = this.mapFS(15);
        const tagFS = this.mapFS(12);
        const statFS = this.mapFS(12);
        const subFS = this.mapFS(11);

        const card = new Node(`Relic_${relic.uid}`);
        const cut = card.addComponent(UITransform);
        cut.setContentSize(CARD_W, CARD_H);
        cut.setAnchorPoint(0.5, 0.5);
        card.setPosition(x, y, 0);

        // 背景（品质色底）
        const bgNode = new Node('CardBg');
        const bgUT = bgNode.addComponent(UITransform);
        bgUT.setContentSize(CARD_W, CARD_H);
        bgUT.setAnchorPoint(0.5, 0.5);
        bgNode.setPosition(0, 0, 0);
        const bg = bgNode.addComponent(Graphics);
        bg.fillColor = relic.equippedTo
            ? new Color(qColor.r * 0.1, qColor.g * 0.1, qColor.b * 0.1, 240)
            : new Color(qColor.r * 0.06, qColor.g * 0.06, qColor.b * 0.06, 220);
        bg.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
        bg.fill();
        bg.strokeColor = qColor;
        bg.lineWidth = relic.equippedTo ? 2 : 1;
        bg.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
        bg.stroke();
        // 顶部品质色条
        bg.fillColor = new Color(qColor.r, qColor.g, qColor.b, 120);
        bg.roundRect(-CARD_W / 2, CARD_H / 2 - 3, CARD_W, 3, 1);
        bg.fill();
        card.insertChild(bgNode, 0);

        // 内容布局（全部居中）
        const nameStr = cfg ? cfg.name : relic.configId;
        let tagStr = '';
        if (cfg) {
            if (cfg.race) tagStr = RACE_NAMES[cfg.race] || cfg.race;
            else if (cfg.role) tagStr = ROLE_NAMES[cfg.role] || cfg.role;
            else tagStr = '通用';
        }

        // 行1：名称
        const row1Y = CARD_H / 2 - 24;
        this.addLabel(card, nameStr, 15, WHITE, 0, row1Y, CARD_W - 16, true);

        // 行2：品质 + 等级 + 限制
        const row2Y = row1Y - nameFS - 6;
        this.addLabel(card, `${QUALITY_NAMES[relic.quality] || relic.quality}  Lv.${relic.level}  ${tagStr}`, 12,
            qColor, 0, row2Y, CARD_W - 16, true);

        // 分隔线
        const divY = row2Y - tagFS / 2 - 8;
        const div1 = new Node('Div1');
        div1.addComponent(UITransform).setContentSize(CARD_W - 24, 1);
        div1.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        div1.setPosition(0, divY, 0);
        const div1G = div1.addComponent(Graphics);
        div1G.strokeColor = new Color(80, 100, 140, 60);
        div1G.lineWidth = 1;
        div1G.moveTo(-(CARD_W - 24) / 2, 0);
        div1G.lineTo((CARD_W - 24) / 2, 0);
        div1G.stroke();
        card.addChild(div1);

        // 行3：主属性
        const row3Y = divY - statFS / 2 - 10;
        this.addLabel(card, `${STAT_NAMES[relic.mainStat.stat]} +${mainVal.toFixed(1)}%`, 12,
            qColor, 0, row3Y, CARD_W - 16, true);

        // 行4-6：副属性
        let subRowY = row3Y - statFS - 6;
        for (const sub of relic.subStats) {
            this.addLabel(card, `${STAT_NAMES[sub.stat]} +${sub.value.toFixed(1)}%`, 11,
                GRAY_TEXT, 0, subRowY, CARD_W - 16, true);
            subRowY -= subFS + 6;
        }

        // 已装备标记
        if (relic.equippedTo) {
            const unit = PlayerManager.instance.getUnit(relic.equippedTo);
            const unitCfg = unit ? GameConfig.instance.getUnitConfig(unit.configId) : null;
            const unitName = unitCfg ? unitCfg.name : '???';
            const eqText = `${unitName}已装备`;
            const eqTagW = Math.max(this.mapFS(10) * eqText.length * 0.7 + 16, 80);
            const eqBg = new Node('EqTag');
            eqBg.addComponent(UITransform).setContentSize(eqTagW, 20);
            eqBg.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
            eqBg.setPosition(0, -CARD_H / 2 + 16, 0);
            const eqG = eqBg.addComponent(Graphics);
            eqG.fillColor = new Color(40, 80, 140, 200);
            eqG.roundRect(-eqTagW / 2, -10, eqTagW, 20, 10);
            eqG.fill();
            this.addLabel(eqBg, eqText, 10, new Color(100, 200, 255, 255), 0, 0, eqTagW, true);
            card.addChild(eqBg);
        }

        card.on(Node.EventType.TOUCH_END, () => this.showRelicDetail(relic));
        parent.addChild(card);
    }

    // ---- 详情弹窗 ----

    private showRelicDetail(relic: RelicInstance): void {
        this.closeDetail();
        const SW = this._SW, SH = this._SH;
        const cfg = GameConfig.instance.getRelicConfig(relic.configId);
        const qColor = QUALITY_COLORS[relic.quality] || QUALITY_COLORS['green'];
        const mainVal = RelicSystem.instance.calcMainStatValue(relic);
        const cost = RelicSystem.instance.getUpgradeCost(relic);
        const essenceCount = PlayerManager.instance.getItemCount('relic_essence');
        const nameStr = cfg ? cfg.name : relic.configId;

        // 遮罩
        const mask = new Node('DetailMask');
        mask.addComponent(UITransform).setContentSize(SW, SH);
        mask.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        const maskG = mask.addComponent(Graphics);
        maskG.fillColor = new Color(0, 0, 0, 160);
        maskG.rect(-SW / 2, -SH / 2, SW, SH);
        maskG.fill();
        mask.on(Node.EventType.TOUCH_END, () => this.closeDetail());
        mask.layer = Layers.Enum.UI_2D;

        // 面板（动态高度）
        const panelW = 380;
        const panelH = 440;
        const panel = new Node('DetailPanel');
        panel.addComponent(UITransform).setContentSize(panelW, panelH);
        panel.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        const panelG = panel.addComponent(Graphics);
        panelG.fillColor = new Color(22, 26, 42, 250);
        panelG.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 14);
        panelG.fill();
        panelG.strokeColor = new Color(qColor.r, qColor.g, qColor.b, 150);
        panelG.lineWidth = 2;
        panelG.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 14);
        panelG.stroke();
        // 顶部品质色条
        panelG.fillColor = new Color(qColor.r, qColor.g, qColor.b, 100);
        panelG.roundRect(-panelW / 2 + 20, panelH / 2 - 4, panelW - 40, 3, 1);
        panelG.fill();
        panel.layer = Layers.Enum.UI_2D;
        panel.on(Node.EventType.TOUCH_END, (e: any) => e.propagationStopped = true);

        let y = panelH / 2 - 20;
        const titleFS = this.mapFS(16);
        const bodyFS = this.mapFS(13);
        const smallFS = this.mapFS(11);
        const rowGap = (fs: number) => fs + 8;

        // 行1：名称（居中）
        this.addLabel(panel, nameStr, 16, qColor, 0, y, panelW - 24, true);
        y -= rowGap(titleFS);

        // 行2：品质 + 等级
        this.addLabel(panel, `${QUALITY_NAMES[relic.quality] || relic.quality}  Lv.${relic.level}`, 13,
            GOLD, 0, y, panelW - 24, true);
        y -= rowGap(bodyFS);

        // 行3：描述
        if (cfg) {
            this.addLabel(panel, cfg.description, 11, GRAY_TEXT, 0, y, panelW - 30, true);
            y -= rowGap(smallFS);
        }

        // 行4：限制标签
        if (cfg && (cfg.race || cfg.role)) {
            const limits: string[] = [];
            if (cfg.race) limits.push(`种族: ${RACE_NAMES[cfg.race] || cfg.race}`);
            if (cfg.role) limits.push(`角色: ${ROLE_NAMES[cfg.role] || cfg.role}`);
            this.addLabel(panel, limits.join(' | '), 11, new Color(255, 180, 80, 200), 0, y, panelW - 30, true);
            y -= rowGap(smallFS);
        }

        // 分隔线
        y -= 4;
        const div = new Node('Div');
        div.addComponent(UITransform).setContentSize(panelW - 50, 1);
        div.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        div.setPosition(0, y, 0);
        const divG = div.addComponent(Graphics);
        divG.strokeColor = new Color(80, 100, 140, 80);
        divG.lineWidth = 1;
        divG.moveTo(-(panelW - 50) / 2, 0);
        divG.lineTo((panelW - 50) / 2, 0);
        divG.stroke();
        panel.addChild(div);
        y -= 12;

        // 属性行
        const statFS = this.mapFS(13);
        this.addLabel(panel, `主属性  ${STAT_NAMES[relic.mainStat.stat]} +${mainVal.toFixed(1)}%`, 13,
            WHITE, 0, y, panelW - 30, true);
        y -= rowGap(statFS);

        for (let i = 0; i < relic.subStats.length; i++) {
            this.addLabel(panel, `副属性  ${STAT_NAMES[relic.subStats[i].stat]} +${relic.subStats[i].value.toFixed(1)}%`,
                11, GRAY_TEXT, 0, y, panelW - 30, true);
            y -= rowGap(smallFS);
        }

        // 下一级预览
        const maxLevel = GameConfig.instance.constants?.relic?.maxLevel ?? 20;
        if (relic.level < maxLevel) {
            const cfg2 = GameConfig.instance.constants?.relic;
            const growth = (cfg2?.mainStatGrowth as any)?.[relic.quality] ?? 0.3;
            const nextVal = mainVal + growth;
            this.addLabel(panel, `下一级  ${STAT_NAMES[relic.mainStat.stat]} +${nextVal.toFixed(1)}%`, 11,
                new Color(120, 140, 160, 200), 0, y, panelW - 30, true);
            y -= rowGap(smallFS);

            const subLevels: number[] = cfg2?.subStatLevels || [5, 10, 15];
            const nextSubLevel = subLevels.find(l => l > relic.level);
            if (nextSubLevel) {
                this.addLabel(panel, `Lv${nextSubLevel} 解锁新副属性`, 10,
                    new Color(255, 180, 80, 180), 0, y, panelW - 30, true);
                y -= rowGap(smallFS);
            }
        }

        // ---- 按钮区 ----
        const btnW = 150, btnH = 36, btnGap = 14;
        const btnY = -panelH / 2 + 44;

        // 升级按钮
        const canUpgrade = relic.level < maxLevel
            && PlayerManager.instance.data.gold >= cost.gold
            && essenceCount >= cost.essence;
        const upgradeBtn = this.makeButton('', btnW, btnH,
            canUpgrade ? new Color(40, 120, 60, 220) : new Color(50, 50, 60, 200),
            -btnW / 2 - btnGap / 2, btnY);
        if (canUpgrade) {
            upgradeBtn.on(Node.EventType.TOUCH_END, () => {
                RelicSystem.instance.upgradeRelic(relic.uid);
                // 刷新 relic 数据后重新打开面板（不关闭）
                const updated = RelicSystem.instance.getRelic(relic.uid);
                this.refreshItems();
                this.updateEssenceDisplay();
                if (updated) this.showRelicDetail(updated);
            });
        }
        this.addLabel(upgradeBtn, `升级 ${cost.gold}金 ${cost.essence}精华`, 11,
            canUpgrade ? WHITE : GRAY_TEXT, 0, 0, btnW, true);
        panel.addChild(upgradeBtn);

        // 装备/卸下按钮
        const equipBtn = this.makeButton('',
            btnW, btnH,
            relic.equippedTo ? new Color(160, 100, 40, 220) : new Color(40, 80, 140, 220),
            btnW / 2 + btnGap / 2, btnY);
        equipBtn.on(Node.EventType.TOUCH_END, () => {
            if (relic.equippedTo) {
                RelicSystem.instance.unequipRelic(relic.uid);
            } else {
                this.showEquipSelect(relic);
                return;
            }
            this.closeDetail();
            this.refreshItems();
        });
        this.addLabel(equipBtn, relic.equippedTo ? '卸  下' : '装  备', 14,
            WHITE, 0, 0, btnW, true);
        panel.addChild(equipBtn);

        // 分解按钮（仅未装备，居中）
        if (!relic.equippedTo) {
            const dismantleYield = GameConfig.instance.constants?.relic?.dismantleYield?.[relic.quality] ?? 5;
            const dBtn = this.makeButton('', 150, 30, new Color(100, 35, 35, 200), 0, btnY - 46);
            dBtn.on(Node.EventType.TOUCH_END, () => {
                RelicSystem.instance.dismantleRelics([relic.uid]);
                this.closeDetail();
                this.refreshItems();
                this.updateEssenceDisplay();
            });
            this.addLabel(dBtn, `分解 → ${dismantleYield} 精华`, 12,
                new Color(220, 160, 160, 255), 0, 0, 150, true);
            panel.addChild(dBtn);
        }

        // 组装
        panel.setParent(mask);
        mask.setParent(this._container);
        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(mask);
        this._detailPanel = mask;
    }

    /** 选择装备目标 */
    private showEquipSelect(relic: RelicInstance): void {
        this.closeDetail();
        const SW = this._SW, SH = this._SH;
        const pm = PlayerManager.instance;
        const units = pm.getAllUnits();

        // 遮罩
        const mask = new Node('EquipMask');
        const maskUT = mask.addComponent(UITransform);
        maskUT.setContentSize(SW, SH);
        maskUT.setAnchorPoint(0.5, 0.5);
        const maskG = mask.addComponent(Graphics);
        maskG.fillColor = new Color(0, 0, 0, 160);
        maskG.rect(-SW / 2, -SH / 2, SW, SH);
        maskG.fill();
        mask.on(Node.EventType.TOUCH_END, () => this.closeDetail());
        mask.layer = Layers.Enum.UI_2D;

        // 面板
        const panelW = 400, panelH = 500;
        const panel = new Node('EquipPanel');
        const panelUT = panel.addComponent(UITransform);
        panelUT.setContentSize(panelW, panelH);
        panelUT.setAnchorPoint(0.5, 0.5);
        const panelG = panel.addComponent(Graphics);
        panelG.fillColor = new Color(25, 30, 45, 250);
        panelG.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 12);
        panelG.fill();
        panelG.strokeColor = new Color(80, 120, 180, 120);
        panelG.lineWidth = 1;
        panelG.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 12);
        panelG.stroke();
        panel.layer = Layers.Enum.UI_2D;
        panel.on(Node.EventType.TOUCH_END, (e: any) => e.propagationStopped = true);

        this.addLabel(panel, '选择装备目标', 18, GOLD, 0, 220, panelW, true);

        // 单位列表
        const cardW = 170, cardH = 50, gap = 8;
        const cols = 2;
        const startX = -((cols * (cardW + gap) - gap) / 2) + cardW / 2;
        let cy = 180;

        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cx = startX + col * (cardW + gap);
            const uy = cy - row * (cardH + gap);

            const canEquip = RelicSystem.instance.canEquipTo(relic, unit.uid);
            const unitCfg = GameConfig.instance.getUnitConfig(unit.configId);
            const qColor = QUALITY_COLORS[unit.quality] || QUALITY_COLORS['green'];

            const unitCard = new Node(`Unit_${unit.uid}`);
            const uut = unitCard.addComponent(UITransform);
            uut.setContentSize(cardW, cardH);
            uut.setAnchorPoint(0.5, 0.5);
            unitCard.setPosition(cx, uy, 0);

            const uBg = unitCard.addComponent(Graphics);
            uBg.fillColor = canEquip ? new Color(35, 50, 70, 220) : new Color(40, 40, 45, 200);
            uBg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
            uBg.fill();
            uBg.strokeColor = canEquip ? new Color(qColor.r, qColor.g, qColor.b, 120) : new Color(60, 60, 60, 80);
            uBg.lineWidth = 1;
            uBg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 6);
            uBg.stroke();

            const nameStr = unitCfg ? unitCfg.name : unit.configId;
            this.addLabel(unitCard, nameStr, 13, canEquip ? WHITE : GRAY_TEXT, 0, 8, cardW - 8, true);
            this.addLabel(unitCard, `Lv${unit.level} ${QUALITY_NAMES[unit.quality] || unit.quality}`, 10, canEquip ? qColor : GRAY_TEXT, 0, -10, cardW - 8, true);

            if (canEquip) {
                unitCard.on(Node.EventType.TOUCH_END, () => {
                    RelicSystem.instance.equipRelic(relic.uid, unit.uid);
                    this.closeDetail();
                    this.refreshItems();
                });
            }

            panel.addChild(unitCard);
        }

        panel.setParent(mask);
        mask.setParent(this._container);
        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(mask);
        this._detailPanel = mask;
    }

    private closeDetail(): void {
        if (this._detailPanel) {
            this._detailPanel.destroy();
            this._detailPanel = null;
        }
    }

    private updateEssenceDisplay(): void {
        if (!this._container) return;
        const topBar = this._container.getChildByName('TopBar');
        if (!topBar) return;
        const labels = topBar.children.filter(c => c.getComponent(Label));
        for (const lblNode of labels) {
            const lbl = lblNode.getComponent(Label)!;
            if (lbl.string.includes('💰')) {
                lbl.string = `💰${PlayerManager.instance.data.gold}`;
            } else if (lbl.string.startsWith('精华')) {
                lbl.string = `精华: ${PlayerManager.instance.getItemCount('relic_essence')}`;
            }
        }
    }

    // ---- Helpers ----

    private makeButton(label: string, w: number, h: number, color: Color, x: number, y: number): Node {
        const btn = new Node('Btn');
        const btnUT = btn.addComponent(UITransform);
        btnUT.setContentSize(w, h);
        btnUT.setAnchorPoint(0.5, 0.5);
        btn.setPosition(x, y, 0);
        const btnG = btn.addComponent(Graphics);
        btnG.fillColor = color;
        btnG.roundRect(-w / 2, -h / 2, w, h, 6);
        btnG.fill();
        return btn;
    }

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
}
