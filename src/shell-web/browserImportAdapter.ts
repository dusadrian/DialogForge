import type {
    RuntimeExtensionMethodRequest,
    RuntimeExtensionMethodResult
} from "../runtime/provider-contract/runtimeProvider";
import {
    createImportPreviewNotFoundResult,
    type ImportPreviewResult
} from "../runtime/tabular-data/importPreviewResult";
import type {
    ImportPreviewRequest
} from "../runtime/tabular-data/importPreviewRequest";
import {
    createImportPreviewRequestForFormat
} from "../runtime/tabular-data/importPreviewRequest";
import {
    previewImportFileThroughRuntime
} from "../runtime/tabular-data/runtimeImportPreview";
import {
    ensureWebRDirectory
} from "../runtime/providers/webr/webRFileSystem";
import {
    createImportFileAcceptList,
    createSafeImportFileName
} from "../runtime/tabular-data/importFilePolicy";
import {
    inferImportFormat
} from "../runtime/tabular-data/importFormat";
import {
    createStagedImportPlanResult,
    createStagedImportRequest
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
    executeRuntimeMethod(
        request: RuntimeExtensionMethodRequest
    ): Promise<RuntimeExtensionMethodResult>;
    importThroughRuntime(
        request: BrowserImportRequest
    ): Promise<BrowserImportResult>;
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
        readPreview: async function(
            payload: Partial<ImportPreviewRequest>
        ): Promise<ImportPreviewResult> {
            const request = payload || {};
            const record = readRecord(request.file);

            if (!record) {
                return createImportPreviewNotFoundResult();
            }

            await writeFileToWebR(record);
            const requestedFormat = String(
                (request as Record<string, unknown>).format || ""
            ).trim();
            const runtimeRequest = String(request.command || "").trim()
                ? request
                : {
                    ...createImportPreviewRequestForFormat({
                        file: record.virtualPath,
                        format: requestedFormat
                            || inferImportFormat(record.virtualPath),
                        nrows: request.nrows
                    }),
                    ...request
                };

            return previewImportFileThroughRuntime({
                ...runtimeRequest,
                file: record.virtualPath
            }, bindings.executeRuntimeMethod);
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

            try {
                await restoreFilesToWebR();

                return await bindings.importThroughRuntime(request);
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
