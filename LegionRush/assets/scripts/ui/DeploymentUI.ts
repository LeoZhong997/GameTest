/**
 * DeploymentUI - 布阵界面
 * 玩家从 6 张兵种卡中选择，点击放置到九宫格十字阵位置
 * 可调节每个格子兵种数量（1~5），确认后发送 battle:deploy 事件
 * 挂载在 UIRoot 节点
 */

import { _decorator, Component, Node, Label, Graphics, UITransform, Color, Button, EventTouch, sys } from 'cc';
import { UnitConfig } from '../models/UnitData';
import { EventBus } from '../core/EventBus';
import { drawShape, UnitShape } from './UnitView';

const { ccclass } = _decorator;

// --- Layout constants (matching deployment-ui.pen) ---
const SW = 960, SH = 640;
const CELL = 80;
const GRID_GAP = 4;
const CARD_W = 80, CARD_H = 100;
const BTN_W = 160, BTN_H = 48, BTN_R = 24;
const SAVE_KEY = 'legionrush_deploy';

/** 默认十字阵 */
const DEFAULT_DEPLOY: { row: number; col: number; configId: string; count: number }[] = [
    { row: 0, col: 1, configId: 'ranged', count: 3 },
    { row: 1, col: 0, configId: 'cavalry', count: 3 },
    { row: 1, col: 1, configId: 'mage', count: 3 },
    { row: 1, col: 2, configId: 'support', count: 3 },
    { row: 2, col: 0, configId: 'assassin', count: 3 },
    { row: 2, col: 1, configId: 'tank', count: 3 },
];

/** 模块级缓存，同一次页面会话内重启可立即恢复 */
let _sessionDeploy: { configId: string; count: number; gridRow: number; gridCol: number }[] | null = null;

// --- Colors ---
const BG          = new Color(26, 26, 46, 255);
const TOPBAR_BG   = new Color(15, 52, 96, 230);
const BOX_BG      = new Color(26, 26, 46, 255);
const BLUE        = new Color(74, 144, 217, 255);
const BLUE_NAME   = new Color(160, 196, 255, 255);
const RED_NAME    = new Color(255, 176, 176, 255);
const RED         = new Color(217, 74, 74, 255);
const GOLD        = new Color(255, 215, 0, 255);
const CELL_BG     = new Color(15, 52, 96, 128);
const CELL_BORDER = new Color(74, 144, 217, 128);
const SEL_BORDER  = new Color(255, 215, 0, 255);
const CARD_BG     = new Color(15, 52, 96, 255);
const CARD_BORDER = new Color(74, 144, 217, 255);
const BTN_TEXT_C  = new Color(26, 26, 46, 255);
const GRAY        = new Color(100, 100, 100, 255);
const PLACEHOLDER = new Color(255, 255, 255, 64);
const SMALL_BTN_BG = new Color(255, 255, 255, 30);

/** 全部 9 格开放 */
const ALL_CELLS: { row: number; col: number }[] = [];
for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
        ALL_CELLS.push({ row: r, col: c });
    }
}

function getShape(role: string): UnitShape {
    switch (role) {
        case 'tank':     return 'rect';
        case 'cavalry':  return 'triangle';
        case 'ranged':   return 'circle';
        case 'mage':     return 'pentagon';
        case 'support':  return 'hexagon';
        case 'assassin': return 'diamond';
        default:         return 'rect';
    }
}

export interface DeployCellData {
    row: number;
    col: number;
    configId: string | null;
    count: number;
}

@ccclass('DeploymentUI')
export class DeploymentUI extends Component {

    private _configs: Map<string, UnitConfig> = new Map();
    private _cells: DeployCellData[] = [];
    private _cellNodes: Map<string, Node> = new Map();
    private _cellGfx: Map<string, Graphics> = new Map();
    private _cardNodes: Map<string, Node> = new Map();
    private _cardGfx: Map<string, Graphics> = new Map();
    private _selectedId: string | null = null;
    private _container: Node | null = null;

    onLoad() {
        this.buildUI();
        // 隐藏布阵容器（不要隐藏 this.node，那是 UIRoot）
        if (this._container) this._container.active = false;

        EventBus.instance.on('deployment:ready', this.onReady, this);
    }

    onDestroy() {
        EventBus.instance.off('deployment:ready', this.onReady, this);
    }

    // ---- Event handlers ----

    private onReady(configs: Map<string, UnitConfig>): void {
        this._configs = configs;
        this._selectedId = null;
        this._cells = ALL_CELLS.map(c => ({ row: c.row, col: c.col, configId: null, count: 0 }));

        // 加载上次布阵（优先模块缓存，其次 localStorage，最后默认十字阵）
        let loaded = false;
        if (_sessionDeploy) {
            for (const entry of _sessionDeploy) {
                const cell = this._cells.find(c => c.row === entry.gridRow && c.col === entry.gridCol);
                if (cell && configs.has(entry.configId)) {
                    cell.configId = entry.configId;
                    cell.count = entry.count;
                }
            }
            loaded = true;
            console.log('[DeploymentUI] 已加载上次布阵(内存)');
        } else {
            const saved = this.loadSaved();
            if (saved) {
                for (const entry of saved) {
                    const cell = this._cells.find(c => c.row === entry.gridRow && c.col === entry.gridCol);
                    if (cell && configs.has(entry.configId)) {
                        cell.configId = entry.configId;
                        cell.count = entry.count;
                    }
                }
                loaded = true;
                console.log('[DeploymentUI] 已加载上次布阵(localStorage)');
            }
        }

        if (!loaded) {
            // 首次使用默认十字阵
            for (const entry of DEFAULT_DEPLOY) {
                const cell = this._cells.find(c => c.row === entry.row && c.col === entry.col);
                if (cell && configs.has(entry.configId)) {
                    cell.configId = entry.configId;
                    cell.count = entry.count;
                }
            }
            console.log('[DeploymentUI] 使用默认十字阵');
        }

        this.drawCards();
        this.refreshGrid();
        this.refreshCardCounts();
        if (this._container) this._container.active = true;
    }

    // ---- Build UI ----

    private buildUI(): void {
        const container = new Node('DeployContainer');
        const ct = container.addComponent(UITransform);
        ct.setContentSize(SW, SH);
        ct.setAnchorPoint(0.5, 0.5);
        container.setPosition(0, 0, 0);
        this._container = container;
        this.node.addChild(container);

        // Full-screen background
        this.drawRect(container, SW, SH, BG, 0, 0);

        this.buildTopBar(container);
        this.buildTitle(container);
        this.buildGrid(container);
        this.buildCardArea(container);
        this.buildButton(container);
    }

    private buildTopBar(parent: Node): void {
        const TB_H = 50;
        const topBar = new Node('TopBar');
        const tut = topBar.addComponent(UITransform);
        tut.setContentSize(SW, TB_H);
        tut.setAnchorPoint(0.5, 0.5);
        topBar.setPosition(0, SH / 2 - TB_H / 2, 0);

        this.drawRect(topBar, SW, TB_H, TOPBAR_BG, 0, 0);

        // Blue icon
        const leftX = -SW / 2 + 50;
        this.drawCircle(topBar, 28, BLUE, leftX, 0);
        this.addLabel(topBar, '蓝方', 14, BLUE_NAME, leftX + 40, 0, 40);

        // Timer box
        const timerBox = new Node('TimerBox');
        const tbut = timerBox.addComponent(UITransform);
        tbut.setContentSize(130, 36);
        tbut.setAnchorPoint(0.5, 0.5);
        timerBox.setPosition(0, 0, 0);
        this.drawRoundRect(timerBox, 130, 36, BOX_BG, 0, 0, 8);
        this.addLabel(timerBox, '⏱', 16, GOLD, -20, 0, 20);
        this.addLabel(timerBox, '--', 20, GOLD, 20, 0, 70, true);
        topBar.addChild(timerBox);

        // Red icon
        const rightX = SW / 2 - 50;
        this.addLabel(topBar, '红方', 14, RED_NAME, rightX - 40, 0, 40);
        this.drawCircle(topBar, 28, RED, rightX, 0);

        parent.addChild(topBar);
    }

    private buildTitle(parent: Node): void {
        this.addLabel(parent, '选兵布阵', 24, GOLD, 0, SH / 2 - 70, 200, true);
    }

    private buildGrid(parent: Node): void {
        const gridNode = new Node('Grid');
        const gut = gridNode.addComponent(UITransform);
        const gridSize = 3 * CELL + 2 * GRID_GAP;
        gut.setContentSize(gridSize, gridSize);
        gut.setAnchorPoint(0.5, 0.5);
        gridNode.setPosition(0, 60, 0);

        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const cx = (col - 1) * (CELL + GRID_GAP);
                const cy = (1 - row) * (CELL + GRID_GAP);

                const cellNode = new Node(`Cell_${row}_${col}`);
                const cut = cellNode.addComponent(UITransform);
                cut.setContentSize(CELL, CELL);
                cut.setAnchorPoint(0.5, 0.5);
                cellNode.setPosition(cx, cy, 0);

                const bgNode = this.drawRect(cellNode, CELL, CELL, CELL_BG, 0, 0);

                const gfx = bgNode.getComponent(Graphics)!;
                gfx.strokeColor = CELL_BORDER;
                gfx.lineWidth = 1;
                gfx.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 4);
                gfx.stroke();

                const key = `${row},${col}`;
                this._cellNodes.set(key, cellNode);
                this._cellGfx.set(key, gfx);
                cellNode.on(Node.EventType.TOUCH_END, () => this.onCellTap(row, col), this);

                gridNode.addChild(cellNode);
            }
        }

        parent.addChild(gridNode);
    }

    private buildCardArea(parent: Node): void {
        const cardArea = new Node('CardArea');
        const caut = cardArea.addComponent(UITransform);
        caut.setContentSize(SW - 40, CARD_H + 20);
        caut.setAnchorPoint(0.5, 0.5);
        cardArea.setPosition(0, -140, 0);
        parent.addChild(cardArea);
    }

    private buildButton(parent: Node): void {
        const btnNode = new Node('BtnConfirm');
        const but = btnNode.addComponent(UITransform);
        but.setContentSize(BTN_W, BTN_H);
        but.setAnchorPoint(0.5, 0.5);
        btnNode.setPosition(0, -SH / 2 + 60, 0);

        this.drawRoundRect(btnNode, BTN_W, BTN_H, GOLD, 0, 0, BTN_R);

        const txtNode = new Node('BtnText');
        const txtut = txtNode.addComponent(UITransform);
        txtut.setContentSize(BTN_W, BTN_H);
        txtut.setAnchorPoint(0.5, 0.5);
        txtNode.setPosition(0, 0, 0);
        const txt = txtNode.addComponent(Label);
        txt.string = '确  认';
        txt.fontSize = 22;
        txt.isBold = true;
        txt.color = BTN_TEXT_C;
        txt.horizontalAlign = Label.HorizontalAlign.CENTER;
        txt.verticalAlign = Label.VerticalAlign.CENTER;
        btnNode.addChild(txtNode);

        const btn = btnNode.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.9;
        btnNode.on(Button.EventType.CLICK, this.onConfirm, this);

        parent.addChild(btnNode);
    }

    // ---- Draw helpers (CC3: one node = one UIRenderer) ----

    /** 创建矩形填充子节点 */
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

    /** 创建圆角矩形填充子节点 */
    private drawRoundRect(parent: Node, w: number, h: number, color: Color, x: number, y: number, r: number): Node {
        const n = new Node('BgRoundRect');
        const ut = n.addComponent(UITransform);
        ut.setContentSize(w, h);
        ut.setAnchorPoint(0.5, 0.5);
        n.setPosition(x, y, 0);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.roundRect(-w / 2, -h / 2, w, h, r);
        g.fill();
        parent.insertChild(n, 0);
        return n;
    }

    /** 创建圆形填充子节点 */
    private drawCircle(parent: Node, size: number, color: Color, x: number, y: number): Node {
        const n = new Node('Circle');
        const ut = n.addComponent(UITransform);
        ut.setContentSize(size, size);
        ut.setAnchorPoint(0.5, 0.5);
        n.setPosition(x, y, 0);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.circle(0, 0, size / 2);
        g.fill();
        parent.addChild(n);
        return n;
    }

    /** 创建 Label 子节点 */
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

    // ---- Card drawing ----

    private drawCards(): void {
        const cardArea = this._container!.getChildByName('CardArea')!;
        cardArea.removeAllChildren();
        this._cardNodes.clear();
        this._cardGfx.clear();

        const configs = Array.from(this._configs.values());
        const totalW = configs.length * CARD_W + (configs.length - 1) * 10;
        const startX = -totalW / 2 + CARD_W / 2;

        configs.forEach((cfg, i) => {
            const card = new Node(`Card_${cfg.id}`);
            const cut = card.addComponent(UITransform);
            cut.setContentSize(CARD_W, CARD_H);
            cut.setAnchorPoint(0.5, 0.5);
            card.setPosition(startX + i * (CARD_W + 10), 0, 0);

            // Card background (Graphics)
            const bgNode = new Node('CardBg');
            const bgut = bgNode.addComponent(UITransform);
            bgut.setContentSize(CARD_W, CARD_H);
            bgut.setAnchorPoint(0.5, 0.5);
            bgNode.setPosition(0, 0, 0);
            const bg = bgNode.addComponent(Graphics);
            bg.fillColor = CARD_BG;
            bg.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
            bg.fill();
            bg.strokeColor = CARD_BORDER;
            bg.lineWidth = 1;
            bg.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
            bg.stroke();
            card.insertChild(bgNode, 0);
            this._cardGfx.set(cfg.id, bg);

            // Unit shape icon
            const shape = getShape(cfg.role);
            const shapeNode = new Node('Shape');
            const sut = shapeNode.addComponent(UITransform);
            sut.setContentSize(28, 28);
            sut.setAnchorPoint(0.5, 0.5);
            shapeNode.setPosition(0, 15, 0);
            const sg = shapeNode.addComponent(Graphics);
            sg.fillColor = BLUE;
            drawShape(sg, shape, 28);
            sg.fill();
            card.addChild(shapeNode);

            // Name
            this.addLabel(card, cfg.name, 12, Color.WHITE, 0, -10, CARD_W, true);

            // Count
            const countNode = this.addLabel(card, '×5', 10, GOLD, 0, -28, CARD_W);

            // Touch
            card.on(Node.EventType.TOUCH_END, () => this.onCardTap(cfg.id), this);

            this._cardNodes.set(cfg.id, card);
            cardArea.addChild(card);
        });
    }

    // ---- Interaction ----

    private onCardTap(configId: string): void {
        // 如果已选中同一个，取消选中
        if (this._selectedId === configId) {
            this._selectedId = null;
            this.refreshCardSelection();
            return;
        }

        // 已部署：从旧格子移除后进入选中状态
        const oldCell = this._cells.find(c => c.configId === configId);
        if (oldCell) {
            oldCell.configId = null;
            oldCell.count = 0;
            this.refreshGrid();
            this.refreshCardCounts();
        }

        this._selectedId = configId;
        this.refreshCardSelection();
        console.log(`[DeploymentUI] 选中: ${this._selectedId}`);
    }

    private onCellTap(row: number, col: number): void {
        const cell = this._cells.find(c => c.row === row && c.col === col);
        if (!cell) return;

        if (this._selectedId) {
            // 如果目标格子已有其他兵种，先移回其卡片（自动下架）
            if (cell.configId && cell.configId !== this._selectedId) {
                cell.configId = null;
                cell.count = 0;
            }

            if (cell.configId === this._selectedId) {
                // 再次点击已放置的同兵种 → 移除
                cell.configId = null;
                cell.count = 0;
            } else {
                // 放置选中兵种，继承默认数量
                cell.configId = this._selectedId;
                cell.count = cell.count || 3;
            }
            this._selectedId = null;
        } else {
            // 无选中 → 点击移除
            cell.configId = null;
            cell.count = 0;
        }

        this.refreshGrid();
        this.refreshCardCounts();
        this.refreshCardSelection();
    }

    private onPlus(cell: DeployCellData): void {
        if (cell.count < 5) {
            cell.count++;
            this.refreshGrid();
            this.refreshCardCounts();
        }
    }

    private onMinus(cell: DeployCellData): void {
        if (cell.count > 1) {
            cell.count--;
            this.refreshGrid();
            this.refreshCardCounts();
        }
    }

    // ---- Refresh ----

    private refreshGrid(): void {
        for (const cell of this._cells) {
            const key = `${cell.row},${cell.col}`;
            const node = this._cellNodes.get(key);
            const gfx = this._cellGfx.get(key);
            if (!node || !gfx) continue;

            // Remove old content (keep CellBg at index 0)
            const children = [...node.children];
            children.forEach((c, idx) => { if (idx > 0) c.destroy(); });

            gfx.clear();
            gfx.fillColor = CELL_BG;
            gfx.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 4);
            gfx.fill();

            if (cell.configId) {
                const cfg = this._configs.get(cell.configId);
                if (cfg) {
                    // Gold border for occupied cell
                    gfx.strokeColor = SEL_BORDER;
                    gfx.lineWidth = 2;
                    gfx.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 4);
                    gfx.stroke();

                    const shape = getShape(cfg.role);

                    // Shape icon
                    const sn = new Node('Shape');
                    const snut = sn.addComponent(UITransform);
                    snut.setContentSize(24, 24);
                    snut.setAnchorPoint(0.5, 0.5);
                    sn.setPosition(0, 10, 0);
                    const sg = sn.addComponent(Graphics);
                    sg.fillColor = BLUE;
                    drawShape(sg, shape, 24);
                    sg.fill();
                    node.addChild(sn);

                    // Name
                    this.addLabel(node, cfg.name, 10, Color.WHITE, 0, -6, CELL);

                    // Count
                    this.addLabel(node, `×${cell.count}`, 10, GOLD, 0, -20, CELL);

                    // + button
                    const plus = this.createSmallBtn('+');
                    plus.setPosition(CELL / 2 - 14, CELL / 2 - 14, 0);
                    plus.on(Node.EventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; this.onPlus(cell); }, this);
                    node.addChild(plus);

                    // - button
                    const minus = this.createSmallBtn('−');
                    minus.setPosition(-CELL / 2 + 14, CELL / 2 - 14, 0);
                    minus.on(Node.EventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; this.onMinus(cell); }, this);
                    node.addChild(minus);
                }
            } else {
                // Empty cell
                gfx.strokeColor = CELL_BORDER;
                gfx.lineWidth = 1;
                gfx.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 4);
                gfx.stroke();

                const ph = new Node('Placeholder');
                const phut = ph.addComponent(UITransform);
                phut.setContentSize(CELL, 20);
                phut.setAnchorPoint(0.5, 0.5);
                ph.setPosition(0, 0, 0);
                const phl = ph.addComponent(Label);
                phl.string = '+';
                phl.fontSize = 18;
                phl.color = PLACEHOLDER;
                phl.horizontalAlign = Label.HorizontalAlign.CENTER;
                node.addChild(ph);
            }
        }
    }

    private createSmallBtn(text: string): Node {
        const n = new Node(`SmBtn${text}`);
        const ut = n.addComponent(UITransform);
        ut.setContentSize(20, 20);
        ut.setAnchorPoint(0.5, 0.5);
        const bg = new Node('Bg');
        const bgut = bg.addComponent(UITransform);
        bgut.setContentSize(20, 20);
        bgut.setAnchorPoint(0.5, 0.5);
        bg.setPosition(0, 0, 0);
        const g = bg.addComponent(Graphics);
        g.fillColor = SMALL_BTN_BG;
        g.circle(0, 0, 10);
        g.fill();
        n.insertChild(bg, 0);
        const lNode = new Node('Lbl');
        const lut = lNode.addComponent(UITransform);
        lut.setContentSize(20, 20);
        lut.setAnchorPoint(0.5, 0.5);
        lNode.setPosition(0, 0, 0);
        const l = lNode.addComponent(Label);
        l.string = text;
        l.fontSize = 14;
        l.isBold = true;
        l.color = Color.WHITE;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        n.addChild(lNode);
        return n;
    }

    private refreshCardSelection(): void {
        for (const [id, gfx] of this._cardGfx) {
            const deployed = this._cells.some(c => c.configId === id);
            const sel = id === this._selectedId;
            gfx.clear();
            // 部署中的卡片用浅色背景+绿色边框标识，但仍可点击选中
            gfx.fillColor = deployed ? new Color(20, 60, 100, 255) : CARD_BG;
            gfx.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
            gfx.fill();
            gfx.strokeColor = sel ? SEL_BORDER : (deployed ? new Color(0, 200, 100, 200) : CARD_BORDER);
            gfx.lineWidth = sel ? 3 : 1;
            gfx.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 8);
            gfx.stroke();
        }
    }

    private refreshCardCounts(): void {
        const used = new Map<string, number>();
        for (const cell of this._cells) {
            if (cell.configId) {
                used.set(cell.configId, (used.get(cell.configId) || 0) + cell.count);
            }
        }
        for (const [id, card] of this._cardNodes) {
            const remaining = 5 - (used.get(id) || 0);
            // Update count text
            const countNode = card.children.find(c => c.name === 'Lbl' && c.getComponent(Label)?.string?.startsWith('×'));
            if (countNode) {
                const lbl = countNode.getComponent(Label)!;
                lbl.string = `×${remaining}`;
            }
            // Update shape color (gray if depleted)
            const cfg = this._configs.get(id);
            if (cfg) {
                const shapeNode = card.getChildByName('Shape');
                if (shapeNode) {
                    const sg = shapeNode.getComponent(Graphics);
                    if (sg) {
                        sg.clear();
                        sg.fillColor = remaining > 0 ? BLUE : GRAY;
                        drawShape(sg, getShape(cfg.role), 28);
                        sg.fill();
                    }
                }
            }
        }
    }

    // ---- Confirm ----

    private onConfirm(): void {
        const placed = this._cells.filter(c => c.configId && c.count > 0);
        if (placed.length === 0) {
            console.warn('[DeploymentUI] 请至少放置一个兵种');
            return;
        }

        const deployData = placed.map(c => ({
            configId: c.configId!,
            count: c.count,
            gridRow: c.row,
            gridCol: c.col,
        }));

        // 保存布阵到 localStorage
        this.saveDeploy(deployData);

        console.log(`[DeploymentUI] 确认布阵: ${deployData.map(d => `${d.configId}×${d.count}`).join(', ')}`);
        if (this._container) this._container.active = false;
        EventBus.instance.emit('battle:deploy', deployData);
    }

    // ---- Persistence ----

    private saveDeploy(data: { configId: string; count: number; gridRow: number; gridCol: number }[]): void {
        // 模块级缓存（立即可靠）
        _sessionDeploy = data;
        // localStorage 补充（跨会话）
        try {
            sys.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        } catch (e) { /* ignore */ }
    }

    private loadSaved(): { configId: string; count: number; gridRow: number; gridCol: number }[] | null {
        try {
            const raw = sys.localStorage.getItem(SAVE_KEY);
            console.log(`[DeploymentUI] 读取存档: ${raw}`);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.warn('[DeploymentUI] 读取布阵失败:', e);
        }
        return null;
    }
}
