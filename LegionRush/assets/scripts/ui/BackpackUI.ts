/**
 * BackpackUI - 背包界面
 * 显示玩家拥有的所有物品
 * 纯代码创建，挂载在 UIRoot 节点
 */

import { _decorator, Component, Node, Label, Graphics, UITransform, Color, director, view, Layers } from 'cc';
import { EventBus } from '../core/EventBus';
import { PlayerManager } from '../systems/PlayerManager';
import { GameConfig } from '../core/GameConfig';

const { ccclass } = _decorator;

const ITEM_W = 160, ITEM_H = 80;
const ITEM_GAP = 16;

// Colors
const BG          = new Color(26, 26, 46, 255);
const TOPBAR_BG   = new Color(15, 52, 96, 230);
const ITEM_BG     = new Color(15, 52, 96, 200);
const ITEM_BORDER = new Color(74, 144, 217, 180);
const GOLD        = new Color(255, 215, 0, 255);
const WHITE       = Color.WHITE;
const GRAY_TEXT   = new Color(160, 160, 180, 255);
const BACK_TEXT   = new Color(26, 26, 46, 255);

const RARITY_COLORS: Record<string, Color> = {
    common: new Color(160, 160, 160, 255),
    rare: new Color(80, 160, 255, 255),
    epic: new Color(180, 80, 255, 255),
    legendary: new Color(255, 215, 0, 255),
};

@ccclass('BackpackUI')
export class BackpackUI extends Component {

    private _container: Node | null = null;
    private _content: Node | null = null;
    private _SW: number = 1280;
    private _SH: number = 720;

    // Item definitions (hardcoded from items.json for display)
    private _itemDefs: Record<string, { name: string; description: string; rarity: string }> = {
        exp_book_s: { name: '初级经验书', description: '使用后获得 50 经验', rarity: 'common' },
        exp_book_m: { name: '中级经验书', description: '使用后获得 200 经验', rarity: 'rare' },
        exp_book_l: { name: '高级经验书', description: '使用后获得 800 经验', rarity: 'epic' },
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

        this.refreshItems();

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

        this._content = new Node('Content');
        const cut = this._content.addComponent(UITransform);
        cut.setContentSize(SW - 40, SH - 100);
        cut.setAnchorPoint(0.5, 0.5);
        this._content.setPosition(0, -30, 0);
        container.addChild(this._content);
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
        this.addLabel(topBar, '背  包', 22, GOLD, 0, 0, 200, true);

        parent.addChild(topBar);
    }

    private refreshItems(): void {
        if (!this._content) return;
        this._content.removeAllChildren();

        if (!PlayerManager.instance.isLoaded) {
            this.addLabel(this._content, '加载中...', 16, GRAY_TEXT, 0, 0, 300, true);
            return;
        }

        const inventory = PlayerManager.instance.data.inventory || {};
        const items = Object.entries(inventory).filter(([_, count]) => count > 0);

        if (items.length === 0) {
            this.addLabel(this._content, '背包空空如也', 16, GRAY_TEXT, 0, 0, 300, true);
            return;
        }

        const cols = 4;
        const totalW = cols * ITEM_W + (cols - 1) * ITEM_GAP;
        const contentH = this._content.getComponent(UITransform)!.contentSize.height;
        const startX = -totalW / 2 + ITEM_W / 2;
        const startY = contentH / 2 - ITEM_H / 2 - 10;

        items.forEach(([itemId, count], i) => {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const cx = startX + col * (ITEM_W + ITEM_GAP);
            const cy = startY - row * (ITEM_H + ITEM_GAP);

            const resolved = this.resolveItemName(itemId);
            const name = resolved.name;
            const rarity = resolved.rarity;
            const rColor = RARITY_COLORS[rarity] || GRAY_TEXT;

            const itemNode = new Node(`Item_${itemId}`);
            const iut = itemNode.addComponent(UITransform);
            iut.setContentSize(ITEM_W, ITEM_H);
            iut.setAnchorPoint(0.5, 0.5);
            itemNode.setPosition(cx, cy, 0);

            // Background
            const bgNode = new Node('ItemBg');
            const bgut = bgNode.addComponent(UITransform);
            bgut.setContentSize(ITEM_W, ITEM_H);
            bgut.setAnchorPoint(0.5, 0.5);
            bgNode.setPosition(0, 0, 0);
            const bg = bgNode.addComponent(Graphics);
            bg.fillColor = ITEM_BG;
            bg.roundRect(-ITEM_W / 2, -ITEM_H / 2, ITEM_W, ITEM_H, 8);
            bg.fill();
            bg.strokeColor = rColor;
            bg.lineWidth = 1;
            bg.roundRect(-ITEM_W / 2, -ITEM_H / 2, ITEM_W, ITEM_H, 8);
            bg.stroke();
            itemNode.insertChild(bgNode, 0);

            // Name
            this.addLabel(itemNode, name, 13, WHITE, 0, 10, ITEM_W - 8, true);

            // Count
            this.addLabel(itemNode, `×${count}`, 14, GOLD, 0, -12, ITEM_W, true);

            this._content.addChild(itemNode);
        });
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
