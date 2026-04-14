/**
 * ResourceLoader - 资源加载器
 * 封装 Cocos Creator 资源加载，带缓存
 */

import { resources, JsonAsset, SpriteFrame, Prefab, AudioClip, Asset } from 'cc';

type LoadCallback<T> = (err: Error | null, asset: T | null) => void;

export class ResourceLoader {
    private static _instance: ResourceLoader = null!;
    private _cache: Map<string, Asset> = new Map();

    public static get instance(): ResourceLoader {
        if (!this._instance) {
            this._instance = new ResourceLoader();
        }
        return this._instance;
    }

    /** 加载 JSON 配置 */
    loadJson(path: string): Promise<any> {
        const cached = this._cache.get(path);
        if (cached) return Promise.resolve((cached as JsonAsset).json);

        return new Promise((resolve, reject) => {
            resources.load(path, JsonAsset, (err, asset) => {
                if (err) { reject(err); return; }
                this._cache.set(path, asset!);
                resolve(asset!.json);
            });
        });
    }

    /** 加载 SpriteFrame */
    loadSpriteFrame(path: string): Promise<SpriteFrame> {
        const cached = this._cache.get(path);
        if (cached) return Promise.resolve(cached as SpriteFrame);

        return new Promise((resolve, reject) => {
            resources.load(path, SpriteFrame, (err, sf) => {
                if (err) { reject(err); return; }
                this._cache.set(path, sf!);
                resolve(sf!);
            });
        });
    }

    /** 加载 Prefab */
    loadPrefab(path: string): Promise<Prefab> {
        const cached = this._cache.get(path);
        if (cached) return Promise.resolve(cached as Prefab);

        return new Promise((resolve, reject) => {
            resources.load(path, Prefab, (err, prefab) => {
                if (err) { reject(err); return; }
                this._cache.set(path, prefab!);
                resolve(prefab!);
            });
        });
    }

    /** 加载音频 */
    loadAudio(path: string): Promise<AudioClip> {
        const cached = this._cache.get(path);
        if (cached) return Promise.resolve(cached as AudioClip);

        return new Promise((resolve, reject) => {
            resources.load(path, AudioClip, (err, clip) => {
                if (err) { reject(err); return; }
                this._cache.set(path, clip!);
                resolve(clip!);
            });
        });
    }

    /** 加载多个资源 */
    loadDir(path: string, type: typeof Asset): Promise<Asset[]> {
        return new Promise((resolve, reject) => {
            resources.loadDir(path, type, (err, assets) => {
                if (err) { reject(err); return; }
                resolve(assets!);
            });
        });
    }

    /** 清除缓存 */
    clearCache(path?: string): void {
        if (path) {
            this._cache.delete(path);
        } else {
            this._cache.clear();
        }
    }
}
