import type {
    OpenFileResult,
    PathInfoResult
} from "./openFileResult";
import {
    invokeTypedIpcRoute,
    type IpcInvokeTransport
} from "../../core/ipc/typedIpc";


export const shellFileDialogIpcChannels = {
    selectImportFile: "base-app:selectImportFile",
    legacyOpenImportFile: "importFromFile:openFile",
    selectWorkingDirectory: "base-app:selectWorkingDirectory",
    selectWorkspaceOpenFile: "base-app:selectWorkspaceOpenFile",
    selectWorkspaceSaveFile: "base-app:selectWorkspaceSaveFile",
    selectScriptFile: "base-app:selectScriptFile",
    inspectPath: "base-app:inspectPath"
} as const;


interface ShellFileDialogIpcRoutes {
    "base-app:selectImportFile": { input: []; result: OpenFileResult };
    "importFromFile:openFile": { input: []; result: unknown };
    "base-app:selectWorkingDirectory": { input: []; result: OpenFileResult };
    "base-app:selectWorkspaceOpenFile": { input: []; result: OpenFileResult };
    "base-app:selectWorkspaceSaveFile": { input: []; result: OpenFileResult };
    "base-app:selectScriptFile": { input: []; result: OpenFileResult };
    "base-app:inspectPath": { input: [string]; result: PathInfoResult };
}


export const invokeShellFileDialogRoute = function<
    Channel extends keyof ShellFileDialogIpcRoutes & string
>(
    transport: IpcInvokeTransport,
    channel: Channel,
    ...args: ShellFileDialogIpcRoutes[Channel]["input"]
): Promise<ShellFileDialogIpcRoutes[Channel]["result"]> {
    return invokeTypedIpcRoute<
        ShellFileDialogIpcRoutes[Channel]["input"],
        ShellFileDialogIpcRoutes[Channel]["result"]
    >(transport, channel, ...args);
};
