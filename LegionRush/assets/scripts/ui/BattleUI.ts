/**
 * BattleUI - 战斗 HUD（自绑定模式）
 * 挂载在 UIRoot 节点，自动查找子节点
 * 结算面板样式参考 designs/battle-ui.pen
 */

import { _decorator, Component, Node, Label, Button, Color, Graphics, UITransform, UIOpacity, tween, Vec3, Layout } from 'cc';
import { BattleManager, BattleState, BattleResult, BattleReport } from '../battle/BattleManager';
import { BattleUnit, TeamSide } from '../battle/Unit';
import { EventBus } from '../core/EventBus';
import { PlayerManager } from '../systems/PlayerManager';
import { StageManager } from '../systems/StageManager';

const { ccclass } = _decorator;

// --- 设计参数 ---
const PANEL_W = 620;
const PANEL_H = 540;
const PANEL_R = 16;
const DETAIL_W = 480;
const BTN_W = 180;
const BTN_H = 52;
const BTN_R = 24;

// --- 柱状图参数（双列并排） ---
const COL_W = 270;          // 每列宽度
const COL_BAR_W = 110;      // 柱子宽度
const BAR_H = 14;
const BAR_GAP = 3;
const BAR_ROW_H = 40;
const BAR_NAME_W = 46;
const LEFT_COL_X = -295;    // 蓝方列起始 X
const RIGHT_COL_X = 25;     // 红方列起始 X

const BG_COLOR     = new Color(26, 26, 46, 242);       // #1a1a2e ~95% 不透明
const GOLD         = new Color(255, 215, 0, 255);       // #FFD700
const LOSE_RED     = new Color(255, 68, 68, 255);       // 失败红色
const DIVIDER_CLR  = new Color(255, 255, 255, 51);      // 20% 白色
const DETAIL_CLR   = new Color(204, 204, 204, 255);     // #CCCCCC
const BTN_TEXT_CLR = new Color(26, 26, 46, 255);        // 金色按钮上的深色文字
const OVERLAY_CLR  = new Color(0, 0, 0, 153);           // 60% 黑色遮罩
const DMG_COLOR    = new Color(255, 160, 50, 255);      // 伤害柱 - 橙色
const TANK_COLOR   = new Color(80, 180, 220, 255);      // 承伤柱 - 青蓝
const BAR_BG       = new Color(40, 40, 55, 255);        // 柱子背景槽
const BLUE_HEADER  = new Color(120, 180, 255, 255);     // 蓝方统计标题
const RED_HEADER   = new Color(255, 140, 140, 255);     // 红方统计标题

/** 兵种聚合统计 */
interface TypeStats {
    name: string;
    damageDealt: number;
    damageTaken: number;
    dmgPct: number;
    tankPct: number;
}

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
    private btnPauseLabel: Label | null = null;
    private btnSpeedLabel: Label | null = null;
    private pauseOverlay: Node | null = null;
    private pauseTextLabel: Label | null = null;

    private _bm: BattleManager = BattleManager.instance;
    private _speedOptions: number[] = [1, 2, 3, 4];
    private _speedIndex: number = 0;
    private _statsNodes: Node[] = [];
    private _lastResult: BattleResult = BattleResult.WIN;
    private _btnTextLabel: Label | null = null;
    private _stageLabel: Label | null = null;

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

        // 开战按钮初始隐藏，等布阵确认后再显示
        if (this.btnStartNode) this.btnStartNode.active = false;

        EventBus.instance.on('battle:end', this.onBattleEnd, this);
        EventBus.instance.on('battle:deploy', this.onDeployConfirmed, this);
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

        // --- 子节点 Y 坐标 ---
        const topY = PANEL_H / 2 - 30;                           // 220
        const yLabel   = topY - 22;                               // 198
        const yDivider = yLabel - 28;                             // 170
        const yDetail  = yDivider - 10 - 28;                      // 132
        const yButton  = -(PANEL_H / 2 - 30);                    // -220 (会被 onBattleEnd 动态调整)

        // --- ResultLabel 标题 ---
        if (this.resultLabel) {
            const lt = this.resultLabel.node.getComponent(UITransform)!;
            lt.setAnchorPoint(0.5, 0.5);
            this.resultLabel.fontSize = 40;
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
        this.resultPanel.insertChild(divider, 1);

        // --- ResultDetail 详情 ---
        if (this.resultDetailLabel) {
            const dlt = this.resultDetailLabel.node.getComponent(UITransform)!;
            dlt.setContentSize(DETAIL_W, 100);
            dlt.setAnchorPoint(0.5, 0.5);
            this.resultDetailLabel.fontSize = 20;
            this.resultDetailLabel.lineHeight = 28;
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
            this._btnTextLabel = txt;

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

        // "蓝方" 右侧: 关卡名称
        const stageLbl = new Node('StageLabel');
        const slut = stageLbl.addComponent(UITransform);
        slut.setContentSize(160, 20);
        slut.setAnchorPoint(0, 0.5);
        stageLbl.setPosition(leftBaseX + 115, 0, 0);
        const sl = stageLbl.addComponent(Label);
        sl.fontSize = 14;
        sl.color = new Color(255, 230, 150, 255);
        sl.horizontalAlign = Label.HorizontalAlign.LEFT;
        this._stageLabel = sl;
        this.updateStageLabel();
        topBar.addChild(stageLbl);

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
            this.speedLabel.node.active = false; // 不再使用静态 label，用按钮替代
        }

        // TopBarBg 渲染在最底层：先移到最后再 insertChild(0)
        topBg.removeFromParent();
        topBar.insertChild(topBg, 0);

        // === TimerBox 两侧控制按钮: 暂停(左) + 倍速(右) ===
        const timerBoxEdgeL = -65;   // TimerBox 左边缘
        const timerBoxEdgeR = 65;    // TimerBox 右边缘
        const btnGap = 10;           // 按钮与 TimerBox 的间距

        // 暂停按钮（TimerBox 左侧）
        const pauseBtn = this.createCtrlBtn('⏸', 40, 40, 20);
        pauseBtn.setPosition(timerBoxEdgeL - btnGap - 20, 0, 0);
        pauseBtn.on(Node.EventType.TOUCH_END, this.onPauseToggle, this);
        this.btnPauseLabel = pauseBtn.getChildByName('CtrlBtnText')?.getComponent(Label) ?? null;
        topBar.addChild(pauseBtn);

        // 倍速按钮（TimerBox 右侧）
        const speedBtn = this.createCtrlBtn(`${this._speedOptions[this._speedIndex]}x`, 64, 34, 8);
        speedBtn.setPosition(timerBoxEdgeR + btnGap + 32, 0, 0);
        speedBtn.on(Node.EventType.TOUCH_END, this.onSpeedToggle, this);
        this.btnSpeedLabel = speedBtn.getChildByName('CtrlBtnText')?.getComponent(Label) ?? null;
        topBar.addChild(speedBtn);

        // 暂停遮罩 + "已暂停" 提示（初始隐藏）
        this.pauseOverlay = new Node('PauseOverlay');
        const poUt = this.pauseOverlay.addComponent(UITransform);
        poUt.setContentSize(SW, SH);
        poUt.setAnchorPoint(0.5, 0.5);
        this.pauseOverlay.setPosition(0, 0, 0);
        const poGfx = this.pauseOverlay.addComponent(Graphics);
        poGfx.fillColor = new Color(0, 0, 0, 100);
        poGfx.rect(-SW / 2, -SH / 2, SW, SH);
        poGfx.fill();

        const pauseTxtNode = new Node('PauseText');
        const ptut = pauseTxtNode.addComponent(UITransform);
        ptut.setContentSize(200, 50);
        ptut.setAnchorPoint(0.5, 0.5);
        this.pauseTextLabel = pauseTxtNode.addComponent(Label);
        this.pauseTextLabel.string = '已暂停';
        this.pauseTextLabel.fontSize = 32;
        this.pauseTextLabel.isBold = true;
        this.pauseTextLabel.color = GOLD;
        this.pauseTextLabel.enableOutline = true;
        this.pauseTextLabel.outlineColor = new Color(0, 0, 0, 180);
        this.pauseTextLabel.outlineWidth = 3;
        this.pauseTextLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.pauseOverlay.addChild(pauseTxtNode);

        this.pauseOverlay.active = false;
        // 暂停蒙版挂到 UIRoot 而非 topBar，保证全屏覆盖
        this.node.addChild(this.pauseOverlay);

        this.node.addChild(topBar);
    }

    /** 创建控制按钮（深色背景 + 白色文字） */
    private createCtrlBtn(text: string, w: number, h: number, r: number): Node {
        const node = new Node('CtrlBtn');
        const ut = node.addComponent(UITransform);
        ut.setContentSize(w, h);
        ut.setAnchorPoint(0.5, 0.5);

        // 深色背景
        const bg = new Node('CtrlBtnBg');
        const bgut = bg.addComponent(UITransform);
        bgut.setContentSize(w, h);
        bgut.setAnchorPoint(0.5, 0.5);
        const gfx = bg.addComponent(Graphics);
        gfx.fillColor = new Color(26, 26, 46, 200);
        gfx.roundRect(-w / 2, -h / 2, w, h, r);
        gfx.fill();
        gfx.strokeColor = new Color(255, 255, 255, 80);
        gfx.lineWidth = 1;
        gfx.roundRect(-w / 2, -h / 2, w, h, r);
        gfx.stroke();
        node.insertChild(bg, 0);

        // 文字
        const txtNode = new Node('CtrlBtnText');
        const txtut = txtNode.addComponent(UITransform);
        txtut.setContentSize(w, h);
        txtut.setAnchorPoint(0.5, 0.5);
        const label = txtNode.addComponent(Label);
        label.string = text;
        label.fontSize = 18;
        label.isBold = true;
        label.color = Color.WHITE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        node.addChild(txtNode);

        return node;
    }

    private onPauseToggle(): void {
        this._bm.togglePause();
        const paused = this._bm.state === BattleState.PAUSED;
        if (this.btnPauseLabel) {
            this.btnPauseLabel.string = paused ? '▶' : '⏸';
        }
        if (this.pauseOverlay) {
            this.pauseOverlay.active = paused;
        }
    }

    private onSpeedToggle(): void {
        this._speedIndex = (this._speedIndex + 1) % this._speedOptions.length;
        const speed = this._speedOptions[this._speedIndex];
        this._bm.setBattleSpeed(speed);
        if (this.btnSpeedLabel) {
            this.btnSpeedLabel.string = `${speed}x`;
        }
    }

    /** 更新关卡名称 */
    private updateStageLabel(): void {
        if (!this._stageLabel) return;
        if (!PlayerManager.instance.isLoaded) {
            this._stageLabel.string = '1-1 边境哨站';
            return;
        }
        const pm = PlayerManager.instance;
        const stage = StageManager.instance.getCurrentStage(pm.data.currentChapter, pm.data.currentStage);
        if (stage) {
            this._stageLabel.string = `${stage.id} ${stage.name}`;
        } else {
            this._stageLabel.string = `${pm.data.currentChapter}-${pm.data.currentStage}`;
        }
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
        if (this._bm.state !== BattleState.RUNNING && this._bm.state !== BattleState.PAUSED) return;

        // 暂停时只更新暂停状态显示
        if (this._bm.state === BattleState.PAUSED) {
            // 确保暂停 UI 同步
            if (this.pauseOverlay && !this.pauseOverlay.active) {
                this.pauseOverlay.active = true;
            }
            if (this.btnPauseLabel && this.btnPauseLabel.string !== '▶') {
                this.btnPauseLabel.string = '▶';
            }
            return;
        }

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
    }

    onDestroy() {
        EventBus.instance.off('battle:end', this.onBattleEnd, this);
        EventBus.instance.off('battle:deploy', this.onDeployConfirmed, this);
    }

    /** 布阵确认后，显示开战按钮 */
    private onDeployConfirmed(): void {
        if (this.btnStartNode) this.btnStartNode.active = true;
        this.updateStageLabel();
    }

    private onBattleEnd(report: BattleReport): void {
        // 清除上一次的统计节点
        this.clearStats();

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

            // 按钮文字：胜利→"下一关"，失败/平局→"再来一局"
            this._lastResult = report.result;
            if (this._btnTextLabel) {
                this._btnTextLabel.string = report.result === BattleResult.WIN ? '下 一 关' : '再来一局';
            }
        }

        // 详情文本（MVP 为个人表现，下方统计为兵种合计）
        if (this.resultDetailLabel) {
            let detail = `用时 ${report.duration.toFixed(1)}s`;
            detail += `  存活 ${report.leftSurvivors} vs ${report.rightSurvivors}`;
            if (report.mvp) {
                detail += `\nMVP: ${report.mvp.config.name}(${report.mvp.tag.split('#')[1]})`;
                detail += `  击杀:${report.mvp.kills} 助攻:${report.mvp.assists}`;
                detail += `  伤害:${report.mvp.damageDealt} 承伤:${report.mvp.damageTaken}`;
                if (report.mvp.healingDone > 0) {
                    detail += ` 治疗:${report.mvp.healingDone}`;
                }
            }
            detail += `\n(下方统计为各兵种合计)`;
            this.resultDetailLabel.string = detail;
        }

        // --- 双方兵种统计柱状图（左右并排） ---
        const leftUnits = report.units.filter(u => u.team === TeamSide.LEFT);
        const rightUnits = report.units.filter(u => u.team === TeamSide.RIGHT);
        const blueStats = this.aggregateTeamStats(leftUnits);
        const redStats = this.aggregateTeamStats(rightUnits);

        // 详情文本（MVP 显示该兵种合计数据）
        if (this.resultDetailLabel) {
            let detail = `用时 ${report.duration.toFixed(1)}s`;
            detail += `  存活 ${report.leftSurvivors} vs ${report.rightSurvivors}`;
            if (report.mvp) {
                const mvpType = blueStats.find(s => s.name === report.mvp!.config.name);
                if (mvpType) {
                    detail += `\nMVP兵种: ${mvpType.name}`;
                    detail += `  伤害:${mvpType.damageDealt}(${mvpType.dmgPct}%)`;
                    detail += `  承伤:${mvpType.damageTaken}(${mvpType.tankPct}%)`;
                }
            }
            this.resultDetailLabel.string = detail;
        }

        // 分隔线2（MVP 下方）
        const topY = PANEL_H / 2 - 30;
        const yDivider2 = topY - 22 - 28 - 10 - 60 - 10;  // title + divider + detail(~60px) + gap
        const div2 = new Node('StatsDivider');
        const d2ut = div2.addComponent(UITransform);
        d2ut.setContentSize(DETAIL_W, 2);
        d2ut.setAnchorPoint(0.5, 0.5);
        const d2g = div2.addComponent(Graphics);
        d2g.fillColor = DIVIDER_CLR;
        d2g.rect(-DETAIL_W / 2, -1, DETAIL_W, 2);
        d2g.fill();
        div2.setPosition(0, yDivider2, 0);
        this.resultPanel.addChild(div2);
        this._statsNodes.push(div2);

        // 双列并排：蓝方左侧，红方右侧
        const headerY = yDivider2 - 8 - 12;
        const yNextBlue = this.createTeamBars(headerY, LEFT_COL_X, '蓝方统计', BLUE_HEADER, blueStats);
        const yNextRed = this.createTeamBars(headerY, RIGHT_COL_X, '红方统计', RED_HEADER, redStats);
        const yBottom = Math.min(yNextBlue, yNextRed);

        // 动态调整按钮位置
        if (this.btnRestart) {
            const btnY = Math.min(yBottom - 16, -(PANEL_H / 2 - 36));
            this.btnRestart.node.setPosition(0, btnY, 0);
        }
    }

    onRestart(): void {
        this.clearStats();
        if (this.overlay) this.overlay.active = false;
        if (this.resultPanel) this.resultPanel.active = false;
        if (this.btnStartNode) this.btnStartNode.active = false;
        if (this.pauseOverlay) this.pauseOverlay.active = false;
        // 重置倍速
        this._speedIndex = 0;
        this._bm.setBattleSpeed(1);
        if (this.btnSpeedLabel) this.btnSpeedLabel.string = '1x';
        if (this.btnPauseLabel) this.btnPauseLabel.string = '⏸';

        if (this._lastResult === BattleResult.WIN) {
            // 胜利 → 进入下一关（回到布阵界面，关卡已由 PlayerManager 推进）
            this.updateStageLabel();
            EventBus.instance.emit('battle:restart');
        } else {
            // 失败/平局 → 重新挑战当前关卡
            EventBus.instance.emit('battle:restart');
        }
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

    // ========== 兵种统计柱状图 ==========

    /** 清除统计节点 */
    private clearStats(): void {
        for (const n of this._statsNodes) {
            n.removeFromParent();
            n.destroy();
        }
        this._statsNodes = [];
    }

    /** 按兵种聚合同方数据 */
    private aggregateTeamStats(units: BattleUnit[]): TypeStats[] {
        const map = new Map<string, { name: string; dmg: number; tank: number }>();
        for (const u of units) {
            const e = map.get(u.configId);
            if (e) {
                e.dmg += u.damageDealt;
                e.tank += u.damageTaken;
            } else {
                map.set(u.configId, { name: u.config.name, dmg: u.damageDealt, tank: u.damageTaken });
            }
        }
        const totalDmg = [...map.values()].reduce((s, e) => s + e.dmg, 0);
        const totalTank = [...map.values()].reduce((s, e) => s + e.tank, 0);
        const result: TypeStats[] = [];
        for (const e of map.values()) {
            result.push({
                name: e.name,
                damageDealt: e.dmg,
                damageTaken: e.tank,
                dmgPct: totalDmg > 0 ? Math.round(e.dmg / totalDmg * 100) : 0,
                tankPct: totalTank > 0 ? Math.round(e.tank / totalTank * 100) : 0,
            });
        }
        result.sort((a, b) => b.damageDealt - a.damageDealt);
        return result;
    }

    /** 创建一方兵种统计柱状图，返回最后一行下方的 Y 坐标 */
    private createTeamBars(headerY: number, colX: number, headerText: string, headerColor: Color, stats: TypeStats[]): number {
        // 标题（居中于列）
        const hdr = new Node('StatsHdr');
        const hudr = hdr.addComponent(UITransform);
        hudr.setContentSize(COL_W, 24);
        hudr.setAnchorPoint(0.5, 0.5);
        hdr.setPosition(colX + COL_W / 2, headerY, 0);
        const hlbl = hdr.addComponent(Label);
        hlbl.string = headerText;
        hlbl.fontSize = 18;
        hlbl.isBold = true;
        hlbl.color = headerColor;
        hlbl.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.resultPanel.addChild(hdr);
        this._statsNodes.push(hdr);

        if (stats.length === 0) return headerY - 24;

        // 计算缩放比例
        const maxDmg = Math.max(1, ...stats.map(s => s.damageDealt));
        const maxTank = Math.max(1, ...stats.map(s => s.damageTaken));

        let y = headerY - 34;
        for (const stat of stats) {
            this.createBarRow(y, colX, stat, maxDmg, maxTank);
            y -= BAR_ROW_H;
        }
        return y;
    }

    /** 创建一行柱状图（伤害+承伤） */
    private createBarRow(y: number, colX: number, stat: TypeStats, maxDmg: number, maxTank: number): void {
        const nameX = colX;
        const barX = colX + BAR_NAME_W + 6;
        const valX = barX + COL_BAR_W + 6;
        const valW = COL_W - BAR_NAME_W - 6 - COL_BAR_W - 6;  // 自动计算剩余宽度给数值

        // 兵种名
        const nameNode = new Node('TypeName');
        const nut = nameNode.addComponent(UITransform);
        nut.setContentSize(BAR_NAME_W, BAR_ROW_H);
        nut.setAnchorPoint(0, 0.5);
        nameNode.setPosition(nameX, y, 0);
        const nlbl = nameNode.addComponent(Label);
        nlbl.string = stat.name.substring(0, 4);
        nlbl.fontSize = 15;
        nlbl.color = DETAIL_CLR;
        nlbl.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.resultPanel.addChild(nameNode);
        this._statsNodes.push(nameNode);

        // 柱状图（伤害 + 承伤）
        const barsNode = new Node('Bars');
        const but = barsNode.addComponent(UITransform);
        but.setContentSize(COL_BAR_W, BAR_ROW_H);
        but.setAnchorPoint(0, 0.5);
        barsNode.setPosition(barX, y, 0);
        const gfx = barsNode.addComponent(Graphics);

        // 伤害柱背景 + 填充（上半）
        const dmgTopY = BAR_GAP / 2;
        gfx.fillColor = BAR_BG;
        gfx.rect(0, dmgTopY, COL_BAR_W, BAR_H);
        gfx.fill();
        const dmgW = COL_BAR_W * (stat.damageDealt / maxDmg);
        if (dmgW > 0) {
            gfx.fillColor = DMG_COLOR;
            gfx.rect(0, dmgTopY, dmgW, BAR_H);
            gfx.fill();
        }

        // 承伤柱背景 + 填充（下半）
        const tankTopY = -(BAR_GAP / 2 + BAR_H);
        gfx.fillColor = BAR_BG;
        gfx.rect(0, tankTopY, COL_BAR_W, BAR_H);
        gfx.fill();
        const tankW = COL_BAR_W * (stat.damageTaken / maxTank);
        if (tankW > 0) {
            gfx.fillColor = TANK_COLOR;
            gfx.rect(0, tankTopY, tankW, BAR_H);
            gfx.fill();
        }

        this.resultPanel.addChild(barsNode);
        this._statsNodes.push(barsNode);

        // 伤害数值标签
        const dmgValNode = new Node('DmgVal');
        const dvut = dmgValNode.addComponent(UITransform);
        dvut.setContentSize(valW, BAR_H + 2);
        dvut.setAnchorPoint(0, 0.5);
        dmgValNode.setPosition(valX, y + BAR_GAP / 2 + BAR_H / 2, 0);
        const dvlbl = dmgValNode.addComponent(Label);
        dvlbl.string = `${stat.damageDealt} (${stat.dmgPct}%)`;
        dvlbl.fontSize = 13;
        dvlbl.color = DMG_COLOR;
        dvlbl.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.resultPanel.addChild(dmgValNode);
        this._statsNodes.push(dmgValNode);

        // 承伤数值标签
        const tankValNode = new Node('TankVal');
        const tvut = tankValNode.addComponent(UITransform);
        tvut.setContentSize(valW, BAR_H + 2);
        tvut.setAnchorPoint(0, 0.5);
        tankValNode.setPosition(valX, y - (BAR_GAP / 2 + BAR_H / 2), 0);
        const tvlbl = tankValNode.addComponent(Label);
        tvlbl.string = `${stat.damageTaken} (${stat.tankPct}%)`;
        tvlbl.fontSize = 13;
        tvlbl.color = TANK_COLOR;
        tvlbl.horizontalAlign = Label.HorizontalAlign.LEFT;
        this.resultPanel.addChild(tankValNode);
        this._statsNodes.push(tankValNode);
    }
}
