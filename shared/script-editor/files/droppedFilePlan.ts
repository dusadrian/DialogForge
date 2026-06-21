import path = require("path");


export type DroppedScriptFilePlan =
    | { kind: "script"; filePath: string }
    | { kind: "insert-command"; filePath: string; command: string }
    | { kind: "unsupported"; filePath: string };


const escapeRString = function(value: string): string {
    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
};


const objectNameFromFilePath = function(filePath: string): string {
    const extension = path.extname(String(filePath || ""));
    const fileName = String(path.basename(String(filePath || ""), extension) || "").trim();
    let objectName = fileName
        .replace(/[^A-Za-z0-9._]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    if (!objectName) objectName = "object";
    if (!/^[A-Za-z.]/.test(objectName)) objectName = `object_${objectName}`;
    if (/^\.[0-9]/.test(objectName)) objectName = `object_${objectName.slice(1)}`;

    return objectName;
};


export const createDroppedScriptFilePlan = function(
    filePath: string
): DroppedScriptFilePlan {
    const normalizedPath = String(filePath || "").trim();
    const extension = path.extname(normalizedPath).toLowerCase();

    if (extension === ".r") {
        return {
            kind: "script",
            filePath: normalizedPath
        };
    }

    if (extension === ".rds") {
        return {
            kind: "insert-command",
            filePath: normalizedPath,
            command: `${objectNameFromFilePath(normalizedPath)} <- readRDS("${escapeRString(normalizedPath)}")`
        };
    }

    if (extension === ".rdata" || extension === ".rda") {
        return {
            kind: "insert-command",
            filePath: normalizedPath,
            command: `load("${escapeRString(normalizedPath)}")`
        };
    }

    return {
        kind: "unsupported",
        filePath: normalizedPath
    };
};
