import {
    invokeTypedIpcRoute,
    type IpcInvokeTransport
} from "../../core/ipc/typedIpc";


export interface ConsoleHistoryScope {
    productId?: string;
    runtimeId?: string;
}


export interface ConsoleHistoryWriteRequest extends ConsoleHistoryScope {
    history?: string[];
}


export const consoleHistoryIpcChannels = {
    read: "base-app:readConsoleHistory",
    write: "base-app:writeConsoleHistory"
} as const;


interface ConsoleHistoryIpcRoutes {
    "base-app:readConsoleHistory": {
        input: [ConsoleHistoryScope];
        result: string[];
    };
    "base-app:writeConsoleHistory": {
        input: [ConsoleHistoryWriteRequest];
        result: string[];
    };
}


export const invokeConsoleHistoryRoute = function<
    Channel extends keyof ConsoleHistoryIpcRoutes & string
>(
    transport: IpcInvokeTransport,
    channel: Channel,
    ...args: ConsoleHistoryIpcRoutes[Channel]["input"]
): Promise<ConsoleHistoryIpcRoutes[Channel]["result"]> {
    return invokeTypedIpcRoute<
        ConsoleHistoryIpcRoutes[Channel]["input"],
        ConsoleHistoryIpcRoutes[Channel]["result"]
    >(
        transport,
        channel,
        ...args
    );
};
