// The script editor renderer sources are compiled twice: as CommonJS for the
// Electron shell and as ES modules for the browser shell. Electron 22 installs
// no host callback for dynamic import(), so evaluating one inside the renderer
// is a fatal V8 error that kills the renderer process outright -- it cannot be
// caught. Every host-specific module load therefore goes through this seam:
// require() under Electron, import() in the browser.


type CommonJsRequire = (specifier: string) => unknown;


export interface ScriptEditorHostModuleRequest {
    commonJsSpecifier: string;
    browserModuleUrl: string;
}


const readCommonJsRequire = function(): CommonJsRequire | null {
    const candidate = (globalThis as Record<string, unknown>).require;

    return typeof candidate === "function"
        ? candidate as CommonJsRequire
        : null;
};


const readDefaultExport = function(loaded: unknown): unknown {
    const record = loaded as { default?: unknown } | null;

    return record && typeof record === "object" && record.default !== undefined
        ? record.default
        : loaded;
};


export const isBrowserHostedScriptEditor = function(): boolean {
    return !readCommonJsRequire();
};


export const loadScriptEditorHostModule = async function(
    request: ScriptEditorHostModuleRequest
): Promise<unknown> {
    const requireModule = readCommonJsRequire();

    if (requireModule) {
        return readDefaultExport(requireModule(request.commonJsSpecifier));
    }

    return readDefaultExport(await import(request.browserModuleUrl));
};
