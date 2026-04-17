/**
 * StageSelectUI - 关卡选择界面
 * 显示章节关卡网格，支持已通关/当前/未解锁状态
 * 挂载在 battle 场景的 UIRoot 节点
 */

import { _decorator, Component, Node, Label, Graphics, UITransform, Color, director, Layers, view } from 'cc';
import { EventBus } from '../core/EventBus';
import { PlayerManager } from '../systems/PlayerManager';
import { StageManager } from '../systems/StageManager';
import { StageConfig } from '../models/StageData';

const { ccclass } = _decorator;

const CARD_W = 160, CARD_H = 120;
const CARD_GAP = 20;
const COLS = 5;

// Colors
const BG          = new Color(26, 26, 46, 255);
const TOPBAR_BG   = new Color(15, 52, 96, 230);
const CARD_BG     = new Color(15, 52, 96, 200);
const CARD_LOCK   = new Color(30, 30, 45, 200);
const GOLD        = new Color(255, 215, 0, 255);
const GREEN       = new Color(80, 200, 120, 255);
const WHITE       = Color.WHITE;
const GRAY_TEXT   = new Color(120, 120, 140, 255);
const BACK_TEXT   = new Color(26, 26, 46, 255);
const CARD_BORDER = new Color(74, 144, 217, 180);
const LOCK_BORDER = new Color(60, 60, 80, 150);
const GOLD_BORDER = new Color(255, 215, 0, 220);
const GREEN_BORDER = new Color(80, 200, 120, 220);

type StageStatus = 'cleared' | 'current' | 'locked';

@ccclass('StageSelectUI')
export class StageSelectUI extends Component {

    private _container: Node | null = null;
    private _SW: number = 1280;
    private _SH: number = 720;
    private _selectedChapter: number = 1;

    onLoad() {
        const design = view.getDesignResolutionSize();
        this._SW = design.width || 1280;
        this._SH = design.height || 720;

        this.node.layer = Layers.Enum.UI_2D;
        console.log(`[StageSelectUI] screen size: ${this._SW}x${this._SH}`);

        // 默认显示玩家当前章节
        if (PlayerManager.instance.isLoaded) {
            this._selectedChapter = PlayerManager.instance.data.highestChapter;
        }

        this.buildUI();
        this.refreshStages();

        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(this.node);
    }

    /** 外部调用：刷新关卡列表（进度变化后） */
    public refresh(): void {
        this.refreshStages();
        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        if (this._container) setLayer(this._container);
    }

    private buildUI(): void {
        const SW = this._SW, SH = this._SH;
        const container = new Node('StageSelectContainer');
        const ct = container.addComponent(UITransform);
        ct.setContentSize(SW, SH);
        ct.setAnchorPoint(0.5, 0.5);
        container.setPosition(0, 0, 0);
        this._container = container;
        this.node.addChild(container);

        this.drawRect(container, SW, SH, BG, 0, 0);
        this.buildTopBar(container);
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
        this.addLabel(topBar, '选择关卡', 22, GOLD, 0, 0, 200, true);

        parent.addChild(topBar);
    }

    private refreshStages(): void {
        if (!this._container) return;

        // 移除旧的关卡区域
        const old = this._container.getChildByName('StageArea');
        if (old) old.destroy();

        if (!PlayerManager.instance.isLoaded) {
            return;
        }

        const SW = this._SW, SH = this._SH;
        const pm = PlayerManager.instance;
        const highest = pm.data.highestChapter * 100 + pm.data.highestStage;

        const area = new Node('StageArea');
        const aut = area.addComponent(UITransform);
        aut.setContentSize(SW, SH - 80);
        aut.setAnchorPoint(0.5, 0.5);
        area.setPosition(0, -20, 0);

        // Chapter title
        this.addLabel(area, `第 ${this._selectedChapter} 章`, 20, WHITE, 0, SH / 2 - 120, 200, true);

        // Get stages for this chapter
        const stages = StageManager.instance.getChapterStages(this._selectedChapter);

        if (stages.length === 0) {
            this.addLabel(area, '暂无关卡', 16, GRAY_TEXT, 0, 0, 200, true);
            this._container.addChild(area);
            return;
        }

        // Layout grid
        const rows = Math.ceil(stages.length / COLS);
        const totalW = Math.min(stages.length, COLS) * CARD_W + (Math.min(stages.length, COLS) - 1) * CARD_GAP;
        const totalH = rows * CARD_H + (rows - 1) * CARD_GAP;
        const startX = -totalW / 2 + CARD_W / 2;
        const startY = totalH / 2 - CARD_H / 2;

        stages.forEach((stage, i) => {
            const row = Math.floor(i / COLS);
            const col = i % COLS;
            const cx = startX + col * (CARD_W + CARD_GAP);
            const cy = startY - row * (CARD_H + CARD_GAP);

            const stageValue = stage.chapter * 100 + stage.stage;
            let status: StageStatus;
            if (stageValue <= highest) {
                status = 'cleared';
            } else if (stageValue === highest + 1) {
                status = 'current';
            } else {
                status = 'locked';
            }

            this.buildStageCard(area, stage, status, cx, cy);
        });

        // Chapter navigation
        this.buildChapterNav(area, rows);

        this._container.addChild(area);
    }

    private buildStageCard(parent: Node, stage: StageConfig, status: StageStatus, x: number, y: number): void {
        const cardNode = new Node(`Stage_${stage.id}`);
        const cut = cardNode.addComponent(UITransform);
        cut.setContentSize(CARD_W, CARD_H);
        cut.setAnchorPoint(0.5, 0.5);
        cardNode.setPosition(x, y, 0);

        // Background
        const bgNode = new Node('CardBg');
        const bgut = bgNode.addComponent(UITransform);
        bgut.setContentSize(CARD_W, CARD_H);
        bgut.setAnchorPoint(0.5, 0.5);
        bgNode.setPosition(0, 0, 0);
        const bg = bgNode.addComponent(Graphics);

        const fillColor = status === 'locked' ? CARD_LOCK : CARD_BG;
        const borderColor = status === 'current' ? GOLD_BORDER :
                           status === 'cleared' ? GREEN_BORDER : LOCK_BORDER;

        bg.fillColor = fillColor;
        bg.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
        bg.fill();
        bg.strokeColor = borderColor;
        bg.lineWidth = status === 'current' ? 3 : 2;
        bg.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10);
        bg.stroke();
        cardNode.insertChild(bgNode, 0);

        // Stage number
        const numColor = status === 'locked' ? GRAY_TEXT : WHITE;
        this.addLabel(cardNode, `${stage.stage}`, 28, numColor, 0, 20, CARD_W, true);

        // Stage name
        const nameColor = status === 'locked' ? GRAY_TEXT : WHITE;
        this.addLabel(cardNode, stage.name, 12, nameColor, 0, -10, CARD_W - 8, true);

        // Status indicator
        if (status === 'cleared') {
            this.addLabel(cardNode, '✓ 已通关', 12, GREEN, 0, -35, CARD_W, true);
        } else if (status === 'current') {
            this.addLabel(cardNode, '▶ 挑战', 12, GOLD, 0, -35, CARD_W, true);
        } else {
            this.addLabel(cardNode, '🔒', 12, GRAY_TEXT, 0, -35, CARD_W, true);
        }

        // Click handler
        if (status !== 'locked') {
            cardNode.on(Node.EventType.TOUCH_END, () => {
                console.log(`[StageSelectUI] 选择关卡: ${stage.id} ${stage.name}`);
                EventBus.instance.emit('stage:selected', stage);
            }, this);
        }

        parent.addChild(cardNode);
    }

    private buildChapterNav(parent: Node, contentRows: number): void {
        const navY = -contentRows * (CARD_H + CARD_GAP) / 2 - 40;

        const chapters = [1, 2, 3]; // 预留 3 章
        const totalNavW = chapters.length * 80;
        const startX = -totalNavW / 2 + 40;

        chapters.forEach((ch, i) => {
            const btn = new Node(`Chapter_${ch}`);
            const but = btn.addComponent(UITransform);
            but.setContentSize(60, 32);
            but.setAnchorPoint(0.5, 0.5);
            btn.setPosition(startX + i * 80, navY, 0);

            const isActive = ch === this._selectedChapter;
            const bgNode = new Node('BtnBg');
            const bgut = bgNode.addComponent(UITransform);
            bgut.setContentSize(60, 32);
            bgut.setAnchorPoint(0.5, 0.5);
            bgNode.setPosition(0, 0, 0);
            const g = bgNode.addComponent(Graphics);
            g.fillColor = isActive ? GOLD : CARD_BG;
            g.roundRect(-30, -16, 60, 32, 8);
            g.fill();
            g.strokeColor = isActive ? GOLD_BORDER : LOCK_BORDER;
            g.lineWidth = 1;
            g.roundRect(-30, -16, 60, 32, 8);
            g.stroke();
            btn.insertChild(bgNode, 0);

            const textColor = isActive ? BACK_TEXT : WHITE;
            this.addLabel(btn, `${ch}章`, 14, textColor, 0, 0, 60, true);

            btn.on(Node.EventType.TOUCH_END, () => {
                if (ch !== this._selectedChapter) {
                    this._selectedChapter = ch;
                    this.refreshStages();
                }
            }, this);

            parent.addChild(btn);
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
