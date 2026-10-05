import {
    createVariableMetadataLoader,
    type VariableMetadataBatch,
    type VariableMetadataLoader
} from "../state/variableMetadataLoader";
import type {
    VariableMetadataLoadSnapshot
} from "../state/variableMetadataLoadState";


export interface VariableMetadataControllerOptions<Item> {
    batchSize: number;
    activeDelay: number;
    idleDelay: number;
    getDatasetName(): string;
    getItems(): Item[] | null;
    setItems(items: Item[]): void;
    fetchBatch(
        datasetName: string,
        start: number,
        count: number
    ): Promise<VariableMetadataBatch<Item> | null>;
    isVariableViewActive(): boolean;
    shouldPause(): boolean;
    getVariableHost(): HTMLElement | null;
    getMinimumVisibleRows(host?: HTMLElement | null): number;
    renderItems(): void;
    renderEmpty(): void;
    renderFailure(): void;
    scrollRowIntoView(rowIndex: number): void;
}


export interface VariableMetadataController {
    readonly snapshot: VariableMetadataLoadSnapshot;
    activate(): Promise<void>;
    prioritizeRow(rowIndex: number): void;
    reset(): void;
    scheduleBackground(): void;
    loadAll(showLoadingState: boolean): Promise<void>;
    loadUntil(
        minimumCount: number,
        showLoadingState: boolean
    ): Promise<void>;
    loadThroughRow(
        rowIndex: number,
        showLoadingState: boolean
    ): Promise<void>;
    ensureLoaded(showLoadingState: boolean): Promise<void>;
    startBackground(): void;
}


export const createVariableMetadataController = function<Item>(
    options: VariableMetadataControllerOptions<Item>
): VariableMetadataController {
    let priorityRow = -1;
    let activationSequence = 0;
    let prioritySequence = 0;

    const loader: VariableMetadataLoader =
        createVariableMetadataLoader<Item>({
            batchSize: options.batchSize,
            activeDelay: options.activeDelay,
            idleDelay: options.idleDelay,
            getDatasetName: options.getDatasetName,
            getItems: options.getItems,
            setItems: options.setItems,
            fetchBatch: options.fetchBatch,
            isVariableViewActive: options.isVariableViewActive,
            shouldPause: options.shouldPause,
            renderItems: options.renderItems,
            renderEmpty: options.renderEmpty,
            renderFailure: options.renderFailure
        });

    const finishPriorityNavigation = function(
        rowIndex: number,
        requestPrioritySequence: number
    ): void {
        if (rowIndex < 0 || requestPrioritySequence !== prioritySequence) {
            return;
        }

        priorityRow = -1;
        options.scrollRowIntoView(rowIndex);
    };

    const activate = async function(): Promise<void> {
        const requestSequence = ++activationSequence;
        const datasetName = options.getDatasetName();
        const loadSequence = loader.snapshot.sequence;
        const requestedRow = priorityRow;
        const requestPrioritySequence = prioritySequence;
        const isCurrentActivation = function(): boolean {
            return requestSequence === activationSequence
                && loadSequence === loader.snapshot.sequence
                && datasetName === options.getDatasetName();
        };
        const items = options.getItems();

        if (
            Array.isArray(items)
            && items.length > 0
            && loader.snapshot.loaded
            && !loader.snapshot.failed
        ) {
            options.renderItems();
            if (isCurrentActivation() && options.isVariableViewActive()) {
                finishPriorityNavigation(requestedRow, requestPrioritySequence);
            }
            return;
        }

        if (!datasetName) {
            return;
        }

        try {
            if (requestedRow >= 0) {
                await loader.loadThroughRow(requestedRow, false);
            } else {
                const minimumRows = Math.max(
                    options.batchSize,
                    options.getMinimumVisibleRows(options.getVariableHost())
                );
                await loader.loadUntil(minimumRows, false);
            }
        } catch (error) {
            if (isCurrentActivation()) {
                throw error;
            }
            return;
        }

        if (!isCurrentActivation()) {
            return;
        }

        if (options.isVariableViewActive()) {
            const nextItems = options.getItems();

            if (Array.isArray(nextItems) && nextItems.length > 0) {
                options.renderItems();
            }
            else if (loader.snapshot.failed) {
                options.renderFailure();
            }
            else if (loader.snapshot.loaded) {
                options.renderEmpty();
            }
        }

        if (!isCurrentActivation()) {
            return;
        }
        if (options.isVariableViewActive() && !loader.snapshot.failed) {
            finishPriorityNavigation(requestedRow, requestPrioritySequence);
        }

        if (isCurrentActivation() && !loader.snapshot.loaded) {
            loader.scheduleBackground();
        }
    };

    const prioritizeRow = function(rowIndex: number): void {
        prioritySequence += 1;
        priorityRow = Math.max(-1, Math.floor(Number(rowIndex)));
    };

    const reset = function(): void {
        activationSequence += 1;
        prioritySequence += 1;
        priorityRow = -1;
        loader.reset();
    };

    return {
        get snapshot(): VariableMetadataLoadSnapshot {
            return loader.snapshot;
        },
        activate,
        prioritizeRow,
        reset,
        scheduleBackground: loader.scheduleBackground,
        loadAll: loader.loadAll,
        loadUntil: loader.loadUntil,
        loadThroughRow: loader.loadThroughRow,
        ensureLoaded: loader.ensureLoaded,
        startBackground: loader.startBackground
    };
};
