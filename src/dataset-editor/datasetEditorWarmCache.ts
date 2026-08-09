import { createRuntimeExtensionMethodRequest } from "../runtime/extensions/runtimeExtensionProtocol";
import type {
    RuntimeSessionManager,
    TabularPreviewRequest,
    TabularPreviewSnapshot,
    VariableMetadataSnapshot
} from "../runtime/provider-contract/runtimeProvider";

const initialDatasetPreviewRowCount = 40;
const initialDatasetPreviewColumnCount = 32;
const initialDatasetPreviewWaitMs = 140;
const initialVariableMetadataRowCount = 48;
const initialVariableMetadataWaitMs = 140;
const variableMetadataPageSize = 100;

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
    const variableMetadataPatches = new Map<
        string,
        Map<string, VariableMetadataSnapshot["variables"][number]>
    >();
    let previewGeneration = 0;
    let variableMetadataGeneration = 0;

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

    const applyVariableMetadataPatches = function(
        objectName: string,
        items: VariableMetadataBatchResult["items"]
    ): VariableMetadataBatchResult["items"] {
        const patches = variableMetadataPatches.get(objectName);

        if (!patches || patches.size === 0) {
            return items;
        }

        return items.map(function(item) {
            const name = String(item?.name || "").trim();
            const patch = patches.get(name);

            return patch
                ? {
                    ...item,
                    ...patch,
                    name
                }
                : item;
        });
    };

    const readVariableMetadataPage = async function(
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
                items: applyVariableMetadataPatches(
                    objectName,
                    Array.isArray(batch.items) ? batch.items : []
                )
            };
        }

        const batch = createVariableMetadataBatchFromSnapshot(
            objectName,
            safeStart,
            safeCount,
            await runtime.readVariableMetadata(objectName)
        );

        return {
            ...batch,
            items: applyVariableMetadataPatches(objectName, batch.items)
        };
    };

    const sliceVariableMetadataBatch = function(
        batch: VariableMetadataBatchResult,
        start: number,
        count: number
    ): VariableMetadataBatchResult {
        const safeStart = Math.max(1, Math.floor(Number(start) || 1));
        const safeCount = Math.max(
            1,
            Math.floor(Number(count) || initialVariableMetadataRowCount)
        );
        const offset = Math.max(0, safeStart - batch.start);
        const items = batch.items.slice(offset, offset + safeCount);

        return {
            name: batch.name,
            total: batch.total,
            start: safeStart,
            count: items.length,
            items
        };
    };

    const readCompleteVariableMetadata = async function(
        objectName: string,
        firstCount: number,
        generation: number
    ): Promise<VariableMetadataBatchResult | null> {
        const cached = variableMetadataCache.get(objectName);
        const items: VariableMetadataBatchResult["items"] =
            cached?.start === 1 ? cached.items.slice() : [];
        let total = cached
            ? Math.max(0, Number(cached.total || 0))
            : Number.POSITIVE_INFINITY;
        let start = items.length + 1;
        let requestedCount = start === 1
            ? Math.min(
                variableMetadataPageSize,
                Math.max(initialVariableMetadataRowCount, firstCount)
            )
            : Math.min(variableMetadataPageSize, total - items.length);

        if (items.length >= total) {
            return cached || null;
        }

        while (start <= total) {
            const page = await readVariableMetadataPage(
                objectName,
                start,
                requestedCount
            );

            if (generation !== variableMetadataGeneration) {
                return null;
            }

            total = Math.max(0, Number(page.total || 0));
            items.push(...page.items);

            const combined = {
                name: page.name || objectName,
                total,
                start: 1,
                count: items.length,
                items: applyVariableMetadataPatches(objectName, items.slice())
            };

            variableMetadataCache.set(objectName, combined);

            if (page.items.length === 0 || items.length >= total) {
                return combined;
            }

            start = items.length + 1;
            requestedCount = Math.min(
                variableMetadataPageSize,
                total - items.length
            );
            await wait(0);
        }

        return variableMetadataCache.get(objectName) || null;
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
        const requestedEnd = Math.min(
            Math.max(0, Number(batch.total || 0)),
            requestedStart + requestedCount - 1
        );
        const batchStart = Math.max(1, Math.floor(Number(batch.start) || 1));
        const batchEnd = batchStart + Math.max(0, batch.items.length) - 1;

        return requestedStart > batch.total
            || (batchStart <= requestedStart && batchEnd >= requestedEnd);
    };

    const invalidatePreview = function(objectName?: string): void {
        const targetName = String(objectName || "").trim();

        previewGeneration += 1;

        if (!targetName) {
            previewCache.clear();
            previewWarmups.clear();
            return;
        }

        previewCache.delete(targetName);
        previewWarmups.delete(targetName);
    };

    const invalidateVariableMetadata = function(objectName?: string): void {
        const targetName = String(objectName || "").trim();

        variableMetadataGeneration += 1;

        if (!targetName) {
            variableMetadataCache.clear();
            variableMetadataWarmups.clear();
            variableMetadataPatches.clear();
            return;
        }

        variableMetadataCache.delete(targetName);
        variableMetadataWarmups.delete(targetName);
        variableMetadataPatches.delete(targetName);
    };

    const invalidate = function(objectName?: string): void {
        invalidatePreview(objectName);
        invalidateVariableMetadata(objectName);
    };

    const patchVariableMetadata = function(
        objectNameInput: unknown,
        variableNameInput: unknown,
        value: unknown
    ): void {
        const objectName = String(objectNameInput || "").trim();
        const variableName = String(variableNameInput || "").trim();

        if (!objectName || !variableName || !value || typeof value !== "object") {
            return;
        }

        const patch = {
            ...(value as VariableMetadataSnapshot["variables"][number]),
            name: variableName
        };
        const patches = variableMetadataPatches.get(objectName) || new Map();

        patches.set(variableName, patch);
        variableMetadataPatches.set(objectName, patches);

        const cached = variableMetadataCache.get(objectName);

        if (!cached) {
            return;
        }

        const index = cached.items.findIndex(function(item): boolean {
            return String(item?.name || "").trim() === variableName;
        });

        if (index < 0) {
            return;
        }

        const items = cached.items.slice();

        items[index] = {
            ...items[index],
            ...patch,
            name: variableName
        };
        variableMetadataCache.set(objectName, {
            ...cached,
            items
        });
    };

    const refreshVariableMetadata = async function(
        objectNameInput: unknown,
        variableNamesInput: unknown
    ): Promise<void> {
        const objectName = String(objectNameInput || "").trim();
        const variableNames = Array.isArray(variableNamesInput)
            ? variableNamesInput.map(function(name): string {
                return String(name || "").trim();
            }).filter(Boolean)
            : [];

        if (!objectName || variableNames.length === 0) {
            return;
        }

        const result = await runtime.executeRuntimeMethod(
            createRuntimeExtensionMethodRequest({
                method: "workspace.dataset_variables_named",
                params: {
                    name: objectName,
                    variableNames
                },
                source: "base-app.dataset-editor"
            })
        );
        const value = result.status === "ready"
            && result.value
            && typeof result.value === "object"
                ? result.value as Record<string, unknown>
                : {};
        const items = Array.isArray(value.items) ? value.items : [];

        items.forEach(function(item): void {
            const name = item && typeof item === "object"
                ? String((item as Record<string, unknown>).name || "").trim()
                : "";

            if (name) {
                patchVariableMetadata(objectName, name, item);
            }
        });
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
        const warmupGeneration = previewGeneration;

        promise = runtime.readTabularPreview({
            objectName,
            rowStart: 1,
            rowCount: initialDatasetPreviewRowCount,
            columnCount
        }).then((preview) => {
            const currentWarmup = previewWarmups.get(objectName);

            if (
                currentWarmup?.promise === promise
                && warmupGeneration === previewGeneration
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
            const readGeneration = previewGeneration;
            const firstResult = await Promise.race([
                warmup.promise,
                wait(initialDatasetPreviewWaitMs).then(() => {
                    return null;
                })
            ]);

            if (readGeneration !== previewGeneration) {
                return runtime.readTabularPreview(request);
            }

            const warmed = previewCache.get(objectName);

            if (previewCoversRequest(warmed, request)) {
                return warmed;
            }

            const readyFirstResult = firstResult || undefined;

            if (previewCoversRequest(readyFirstResult, request)) {
                return readyFirstResult;
            }

            const completed = await warmup.promise;

            if (readGeneration !== previewGeneration) {
                return runtime.readTabularPreview(request);
            }

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
        const cached = variableMetadataCache.get(objectName);

        if (
            cached?.start === 1
            && cached.items.length >= cached.total
        ) {
            return;
        }

        const existing = variableMetadataWarmups.get(objectName);

        if (existing && existing.count >= count) {
            return;
        }

        let promise: Promise<VariableMetadataBatchResult | null>;
        const warmupGeneration = variableMetadataGeneration;

        promise = readCompleteVariableMetadata(
            objectName,
            count,
            warmupGeneration
        ).then((batch) => {
            const currentWarmup = variableMetadataWarmups.get(objectName);

            if (
                batch
                &&
                currentWarmup?.promise === promise
                && warmupGeneration === variableMetadataGeneration
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
        const cached = variableMetadataCache.get(objectName);

        if (variableMetadataCoversRequest(cached, start, count)) {
            return sliceVariableMetadataBatch(cached, start, count);
        }

        const warmup = variableMetadataWarmups.get(objectName);

        if (warmup && warmup.count >= count) {
            const readGeneration = variableMetadataGeneration;
            const firstResult = await Promise.race([
                warmup.promise,
                wait(initialVariableMetadataWaitMs).then(() => {
                    return null;
                })
            ]);

            if (readGeneration !== variableMetadataGeneration) {
                return readVariableMetadataPage(
                    objectName,
                    start,
                    count
                );
            }

            const warmed = variableMetadataCache.get(objectName);

            if (variableMetadataCoversRequest(warmed, start, count)) {
                return sliceVariableMetadataBatch(warmed, start, count);
            }

            const readyFirstResult = firstResult || undefined;

            if (variableMetadataCoversRequest(readyFirstResult, start, count)) {
                return sliceVariableMetadataBatch(
                    readyFirstResult,
                    start,
                    count
                );
            }
        }

        return readVariableMetadataPage(objectName, start, count);
    };

    return {
        invalidate,
        invalidatePreview,
        invalidateVariableMetadata,
        patchVariableMetadata,
        refreshVariableMetadata,
        readPreview,
        readVariableMetadata,
        warmPreview,
        warmVariableMetadata
    };
};
