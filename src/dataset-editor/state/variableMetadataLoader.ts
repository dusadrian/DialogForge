import {
    createVariableMetadataLoadState,
    type VariableMetadataLoadSnapshot
} from "./variableMetadataLoadState";


export interface VariableMetadataBatch<Item> {
    total: number;
    items: Item[];
}


export interface VariableMetadataLoaderOptions<Item> {
    batchSize: number;
    activeDelay: number;
    idleDelay: number;
    getDatasetName(): string;
    getItems(): Item[] | null;
    setItems(items: Item[]): void;
    fetchBatch(datasetName: string, start: number, count: number): Promise<VariableMetadataBatch<Item> | null>;
    isVariableViewActive(): boolean;
    shouldPause(): boolean;
    renderItems(): void;
    renderEmpty(): void;
    renderFailure(): void;
}


export interface VariableMetadataLoader {
    readonly snapshot: VariableMetadataLoadSnapshot;
    reset(): void;
    scheduleBackground(): void;
    loadNext(showLoadingState: boolean): Promise<void>;
    loadAll(showLoadingState: boolean): Promise<void>;
    loadUntil(minimumCount: number, showLoadingState: boolean): Promise<void>;
    loadThroughRow(rowIndex: number, showLoadingState: boolean): Promise<void>;
    ensureLoaded(showLoadingState: boolean): Promise<void>;
    startBackground(): void;
}


const waitForBatch = function(): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, 40);
    });
};


export const createVariableMetadataLoader = function<Item>(
    options: VariableMetadataLoaderOptions<Item>
): VariableMetadataLoader {
    const state = createVariableMetadataLoadState();

    const scheduleBackground = function(): void {
        const datasetName = options.getDatasetName();
        const requestSequence = state.snapshot.sequence;
        if (!datasetName || state.snapshot.loaded) {
            return;
        }

        const variableViewActive = options.isVariableViewActive();
        const delay = variableViewActive
            ? options.activeDelay
            : (options.shouldPause() ? options.idleDelay : options.activeDelay);

        state.schedule(() => {
            if (
                datasetName !== options.getDatasetName()
                || requestSequence !== state.snapshot.sequence
                || state.snapshot.loaded
            ) {
                return;
            }

            if (!options.isVariableViewActive() && options.shouldPause()) {
                scheduleBackground();
                return;
            }

            if (state.snapshot.batchInFlight) {
                scheduleBackground();
                return;
            }

            void loadNext(options.isVariableViewActive()).catch((error) => {
                if (
                    requestSequence === state.snapshot.sequence
                    && datasetName === options.getDatasetName()
                ) {
                    console.error("Variable metadata background read failed.", error);
                }
            });
        }, delay);
    };

    const loadNext = async function(_showLoadingState: boolean): Promise<void> {
        const datasetName = options.getDatasetName();
        if (!datasetName) {
            return;
        }

        const requestToken = state.beginBatch();
        if (!requestToken) {
            return;
        }
        const isCurrentBatch = function(): boolean {
            return state.isCurrent(requestToken) && datasetName === options.getDatasetName();
        };
        const finishFailedBatch = function(): void {
            if (!isCurrentBatch()) {
                return;
            }
            state.failBatch(requestToken);
            const retainedItems = Array.isArray(options.getItems())
                ? options.getItems()!
                : [];
            options.setItems(retainedItems);
            if (!isCurrentBatch()) {
                return;
            }

            if (options.isVariableViewActive()) {
                if (retainedItems.length > 0) {
                    options.renderItems();
                } else {
                    options.renderFailure();
                }
            }
        };

        const currentItems = options.getItems();
        const start = Array.isArray(currentItems) ? currentItems.length + 1 : 1;
        let batch: VariableMetadataBatch<Item> | null;
        try {
            batch = await options.fetchBatch(datasetName, start, options.batchSize);
        } catch (error) {
            finishFailedBatch();
            throw error;
        }

        if (!isCurrentBatch()) {
            return;
        }

        if (
            !batch
            || !Array.isArray(batch.items)
            || !Number.isSafeInteger(batch.total)
            || batch.total < 0
            || batch.items.length > options.batchSize
            || start - 1 + batch.items.length > batch.total
            || (batch.items.length === 0 && start - 1 < batch.total)
        ) {
            finishFailedBatch();
            return;
        }

        const nextItems = Array.isArray(options.getItems())
            ? options.getItems()!.slice()
            : [];

        batch.items.forEach((entry, index) => {
            nextItems[start - 1 + index] = entry;
        });

        options.setItems(nextItems);
        if (!isCurrentBatch()) {
            return;
        }
        state.finishBatch(
            requestToken,
            nextItems.length,
            batch.total
        );

        if (options.isVariableViewActive()) {
            if (nextItems.length > 0) {
                options.renderItems();
            } else if (state.snapshot.loaded) {
                options.renderEmpty();
            }
        }

        if (isCurrentBatch() && !state.snapshot.loaded) {
            scheduleBackground();
        }
    };

    const loadUntil = async function(
        minimumCount: number,
        showLoadingState: boolean
    ): Promise<void> {
        const datasetName = options.getDatasetName();
        if (!datasetName) {
            return;
        }

        const requestSequence = state.snapshot.sequence;
        const targetCount = Math.max(0, Number(minimumCount) || 0);
        state.cancelScheduled();

        while (
            datasetName === options.getDatasetName()
            && requestSequence === state.snapshot.sequence
            && !state.snapshot.loaded
            && (options.getItems()?.length || 0) < targetCount
        ) {
            if (state.snapshot.batchInFlight) {
                await waitForBatch();
                continue;
            }

            await loadNext(showLoadingState);
        }
    };

    const loadAll = async function(showLoadingState: boolean): Promise<void> {
        const datasetName = options.getDatasetName();
        if (!datasetName) {
            return;
        }

        const requestSequence = state.snapshot.sequence;
        state.cancelScheduled();

        while (
            datasetName === options.getDatasetName()
            && requestSequence === state.snapshot.sequence
            && !state.snapshot.loaded
        ) {
            if (state.snapshot.batchInFlight) {
                await waitForBatch();
                continue;
            }

            await loadNext(showLoadingState);
        }
    };

    const loadThroughRow = async function(
        rowIndex: number,
        showLoadingState: boolean
    ): Promise<void> {
        const targetCount = Math.max(0, Number(rowIndex) + 13);
        await loadUntil(targetCount, showLoadingState);
    };

    const ensureLoaded = async function(showLoadingState: boolean): Promise<void> {
        if (
            !options.getDatasetName()
            || state.snapshot.loaded
            || state.snapshot.batchInFlight
        ) {
            return;
        }

        await loadNext(showLoadingState);
    };

    const startBackground = function(): void {
        const requestSequence = state.snapshot.sequence;
        const datasetName = options.getDatasetName();
        void loadUntil(options.batchSize, false).catch((error) => {
            if (
                requestSequence === state.snapshot.sequence
                && datasetName === options.getDatasetName()
            ) {
                console.error("Variable metadata background read failed.", error);
            }
        }).finally(() => {
            if (
                requestSequence === state.snapshot.sequence
                && datasetName === options.getDatasetName()
                && !state.snapshot.loaded
            ) {
                scheduleBackground();
            }
        });
    };

    const reset = function(): void {
        state.reset();
    };

    return {
        get snapshot(): VariableMetadataLoadSnapshot {
            return state.snapshot;
        },
        reset,
        scheduleBackground,
        loadNext,
        loadAll,
        loadUntil,
        loadThroughRow,
        ensureLoaded,
        startBackground
    };
};
