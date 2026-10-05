import { createRuntimeExtensionMethodRequest } from "../runtime/extensions/runtimeExtensionProtocol";
import { canFallbackVariableMetadataBatch, isDatasetVariableMetadataBatch } from "../runtime/tabular-data/datasetVariableMetadataBatch";
import { captureRuntimeSessionScope } from "../runtime/session/runtimeSessionScope";
import type {
    RuntimeSessionManager,
    RuntimeSessionSnapshot,
    TabularPreviewRequest,
    TabularPreviewSnapshot,
    VariableMetadataSnapshot
} from "../runtime/provider-contract/runtimeProvider";

import {
    initialDatasetPreviewRowCount,
    initialDatasetPreviewColumnCount
} from "./datasetEditorReadPolicy";

export {
    initialDatasetPreviewRowCount,
    initialDatasetPreviewColumnCount
} from "./datasetEditorReadPolicy";

const initialDatasetPreviewWaitMs = 140;
const initialVariableMetadataRowCount = 48;
const initialVariableMetadataWaitMs = 140;
const variableMetadataPageSize = 100;
const backgroundVariableMetadataBudgetMs = 500;

type InitialDatasetPreviewWarmup = {
    objectName: string;
    columnCount: number;
    promise: Promise<TabularPreviewSnapshot | null>;
    release(): void;
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
    firstPagePromise: Promise<VariableMetadataBatchResult | null>;
    promise: Promise<VariableMetadataBatchResult | null>;
    releaseFirstPage(): void;
};

type DatasetEditorWarmCacheRuntime = Pick<
    RuntimeSessionManager,
    "executeRuntimeMethod" | "readTabularPreview" | "readVariableMetadata"
>;

export const warmDatasetEditorFirstScreens = function(
    warmPreview: (objectName: string) => void,
    warmVariableMetadata: (objectName: string) => void,
    objectNameInput: unknown
): void {
    const objectName = String(objectNameInput || "").trim();

    if (!objectName) {
        return;
    }

    warmPreview(objectName);
    warmVariableMetadata(objectName);
};

export const createDatasetEditorWarmCache = function(runtime: DatasetEditorWarmCacheRuntime) {
    const previewCache = new Map<string, TabularPreviewSnapshot>();
    const previewWarmups = new Map<string, InitialDatasetPreviewWarmup>();
    const previewReadOwners = new Map<string, symbol>();
    const variableMetadataCache = new Map<string, VariableMetadataBatchResult>();
    const variableMetadataWarmups = new Map<string, InitialVariableMetadataWarmup>();
    const variableMetadataPatches = new Map<
        string,
        Map<string, VariableMetadataSnapshot["variables"][number]>
    >();
    const variableMetadataRefreshOwners = new Map<string, Map<string, symbol>>();
    const variableMetadataReadOwners = new Map<string, symbol>();
    let runtimeSnapshot: RuntimeSessionSnapshot | null = null;
    let isCurrentSession = (): boolean => false;

    const retirePreviewWarmup = function(objectName: string): void {
        const warmup = previewWarmups.get(objectName);
        previewWarmups.delete(objectName);
        warmup?.release();
    };

    const retireVariableMetadataWarmup = function(objectName: string): void {
        const warmup = variableMetadataWarmups.get(objectName);
        variableMetadataWarmups.delete(objectName);
        warmup?.releaseFirstPage();
    };

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
        const objectName = String(request.objectName || "").trim();
        if (objectName && preview.objectName !== objectName) {
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
    ): VariableMetadataBatchResult | null {
        if (snapshot.status !== "ready" || !Array.isArray(snapshot.variables)) {
            return null;
        }
        const variables = snapshot.variables;
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
        count: number,
        isCurrentRead?: () => boolean
    ): Promise<VariableMetadataBatchResult | null> {
        if (isCurrentRead && !isCurrentRead()) {
            return null;
        }
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

        if (isCurrentRead && !isCurrentRead()) {
            return null;
        }

        if (result.status === "ready" && result.value && typeof result.value === "object") {
            if (!isDatasetVariableMetadataBatch(result.value, objectName, safeStart, safeCount)) {
                return null;
            }
            const batch = result.value as VariableMetadataBatchResult;

            return {
                ...batch,
                items: applyVariableMetadataPatches(
                    objectName,
                    batch.items
                )
            };
        }

        // A failed bounded read must not escalate into a complete dataset read.
        // The snapshot fallback is only for providers without the batch method.
        if (!canFallbackVariableMetadataBatch(result.status)) {
            return null;
        }

        const batch = createVariableMetadataBatchFromSnapshot(
            objectName,
            safeStart,
            safeCount,
            await runtime.readVariableMetadata(objectName)
        );

        if (
            !batch
            || (isCurrentRead && !isCurrentRead())
            || !isDatasetVariableMetadataBatch(batch, objectName, safeStart, safeCount)
        ) {
            return null;
        }

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
        isCurrentWarmup: () => boolean,
        publishFirstPage: (batch: VariableMetadataBatchResult | null) => void
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

        if (cached && variableMetadataCoversRequest(cached, 1, firstCount)) {
            publishFirstPage(cached);
        }

        if (items.length >= total) {
            return cached || null;
        }

        while (start <= total) {
            const pageStarted = performance.now();
            const page = await readVariableMetadataPage(
                objectName,
                start,
                requestedCount,
                isCurrentWarmup
            );

            if (!page || !isCurrentWarmup()) {
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
            publishFirstPage(combined);

            if (page.items.length === 0 || items.length >= total) {
                return combined;
            }

            start = items.length + 1;
            // Keep background work short enough for a following console command
            // to run between pages. Fast runtimes retain the existing page size.
            const elapsed = Math.max(1, performance.now() - pageStarted);
            const nextPageSize = Math.max(1, Math.min(
                variableMetadataPageSize,
                Math.floor(page.items.length * backgroundVariableMetadataBudgetMs / elapsed)
            ));
            requestedCount = Math.min(
                nextPageSize,
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

        if (!targetName) {
            previewCache.clear();
            previewReadOwners.clear();
            for (const warmup of previewWarmups.values()) {
                warmup.release();
            }
            previewWarmups.clear();
            return;
        }

        previewCache.delete(targetName);
        previewReadOwners.delete(targetName);
        retirePreviewWarmup(targetName);
    };

    const invalidateVariableMetadata = function(objectName?: string): void {
        const targetName = String(objectName || "").trim();

        if (!targetName) {
            variableMetadataCache.clear();
            for (const warmup of variableMetadataWarmups.values()) {
                warmup.releaseFirstPage();
            }
            variableMetadataWarmups.clear();
            variableMetadataPatches.clear();
            variableMetadataRefreshOwners.clear();
            variableMetadataReadOwners.clear();
            return;
        }

        variableMetadataCache.delete(targetName);
        retireVariableMetadataWarmup(targetName);
        variableMetadataPatches.delete(targetName);
        variableMetadataRefreshOwners.delete(targetName);
        variableMetadataReadOwners.delete(targetName);
    };

    const invalidate = function(objectName?: string): void {
        invalidatePreview(objectName);
        invalidateVariableMetadata(objectName);
    };

    const updateRuntimeSession = function(snapshot: RuntimeSessionSnapshot): void {
        runtimeSnapshot = snapshot;
        if (!isCurrentSession()) {
            invalidate();
            isCurrentSession = captureRuntimeSessionScope(() => runtimeSnapshot);
        }
    };

    const copy = function(
        sourceNameInput: unknown,
        targetNameInput: unknown
    ): void {
        const sourceName = String(sourceNameInput || "").trim();
        const targetName = String(targetNameInput || "").trim();

        if (!sourceName || !targetName || sourceName === targetName) {
            return;
        }

        previewCache.delete(targetName);
        previewReadOwners.delete(targetName);
        retirePreviewWarmup(targetName);
        variableMetadataCache.delete(targetName);
        retireVariableMetadataWarmup(targetName);
        variableMetadataPatches.delete(targetName);
        variableMetadataRefreshOwners.delete(targetName);
        variableMetadataReadOwners.delete(targetName);

        const preview = previewCache.get(sourceName);

        if (preview) {
            previewCache.set(targetName, {
                ...preview,
                objectName: targetName
            });
        }

        const metadata = variableMetadataCache.get(sourceName);

        if (metadata) {
            variableMetadataCache.set(targetName, {
                ...metadata,
                name: targetName,
                items: metadata.items.slice()
            });
        }

        const patches = variableMetadataPatches.get(sourceName);

        if (patches) {
            variableMetadataPatches.set(targetName, new Map(patches));
        }

        const previewWarmup = previewWarmups.get(sourceName);

        if (previewWarmup) {
            let promise: Promise<TabularPreviewSnapshot | null>;
            let release!: () => void;
            const retired = new Promise<TabularPreviewSnapshot | null>((resolve) => {
                release = () => resolve(null);
            });

            promise = Promise.race([previewWarmup.promise.then(function(result) {
                if (previewWarmups.get(targetName)?.promise !== promise) {
                    return null;
                }

                const copied = result
                    ? { ...result, objectName: targetName }
                    : null;

                if (
                    copied
                    && previewWarmups.get(targetName)?.promise === promise
                ) {
                    previewCache.set(targetName, copied);
                }

                return copied;
            }), retired]).finally(function() {
                if (previewWarmups.get(targetName)?.promise === promise) {
                    previewWarmups.delete(targetName);
                }
            });

            previewWarmups.set(targetName, {
                objectName: targetName,
                columnCount: previewWarmup.columnCount,
                promise,
                release
            });
        }

        const metadataWarmup = variableMetadataWarmups.get(sourceName);

        if (metadataWarmup) {
            let promise: Promise<VariableMetadataBatchResult | null>;
            let releaseFirstPage!: () => void;
            const releasedFirstPage = new Promise<VariableMetadataBatchResult | null>((resolve) => {
                releaseFirstPage = () => resolve(null);
            });
            const firstPagePromise = Promise.race([metadataWarmup.firstPagePromise.then(function(result) {
                const copied = result
                    ? {
                        ...result,
                        name: targetName,
                        items: applyVariableMetadataPatches(targetName, result.items.slice())
                    }
                    : null;

                if (
                    copied
                    && variableMetadataWarmups.get(targetName)?.firstPagePromise === firstPagePromise
                ) {
                    variableMetadataCache.set(targetName, copied);
                }

                return copied;
            }), releasedFirstPage]);

            promise = metadataWarmup.promise.then(function(result) {
                const copied = result
                    ? {
                        ...result,
                        name: targetName,
                        items: applyVariableMetadataPatches(targetName, result.items.slice())
                    }
                    : null;

                if (
                    copied
                    && variableMetadataWarmups.get(targetName)?.promise === promise
                ) {
                    variableMetadataCache.set(targetName, copied);
                }

                return copied;
            }).finally(function() {
                if (
                    variableMetadataWarmups.get(targetName)?.promise === promise
                ) {
                    variableMetadataWarmups.delete(targetName);
                }
            });

            variableMetadataWarmups.set(targetName, {
                objectName: targetName,
                count: metadataWarmup.count,
                firstPagePromise,
                promise,
                releaseFirstPage
            });
        }
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
        // A direct accepted patch supersedes any older pending named refresh.
        variableMetadataRefreshOwners.get(objectName)?.delete(variableName);
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

        const pendingWarmup = variableMetadataWarmups.get(objectName);
        if (pendingWarmup) {
            retireVariableMetadataWarmup(objectName);
        }
        const owner = Symbol("variable-metadata-refresh");
        const owners = variableMetadataRefreshOwners.get(objectName) || new Map<string, symbol>();
        for (const name of variableNames) {
            owners.set(name, owner);
        }
        variableMetadataRefreshOwners.set(objectName, owners);

        try {
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
            const currentOwners = variableMetadataRefreshOwners.get(objectName);
            if (!variableNames.some(name => currentOwners?.get(name) === owner)) {
                return;
            }
            if (result.status !== "ready") {
                throw new Error(result.message || "Variable metadata refresh failed.");
            }
            const value = result.value && typeof result.value === "object"
                && !Array.isArray(result.value)
                    ? result.value as Record<string, unknown>
                    : null;
            if (
                !value
                || value.name !== objectName
                || !Number.isSafeInteger(value.total)
                || Number(value.total) < 0
                || !Array.isArray(value.items)
                || value.items.length > Number(value.total)
                || !value.items.every(function(item): boolean {
                    return Boolean(item)
                        && typeof item === "object"
                        && !Array.isArray(item)
                        && typeof item.name === "string"
                        && Boolean(item.name.trim());
                })
            ) {
                throw new Error("Variable metadata refresh returned an invalid dataset response.");
            }
            const items = value.items;

            for (const item of items) {
                const name = item && typeof item === "object"
                    ? String((item as Record<string, unknown>).name || "").trim()
                    : "";

                if (name && variableMetadataRefreshOwners.get(objectName)?.get(name) === owner) {
                    patchVariableMetadata(objectName, name, item);
                }
            }
            if (pendingWarmup && result.status === "ready") {
                warmVariableMetadata(objectName, pendingWarmup.count);
            }
        } catch (error) {
            const current = variableMetadataRefreshOwners.get(objectName);
            if (variableNames.some(name => current?.get(name) === owner)) {
                variableMetadataCache.delete(objectName);
                variableMetadataReadOwners.delete(objectName);
                retireVariableMetadataWarmup(objectName);
                const patches = variableMetadataPatches.get(objectName);

                for (const name of variableNames) {
                    if (current?.get(name) === owner) {
                        patches?.delete(name);
                    }
                }
                throw error;
            }
            // An obsolete refresh cannot report an error into a newer cache.
        } finally {
            for (const name of variableNames) {
                if (owners.get(name) === owner) {
                    owners.delete(name);
                }
            }
            if (owners.size === 0 && variableMetadataRefreshOwners.get(objectName) === owners) {
                variableMetadataRefreshOwners.delete(objectName);
            }
        }
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
        retirePreviewWarmup(objectName);

        let promise: Promise<TabularPreviewSnapshot | null>;
        let release!: () => void;
        const retired = new Promise<TabularPreviewSnapshot | null>((resolve) => {
            release = () => resolve(null);
        });
        promise = Promise.race([runtime.readTabularPreview({
            objectName,
            rowStart: 1,
            rowCount: initialDatasetPreviewRowCount,
            columnCount
        }).then((preview) => {
            const currentWarmup = previewWarmups.get(objectName);

            if (
                currentWarmup?.promise !== promise
            ) {
                return null;
            }

            if (
                preview
                && preview.status === "ready"
            ) {
                if (preview.objectName !== objectName) {
                    return null;
                }
                previewCache.set(objectName, preview);
            }

            return preview;
        }).catch(() => {
            return null;
        }), retired]).finally(() => {
            if (previewWarmups.get(objectName)?.promise === promise) {
                previewWarmups.delete(objectName);
            }
        });

        previewWarmups.set(objectName, {
            objectName,
            columnCount,
            promise,
            release
        });
    };

    const readPreview = async function(
        request: Partial<TabularPreviewRequest>
    ): Promise<TabularPreviewSnapshot> {
        const objectName = String(request.objectName || "").trim();
        const ownedRequest = { ...request };
        if (Array.isArray(request.columns)) {
            ownedRequest.columns = request.columns.slice();
        }
        let readOwner = previewReadOwners.get(objectName);
        if (!readOwner) {
            readOwner = Symbol(objectName);
            previewReadOwners.set(objectName, readOwner);
        }
        const providerId = runtimeSnapshot?.providerId || "";
        const isCurrentRead = function(): boolean {
            return previewReadOwners.get(objectName) === readOwner;
        };
        const retiredPreview = function(): TabularPreviewSnapshot {
            return {
                status: "unavailable",
                providerId,
                objectName,
                columns: [],
                rows: [],
                message: "Dataset preview read was retired.",
                readAt: new Date().toISOString()
            };
        };
        const readCurrentPreview = async function(): Promise<TabularPreviewSnapshot> {
            if (!isCurrentRead()) {
                return retiredPreview();
            }
            try {
                const preview = await runtime.readTabularPreview(ownedRequest);
                if (!isCurrentRead()) {
                    return retiredPreview();
                }
                if (
                    objectName
                    && preview.status === "ready"
                    && preview.objectName !== objectName
                ) {
                    return {
                        ...retiredPreview(),
                        message: "Dataset preview response does not match the requested dataset."
                    };
                }
                return preview;
            } catch (error) {
                if (!isCurrentRead()) {
                    return retiredPreview();
                }
                throw error;
            }
        };

        if (!objectName || (Array.isArray(ownedRequest.columns) && ownedRequest.columns.length > 0)) {
            return readCurrentPreview();
        }

        const cached = previewCache.get(objectName);

        if (previewCoversRequest(cached, ownedRequest)) {
            return cached;
        }

        const requestedColumns = requestedPreviewColumnCount(ownedRequest);
        const warmup = previewWarmups.get(objectName);

        if (warmup && warmup.columnCount >= requestedColumns) {
            const firstResult = await Promise.race([
                warmup.promise,
                wait(initialDatasetPreviewWaitMs).then(() => {
                    return null;
                })
            ]);

            if (!isCurrentRead()) {
                return retiredPreview();
            }
            const warmed = previewCache.get(objectName);

            if (previewCoversRequest(warmed, ownedRequest)) {
                return warmed;
            }
            if (previewWarmups.get(objectName) !== warmup) {
                return readCurrentPreview();
            }

            const readyFirstResult = firstResult || undefined;

            if (previewCoversRequest(readyFirstResult, ownedRequest)) {
                return readyFirstResult;
            }

            const completed = await warmup.promise;

            if (!isCurrentRead()) {
                return retiredPreview();
            }
            const current = previewCache.get(objectName);
            if (previewCoversRequest(current, ownedRequest)) {
                return current;
            }
            if (previewWarmups.get(objectName) !== warmup) {
                return readCurrentPreview();
            }

            const readyCompleted = completed || undefined;

            if (previewCoversRequest(readyCompleted, ownedRequest)) {
                return readyCompleted;
            }
        }

        return readCurrentPreview();
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
        retireVariableMetadataWarmup(objectName);

        let promise: Promise<VariableMetadataBatchResult | null>;
        let publishFirstPage!: (batch: VariableMetadataBatchResult | null) => void;
        const firstPagePromise = new Promise<VariableMetadataBatchResult | null>((resolve) => {
            publishFirstPage = resolve;
        });

        promise = readCompleteVariableMetadata(
            objectName,
            count,
            () => variableMetadataWarmups.get(objectName)?.promise === promise,
            publishFirstPage
        ).then((batch) => {
            const currentWarmup = variableMetadataWarmups.get(objectName);

            if (
                batch
                &&
                currentWarmup?.promise === promise
            ) {
                variableMetadataCache.set(objectName, batch);
            }

            return batch;
        }).catch(() => {
            return null;
        }).finally(() => {
            publishFirstPage(null);

            if (variableMetadataWarmups.get(objectName)?.promise === promise) {
                variableMetadataWarmups.delete(objectName);
            }
        });

        variableMetadataWarmups.set(objectName, {
            objectName,
            count,
            firstPagePromise,
            promise,
            releaseFirstPage: () => publishFirstPage(null)
        });
    };

    const readVariableMetadata = async function(
        objectName: string,
        start: number,
        count: number
    ): Promise<VariableMetadataBatchResult | null> {
        let readOwner = variableMetadataReadOwners.get(objectName);
        if (!readOwner) {
            readOwner = Symbol(objectName);
            variableMetadataReadOwners.set(objectName, readOwner);
        }
        const isCurrentRead = function(): boolean {
            return variableMetadataReadOwners.get(objectName) === readOwner;
        };
        const readCurrentPage = async function(): Promise<VariableMetadataBatchResult | null> {
            try {
                const page = await readVariableMetadataPage(objectName, start, count, isCurrentRead);
                return isCurrentRead() ? page : null;
            } catch (error) {
                if (!isCurrentRead()) {
                    return null;
                }
                throw error;
            }
        };
        const cached = variableMetadataCache.get(objectName);

        if (variableMetadataCoversRequest(cached, start, count)) {
            return sliceVariableMetadataBatch(cached, start, count);
        }

        const warmup = variableMetadataWarmups.get(objectName);

        if (warmup && warmup.count >= count) {
            const requestedEnd = Math.max(1, Math.floor(Number(start) || 1))
                + Math.max(1, Math.floor(Number(count) || initialVariableMetadataRowCount)) - 1;
            const readsFirstPage = requestedEnd <= Math.min(
                variableMetadataPageSize,
                warmup.count
            );
            const requestedWarmup = readsFirstPage
                ? warmup.firstPagePromise
                : warmup.promise;
            const firstResult = await Promise.race([
                requestedWarmup,
                wait(initialVariableMetadataWaitMs).then(() => {
                    return null;
                })
            ]);

            if (!isCurrentRead()) {
                return null;
            }
            const warmed = variableMetadataCache.get(objectName);

            if (variableMetadataCoversRequest(warmed, start, count)) {
                return sliceVariableMetadataBatch(warmed, start, count);
            }
            if (variableMetadataWarmups.get(objectName) !== warmup) {
                return readCurrentPage();
            }

            const readyFirstResult = firstResult || undefined;

            if (variableMetadataCoversRequest(readyFirstResult, start, count)) {
                return sliceVariableMetadataBatch(
                    readyFirstResult,
                    start,
                    count
                );
            }

            if (readsFirstPage) {
                const completed = await warmup.firstPagePromise;

                if (!isCurrentRead()) {
                    return null;
                }
                const current = variableMetadataCache.get(objectName);

                if (variableMetadataCoversRequest(current, start, count)) {
                    return sliceVariableMetadataBatch(current, start, count);
                }
                if (variableMetadataWarmups.get(objectName) !== warmup) {
                    return readCurrentPage();
                }
                const readyCompleted = completed || undefined;
                if (variableMetadataCoversRequest(readyCompleted, start, count)) {
                    return sliceVariableMetadataBatch(readyCompleted, start, count);
                }
            }
        }

        return readCurrentPage();
    };

    return {
        updateRuntimeSession,
        copy,
        invalidate,
        invalidatePreview,
        invalidateVariableMetadata,
        patchVariableMetadata,
        refreshVariableMetadata,
        readPreview,
        readVariableMetadata,
        warmFirstScreens: function(objectName: unknown): void {
            warmDatasetEditorFirstScreens(warmPreview, warmVariableMetadata, objectName);
        },
        warmPreview,
        warmVariableMetadata
    };
};
