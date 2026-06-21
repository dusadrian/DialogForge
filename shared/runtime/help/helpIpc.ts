import type {
    HelpTopicRequest,
    HelpTopicResult,
    TranscriptEvent
} from "../provider-contract/runtimeProvider";
import {
    invokeTypedIpcRoute,
    type IpcInvokeTransport
} from "../../core/ipc/typedIpc";


export interface HelpDocumentSnapshot {
    title: string;
    body: string;
}


export type HelpCommandResult = HelpTopicResult | {
    status: string;
    message?: string;
    events?: TranscriptEvent[];
};


export const helpIpcChannels = {
    readTopic: "base-app:readHelpTopic",
    getDocument: "base-app:getHelpDocument",
    openTopic: "base-app:openHelpTopic",
    openCommandUrl: "base-app:openHelpCommandUrl",
    openRCommandUrl: "rHelp:openCommandUrl",
    fetchRPage: "rHelp:fetchPage",
    runExample: "base-app:runHelpExample"
} as const;


interface HelpIpcRoutes {
    "base-app:readHelpTopic": {
        input: [Partial<HelpTopicRequest>];
        result: HelpTopicResult;
    };
    "base-app:getHelpDocument": {
        input: [];
        result: HelpDocumentSnapshot;
    };
    "base-app:openHelpTopic": {
        input: [Partial<HelpTopicRequest>];
        result: HelpTopicResult;
    };
    "base-app:openHelpCommandUrl": {
        input: [string];
        result: HelpCommandResult;
    };
    "rHelp:fetchPage": {
        input: [unknown];
        result: unknown;
    };
    "base-app:runHelpExample": {
        input: [{ topic?: string; package?: string }];
        result: HelpCommandResult;
    };
}


export const invokeHelpRoute = function<
    Channel extends keyof HelpIpcRoutes & string
>(
    transport: IpcInvokeTransport,
    channel: Channel,
    ...args: HelpIpcRoutes[Channel]["input"]
): Promise<HelpIpcRoutes[Channel]["result"]> {
    return invokeTypedIpcRoute<
        HelpIpcRoutes[Channel]["input"],
        HelpIpcRoutes[Channel]["result"]
    >(transport, channel, ...args);
};
