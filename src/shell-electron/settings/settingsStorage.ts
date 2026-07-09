import * as fs from "fs";
import * as path from "path";


export interface SettingsStoragePaths {
    systemSettingsPath: string;
    profileSettingsPath?: string;
    userSettingsPath: string;
}


export type SettingsRecord = Record<string, unknown>;


const profileOwnedKeys = new Set([
    "dependencies"
]);


const asRecord = function(value: unknown): SettingsRecord {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as SettingsRecord
        : {};
};


const readRawJsonFile = function(filePath: string): SettingsRecord {
    try {
        return asRecord(JSON.parse(fs.readFileSync(filePath, "utf8") || "{}"));
    }
    catch {
        return {};
    }
};


const sanitizeSettingsPayload = function(value: unknown): SettingsRecord {
    const next = Object.assign({}, asRecord(value));

    delete next.windowStates;
    delete next.dialogs;
    delete next.splitbyState;
    delete next.weightbyState;
    delete next.filterState;

    return next;
};


const stripProfileOwnedKeys = function(value: unknown): SettingsRecord {
    const next = sanitizeSettingsPayload(value);

    profileOwnedKeys.forEach((key) => {
        delete next[key];
    });

    return next;
};


const normalizeStringArray = function(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((item) => {
        return String(item ?? "").trim();
    }).filter(Boolean);
};


const mergeUniqueStringArrays = function(...layers: unknown[]): string[] {
    return Array.from(new Set(layers.flatMap((layer) => {
        return normalizeStringArray(layer);
    })));
};


const mergeObjectLayers = function(...layers: unknown[]): SettingsRecord {
    return Object.assign({}, ...layers.map(asRecord));
};


export const mergeSettingsLayers = function(
    systemLayer: SettingsRecord,
    profileLayer: SettingsRecord,
    userLayer: SettingsRecord
): SettingsRecord {
    const merged = Object.assign(
        {},
        sanitizeSettingsPayload(systemLayer),
        sanitizeSettingsPayload(userLayer)
    );
    const dependencies = mergeUniqueStringArrays(
        systemLayer.dependencies,
        profileLayer.dependencies,
        userLayer.dependencies
    );
    const dialogRuntimeRequirements = mergeObjectLayers(
        systemLayer.dialogRuntimeRequirements,
        profileLayer.dialogRuntimeRequirements,
        userLayer.dialogRuntimeRequirements
    );

    if (dependencies.length > 0) {
        merged.dependencies = dependencies;
    }
    else {
        delete merged.dependencies;
    }

    if (Object.keys(dialogRuntimeRequirements).length > 0) {
        merged.dialogRuntimeRequirements = dialogRuntimeRequirements;
    }
    else {
        delete merged.dialogRuntimeRequirements;
    }

    if (systemLayer.terminalSettings || userLayer.terminalSettings) {
        merged.terminalSettings = mergeObjectLayers(
            systemLayer.terminalSettings,
            userLayer.terminalSettings
        );
    }

    return merged;
};


export const readEffectiveSettings = function(paths: SettingsStoragePaths): SettingsRecord {
    return mergeSettingsLayers(
        sanitizeSettingsPayload(readRawJsonFile(paths.systemSettingsPath)),
        sanitizeSettingsPayload(readRawJsonFile(paths.profileSettingsPath || "")),
        sanitizeSettingsPayload(readRawJsonFile(paths.userSettingsPath))
    );
};


export const writeUserSettings = function(paths: SettingsStoragePaths, payload: SettingsRecord): SettingsRecord {
    const existing = readRawJsonFile(paths.userSettingsPath);
    const next = Object.assign(
        {},
        stripProfileOwnedKeys(existing),
        stripProfileOwnedKeys(payload)
    );

    fs.mkdirSync(path.dirname(paths.userSettingsPath), { recursive: true });
    fs.writeFileSync(paths.userSettingsPath, JSON.stringify(next, null, 2), "utf8");

    return next;
};
