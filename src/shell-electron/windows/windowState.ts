import * as fs from "fs";
import * as path from "path";
import {
    app,
    screen,
    type BrowserWindow,
    type BrowserWindowConstructorOptions,
    type Rectangle
} from "electron";


type StoredWindowState = {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    maximized?: boolean;
};


type WindowStateMap = Record<string, StoredWindowState>;


type WindowStateOptions = {
    persistPosition?: boolean;
    persistSize?: boolean;
};


const defaultOptions: Required<WindowStateOptions> = {
    persistPosition: true,
    persistSize: true
};


const isFiniteNumber = function(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
};


const resolveWindowStateStoragePath = function(legacySettingsPath: string): string {
    try {
        return path.join(app.getPath("userData"), "settings.json");
    } catch {
        return legacySettingsPath;
    }
};


const readWindowStateMap = function(filePath: string): WindowStateMap {
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw || "{}");
        const states = parsed && typeof parsed === "object" ? (parsed as { windowStates?: unknown }).windowStates : null;

        return states && typeof states === "object" ? states as WindowStateMap : {};
    } catch {
        return {};
    }
};


const getWindowStateMap = function(settingsPath: string): WindowStateMap {
    const storagePath = resolveWindowStateStoragePath(settingsPath);
    const current = readWindowStateMap(storagePath);

    if (Object.keys(current).length > 0 || storagePath === settingsPath) {
        return current;
    }

    return readWindowStateMap(settingsPath);
};


const writeWindowStateMap = function(settingsPath: string, patch: WindowStateMap): void {
    const storagePath = resolveWindowStateStoragePath(settingsPath);

    try {
        let payload: Record<string, unknown> = {};

        try {
            const raw = fs.readFileSync(storagePath, "utf8");
            const parsed = JSON.parse(raw || "{}");
            payload = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
        } catch {}

        payload.windowStates = patch;
        fs.mkdirSync(path.dirname(storagePath), { recursive: true });
        fs.writeFileSync(storagePath, JSON.stringify(payload), "utf8");
    } catch {}
};


const canRestorePosition = function(): boolean {
    if (process.platform !== "linux") {
        return true;
    }

    return !(String(process.env.XDG_SESSION_TYPE || "").toLowerCase() === "wayland" || process.env.WAYLAND_DISPLAY);
};


const intersectsAnyDisplay = function(bounds: Rectangle): boolean {
    try {
        return screen.getAllDisplays().some((display) => {
            const area = display.workArea;
            const left = Math.max(bounds.x, area.x);
            const top = Math.max(bounds.y, area.y);
            const right = Math.min(bounds.x + bounds.width, area.x + area.width);
            const bottom = Math.min(bounds.y + bounds.height, area.y + area.height);

            return right - left >= 80 && bottom - top >= 60;
        });
    } catch {
        return true;
    }
};


const getStoredWindowState = function(
    settingsPath: string,
    key: string,
    defaults: { width: number; height: number },
    options: Required<WindowStateOptions>
): StoredWindowState | null {
    const entry = getWindowStateMap(settingsPath)[key];

    if (!entry || typeof entry !== "object") {
        return null;
    }

    const width = options.persistSize && isFiniteNumber(entry.width) && entry.width > 200
        ? Math.round(entry.width)
        : Math.round(defaults.width);
    const height = options.persistSize && isFiniteNumber(entry.height) && entry.height > 120
        ? Math.round(entry.height)
        : Math.round(defaults.height);
    const next: StoredWindowState = {
        width,
        height,
        maximized: Boolean(entry.maximized)
    };

    if (
        options.persistPosition &&
        canRestorePosition() &&
        isFiniteNumber(entry.x) &&
        isFiniteNumber(entry.y)
    ) {
        const candidate = { x: Math.round(entry.x), y: Math.round(entry.y), width, height };

        if (intersectsAnyDisplay(candidate)) {
            next.x = candidate.x;
            next.y = candidate.y;
        }
    }

    return next;
};


export const applySavedWindowState = function(
    settingsPath: string,
    key: string,
    baseOptions: BrowserWindowConstructorOptions,
    rawOptions: WindowStateOptions = {}
): BrowserWindowConstructorOptions {
    const options = Object.assign({}, defaultOptions, rawOptions);
    const defaults = {
        width: Math.round(Number(baseOptions.width) || 800),
        height: Math.round(Number(baseOptions.height) || 600)
    };
    const stored = getStoredWindowState(settingsPath, key, defaults, options);

    if (!stored) {
        return baseOptions;
    }

    const next: BrowserWindowConstructorOptions = Object.assign({}, baseOptions, {
        width: stored.width || defaults.width,
        height: stored.height || defaults.height
    });

    if (options.persistPosition && isFiniteNumber(stored.x) && isFiniteNumber(stored.y)) {
        next.x = stored.x;
        next.y = stored.y;
        delete (next as { center?: unknown }).center;
    }

    return next;
};


export const wireWindowStatePersistence = function(
    win: BrowserWindow,
    settingsPath: string,
    key: string,
    rawOptions: WindowStateOptions = {}
): void {
    const options = Object.assign({}, defaultOptions, rawOptions);
    let saveTimer: NodeJS.Timeout | null = null;

    const saveNow = function(): void {
        try {
            const current = getWindowStateMap(settingsPath);
            const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
            const next: StoredWindowState = {
                maximized: win.isMaximized()
            };

            if (options.persistSize) {
                next.width = Math.round(bounds.width);
                next.height = Math.round(bounds.height);
            }

            if (options.persistPosition && canRestorePosition()) {
                next.x = Math.round(bounds.x);
                next.y = Math.round(bounds.y);
            }

            current[key] = next;
            writeWindowStateMap(settingsPath, current);
        } catch {}
    };

    const scheduleSave = function(): void {
        if (saveTimer) {
            clearTimeout(saveTimer);
        }

        saveTimer = setTimeout(() => {
            saveTimer = null;
            saveNow();
        }, 160);
    };

    win.on("move", scheduleSave);
    win.on("resize", scheduleSave);
    win.on("close", () => {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }

        saveNow();
    });

    const defaults = {
        width: Math.round(Number(win.getBounds().width) || 800),
        height: Math.round(Number(win.getBounds().height) || 600)
    };
    const stored = getStoredWindowState(settingsPath, key, defaults, options);

    if (stored?.maximized) {
        win.once("ready-to-show", () => {
            try {
                if (!win.isDestroyed()) {
                    win.maximize();
                }
            } catch {}
        });
    }
};
