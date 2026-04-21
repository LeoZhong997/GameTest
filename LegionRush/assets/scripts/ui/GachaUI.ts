/**
 * GachaUI - 抽卡界面
 * 瓶盖抽兵种，支持单抽和十连，附抽卡特效
 * 纯代码创建，挂载在 UIRoot 节点
 */

import { _decorator, Component, Node, Label, Graphics, UITransform, Color, UIOpacity, tween, Vec3, Layers, view, director } from 'cc';
import { EventBus } from '../core/EventBus';
import { PlayerManager } from '../systems/PlayerManager';
import { GachaSystem, GachaResult, GACHA_COST, GACHA_TEN_COST } from '../systems/GachaSystem';
import { RelicGachaSystem, RelicGachaResult } from '../systems/RelicGachaSystem';
import { Quality } from '../models/UnitData';
import { UnitShape, drawShape } from './UnitView';
import { STAT_NAMES } from '../models/RelicData';
import { GameConfig } from '../core/GameConfig';
import { QUALITY_FULL, SCENE_LABELS, CURRENCY_ICONS } from '../core/DisplayNames';

const { ccclass } = _decorator;

// Colors
const BG          = new Color(26, 26, 46, 255);
const TOPBAR_BG   = new Color(15, 52, 96, 230);
const GOLD        = new Color(255, 215, 0, 255);
const WHITE       = Color.WHITE;
const GRAY_TEXT   = new Color(160, 160, 180, 255);
const BACK_TEXT   = new Color(26, 26, 46, 255);
const CIRCLE_CLR  = new Color(80, 140, 255, 60);
const CIRCLE_DOT  = new Color(120, 180, 255, 90);
const GLOW_CLR    = new Color(100, 160, 255, 40);

const QUALITY_COLORS: Record<string, Color> = {
    [Quality.GREEN]:  new Color(80, 200, 120, 255),
    [Quality.BLUE]:   new Color(80, 160, 255, 255),
    [Quality.PURPLE]: new Color(180, 80, 255, 255),
    [Quality.GOLD]:   new Color(255, 215, 0, 255),
};

const QUALITY_NAMES: Record<string, string> = {
    [Quality.GREEN]:  QUALITY_FULL.green,
    [Quality.BLUE]:   QUALITY_FULL.blue,
    [Quality.PURPLE]: QUALITY_FULL.purple,
    [Quality.GOLD]:   QUALITY_FULL.gold,
};

const ROLE_SHAPES: Record<string, UnitShape> = {
    tank: 'rect', melee: 'triangle', ranged: 'circle',
    support: 'hexagon', assassin: 'diamond',
};

@ccclass('GachaUI')
export class GachaUI extends Component {
    private _container: Node | null = null;
    private _capLabel: Label | null = null;
    private _tokenLabel: Label | null = null;
    private _btnSingle: Node | null = null;
    private _btnTen: Node | null = null;
    private _circleNode: Node | null = null;
    private _glowNode: Node | null = null;
    private _pulling: boolean = false;
    private _SW = 1280;
    private _SH = 720;
    private _gachaMode: 'unit' | 'relic' = 'unit';
    private _tabNodes: Node[] = [];
    private _rateLabel: Label | null = null;

    onLoad() {
        const design = view.getDesignResolutionSize();
        this._SW = design.width || 1280;
        this._SH = design.height || 720;
        this.node.layer = Layers.Enum.UI_2D;

        this.buildUI();

        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(this.node);
    }

    start() {
        this.refreshCap();
        EventBus.instance.on('player:loaded', this.refreshCap, this);
    }

    onDestroy() {
        EventBus.instance.off('player:loaded', this.refreshCap, this);
    }

    // ---- Build UI ----

    private buildUI(): void {
        const SW = this._SW, SH = this._SH;
        const container = new Node('GachaContainer');
        const ct = container.addComponent(UITransform);
        ct.setContentSize(SW, SH);
        ct.setAnchorPoint(0.5, 0.5);
        container.setPosition(0, 0, 0);
        this._container = container;
        this.node.addChild(container);

        this.drawRect(container, SW, SH, BG, 0, 0);
        this.buildTopBar(container);
        this.buildGachaTabs(container);
        this.buildSummoningCircle(container);
        this.buildButtons(container);
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
        const backBtn = this.createRoundBtn('返回', 80, 36, GOLD, BACK_TEXT);
        backBtn.setPosition(-SW / 2 + 60, 0, 0);
        backBtn.on(Node.EventType.TOUCH_END, () => director.loadScene('main'), this);
        topBar.addChild(backBtn);

        // Title
        this.addLabel(topBar, SCENE_LABELS.gacha, 24, GOLD, 0, 0, 200, true);

        // Currency
        const capLbl = this.addLabel(topBar, '🍺 0', 15, WHITE, SW / 2 - 130, 0, 100, true);
        this._capLabel = capLbl.getComponent(Label);
        const tokenLbl = this.addLabel(topBar, '🪙 0', 15, WHITE, SW / 2 - 30, 0, 100, true);
        this._tokenLabel = tokenLbl.getComponent(Label);

        parent.addChild(topBar);
    }

    /** 抽卡模式标签（单位/圣物） */
    private buildGachaTabs(parent: Node): void {
        const SW = this._SW;
        const tabY = this._SH / 2 - 80;

        const tabArea = new Node('GachaTabs');
        const tUT = tabArea.addComponent(UITransform);
        tUT.setContentSize(240, 32);
        tUT.setAnchorPoint(0.5, 0.5);
        tabArea.setPosition(0, tabY, 0);

        const modes: { key: 'unit' | 'relic'; label: string }[] = [
            { key: 'unit', label: '兵种' },
            { key: 'relic', label: '遗器' },
        ];

        this._tabNodes = [];
        const tabW = 110, tabGap = 8;
        for (let i = 0; i < modes.length; i++) {
            const tab = new Node(`Tab_${modes[i].key}`);
            const tabUT = tab.addComponent(UITransform);
            tabUT.setContentSize(tabW, 30);
            tabUT.setAnchorPoint(0.5, 0.5);
            const tx = i === 0 ? -(tabW / 2 + tabGap / 2) : (tabW / 2 + tabGap / 2);
            tab.setPosition(tx, 0, 0);

            const tabBg = new Node('TabBg');
            tabBg.addComponent(UITransform).setContentSize(tabW, 30);
            tabBg.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
            const tabG = tabBg.addComponent(Graphics);
            tabBg.setPosition(0, 0, 0);
            tab.insertChild(tabBg, 0);

            this.addLabel(tab, modes[i].label, 14, WHITE, 0, 0, tabW, true);

            const mode = modes[i].key;
            tab.on(Node.EventType.TOUCH_END, () => {
                this._gachaMode = mode;
                this.refreshGachaTabs();
                this.updateButtonsForMode();
            });

            tabArea.addChild(tab);
            this._tabNodes.push(tab);
        }

        parent.addChild(tabArea);
        this.refreshGachaTabs();
    }

    private refreshGachaTabs(): void {
        const modes: ('unit' | 'relic')[] = ['unit', 'relic'];
        for (let i = 0; i < this._tabNodes.length; i++) {
            const tabNode = this._tabNodes[i];
            const isActive = modes[i] === this._gachaMode;
            const bg = tabNode.getChildByName('TabBg');
            const bgG = bg!.getComponent(Graphics)!;
            bgG.clear();
            bgG.fillColor = isActive ? new Color(20, 50, 90, 255) : new Color(18, 22, 40, 200);
            bgG.roundRect(-55, -15, 110, 30, 6);
            bgG.fill();
            if (isActive) {
                bgG.fillColor = GOLD;
                bgG.rect(-55, -15, 3, 30);
                bgG.fill();
            }
            const lbl = tabNode.children.find(c => c.getComponent(Label))!;
            lbl.getComponent(Label)!.color = isActive ? GOLD : GRAY_TEXT;
        }
    }

    /** 根据模式更新按钮文案和消耗 */
    private updateButtonsForMode(): void {
        const isRelic = this._gachaMode === 'relic';
        const singleCost = isRelic ? RelicGachaSystem.instance.getSingleCost() : GACHA_COST.gold;
        const tenCost = isRelic ? RelicGachaSystem.instance.getTenCost() : GACHA_TEN_COST.gold;
        const currency = isRelic ? CURRENCY_ICONS.crystals : CURRENCY_ICONS.gold;

        // 更新按钮文本（两个 Label：顶行 + 底行）
        if (this._btnSingle) {
            const labels = this._btnSingle.children.filter(c => c.getComponent(Label));
            if (labels[0]) labels[0].getComponent(Label)!.string = '单抽 ×1';
            if (labels[1]) labels[1].getComponent(Label)!.string = `${currency}${singleCost}`;
        }
        if (this._btnTen) {
            const labels = this._btnTen.children.filter(c => c.getComponent(Label));
            if (labels[0]) labels[0].getComponent(Label)!.string = '十连 ×10';
            if (labels[1]) labels[1].getComponent(Label)!.string = `${currency}${tenCost}`;
        }

        // 更新概率提示
        if (this._rateLabel) {
            this._rateLabel.string = isRelic
                ? '绿60%  蓝28%  紫10%  金2%'
                : '普通55%  稀有30%  史诗12%  传说3%';
        }

        this.updateBtnState();
    }

    /** 召唤阵装饰 */
    private buildSummoningCircle(parent: Node): void {
        // 外层旋转圈
        const circleNode = new Node('SummonCircle');
        const cut = circleNode.addComponent(UITransform);
        cut.setContentSize(280, 280);
        cut.setAnchorPoint(0.5, 0.5);
        circleNode.setPosition(0, 30, 0);

        const gfx = circleNode.addComponent(Graphics);
        // 外圈
        gfx.strokeColor = CIRCLE_CLR;
        gfx.lineWidth = 2;
        gfx.circle(0, 0, 100);
        gfx.stroke();
        // 中圈
        gfx.strokeColor = new Color(80, 140, 255, 40);
        gfx.circle(0, 0, 70);
        gfx.stroke();
        // 内六边形
        const r6 = 45;
        gfx.strokeColor = CIRCLE_CLR;
        gfx.moveTo(Math.cos(Math.PI / 2) * r6, Math.sin(Math.PI / 2) * r6);
        for (let i = 1; i <= 6; i++) {
            const a = Math.PI / 2 + i * (2 * Math.PI / 6);
            gfx.lineTo(Math.cos(a) * r6, Math.sin(a) * r6);
        }
        gfx.close();
        gfx.stroke();
        // 六个顶点小圆
        for (let i = 0; i < 6; i++) {
            const a = Math.PI / 2 + i * (2 * Math.PI / 6);
            gfx.fillColor = CIRCLE_DOT;
            gfx.circle(Math.cos(a) * 85, Math.sin(a) * 85, 7);
            gfx.fill();
        }
        // 内部小六边形装饰点
        for (let i = 0; i < 6; i++) {
            const a = i * (2 * Math.PI / 6) + Math.PI / 6;
            gfx.fillColor = new Color(120, 180, 255, 50);
            gfx.circle(Math.cos(a) * 30, Math.sin(a) * 30, 3);
            gfx.fill();
        }

        parent.addChild(circleNode);
        this._circleNode = circleNode;

        // 呼吸光晕（更大更柔和）
        const glowNode = new Node('Glow');
        const gut = glowNode.addComponent(UITransform);
        gut.setContentSize(240, 240);
        gut.setAnchorPoint(0.5, 0.5);
        glowNode.setPosition(0, 30, 0);
        const gg = glowNode.addComponent(Graphics);
        gg.fillColor = new Color(60, 120, 220, 25);
        gg.circle(0, 0, 60);
        gg.fill();
        gg.fillColor = new Color(80, 140, 255, 15);
        gg.circle(0, 0, 90);
        gg.fill();
        parent.addChild(glowNode);
        this._glowNode = glowNode;

        // 持续旋转 + 呼吸
        tween(circleNode).by(8, { angle: -360 }).repeatForever().start();
        tween(glowNode)
            .to(1.5, { scale: new Vec3(1.3, 1.3, 1) }, { easing: 'sineInOut' })
            .to(1.5, { scale: new Vec3(0.8, 0.8, 1) }, { easing: 'sineInOut' })
            .repeatForever().start();
    }

    /** 底部按钮区 */
    private buildButtons(parent: Node): void {
        const SH = this._SH;
        const btnY = -SH / 2 + 90;

        const btnSingle = this.createPullBtn(`单抽 ×1\n${CURRENCY_ICONS.gold}${GACHA_COST.gold}`, 220, 68,
            new Color(15, 45, 85, 230), new Color(80, 160, 255, 220));
        btnSingle.setPosition(-130, btnY, 0);
        btnSingle.on(Node.EventType.TOUCH_END, this.onSinglePull, this);
        parent.addChild(btnSingle);
        this._btnSingle = btnSingle;

        const btnTen = this.createPullBtn(`十连 ×10\n${CURRENCY_ICONS.gold}${GACHA_TEN_COST.gold}`, 220, 68,
            new Color(55, 18, 75, 230), new Color(180, 80, 255, 220));
        btnTen.setPosition(130, btnY, 0);
        btnTen.on(Node.EventType.TOUCH_END, this.onTenPull, this);
        parent.addChild(btnTen);
        this._btnTen = btnTen;

        // 概率提示（带背景条）
        const rateBgY = btnY - 54;
        const rateBg = new Node('RateBg');
        rateBg.addComponent(UITransform).setContentSize(400, 28);
        rateBg.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        rateBg.setPosition(0, rateBgY, 0);
        const rbg = rateBg.addComponent(Graphics);
        rbg.fillColor = new Color(14, 18, 34, 180);
        rbg.roundRect(-200, -14, 400, 28, 14);
        rbg.fill();
        parent.addChild(rateBg);

        const rateNode = this.addLabel(parent, '普通55%  稀有30%  史诗12%  传说3%', 12,
            new Color(140, 140, 160, 220), 0, rateBgY, 400, true);
        this._rateLabel = rateNode.getComponent(Label);
    }

    private refreshCap(): void {
        if (!PlayerManager.instance.isLoaded) return;
        const data = PlayerManager.instance.data;
        if (this._capLabel) this._capLabel.string = `${CURRENCY_ICONS.gold} ${data.gold}`;
        if (this._tokenLabel) this._tokenLabel.string = `${CURRENCY_ICONS.crystals} ${data.crystals}`;
        this.updateBtnState();
    }

    private updateBtnState(): void {
        const d = PlayerManager.instance.isLoaded ? PlayerManager.instance.data : null;
        if (!d) return;

        if (this._gachaMode === 'unit') {
            const canSingle = d.gold >= GACHA_COST.gold;
            const canTen = d.gold >= GACHA_TEN_COST.gold;
            if (this._btnSingle) this._btnSingle.getComponent(UIOpacity)!.opacity = canSingle ? 255 : 120;
            if (this._btnTen) this._btnTen.getComponent(UIOpacity)!.opacity = canTen ? 255 : 120;
        } else {
            const singleCost = RelicGachaSystem.instance.getSingleCost();
            const tenCost = RelicGachaSystem.instance.getTenCost();
            const canSingle = d.crystals >= singleCost;
            const canTen = d.crystals >= tenCost;
            if (this._btnSingle) this._btnSingle.getComponent(UIOpacity)!.opacity = canSingle ? 255 : 120;
            if (this._btnTen) this._btnTen.getComponent(UIOpacity)!.opacity = canTen ? 255 : 120;
        }
    }

    // ---- Pull Logic ----

    private onSinglePull(): void { this.doPull(1); }
    private onTenPull(): void { this.doPull(10); }

    private doPull(count: number): void {
        if (this._pulling) return;
        const pm = PlayerManager.instance;
        if (!pm.isLoaded) return;

        if (this._gachaMode === 'relic') {
            this.doRelicPull(count);
            return;
        }

        // 原有单位抽卡逻辑
        const cost = count === 1 ? GACHA_COST : GACHA_TEN_COST;
        // 扣金币
        if (pm.data.gold >= cost.gold) {
            pm.spendCurrency('gold', cost.gold);
        } else {
            console.log('[GachaUI] 货币不足');
            return;
        }

        this._pulling = true;
        this.refreshCap();

        const ownedConfigIds = new Set(Object.values(pm.data.units).map(u => u.configId));
        const results = GachaSystem.instance.pull(count, ownedConfigIds);

        // 添加到玩家数据：新兵种创建单位，已有兵种转化为碎片
        for (const r of results) {
            if (r.isNew) {
                pm.addUnit(r.configId, r.quality, 1);
            } else {
                pm.addItem(GachaSystem.getShardId(r.configId, r.quality), 1);
            }
        }
        pm.save();

        console.log(`[GachaUI] 抽卡 ${count} 发: ${results.map(r => `${r.config.name}(${QUALITY_NAMES[r.quality]})${r.isNew ? '★新' : ''}`).join(', ')}`);

        this.playPullAnimation(results);
    }

    /** 圣物抽卡 */
    private doRelicPull(count: number): void {
        const pm = PlayerManager.instance;
        const cost = count === 1 ? RelicGachaSystem.instance.getSingleCost() : RelicGachaSystem.instance.getTenCost();
        if (pm.data.crystals < cost) {
            console.log('[GachaUI] 钻石不足');
            return;
        }

        pm.spendCurrency('crystals', cost);
        this._pulling = true;
        this.refreshCap();

        const results = RelicGachaSystem.instance.pull(count);
        pm.save();

        console.log(`[GachaUI] 圣物抽卡 ${count} 发: ${results.map(r => `${r.configName}(${r.quality})`).join(', ')}`);

        // 复用动画，传入圣物结果
        this.playRelicPullAnimation(results);
    }

    // ---- Animation ----

    private playPullAnimation(results: GachaResult[]): void {
        // 隐藏按钮
        if (this._btnSingle) this._btnSingle.active = false;
        if (this._btnTen) this._btnTen.active = false;

        // 光晕加速旋转 + 变亮
        const circle = this._circleNode;
        const glow = this._glowNode;

        // Phase 1: 加速旋转 + 放大 (1s)
        tween(circle!)
            .to(0.5, { scale: new Vec3(1.5, 1.5, 1) }, { easing: 'sineIn' })
            .to(0.5, { scale: new Vec3(2.0, 2.0, 1) }, { easing: 'sineIn' })
            .start();

        // Phase 2: 碎星散射 (0.8s 后)
        setTimeout(() => {
            this.spawnStars(results);
        }, 800);
    }

    /** 碎星散射：从中心迸发光点向外散射，无全屏遮罩 */
    private spawnStars(results: GachaResult[]): void {
        if (!this._container) return;
        const parent = new Node('StarBurst');
        const put = parent.addComponent(UITransform);
        put.setContentSize(10, 10);
        put.setAnchorPoint(0.5, 0.5);
        parent.setPosition(0, 30, 0);   // 与召唤阵同中心
        this._container.addChild(parent);
        parent.layer = Layers.Enum.UI_2D;

        const STAR_COLORS = [
            new Color(255, 215, 0, 255),    // 金
            new Color(255, 255, 255, 255),   // 白
            new Color(255, 240, 180, 255),   // 暖白
            new Color(100, 160, 255, 255),   // 蓝
        ];
        const COUNT = 24;

        for (let i = 0; i < COUNT; i++) {
            const dot = new Node(`Star${i}`);
            const dut = dot.addComponent(UITransform);
            dut.setContentSize(10, 10);
            dut.setAnchorPoint(0.5, 0.5);
            const dg = dot.addComponent(Graphics);
            const r = 2 + Math.random() * 4;
            dg.fillColor = STAR_COLORS[i % STAR_COLORS.length];
            dg.circle(0, 0, r);
            dg.fill();
            dot.setPosition(0, 0, 0);
            parent.addChild(dot);
            dot.layer = Layers.Enum.UI_2D;

            // 随机方向飞出
            const angle = (i / COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const dist = 120 + Math.random() * 200;
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist;
            const dur = 0.4 + Math.random() * 0.3;

            const op = dot.addComponent(UIOpacity);
            op.opacity = 255;
            tween(dot)
                .to(dur, { position: new Vec3(dx, dy, 0) }, { easing: 'quadOut' })
                .start();
            tween(op)
                .delay(dur * 0.4)
                .to(dur * 0.6, { opacity: 0 })
                .start();
        }

        // 召唤阵淡出 + 显示结果
        const circle = this._circleNode;
        const glow = this._glowNode;
        if (glow) {
            tween(glow.getComponent(UIOpacity) || glow.addComponent(UIOpacity))
                .to(0.3, { opacity: 0 })
                .start();
        }
        if (circle) {
            const cop = circle.getComponent(UIOpacity) || circle.addComponent(UIOpacity);
            tween(cop)
                .to(0.3, { opacity: 0 })
                .call(() => {
                    circle.active = false;
                    cop.opacity = 255;  // 恢复，供下次使用
                    if (glow) { glow.active = false; glow.getComponent(UIOpacity)!.opacity = 255; }
                })
                .start();
        }

        // 碎星飞完后清理 + 显示结果
        setTimeout(() => {
            parent.destroy();
            this.showResults(results);
        }, 500);
    }

    /** 显示抽卡结果 */
    private showResults(results: GachaResult[]): void {
        const SW = this._SW, SH = this._SH;

        // 半透明背景
        const overlay = new Node('ResultOverlay');
        const out = overlay.addComponent(UITransform);
        out.setContentSize(SW, SH);
        out.setAnchorPoint(0.5, 0.5);
        overlay.setPosition(0, 0, 0);
        const og = overlay.addComponent(Graphics);
        og.fillColor = new Color(10, 10, 30, 220);
        og.rect(-SW / 2, -SH / 2, SW, SH);
        og.fill();
        overlay.addComponent(UIOpacity).opacity = 0;

        // 卡片布局
        const isSingle = results.length === 1;
        const cardW = isSingle ? 180 : 120;
        const cardH = isSingle ? 240 : 165;
        const gap = 14;
        const cols = isSingle ? 1 : 5;
        const rows = Math.ceil(results.length / cols);
        const totalW = cols * cardW + (cols - 1) * gap;
        const totalH = rows * cardH + (rows - 1) * gap;
        const startX = -totalW / 2 + cardW / 2;
        const startY = totalH / 2 - cardH / 2 + 20; // 略微上移

        for (let i = 0; i < results.length; i++) {
            const r = i % cols;
            const row = Math.floor(i / cols);
            const cx = startX + r * (cardW + gap);
            const cy = startY - row * (cardH + gap);

            const card = this.createResultCard(results[i], cardW, cardH);
            card.setPosition(cx, cy, 0);
            card.setScale(0, 0, 1);
            overlay.addChild(card);

            // 逐个弹出动画
            const delay = i * 80;
            tween(card)
                .delay(delay / 1000)
                .to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                .start();

            // 高品质特效
            if (results[i].quality === Quality.GOLD || results[i].quality === Quality.PURPLE) {
                setTimeout(() => this.spawnQualityBurst(card, results[i].quality), delay + 350);
            }
        }

        // 确认按钮
        const confirmBtn = this.createRoundBtn('确  认', 160, 50, GOLD, BACK_TEXT);
        confirmBtn.setPosition(0, startY - rows * (cardH + gap) - 30, 0);
        confirmBtn.on(Node.EventType.TOUCH_END, () => {
            overlay.destroy();
            this._pulling = false;
            if (this._btnSingle) this._btnSingle.active = true;
            if (this._btnTen) this._btnTen.active = true;
            if (this._circleNode) this._circleNode.active = true;
            if (this._glowNode) this._glowNode.active = true;
            // 重置召唤阵缩放
            if (this._circleNode) this._circleNode.setScale(1, 1, 1);
        }, this);
        overlay.addChild(confirmBtn);

        if (this._container) this._container.addChild(overlay);

        // 修正 layer
        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(overlay);

        // 淡入
        tween(overlay.getComponent(UIOpacity)!)
            .to(0.2, { opacity: 255 })
            .start();
    }

    /** 创建结果卡片 */
    private createResultCard(result: GachaResult, w: number, h: number): Node {
        const card = new Node(`Card_${result.uid}`);
        const cut = card.addComponent(UITransform);
        cut.setContentSize(w, h);
        cut.setAnchorPoint(0.5, 0.5);

        const qColor = QUALITY_COLORS[result.quality] || GRAY_TEXT;

        // 背景（品质色淡底）
        const bgNode = new Node('CardBg');
        const bgut = bgNode.addComponent(UITransform);
        bgut.setContentSize(w, h);
        bgut.setAnchorPoint(0.5, 0.5);
        bgNode.setPosition(0, 0, 0);
        const bg = bgNode.addComponent(Graphics);
        bg.fillColor = new Color(qColor.r * 0.06, qColor.g * 0.06, qColor.b * 0.06, 240);
        bg.roundRect(-w / 2, -h / 2, w, h, 10);
        bg.fill();
        bg.strokeColor = qColor;
        bg.lineWidth = 2;
        bg.roundRect(-w / 2, -h / 2, w, h, 10);
        bg.stroke();
        // 顶部品质色条
        bg.fillColor = new Color(qColor.r, qColor.g, qColor.b, 120);
        bg.roundRect(-w / 2 + 8, h / 2 - 3, w - 16, 3, 1);
        bg.fill();
        card.insertChild(bgNode, 0);

        // 兵种形状
        const shapeSize = Math.min(w, h) * 0.28;
        const shapeNode = new Node('Shape');
        const sut = shapeNode.addComponent(UITransform);
        sut.setContentSize(shapeSize, shapeSize);
        sut.setAnchorPoint(0.5, 0.5);
        shapeNode.setPosition(0, h * 0.15, 0);
        const sg = shapeNode.addComponent(Graphics);
        sg.fillColor = qColor;
        const shape = ROLE_SHAPES[result.config.role] || 'circle';
        drawShape(sg, shape, shapeSize);
        sg.fill();
        card.addChild(shapeNode);

        // 兵种名
        const nameSize = w < 120 ? 12 : 16;
        this.addLabel(card, result.config.name, nameSize, WHITE, 0, -h * 0.15, w - 8, true);

        // 品质标签
        this.addLabel(card, QUALITY_NAMES[result.quality], w < 120 ? 10 : 13, qColor, 0, -h * 0.32, w - 8, true);

        // NEW 标记
        if (result.isNew) {
            this.addLabel(card, '★ 新', w < 120 ? 10 : 12, GOLD, 0, h * 0.38, w, true);
        }

        return card;
    }

    /** 品质爆发粒子 */
    private spawnQualityBurst(card: Node, quality: Quality): void {
        if (!card || !card.isValid) return;
        const color = QUALITY_COLORS[quality] || GOLD;
        const count = quality === Quality.GOLD ? 12 : 8;

        for (let i = 0; i < count; i++) {
            const p = new Node('Particle');
            const put = p.addComponent(UITransform);
            put.setContentSize(6, 6);
            put.setAnchorPoint(0.5, 0.5);
            const pg = p.addComponent(Graphics);
            pg.fillColor = color;
            pg.circle(0, 0, 3);
            pg.fill();
            p.setPosition(0, 0, 0);
            p.layer = Layers.Enum.UI_2D;
            card.addChild(p);

            const angle = (i / count) * Math.PI * 2;
            const dist = 40 + Math.random() * 30;
            const tx = Math.cos(angle) * dist;
            const ty = Math.sin(angle) * dist;

            tween(p)
                .to(0.5, { scale: new Vec3(0.3, 0.3, 1) }, { easing: 'sineIn' })
                .start();
            tween(p)
                .to(0.5, { position: new Vec3(tx, ty, 0) }, { easing: 'sineOut' })
                .call(() => p.destroy())
                .start();
            const op = p.addComponent(UIOpacity);
            tween(op).to(0.5, { opacity: 0 }).start();
        }
    }

    // ---- 圣物抽卡动画 ----

    private playRelicPullAnimation(results: RelicGachaResult[]): void {
        // 隐藏按钮
        if (this._btnSingle) this._btnSingle.active = false;
        if (this._btnTen) this._btnTen.active = false;

        const circle = this._circleNode;
        const glow = this._glowNode;

        tween(circle!)
            .to(0.5, { scale: new Vec3(1.5, 1.5, 1) }, { easing: 'sineIn' })
            .to(0.5, { scale: new Vec3(2.0, 2.0, 1) }, { easing: 'sineIn' })
            .start();

        setTimeout(() => this.spawnRelicStars(results), 800);
    }

    private spawnRelicStars(results: RelicGachaResult[]): void {
        if (!this._container) return;
        const parent = new Node('StarBurst');
        const put = parent.addComponent(UITransform);
        put.setContentSize(10, 10);
        put.setAnchorPoint(0.5, 0.5);
        parent.setPosition(0, 20, 0);
        this._container.addChild(parent);
        parent.layer = Layers.Enum.UI_2D;

        const STAR_COLORS = [
            new Color(255, 215, 0, 255), new Color(255, 255, 255, 255),
            new Color(255, 240, 180, 255), new Color(100, 160, 255, 255),
        ];
        const COUNT = 24;

        for (let i = 0; i < COUNT; i++) {
            const dot = new Node(`Star${i}`);
            dot.addComponent(UITransform).setContentSize(10, 10);
            dot.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
            const dg = dot.addComponent(Graphics);
            dg.fillColor = STAR_COLORS[i % STAR_COLORS.length];
            dg.circle(0, 0, 2 + Math.random() * 4);
            dg.fill();
            dot.setPosition(0, 0, 0);
            parent.addChild(dot);
            dot.layer = Layers.Enum.UI_2D;

            const angle = (i / COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const dist = 120 + Math.random() * 200;
            const dur = 0.4 + Math.random() * 0.3;
            const op = dot.addComponent(UIOpacity);
            op.opacity = 255;
            tween(dot).to(dur, { position: new Vec3(Math.cos(angle) * dist, Math.sin(angle) * dist, 0) }, { easing: 'quadOut' }).start();
            tween(op).delay(dur * 0.4).to(dur * 0.6, { opacity: 0 }).start();
        }

        const circle = this._circleNode;
        const glow = this._glowNode;
        if (glow) tween(glow.getComponent(UIOpacity) || glow.addComponent(UIOpacity)).to(0.3, { opacity: 0 }).start();
        if (circle) {
            const cop = circle.getComponent(UIOpacity) || circle.addComponent(UIOpacity);
            tween(cop).to(0.3, { opacity: 0 }).call(() => {
                circle.active = false; cop.opacity = 255;
                if (glow) { glow.active = false; glow.getComponent(UIOpacity)!.opacity = 255; }
            }).start();
        }

        setTimeout(() => { parent.destroy(); this.showRelicResults(results); }, 500);
    }

    private showRelicResults(results: RelicGachaResult[]): void {
        const SW = this._SW, SH = this._SH;

        const overlay = new Node('ResultOverlay');
        overlay.addComponent(UITransform).setContentSize(SW, SH);
        overlay.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
        overlay.setPosition(0, 0, 0);
        const og = overlay.addComponent(Graphics);
        og.fillColor = new Color(10, 10, 30, 220);
        og.rect(-SW / 2, -SH / 2, SW, SH);
        og.fill();
        overlay.addComponent(UIOpacity).opacity = 0;

        const isSingle = results.length === 1;
        const cardW = isSingle ? 180 : 120;
        const cardH = isSingle ? 240 : 165;
        const gap = 14;
        const cols = isSingle ? 1 : 5;
        const rows = Math.ceil(results.length / cols);
        const totalW = cols * cardW + (cols - 1) * gap;
        const totalH = rows * cardH + (rows - 1) * gap;
        const startX = -totalW / 2 + cardW / 2;
        const startY = totalH / 2 - cardH / 2 + 20;

        const RELIC_QUALITY_COLORS: Record<string, Color> = {
            green: new Color(80, 200, 120, 255), blue: new Color(80, 160, 255, 255),
            purple: new Color(180, 80, 255, 255), gold: new Color(255, 215, 0, 255),
        };

        for (let i = 0; i < results.length; i++) {
            const r = i % cols;
            const row = Math.floor(i / cols);
            const cx = startX + r * (cardW + gap);
            const cy = startY - row * (cardH + gap);

            const card = new Node(`RelicCard_${i}`);
            card.addComponent(UITransform).setContentSize(cardW, cardH);
            card.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);

            const qColor = RELIC_QUALITY_COLORS[results[i].quality] || GRAY_TEXT;

            // 背景（品质色淡底）
            const bgNode = new Node('CardBg');
            bgNode.addComponent(UITransform).setContentSize(cardW, cardH);
            bgNode.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
            bgNode.setPosition(0, 0, 0);
            const bg = bgNode.addComponent(Graphics);
            bg.fillColor = new Color(qColor.r * 0.06, qColor.g * 0.06, qColor.b * 0.06, 240);
            bg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
            bg.fill();
            bg.strokeColor = qColor;
            bg.lineWidth = 2;
            bg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 10);
            bg.stroke();
            // 顶部品质色条
            bg.fillColor = new Color(qColor.r, qColor.g, qColor.b, 120);
            bg.roundRect(-cardW / 2 + 8, cardH / 2 - 3, cardW - 16, 3, 1);
            bg.fill();
            card.insertChild(bgNode, 0);

            // 圣物图标（六边形）
            const iconSize = cardW * 0.25;
            const iconNode = new Node('RelicIcon');
            iconNode.addComponent(UITransform).setContentSize(iconSize, iconSize);
            iconNode.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
            iconNode.setPosition(0, cardH * 0.18, 0);
            const ig = iconNode.addComponent(Graphics);
            ig.fillColor = qColor;
            const hr = iconSize * 0.45;
            ig.moveTo(0, hr);
            for (let j = 1; j <= 6; j++) {
                const a = j * Math.PI / 3;
                ig.lineTo(Math.sin(a) * hr, Math.cos(a) * hr);
            }
            ig.close();
            ig.fill();
            card.addChild(iconNode);

            // 名称
            const nameSize = cardW < 120 ? 12 : 16;
            this.addLabel(card, results[i].configName, nameSize, WHITE, 0, -cardH * 0.08, cardW - 8, true);

            // 主属性
            const mainStat = results[i].relic.mainStat;
            const statName = STAT_NAMES[mainStat.stat] || mainStat.stat;
            this.addLabel(card, `${statName}+${mainStat.value.toFixed(1)}%`, cardW < 120 ? 10 : 12, qColor, 0, -cardH * 0.24, cardW - 8, true);

            // 品质标签
            const qNames: Record<string, string> = { green: '普通', blue: '稀有', purple: '史诗', gold: '传说' };
            this.addLabel(card, qNames[results[i].quality] || results[i].quality, cardW < 120 ? 10 : 13, qColor, 0, -cardH * 0.38, cardW - 8, true);

            card.setPosition(cx, cy, 0);
            card.setScale(0, 0, 1);
            overlay.addChild(card);

            const delay = i * 80;
            tween(card)
                .delay(delay / 1000)
                .to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                .start();
        }

        // 确认按钮
        const confirmBtn = this.createRoundBtn('确  认', 160, 50, GOLD, BACK_TEXT);
        confirmBtn.setPosition(0, startY - rows * (cardH + gap) - 30, 0);
        confirmBtn.on(Node.EventType.TOUCH_END, () => {
            overlay.destroy();
            this._pulling = false;
            if (this._btnSingle) this._btnSingle.active = true;
            if (this._btnTen) this._btnTen.active = true;
            if (this._circleNode) { this._circleNode.active = true; this._circleNode.setScale(1, 1, 1); }
            if (this._glowNode) this._glowNode.active = true;
        }, this);
        overlay.addChild(confirmBtn);

        if (this._container) this._container.addChild(overlay);

        const setLayer = (n: Node) => { n.layer = Layers.Enum.UI_2D; n.children.forEach(setLayer); };
        setLayer(overlay);
        tween(overlay.getComponent(UIOpacity)!).to(0.2, { opacity: 255 }).start();
    }

    // ---- UI Helpers ----

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

    private createRoundBtn(text: string, w: number, h: number, bgColor: Color, textColor: Color): Node {
        const btn = new Node('Btn');
        const but = btn.addComponent(UITransform);
        but.setContentSize(w, h);
        but.setAnchorPoint(0.5, 0.5);

        const bg = new Node('BtnBg');
        const bgut = bg.addComponent(UITransform);
        bgut.setContentSize(w, h);
        bgut.setAnchorPoint(0.5, 0.5);
        bg.setPosition(0, 0, 0);
        const g = bg.addComponent(Graphics);
        g.fillColor = bgColor;
        g.roundRect(-w / 2, -h / 2, w, h, h / 2);
        g.fill();
        btn.insertChild(bg, 0);

        btn.addComponent(UIOpacity);
        this.addLabel(btn, text, 16, textColor, 0, 0, w, true);
        return btn;
    }

    private createPullBtn(text: string, w: number, h: number, bgColor: Color, borderColor: Color): Node {
        const btn = new Node('PullBtn');
        const but = btn.addComponent(UITransform);
        but.setContentSize(w, h);
        but.setAnchorPoint(0.5, 0.5);

        const bg = new Node('BtnBg');
        const bgut = bg.addComponent(UITransform);
        bgut.setContentSize(w, h);
        bgut.setAnchorPoint(0.5, 0.5);
        bg.setPosition(0, 0, 0);
        const g = bg.addComponent(Graphics);
        g.fillColor = bgColor;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.fill();
        g.strokeColor = borderColor;
        g.lineWidth = 1;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.stroke();
        // 顶部色条
        g.fillColor = new Color(borderColor.r, borderColor.g, borderColor.b, 100);
        g.roundRect(-w / 2 + 16, h / 2 - 3, w - 32, 3, 1);
        g.fill();
        btn.insertChild(bg, 0);

        btn.addComponent(UIOpacity);

        // 多行文字用两个 Label
        const lines = text.split('\n');
        const topFS = this.mapFS(18);
        const botFS = this.mapFS(13);
        const lineH = (topFS + botFS) / 2 + 4;
        this.addLabel(btn, lines[0], 18, WHITE, 0, lineH / 2, w, true);
        if (lines[1]) {
            this.addLabel(btn, lines[1], 13, GOLD, 0, -lineH / 2, w, true);
        }

        return btn;
    }
}
