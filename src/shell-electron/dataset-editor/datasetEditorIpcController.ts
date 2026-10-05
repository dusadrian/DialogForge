import { warmDatasetEditorFirstScreens } from "../../dataset-editor/datasetEditorWarmCache";
import { formatDatasetEditorTitle } from "../../dataset-editor/datasetEditorTitle";
import type {
    IpcMain,
    IpcMainEvent,
    IpcMainInvokeEvent
} from "electron";

import type {
    ActiveDatasetSnapshot,
    RuntimeSessionManager
} from "../../runtime/provider-contract/runtimeProvider";
import {
    runtimeCommandResultSucceeded,
    type RuntimeCommandResult
} from "../../runtime/commands/runtimeCommandReceipt";
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
} from "../../dataset-editor/datasetEditorIpc";
import {
    createWorkspaceActiveDatasetDelivery,
    readWorkspaceActiveDatasetScope,
    readSelectedWorkspaceDatasetName
} from "../../runtime/workspace/workspaceActiveDatasetDelivery";
import {
    createWorkspaceChannelAdapter
} from "../../base-app/features/workspace-pane/workspaceChannelAdapter";


export interface DatasetEditorIpcControllerOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        "getActiveDataset" | "setActiveDataset" | "executeRuntimeMethod"
    > & Partial<Pick<RuntimeSessionManager, "getWorkspaceSnapshot">>;
    datasetEditorWindowController: Pick<
        DatasetEditorWindowController,
        "getWindow" | "send" | "setTitle"
    >;
    translate(text: string): string;
    getDatasetEditorState(): DatasetEditorDocumentState;
    setDatasetEditorState(state: DatasetEditorDocumentState): void;
    openDatasetEditor(objectName: unknown): Promise<DatasetEditorDocumentState>;
    writeVariableColumnWidths(payload: unknown): void;
    uiCommandVisibility(): "hidden" | "visible";
    executeVisibleCommand(request: ReturnType<typeof createVisibleCommandRequest>): Promise<RuntimeCommandResult>;
    refreshWorkspaceAndBroadcast(): Promise<unknown>;
    broadcastRuntimeEvents(): Promise<void>;
    sendActiveDataset(snapshot: ActiveDatasetSnapshot): void;
    warmInitialDatasetPreview(objectName: string): void;
    warmInitialVariableMetadata(objectName: string): void;
    reportError(error: unknown): void;
}


const createDocumentState = function(
    objectName: string,
    translate: (key: string) => string
): DatasetEditorDocumentState {
    return {
        objectName,
        title: formatDatasetEditorTitle(objectName, translate),
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
    const activeDatasetDelivery = createWorkspaceActiveDatasetDelivery({
        getSessionScope: function() {
            return readWorkspaceActiveDatasetScope(
                options.runtimeSessionManager.getWorkspaceSnapshot?.()
            ) || options.runtimeSessionManager;
        },
        readActiveDataset: async () => options.runtimeSessionManager.getActiveDataset(),
        requestActiveDataset: (name) => options.runtimeSessionManager.setActiveDataset(name),
        getAuthoritativeSnapshot: () => options.runtimeSessionManager.getActiveDataset(),
        publish: options.sendActiveDataset,
        selected: function(snapshot) {
            warmDatasetEditorFirstScreens(
                options.warmInitialDatasetPreview,
                options.warmInitialVariableMetadata,
                snapshot.objectName
            );
        }
    });
    const workspaceChannels = createWorkspaceChannelAdapter({
        getDataEditorDatasetName: () => options.getDatasetEditorState().objectName,
        setDataEditorDatasetName: (name) => options.setDatasetEditorState(
            createDocumentState(name, options.translate)
        ),
        getActiveDatasetName: () => readSelectedWorkspaceDatasetName(
            options.runtimeSessionManager.getActiveDataset()
        ),
        setActiveDataset: async function(name) {
            await activeDatasetDelivery.select(name);
        },
        clearActiveDataset: async function() {
            await activeDatasetDelivery.clear();
        }
    });

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

            const state = createDocumentState(objectName, options.translate);
            options.setDatasetEditorState(state);
            options.datasetEditorWindowController.setTitle(state.title);

            // The editor already owns its current viewport/metadata loading.
            void activeDatasetDelivery.select(objectName, false).catch(options.reportError);
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
                const result = await options.executeVisibleCommand(createVisibleCommandRequest({
                    text: command,
                    source: "base-app.dataset-editor"
                }));
                return runtimeCommandResultSucceeded(result);
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
        return workspaceChannels.getActiveDataset();
    });

    options.ipcMain.handle(
        datasetEditorIpcChannels.setActiveDataset,
        async (_event: IpcMainInvokeEvent, payload: { name?: string }) => {
            return workspaceChannels.setActiveDataset(payload, []);
        }
    );

    options.ipcMain.handle(datasetEditorIpcChannels.clearActiveDataset, async () => {
        return workspaceChannels.clearActiveDataset();
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
