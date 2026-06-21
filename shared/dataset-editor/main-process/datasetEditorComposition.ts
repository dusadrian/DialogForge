import {
    datasetEditorEventChannels,
    type DatasetEditorDocumentState
} from "../datasetEditorIpc";
import type {
    ActiveDatasetSnapshot,
    RuntimeSessionManager,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
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
    locale: string;
    readVariableColumnWidths(): Record<string, number>;
    readTerminalSettings(): unknown;
    listDatasetNames(): Promise<string[]>;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        "getActiveDataset" | "setActiveDataset" | "executeRuntimeMethod"
    >;
    writeVariableColumnWidths(payload: unknown): void;
    uiCommandVisibility(): "hidden" | "visible";
    executeVisibleCommand(
        request: VisibleCommandRequest
    ): Promise<TranscriptEvent[]>;
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
    let state: DatasetEditorDocumentState = {
        objectName: "",
        title: "Dataset Editor",
        message: "No dataset loaded."
    };
    const createWindow = createDatasetEditorWindowFactory({
        rootDir: options.rootDir,
        productId: options.productId,
        settingsPath: options.settingsPath,
        title: function(): string {
            return state.objectName
                ? state.title
                : options.translate("Dataset Editor");
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
                languageNS: options.locale,
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
                title: "Dataset Editor",
                message: "No dataset selected."
            };

            return state;
        }

        state = {
            objectName,
            title: `${objectName} - ${options.translate("Dataset Editor")}`,
            message: `Opening ${objectName}.`
        };

        void options.runtimeSessionManager.setActiveDataset(objectName)
            .then((snapshot) => {
                options.sendActiveDataset(snapshot);

                if (snapshot.status === "selected") {
                    options.warmInitialDatasetPreview(snapshot.objectName);
                    options.warmInitialVariableMetadata(snapshot.objectName);
                }
            })
            .catch(() => {});

        options.warmInitialDatasetPreview(objectName);
        options.warmInitialVariableMetadata(objectName);

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
