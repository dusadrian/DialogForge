import * as fs from "fs";
import * as path from "path";

import {
    isRecord,
    sanitizeFilename
} from "./utils";

export interface WindowBoundsLike {
    getBounds(): {
        width: number;
        height: number;
    };
}

const getSettingsStore = function() {
    try {
        return require("../modules/settings");
    } catch {
        return null;
    }
};

export const ensureDropDir = async function(dir: string): Promise<void> {
    try {
        await fs.promises.mkdir(dir, { recursive: true });
    } catch {}
};

export const writeDroppedFile = async function(
    dir: string,
    filename: string,
    data: Buffer
): Promise<string> {
    await ensureDropDir(dir);

    const cleanName = sanitizeFilename(filename) || "dropped-file";
    const dropPath = path.join(dir, cleanName);

    await fs.promises.writeFile(dropPath, data);

    return dropPath;
};

export const writeDiagnosticFile = async function(
    dir: string,
    filename: string,
    text: string
): Promise<string> {
    await ensureDropDir(dir);

    const timestamp = Date.now();
    const cleanLabel = sanitizeFilename(filename) || `output-${timestamp}`;
    const dumpPath = path.join(dir, `${timestamp}-${cleanLabel}.json`);

    await fs.promises.writeFile(dumpPath, text, "utf8");

    return dumpPath;
};

export const readWindowBounds = function(): { width: number; height: number } | null {
    try {
        const settings = getSettingsStore();
        if (!settings || typeof settings.get !== "function") {
            return null;
        }

        const value = settings.get("windowBounds");
        const bounds = isRecord(value) ? value : {};
        const width = Number(bounds.width) || 0;
        const height = Number(bounds.height) || 0;

        if (width > 400 && height > 300) {
            return { width, height };
        }
    } catch {}

    return null;
};

export const saveWindowBounds = function(win: WindowBoundsLike | null): void {
    if (!win) {
        return;
    }

    try {
        const settings = getSettingsStore();
        if (!settings || typeof settings.set !== "function") {
            return;
        }

        const { width, height } = win.getBounds();
        settings.set("windowBounds", { width, height });
    } catch {}
};
