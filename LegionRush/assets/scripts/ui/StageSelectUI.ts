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
import { GameConfig } from '../core/GameConfig';

const { ccclass } = _decorator;

const CARD_W = 130, CARD_H = 100;
const CARD_GAP = 14;
const COLS = 6;

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

        // 默认显示玩家当前章节（highest 为 0 表示新玩家，从第 1 章开始）
        if (PlayerManager.instance.isLoaded) {
            this._selectedChapter = PlayerManager.instance.data.highestChapter || 1;
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

        const area = new Node('StageArea');
        const aut = area.addComponent(UITransform);
        aut.setContentSize(SW, SH - 80);
        aut.setAnchorPoint(0.5, 0.5);
        area.setPosition(0, -20, 0);

        // Chapter title（居中 + 装饰线）
        const titleFS = this.mapFS(22);
        const areaH = SH - 80;
        const titleY = areaH / 2 - 24; // area 顶部向下 24px
        this.addLabel(area, `第 ${this._selectedChapter} 章`, 22, GOLD, 0, titleY, 200, true);

        // 标题下方装饰线
        const divLineY = titleY - titleFS / 2 - 6;
        const divLine = new Node('TitleDiv');
        divLine.addComponent(UITransform).setContentSize(200, 1);
        divLine.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        divLine.setPosition(0, divLineY, 0);
        const divG = divLine.addComponent(Graphics);
        divG.strokeColor = new Color(74, 144, 217, 80);
        divG.lineWidth = 1;
        divG.moveTo(-100, 0);
        divG.lineTo(100, 0);
        divG.stroke();
        divG.fillColor = GOLD;
        divG.circle(0, 0, 2);
        divG.fill();
        area.addChild(divLine);

        // Get stages for this chapter
        const stages = StageManager.instance.getChapterStages(this._selectedChapter);
        console.log(`[StageSelectUI] 第${this._selectedChapter}章: 找到 ${stages.length} 个关卡`);
        if (stages.length > 0) {
            console.log(`[StageSelectUI] 关卡列表: ${stages.map(s => s.id).join(', ')}`);
        }

        if (stages.length === 0) {
            this.addLabel(area, '暂无关卡', 16, GRAY_TEXT, 0, 0, 200, true);
            this._container.addChild(area);
            return;
        }

        // Layout grid：从装饰线往下 16px 开始排列卡片
        const gridTopY = divLineY - 16;
        const rows = Math.ceil(stages.length / COLS);
        const totalW = Math.min(stages.length, COLS) * CARD_W + (Math.min(stages.length, COLS) - 1) * CARD_GAP;
        const totalH = rows * CARD_H + (rows - 1) * CARD_GAP;
        const startX = -totalW / 2 + CARD_W / 2;
        const startY = gridTopY - CARD_H / 2;

        stages.forEach((stage, i) => {
            const row = Math.floor(i / COLS);
            const col = i % COLS;
            const cx = startX + col * (CARD_W + CARD_GAP);
            const cy = startY - row * (CARD_H + CARD_GAP);

            // 用 (chapter, stage) 元组比较，避免复合值跨章错误
            const hc = pm.data.highestChapter || 0;
            const hs = pm.data.highestStage || 0;
            let status: StageStatus;
            if (hc === 0 && hs === 0) {
                // 新玩家
                status = (stage.chapter === 1 && stage.stage === 1) ? 'current' : 'locked';
            } else if (this.isStageBeforeOrEqual(stage.chapter, stage.stage, hc, hs)) {
                status = 'cleared';
            } else if (this.isNextStage(stage.chapter, stage.stage, hc, hs)) {
                status = 'current';
            } else {
                status = 'locked';
            }

            this.buildStageCard(area, stage, status, cx, cy);
        });

        // Chapter navigation
        this.buildChapterNav(area, startY, totalH);

        this._container.addChild(area);

        // 确保新创建的节点都有 UI_2D layer
        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(area);
    }

    private buildStageCard(parent: Node, stage: StageConfig, status: StageStatus, x: number, y: number): void {
        const cardNode = new Node(`Stage_${stage.id}`);
        const cut = cardNode.addComponent(UITransform);
        cut.setContentSize(CARD_W, CARD_H);
        cut.setAnchorPoint(0.5, 0.5);
        cardNode.setPosition(x, y, 0);

        const numFS = this.mapFS(22);
        const nameFS = this.mapFS(10);
        const tagFS = this.mapFS(10);

        // Background
        const bgNode = new Node('CardBg');
        const bgut = bgNode.addComponent(UITransform);
        bgut.setContentSize(CARD_W, CARD_H);
        bgut.setAnchorPoint(0.5, 0.5);
        bgNode.setPosition(0, 0, 0);
        const bg = bgNode.addComponent(Graphics);

        // 状态对应颜色
        let fillColor: Color;
        let borderColor: Color;
        let topStripColor: Color;

        if (status === 'locked') {
            fillColor = CARD_LOCK;
            borderColor = LOCK_BORDER;
            topStripColor = LOCK_BORDER;
        } else if (status === 'current') {
            fillColor = new Color(15, 52, 96, 220);
            borderColor = GOLD_BORDER;
            topStripColor = GOLD;
        } else {
            fillColor = new Color(10, 40, 70, 200);
            borderColor = GREEN_BORDER;
            topStripColor = GREEN;
        }
        // boss/miniBoss 锁定时也用特殊边框
        if (status === 'locked') {
            if (stage.type === 'boss') borderColor = new Color(255, 200, 50, 120);
            else if (stage.type === 'miniBoss') borderColor = new Color(80, 160, 255, 120);
        }

        bg.fillColor = fillColor;
        bg.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
        bg.fill();
        bg.strokeColor = borderColor;
        bg.lineWidth = status === 'current' ? 2 : 1;
        bg.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
        bg.stroke();
        // 顶部状态色条
        bg.fillColor = new Color(topStripColor.r, topStripColor.g, topStripColor.b, status === 'locked' ? 60 : 140);
        bg.roundRect(-CARD_W / 2 + 6, CARD_H / 2 - 3, CARD_W - 12, 3, 1);
        bg.fill();
        cardNode.insertChild(bgNode, 0);

        // 关卡编号（居中偏上）
        const numColor = status === 'locked' ? GRAY_TEXT : WHITE;
        const row1Y = CARD_H / 2 - 20;
        this.addLabel(cardNode, `${stage.stage}`, 22, numColor, 0, row1Y, CARD_W, true);

        // 关卡名称
        const row2Y = row1Y - numFS / 2 - nameFS / 2 - 2;
        const nameColor = status === 'locked' ? GRAY_TEXT : WHITE;
        this.addLabel(cardNode, stage.name, 10, nameColor, 0, row2Y, CARD_W - 8, true);

        // 底部标记
        const row3Y = row2Y - nameFS / 2 - tagFS / 2 - 6;
        if (status === 'cleared') {
            this.addLabel(cardNode, '✓ 通关', 10, GREEN, 0, row3Y, CARD_W, true);
        } else if (status === 'current') {
            this.addLabel(cardNode, '▶ 挑战', 10, GOLD, 0, row3Y, CARD_W, true);
        } else if (stage.type === 'boss') {
            this.addLabel(cardNode, '★ BOSS', 10, new Color(255, 200, 50, 180), 0, row3Y, CARD_W, true);
        } else if (stage.type === 'miniBoss') {
            this.addLabel(cardNode, '◆ 精英', 10, new Color(80, 160, 255, 180), 0, row3Y, CARD_W, true);
        } else {
            this.addLabel(cardNode, '🔒', 10, GRAY_TEXT, 0, row3Y, CARD_W, true);
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

    private buildChapterNav(parent: Node, gridStartY: number, gridTotalH: number): void {
        // 网格最底边 = 第一行中心 - (行数-1)行距 - 半个卡片高
        const gridBottomEdge = gridStartY - CARD_H / 2 - (gridTotalH - CARD_H);
        const navY = gridBottomEdge - 30; // 30px 间距后放导航中心

        const chapters = [1, 2, 3, 4, 5, 6];
        const btnW = 80, btnH = 34, btnGap = 12;
        const totalNavW = chapters.length * btnW + (chapters.length - 1) * btnGap;
        const startX = -totalNavW / 2 + btnW / 2;

        // 导航背景条
        const navBg = new Node('NavBg');
        navBg.addComponent(UITransform).setContentSize(totalNavW + 30, btnH + 16);
        navBg.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        navBg.setPosition(0, navY, 0);
        const navBgG = navBg.addComponent(Graphics);
        navBgG.fillColor = new Color(14, 18, 34, 200);
        navBgG.roundRect(-(totalNavW + 30) / 2, -(btnH + 16) / 2, totalNavW + 30, btnH + 16, 10);
        navBgG.fill();
        parent.addChild(navBg);

        chapters.forEach((ch, i) => {
            const btn = new Node(`Chapter_${ch}`);
            const but = btn.addComponent(UITransform);
            but.setContentSize(btnW, btnH);
            but.setAnchorPoint(0.5, 0.5);
            btn.setPosition(startX + i * (btnW + btnGap), navY, 0);

            const isActive = ch === this._selectedChapter;
            const bgNode = new Node('BtnBg');
            const bgut = bgNode.addComponent(UITransform);
            bgut.setContentSize(btnW, btnH);
            bgut.setAnchorPoint(0.5, 0.5);
            bgNode.setPosition(0, 0, 0);
            const g = bgNode.addComponent(Graphics);
            g.fillColor = isActive ? GOLD : new Color(20, 30, 50, 220);
            g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
            g.fill();
            g.strokeColor = isActive ? GOLD_BORDER : LOCK_BORDER;
            g.lineWidth = 1;
            g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
            g.stroke();
            btn.insertChild(bgNode, 0);

            const textColor = isActive ? BACK_TEXT : WHITE;
            this.addLabel(btn, `第${ch}章`, 14, textColor, 0, 0, btnW, true);

            btn.on(Node.EventType.TOUCH_END, () => {
                if (ch !== this._selectedChapter) {
                    this._selectedChapter = ch;
                    this.refreshStages();
                }
            }, this);

            parent.addChild(btn);
        });
    }

    // ---- Stage comparison helpers ----

    /** (chA, stA) 是否 <= (chB, stB) */
    private isStageBeforeOrEqual(chA: number, stA: number, chB: number, stB: number): boolean {
        if (chA < chB) return true;
        if (chA > chB) return false;
        return stA <= stB;
    }

    /** (chA, stA) 是否是 (chB, stB) 的下一关 */
    private isNextStage(chA: number, stA: number, chB: number, stB: number): boolean {
        if (chA === chB) return stA === stB + 1;
        if (chA === chB + 1 && stA === 1) {
            // 下一章第1关：检查当前章是否有后续关，用 StageManager 判断
            return !StageManager.instance.hasStage(chB, stB + 1);
        }
        return false;
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
