export type DroppedScriptFilePlan =
    | { kind: "script"; filePath: string }
    | { kind: "insert-command"; filePath: string; command: string }
    | { kind: "unsupported"; filePath: string };


export type CreateDroppedScriptFilePlan = (
    filePath: string
) => DroppedScriptFilePlan;


export const readDroppedFileExtension = function(value: string): string {
    const name = String(value || "").split(/[\\/]/).filter(Boolean).pop() || "";
    const index = name.lastIndexOf(".");

    return index > 0 ? name.slice(index) : "";
};


export const createDroppedScriptFilePlan = function(
    filePath: string
): DroppedScriptFilePlan {
    const normalizedPath = String(filePath || "").trim();
    const extension = readDroppedFileExtension(normalizedPath).toLowerCase();

    if (extension === ".r") {
        return {
            kind: "script",
            filePath: normalizedPath
        };
    }

    return {
        kind: "unsupported",
        filePath: normalizedPath
    };
};
