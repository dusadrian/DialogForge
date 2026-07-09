export interface WebRFileSystemRuntime {
    FS: {
        mkdir(path: string): Promise<unknown> | unknown;
    };
}

export interface WebRWorkingDirectoryRuntime extends WebRFileSystemRuntime {
    evalRVoid(command: string): Promise<void>;
}


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


export const setWebRWorkingDirectory = async function(
    runtime: WebRWorkingDirectoryRuntime,
    directory: unknown
): Promise<void> {
    const path = String(directory || "");

    await ensureWebRDirectory(runtime, path);
    await runtime.evalRVoid(`setwd(${JSON.stringify(path)})`);
};
