export interface BrowserStorageAdapter {
    readSettings(): Record<string, unknown>;
    writeSettings(settings: Record<string, unknown>): Record<string, unknown>;
    readWorkspaceState(): Record<string, unknown>;
    writeWorkspaceState(state: Record<string, unknown>): Record<string, unknown>;
}


export interface BrowserStorageAdapterOptions {
    storage?: Storage;
    settingsKey?: string;
    workspaceStateKey?: string;
}


const defaultSettingsKey = "dialogforge.settings";
const defaultWorkspaceStateKey = "dialogforge.workspaceState";


const asRecord = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


const readJsonRecord = function(storage: Storage, key: string): Record<string, unknown> {
    try {
        return asRecord(JSON.parse(storage.getItem(key) || "{}"));
    }
    catch {
        return {};
    }
};


const writeJsonRecord = function(
    storage: Storage,
    key: string,
    value: Record<string, unknown>
): Record<string, unknown> {
    const next = Object.assign({}, asRecord(value));

    storage.setItem(key, JSON.stringify(next));

    return next;
};


export const createBrowserStorageAdapter = function(
    options: BrowserStorageAdapterOptions = {}
): BrowserStorageAdapter {
    const storage = options.storage || window.localStorage;
    const settingsKey = options.settingsKey || defaultSettingsKey;
    const workspaceStateKey = options.workspaceStateKey || defaultWorkspaceStateKey;

    return {
        readSettings: function(): Record<string, unknown> {
            return readJsonRecord(storage, settingsKey);
        },
        writeSettings: function(settings: Record<string, unknown>): Record<string, unknown> {
            return writeJsonRecord(storage, settingsKey, settings);
        },
        readWorkspaceState: function(): Record<string, unknown> {
            return readJsonRecord(storage, workspaceStateKey);
        },
        writeWorkspaceState: function(state: Record<string, unknown>): Record<string, unknown> {
            return writeJsonRecord(storage, workspaceStateKey, state);
        }
    };
};
