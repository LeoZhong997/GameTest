/**
 * BackpackUI - 背包界面
 * 显示玩家拥有的所有物品
 * 左侧标签分类：碎片 / 其他
 * 纯代码创建，挂载在 UIRoot 节点
 */

import { _decorator, Component, Node, Label, Graphics, UITransform, Color, director, view, Layers, ScrollView, Mask } from 'cc';
import { EventBus } from '../core/EventBus';
import { PlayerManager } from '../systems/PlayerManager';
import { GameConfig } from '../core/GameConfig';
import { SCENE_LABELS } from '../core/DisplayNames';

const { ccclass } = _decorator;

const ITEM_W = 170, ITEM_H = 90;
const ITEM_GAP = 14;
const TAB_W = 90;
const TAB_GAP = 10;

// Colors
const BG          = new Color(26, 26, 46, 255);
const TOPBAR_BG   = new Color(15, 52, 96, 230);
const ITEM_BG     = new Color(15, 52, 96, 200);
const ITEM_BORDER = new Color(74, 144, 217, 180);
const GOLD        = new Color(255, 215, 0, 255);
const WHITE       = Color.WHITE;
const GRAY_TEXT   = new Color(160, 160, 180, 255);
const BACK_TEXT   = new Color(26, 26, 46, 255);
const TAB_ACTIVE  = new Color(20, 50, 90, 255);
const TAB_INACTIVE = new Color(18, 22, 40, 255);
const TAB_INDICATOR = new Color(255, 215, 0, 255);

const RARITY_COLORS: Record<string, Color> = {
    common: new Color(160, 160, 160, 255),
    rare: new Color(80, 160, 255, 255),
    epic: new Color(180, 80, 255, 255),
    legendary: new Color(255, 215, 0, 255),
};

const TAB_DEFS = [
    { key: 'shard', label: '碎片' },
    { key: 'other', label: '其他' },
];
const EMPTY_TEXTS: Record<string, string> = {
    shard: '暂无碎片',
    other: '暂无其他物品',
};

@ccclass('BackpackUI')
export class BackpackUI extends Component {

    private _container: Node | null = null;
    private _content: Node | null = null;
    private _tabNodes: Node[] = [];
    private _tabIndex: number = 0;
    private _SW: number = 1280;
    private _SH: number = 720;

    // Item definitions (hardcoded from items.json for display)
    private _itemDefs: Record<string, { name: string; description: string; rarity: string }> = {
        exp_book_s: { name: '初级经验书', description: '使用后获得 50 经验', rarity: 'common' },
        exp_book_m: { name: '中级经验书', description: '使用后获得 200 经验', rarity: 'rare' },
        exp_book_l: { name: '高级经验书', description: '使用后获得 800 经验', rarity: 'epic' },
        ascension_scroll: { name: '升阶卷轴', description: '用于兵种升阶', rarity: 'rare' },
        relic_essence: { name: '圣物精华', description: '用于升级圣物', rarity: 'rare' },
    };

    /** 碎片物品 ID → 中文名 */
    private resolveItemName(itemId: string): { name: string; rarity: string } {
        const def = this._itemDefs[itemId];
        if (def) return { name: def.name, rarity: def.rarity };

        // 碎片格式: {configId}_shard_{quality}
        if (itemId.includes('_shard_')) {
            const idx = itemId.lastIndexOf('_shard_');
            const configId = itemId.substring(0, idx);
            const quality = itemId.substring(idx + 7); // after "_shard_"
            const cfg = GameConfig.instance.getUnitConfig(configId);
            const unitName = cfg ? cfg.name : configId;
            const qNames: Record<string, string> = { green: '绿', blue: '蓝', purple: '紫' };
            const qRarity: Record<string, string> = { green: 'common', blue: 'rare', purple: 'epic' };
            return {
                name: `${unitName}${qNames[quality] || quality}碎片`,
                rarity: qRarity[quality] || 'common',
            };
        }

        return { name: itemId, rarity: 'common' };
    }

    onLoad() {
        const design = view.getDesignResolutionSize();
        this._SW = design.width || 1280;
        this._SH = design.height || 720;
        this.node.layer = Layers.Enum.UI_2D;
        console.log(`[BackpackUI] screen size: ${this._SW}x${this._SH}`);

        this.buildUI();

        // setLayer 放在所有内容创建之后
        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(this.node);
    }

    onDestroy() {
    }

    private buildUI(): void {
        const SW = this._SW, SH = this._SH;
        const container = new Node('BackpackContainer');
        const ct = container.addComponent(UITransform);
        ct.setContentSize(SW, SH);
        ct.setAnchorPoint(0.5, 0.5);
        container.setPosition(0, 0, 0);
        this._container = container;
        this.node.addChild(container);

        this.drawRect(container, SW, SH, BG, 0, 0);
        this.buildTopBar(container);
        this.buildTabs(container);

        // 内容区域：ScrollView 实现滚动
        const contentW = SW - TAB_W - 40;
        const contentH = SH - 100;
        const viewX = TAB_W / 2 + 10;
        const viewY = -30;

        // ScrollView 容器
        const scrollNode = new Node('ScrollView');
        const scrollUT = scrollNode.addComponent(UITransform);
        scrollUT.setContentSize(contentW, contentH);
        scrollUT.setAnchorPoint(0.5, 0.5);
        scrollNode.setPosition(viewX, viewY, 0);

        // view（裁剪区域）
        const viewNode = new Node('view');
        const viewUT = viewNode.addComponent(UITransform);
        viewUT.setContentSize(contentW, contentH);
        viewUT.setAnchorPoint(0.5, 0.5);
        viewNode.setPosition(0, 0, 0);
        viewNode.addComponent(Mask);
        scrollNode.addChild(viewNode);

        // content（可滚动内容）
        this._content = new Node('Content');
        const cut = this._content.addComponent(UITransform);
        cut.setContentSize(contentW, contentH);
        cut.setAnchorPoint(0.5, 1.0); // 锚点在顶部
        this._content.setPosition(0, contentH / 2, 0);
        viewNode.addChild(this._content);

        // ScrollView 组件
        const sv = scrollNode.addComponent(ScrollView);
        sv.content = this._content;
        sv.horizontal = false;
        sv.vertical = true;
        sv.elastic = true;
        sv.brake = 0.5;

        container.addChild(scrollNode);

        this.refreshItems();
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

        this.addLabel(backBtn, '返回', 16, BACK_TEXT, 0, 0, 80, true);
        backBtn.on(Node.EventType.TOUCH_END, () => {
            director.loadScene('main');
        }, this);
        topBar.addChild(backBtn);

        // Title
        this.addLabel(topBar, SCENE_LABELS.backpack, 22, GOLD, 0, 0, 200, true);

        parent.addChild(topBar);
    }

    // ---- 左侧标签 ----

    private buildTabs(parent: Node): void {
        const SH = this._SH;
        const tabAreaH = SH - 100; // 和内容区等高
        const tabAreaY = -30;

        const tabArea = new Node('TabArea');
        const tabUT = tabArea.addComponent(UITransform);
        tabUT.setContentSize(TAB_W, tabAreaH);
        tabUT.setAnchorPoint(0.5, 0.5);
        tabArea.setPosition(-this._SW / 2 + TAB_W / 2 + 10, tabAreaY, 0);
        parent.addChild(tabArea);

        // 标签背景
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

        // 两个标签按钮，居中排列
        const tabH = (tabAreaH - (TAB_DEFS.length + 1) * TAB_GAP) / TAB_DEFS.length;
        const totalH = TAB_DEFS.length * tabH + (TAB_DEFS.length - 1) * TAB_GAP;
        const startY = totalH / 2 - tabH / 2;

        this._tabNodes = [];
        for (let i = 0; i < TAB_DEFS.length; i++) {
            const def = TAB_DEFS[i];
            const ty = startY - i * (tabH + TAB_GAP);
            const tabNode = this.createTabNode(def.label, TAB_W, tabH, i);
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

        // 背景（会在 refreshTabStyles 中重绘）
        const bg = new Node('TabBg');
        const bgUT = bg.addComponent(UITransform);
        bgUT.setContentSize(w, h);
        bgUT.setAnchorPoint(0.5, 0.5);
        bg.setPosition(0, 0, 0);
        bg.addComponent(Graphics);
        node.insertChild(bg, 0);

        // 文字
        this.addLabel(node, label, 16, WHITE, 0, 0, w - 10, true);

        node.on(Node.EventType.TOUCH_END, () => {
            this._tabIndex = index;
            this.refreshTabStyles();
            this.refreshItems();
        });

        return node;
    }

    private refreshTabStyles(): void {
        for (let i = 0; i < this._tabNodes.length; i++) {
            const tabNode = this._tabNodes[i];
            const isActive = i === this._tabIndex;
            const ut = tabNode.getComponent(UITransform)!;
            const w = ut.contentSize.width;
            const h = ut.contentSize.height;

            // 重绘背景
            const bg = tabNode.getChildByName('TabBg')!;
            const bgG = bg.getComponent(Graphics)!;
            bgG.clear();
            bgG.fillColor = isActive ? TAB_ACTIVE : TAB_INACTIVE;
            bgG.roundRect(-w / 2, -h / 2, w, h, 4);
            bgG.fill();

            // 选中时左侧金色竖条
            if (isActive) {
                bgG.fillColor = TAB_INDICATOR;
                bgG.rect(-w / 2, -h / 2 + 6, 3, h - 12);
                bgG.fill();
            }

            // 文字颜色
            const lblNode = tabNode.children.find(c => c.getComponent(Label))!;
            const lbl = lblNode.getComponent(Label)!;
            lbl.color = isActive ? GOLD : GRAY_TEXT;
        }
    }

    // ---- 物品列表 ----

    private refreshItems(): void {
        if (!this._content) return;
        this._content.removeAllChildren();

        // 首次渲染时初始化标签样式
        this.refreshTabStyles();

        if (!PlayerManager.instance.isLoaded) {
            this.addLabel(this._content, '加载中...', 16, GRAY_TEXT, 0, 0, 300, true);
            return;
        }

        const tabKey = TAB_DEFS[this._tabIndex].key;

        const inventory = PlayerManager.instance.data.inventory || {};
        const allItems = Object.entries(inventory).filter(([_, count]) => count > 0);

        // 按标签过滤
        const filtered = allItems.filter(([itemId]) => {
            const isShard = itemId.includes('_shard_');
            return tabKey === 'shard' ? isShard : !isShard;
        });

        if (filtered.length === 0) {
            // 空状态：居中灰色图标 + 文字
            const iconNode = new Node('EmptyIcon');
            iconNode.addComponent(UITransform).setContentSize(60, 60);
            iconNode.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
            iconNode.setPosition(0, 10, 0);
            const iconG = iconNode.addComponent(Graphics);
            iconG.strokeColor = new Color(80, 80, 100, 100);
            iconG.lineWidth = 2;
            iconG.circle(0, 0, 24);
            iconG.stroke();
            iconG.moveTo(-8, 0);
            iconG.lineTo(8, 0);
            iconG.stroke();
            iconG.moveTo(0, -8);
            iconG.lineTo(0, 8);
            iconG.stroke();
            this._content.addChild(iconNode);
            const emptyNode = this.addLabel(this._content, EMPTY_TEXTS[tabKey], 14, GRAY_TEXT, 0, -30, 300, true);
            emptyNode.layer = Layers.Enum.UI_2D;
            return;
        }

        const cols = 4;
        const totalRows = Math.ceil(filtered.length / cols);
        const neededH = totalRows * (ITEM_H + ITEM_GAP) + ITEM_GAP;
        const contentUT = this._content.getComponent(UITransform)!;
        const contentW = contentUT.contentSize.width;
        const viewH = this._SH - 100; // ScrollView 可见区域高度
        contentUT.setContentSize(contentW, Math.max(neededH, viewH));

        const totalW = cols * ITEM_W + (cols - 1) * ITEM_GAP;
        const startX = -totalW / 2 + ITEM_W / 2;
        // 锚点在顶部，物品从顶部向下排列
        const startY = -ITEM_H / 2 - 10;

        filtered.forEach(([itemId, count], i) => {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const cx = startX + col * (ITEM_W + ITEM_GAP);
            const cy = startY - row * (ITEM_H + ITEM_GAP);

            const resolved = this.resolveItemName(itemId);
            const name = resolved.name;
            const rarity = resolved.rarity;
            const rColor = RARITY_COLORS[rarity] || GRAY_TEXT;
            const nameFS = this.mapFS(13);
            const countFS = this.mapFS(14);

            const itemNode = new Node(`Item_${itemId}`);
            const iut = itemNode.addComponent(UITransform);
            iut.setContentSize(ITEM_W, ITEM_H);
            iut.setAnchorPoint(0.5, 0.5);
            itemNode.setPosition(cx, cy, 0);

            // Background（品质色淡底 + 边框）
            const bgNode = new Node('ItemBg');
            const bgut = bgNode.addComponent(UITransform);
            bgut.setContentSize(ITEM_W, ITEM_H);
            bgut.setAnchorPoint(0.5, 0.5);
            bgNode.setPosition(0, 0, 0);
            const bg = bgNode.addComponent(Graphics);
            bg.fillColor = new Color(rColor.r * 0.06, rColor.g * 0.06, rColor.b * 0.06, 220);
            bg.roundRect(-ITEM_W / 2, -ITEM_H / 2, ITEM_W, ITEM_H, 8);
            bg.fill();
            bg.strokeColor = new Color(rColor.r, rColor.g, rColor.b, 140);
            bg.lineWidth = 1;
            bg.roundRect(-ITEM_W / 2, -ITEM_H / 2, ITEM_W, ITEM_H, 8);
            bg.stroke();
            // 左侧品质色条
            bg.fillColor = new Color(rColor.r, rColor.g, rColor.b, 160);
            bg.roundRect(-ITEM_W / 2, -ITEM_H / 2, 4, ITEM_H, 2);
            bg.fill();
            itemNode.insertChild(bgNode, 0);

            // Name（居中）
            const nameY = countFS / 2 + 4;
            this.addLabel(itemNode, name, 13, WHITE, 0, nameY, ITEM_W - 12, true);

            // Count（居中，金色）
            const countY = nameY - nameFS - 4;
            this.addLabel(itemNode, `×${count}`, 14, GOLD, 0, countY, ITEM_W, true);

            this._content.addChild(itemNode);
        });

        // 确保新创建的节点都有 UI_2D layer
        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        this._content.children.forEach(c => setLayer(c));
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
}
