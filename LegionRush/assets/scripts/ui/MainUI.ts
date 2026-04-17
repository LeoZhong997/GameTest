/**
 * MainUI - 主界面
 * 两行三列网格：兵种管理 / 进军 / 背包 + 3个预留位
 * 显示玩家信息（关卡进度、货币）
 * 点击卡片通过 director.loadScene() 跳转场景
 */

import { _decorator, Component, Node, Label, Graphics, UITransform, Color, Button, director, view, Layers } from 'cc';
import { EventBus } from '../core/EventBus';
import { PlayerManager } from '../systems/PlayerManager';
import { GameConfig } from '../core/GameConfig';
import { SaveSystem } from '../core/SaveSystem';
import { LevelSystem } from '../systems/LevelSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';

const { ccclass } = _decorator;

const CARD_W = 240, CARD_H = 200;
const CARD_GAP_X = 30, CARD_GAP_Y = 30;
const CARD_R = 12;

// Colors
const BG          = new Color(26, 26, 46, 255);
const TOPBAR_BG   = new Color(15, 52, 96, 230);
const CARD_BG     = new Color(15, 52, 96, 200);
const CARD_BORDER = new Color(74, 144, 217, 180);
const GOLD        = new Color(255, 215, 0, 255);
const WHITE       = Color.WHITE;
const GRAY_TEXT   = new Color(160, 160, 180, 255);
const DIM         = new Color(80, 80, 100, 255);

interface MenuCard {
    id: string;
    label: string;
    icon: string;
    active: boolean;
    scene?: string;  // 目标场景路径
}

const CARDS: MenuCard[][] = [
    [
        { id: 'units',    label: '兵种管理', icon: '⚔', active: true,  scene: 'unit_manage' },
        { id: 'battle',   label: '进  军',   icon: '🗡', active: true,  scene: 'battle' },
        { id: 'backpack', label: '背  包',   icon: '🎒', active: true,  scene: 'backpack' },
    ],
    [
        { id: 'gacha',    label: '召  唤',   icon: '✨', active: true,  scene: 'gacha' },
        { id: 'slot5', label: '敬请期待', icon: '?', active: false },
        { id: 'slot6', label: '敬请期待', icon: '?', active: false },
    ],
];

@ccclass('MainUI')
export class MainUI extends Component {

    private _container: Node | null = null;
    private _currencyLabels: Map<string, Label> = new Map();
    private _stageLabel: Label | null = null;
    private _SW: number = 1280;
    private _SH: number = 720;

    onLoad() {
        // 从 view 获取设计分辨率（Canvas 的设计分辨率）
        const design = view.getDesignResolutionSize();
        this._SW = design.width || 1280;
        this._SH = design.height || 720;
        console.log(`[MainUI] screen size: ${this._SW}x${this._SH}`);

        // 确保 UIRoot 节点在 UI_2D layer 上，Camera 才能渲染
        this.node.layer = Layers.Enum.UI_2D;

        this.buildUI();

        // 递归设置所有子节点为 UI_2D layer
        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(this.node);

        EventBus.instance.on('player:loaded', this.refreshInfo, this);
        EventBus.instance.on('configs:ready', this.refreshInfo, this);
    }

    start() {
        // 确保场景重载后能刷新数据（事件可能在 onLoad 之前就已触发）
        this.refreshInfo();
    }

    onDestroy() {
        EventBus.instance.off('player:loaded', this.refreshInfo, this);
        EventBus.instance.off('configs:ready', this.refreshInfo, this);
    }

    // ---- Build UI ----

    private buildUI(): void {
        const SW = this._SW, SH = this._SH;
        const container = new Node('MainContainer');
        const ct = container.addComponent(UITransform);
        ct.setContentSize(SW, SH);
        ct.setAnchorPoint(0.5, 0.5);
        container.setPosition(0, 0, 0);
        this._container = container;
        this.node.addChild(container);

        this.drawRect(container, SW, SH, BG, 0, 0);
        this.buildTopBar(container);
        this.buildGrid(container);
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

        this.addLabel(topBar, '军团冲刺', 24, GOLD, 0, 0, 200, true);

        const stageLbl = this.addLabel(topBar, '1-1', 16, WHITE, -SW / 2 + 60, 0, 100, true);
        this._stageLabel = stageLbl.getComponent(Label);

        const rightBase = SW / 2 - 20;
        const currencies = [
            { id: 'crystals',    icon: '💎' },
            { id: 'tokens',      icon: '🪙' },
            { id: 'bottleCaps',  icon: '🍺' },
        ];
        let cx = rightBase;
        for (let i = currencies.length - 1; i >= 0; i--) {
            const c = currencies[i];
            const lbl = this.addLabel(topBar, `${c.icon}0`, 14, GRAY_TEXT, cx - 50, 0, 100, true);
            this._currencyLabels.set(c.id, lbl.getComponent(Label));
            cx -= 120;
        }

        parent.addChild(topBar);

        // 设置按钮（TopBar 右上角）
        const settingsBtn = new Node('BtnSettings');
        const sbut = settingsBtn.addComponent(UITransform);
        sbut.setContentSize(36, 36);
        sbut.setAnchorPoint(0.5, 0.5);
        settingsBtn.setPosition(SW / 2 - 30, 0, 0);
        this.addLabel(settingsBtn, '⚙', 24, WHITE, 0, 0, 36, true);
        settingsBtn.on(Node.EventType.TOUCH_END, () => this.showSettings(), this);
        topBar.addChild(settingsBtn);
    }

    private buildGrid(parent: Node): void {
        const gridNode = new Node('MenuGrid');
        const gut = gridNode.addComponent(UITransform);
        gut.setContentSize(this._SW, this._SH);
        gut.setAnchorPoint(0.5, 0.5);
        gridNode.setPosition(0, -20, 0);

        const rows = CARDS.length;
        const cols = CARDS[0].length;
        const totalW = cols * CARD_W + (cols - 1) * CARD_GAP_X;
        const totalH = rows * CARD_H + (rows - 1) * CARD_GAP_Y;
        const startX = -totalW / 2 + CARD_W / 2;
        const startY = totalH / 2 - CARD_H / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const card = CARDS[r][c];
                const cx = startX + c * (CARD_W + CARD_GAP_X);
                const cy = startY - r * (CARD_H + CARD_GAP_Y);
                this.buildCard(gridNode, card, cx, cy);
            }
        }

        parent.addChild(gridNode);
    }

    private buildCard(parent: Node, card: MenuCard, x: number, y: number): void {
        const cardNode = new Node(`Card_${card.id}`);
        const cut = cardNode.addComponent(UITransform);
        cut.setContentSize(CARD_W, CARD_H);
        cut.setAnchorPoint(0.5, 0.5);
        cardNode.setPosition(x, y, 0);

        const bgNode = new Node('CardBg');
        const bgut = bgNode.addComponent(UITransform);
        bgut.setContentSize(CARD_W, CARD_H);
        bgut.setAnchorPoint(0.5, 0.5);
        bgNode.setPosition(0, 0, 0);
        const bg = bgNode.addComponent(Graphics);
        bg.fillColor = card.active ? CARD_BG : new Color(20, 20, 35, 200);
        bg.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_R);
        bg.fill();
        bg.strokeColor = card.active ? CARD_BORDER : new Color(50, 50, 70, 150);
        bg.lineWidth = 2;
        bg.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_R);
        bg.stroke();
        cardNode.insertChild(bgNode, 0);

        this.addLabel(cardNode, card.icon, 48, card.active ? GOLD : DIM, 0, 30, CARD_W, true);
        this.addLabel(cardNode, card.label, 20, card.active ? WHITE : DIM, 0, -30, CARD_W, true);

        if (card.active && card.scene) {
            cardNode.on(Node.EventType.TOUCH_END, () => {
                console.log(`[MainUI] 跳转场景: ${card.scene}`);
                director.loadScene(card.scene!);
            }, this);
        }

        parent.addChild(cardNode);
    }

    private refreshInfo(): void {
        if (!PlayerManager.instance.isLoaded) return;
        const data = PlayerManager.instance.data;

        if (this._stageLabel) {
            this._stageLabel.string = `${data.currentChapter}-${data.currentStage}`;
        }

        const currencies = [
            { id: 'crystals',   icon: '💎' },
            { id: 'tokens',     icon: '🪙' },
            { id: 'bottleCaps', icon: '🍺' },
        ];
        for (const c of currencies) {
            const lbl = this._currencyLabels.get(c.id);
            if (lbl) {
                lbl.string = `${c.icon}${(data as any)[c.id] || 0}`;
            }
        }
    }

    // ---- Settings panel ----

    private showSettings(): void {
        if (!PlayerManager.instance.isLoaded) return;
        const data = PlayerManager.instance.data;
        const SW = this._SW, SH = this._SH;

        // 半透明遮罩
        const overlay = new Node('SettingsOverlay');
        const out = overlay.addComponent(UITransform);
        out.setContentSize(SW, SH);
        out.setAnchorPoint(0.5, 0.5);
        overlay.setPosition(0, 0, 0);
        const og = overlay.addComponent(Graphics);
        og.fillColor = new Color(0, 0, 0, 160);
        og.rect(-SW / 2, -SH / 2, SW, SH);
        og.fill();

        // 面板
        const PW = 400, PH = 380, PR = 16;
        const panel = new Node('SettingsPanel');
        const put = panel.addComponent(UITransform);
        put.setContentSize(PW, PH);
        put.setAnchorPoint(0.5, 0.5);
        panel.setPosition(0, 0, 0);
        const pg = panel.addComponent(Graphics);
        pg.fillColor = new Color(20, 20, 40, 250);
        pg.roundRect(-PW / 2, -PH / 2, PW, PH, PR);
        pg.fill();
        pg.strokeColor = GOLD;
        pg.lineWidth = 2;
        pg.roundRect(-PW / 2, -PH / 2, PW, PH, PR);
        pg.stroke();

        // 标题
        this.addLabel(panel, '设  置', 24, GOLD, 0, PH / 2 - 35, PW, true);

        // 分隔线
        const divY = PH / 2 - 60;
        const div = new Node('Div');
        const dvut = div.addComponent(UITransform);
        dvut.setContentSize(PW - 40, 2);
        dvut.setAnchorPoint(0.5, 0.5);
        div.setPosition(0, divY, 0);
        const dg = div.addComponent(Graphics);
        dg.fillColor = new Color(255, 255, 255, 40);
        dg.rect(-(PW - 40) / 2, -1, PW - 40, 2);
        dg.fill();
        panel.addChild(div);

        // 信息内容
        const lines = [
            `ID: ${data.uid}`,
            `名字: ${data.name}`,
            `等级: Lv${data.level}`,
            `进度: ${data.highestChapter}-${data.highestStage}`,
            `氪晶: ${data.crystals}  筹码: ${data.tokens}  瓶盖: ${data.bottleCaps}`,
            `兵种: ${Object.keys(data.units).length} 种`,
        ];
        let infoY = divY - 25;
        for (const line of lines) {
            this.addLabel(panel, line, 15, WHITE, 0, infoY, PW - 40, false);
            infoY -= 28;
        }

        // 重置按钮
        const resetBtn = new Node('BtnReset');
        const rut = resetBtn.addComponent(UITransform);
        rut.setContentSize(160, 44);
        rut.setAnchorPoint(0.5, 0.5);
        resetBtn.setPosition(0, -PH / 2 + 50, 0);

        const rbg = new Node('ResetBg');
        const rbgut = rbg.addComponent(UITransform);
        rbgut.setContentSize(160, 44);
        rbgut.setAnchorPoint(0.5, 0.5);
        rbg.setPosition(0, 0, 0);
        const rbgGfx = rbg.addComponent(Graphics);
        rbgGfx.fillColor = new Color(200, 50, 50, 255);
        rbgGfx.roundRect(-80, -22, 160, 44, 22);
        rbgGfx.fill();
        resetBtn.insertChild(rbg, 0);

        const resetLbl = new Node('ResetTxt');
        const rlut = resetLbl.addComponent(UITransform);
        rlut.setContentSize(160, 44);
        rlut.setAnchorPoint(0.5, 0.5);
        resetLbl.setPosition(0, 0, 0);
        const rl = resetLbl.addComponent(Label);
        rl.string = '重置数据';
        rl.fontSize = 18;
        rl.isBold = true;
        rl.color = WHITE;
        rl.horizontalAlign = Label.HorizontalAlign.CENTER;
        resetBtn.addChild(resetLbl);

        resetBtn.on(Node.EventType.TOUCH_END, () => {
            console.log('[MainUI] 重置数据');
            SaveSystem.instance.clear();
            // 强制重置单例，使下次场景加载时重新初始化
            (GameConfig as any)._instance = null;
            (PlayerManager as any)._instance = null;
            (LevelSystem as any)._instance = null;
            (UpgradeSystem as any)._instance = null;
            director.loadScene('main');
        }, this);
        panel.addChild(resetBtn);

        // 关闭按钮
        const closeBtn = new Node('BtnClose');
        const clut = closeBtn.addComponent(UITransform);
        clut.setContentSize(36, 36);
        clut.setAnchorPoint(0.5, 0.5);
        closeBtn.setPosition(PW / 2 - 24, PH / 2 - 24, 0);
        this.addLabel(closeBtn, '✕', 20, GRAY_TEXT, 0, 0, 36, true);
        closeBtn.on(Node.EventType.TOUCH_END, () => {
            overlay.destroy();
        }, this);
        panel.addChild(closeBtn);

        overlay.addChild(panel);
        this._container!.addChild(overlay);

        // 修正 layer
        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(overlay);
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
