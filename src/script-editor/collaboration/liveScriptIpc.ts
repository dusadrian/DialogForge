import type {
    LiveScriptFrame
} from "./liveScriptProtocol";
import type {
    LiveScriptSessionTicket
} from "./liveScriptTicket";
import type {
    LiveScriptTransportFrameEvent,
    LiveScriptTransportStateEvent
} from "./liveScriptTransport";


export const liveScriptIpcChannels = {
    capability: "script-editor:live-script-capability",
    host: "script-editor:live-script-host",
    join: "script-editor:live-script-join",
    send: "script-editor:live-script-send",
    close: "script-editor:live-script-close"
} as const;


export const liveScriptEventChannels = {
    frame: "script-editor:live-script-frame",
    state: "script-editor:live-script-state"
} as const;


export interface LiveScriptCapabilityResult {
    available: boolean;
    endpointId: string;
    message: string;
    rendezvousUrl?: string;
}


export interface LiveScriptOperationResult {
    ok: boolean;
    message: string;
    endpointId?: string;
    transportAddress?: string;
}


interface LiveScriptIpcInputs {
    "script-editor:live-script-capability": undefined;
    "script-editor:live-script-host": { sessionId: string };
    "script-editor:live-script-join": { ticket: LiveScriptSessionTicket };
    "script-editor:live-script-send": {
        frame: LiveScriptFrame;
        recipientEndpointId?: string;
    };
    "script-editor:live-script-close": { sessionId: string };
}


interface LiveScriptIpcResults {
    "script-editor:live-script-capability": LiveScriptCapabilityResult;
    "script-editor:live-script-host": LiveScriptOperationResult;
    "script-editor:live-script-join": LiveScriptOperationResult;
    "script-editor:live-script-send": LiveScriptOperationResult;
    "script-editor:live-script-close": LiveScriptOperationResult;
}


export type LiveScriptIpcChannel =
    typeof liveScriptIpcChannels[keyof typeof liveScriptIpcChannels];


type InvokeArguments<Channel extends LiveScriptIpcChannel> =
    LiveScriptIpcInputs[Channel] extends undefined
        ? []
        : [LiveScriptIpcInputs[Channel]];


interface InvokeTransport {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}


export interface LiveScriptRendererBridge {
    capability(): Promise<LiveScriptCapabilityResult>;
    host(sessionId: string): Promise<LiveScriptOperationResult>;
    join(ticket: LiveScriptSessionTicket): Promise<LiveScriptOperationResult>;
    send(frame: LiveScriptFrame, recipientEndpointId?: string): Promise<LiveScriptOperationResult>;
    close(sessionId: string): Promise<LiveScriptOperationResult>;
    onFrame(callback: (event: LiveScriptTransportFrameEvent) => void): void;
    onState(callback: (event: LiveScriptTransportStateEvent) => void): void;
}


export const invokeLiveScriptRoute = function<Channel extends LiveScriptIpcChannel>(
    transport: InvokeTransport,
    channel: Channel,
    ...args: InvokeArguments<Channel>
): Promise<LiveScriptIpcResults[Channel]> {
    return transport.invoke(
        channel,
        ...args
    ) as Promise<LiveScriptIpcResults[Channel]>;
};
