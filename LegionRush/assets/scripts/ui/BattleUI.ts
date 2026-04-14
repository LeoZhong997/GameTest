/**
 * BattleUI - 战斗 HUD（自绑定模式）
 * 挂载在 UIRoot 节点，自动查找子节点
 * 结算面板样式参考 designs/battle-ui.pen
 */

import { _decorator, Component, Node, Label, Button, Color, Graphics, UITransform, UIOpacity, tween, Vec3, Layout } from 'cc';
import { BattleManager, BattleState, BattleResult, BattleReport } from '../battle/BattleManager';
import { EventBus } from '../core/EventBus';

const { ccclass } = _decorator;

// --- 设计参数 (匹配 battle-ui.pen) ---
const PANEL_W = 400;
const PANEL_H = 360;
const PANEL_R = 16;
const DETAIL_W = 300;
const BTN_W = 160;
const BTN_H = 48;
const BTN_R = 24;

const BG_COLOR     = new Color(26, 26, 46, 242);       // #1a1a2e ~95% 不透明
const GOLD         = new Color(255, 215, 0, 255);       // #FFD700
const LOSE_RED     = new Color(255, 68, 68, 255);       // 失败红色
const DIVIDER_CLR  = new Color(255, 255, 255, 51);      // 20% 白色
const DETAIL_CLR   = new Color(204, 204, 204, 255);     // #CCCCCC
const BTN_TEXT_CLR = new Color(26, 26, 46, 255);        // 金色按钮上的深色文字
const OVERLAY_CLR  = new Color(0, 0, 0, 153);           // 60% 黑色遮罩

@ccclass('BattleUI')
export class BattleUI extends Component {
    private timerLabel: Label = null!;
    private leftCountLabel: Label = null!;
    private rightCountLabel: Label = null!;
    private speedLabel: Label = null!;
    private resultPanel: Node = null!;
    private resultLabel: Label = null!;
    private resultDetailLabel: Label = null!;
    private btnRestart: Button = null!;

    private overlay: Node = null!;
    private panelGfx: Graphics | null = null;
    private btnGfx: Graphics | null = null;
    private btnStartNode: Node | null = null;

    private _bm: BattleManager = BattleManager.instance;

    onLoad() {
        // 自动绑定子节点
        this.timerLabel = this.node.getChildByName('TimerLabel')?.getComponent(Label)!;
        this.leftCountLabel = this.node.getChildByName('LeftCount')?.getComponent(Label)!;
        this.rightCountLabel = this.node.getChildByName('RightCount')?.getComponent(Label)!;
        this.speedLabel = this.node.getChildByName('SpeedLabel')?.getComponent(Label)!;

        this.resultPanel = this.node.getChildByName('ResultPanel')!;
        if (this.resultPanel) {
            this.resultLabel = this.resultPanel.getChildByName('ResultLabel')?.getComponent(Label)!;
            this.resultDetailLabel = this.resultPanel.getChildByName('ResultDetail')?.getComponent(Label)!;

            const btnNode = this.resultPanel.getChildByName('BtnRestart');
            if (btnNode) {
                this.btnRestart = btnNode.getComponent(Button)!;
                btnNode.on(Button.EventType.CLICK, this.onRestart, this);
            }

            this.setupResultPanel();
        }

        this.setupTopBar();
        this.setupStartButton();

        EventBus.instance.on('battle:end', this.onBattleEnd, this);
    }

    /** 构建结算面板的视觉效果 */
    private setupResultPanel(): void {
        // --- 面板容器 ---
        const pt = this.resultPanel.getComponent(UITransform)!;
        pt.setContentSize(PANEL_W, PANEL_H);
        pt.setAnchorPoint(0.5, 0.5);
        this.resultPanel.setPosition(0, 0, 0);

        // 禁用面板节点上多余的 Label
        const stray = this.resultPanel.getComponent(Label);
        if (stray) stray.enabled = false;

        // 面板背景 + 金色边框（必须用独立子节点，CC3 一个节点只能有一个 UIRenderer）
        const bgNode = new Node('PanelBg');
        const bgut = bgNode.addComponent(UITransform);
        bgut.setContentSize(PANEL_W, PANEL_H);
        bgut.setAnchorPoint(0.5, 0.5);
        bgNode.setPosition(0, 0, 0);
        this.panelGfx = bgNode.addComponent(Graphics);
        this.drawPanelBg(GOLD);
        // 作为第一个子节点，渲染在最后面
        this.resultPanel.insertChild(bgNode, 0);

        // --- 半透明遮罩 ---
        this.overlay = new Node('BattleOverlay');
        const ot = this.overlay.addComponent(UITransform);
        const parentUT = this.node.getComponent(UITransform);
        const sw = parentUT ? parentUT.contentSize.width : 1280;
        const sh = parentUT ? parentUT.contentSize.height : 720;
        ot.setContentSize(sw, sh);
        ot.setAnchorPoint(0.5, 0.5);
        this.overlay.setPosition(0, 0, 0);
        const og = this.overlay.addComponent(Graphics);
        og.fillColor = OVERLAY_CLR;
        og.rect(-sw / 2, -sh / 2, sw, sh);
        og.fill();
        this.overlay.addComponent(UIOpacity).opacity = 0;
        // 插到 ResultPanel 前面（渲染在下方）
        const rpIdx = this.node.children.indexOf(this.resultPanel);
        this.node.insertChild(this.overlay, rpIdx);
        this.overlay.active = false;

        // --- 子节点 Y 坐标（手动居中） ---
        const topY = PANEL_H / 2 - 40;                           // 140
        const yLabel   = topY - 25;                               // 115
        const yDivider = topY - 50 - 18 - 1;                      // 71
        const yDetail  = topY - 50 - 18 - 2 - 18 - 40;           // 12
        const yButton  = -(PANEL_H / 2 - 40 - 24);               // -116

        // --- ResultLabel 标题 ---
        if (this.resultLabel) {
            const lt = this.resultLabel.node.getComponent(UITransform)!;
            lt.setAnchorPoint(0.5, 0.5);
            this.resultLabel.fontSize = 42;
            this.resultLabel.isBold = true;
            this.resultLabel.color = GOLD;
            this.resultLabel.enableOutline = true;
            this.resultLabel.outlineColor = new Color(0, 0, 0, 180);
            this.resultLabel.outlineWidth = 3;
            this.resultLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            this.resultLabel.lineHeight = 50;
            this.resultLabel.node.setPosition(0, yLabel, 0);
        }

        // --- 分隔线 ---
        const divider = new Node('ResultDivider');
        const dvt = divider.addComponent(UITransform);
        dvt.setContentSize(DETAIL_W, 2);
        dvt.setAnchorPoint(0.5, 0.5);
        const dg = divider.addComponent(Graphics);
        dg.fillColor = DIVIDER_CLR;
        dg.rect(-DETAIL_W / 2, -1, DETAIL_W, 2);
        dg.fill();
        divider.setPosition(0, yDivider, 0);
        this.resultPanel.insertChild(divider, 1); // ResultLabel 和 ResultDetail 之间

        // --- ResultDetail 详情 ---
        if (this.resultDetailLabel) {
            const dlt = this.resultDetailLabel.node.getComponent(UITransform)!;
            dlt.setContentSize(DETAIL_W, 100);
            dlt.setAnchorPoint(0.5, 0.5);
            this.resultDetailLabel.fontSize = 20;
            this.resultDetailLabel.lineHeight = 32;
            this.resultDetailLabel.color = DETAIL_CLR;
            this.resultDetailLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            this.resultDetailLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
            this.resultDetailLabel.enableWrapText = true;
            this.resultDetailLabel.node.setPosition(0, yDetail, 0);
        }

        // --- BtnRestart 按钮 ---
        if (this.btnRestart) {
            const btnNode = this.btnRestart.node;
            const bt = btnNode.getComponent(UITransform)!;
            bt.setContentSize(BTN_W, BTN_H);
            bt.setAnchorPoint(0.5, 0.5);
            btnNode.setPosition(0, yButton, 0);

            // 金色圆角按钮背景（独立子节点，避免和 Label 冲突）
            const btnBg = new Node('BtnBg');
            const bbgut = btnBg.addComponent(UITransform);
            bbgut.setContentSize(BTN_W, BTN_H);
            bbgut.setAnchorPoint(0.5, 0.5);
            btnBg.setPosition(0, 0, 0);
            this.btnGfx = btnBg.addComponent(Graphics);
            this.btnGfx.fillColor = GOLD;
            this.btnGfx.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, BTN_R);
            this.btnGfx.fill();
            btnNode.insertChild(btnBg, 0);

            // 按钮文字（也用独立子节点，渲染在背景之上）
            const oldLabel = btnNode.getComponent(Label);
            if (oldLabel) oldLabel.enabled = false;
            const btnTextNode = new Node('BtnText');
            const txtut = btnTextNode.addComponent(UITransform);
            txtut.setContentSize(BTN_W, BTN_H);
            txtut.setAnchorPoint(0.5, 0.5);
            btnTextNode.setPosition(0, 0, 0);
            const txt = btnTextNode.addComponent(Label);
            txt.string = '再来一局';
            txt.fontSize = 20;
            txt.isBold = true;
            txt.color = BTN_TEXT_CLR;
            txt.horizontalAlign = Label.HorizontalAlign.CENTER;
            txt.verticalAlign = Label.VerticalAlign.CENTER;
            btnNode.addChild(btnTextNode);

            this.btnRestart.transition = Button.Transition.SCALE;
            this.btnRestart.zoomScale = 0.9;
        }

        this.resultPanel.active = false;
    }

    /** 构建 TopBar（蓝方/计时器/红方）匹配设计图 */
    private setupTopBar(): void {
        const parentUT = this.node.getComponent(UITransform);
        const SW = parentUT ? parentUT.contentSize.width : 1280;
        const SH = parentUT ? parentUT.contentSize.height : 720;
        const TB_W = SW, TB_H = 50;
        const TB_BG = new Color(15, 52, 96, 230);       // #0f3460 90%
        const BOX_BG = new Color(26, 26, 46, 255);       // #1a1a2e
        const BLUE = new Color(74, 144, 217, 255);       // #4A90D9
        const RED = new Color(217, 74, 74, 255);          // #D94A4A
        const BLUE_NAME = new Color(160, 196, 255, 255);  // #A0C4FF
        const RED_NAME = new Color(255, 176, 176, 255);   // #FFB0B0

        // --- TopBar 容器 ---
        const topBar = new Node('TopBar');
        const topUt = topBar.addComponent(UITransform);
        topUt.setContentSize(TB_W, TB_H);
        topUt.setAnchorPoint(0.5, 0.5);
        topBar.setPosition(0, SH / 2 - TB_H / 2, 0);

        // TopBar 背景（渲染在最底层）
        const topBg = new Node('TopBarBg');
        const topBgUt = topBg.addComponent(UITransform);
        topBgUt.setContentSize(TB_W, TB_H);
        topBgUt.setAnchorPoint(0.5, 0.5);
        topBg.setPosition(0, 0, 0);
        const topBgGfx = topBg.addComponent(Graphics);
        topBgGfx.fillColor = TB_BG;
        topBgGfx.rect(-TB_W / 2, -TB_H / 2, TB_W, TB_H);
        topBgGfx.fill();
        topBar.addChild(topBg);

        // === 左侧: 蓝色圆 + 计数 + "蓝方" (手动定位) ===
        const leftBaseX = -SW / 2 + 50;

        // 蓝色圆图标
        const liNode = new Node('LeftIcon');
        const liUt = liNode.addComponent(UITransform);
        liUt.setContentSize(28, 28);
        liUt.setAnchorPoint(0.5, 0.5);
        liNode.setPosition(leftBaseX, 0, 0);
        const liGfx = liNode.addComponent(Graphics);
        liGfx.fillColor = BLUE;
        liGfx.circle(0, 0, 14);
        liGfx.fill();
        topBar.addChild(liNode);

        // 蓝方计数
        if (this.leftCountLabel) {
            this.leftCountLabel.node.removeFromParent();
            const lt = this.leftCountLabel.node.getComponent(UITransform)!;
            lt.setContentSize(80, 30);
            lt.setAnchorPoint(0.5, 0.5);
            this.leftCountLabel.fontSize = 18;
            this.leftCountLabel.isBold = true;
            this.leftCountLabel.color = Color.WHITE;
            this.leftCountLabel.node.setPosition(leftBaseX + 40, 0, 0);
            topBar.addChild(this.leftCountLabel.node);
        }

        // "蓝方" 文字
        const leftName = new Node('LeftName');
        const lnUt = leftName.addComponent(UITransform);
        lnUt.setContentSize(40, 20);
        lnUt.setAnchorPoint(0.5, 0.5);
        leftName.setPosition(leftBaseX + 90, 0, 0);
        const lnLbl = leftName.addComponent(Label);
        lnLbl.string = '蓝方';
        lnLbl.fontSize = 14;
        lnLbl.color = BLUE_NAME;
        lnLbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        topBar.addChild(leftName);

        // === 中间: TimerBox (深色背景 + ⏱ + 时间) ===
        const timerBox = new Node('TimerBox');
        const tbUt = timerBox.addComponent(UITransform);
        tbUt.setContentSize(130, 36);
        tbUt.setAnchorPoint(0.5, 0.5);
        timerBox.setPosition(0, 0, 0);

        // TimerBox 背景
        const tbBg = new Node('TimerBoxBg');
        const tbBgUt = tbBg.addComponent(UITransform);
        tbBgUt.setContentSize(130, 36);
        tbBgUt.setAnchorPoint(0.5, 0.5);
        tbBg.setPosition(0, 0, 0);
        const tbBgGfx = tbBg.addComponent(Graphics);
        tbBgGfx.fillColor = BOX_BG;
        tbBgGfx.roundRect(-65, -18, 130, 36, 8);
        tbBgGfx.fill();
        timerBox.addChild(tbBg);

        // ⏱ 图标
        const timerIcon = new Node('TimerIcon');
        const tiUt = timerIcon.addComponent(UITransform);
        tiUt.setContentSize(20, 20);
        tiUt.setAnchorPoint(0.5, 0.5);
        timerIcon.setPosition(-20, 0, 0);
        const tiLbl = timerIcon.addComponent(Label);
        tiLbl.string = '⏱';
        tiLbl.fontSize = 16;
        tiLbl.color = GOLD;
        timerBox.addChild(timerIcon);

        // TimerLabel
        if (this.timerLabel) {
            this.timerLabel.node.removeFromParent();
            const ttut = this.timerLabel.node.getComponent(UITransform)!;
            ttut.setContentSize(70, 30);
            ttut.setAnchorPoint(0.5, 0.5);
            this.timerLabel.fontSize = 20;
            this.timerLabel.isBold = true;
            this.timerLabel.color = GOLD;
            this.timerLabel.node.setPosition(20, 0, 0);
            timerBox.addChild(this.timerLabel.node);
        }

        topBar.addChild(timerBox);

        // === 右侧: "红方" + 红色圆 + 计数 (手动定位) ===
        const rightBaseX = SW / 2 - 50;

        // "红方" 文字
        const rightName = new Node('RightName');
        const rnUt = rightName.addComponent(UITransform);
        rnUt.setContentSize(40, 20);
        rnUt.setAnchorPoint(0.5, 0.5);
        rightName.setPosition(rightBaseX - 90, 0, 0);
        const rnLbl = rightName.addComponent(Label);
        rnLbl.string = '红方';
        rnLbl.fontSize = 14;
        rnLbl.color = RED_NAME;
        rnLbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        topBar.addChild(rightName);

        // 红色圆图标
        const riNode = new Node('RightIcon');
        const riUt = riNode.addComponent(UITransform);
        riUt.setContentSize(28, 28);
        riUt.setAnchorPoint(0.5, 0.5);
        riNode.setPosition(rightBaseX - 40, 0, 0);
        const riGfx = riNode.addComponent(Graphics);
        riGfx.fillColor = RED;
        riGfx.circle(0, 0, 14);
        riGfx.fill();
        topBar.addChild(riNode);

        // 红方计数
        if (this.rightCountLabel) {
            this.rightCountLabel.node.removeFromParent();
            const rt = this.rightCountLabel.node.getComponent(UITransform)!;
            rt.setContentSize(80, 30);
            rt.setAnchorPoint(0.5, 0.5);
            this.rightCountLabel.fontSize = 18;
            this.rightCountLabel.isBold = true;
            this.rightCountLabel.color = Color.WHITE;
            this.rightCountLabel.node.setPosition(rightBaseX, 0, 0);
            topBar.addChild(this.rightCountLabel.node);
        }

        // SpeedLabel
        if (this.speedLabel) {
            this.speedLabel.node.removeFromParent();
            const sut = this.speedLabel.node.getComponent(UITransform)!;
            sut.setContentSize(50, 20);
            sut.setAnchorPoint(0.5, 0.5);
            this.speedLabel.fontSize = 14;
            this.speedLabel.isBold = true;
            this.speedLabel.color = Color.WHITE;
            this.speedLabel.node.setPosition(SW / 2 - 60, -35, 0);
            topBar.addChild(this.speedLabel.node);
        }

        // TopBarBg 渲染在最底层：先移到最后再 insertChild(0)
        topBg.removeFromParent();
        topBar.insertChild(topBg, 0);

        this.node.addChild(topBar);
    }

    private drawPanelBg(border: Color): void {
        if (!this.panelGfx) return;
        const g = this.panelGfx;
        g.clear();
        // 深色背景
        g.fillColor = BG_COLOR;
        g.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, PANEL_R);
        g.fill();
        // 主题色边框
        g.strokeColor = border;
        g.lineWidth = 2;
        g.roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, PANEL_R);
        g.stroke();
    }

    update(dt: number) {
        if (this._bm.state !== BattleState.RUNNING) return;

        if (this.timerLabel) {
            const remaining = Math.max(0, this._bm.timeLimit - this._bm.battleTime);
            this.timerLabel.string = remaining.toFixed(1) + 's';
            this.timerLabel.color = remaining < 5 ? Color.RED : Color.WHITE;
        }

        if (this.leftCountLabel) {
            const alive = this._bm.leftUnits.filter(u => u.isAlive).length;
            this.leftCountLabel.string = `${alive}/${this._bm.leftUnits.length}`;
        }

        if (this.rightCountLabel) {
            const alive = this._bm.rightUnits.filter(u => u.isAlive).length;
            this.rightCountLabel.string = `${alive}/${this._bm.rightUnits.length}`;
        }

        if (this.speedLabel) {
            this.speedLabel.string = `${this._bm.battleSpeed.toFixed(1)}x`;
        }
    }

    onDestroy() {
        EventBus.instance.off('battle:end', this.onBattleEnd, this);
    }

    private onBattleEnd(report: BattleReport): void {
        // 遮罩淡入
        if (this.overlay) {
            this.overlay.active = true;
            const ovOp = this.overlay.getComponent(UIOpacity);
            if (ovOp) {
                ovOp.opacity = 0;
                tween(ovOp).to(0.3, { opacity: 255 }).start();
            }
        }

        // 面板弹出动画
        if (this.resultPanel) {
            this.resultPanel.active = true;
            this.resultPanel.setScale(0.5, 0.5, 1);
            tween(this.resultPanel)
                .to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                .start();
        }

        // 根据结果设置主题色
        if (this.resultLabel) {
            const text = report.result === BattleResult.WIN ? '胜 利 !' :
                         report.result === BattleResult.LOSE ? '失 败 !' : '平 局';
            this.resultLabel.string = text;

            const theme = report.result === BattleResult.WIN ? GOLD :
                          report.result === BattleResult.LOSE ? LOSE_RED : GOLD;
            this.resultLabel.color = theme;
            this.drawPanelBg(theme);
        }

        // 详情文本
        if (this.resultDetailLabel) {
            let detail = `用时 ${report.duration.toFixed(1)}s\n`;
            detail += `存活 ${report.leftSurvivors} vs ${report.rightSurvivors}\n`;
            if (report.mvp) {
                detail += `MVP: ${report.mvp.config.name}\n伤害: ${report.mvp.damageDealt} 击杀: ${report.mvp.kills}`;
            }
            this.resultDetailLabel.string = detail;
        }
    }

    onRestart(): void {
        if (this.overlay) this.overlay.active = false;
        if (this.resultPanel) this.resultPanel.active = false;
        if (this.btnStartNode) this.btnStartNode.active = true;
        EventBus.instance.emit('battle:restart');
    }

    /** 构建开战按钮（居中，金色圆角） */
    private setupStartButton(): void {
        const parentUT = this.node.getComponent(UITransform);
        const sw = parentUT ? parentUT.contentSize.width : 1280;
        const sh = parentUT ? parentUT.contentSize.height : 720;

        const btnNode = new Node('BtnStart');
        const bt = btnNode.addComponent(UITransform);
        bt.setContentSize(BTN_W, BTN_H);
        bt.setAnchorPoint(0.5, 0.5);
        btnNode.setPosition(0, 0, 0);

        // 金色背景
        const bg = new Node('StartBg');
        const bgut = bg.addComponent(UITransform);
        bgut.setContentSize(BTN_W, BTN_H);
        bgut.setAnchorPoint(0.5, 0.5);
        bg.setPosition(0, 0, 0);
        const gfx = bg.addComponent(Graphics);
        gfx.fillColor = GOLD;
        gfx.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, BTN_R);
        gfx.fill();
        btnNode.insertChild(bg, 0);

        // 文字
        const txtNode = new Node('StartText');
        const txtut = txtNode.addComponent(UITransform);
        txtut.setContentSize(BTN_W, BTN_H);
        txtut.setAnchorPoint(0.5, 0.5);
        txtNode.setPosition(0, 0, 0);
        const txt = txtNode.addComponent(Label);
        txt.string = '开  战';
        txt.fontSize = 22;
        txt.isBold = true;
        txt.color = BTN_TEXT_CLR;
        txt.horizontalAlign = Label.HorizontalAlign.CENTER;
        txt.verticalAlign = Label.VerticalAlign.CENTER;
        btnNode.addChild(txtNode);

        // 按钮交互
        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.9;
        btnNode.on(Button.EventType.CLICK, this.onStartBattle, this);

        this.node.addChild(btnNode);
        this.btnStartNode = btnNode;
    }

    private onStartBattle(): void {
        if (this.btnStartNode) this.btnStartNode.active = false;
        EventBus.instance.emit('battle:start_request');
    }
}
