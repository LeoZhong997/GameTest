/**
 * TimerManager - 集中式计时器管理
 * 统一管理所有定时任务，避免散落的 setTimeout/setInterval
 */

interface TimerItem {
    callback: (...args: any[]) => void;
    interval: number;
    repeat: number;       // -1 = 无限
    elapsed: number;
    args: any[];
    paused: boolean;
    target: any;
}

export class TimerManager {
    private static _instance: TimerManager = null!;
    private _timers: Map<number, TimerItem> = new Map();
    private _nextId: number = 1;

    public static get instance(): TimerManager {
        if (!this._instance) {
            this._instance = new TimerManager();
        }
        return this._instance;
    }

    /**
     * 注册定时器
     * @param callback 回调函数
     * @param interval 间隔（秒）
     * @param repeat 重复次数，-1=无限
     * @returns timerId 用于取消
     */
    schedule(callback: (...args: any[]) => void, interval: number, repeat: number = -1, target?: any, ...args: any[]): number {
        const id = this._nextId++;
        this._timers.set(id, {
            callback,
            interval: Math.max(interval, 0.001),
            repeat,
            elapsed: 0,
            args,
            paused: false,
            target: target || null
        });
        return id;
    }

    /** 延迟执行一次 */
    scheduleOnce(callback: (...args: any[]) => void, delay: number, target?: any, ...args: any[]): number {
        return this.schedule(callback, delay, 1, target, ...args);
    }

    /** 每帧执行（interval=0） */
    scheduleUpdate(callback: (dt: number) => void, target?: any): number {
        const id = this._nextId++;
        this._timers.set(id, {
            callback: callback as any,
            interval: 0,
            repeat: -1,
            elapsed: 0,
            args: [],
            paused: false,
            target: target || null
        });
        return id;
    }

    /** 取消定时器 */
    cancel(id: number): boolean {
        return this._timers.delete(id);
    }

    /** 取消目标的所有定时器 */
    cancelAllForTarget(target: any): void {
        this._timers.forEach((timer, id) => {
            if (timer.target === target) {
                this._timers.delete(id);
            }
        });
    }

    /** 暂停 */
    pause(id: number): void {
        const timer = this._timers.get(id);
        if (timer) timer.paused = true;
    }

    /** 恢复 */
    resume(id: number): void {
        const timer = this._timers.get(id);
        if (timer) timer.paused = false;
    }

    /** 每帧调用，驱动所有定时器 */
    update(dt: number): void {
        const toRemove: number[] = [];

        this._timers.forEach((timer, id) => {
            if (timer.paused) return;

            timer.elapsed += dt;
            if (timer.elapsed >= timer.interval) {
                timer.elapsed -= timer.interval;
                try {
                    timer.callback.call(timer.target, dt, ...timer.args);
                } catch (e) {
                    console.error(`TimerManager error [id=${id}]:`, e);
                }

                if (timer.repeat > 0) {
                    timer.repeat--;
                    if (timer.repeat <= 0) {
                        toRemove.push(id);
                    }
                }
            }
        });

        for (const id of toRemove) {
            this._timers.delete(id);
        }
    }

    /** 清除所有定时器 */
    clearAll(): void {
        this._timers.clear();
    }
}
