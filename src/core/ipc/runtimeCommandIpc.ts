import type {
    ProductCommandRequest,
    ProductCommandResult,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";


export const runtimeCommandIpcChannels = {
    executeVisible: "base-app:executeVisibleCommand",
    executeProduct: "base-app:executeProductCommand"
} as const;


export type RuntimeCommandIpcChannel =
    typeof runtimeCommandIpcChannels[
        keyof typeof runtimeCommandIpcChannels
    ];


interface RuntimeCommandIpcInputs {
    "base-app:executeVisibleCommand":
        Partial<VisibleCommandRequest>;
    "base-app:executeProductCommand":
        Partial<ProductCommandRequest>;
}


interface RuntimeCommandIpcResults {
    "base-app:executeVisibleCommand": TranscriptEvent[];
    "base-app:executeProductCommand": ProductCommandResult;
}


interface InvokeTransport {
    invoke(
        channel: string,
        ...args: unknown[]
    ): Promise<unknown>;
}


export const invokeRuntimeCommandRoute = function<
    Channel extends RuntimeCommandIpcChannel
>(
    transport: InvokeTransport,
    channel: Channel,
    input: RuntimeCommandIpcInputs[Channel]
): Promise<RuntimeCommandIpcResults[Channel]> {
    return transport.invoke(
        channel,
        input
    ) as Promise<RuntimeCommandIpcResults[Channel]>;
};
