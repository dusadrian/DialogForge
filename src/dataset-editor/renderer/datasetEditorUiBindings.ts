import {
    bindDatasetEditorContextMenus,
    type DatasetEditorContextMenuBindings
} from "../context-menus/contextMenuBindings";
import {
    bindDatasetEditorGlobalEvents,
    type DatasetEditorGlobalBindingOptions
} from "./datasetEditorGlobalBindings";
import {
    bindDatasetEditorWindowDismissal,
    type DatasetEditorDismissalBindings
} from "./windowDismissalBindings";


export interface DatasetEditorUiBindings {
    document: Document;
    rowHeight: number;
    getActiveTab(): "data" | "variables";
    setActiveTab(tab: "data" | "variables"): void;
    getCurrentDatasetName(): string;
    loadDataset(datasetName: string): void;
    markDataViewportActivity(): void;
    queueViewportRefresh(): void;
    isVariableMetadataLoaded(): boolean;
    getVariableCount(): number;
    loadVariablesThroughRow(rowIndex: number): void;
    isValueLabelsEditorOpen(): boolean;
    cancelValueLabelsEditor(): void;
    saveValueLabelsEditor(): void;
    contextMenus: DatasetEditorContextMenuBindings;
    globalEvents: DatasetEditorGlobalBindingOptions;
    dismissal: DatasetEditorDismissalBindings;
}


const elementById = function<T extends HTMLElement>(
    document: Document,
    id: string
): T | null {
    return document.getElementById(id) as T | null;
};


const bindTabs = function(options: DatasetEditorUiBindings): void {
    elementById<HTMLButtonElement>(
        options.document,
        "datasetEditorTabData"
    )?.addEventListener("click", () => {
        options.setActiveTab("data");
    });

    elementById<HTMLButtonElement>(
        options.document,
        "datasetEditorTabVariables"
    )?.addEventListener("click", () => {
        options.setActiveTab("variables");
    });
};


const bindDatasetSelector = function(
    options: DatasetEditorUiBindings
): void {
    elementById<HTMLSelectElement>(
        options.document,
        "datasetEditorDatasetSelect"
    )?.addEventListener("change", (event) => {
        const nextName = String(
            (event.currentTarget as HTMLSelectElement)?.value || ""
        ).trim();

        if (
            !nextName
            || nextName === options.getCurrentDatasetName()
        ) {
            return;
        }

        options.loadDataset(nextName);
    });
};


const bindViewportScrolling = function(
    options: DatasetEditorUiBindings
): void {
    elementById<HTMLElement>(
        options.document,
        "datasetEditorDataScroll"
    )?.addEventListener("scroll", () => {
        if (options.getActiveTab() !== "data") {
            return;
        }

        options.markDataViewportActivity();
        options.queueViewportRefresh();
    });

    elementById<HTMLElement>(
        options.document,
        "datasetEditorVariablesScroll"
    )?.addEventListener("scroll", () => {
        if (
            options.getActiveTab() !== "variables"
            || options.isVariableMetadataLoaded()
        ) {
            return;
        }

        const host = elementById<HTMLElement>(
            options.document,
            "datasetEditorVariablesScroll"
        );

        if (!host) {
            return;
        }

        const viewportTop = Math.max(0, host.scrollTop || 0);
        const viewportHeight = Math.max(
            host.clientHeight || 0,
            options.rowHeight * 8
        );
        const lastVisibleRow = Math.max(
            0,
            Math.ceil(
                (viewportTop + viewportHeight) / options.rowHeight
            ) + 8
        );

        if (options.getVariableCount() < lastVisibleRow) {
            options.loadVariablesThroughRow(lastVisibleRow);
        }
    });
};


const bindValueLabelsButtons = function(
    options: DatasetEditorUiBindings
): void {
    elementById<HTMLButtonElement>(
        options.document,
        "datasetValueLabelsCancel"
    )?.addEventListener("click", () => {
        if (options.isValueLabelsEditorOpen()) {
            options.cancelValueLabelsEditor();
        }
    });

    elementById<HTMLButtonElement>(
        options.document,
        "datasetValueLabelsSave"
    )?.addEventListener("click", () => {
        if (options.isValueLabelsEditorOpen()) {
            options.saveValueLabelsEditor();
        }
    });
};


export const bindDatasetEditorUi = function(
    options: DatasetEditorUiBindings
): void {
    bindTabs(options);
    bindDatasetEditorContextMenus(options.contextMenus);
    bindDatasetSelector(options);
    bindViewportScrolling(options);
    bindValueLabelsButtons(options);
    bindDatasetEditorGlobalEvents(options.globalEvents);
    bindDatasetEditorWindowDismissal(options.dismissal);
};
