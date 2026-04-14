/**
 * ConfigManager - JSON 配置表管理
 * 从 resources/configs/ 加载所有 JSON 配置
 */

import { resources, JsonAsset } from 'cc';

interface ConfigTable {
    [key: string]: any;
}

export class ConfigManager {
    private static _instance: ConfigManager = null!;
    private _configs: Map<string, ConfigTable> = new Map();
    private _loaded: boolean = false;

    public static get instance(): ConfigManager {
        if (!this._instance) {
            this._instance = new ConfigManager();
        }
        return this._instance;
    }

    get loaded(): boolean {
        return this._loaded;
    }

    /** 加载所有配置表 */
    async loadAll(): Promise<void> {
        const configFiles = [
            'configs/units',
            'configs/skills',
            'configs/stages',
            'configs/items',
        ];

        const promises = configFiles.map(name =>
            new Promise<void>((resolve) => {
                resources.load(name, JsonAsset, (err, asset) => {
                    if (err) {
                        console.warn(`ConfigManager: ${name} not loaded - ${err.message}`);
                        resolve();
                        return;
                    }
                    this._configs.set(name, asset!.json!);
                    resolve();
                });
            })
        );

        await Promise.all(promises);
        this._loaded = true;
        console.log(`ConfigManager: loaded ${this._configs.size} config tables`);
    }

    /** 获取整张配置表 */
    getConfig(tableName: string): ConfigTable {
        return this._configs.get(tableName) || {};
    }

    /** 获取单条记录 */
    getRecord(tableName: string, id: string): any | null {
        const table = this._configs.get(tableName);
        return table ? (table[id] ?? null) : null;
    }

    /** 获取所有记录 */
    getRecords(tableName: string): any[] {
        const table = this._configs.get(tableName);
        return table ? Object.values(table) : [];
    }

    /** 获取所有 key */
    getKeys(tableName: string): string[] {
        const table = this._configs.get(tableName);
        return table ? Object.keys(table) : [];
    }
}
