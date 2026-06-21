export interface ConsoleHistorySettingsStoreOptions {
    defaultProductId: string;
    defaultRuntimeId: string;
    maximumItems?: number;
    readSettings(): Record<string, unknown>;
    writeSettings(settings: Record<string, unknown>): void;
}


export interface ConsoleHistorySettingsStore {
    read(input: Record<string, unknown>): string[];
    write(input: Record<string, unknown>): string[];
}


const normalizeHistoryEntry = function(value: unknown): string {
    return String(value ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();
};


export const createConsoleHistorySettingsStore = function(
    options: ConsoleHistorySettingsStoreOptions
): ConsoleHistorySettingsStore {
    const maximumItems = Math.max(
        1,
        Number(options.maximumItems || 500)
    );
    const settingsKey = function(input: Record<string, unknown>): string {
        const productId = String(
            input?.productId || options.defaultProductId || "base"
        ).trim() || "base";
        const runtimeId = String(
            input?.runtimeId || options.defaultRuntimeId || "none"
        ).trim() || "none";

        return ["consoleHistory", productId, runtimeId].join(".");
    };
    const normalizeHistory = function(value: unknown): string[] {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map(normalizeHistoryEntry)
            .filter(Boolean)
            .slice(-maximumItems);
    };
    const read = function(input: Record<string, unknown>): string[] {
        const settings = options.readSettings();

        return normalizeHistory(settings[settingsKey(input)]);
    };
    const write = function(input: Record<string, unknown>): string[] {
        const key = settingsKey(input);
        const history = normalizeHistory(input?.history);

        options.writeSettings(Object.assign({}, options.readSettings(), {
            [key]: history
        }));

        return history;
    };

    return {
        read,
        write
    };
};
