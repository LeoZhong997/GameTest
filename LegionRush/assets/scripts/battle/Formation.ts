/**
 * Formation - 阵型系统
 * 3x3 九宫格布阵，支持十字阵等多种阵型
 * 每个格子对应一个兵种角色，同兵种单位在对应格子内散布
 */

import { Vec2 } from 'cc';

export enum FormationType {
    DEFAULT = 'default',       // 十字阵
}

/** 格子定义 */
interface GridCell {
    row: number;   // 0=后排(靠近己方), 2=前排(靠近中央)
    col: number;   // 0=上, 1=中, 2=下
    role: string;  // 对应的兵种角色
}

export class Formation {
    static readonly FIELD_WIDTH = 960;
    static readonly FIELD_HEIGHT = 640;

    /** 十字阵格子：5 个活跃位置 */
    private static readonly CROSS_CELLS: GridCell[] = [
        { row: 2, col: 1, role: 'tank' },       // 前排中央
        { row: 1, col: 0, role: 'cavalry' },     // 中排上
        { row: 0, col: 1, role: 'ranged' },      // 后排中央
        { row: 1, col: 1, role: 'mage' },        // 中排中央
        { row: 1, col: 2, role: 'support' },     // 中排下
    ];

    /** 角色 → 格子映射（damage 归入 tank 格） */
    private static readonly ROLE_MAP: Record<string, string> = {
        'tank': 'tank',
        'cavalry': 'cavalry',
        'ranged': 'ranged',
        'mage': 'mage',
        'support': 'support',
        'damage': 'tank',
        'assassin': 'cavalry',
        'control': 'mage',
    };

    /** 格子世界坐标尺寸 */
    private static readonly CELL_W = 120;
    private static readonly CELL_H = 160;

    /** 格子内散布半径 */
    private static readonly SPREAD = 18;

    /**
     * 根据角色获取该兵种单位的初始位置
     * @param role   兵种角色 (tank/cavalry/ranged/mage/support 等)
     * @param count  单位数量 (最多 5)
     * @param isLeftTeam 是否为左方
     */
    static getPositionsForRole(role: string, count: number, isLeftTeam: boolean): Vec2[] {
        const mappedRole = this.ROLE_MAP[role] || 'tank';
        const cell = this.CROSS_CELLS.find(c => c.role === mappedRole) || this.CROSS_CELLS[0];

        // 格子中心坐标（左方半场）
        const halfW = this.FIELD_WIDTH * 0.35;      // 336 — 左半场中心 x，拉开双方距离
        const colOffset = (cell.col - 1) * this.CELL_H;  // y 方向（上下）
        const rowOffset = (cell.row - 1) * this.CELL_W;  // x 方向（前后）

        const cx = -halfW + rowOffset;
        const cy = colOffset;

        // 在格子内散布单位
        const n = Math.min(5, count);
        const offsets = this.getCellOffsets(n);

        const positions: Vec2[] = [];
        for (let i = 0; i < n; i++) {
            let x = cx + offsets[i].x;
            let y = cy + offsets[i].y;
            if (!isLeftTeam) x = -x;
            positions.push(new Vec2(x, y));
        }

        return positions;
    }

    /**
     * 兼容旧接口：按数量分配位置（平铺到所有格子）
     */
    static getPositions(type: FormationType, count: number, isLeftTeam: boolean): Vec2[] {
        // 将单位均匀分配到各角色格子
        const positions: Vec2[] = [];
        const perCell = Math.ceil(count / this.CROSS_CELLS.length);
        for (const cell of this.CROSS_CELLS) {
            const cellPos = this.getPositionsForRole(cell.role, perCell, isLeftTeam);
            positions.push(...cellPos);
            if (positions.length >= count) break;
        }
        return positions.slice(0, count);
    }

    /** 获取所有可用阵型 */
    static getAvailableTypes(): FormationType[] {
        return Object.values(FormationType);
    }

    /** 格子内散布偏移 */
    private static getCellOffsets(n: number): Vec2[] {
        const s = this.SPREAD;
        switch (n) {
            case 1: return [new Vec2(0, 0)];
            case 2: return [new Vec2(-s, 0), new Vec2(s, 0)];
            case 3: return [new Vec2(0, s), new Vec2(-s, -s * 0.6), new Vec2(s, -s * 0.6)];
            case 4: return [new Vec2(-s, -s), new Vec2(s, -s), new Vec2(-s, s), new Vec2(s, s)];
            case 5: return [new Vec2(0, 0), new Vec2(-s, -s), new Vec2(s, -s), new Vec2(-s, s), new Vec2(s, s)];
            default: return [new Vec2(0, 0)];
        }
    }
}
