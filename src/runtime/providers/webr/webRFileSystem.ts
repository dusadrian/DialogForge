export interface WebRFileSystemRuntime {
    FS: {
        mkdir(path: string): Promise<unknown> | unknown;
        writeFile?(
            path: string,
            content: Uint8Array
        ): Promise<unknown> | unknown;
    };
}

export interface WebRWorkingDirectoryRuntime extends WebRFileSystemRuntime {
    evalRVoid(command: string): Promise<void>;
}

export const sanitizeWebRFileName = function(
    name: unknown,
    fallback: unknown = "file"
): string {
    const fallbackName = String(fallback || "file");
    const value = String(name || fallbackName)
        .replace(/[\\/:\0]/g, "_")
        .replace(/^\.+$/, "")
        .trim();

    return value || fallbackName;
};


export const createWebRFilePath = function(
    directory: unknown,
    fileName: unknown
): string {
    const base = String(directory || "/web")
        .replace(/\/+$/g, "")
        || "/web";

    return `${base}/${sanitizeWebRFileName(fileName)}`;
};


export const ensureWebRDirectory = async function(
    runtime: WebRFileSystemRuntime,
    directory: unknown
): Promise<void> {
    const parts = String(directory || "")
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean);
    let current = "";

    for (const part of parts) {
        current += `/${part}`;
        try {
            await runtime.FS.mkdir(current);
        }
        catch {
            // Existing WebR directories are fine.
        }
    }
};

export const writeWebRFile = async function(
    runtime: WebRFileSystemRuntime,
    directory: unknown,
    fileName: unknown,
    content: Uint8Array
): Promise<string> {
    if (!runtime.FS.writeFile) {
        throw new Error("WebR file writing is unavailable.");
    }

    const path = createWebRFilePath(directory, fileName);

    await ensureWebRDirectory(runtime, directory);
    await runtime.FS.writeFile(path, content);

    return path;
};


export const setWebRWorkingDirectory = async function(
    runtime: WebRWorkingDirectoryRuntime,
    directory: unknown
): Promise<void> {
    const path = String(directory || "");

    await ensureWebRDirectory(runtime, path);
    await runtime.evalRVoid(`setwd(${JSON.stringify(path)})`);
};
