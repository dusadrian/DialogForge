import type {
    DatasetViewportControllerSnapshot
} from "./datasetViewportController";
import type {
    VariableMetadataController
} from "./variableMetadataController";

export interface DatasetVariableMetadataLoadControllerOptions {
    metadata: VariableMetadataController;
    getActiveTab: () => "data" | "variables";
    getViewportSnapshot: () => DatasetViewportControllerSnapshot;
    clearVariables: () => void;
    idlePauseThresholdMs?: number;
}

export interface DatasetVariableMetadataLoadController {
    shouldPause: () => boolean;
    reset: () => void;
    scheduleBackground: () => void;
    loadAll: (showLoadingState: boolean) => Promise<void>;
    loadUntil: (
        minimumCount: number,
        showLoadingState: boolean
    ) => Promise<void>;
    loadThroughRow: (
        rowIndex: number,
        showLoadingState: boolean
    ) => Promise<void>;
    ensureLoaded: (showLoadingState: boolean) => Promise<void>;
    startBackground: () => void;
}

export const createDatasetVariableMetadataLoadController = function(
    options: DatasetVariableMetadataLoadControllerOptions
): DatasetVariableMetadataLoadController {
    const idlePauseThresholdMs = Math.max(
        0,
        Number(options.idlePauseThresholdMs ?? 450) || 0
    );

    const shouldPause = function(): boolean {
        if (options.getActiveTab() === "variables") {
            return false;
        }

        const viewport = options.getViewportSnapshot();
        const idleForMs = Date.now()
            - Number(viewport.lastActivityAt || 0);

        return viewport.inFlight
            || viewport.refreshQueued
            || viewport.refreshPending
            || idleForMs < idlePauseThresholdMs;
    };

    const reset = function(): void {
        options.clearVariables();
        options.metadata.reset();
    };

    return {
        shouldPause,
        reset,
        scheduleBackground: options.metadata.scheduleBackground,
        loadAll: options.metadata.loadAll,
        loadUntil: options.metadata.loadUntil,
        loadThroughRow: options.metadata.loadThroughRow,
        ensureLoaded: options.metadata.ensureLoaded,
        startBackground: options.metadata.startBackground
    };
};
