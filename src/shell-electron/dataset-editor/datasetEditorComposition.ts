import {
    datasetEditorEventChannels,
    type DatasetEditorDocumentState
} from "../../dataset-editor/datasetEditorIpc";
import type {
    ActiveDatasetSnapshot,
    RuntimeSessionManager,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
import type { RuntimeCommandResult } from "../../runtime/commands/runtimeCommandReceipt";
import type {
    IpcMain
} from "electron";
import {
    createDatasetEditorWindowFactory
} from "./datasetEditorWindowFactory";
import {
    createDatasetEditorWindowController,
    type DatasetEditorWindowController
} from "./datasetEditorWindowController";
import {
    createDatasetEditorIpcController
} from "./datasetEditorIpcController";
import {
    createWorkspaceActiveDatasetDelivery,
    readWorkspaceActiveDatasetScope
} from "../../runtime/workspace/workspaceActiveDatasetDelivery";
import { warmDatasetEditorFirstScreens } from "../../dataset-editor/datasetEditorWarmCache";
import { prepareDatasetEditorOpening } from "../../dataset-editor/datasetEditorOpeningPreparation";
import { formatDatasetEditorTitle } from "../../dataset-editor/datasetEditorTitle";


export interface DatasetEditorCompositionOptions {
    ipcMain: IpcMain;
    rootDir: string;
    productId: string;
    settingsPath: string;
    translate(text: string): string;
    nativeWindowIconPath?: string;
    pagePath: string;
    showOnOpen: boolean;
    getZoomFactor(): number;
    getLocale(): string;
    getI18n(): Record<string, string>;
    readVariableColumnWidths(): Record<string, number>;
    readTerminalSettings(): unknown;
    listDatasetNames(): Promise<string[]>;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        "getActiveDataset" | "setActiveDataset" | "executeRuntimeMethod"
    > & Partial<Pick<RuntimeSessionManager, "getWorkspaceSnapshot">>;
    writeVariableColumnWidths(payload: unknown): void;
    uiCommandVisibility(): "hidden" | "visible";
    executeVisibleCommand(
        request: VisibleCommandRequest
    ): Promise<RuntimeCommandResult>;
    refreshWorkspaceAndBroadcast(): Promise<unknown>;
    broadcastRuntimeEvents(): Promise<void>;
    sendActiveDataset(snapshot: ActiveDatasetSnapshot): void;
    warmInitialDatasetPreview(objectName: string): void;
    warmInitialVariableMetadata(objectName: string): void;
    reportError(error: unknown): void;
}


export interface DatasetEditorComposition {
    windowController: DatasetEditorWindowController;
    open(objectNameInput: unknown): Promise<DatasetEditorDocumentState>;
}


export const createDatasetEditorComposition = function(
    options: DatasetEditorCompositionOptions
): DatasetEditorComposition {
    const activeDatasetDelivery = createWorkspaceActiveDatasetDelivery({
        getSessionScope: () => readWorkspaceActiveDatasetScope(
            options.runtimeSessionManager.getWorkspaceSnapshot?.()
        ) || options.runtimeSessionManager,
        getAuthoritativeSnapshot: () => options.runtimeSessionManager.getActiveDataset(),
        readActiveDataset: async () => options.runtimeSessionManager.getActiveDataset(),
        requestActiveDataset: (name) => options.runtimeSessionManager.setActiveDataset(name),
        publish: options.sendActiveDataset,
        selected: function(snapshot) {
            warmDatasetEditorFirstScreens(
                options.warmInitialDatasetPreview,
                options.warmInitialVariableMetadata,
                snapshot.objectName
            );
        }
    });

    let state: DatasetEditorDocumentState = {
        objectName: "",
        title: formatDatasetEditorTitle("", options.translate),
        message: "No dataset loaded."
    };
    const createWindow = createDatasetEditorWindowFactory({
        rootDir: options.rootDir,
        productId: options.productId,
        settingsPath: options.settingsPath,
        title: function(): string {
            return state.objectName
                ? state.title
                : formatDatasetEditorTitle("", options.translate);
        },
        nativeWindowIconPath: options.nativeWindowIconPath
    });
    const windowController = createDatasetEditorWindowController({
        createWindow,
        pagePath: options.pagePath,
        getZoomFactor: options.getZoomFactor,
        createInitPayload: function(): Record<string, unknown> {
            return {
                appPath: options.rootDir,
                languageNS: options.getLocale(),
                i18n: options.getI18n(),
                datasetName: "",
                datasetNames: [],
                variableColumnWidths: options.readVariableColumnWidths(),
                terminalSettings: options.readTerminalSettings() || {}
            };
        },
        listDatasetNames: options.listDatasetNames,
        onLoadError: options.reportError
    });

    const open = async function(
        objectNameInput: unknown
    ): Promise<DatasetEditorDocumentState> {
        const objectName = String(objectNameInput || "").trim();

        if (!objectName) {
            state = {
                objectName: "",
                title: formatDatasetEditorTitle("", options.translate),
                message: "No dataset selected."
            };

            return state;
        }

        state = {
            objectName,
            title: formatDatasetEditorTitle(objectName, options.translate),
            message: `Opening ${objectName}.`
        };

        prepareDatasetEditorOpening(objectName, {
            selectDataset: activeDatasetDelivery.select,
            warmFirstScreens: function(name) {
                warmDatasetEditorFirstScreens(
                    options.warmInitialDatasetPreview,
                    options.warmInitialVariableMetadata,
                    name
                );
            },
            reportError: options.reportError
        });

        windowController.create();
        windowController.setTitle(state.title);
        try {
            await windowController.ensureLoaded();
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error);

            state = {
                objectName,
                title: state.title,
                message: `Failed to open Dataset Editor: ${message}`
            };

            return state;
        }

        if (windowController.isPageLoaded()) {
            windowController.send(datasetEditorEventChannels.openDataset, {
                datasetName: objectName
            });
        }

        if (options.showOnOpen) {
            windowController.showAndFocus();
        }

        return state;
    };

    createDatasetEditorIpcController({
        ipcMain: options.ipcMain,
        runtimeSessionManager: options.runtimeSessionManager,
        datasetEditorWindowController: windowController,
        translate: options.translate,
        getDatasetEditorState: function() {
            return state;
        },
        setDatasetEditorState: function(nextState): void {
            state = nextState;
        },
        openDatasetEditor: open,
        writeVariableColumnWidths: options.writeVariableColumnWidths,
        uiCommandVisibility: options.uiCommandVisibility,
        executeVisibleCommand: options.executeVisibleCommand,
        refreshWorkspaceAndBroadcast: options.refreshWorkspaceAndBroadcast,
        broadcastRuntimeEvents: options.broadcastRuntimeEvents,
        sendActiveDataset: options.sendActiveDataset,
        warmInitialDatasetPreview: options.warmInitialDatasetPreview,
        warmInitialVariableMetadata: options.warmInitialVariableMetadata,
        reportError: options.reportError
    });

    return {
        windowController,
        open
    };
};
