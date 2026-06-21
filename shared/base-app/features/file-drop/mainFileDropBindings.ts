import type {
    PathInfoResult
} from "../../../shell-electron/filesystem/openFileResult";


export type MainFileDropAction =
    | "working-directory"
    | "script"
    | "workspace"
    | "import"
    | "unsupported";


export interface MainFileDropResult {
    status: "handled" | "unsupported" | "failed";
    action: MainFileDropAction;
    path: string;
    message: string;
}


export interface MainFileDropBindings {
    inspectPath(filePath: string): Promise<PathInfoResult>;
    setWorkingDirectory(pathInfo: PathInfoResult): Promise<void>;
    openScript(pathInfo: PathInfoResult): Promise<void>;
    loadWorkspace(pathInfo: PathInfoResult): Promise<void>;
    importFile(pathInfo: PathInfoResult): Promise<void> | void;
    getFilePath(file: File): string;
    reportDropResult?(result: MainFileDropResult): void;
}


const importExtensions = new Set([
    ".csv",
    ".txt",
    ".tsv",
    ".tab",
    ".dat",
    ".sav",
    ".zsav",
    ".por",
    ".dta",
    ".sas7bdat",
    ".xpt",
    ".xls",
    ".xlsx",
    ".rds"
]);


export const classifyMainFileDrop = function(
    pathInfo: PathInfoResult
): MainFileDropAction {
    if (pathInfo.kind === "directory") {
        return "working-directory";
    }

    if (pathInfo.kind !== "file") {
        return "unsupported";
    }

    if (pathInfo.extension === ".r") {
        return "script";
    }

    if (
        pathInfo.extension === ".rdata"
        || pathInfo.extension === ".rda"
    ) {
        return "workspace";
    }

    if (importExtensions.has(pathInfo.extension)) {
        return "import";
    }

    return "unsupported";
};


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
    const files = Array.from(event.dataTransfer?.files || []);
    const paths: string[] = [];

    files.forEach((file) => {
        const filePath = String(getFilePath(file) || "");

        if (filePath) {
            paths.push(filePath);
        }
    });

    return paths;
};


export const bindMainFileDropHandling = function(
    bindings: MainFileDropBindings
): void {
    let dropQueue: Promise<void> = Promise.resolve();

    const reportDropResult = function(result: MainFileDropResult): void {
        try {
            if (bindings.reportDropResult) {
                bindings.reportDropResult(result);
            }
        }
        catch {
            // Drop reporting is best-effort; file handling should remain queued.
        }
    };

    const handlePath = async function(filePath: string): Promise<MainFileDropResult> {
        const pathInfo = await bindings.inspectPath(filePath);
        const action = classifyMainFileDrop(pathInfo);

        if (action === "working-directory") {
            await bindings.setWorkingDirectory(pathInfo);

            return {
                status: "handled",
                action,
                path: pathInfo.path,
                message: `Set working directory from ${pathInfo.path}.`
            };
        }

        if (action === "script") {
            await bindings.openScript(pathInfo);

            return {
                status: "handled",
                action,
                path: pathInfo.path,
                message: `Opened script ${pathInfo.path}.`
            };
        }

        if (action === "workspace") {
            await bindings.loadWorkspace(pathInfo);

            return {
                status: "handled",
                action,
                path: pathInfo.path,
                message: `Loaded workspace ${pathInfo.path}.`
            };
        }

        if (action === "import") {
            await bindings.importFile(pathInfo);

            return {
                status: "handled",
                action,
                path: pathInfo.path,
                message: `Prepared import for ${pathInfo.path}.`
            };
        }

        return {
            status: "unsupported",
            action,
            path: pathInfo.path || filePath,
            message: `Unsupported dropped file: ${pathInfo.path || filePath}.`
        };
    };

    const queuePath = function(filePath: string): void {
        dropQueue = dropQueue.then(async () => {
            try {
                reportDropResult(await handlePath(filePath));
            }
            catch (error) {
                reportDropResult({
                    status: "failed",
                    action: "unsupported",
                    path: filePath,
                    message: error instanceof Error ? error.message : String(error)
                });
            }
        });
    };

    window.addEventListener("dragover", (event) => {
        if (!hasFileDropPayload(event)) {
            return;
        }

        event.preventDefault();

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "copy";
        }
    }, true);

    window.addEventListener("drop", (event) => {
        if (!hasFileDropPayload(event)) {
            return;
        }

        const filePaths = getDroppedFilePaths(event, bindings.getFilePath);
        event.preventDefault();

        filePaths.forEach(queuePath);
    }, true);
};
