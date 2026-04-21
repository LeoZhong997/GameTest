/**
 * DungeonUI - 副本界面
 * 4标签页：遗器回收、试炼对抗、物资夺回、边境扫荡
 * 当前实现圣物副本全流程，其他标签页显示占位
 */

import { _decorator, Component, Node, Label, Graphics, UITransform, Color, director, view, Layers } from 'cc';
import { DungeonSystem } from '../systems/DungeonSystem';
import { DungeonType, DUNGEON_DEFS } from '../models/DungeonData';
import { setDungeonBattlePending } from './BattleScene';
import { GameConfig } from '../core/GameConfig';
import { RACE_NAMES, DUNGEON_LABELS, CURRENCY_ICONS } from '../core/DisplayNames';

const { ccclass } = _decorator;

// --- Design constants ---
const BG_COLOR           = new Color(26, 26, 46, 255);
const TOPBAR_BG          = new Color(15, 52, 96, 230);
const TAB_BG             = new Color(20, 30, 50, 240);
const GOLD               = new Color(255, 215, 0, 255);
const WHITE              = Color.WHITE;
const GRAY_TEXT          = new Color(140, 140, 160, 255);
const CARD_BORDER_CLEAR  = new Color(80, 200, 80, 200);
const CARD_BORDER_CUR    = new Color(255, 215, 0, 255);
const CARD_BORDER_LOCK   = new Color(60, 60, 80, 150);
const BTN_DISABLED_BG    = new Color(40, 40, 55, 200);
const BTN_TEXT_DARK      = new Color(26, 26, 46, 255);

const LAYER_CARD_W = 280;
const LAYER_CARD_H = 56;
const LAYER_CARD_R = 8;
const LAYER_GAP = 6;

@ccclass('DungeonUI')
export class DungeonUI extends Component {
    private _SW = 1280;
    private _SH = 720;
    private _activeTab: DungeonType = 'relic';
    private _container: Node | null = null;
    private _contentArea: Node | null = null;
    private _tabNodes: Node[] = [];

    onLoad() {
        const design = view.getDesignResolutionSize();
        this._SW = design.width || 1280;
        this._SH = design.height || 720;
        this.node.layer = Layers.Enum.UI_2D;

        this.buildUI();

        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(this.node);
    }

    // ========== Build UI ==========

    private buildUI(): void {
        const SW = this._SW, SH = this._SH;
        const container = new Node('DungeonContainer');
        const ct = container.addComponent(UITransform);
        ct.setContentSize(SW, SH);
        ct.setAnchorPoint(0.5, 0.5);
        container.setPosition(0, 0, 0);
        this._container = container;
        this.node.addChild(container);

        this.drawRect(container, SW, SH, BG_COLOR, 0, 0);
        this.buildTopBar(container);
        this.buildTabBar(container);
        this.buildContentArea(container);
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
        const bbgGfx = backBg.addComponent(Graphics);
        bbgGfx.fillColor = new Color(60, 60, 90, 230);
        bbgGfx.roundRect(-40, -18, 80, 36, 18);
        bbgGfx.fill();
        backBtn.insertChild(backBg, 0);

        this.addLabel(backBtn, '← 返回', 14, WHITE, 0, 0, 80, true);
        backBtn.on(Node.EventType.TOUCH_END, () => {
            director.loadScene('main');
        }, this);
        topBar.addChild(backBtn);

        // Title
        this.addLabel(topBar, '副  本', 22, GOLD, 0, 0, 200, true);

        parent.addChild(topBar);
    }

    private buildTabBar(parent: Node): void {
        const SW = this._SW, SH = this._SH;
        const TAB_H = 44;
        const TAB_Y = SH / 2 - 50 - TAB_H / 2;

        const tabBar = new Node('TabBar');
        const tut = tabBar.addComponent(UITransform);
        tut.setContentSize(SW, TAB_H);
        tut.setAnchorPoint(0.5, 0.5);
        tabBar.setPosition(0, TAB_Y, 0);
        this.drawRect(tabBar, SW, TAB_H, TAB_BG, 0, 0);

        const tabW = SW / DUNGEON_DEFS.length;
        this._tabNodes = [];

        for (let i = 0; i < DUNGEON_DEFS.length; i++) {
            const def = DUNGEON_DEFS[i];
            const tab = new Node(`Tab_${def.key}`);
            const tut2 = tab.addComponent(UITransform);
            tut2.setContentSize(tabW, TAB_H);
            tut2.setAnchorPoint(0.5, 0.5);
            tab.setPosition(-SW / 2 + tabW / 2 + i * tabW, 0, 0);

            const isActive = def.key === this._activeTab;
            this.addLabel(tab, def.label, 16, isActive ? GOLD : GRAY_TEXT, 0, 4, tabW, true);

            // Active indicator
            if (isActive) {
                const ind = new Node('TabIndicator');
                const iut = ind.addComponent(UITransform);
                iut.setContentSize(tabW - 20, 3);
                iut.setAnchorPoint(0.5, 0.5);
                ind.setPosition(0, -TAB_H / 2 + 4, 0);
                const ig = ind.addComponent(Graphics);
                ig.fillColor = GOLD;
                ig.rect(-(tabW - 20) / 2, -1.5, tabW - 20, 3);
                ig.fill();
                tab.addChild(ind);
            }

            tab.on(Node.EventType.TOUCH_END, () => {
                if (def.key !== this._activeTab) {
                    this._activeTab = def.key as DungeonType;
                    this.refresh();
                }
            }, this);

            this._tabNodes.push(tab);
            tabBar.addChild(tab);
        }

        parent.addChild(tabBar);
    }

    private buildContentArea(parent: Node): void {
        const SW = this._SW, SH = this._SH;
        const contentH = SH - 50 - 44;

        const area = new Node('ContentArea');
        const aut = area.addComponent(UITransform);
        aut.setContentSize(SW, contentH);
        aut.setAnchorPoint(0.5, 0.5);
        area.setPosition(0, -(50 + 44) / 2, 0);

        this._contentArea = area;
        parent.addChild(area);

        this.renderContent();
    }

    private refresh(): void {
        if (!this._container) return;

        // Rebuild tab bar
        const oldTabBar = this._container.getChildByName('TabBar');
        if (oldTabBar) {
            oldTabBar.destroy();
            this._tabNodes = [];
            this.buildTabBar(this._container);
        }

        // Rebuild content
        if (this._contentArea) {
            this._contentArea.removeAllChildren();
            this.renderContent();
        }

        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(this._container);
    }

    private renderContent(): void {
        if (!this._contentArea) return;

        switch (this._activeTab) {
            case 'relic':        this.renderRelicDungeon();   break;
            case 'timed_campaign': this.renderTimedCampaign(); break;
            case 'stronghold':   this.renderStronghold();     break;
            case 'chain_assault': this.renderChainAssault();  break;
        }
    }

    // ========== 圣物副本 ==========

    private renderRelicDungeon(): void {
        const ds = DungeonSystem.instance;
        const area = this._contentArea!;
        const areaH = area.getComponent(UITransform)!.contentSize.height;
        const SW = this._SW;

        ds.checkAndReset('relic');
        const progress = ds.getProgress('relic');
        const currentLayer = ds.getRelicCurrentLayer();

        // Title row
        const titleY = areaH / 2 - 24;
        this.addLabel(area, DUNGEON_LABELS.relic, 24, GOLD, -SW / 2 + 120, titleY, 200, false);
        this.addLabel(area, `今日次数: ${progress.dailyClears}/5`, 16, WHITE, SW / 2 - 140, titleY, 200, false);

        // 8 layers in 2 columns × 4 rows (tower: bottom-up)
        const cols = 2;
        const rows = 4;
        const colW = (SW - 80) / cols;
        const towerH = rows * (LAYER_CARD_H + LAYER_GAP) - LAYER_GAP;
        const towerCenterY = titleY - 40 - towerH / 2;

        for (let i = 0; i < 8; i++) {
            const layer = i + 1;
            const col = i % cols;
            const row = Math.floor(i / cols);
            // Tower: layer 1 at bottom → high displayRow index
            const displayRow = rows - 1 - row;

            const cx = -SW / 2 + 40 + colW / 2 + col * colW;
            const cy = towerCenterY + (displayRow - (rows - 1) / 2) * (LAYER_CARD_H + LAYER_GAP);

            let status: 'cleared' | 'current' | 'locked';
            if (layer <= progress.highestLayer) {
                status = 'cleared';
            } else if (layer === currentLayer) {
                status = 'current';
            } else {
                status = 'locked';
            }

            const rewards = ds.calculateRelicRewards(layer);
            const rewardText = rewards.relicEssence ? `精华+${rewards.relicEssence}` : `金币+${rewards.gold}`;

            this.createLayerCard(area, cx, cy, layer, status, rewardText);
        }

        // Challenge button
        const btnY = towerCenterY - towerH / 2 - 40;
        const canEnter = ds.canEnter('relic');
        this.createChallengeButton(area, 0, btnY, canEnter.ok, canEnter.reason || '', () => {
            this.onChallengeRelic(currentLayer);
        });
    }

    private createLayerCard(parent: Node, x: number, y: number, layer: number,
        status: 'cleared' | 'current' | 'locked', rewardText: string): void {
        const card = new Node(`Layer_${layer}`);
        const cut = card.addComponent(UITransform);
        cut.setContentSize(LAYER_CARD_W, LAYER_CARD_H);
        cut.setAnchorPoint(0.5, 0.5);
        card.setPosition(x, y, 0);

        // Background
        const bgNode = new Node('CardBg');
        const bgut = bgNode.addComponent(UITransform);
        bgut.setContentSize(LAYER_CARD_W, LAYER_CARD_H);
        bgut.setAnchorPoint(0.5, 0.5);
        bgNode.setPosition(0, 0, 0);
        const bg = bgNode.addComponent(Graphics);

        let bgColor: Color, borderColor: Color;
        switch (status) {
            case 'cleared':
                bgColor = new Color(20, 40, 30, 220);
                borderColor = CARD_BORDER_CLEAR;
                break;
            case 'current':
                bgColor = new Color(40, 35, 15, 220);
                borderColor = CARD_BORDER_CUR;
                break;
            case 'locked':
                bgColor = new Color(25, 25, 35, 200);
                borderColor = CARD_BORDER_LOCK;
                break;
        }

        bg.fillColor = bgColor;
        bg.roundRect(-LAYER_CARD_W / 2, -LAYER_CARD_H / 2, LAYER_CARD_W, LAYER_CARD_H, LAYER_CARD_R);
        bg.fill();
        bg.strokeColor = borderColor;
        bg.lineWidth = status === 'current' ? 2 : 1;
        bg.roundRect(-LAYER_CARD_W / 2, -LAYER_CARD_H / 2, LAYER_CARD_W, LAYER_CARD_H, LAYER_CARD_R);
        bg.stroke();
        card.insertChild(bgNode, 0);

        // Left status strip
        const stripW = 4;
        const strip = new Node('Strip');
        const sut = strip.addComponent(UITransform);
        sut.setContentSize(stripW, LAYER_CARD_H - 8);
        sut.setAnchorPoint(0.5, 0.5);
        strip.setPosition(-LAYER_CARD_W / 2 + stripW / 2 + 2, 0, 0);
        const sg = strip.addComponent(Graphics);
        sg.fillColor = borderColor;
        sg.rect(-stripW / 2, -(LAYER_CARD_H - 8) / 2, stripW, LAYER_CARD_H - 8);
        sg.fill();
        card.addChild(strip);

        // Layer number
        this.addLabel(card, `第${layer}层`, 16, status === 'locked' ? GRAY_TEXT : WHITE,
            -LAYER_CARD_W / 2 + 55, 0, 80, true);

        // Status / reward
        const statusText = status === 'cleared' ? '✓ 已通关' : status === 'locked' ? '🔒 未解锁' : rewardText;
        const statusColor = status === 'cleared' ? CARD_BORDER_CLEAR
            : status === 'current' ? GOLD : GRAY_TEXT;
        this.addLabel(card, statusText, 14, statusColor, 50, 0, 150, false);

        parent.addChild(card);
    }

    private createChallengeButton(parent: Node, x: number, y: number,
        enabled: boolean, reason: string, callback: () => void): void {
        const btnW = 200, btnH = 50, btnR = 25;

        const btn = new Node('BtnChallenge');
        const but = btn.addComponent(UITransform);
        but.setContentSize(btnW, btnH);
        but.setAnchorPoint(0.5, 0.5);
        btn.setPosition(x, y, 0);

        const bgNode = new Node('BtnBg');
        const bgut = bgNode.addComponent(UITransform);
        bgut.setContentSize(btnW, btnH);
        bgut.setAnchorPoint(0.5, 0.5);
        bgNode.setPosition(0, 0, 0);
        const bg = bgNode.addComponent(Graphics);
        bg.fillColor = enabled ? GOLD : BTN_DISABLED_BG;
        bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, btnR);
        bg.fill();
        btn.insertChild(bgNode, 0);

        const text = enabled ? '挑  战' : reason || '次数已满';
        this.addLabel(btn, text, 18, enabled ? BTN_TEXT_DARK : GRAY_TEXT, 0, 0, btnW, true);

        if (enabled) {
            btn.on(Node.EventType.TOUCH_END, callback, this);
        }

        parent.addChild(btn);
    }

    private onChallengeRelic(layer: number): void {
        const ds = DungeonSystem.instance;
        const canEnter = ds.canEnter('relic');
        if (!canEnter.ok) {
            console.log(`[DungeonUI] 无法进入: ${canEnter.reason}`);
            return;
        }

        const enemies = ds.generateRelicEnemies(layer);
        console.log(`[DungeonUI] 挑战圣物副本第${layer}层, ${enemies.length}个敌人`);

        setDungeonBattlePending('relic', layer, enemies);
        director.loadScene('battle');
    }

    // ========== 限时征讨 ==========

    private renderTimedCampaign(): void {
        const ds = DungeonSystem.instance;
        const area = this._contentArea!;
        const areaH = area.getComponent(UITransform)!.contentSize.height;
        const SW = this._SW;

        ds.checkAndReset('timed_campaign');
        const progress = ds.getProgress('timed_campaign');
        const race = ds.getCurrentWeekRace();
        const raceName = RACE_NAMES;

        // Title row
        const titleY = areaH / 2 - 24;
        this.addLabel(area, DUNGEON_LABELS.timed_campaign, 24, GOLD, -SW / 2 + 120, titleY, 200, false);

        this.addLabel(area, `本周: ${raceName[race] || race}`, 16,
            new Color(255, 200, 100, 255), 0, titleY, 160, true);
        this.addLabel(area, `周次数: ${progress.weeklyAttempts}/88`, 16,
            WHITE, SW / 2 - 120, titleY, 180, false);

        // 12 stages in 4 columns × 3 rows
        const cols = 4;
        const rows = 3;
        const cardW = 270;
        const cardH = 64;
        const gapX = 12;
        const gapY = 10;
        const freeStages = 6; // first 6 free, 7-12 race restricted

        const totalGridW = cols * cardW + (cols - 1) * gapX;
        const startX = -totalGridW / 2 + cardW / 2;
        const gridTopY = titleY - 36;

        let currentStage = progress.highestLayer + 1;
        if (currentStage > 12) currentStage = 12;

        for (let i = 0; i < 12; i++) {
            const stage = i + 1;
            const col = i % cols;
            const row = Math.floor(i / cols);

            const cx = startX + col * (cardW + gapX);
            const cy = gridTopY - row * (cardH + gapY) - cardH / 2;

            let status: 'cleared' | 'current' | 'locked';
            if (stage <= progress.highestLayer) {
                status = 'cleared';
            } else if (stage === currentStage) {
                status = 'current';
            } else {
                status = 'locked';
            }

            const rewards = ds.calculateTimedRewards(stage);
            const isRestricted = stage > freeStages;
            const raceTag = isRestricted ? `[${raceName[race] || race}]` : '[自由]';
            const rewardText = `${CURRENCY_ICONS.crystals}${rewards.crystals}  📜${rewards.exp}`;

            this.createStageCard(area, cx, cy, cardW, cardH, `第${stage}关 ${raceTag}`,
                status, rewardText);
        }

        // Challenge button
        const btnY = gridTopY - rows * (cardH + gapY) - 20;
        const canEnter = ds.canEnter('timed_campaign');
        this.createChallengeButton(area, 0, btnY, canEnter.ok, canEnter.reason || '', () => {
            this.onChallengeTimed(currentStage);
        });
    }

    private createStageCard(parent: Node, x: number, y: number, w: number, h: number,
        title: string, status: 'cleared' | 'current' | 'locked', rewardText: string): void {
        const card = new Node('StageCard');
        const cut = card.addComponent(UITransform);
        cut.setContentSize(w, h);
        cut.setAnchorPoint(0.5, 0.5);
        card.setPosition(x, y, 0);

        // Background
        const bgNode = new Node('CardBg');
        const bgut = bgNode.addComponent(UITransform);
        bgut.setContentSize(w, h);
        bgut.setAnchorPoint(0.5, 0.5);
        bgNode.setPosition(0, 0, 0);
        const bg = bgNode.addComponent(Graphics);

        let bgColor: Color, borderColor: Color;
        switch (status) {
            case 'cleared':
                bgColor = new Color(20, 40, 30, 220);
                borderColor = CARD_BORDER_CLEAR;
                break;
            case 'current':
                bgColor = new Color(40, 35, 15, 220);
                borderColor = CARD_BORDER_CUR;
                break;
            case 'locked':
                bgColor = new Color(25, 25, 35, 200);
                borderColor = CARD_BORDER_LOCK;
                break;
        }

        bg.fillColor = bgColor;
        bg.roundRect(-w / 2, -h / 2, w, h, 8);
        bg.fill();
        bg.strokeColor = borderColor;
        bg.lineWidth = status === 'current' ? 2 : 1;
        bg.roundRect(-w / 2, -h / 2, w, h, 8);
        bg.stroke();
        card.insertChild(bgNode, 0);

        // Title
        const titleColor = status === 'locked' ? GRAY_TEXT : WHITE;
        this.addLabel(card, title, 14, titleColor, 0, 10, w - 12, true);

        // Reward / status text
        const bottomText = status === 'cleared' ? '✓ 已通关' : status === 'locked' ? '未解锁' : rewardText;
        const bottomColor = status === 'cleared' ? CARD_BORDER_CLEAR
            : status === 'current' ? GOLD : GRAY_TEXT;
        this.addLabel(card, bottomText, 12, bottomColor, 0, -10, w - 12, true);

        parent.addChild(card);
    }

    private onChallengeTimed(stage: number): void {
        const ds = DungeonSystem.instance;
        const canEnter = ds.canEnter('timed_campaign');
        if (!canEnter.ok) {
            console.log(`[DungeonUI] 无法进入: ${canEnter.reason}`);
            return;
        }

        const enemies = ds.generateTimedEnemies(stage);
        console.log(`[DungeonUI] 挑战限时征讨第${stage}关, ${enemies.length}个敌人`);

        setDungeonBattlePending('timed_campaign', stage, enemies);
        director.loadScene('battle');
    }

    // ========== 据点防守 ==========

    private renderStronghold(): void {
        const ds = DungeonSystem.instance;
        const area = this._contentArea!;
        const areaH = area.getComponent(UITransform)!.contentSize.height;
        const SW = this._SW;

        ds.checkAndReset('stronghold');
        const progress = ds.getProgress('stronghold');

        // Title row
        const titleY = areaH / 2 - 24;
        this.addLabel(area, DUNGEON_LABELS.stronghold, 24, GOLD, -SW / 2 + 120, titleY, 200, false);
        this.addLabel(area, `今日次数: ${progress.dailyClears}/3`, 16, WHITE, SW / 2 - 140, titleY, 200, false);

        // 3 waves vertically centered
        const totalWaves = 3;
        const cardW = 360;
        const cardH = 70;
        const gap = 12;
        const startY = titleY - 40 - cardH / 2;

        let currentWave = progress.highestLayer + 1;
        if (currentWave > totalWaves) currentWave = totalWaves;

        for (let i = 0; i < totalWaves; i++) {
            const wave = i + 1;
            const cy = startY - i * (cardH + gap);

            let status: 'cleared' | 'current' | 'locked';
            if (wave <= progress.highestLayer) {
                status = 'cleared';
            } else if (wave === currentWave) {
                status = 'current';
            } else {
                status = 'locked';
            }

            const rewards = ds.calculateStrongholdRewards(wave);
            let rewardText = `${CURRENCY_ICONS.gold}${rewards.gold}`;
            if (rewards.items && rewards.items.length > 0) {
                const itemNames: Record<string, string> = {
                    ascension_scroll: '升阶卷轴', exp_book_m: '中级经验书',
                };
                const itemText = rewards.items.map(it => `${itemNames[it.id] || it.id}${Math.round(it.probability * 100)}%`).join(' ');
                rewardText += `  ${itemText}`;
            }

            this.createStageCard(area, 0, cy, cardW, cardH,
                `第${wave}波  远程偏重`, status, rewardText);
        }

        // Challenge button
        const btnY = startY - totalWaves * (cardH + gap) - 10;
        const canEnter = ds.canEnter('stronghold');
        this.createChallengeButton(area, 0, btnY, canEnter.ok, canEnter.reason || '', () => {
            this.onChallengeStronghold(currentWave);
        });
    }

    private onChallengeStronghold(wave: number): void {
        const ds = DungeonSystem.instance;
        const canEnter = ds.canEnter('stronghold');
        if (!canEnter.ok) {
            console.log(`[DungeonUI] 无法进入: ${canEnter.reason}`);
            return;
        }

        const enemies = ds.generateStrongholdEnemies(wave);
        console.log(`[DungeonUI] 挑战据点防守第${wave}波, ${enemies.length}个敌人`);

        setDungeonBattlePending('stronghold', wave, enemies);
        director.loadScene('battle');
    }

    // ========== 连环突击 ==========

    private renderChainAssault(): void {
        const ds = DungeonSystem.instance;
        const area = this._contentArea!;
        const areaH = area.getComponent(UITransform)!.contentSize.height;
        const SW = this._SW;

        ds.checkAndReset('chain_assault');
        const progress = ds.getProgress('chain_assault');

        // Title row
        const titleY = areaH / 2 - 24;
        this.addLabel(area, DUNGEON_LABELS.chain_assault, 24, GOLD, -SW / 2 + 120, titleY, 200, false);
        this.addLabel(area, `今日次数: ${progress.dailyClears}/3`, 16, WHITE, SW / 2 - 140, titleY, 200, false);

        const centerY = titleY - 60;

        // Daily random hint
        this.addLabel(area, '每日随机阵容', 20, new Color(180, 200, 255, 255), 0, centerY + 60, 300, true);

        // Star display area — 3 big stars
        const bestStar = progress.chainStars.length > 0
            ? Math.max(...progress.chainStars) : 0;
        const starY = centerY;
        const starGap = 60;
        for (let i = 0; i < 3; i++) {
            const sx = (i - 1) * starGap;
            const lit = i < bestStar;
            this.addLabel(area, lit ? '★' : '☆', 44,
                lit ? GOLD : new Color(80, 80, 100, 200), sx, starY, 50, true);
        }

        // Star count text
        this.addLabel(area, `今日最佳: ${bestStar}星`, 16, WHITE, 0, starY - 40, 200, true);

        // History stars
        if (progress.chainStars.length > 0) {
            const starsText = progress.chainStars.map(s => `${s}☆`).join(' ');
            this.addLabel(area, `历史: ${starsText}`, 14, GRAY_TEXT, 0, starY - 70, 400, true);
        }

        // Challenge button
        const btnY = starY - 110;
        const canEnter = ds.canEnter('chain_assault');
        this.createChallengeButton(area, 0, btnY, canEnter.ok, canEnter.reason || '', () => {
            this.onChallengeChain();
        });
    }

    private onChallengeChain(): void {
        const ds = DungeonSystem.instance;
        const canEnter = ds.canEnter('chain_assault');
        if (!canEnter.ok) {
            console.log(`[DungeonUI] 无法进入: ${canEnter.reason}`);
            return;
        }

        const enemies = ds.generateChainEnemies();
        console.log(`[DungeonUI] 挑战连环突击, ${enemies.length}个敌人`);

        setDungeonBattlePending('chain_assault', 1, enemies);
        director.loadScene('battle');
    }

    // ========== 通用渲染 ==========

    // ========== Drawing helpers ==========

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
}
