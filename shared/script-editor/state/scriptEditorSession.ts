export interface ScriptEditorSessionTab {
    filePath: string;
    scrollTop: number;
}


export interface ScriptEditorSessionState {
    openFiles: string[];
    activeFile: string;
    scrollByFile: Record<string, number>;
}


const emptySession = function(): ScriptEditorSessionState {
    return {
        openFiles: [],
        activeFile: "",
        scrollByFile: {}
    };
};


export const normalizeScriptFilePath = function(value: string): string {
    return String(value || "").replace(/\\/g, "/");
};


export const createScriptEditorSessionKey = function(appPath: unknown): string {
    const scope = normalizeScriptFilePath(String(appPath || "").trim() || "default");

    return `app.scriptEditor.tabs.v1.${scope}`;
};


export const createScriptEditorSessionState = function(
    tabs: ScriptEditorSessionTab[],
    activeFilePath: string
): ScriptEditorSessionState {
    const openFiles: string[] = [];
    const seen = new Set<string>();
    const scrollByFile: Record<string, number> = {};

    tabs.forEach((tab) => {
        const filePath = normalizeScriptFilePath(tab.filePath);

        if (!filePath) return;

        if (!seen.has(filePath)) {
            seen.add(filePath);
            openFiles.push(filePath);
        }

        const scrollTop = Number(tab.scrollTop);

        if (Number.isFinite(scrollTop) && scrollTop >= 0) {
            scrollByFile[filePath] = Math.round(scrollTop);
        }
    });

    return {
        openFiles,
        activeFile: normalizeScriptFilePath(activeFilePath),
        scrollByFile
    };
};


export const parseScriptEditorSessionState = function(
    value: string | null | undefined
): ScriptEditorSessionState {
    if (!value) return emptySession();

    try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        const rawFiles = Array.isArray(parsed.openFiles) ? parsed.openFiles : [];
        const openFiles: string[] = [];
        const seen = new Set<string>();

        rawFiles.forEach((entry) => {
            const filePath = normalizeScriptFilePath(String(entry || ""));

            if (!filePath || seen.has(filePath)) return;

            seen.add(filePath);
            openFiles.push(filePath);
        });

        const scrollByFile: Record<string, number> = {};
        const storedScroll = parsed.scrollByFile && typeof parsed.scrollByFile === "object"
            ? parsed.scrollByFile as Record<string, unknown>
            : {};

        Object.keys(storedScroll).forEach((key) => {
            const filePath = normalizeScriptFilePath(key);
            const scrollTop = Number(storedScroll[key]);

            if (!filePath || !Number.isFinite(scrollTop) || scrollTop < 0) return;

            scrollByFile[filePath] = scrollTop;
        });

        return {
            openFiles,
            activeFile: normalizeScriptFilePath(String(parsed.activeFile || "")),
            scrollByFile
        };
    } catch {
        return emptySession();
    }
};
