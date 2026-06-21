import type {
    PromptAnswerRequest,
    PromptRequest,
    PromptResult,
    PromptSnapshot,
    RuntimeEventSnapshot,
    RuntimeSessionSnapshot,
    StartupTaskExecutionRequest,
    StartupTaskExecutionResult
} from "../../runtime/provider-contract/runtimeProvider";


export const runtimeSessionIpcChannels = {
    get: "base-app:getRuntimeSession",
    start: "base-app:startRuntime",
    stop: "base-app:stopRuntime",
    restart: "base-app:restartRuntime",
    restartForPackages: "packages:restartRuntime",
    listEvents: "base-app:listRuntimeEvents",
    listPrompts: "base-app:listPrompts",
    requestPrompt: "base-app:requestPrompt",
    answerPrompt: "base-app:answerPrompt",
    executeStartupTask: "base-app:executeStartupTask"
} as const;


export type RuntimeSessionIpcChannel =
    typeof runtimeSessionIpcChannels[
        keyof typeof runtimeSessionIpcChannels
    ];


export interface RuntimeRestartRequest {
    action: "clean" | "restore";
}


interface RuntimeSessionIpcInputs {
    "base-app:getRuntimeSession": undefined;
    "base-app:startRuntime": undefined;
    "base-app:stopRuntime": undefined;
    "base-app:restartRuntime": RuntimeRestartRequest;
    "packages:restartRuntime": RuntimeRestartRequest;
    "base-app:listRuntimeEvents": undefined;
    "base-app:listPrompts": undefined;
    "base-app:requestPrompt": Partial<PromptRequest>;
    "base-app:answerPrompt": Partial<PromptAnswerRequest>;
    "base-app:executeStartupTask": Partial<StartupTaskExecutionRequest>;
}


interface RuntimeSessionIpcResults {
    "base-app:getRuntimeSession": RuntimeSessionSnapshot;
    "base-app:startRuntime": RuntimeSessionSnapshot;
    "base-app:stopRuntime": RuntimeSessionSnapshot;
    "base-app:restartRuntime": RuntimeSessionSnapshot;
    "packages:restartRuntime": RuntimeSessionSnapshot;
    "base-app:listRuntimeEvents": RuntimeEventSnapshot;
    "base-app:listPrompts": PromptSnapshot;
    "base-app:requestPrompt": PromptResult;
    "base-app:answerPrompt": PromptResult;
    "base-app:executeStartupTask": StartupTaskExecutionResult;
}


interface InvokeTransport {
    invoke(
        channel: string,
        ...args: unknown[]
    ): Promise<unknown>;
}


type InvokeArguments<
    Channel extends RuntimeSessionIpcChannel
> = RuntimeSessionIpcInputs[Channel] extends undefined
    ? []
    : [RuntimeSessionIpcInputs[Channel]];


export const invokeRuntimeSessionRoute = function<
    Channel extends RuntimeSessionIpcChannel
>(
    transport: InvokeTransport,
    channel: Channel,
    ...args: InvokeArguments<Channel>
): Promise<RuntimeSessionIpcResults[Channel]> {
    return transport.invoke(
        channel,
        ...args
    ) as Promise<RuntimeSessionIpcResults[Channel]>;
};
