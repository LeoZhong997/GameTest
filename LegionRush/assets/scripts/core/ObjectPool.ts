/**
 * ObjectPool - 通用对象池
 * 100v100单位频繁创建销毁，必须用对象池复用
 */

export class ObjectPool<T> {
    private _pool: T[] = [];
    private _factory: () => T;
    private _reset: (obj: T) => void;
    private _maxSize: number;

    /**
     * @param factory 创建对象的工厂函数
     * @param reset 重置对象状态的函数
     * @param initialSize 预创建数量
     * @param maxSize 池最大容量，超出时丢弃
     */
    constructor(
        factory: () => T,
        reset: (obj: T) => void,
        initialSize: number = 0,
        maxSize: number = 500
    ) {
        this._factory = factory;
        this._reset = reset;
        this._maxSize = maxSize;
        for (let i = 0; i < initialSize; i++) {
            this._pool.push(factory());
        }
    }

    /** 从池中获取一个对象 */
    get(): T {
        if (this._pool.length > 0) {
            return this._pool.pop()!;
        }
        return this._factory();
    }

    /** 归还对象到池中 */
    put(obj: T): void {
        if (this._pool.length < this._maxSize) {
            this._reset(obj);
            this._pool.push(obj);
        }
    }

    /** 批量获取 */
    getMultiple(count: number): T[] {
        const result: T[] = [];
        for (let i = 0; i < count; i++) {
            result.push(this.get());
        }
        return result;
    }

    /** 批量归还 */
    putMultiple(objs: T[]): void {
        for (const obj of objs) {
            this.put(obj);
        }
    }

    /** 当前池中可用数量 */
    get size(): number {
        return this._pool.length;
    }

    /** 清空池 */
    clear(): void {
        this._pool.length = 0;
    }
}
