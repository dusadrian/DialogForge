import { createDroppedScriptFilePlan } from "../files/droppedFilePlan";


export interface ScriptFileDropBindingsOptions {
    getFilePath(file: File): string;
    openScript(filePath: string): void;
    insertCode(code: string): void;
}


const hasFileDropPayload = function(event: DragEvent): boolean {
    try {
        return Array.from(event.dataTransfer?.types || []).includes("Files");
    } catch {
        return false;
    }
};


const getDroppedFilePaths = function(
    event: DragEvent,
    getFilePath: (file: File) => string
): string[] {
    return Array.from(event.dataTransfer?.files || [])
        .map((file) => String(getFilePath(file) || "").trim())
        .filter(Boolean);
};


export const bindScriptFileDropHandling = function(
    target: HTMLElement,
    options: ScriptFileDropBindingsOptions
): void {
    if (!target || target.dataset.scriptDropHandlingBound === "true") {
        return;
    }

    target.dataset.scriptDropHandlingBound = "true";
    target.addEventListener("dragover", (event) => {
        if (!hasFileDropPayload(event)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        try {
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "copy";
            }
        } catch {}
    }, true);
    target.addEventListener("drop", (event) => {
        if (!hasFileDropPayload(event)) {
            return;
        }

        const paths = getDroppedFilePaths(event, options.getFilePath);
        event.preventDefault();
        event.stopPropagation();

        paths.forEach((filePath) => {
            const plan = createDroppedScriptFilePlan(filePath);

            if (plan.kind === "script") {
                options.openScript(filePath);
                return;
            }

            if (plan.kind === "insert-command") {
                options.insertCode(plan.command);
            }
        });
    }, true);
};


export const bindGlobalScriptFileDropGuard = function(): void {
    if (document.documentElement.dataset.fileDropGuardBound === "true") {
        return;
    }

    document.documentElement.dataset.fileDropGuardBound = "true";
    document.addEventListener("dragover", (event) => {
        if (!hasFileDropPayload(event)) {
            return;
        }

        event.preventDefault();
    }, true);
    document.addEventListener("drop", (event) => {
        if (!hasFileDropPayload(event)) {
            return;
        }

        event.preventDefault();
    }, true);
};
