import {
    createDroppedScriptFilePlan,
    readDroppedFileExtension,
    type DroppedScriptFilePlan
} from "../../../../script-editor/files/droppedFilePlan";
import {
    asRStringLiteral
} from "./rLiteral";


const objectNameFromFilePath = function(filePath: string): string {
    const normalized = String(filePath || "");
    const baseName = normalized.split(/[\\/]/).filter(Boolean).pop() || "";
    const extension = readDroppedFileExtension(baseName);
    const fileName = String(
        extension ? baseName.slice(0, -extension.length) : baseName
    ).trim();
    let objectName = fileName
        .replace(/[^A-Za-z0-9._]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    if (!objectName) objectName = "object";
    if (!/^[A-Za-z.]/.test(objectName)) objectName = `object_${objectName}`;
    if (/^\.[0-9]/.test(objectName)) objectName = `object_${objectName.slice(1)}`;

    return objectName;
};


export const createRDroppedScriptFilePlan = function(
    filePath: string
): DroppedScriptFilePlan {
    const basePlan = createDroppedScriptFilePlan(filePath);

    if (basePlan.kind !== "unsupported") {
        return basePlan;
    }

    const normalizedPath = String(filePath || "").trim();
    const extension = readDroppedFileExtension(normalizedPath).toLowerCase();

    if (extension === ".rds") {
        return {
            kind: "insert-command",
            filePath: normalizedPath,
            command: `${objectNameFromFilePath(normalizedPath)} <- readRDS(${asRStringLiteral(normalizedPath)})`
        };
    }

    if (extension === ".rdata" || extension === ".rda") {
        return {
            kind: "insert-command",
            filePath: normalizedPath,
            command: `load(${asRStringLiteral(normalizedPath)})`
        };
    }

    return basePlan;
};
