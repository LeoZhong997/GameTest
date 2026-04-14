/**
 * MathUtils - 数学工具函数
 */

export class MathUtils {
    static readonly DEG_TO_RAD = Math.PI / 180;
    static readonly RAD_TO_DEG = 180 / Math.PI;
    static readonly EPSILON = 0.0001;

    /** 钳制值 */
    static clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    /** 线性插值 */
    static lerp(a: number, b: number, t: number): number {
        return a + (b - a) * MathUtils.clamp(t, 0, 1);
    }

    /** 随机浮点数 [min, max) */
    static randomRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    /** 随机整数 [min, max] */
    static randomInt(min: number, max: number): number {
        return Math.floor(min + Math.random() * (max - min + 1));
    }

    /** 随机选择一个元素 */
    static randomChoice<T>(arr: T[]): T {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /** 洗牌（返回新数组） */
    static shuffle<T>(arr: T[]): T[] {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    /** 两点距离 */
    static distance(x1: number, y1: number, x2: number, y2: number): number {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /** 两点距离平方（节省开方运算） */
    static distanceSq(x1: number, y1: number, x2: number, y2: number): number {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return dx * dx + dy * dy;
    }

    /** 加权随机 */
    static weightedRandom<T>(items: T[], weights: number[]): T {
        const total = weights.reduce((sum, w) => sum + w, 0);
        let r = Math.random() * total;
        for (let i = 0; i < items.length; i++) {
            r -= weights[i];
            if (r <= 0) return items[i];
        }
        return items[items.length - 1];
    }

    /** 从数组中随机取 N 个不重复元素 */
    static pickRandom<T>(arr: T[], count: number): T[] {
        return MathUtils.shuffle(arr).slice(0, Math.min(count, arr.length));
    }

    /** 判断概率命中 */
    static chance(probability: number): boolean {
        return Math.random() < probability;
    }
}
