/**
 * SaveSystem - 本地存储管理
 * 兼容微信小游戏 wx.setStorageSync 和浏览器 localStorage
 */

const STORAGE_PREFIX = 'legion_rush_';

export class SaveSystem {
    private static _instance: SaveSystem = null!;

    public static get instance(): SaveSystem {
        if (!this._instance) {
            this._instance = new SaveSystem();
        }
        return this._instance;
    }

    /** 保存数据 */
    save(key: string, data: any): void {
        try {
            const json = JSON.stringify(data);
            const fullKey = STORAGE_PREFIX + key;
            if (typeof wx !== 'undefined' && wx.setStorageSync) {
                wx.setStorageSync(fullKey, json);
            } else {
                localStorage.setItem(fullKey, json);
            }
        } catch (e) {
            console.error(`SaveSystem.save failed [${key}]:`, e);
        }
    }

    /** 读取数据 */
    load<T>(key: string, defaultValue: T = null as T): T {
        try {
            const fullKey = STORAGE_PREFIX + key;
            let json: string | null = null;
            if (typeof wx !== 'undefined' && wx.getStorageSync) {
                json = wx.getStorageSync(fullKey) || null;
            } else {
                json = localStorage.getItem(fullKey);
            }
            if (json) {
                return JSON.parse(json) as T;
            }
        } catch (e) {
            console.error(`SaveSystem.load failed [${key}]:`, e);
        }
        return defaultValue;
    }

    /** 删除数据 */
    delete(key: string): void {
        try {
            const fullKey = STORAGE_PREFIX + key;
            if (typeof wx !== 'undefined' && wx.removeStorageSync) {
                wx.removeStorageSync(fullKey);
            } else {
                localStorage.removeItem(fullKey);
            }
        } catch (e) {
            console.error(`SaveSystem.delete failed [${key}]:`, e);
        }
    }

    /** 检查是否存在 */
    has(key: string): boolean {
        const fullKey = STORAGE_PREFIX + key;
        if (typeof wx !== 'undefined' && wx.getStorageSync) {
            return !!wx.getStorageSync(fullKey);
        }
        return localStorage.getItem(fullKey) !== null;
    }

    /** 清除所有本游戏数据 */
    clear(): void {
        if (typeof wx !== 'undefined' && wx.clearStorageSync) {
            wx.clearStorageSync();
        } else {
            const toRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(STORAGE_PREFIX)) {
                    toRemove.push(k);
                }
            }
            toRemove.forEach(k => localStorage.removeItem(k));
        }
    }
}
