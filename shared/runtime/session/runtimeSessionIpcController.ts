import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import {
    createVisibleCommandRequest
} from "../commands/commandProtocol";
import {
    createProductCommandRequest
} from "../product-commands/productCommandProtocol";
import {
    createPromptAnswerRequest,
    createPromptRequest
} from "../prompts/promptProtocol";
import {
    createStartupTaskExecutionRequest
} from "../startup/startupTaskProtocol";
import {
    createWorkspaceRenameRequest
} from "../workspace/workspaceProtocol";
import type {
    ActiveDatasetSnapshot,
    ProductCommandRequest,
    PromptAnswerRequest,
    PromptRequest,
    RuntimeSessionManager,
    RuntimeSessionSnapshot,
    StartupTaskExecutionRequest,
    TranscriptEvent,
    VisibleCommandRequest,
    WorkspaceSnapshot
} from "../provider-contract/runtimeProvider";
import {
    runtimeSessionIpcChannels
} from "../../core/ipc/runtimeSessionIpc";
import {
    runtimeCommandIpcChannels
} from "../../core/ipc/runtimeCommandIpc";
import {
    workspaceIpcChannels
} from "../../core/ipc/workspaceIpc";


export interface RuntimeSessionIpcControllerOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        | "getSnapshot"
        | "start"
        | "stop"
        | "executeProductCommand"
        | "removeWorkspaceObjects"
        | "renameWorkspaceObject"
        | "clearWorkspace"
        | "listRuntimeEvents"
        | "listPrompts"
        | "requestPrompt"
        | "answerPrompt"
        | "executeStartupTask"
        | "inspectObject"
        | "getActiveDataset"
        | "setActiveDataset"
    >;
    setRuntimeSessionSnapshot(snapshot: RuntimeSessionSnapshot): void;
    sendRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    executeVisibleCommand(request: VisibleCommandRequest): Promise<TranscriptEvent[]>;
    captureWorkspaceBaseline(source: string): Promise<void>;
    refreshWorkspaceAndBroadcast(options?: {
        forceRefresh?: boolean;
    }): Promise<WorkspaceSnapshot>;
    broadcastRuntimeEvents(): Promise<void>;
    invalidateInitialDatasetPreview(objectName?: string): void;
    sendTranscriptEvents(events: TranscriptEvent[]): void;
    sendWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void;
    sendActiveDataset(snapshot: ActiveDatasetSnapshot): void;
    warmInitialDatasetPreview(objectName: string): void;
    warmInitialVariableMetadata(objectName: string): void;
}


export const createRuntimeSessionIpcController = function(
    options: RuntimeSessionIpcControllerOptions
): void {
    options.ipcMain.handle(runtimeSessionIpcChannels.get, async () => {
        return options.runtimeSessionManager.getSnapshot();
    });

    options.ipcMain.handle(runtimeSessionIpcChannels.start, async () => {
        const snapshot = await options.runtimeSessionManager.start();

        options.setRuntimeSessionSnapshot(snapshot);
        options.sendRuntimeSession(snapshot);

        if (snapshot.status === "ready") {
            await options.captureWorkspaceBaseline("base-app.workspace-runtime-started");
        }

        return snapshot;
    });

    options.ipcMain.handle(runtimeSessionIpcChannels.stop, async () => {
        const snapshot = await options.runtimeSessionManager.stop();

        options.setRuntimeSessionSnapshot(snapshot);
        options.sendRuntimeSession(snapshot);

        return snapshot;
    });

    options.ipcMain.handle(
        runtimeCommandIpcChannels.executeVisible,
        async (_event: IpcMainInvokeEvent, input: Partial<VisibleCommandRequest>) => {
            const request = createVisibleCommandRequest(input || {});

            return options.executeVisibleCommand(request);
        }
    );

    options.ipcMain.handle(
        runtimeCommandIpcChannels.executeProduct,
        async (_event: IpcMainInvokeEvent, input: Partial<ProductCommandRequest>) => {
            const result = await options.runtimeSessionManager
                .executeProductCommand(createProductCommandRequest(input || {}));

            options.invalidateInitialDatasetPreview();
            options.sendTranscriptEvents(result.transcriptEvents);
            await options.broadcastRuntimeEvents();

            return result;
        }
    );

    options.ipcMain.handle(workspaceIpcChannels.refresh, async () => {
        return options.refreshWorkspaceAndBroadcast({
            forceRefresh: true
        });
    });

    options.ipcMain.handle(
        workspaceIpcChannels.removeObjects,
        async (
            _event: IpcMainInvokeEvent,
            input: { objectNames?: string[] }
        ) => {
            (input?.objectNames || []).forEach((objectName) => {
                options.invalidateInitialDatasetPreview(objectName);
            });

            const snapshot = await options.runtimeSessionManager
                .removeWorkspaceObjects(input?.objectNames || []);

            options.sendWorkspaceSnapshot(snapshot);
            options.sendActiveDataset(options.runtimeSessionManager.getActiveDataset());
            await options.broadcastRuntimeEvents();

            return snapshot;
        }
    );

    options.ipcMain.handle(
        workspaceIpcChannels.renameObject,
        async (
            _event: IpcMainInvokeEvent,
            input: { oldName?: string; newName?: string; source?: string }
        ) => {
            options.invalidateInitialDatasetPreview(input?.oldName);

            const snapshot = await options.runtimeSessionManager
                .renameWorkspaceObject(createWorkspaceRenameRequest(input || {}));

            options.sendWorkspaceSnapshot(snapshot);
            options.sendActiveDataset(options.runtimeSessionManager.getActiveDataset());
            await options.broadcastRuntimeEvents();

            return snapshot;
        }
    );

    options.ipcMain.handle(workspaceIpcChannels.clear, async () => {
        options.invalidateInitialDatasetPreview();

        const snapshot = await options.runtimeSessionManager.clearWorkspace();

        options.sendWorkspaceSnapshot(snapshot);
        options.sendActiveDataset(options.runtimeSessionManager.getActiveDataset());
        await options.broadcastRuntimeEvents();

        return snapshot;
    });

    options.ipcMain.handle(runtimeSessionIpcChannels.listEvents, async () => {
        return options.runtimeSessionManager.listRuntimeEvents();
    });

    options.ipcMain.handle(runtimeSessionIpcChannels.listPrompts, async () => {
        return options.runtimeSessionManager.listPrompts();
    });

    options.ipcMain.handle(
        runtimeSessionIpcChannels.requestPrompt,
        async (_event: IpcMainInvokeEvent, input: Partial<PromptRequest>) => {
            return options.runtimeSessionManager.requestPrompt(
                createPromptRequest(input || {})
            );
        }
    );

    options.ipcMain.handle(
        runtimeSessionIpcChannels.answerPrompt,
        async (_event: IpcMainInvokeEvent, input: Partial<PromptAnswerRequest>) => {
            return options.runtimeSessionManager.answerPrompt(
                createPromptAnswerRequest(input || {})
            );
        }
    );

    options.ipcMain.handle(
        runtimeSessionIpcChannels.executeStartupTask,
        async (_event: IpcMainInvokeEvent, input: Partial<StartupTaskExecutionRequest>) => {
            const request = createStartupTaskExecutionRequest(input || {});
            const result = await options.runtimeSessionManager.executeStartupTask(request);

            if (result.status === "planned") {
                await options.broadcastRuntimeEvents();
            }

            return result;
        }
    );

    options.ipcMain.handle(
        workspaceIpcChannels.inspectObject,
        async (_event: IpcMainInvokeEvent, objectName: string) => {
            return options.runtimeSessionManager.inspectObject(objectName);
        }
    );

    options.ipcMain.handle(workspaceIpcChannels.getActiveDataset, async () => {
        return options.runtimeSessionManager.getActiveDataset();
    });

    options.ipcMain.handle(
        workspaceIpcChannels.setActiveDataset,
        async (_event: IpcMainInvokeEvent, objectName: string) => {
            const snapshot = await options.runtimeSessionManager.setActiveDataset(objectName);

            options.sendActiveDataset(snapshot);
            if (snapshot.status === "selected") {
                options.warmInitialDatasetPreview(snapshot.objectName);
                options.warmInitialVariableMetadata(snapshot.objectName);
                await options.broadcastRuntimeEvents();
            }

            return snapshot;
        }
    );
};
