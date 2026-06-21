export interface ScriptDroppedFilePathReaderOptions {
    readDroppedFilePath?: (file: File) => string;
}


export interface ScriptDroppedFilePathReader {
    read(file: File): string;
}


export const createScriptDroppedFilePathReader = function(
    options: ScriptDroppedFilePathReaderOptions
): ScriptDroppedFilePathReader {
    const read = function(file: File): string {
        try {
            if (options.readDroppedFilePath) {
                return String(
                    options.readDroppedFilePath(file) || ""
                ).trim();
            }
        } catch {}

        const legacyFile = file as File & { path?: string };

        return String(legacyFile.path || "").trim();
    };

    return {
        read
    };
};
