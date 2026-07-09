import type {
    CopyPayload
} from "../../dataset-editor/clipboard/copyPayload";
import type {
    ClipboardResult
} from "./clipboardResult";
import {
    invokeTypedIpcRoute,
    type IpcInvokeTransport
} from "../../core/ipc/typedIpc";


export const shellClipboardIpcChannels = {
    copyPayload: "base-app:copyPayloadToClipboard",
    readText: "base-app:readClipboardText"
} as const;


interface ShellClipboardIpcRoutes {
    "base-app:copyPayloadToClipboard": {
        input: [CopyPayload];
        result: ClipboardResult;
    };
    "base-app:readClipboardText": {
        input: [];
        result: ClipboardResult;
    };
}


export const invokeShellClipboardRoute = function<
    Channel extends keyof ShellClipboardIpcRoutes & string
>(
    transport: IpcInvokeTransport,
    channel: Channel,
    ...args: ShellClipboardIpcRoutes[Channel]["input"]
): Promise<ShellClipboardIpcRoutes[Channel]["result"]> {
    return invokeTypedIpcRoute<
        ShellClipboardIpcRoutes[Channel]["input"],
        ShellClipboardIpcRoutes[Channel]["result"]
    >(transport, channel, ...args);
};
