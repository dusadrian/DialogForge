import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import {
    createCompletionRequest
} from "../completions/completionProtocol";
import {
    createDependencyCheckRequest
} from "../dependencies/dependencyProtocol";
import {
    createRuntimeExtensionMethodRequest
} from "../extensions/runtimeExtensionProtocol";
import {
    createInvisibleMutationRequest
} from "./invisibleMutationProtocol";
import {
    createInvisibleQueryRequest
} from "./invisibleQueryProtocol";
import type {
    CompletionRequest,
    DependencyCheckRequest,
    InvisibleMutationRequest,
    InvisibleQueryRequest,
    RuntimeExtensionMethodRequest,
    RuntimeSessionManager
} from "../provider-contract/runtimeProvider";
import {
    runtimeQueryIpcChannels
} from "../../core/ipc/runtimeQueryIpc";


export interface RuntimeQueryIpcControllerOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        | "readCompletions"
        | "checkDependencies"
        | "executeInvisibleQuery"
        | "executeInvisibleMutation"
        | "executeRuntimeMethod"
    >;
    captureWorkspaceBaseline(source: string): Promise<void>;
    refreshWorkspaceAndBroadcast(): Promise<unknown>;
}


export const createRuntimeQueryIpcController = function(
    options: RuntimeQueryIpcControllerOptions
): void {
    options.ipcMain.handle(
        runtimeQueryIpcChannels.readCompletions,
        async (_event: IpcMainInvokeEvent, input: Partial<CompletionRequest>) => {
            const request = createCompletionRequest(input || {});

            return options.runtimeSessionManager.readCompletions(request);
        }
    );

    options.ipcMain.handle(
        runtimeQueryIpcChannels.checkDependencies,
        async (_event: IpcMainInvokeEvent, input: Partial<DependencyCheckRequest>) => {
            const request = createDependencyCheckRequest(input || {});

            return options.runtimeSessionManager.checkDependencies(request);
        }
    );

    options.ipcMain.handle(
        runtimeQueryIpcChannels.executeInvisibleQuery,
        async (_event: IpcMainInvokeEvent, input: Partial<InvisibleQueryRequest>) => {
            const request = createInvisibleQueryRequest(input || {});

            return options.runtimeSessionManager.executeInvisibleQuery(request);
        }
    );

    options.ipcMain.handle(
        runtimeQueryIpcChannels.executeInvisibleMutation,
        async (_event: IpcMainInvokeEvent, input: Partial<InvisibleMutationRequest>) => {
            const request = createInvisibleMutationRequest(input || {});

            return options.runtimeSessionManager.executeInvisibleMutation(request);
        }
    );

    options.ipcMain.handle(
        runtimeQueryIpcChannels.executeRuntimeMethod,
        async (_event: IpcMainInvokeEvent, input: Partial<RuntimeExtensionMethodRequest>) => {
            const request = createRuntimeExtensionMethodRequest(input || {});
            const result = await options.runtimeSessionManager.executeRuntimeMethod(request);

            if (
                result.status === "ready" &&
                (
                    request.method === "runtime.load_workspace_file" ||
                    request.method === "runtime.save_workspace_file"
                )
            ) {
                await options.captureWorkspaceBaseline("base-app.workspace-file-baseline");
            }

            if (
                result.status === "ready" &&
                (
                    request.method === "runtime.load_workspace_file" ||
                    request.method === "runtime.run_script_file"
                )
            ) {
                await options.refreshWorkspaceAndBroadcast();
            }

            return result;
        }
    );
};
