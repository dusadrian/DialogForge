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

    const finishPriorityNavigation = function(): void {
        if (priorityRow < 0) {
            return;
        }

        options.scrollRowIntoView(priorityRow);
        priorityRow = -1;
    };

    const activate = async function(): Promise<void> {
        const items = options.getItems();

        if (
            Array.isArray(items)
            && items.length > 0
            && loader.snapshot.loaded
        ) {
            options.renderItems();
            finishPriorityNavigation();
            return;
        }

        if (!options.getDatasetName()) {
            return;
        }

        if (priorityRow >= 0) {
            await loader.loadThroughRow(priorityRow, false);
        }
        else {
            const minimumRows = Math.max(
                options.batchSize,
                options.getMinimumVisibleRows(
                    options.getVariableHost()
                )
            );

            await loader.loadUntil(minimumRows, false);
        }

        if (options.isVariableViewActive()) {
            const nextItems = options.getItems();

            if (Array.isArray(nextItems) && nextItems.length > 0) {
                options.renderItems();
            }
            else if (loader.snapshot.loaded) {
                options.renderEmpty();
            }
        }

        finishPriorityNavigation();

        if (!loader.snapshot.loaded) {
            loader.scheduleBackground();
        }
    };

    const prioritizeRow = function(rowIndex: number): void {
        priorityRow = Math.max(-1, Math.floor(Number(rowIndex)));
    };

    return {
        get snapshot(): VariableMetadataLoadSnapshot {
            return loader.snapshot;
        },
        activate,
        prioritizeRow,
        reset: loader.reset,
        scheduleBackground: loader.scheduleBackground,
        loadAll: loader.loadAll,
        loadUntil: loader.loadUntil,
        loadThroughRow: loader.loadThroughRow,
        ensureLoaded: loader.ensureLoaded,
        startBackground: loader.startBackground
    };
};
