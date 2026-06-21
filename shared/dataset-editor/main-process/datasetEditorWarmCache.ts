import { createRuntimeExtensionMethodRequest } from "../../runtime/extensions/runtimeExtensionProtocol";
import type {
    RuntimeSessionManager,
    TabularPreviewRequest,
    TabularPreviewSnapshot,
    VariableMetadataSnapshot
} from "../../runtime/provider-contract/runtimeProvider";

const initialDatasetPreviewRowCount = 40;
const initialDatasetPreviewColumnCount = 32;
const initialDatasetPreviewWaitMs = 140;
const initialVariableMetadataRowCount = 48;
const initialVariableMetadataWaitMs = 140;

type InitialDatasetPreviewWarmup = {
    objectName: string;
    columnCount: number;
    promise: Promise<TabularPreviewSnapshot | null>;
};

export type VariableMetadataBatchResult = {
    name: string;
    total: number;
    start: number;
    count: number;
    items: VariableMetadataSnapshot["variables"];
};

type InitialVariableMetadataWarmup = {
    objectName: string;
    count: number;
    promise: Promise<VariableMetadataBatchResult | null>;
};

type DatasetEditorWarmCacheRuntime = Pick<
    RuntimeSessionManager,
    "executeRuntimeMethod" | "readTabularPreview" | "readVariableMetadata"
>;

export const createDatasetEditorWarmCache = function(runtime: DatasetEditorWarmCacheRuntime) {
    const previewCache = new Map<string, TabularPreviewSnapshot>();
    const previewWarmups = new Map<string, InitialDatasetPreviewWarmup>();
    const variableMetadataCache = new Map<string, VariableMetadataBatchResult>();
    const variableMetadataWarmups = new Map<string, InitialVariableMetadataWarmup>();
    let cacheGeneration = 0;

    const wait = function(milliseconds: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, milliseconds);
        });
    };

    const requestedPreviewColumnCount = function(
        request: Partial<TabularPreviewRequest>
    ): number {
        const count = Number(request.columnCount || 0);

        if (Number.isFinite(count) && count > 0) {
            return Math.floor(count);
        }

        return initialDatasetPreviewColumnCount;
    };

    const previewCoversRequest = function(
        preview: TabularPreviewSnapshot | undefined,
        request: Partial<TabularPreviewRequest>
    ): preview is TabularPreviewSnapshot {
        if (!preview || preview.status !== "ready") {
            return false;
        }

        if (Array.isArray(request.columns) && request.columns.length > 0) {
            return false;
        }

        const rowStart = Number(request.rowStart || 1);

        if (rowStart !== 1) {
            return false;
        }

        const requestedRows = Number(request.rowCount || initialDatasetPreviewRowCount);
        const requestedColumns = requestedPreviewColumnCount(request);

        return preview.rows.length >= requestedRows
            && preview.columns.length >= requestedColumns;
    };

    const createVariableMetadataBatchFromSnapshot = function(
        objectName: string,
        start: number,
        count: number,
        snapshot: VariableMetadataSnapshot
    ): VariableMetadataBatchResult {
        const variables = snapshot.status === "ready" ? snapshot.variables : [];
        const safeStart = Math.max(1, Math.floor(Number(start) || 1));
        const safeCount = Math.max(
            1,
            Math.floor(Number(count) || initialVariableMetadataRowCount)
        );
        const items = variables.slice(safeStart - 1, safeStart - 1 + safeCount);

        return {
            name: objectName,
            total: variables.length,
            start: safeStart,
            count: items.length,
            items
        };
    };

    const readVariableMetadataBatch = async function(
        objectName: string,
        start: number,
        count: number
    ): Promise<VariableMetadataBatchResult> {
        const safeStart = Math.max(1, Math.floor(Number(start) || 1));
        const safeCount = Math.max(
            1,
            Math.floor(Number(count) || initialVariableMetadataRowCount)
        );
        const result = await runtime.executeRuntimeMethod(
            createRuntimeExtensionMethodRequest({
                method: "workspace.dataset_variables_batch",
                params: {
                    name: objectName,
                    start: safeStart,
                    count: safeCount
                },
                source: "base-app.dataset-editor"
            })
        );

        if (result.status === "ready" && result.value && typeof result.value === "object") {
            const batch = result.value as Partial<VariableMetadataBatchResult>;

            return {
                name: String(batch.name || objectName),
                total: Number(batch.total || 0),
                start: Number(batch.start || safeStart),
                count: Number(
                    batch.count || (Array.isArray(batch.items) ? batch.items.length : 0)
                ),
                items: Array.isArray(batch.items) ? batch.items : []
            };
        }

        return createVariableMetadataBatchFromSnapshot(
            objectName,
            safeStart,
            safeCount,
            await runtime.readVariableMetadata(objectName)
        );
    };

    const variableMetadataCoversRequest = function(
        batch: VariableMetadataBatchResult | undefined,
        start: number,
        count: number
    ): batch is VariableMetadataBatchResult {
        if (!batch) {
            return false;
        }

        const requestedStart = Math.max(1, Math.floor(Number(start) || 1));
        const requestedCount = Math.max(
            1,
            Math.floor(Number(count) || initialVariableMetadataRowCount)
        );
        const requestedEnd = requestedStart + requestedCount - 1;
        const batchStart = Math.max(1, Math.floor(Number(batch.start) || 1));
        const batchEnd = batchStart + Math.max(0, batch.items.length) - 1;

        return batchStart <= requestedStart && batchEnd >= requestedEnd;
    };

    const invalidate = function(objectName?: string): void {
        const targetName = String(objectName || "").trim();

        cacheGeneration += 1;

        if (!targetName) {
            previewCache.clear();
            previewWarmups.clear();
            variableMetadataCache.clear();
            variableMetadataWarmups.clear();
            return;
        }

        previewCache.delete(targetName);
        previewWarmups.delete(targetName);
        variableMetadataCache.delete(targetName);
        variableMetadataWarmups.delete(targetName);
    };

    const warmPreview = function(objectNameInput: unknown, columnCountInput?: number): void {
        const objectName = String(objectNameInput || "").trim();

        if (!objectName) {
            return;
        }

        const columnCount = Math.max(
            initialDatasetPreviewColumnCount,
            Number.isFinite(Number(columnCountInput))
                ? Math.floor(Number(columnCountInput))
                : 0
        );

        if (previewCoversRequest(previewCache.get(objectName), {
            objectName,
            rowStart: 1,
            rowCount: initialDatasetPreviewRowCount,
            columnCount
        })) {
            return;
        }

        const existing = previewWarmups.get(objectName);

        if (existing && existing.columnCount >= columnCount) {
            return;
        }

        let promise: Promise<TabularPreviewSnapshot | null>;
        const warmupGeneration = cacheGeneration;

        promise = runtime.readTabularPreview({
            objectName,
            rowStart: 1,
            rowCount: initialDatasetPreviewRowCount,
            columnCount
        }).then((preview) => {
            const currentWarmup = previewWarmups.get(objectName);

            if (
                currentWarmup?.promise === promise
                && warmupGeneration === cacheGeneration
                && preview
                && preview.status === "ready"
            ) {
                previewCache.set(objectName, preview);
            }

            return preview;
        }).catch(() => {
            return null;
        }).finally(() => {
            if (previewWarmups.get(objectName)?.promise === promise) {
                previewWarmups.delete(objectName);
            }
        });

        previewWarmups.set(objectName, {
            objectName,
            columnCount,
            promise
        });
    };

    const readPreview = async function(
        request: Partial<TabularPreviewRequest>
    ): Promise<TabularPreviewSnapshot> {
        const objectName = String(request.objectName || "").trim();

        if (!objectName || (Array.isArray(request.columns) && request.columns.length > 0)) {
            return runtime.readTabularPreview(request);
        }

        const cached = previewCache.get(objectName);

        if (previewCoversRequest(cached, request)) {
            return cached;
        }

        const requestedColumns = requestedPreviewColumnCount(request);
        const warmup = previewWarmups.get(objectName);

        if (warmup && warmup.columnCount >= requestedColumns) {
            const firstResult = await Promise.race([
                warmup.promise,
                wait(initialDatasetPreviewWaitMs).then(() => {
                    return null;
                })
            ]);

            const warmed = previewCache.get(objectName);

            if (previewCoversRequest(warmed, request)) {
                return warmed;
            }

            const readyFirstResult = firstResult || undefined;

            if (previewCoversRequest(readyFirstResult, request)) {
                return readyFirstResult;
            }

            const completed = await warmup.promise;
            const readyCompleted = completed || undefined;

            if (previewCoversRequest(readyCompleted, request)) {
                return readyCompleted;
            }
        }

        return runtime.readTabularPreview(request);
    };

    const warmVariableMetadata = function(objectNameInput: unknown, countInput?: number): void {
        const objectName = String(objectNameInput || "").trim();

        if (!objectName) {
            return;
        }

        const count = Math.max(
            initialVariableMetadataRowCount,
            Number.isFinite(Number(countInput)) ? Math.floor(Number(countInput)) : 0
        );

        if (variableMetadataCoversRequest(variableMetadataCache.get(objectName), 1, count)) {
            return;
        }

        const existing = variableMetadataWarmups.get(objectName);

        if (existing && existing.count >= count) {
            return;
        }

        let promise: Promise<VariableMetadataBatchResult | null>;
        const warmupGeneration = cacheGeneration;

        promise = readVariableMetadataBatch(objectName, 1, count).then((batch) => {
            const currentWarmup = variableMetadataWarmups.get(objectName);

            if (
                currentWarmup?.promise === promise
                && warmupGeneration === cacheGeneration
            ) {
                variableMetadataCache.set(objectName, batch);
            }

            return batch;
        }).catch(() => {
            return null;
        }).finally(() => {
            if (variableMetadataWarmups.get(objectName)?.promise === promise) {
                variableMetadataWarmups.delete(objectName);
            }
        });

        variableMetadataWarmups.set(objectName, {
            objectName,
            count,
            promise
        });
    };

    const readVariableMetadata = async function(
        objectName: string,
        start: number,
        count: number
    ): Promise<VariableMetadataBatchResult> {
        if (start !== 1) {
            return readVariableMetadataBatch(objectName, start, count);
        }

        const cached = variableMetadataCache.get(objectName);

        if (variableMetadataCoversRequest(cached, start, count)) {
            return cached;
        }

        const warmup = variableMetadataWarmups.get(objectName);

        if (warmup && warmup.count >= count) {
            const firstResult = await Promise.race([
                warmup.promise,
                wait(initialVariableMetadataWaitMs).then(() => {
                    return null;
                })
            ]);

            const warmed = variableMetadataCache.get(objectName);

            if (variableMetadataCoversRequest(warmed, start, count)) {
                return warmed;
            }

            const readyFirstResult = firstResult || undefined;

            if (variableMetadataCoversRequest(readyFirstResult, start, count)) {
                return readyFirstResult;
            }

            const completed = await warmup.promise;
            const readyCompleted = completed || undefined;

            if (variableMetadataCoversRequest(readyCompleted, start, count)) {
                return readyCompleted;
            }
        }

        return readVariableMetadataBatch(objectName, start, count);
    };

    return {
        invalidate,
        readPreview,
        readVariableMetadata,
        warmPreview,
        warmVariableMetadata
    };
};
