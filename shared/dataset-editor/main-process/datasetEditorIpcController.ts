import type {
    IpcMain,
    IpcMainEvent,
    IpcMainInvokeEvent
} from "electron";

import type {
    ActiveDatasetSnapshot,
    RuntimeSessionManager,
    TranscriptEvent
} from "../../runtime/provider-contract/runtimeProvider";
import {
    createVisibleCommandRequest
} from "../../runtime/commands/commandProtocol";
import {
    createRuntimeExtensionMethodRequest
} from "../../runtime/extensions/runtimeExtensionProtocol";
import type {
    DatasetEditorWindowController
} from "./datasetEditorWindowController";
import {
    datasetEditorEventChannels,
    datasetEditorIpcChannels,
    type DatasetEditorDocumentState
} from "../datasetEditorIpc";


export interface DatasetEditorIpcControllerOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        "getActiveDataset" | "setActiveDataset" | "executeRuntimeMethod"
    >;
    datasetEditorWindowController: Pick<
        DatasetEditorWindowController,
        "getWindow" | "send" | "setTitle"
    >;
    getDatasetEditorState(): DatasetEditorDocumentState;
    setDatasetEditorState(state: DatasetEditorDocumentState): void;
    openDatasetEditor(objectName: unknown): Promise<DatasetEditorDocumentState>;
    writeVariableColumnWidths(payload: unknown): void;
    uiCommandVisibility(): "hidden" | "visible";
    executeVisibleCommand(request: ReturnType<typeof createVisibleCommandRequest>): Promise<TranscriptEvent[]>;
    refreshWorkspaceAndBroadcast(): Promise<unknown>;
    broadcastRuntimeEvents(): Promise<void>;
    sendActiveDataset(snapshot: ActiveDatasetSnapshot): void;
    warmInitialDatasetPreview(objectName: string): void;
    warmInitialVariableMetadata(objectName: string): void;
    reportError(error: unknown): void;
}


const createDocumentState = function(objectName: string): DatasetEditorDocumentState {
    return {
        objectName,
        title: `${objectName} - Dataset Editor`,
        message: `Editing ${objectName}.`
    };
};


const sendToDatasetEditor = function(
    options: DatasetEditorIpcControllerOptions,
    channel: string,
    payload: Record<string, unknown>
): void {
    if (options.datasetEditorWindowController.getWindow()) {
        options.datasetEditorWindowController.send(channel, payload);
    }
};


export const createDatasetEditorIpcController = function(
    options: DatasetEditorIpcControllerOptions
): void {
    options.ipcMain.handle(datasetEditorIpcChannels.getDocument, async () => {
        return options.getDatasetEditorState();
    });

    options.ipcMain.handle(datasetEditorIpcChannels.openEditor, async (
        _event: IpcMainInvokeEvent,
        objectName: string
    ) => {
        return options.openDatasetEditor(objectName);
    });

    options.ipcMain.on(
        datasetEditorEventChannels.stateChanged,
        (_event: IpcMainEvent, payload: { datasetName?: string }) => {
            const objectName = String(payload?.datasetName || "").trim();

            if (!objectName) {
                return;
            }

            const state = createDocumentState(objectName);
            options.setDatasetEditorState(state);
            options.datasetEditorWindowController.setTitle(state.title);

            void options.runtimeSessionManager.setActiveDataset(objectName)
                .then((snapshot) => {
                    options.sendActiveDataset(snapshot);
                })
                .catch(options.reportError);
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.setVariableColumnWidths,
        async (_event: IpcMainInvokeEvent, payload: unknown) => {
            options.writeVariableColumnWidths(payload);

            return true;
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.runVisibleCommand,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                command?: string;
                datasetName?: string;
                visible?: boolean;
            }
        ) => {
            const command = String(payload?.command || "").trim();

            if (!command) {
                return false;
            }

            const shouldShowCommand = payload?.visible !== false ||
                options.uiCommandVisibility() === "visible";

            if (shouldShowCommand) {
                const events = await options.executeVisibleCommand(createVisibleCommandRequest({
                    text: command,
                    source: "base-app.dataset-editor"
                }));
                const failed = events.some((event) => {
                    return event.type === "failed";
                });

                return !failed;
            }

            const result = await options.runtimeSessionManager.executeRuntimeMethod(
                createRuntimeExtensionMethodRequest({
                    method: "evaluate_code",
                    params: {
                        code: command,
                        mode: "silent",
                        timeoutMs: 300000
                    },
                    source: "base-app.dataset-editor"
                })
            );

            if (result.status === "ready") {
                void options.refreshWorkspaceAndBroadcast().catch(options.reportError);
                void options.broadcastRuntimeEvents().catch(options.reportError);
            }

            return result.status === "ready";
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.refreshDataset,
        async (
            _event: IpcMainInvokeEvent,
            payload: { datasetName?: string; name?: string }
        ) => {
            const datasetName = String(payload?.datasetName || payload?.name || "").trim();

            sendToDatasetEditor(options, datasetEditorEventChannels.refreshDataset, {
                datasetName
            });

            return {
                status: datasetName ? "sent" : "empty",
                datasetName
            };
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.gotoCase,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                datasetName?: string;
                caseNumber?: number;
            }
        ) => {
            sendToDatasetEditor(options, datasetEditorEventChannels.gotoCase, {
                datasetName: String(payload?.datasetName || ""),
                caseNumber: Number(payload?.caseNumber)
            });

            return {
                status: "sent"
            };
        }
    );

    options.ipcMain.handle(
        datasetEditorIpcChannels.gotoVariable,
        async (
            _event: IpcMainInvokeEvent,
            payload: {
                datasetName?: string;
                variableName?: string;
            }
        ) => {
            sendToDatasetEditor(options, datasetEditorEventChannels.gotoVariable, {
                datasetName: String(payload?.datasetName || ""),
                variableName: String(payload?.variableName || "")
            });

            return {
                status: "sent"
            };
        }
    );

    options.ipcMain.handle(datasetEditorIpcChannels.getActiveDataset, async () => {
        return options.runtimeSessionManager.getActiveDataset().objectName || "";
    });

    options.ipcMain.handle(
        datasetEditorIpcChannels.setActiveDataset,
        async (_event: IpcMainInvokeEvent, payload: { name?: string }) => {
            const snapshot = await options.runtimeSessionManager
                .setActiveDataset(String(payload?.name || ""));

            options.sendActiveDataset(snapshot);
            if (snapshot.status === "selected") {
                options.warmInitialDatasetPreview(snapshot.objectName);
                options.warmInitialVariableMetadata(snapshot.objectName);
            }

            return snapshot.objectName;
        }
    );

    options.ipcMain.handle(datasetEditorIpcChannels.clearActiveDataset, async () => {
        const snapshot = await options.runtimeSessionManager.setActiveDataset("");

        options.sendActiveDataset(snapshot);

        return snapshot.objectName;
    });

    options.ipcMain.handle(datasetEditorIpcChannels.getActiveState, async () => {
        return {
            datasetName: options.runtimeSessionManager.getActiveDataset().objectName || ""
        };
    });

    options.ipcMain.handle(datasetEditorIpcChannels.consumeGoToContext, async () => {
        return {
            datasetName: options.runtimeSessionManager.getActiveDataset().objectName || "",
            mode: ""
        };
    });
};
