import type {
    ImportPreviewRequest
} from "../runtime/tabular-data/importPreview";
import {
    type ImportPreviewResult
} from "../runtime/tabular-data/importPreviewResult";
import {
    ensureWebRDirectory
} from "../runtime/providers/webr/webRFileSystem";
import {
    createRImportPreviewCommand,
    resolveRImportPreviewReader
} from "../runtime/providers/r/import/rImportPreviewCommand";
import {
    createVisibleImportCommand
} from "../runtime/providers/r/import/rImportCommand";
import {
    createImportFileAcceptList,
    createSafeImportFileName
} from "../runtime/tabular-data/importFilePolicy";
import {
    createStagedImportPlanResult,
    createStagedImportRequest,
    previewStagedImportFile
} from "../runtime/tabular-data/stagedImportWorkflow";


interface BrowserImportRecord {
    file: File;
    virtualPath: string;
    name: string;
    sequence: number;
    selectedAt: number;
}


interface BrowserImportRuntime {
    FS: {
        mkdir(path: string): Promise<void> | void;
        writeFile(path: string, bytes: Uint8Array): Promise<void> | void;
    };
}


export interface BrowserImportOpenResult {
    ok: boolean;
    canceled: boolean;
    filePath: string;
    name?: string;
    size?: number;
    type?: string;
    message?: string;
}


export interface BrowserImportStagePayload {
    data?: ArrayBuffer;
    file?: File;
    name?: string;
    size?: number;
    type?: string;
    virtualPath?: string;
}


export interface BrowserImportAdapterBindings {
    getWorkingDirectoryPath(): string;
    ensureRuntime(): Promise<BrowserImportRuntime>;
    captureHiddenRText(
        runtime: BrowserImportRuntime,
        command: string
    ): Promise<string>;
    executeHiddenImport(command: string): Promise<void>;
    executeVisibleImport(command: string): Promise<{ ok?: boolean } | void>;
    refreshWorkspace(): Promise<void>;
    setActiveDataset(name: string): void;
}


export interface BrowserImportAdapter {
    selectFile(): Promise<BrowserImportOpenResult>;
    selectOpenFile(): Promise<BrowserImportOpenFileResult>;
    stageFile(payload: BrowserImportStagePayload): BrowserImportOpenResult;
    readPreview(payload: Partial<ImportPreviewRequest>): Promise<ImportPreviewResult>;
    restoreFilesToWebR(): Promise<void>;
    planFile(input: Partial<BrowserImportPlanRequest>): Promise<BrowserImportPlanResult>;
    importData(input: Partial<BrowserImportRequest>): Promise<BrowserImportResult>;
}


export interface BrowserImportOpenFileResult {
    status: string;
    canceled: boolean;
    filePath: string;
    filePaths: string[];
    message: string;
}


export interface BrowserImportPlanRequest {
    source: string;
    targetName: string;
}


export interface BrowserImportPlanResult {
    status: string;
    source: string;
    format: string;
    targetName: string;
    exists: boolean;
    sizeBytes: number;
    message: string;
    plannedAt: string;
}


export interface BrowserImportRequest {
    source: string;
    format: string;
    targetName: string;
    overwrite: boolean;
    uiCommandVisibility: "hidden" | "visible";
    visibleCommandText: string;
}


export interface BrowserImportResult {
    status: string;
    providerId: string;
    source: string;
    format: string;
    targetName: string;
    overwrite: boolean;
    transcriptEvents: unknown[];
    message: string;
    importedAt: string;
}


const browserImportAccept = createImportFileAcceptList();


export const createBrowserImportAdapter = function(
    bindings: BrowserImportAdapterBindings
): BrowserImportAdapter {
    const records = new Map<string, BrowserImportRecord>();
    let sequence = 0;

    const workingDirectoryPath = function(): string {
        return String(bindings.getWorkingDirectoryPath() || "/web");
    };

    const nextVirtualPath = function(name: string): string {
        return `${workingDirectoryPath()}/${createSafeImportFileName(name)}`;
    };

    const addRecord = function(file: File, requestedPath = ""): BrowserImportOpenResult {
        const safeName = createSafeImportFileName(file.name || "import-file");
        const directory = workingDirectoryPath();
        const virtualPath = String(requestedPath || "").startsWith(`${directory}/`)
            ? String(requestedPath)
            : `${directory}/${safeName}`;

        sequence += 1;
        records.set(virtualPath, {
            file,
            virtualPath,
            name: safeName,
            sequence,
            selectedAt: Date.now()
        });

        return {
            ok: true,
            canceled: false,
            filePath: virtualPath,
            name: safeName,
            size: file.size,
            type: file.type || ""
        };
    };

    const readRecord = function(filePath: unknown): BrowserImportRecord | null {
        const value = String(filePath || "");

        return records.get(value)
            || records.get(`${workingDirectoryPath()}/${value}`)
            || null;
    };

    const writeFileToWebR = async function(record: BrowserImportRecord): Promise<void> {
        const runtime = await bindings.ensureRuntime();
        const bytes = new Uint8Array(await record.file.arrayBuffer());

        await ensureWebRDirectory(runtime, workingDirectoryPath());
        await runtime.FS.writeFile(record.virtualPath, bytes);
    };

    const toOpenFileResult = function(result: BrowserImportOpenResult): BrowserImportOpenFileResult {
        const ok = result.ok === true;
        const canceled = result.canceled === true;
        const filePath = String(result.filePath || "");

        return {
            status: canceled ? "canceled" : (ok ? "selected" : "failed"),
            canceled,
            filePath,
            filePaths: filePath ? [filePath] : [],
            message: result.message || (canceled
                ? "File selection was canceled."
                : (ok ? "File selected." : "File selection failed."))
        };
    };

    const readImportRequest = function(
        input: Partial<BrowserImportRequest>
    ): BrowserImportRequest {
        const request = createStagedImportRequest(input);

        return {
            source: request.source,
            format: request.format,
            targetName: request.targetName,
            overwrite: request.overwrite,
            uiCommandVisibility: request.uiCommandVisibility,
            visibleCommandText: request.visibleCommandText
        };
    };

    const selectFile = function(): Promise<BrowserImportOpenResult> {
        return new Promise((resolve) => {
            const input = document.createElement("input");

            input.type = "file";
            input.accept = browserImportAccept;
            input.style.position = "fixed";
            input.style.left = "-10000px";
            input.style.top = "0";
            input.addEventListener("change", () => {
                const file = input.files && input.files[0];

                input.remove();
                if (!file) {
                    resolve({
                        ok: false,
                        canceled: true,
                        filePath: ""
                    });
                    return;
                }

                resolve(addRecord(file, nextVirtualPath(file.name)));
            }, { once: true });
            input.addEventListener("cancel", () => {
                input.remove();
                resolve({
                    ok: false,
                    canceled: true,
                    filePath: ""
                });
            }, { once: true });
            document.body.appendChild(input);
            input.click();
        });
    };

    const restoreFilesToWebR = async function(): Promise<void> {
        for (const record of records.values()) {
            await writeFileToWebR(record);
        }
    };

    return {
        selectFile,
        selectOpenFile: async function(): Promise<BrowserImportOpenFileResult> {
            return toOpenFileResult(await selectFile());
        },
        stageFile: function(payload: BrowserImportStagePayload): BrowserImportOpenResult {
            const data = payload?.data;
            const file = payload?.file instanceof File
                ? payload.file
                : data instanceof ArrayBuffer
                    ? new File(
                        [data],
                        createSafeImportFileName(payload?.name || "import-file"),
                        { type: String(payload?.type || "") }
                    )
                    : null;

            if (!file) {
                return {
                    ok: false,
                    canceled: false,
                    filePath: "",
                    message: "Selected file was not available to the browser host."
                };
            }

            return addRecord(file, String(payload?.virtualPath || ""));
        },
        readPreview: function(
            payload: Partial<ImportPreviewRequest>
        ): Promise<ImportPreviewResult> {
            const request = payload || {};
            const record = readRecord(request.file);

            return previewStagedImportFile(
                record
                    ? {
                        filePath: record.virtualPath,
                        sizeBytes: record.file.size,
                        readText: function(): Promise<string> {
                            return record.file.text();
                        },
                        prepareRuntimePreview: function(): Promise<void> {
                            return writeFileToWebR(record);
                        }
                    }
                    : null,
                request,
                {
                    resolveRuntimePreviewReader: resolveRImportPreviewReader,
                    createRuntimePreviewCommand: createRImportPreviewCommand,
                    readRuntimePreviewText: async function(command: string): Promise<string> {
                        const runtime = await bindings.ensureRuntime();

                        return String(await bindings.captureHiddenRText(runtime, command) || "");
                    }
                }
            );
        },
        restoreFilesToWebR,
        planFile: function(
            input: Partial<BrowserImportPlanRequest>
        ): Promise<BrowserImportPlanResult> {
            return Promise.resolve(createStagedImportPlanResult({
                source: input?.source,
                targetName: input?.targetName,
                sizeBytes: readRecord(input?.source)?.file.size || 0
            }));
        },
        importData: async function(
            input: Partial<BrowserImportRequest>
        ): Promise<BrowserImportResult> {
            const request = readImportRequest(input || {});
            const commandText = String(request.visibleCommandText || "").trim()
                || createVisibleImportCommand(request, request.targetName);

            try {
                await restoreFilesToWebR();

                if (request.uiCommandVisibility === "visible") {
                    const result = await bindings.executeVisibleImport(commandText);

                    if (result && result.ok === false) {
                        throw new Error("R visible import command failed.");
                    }
                }
                else {
                    await bindings.executeHiddenImport(commandText);
                    await bindings.refreshWorkspace();
                }

                bindings.setActiveDataset(request.targetName);
                return {
                    status: "imported",
                    providerId: "webr",
                    source: request.source,
                    format: request.format,
                    targetName: request.targetName,
                    overwrite: request.overwrite,
                    transcriptEvents: [],
                    message: "Browser WebR import completed.",
                    importedAt: new Date().toISOString()
                };
            }
            catch (error) {
                return {
                    status: "failed",
                    providerId: "webr",
                    source: request.source,
                    format: request.format,
                    targetName: request.targetName,
                    overwrite: request.overwrite,
                    transcriptEvents: [],
                    message: error instanceof Error ? error.message : String(error),
                    importedAt: new Date().toISOString()
                };
            }
        }
    };
};
