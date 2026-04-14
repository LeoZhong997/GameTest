/**
 * EventBus - 全局事件系统，解耦各模块
 * 用法：EventBus.instance.on('event', callback)
 */

type EventCallback = (data?: any) => void;

export class EventBus {
    private static _instance: EventBus = null!;
    private _listeners: Map<string, Set<EventCallback>> = new Map();

    public static get instance(): EventBus {
        if (!this._instance) {
            this._instance = new EventBus();
        }
        return this._instance;
    }

    /** 监听事件 */
    on(event: string, callback: EventCallback, target?: any): void {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        // 绑定 target 以支持 off by target
        const bound = target ? callback.bind(target) : callback;
        (bound as any)._original = callback;
        (bound as any)._target = target;
        this._listeners.get(event)!.add(bound);
    }

    /** 取消监听 */
    off(event: string, callback?: EventCallback, target?: any): void {
        const listeners = this._listeners.get(event);
        if (!listeners) return;

        if (!callback) {
            // 移除该事件的所有监听
            this._listeners.delete(event);
            return;
        }

        // 查找匹配的 bound callback
        listeners.forEach(cb => {
            if (cb === callback || (cb as any)._original === callback) {
                if (!target || (cb as any)._target === target) {
                    listeners.delete(cb);
                }
            }
        });

        if (listeners.size === 0) {
            this._listeners.delete(event);
        }
    }

    /** 触发事件 */
    emit(event: string, data?: any): void {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`EventBus error on "${event}":`, e);
                }
            });
        }
    }

    /** 监听一次 */
    once(event: string, callback: EventCallback, target?: any): void {
        const wrapper = (data?: any) => {
            callback.call(target, data);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    }

    /** 清除指定事件或全部 */
    clear(event?: string): void {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
        }
    }
}
