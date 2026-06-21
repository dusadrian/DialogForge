import type {
    WorkspacePaneWindowRequest,
    WorkspacePaneWindowResult
} from "./workspacePaneWindowController";
import {
    invokeTypedIpcRoute,
    type IpcInvokeTransport
} from "../../core/ipc/typedIpc";


export const shellWindowIpcChannels = {
    setMainWindowTitle: "base-app:setMainWindowTitle",
    setWorkspacePaneVisible: "base-app:setWorkspacePaneVisible",
    openDevDiagnostics: "base-app:openDevDiagnostics",
    getWorkingDirectory: "base-app:getWorkingDirectory"
} as const;


export const shellWindowEventChannels = {
    mainZoomFactor: "base-app:main-zoom-factor"
} as const;


interface ShellWindowIpcRoutes {
    "base-app:setMainWindowTitle": {
        input: [{ title?: string }];
        result: void;
    };
    "base-app:setWorkspacePaneVisible": {
        input: [WorkspacePaneWindowRequest];
        result: WorkspacePaneWindowResult;
    };
    "base-app:openDevDiagnostics": {
        input: [];
        result: { status: string; message: string };
    };
    "base-app:getWorkingDirectory": {
        input: [];
        result: { path: string; home: string };
    };
}


export const invokeShellWindowRoute = function<
    Channel extends keyof ShellWindowIpcRoutes & string
>(
    transport: IpcInvokeTransport,
    channel: Channel,
    ...args: ShellWindowIpcRoutes[Channel]["input"]
): Promise<ShellWindowIpcRoutes[Channel]["result"]> {
    return invokeTypedIpcRoute<
        ShellWindowIpcRoutes[Channel]["input"],
        ShellWindowIpcRoutes[Channel]["result"]
    >(transport, channel, ...args);
};
