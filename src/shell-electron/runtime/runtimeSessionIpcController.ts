import { warmDatasetEditorFirstScreens } from "../../dataset-editor/datasetEditorWarmCache";
import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import {
    createVisibleCommandRequest,
    createTranscriptEvent
} from "../../runtime/commands/commandProtocol";
import {
    createProductCommandRequest
} from "../../runtime/product-commands/productCommandProtocol";
import {
    createPromptAnswerRequest,
    createPromptRequest
} from "../../runtime/prompts/promptProtocol";
import {
    createStartupTaskExecutionRequest
} from "../../runtime/startup/startupTaskProtocol";
import {
    createWorkspaceRenameRequest
} from "../../runtime/workspace/workspaceProtocol";
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
    WorkspaceListOptions,
    WorkspaceSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import {
    runtimeSessionIpcChannels
} from "../../core/ipc/runtimeSessionIpc";
import {
    runtimeCommandIpcChannels
} from "../../core/ipc/runtimeCommandIpc";
import {
    workspaceIpcChannels
} from "../../core/ipc/workspaceIpc";
import {
    createWorkspaceActiveDatasetDelivery,
    readWorkspaceActiveDatasetScope
} from "../../runtime/workspace/workspaceActiveDatasetDelivery";
import { captureWorkspaceRuntimeScope } from "../../runtime/workspace/workspaceSnapshotDelivery";
import type { RuntimeCommandResult } from "../../runtime/commands/runtimeCommandReceipt";


export interface RuntimeSessionIpcControllerOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        | "getSnapshot"
        | "getWorkspaceSnapshot"
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
    executeVisibleCommand(request: VisibleCommandRequest): Promise<RuntimeCommandResult>;
    captureWorkspaceBaseline(source: string): Promise<void>;
    refreshWorkspaceAndBroadcast(
        options?: WorkspaceListOptions
    ): Promise<WorkspaceSnapshot>;
    broadcastRuntimeEvents(): Promise<void>;
    invalidateInitialDatasetPreview(objectName?: string): void;
    sendTranscriptEvents(events: TranscriptEvent[]): void;
    sendWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void | Promise<void | boolean>;
    sendActiveDataset(snapshot: ActiveDatasetSnapshot): void;
    warmInitialDatasetPreview(objectName: string): void;
    warmInitialVariableMetadata(objectName: string): void;
}


export const createRuntimeSessionIpcController = function(
    options: RuntimeSessionIpcControllerOptions
): void {
    const activeDatasetDelivery = createWorkspaceActiveDatasetDelivery({
        getSessionScope: () => readWorkspaceActiveDatasetScope(
            options.runtimeSessionManager.getWorkspaceSnapshot()
        ) || options.runtimeSessionManager,
        getAuthoritativeSnapshot: () => options.runtimeSessionManager.getActiveDataset(),
        readActiveDataset: async () => options.runtimeSessionManager.getActiveDataset(),
        requestActiveDataset: (name) => options.runtimeSessionManager.setActiveDataset(name),
        publish: options.sendActiveDataset,
        selected: async function(snapshot) {
            warmDatasetEditorFirstScreens(
                options.warmInitialDatasetPreview,
                options.warmInitialVariableMetadata,
                snapshot.objectName
            );
            await options.broadcastRuntimeEvents();
        }
    });

    const reportUncertainWorkspaceChange = function(snapshot: WorkspaceSnapshot): void {
        if (snapshot.status !== "uncertain") {
            return;
        }

        options.sendTranscriptEvents([createTranscriptEvent("output", {
            kind: "workspace.mutation",
            source: "workspace",
            text: ""
        }, {
            id: `workspace-warning-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            streamName: "warning",
            message: `Warning: ${snapshot.message}\n`
        })]);
    };
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
            detectChanges: true
        });
    });

    options.ipcMain.handle(
        workspaceIpcChannels.removeObjects,
        async (
            _event: IpcMainInvokeEvent,
            input: { objectNames?: string[] }
        ) => {
            const scopeIsCurrent = captureWorkspaceRuntimeScope(
                () => options.runtimeSessionManager
            );
            (input?.objectNames || []).forEach((objectName) => {
                options.invalidateInitialDatasetPreview(objectName);
            });

            const snapshot = await options.runtimeSessionManager
                .removeWorkspaceObjects(input?.objectNames || []);

            if (!scopeIsCurrent(snapshot)) {
                return options.runtimeSessionManager.getWorkspaceSnapshot();
            }
            if (await options.sendWorkspaceSnapshot(snapshot) === false) {
                return options.runtimeSessionManager.getWorkspaceSnapshot();
            }
            reportUncertainWorkspaceChange(snapshot);
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
            const scopeIsCurrent = captureWorkspaceRuntimeScope(
                () => options.runtimeSessionManager
            );
            options.invalidateInitialDatasetPreview(input?.oldName);

            const snapshot = await options.runtimeSessionManager
                .renameWorkspaceObject(createWorkspaceRenameRequest(input || {}));

            if (!scopeIsCurrent(snapshot)) {
                return options.runtimeSessionManager.getWorkspaceSnapshot();
            }
            if (await options.sendWorkspaceSnapshot(snapshot) === false) {
                return options.runtimeSessionManager.getWorkspaceSnapshot();
            }
            reportUncertainWorkspaceChange(snapshot);
            options.sendActiveDataset(options.runtimeSessionManager.getActiveDataset());
            await options.broadcastRuntimeEvents();

            return snapshot;
        }
    );

    options.ipcMain.handle(workspaceIpcChannels.clear, async () => {
        const scopeIsCurrent = captureWorkspaceRuntimeScope(
            () => options.runtimeSessionManager
        );
        options.invalidateInitialDatasetPreview();

        const snapshot = await options.runtimeSessionManager.clearWorkspace();

        if (!scopeIsCurrent(snapshot)) {
            return options.runtimeSessionManager.getWorkspaceSnapshot();
        }
        if (await options.sendWorkspaceSnapshot(snapshot) === false) {
            return options.runtimeSessionManager.getWorkspaceSnapshot();
        }
        reportUncertainWorkspaceChange(snapshot);
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
            const snapshot = await activeDatasetDelivery.select(objectName);
            return snapshot || options.runtimeSessionManager.getActiveDataset();
        }
    );
};
