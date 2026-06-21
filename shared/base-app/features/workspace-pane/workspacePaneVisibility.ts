export interface WorkspacePaneWindowRequest {
    visible: boolean;
    paneWidth: number;
    restoreExistingExpansion?: boolean;
    syncExistingExpansion?: boolean;
}

export interface WorkspacePaneVisibilityOptions {
    document: Document;
    storage: Storage;
    settingsKey?: string;
    fallbackWidth?: number;
    readZoomFactor: () => number;
    readSettings: () => Promise<Record<string, unknown>>;
    writeSettings: (settings: Record<string, unknown>) => void;
    setWindowVisible: (request: WorkspacePaneWindowRequest) => Promise<unknown>;
    resizeConsole: () => void;
    focusConsole: () => void;
}

export interface SetWorkspacePaneVisibilityOptions {
    adjustWindow?: boolean;
    persist?: boolean;
    restoreExistingExpansion?: boolean;
}

export interface WorkspacePaneVisibilityController {
    isVisible: () => boolean;
    readPersisted: () => Promise<boolean>;
    apply: (
        visible: boolean,
        options?: Pick<SetWorkspacePaneVisibilityOptions, "persist">
    ) => void;
    set: (
        visible: boolean,
        options?: SetWorkspacePaneVisibilityOptions
    ) => Promise<void>;
    syncWindowWidth: () => Promise<void>;
    toggle: (sourceButton?: HTMLButtonElement) => Promise<void>;
}

const DEFAULT_SETTINGS_KEY = "app.main.workspacePaneVisible";
const DEFAULT_PANE_WIDTH = 296;

const parseVisibleValue = function(value: unknown): boolean | null {
    if (typeof value === "boolean") {
        return value;
    }

    const raw = String(value ?? "")
        .trim()
        .toLowerCase();

    if (raw === "1" || raw === "true") {
        return true;
    }

    if (raw === "0" || raw === "false") {
        return false;
    }

    return null;
};

export const createWorkspacePaneVisibility = function(
    options: WorkspacePaneVisibilityOptions
): WorkspacePaneVisibilityController {
    const settingsKey = options.settingsKey || DEFAULT_SETTINGS_KEY;
    const fallbackWidth = Math.max(
        1,
        Number(options.fallbackWidth || DEFAULT_PANE_WIDTH)
    );
    let visible = false;

    const scaleForZoom = function(value: number): number {
        const zoomFactor = Math.max(
            0.5,
            Math.min(3, Number(options.readZoomFactor()) || 1)
        );

        return Math.ceil(Math.max(0, Number(value) || 0) * zoomFactor);
    };

    const readTargetWidth = function(): number {
        const pane = options.document.getElementById("workspacePane");

        try {
            const rect = pane?.getBoundingClientRect?.();
            const width = Number(rect?.width || 0);

            if (Number.isFinite(width) && width > 0) {
                return scaleForZoom(width);
            }
        }
        catch {}

        return scaleForZoom(fallbackWidth);
    };

    const updateToggle = function(): void {
        const button = options.document.getElementById(
            "workspacePaneToggle"
        ) as HTMLButtonElement | null;
        const icon = button?.querySelector(".codicon");

        if (!button) {
            throw new Error("Missing workspace pane toggle button.");
        }

        options.document.body.classList.toggle(
            "workspace-pane-hidden",
            !visible
        );
        options.document.body.classList.toggle(
            "workspace-pane-visible",
            visible
        );

        const label = visible ? "Hide Workspace" : "Show Workspace";

        button.dataset.tooltip = label;
        button.setAttribute("aria-label", label);

        if (icon) {
            icon.classList.toggle("codicon-chevron-left", visible);
            icon.classList.toggle("codicon-chevron-right", !visible);
        }
    };

    const writePersisted = function(): void {
        try {
            options.storage.setItem(settingsKey, visible ? "1" : "0");
        }
        catch {}

        options.writeSettings({
            [settingsKey]: visible
        });
    };

    const apply = function(
        nextVisible: boolean,
        applyOptions: Pick<SetWorkspacePaneVisibilityOptions, "persist"> = {}
    ): void {
        visible = Boolean(nextVisible);

        if (applyOptions.persist !== false) {
            writePersisted();
        }

        updateToggle();

        setTimeout(function() {
            options.resizeConsole();
        }, 0);
    };

    const readPersisted = async function(): Promise<boolean> {
        try {
            const settings = await options.readSettings();
            const persisted = parseVisibleValue(settings[settingsKey]);

            if (persisted !== null) {
                return persisted;
            }
        }
        catch {}

        try {
            const persisted = parseVisibleValue(
                options.storage.getItem(settingsKey)
            );

            if (persisted !== null) {
                return persisted;
            }
        }
        catch {}

        return false;
    };

    const set = async function(
        nextVisible: boolean,
        setOptions: SetWorkspacePaneVisibilityOptions = {}
    ): Promise<void> {
        const normalizedVisible = Boolean(nextVisible);

        if (setOptions.adjustWindow === false) {
            apply(normalizedVisible, {
                persist: setOptions.persist
            });
            return;
        }

        if (normalizedVisible) {
            await options.setWindowVisible({
                visible: true,
                paneWidth: readTargetWidth(),
                restoreExistingExpansion:
                    setOptions.restoreExistingExpansion === true
            });
            apply(true, {
                persist: setOptions.persist
            });
            return;
        }

        apply(false, {
            persist: setOptions.persist
        });
        await options.setWindowVisible({
            visible: false,
            paneWidth: readTargetWidth()
        });
    };

    const toggle = async function(
        sourceButton?: HTMLButtonElement
    ): Promise<void> {
        try {
            await set(!visible);
        }
        finally {
            try {
                sourceButton?.blur();
            }
            catch {}

            options.focusConsole();
        }
    };
    const syncWindowWidth = async function(): Promise<void> {
        if (!visible) {
            return;
        }

        await options.setWindowVisible({
            visible: true,
            paneWidth: readTargetWidth(),
            syncExistingExpansion: true
        });
        options.resizeConsole();
    };

    return {
        isVisible: function(): boolean {
            return visible;
        },
        readPersisted,
        apply,
        set,
        syncWindowWidth,
        toggle
    };
};
