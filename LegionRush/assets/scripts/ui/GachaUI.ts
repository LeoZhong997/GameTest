/**
 * GachaUI - 抽卡界面
 * 瓶盖抽兵种，支持单抽和十连，附抽卡特效
 * 纯代码创建，挂载在 UIRoot 节点
 */

import { _decorator, Component, Node, Label, Graphics, UITransform, Color, UIOpacity, tween, Vec3, Layers, view, director } from 'cc';
import { EventBus } from '../core/EventBus';
import { PlayerManager } from '../systems/PlayerManager';
import { GachaSystem, GachaResult, GACHA_COST, GACHA_TEN_COST } from '../systems/GachaSystem';
import { Quality } from '../models/UnitData';
import { UnitShape, drawShape } from './UnitView';

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
    [Quality.GREEN]:  '普通',
    [Quality.BLUE]:   '稀有',
    [Quality.PURPLE]: '史诗',
    [Quality.GOLD]:   '传说',
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
        this.addLabel(topBar, '召 唤', 24, GOLD, 0, 0, 200, true);

        // Currency
        const capLbl = this.addLabel(topBar, '🍺 0', 15, WHITE, SW / 2 - 130, 0, 100, true);
        this._capLabel = capLbl.getComponent(Label);
        const tokenLbl = this.addLabel(topBar, '🪙 0', 15, WHITE, SW / 2 - 30, 0, 100, true);
        this._tokenLabel = tokenLbl.getComponent(Label);

        parent.addChild(topBar);
    }

    /** 召唤阵装饰 */
    private buildSummoningCircle(parent: Node): void {
        // 外层旋转圈
        const circleNode = new Node('SummonCircle');
        const cut = circleNode.addComponent(UITransform);
        cut.setContentSize(240, 240);
        cut.setAnchorPoint(0.5, 0.5);
        circleNode.setPosition(0, 20, 0);

        const gfx = circleNode.addComponent(Graphics);
        // 外圈
        gfx.strokeColor = CIRCLE_CLR;
        gfx.lineWidth = 2;
        gfx.circle(0, 0, 90);
        gfx.stroke();
        // 中圈
        gfx.circle(0, 0, 60);
        gfx.stroke();
        // 内六边形
        const r6 = 40;
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
            gfx.circle(Math.cos(a) * 75, Math.sin(a) * 75, 6);
            gfx.fill();
        }

        parent.addChild(circleNode);
        this._circleNode = circleNode;

        // 呼吸光晕
        const glowNode = new Node('Glow');
        const gut = glowNode.addComponent(UITransform);
        gut.setContentSize(200, 200);
        gut.setAnchorPoint(0.5, 0.5);
        glowNode.setPosition(0, 20, 0);
        const gg = glowNode.addComponent(Graphics);
        gg.fillColor = GLOW_CLR;
        gg.circle(0, 0, 50);
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

        const btnSingle = this.createPullBtn(`单抽 ×1\n🍺${GACHA_COST.bottleCaps} 或 🪙${GACHA_COST.tokens}`, 220, 64, new Color(15, 52, 96, 230), new Color(80, 160, 255, 220));
        btnSingle.setPosition(-125, btnY, 0);
        btnSingle.on(Node.EventType.TOUCH_END, this.onSinglePull, this);
        parent.addChild(btnSingle);
        this._btnSingle = btnSingle;

        const btnTen = this.createPullBtn(`十连 ×10\n🍺${GACHA_TEN_COST.bottleCaps} 或 🪙${GACHA_TEN_COST.tokens}`, 220, 64, new Color(60, 20, 80, 230), new Color(180, 80, 255, 220));
        btnTen.setPosition(125, btnY, 0);
        btnTen.on(Node.EventType.TOUCH_END, this.onTenPull, this);
        parent.addChild(btnTen);
        this._btnTen = btnTen;

        // 概率提示
        this.addLabel(parent, '普通55%  稀有30%  史诗12%  传说3%', 12, GRAY_TEXT, 0, btnY - 50, 400, true);
    }

    private refreshCap(): void {
        if (!PlayerManager.instance.isLoaded) return;
        const data = PlayerManager.instance.data;
        if (this._capLabel) this._capLabel.string = `🍺 ${data.bottleCaps}`;
        if (this._tokenLabel) this._tokenLabel.string = `🪙 ${data.tokens}`;
        this.updateBtnState();
    }

    private updateBtnState(): void {
        const d = PlayerManager.instance.isLoaded ? PlayerManager.instance.data : null;
        const caps = d ? d.bottleCaps : 0;
        const tokens = d ? d.tokens : 0;
        const canSingle = caps >= GACHA_COST.bottleCaps || tokens >= GACHA_COST.tokens;
        const canTen = caps >= GACHA_TEN_COST.bottleCaps || tokens >= GACHA_TEN_COST.tokens;
        if (this._btnSingle) this._btnSingle.getComponent(UIOpacity)!.opacity = canSingle ? 255 : 120;
        if (this._btnTen) this._btnTen.getComponent(UIOpacity)!.opacity = canTen ? 255 : 120;
    }

    // ---- Pull Logic ----

    private onSinglePull(): void { this.doPull(1); }
    private onTenPull(): void { this.doPull(10); }

    private doPull(count: number): void {
        if (this._pulling) return;
        const pm = PlayerManager.instance;
        if (!pm.isLoaded) return;

        const cost = count === 1 ? GACHA_COST : GACHA_TEN_COST;
        // 优先扣瓶盖，不够则扣筹码
        if (pm.data.bottleCaps >= cost.bottleCaps) {
            pm.spendCurrency('bottleCaps', cost.bottleCaps);
        } else if (pm.data.tokens >= cost.tokens) {
            pm.spendCurrency('tokens', cost.tokens);
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
        parent.setPosition(0, 20, 0);   // 与召唤阵同中心
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

        // 背景
        const bgNode = new Node('CardBg');
        const bgut = bgNode.addComponent(UITransform);
        bgut.setContentSize(w, h);
        bgut.setAnchorPoint(0.5, 0.5);
        bgNode.setPosition(0, 0, 0);
        const bg = bgNode.addComponent(Graphics);
        bg.fillColor = new Color(20, 24, 40, 240);
        bg.roundRect(-w / 2, -h / 2, w, h, 10);
        bg.fill();
        bg.strokeColor = qColor;
        bg.lineWidth = 2;
        bg.roundRect(-w / 2, -h / 2, w, h, 10);
        bg.stroke();
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
        g.lineWidth = 2;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.stroke();
        btn.insertChild(bg, 0);

        btn.addComponent(UIOpacity);

        // 多行文字用两个 Label
        const lines = text.split('\n');
        this.addLabel(btn, lines[0], 18, WHITE, 0, 10, w, true);
        if (lines[1]) {
            this.addLabel(btn, lines[1], 13, GOLD, 0, -10, w, true);
        }

        return btn;
    }
}
