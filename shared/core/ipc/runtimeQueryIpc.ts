import type {
    CompletionRequest,
    CompletionResult,
    DependencyCheckRequest,
    DependencyCheckResult,
    InvisibleMutationRequest,
    InvisibleMutationResult,
    InvisibleQueryRequest,
    InvisibleQueryResult,
    RuntimeExtensionMethodRequest,
    RuntimeExtensionMethodResult
} from "../../runtime/provider-contract/runtimeProvider";
import {
    invokeTypedIpcRoute,
    type IpcInvokeTransport
} from "./typedIpc";


export const runtimeQueryIpcChannels = {
    readCompletions: "base-app:readCompletions",
    checkDependencies: "base-app:checkDependencies",
    executeInvisibleQuery: "base-app:executeInvisibleQuery",
    executeInvisibleMutation: "base-app:executeInvisibleMutation",
    executeRuntimeMethod: "base-app:executeRuntimeMethod"
} as const;


interface RuntimeQueryIpcRoutes {
    "base-app:readCompletions": {
        input: [Partial<CompletionRequest>];
        result: CompletionResult;
    };
    "base-app:checkDependencies": {
        input: [Partial<DependencyCheckRequest>];
        result: DependencyCheckResult;
    };
    "base-app:executeInvisibleQuery": {
        input: [Partial<InvisibleQueryRequest>];
        result: InvisibleQueryResult;
    };
    "base-app:executeInvisibleMutation": {
        input: [Partial<InvisibleMutationRequest>];
        result: InvisibleMutationResult;
    };
    "base-app:executeRuntimeMethod": {
        input: [Partial<RuntimeExtensionMethodRequest>];
        result: RuntimeExtensionMethodResult;
    };
}


export const invokeRuntimeQueryRoute = function<
    Channel extends keyof RuntimeQueryIpcRoutes & string
>(
    transport: IpcInvokeTransport,
    channel: Channel,
    ...args: RuntimeQueryIpcRoutes[Channel]["input"]
): Promise<RuntimeQueryIpcRoutes[Channel]["result"]> {
    return invokeTypedIpcRoute<
        RuntimeQueryIpcRoutes[Channel]["input"],
        RuntimeQueryIpcRoutes[Channel]["result"]
    >(
        transport,
        channel,
        ...args
    );
};
