import {
    createCompletionResult
} from "../completions/completionProtocol";
import {
    createDependencyCheckResult
} from "../dependencies/dependencyProtocol";
import { createHelpTopicResult } from "../help/helpProtocol";
import { createInvisibleMutationResult } from "../queries/invisibleMutationProtocol";
import { createInvisibleQueryResult } from "../queries/invisibleQueryProtocol";
import {
    createUnsupportedOperationResult
} from "../../core/contracts/operationResult";
import type {
    CompletionRequest,
    CompletionResult,
    DependencyCheckRequest,
    DependencyCheckResult,
    HelpTopicRequest,
    HelpTopicResult,
    InvisibleMutationRequest,
    InvisibleMutationResult,
    InvisibleQueryRequest,
    InvisibleQueryResult,
    RuntimeCapability,
    RuntimeSessionSnapshot
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeQueryExecutionController
} from "../queries/runtimeQueryExecutionController";
import type {
    RuntimeToolExecutionController
} from "../tools/runtimeToolExecutionController";


export interface RuntimeCapabilityRequestControllerOptions {
    toolExecutionController: RuntimeToolExecutionController;
    queryExecutionController: RuntimeQueryExecutionController;
    getSnapshot(): RuntimeSessionSnapshot;
    getWorkspaceReadEpoch?(): number;
    isWorkspaceReadAvailable?(): boolean;
    hasRuntimeCapability(capability: RuntimeCapability): boolean;
}


export interface RuntimeCapabilityRequestController {
    readHelpTopic(request: HelpTopicRequest): Promise<HelpTopicResult>;
    readCompletions(request: CompletionRequest): Promise<CompletionResult>;
    checkDependencies(request: DependencyCheckRequest): Promise<DependencyCheckResult>;
    executeInvisibleQuery(request: InvisibleQueryRequest): Promise<InvisibleQueryResult>;
    executeInvisibleMutation(
        request: InvisibleMutationRequest
    ): Promise<InvisibleMutationResult>;
}


export const createRuntimeCapabilityRequestController = function(
    options: RuntimeCapabilityRequestControllerOptions
): RuntimeCapabilityRequestController {
    const isCurrentRead = function(snapshot: RuntimeSessionSnapshot): boolean {
        const current = options.getSnapshot();

        return current.providerId === snapshot.providerId
            && current.lifecycleGeneration === snapshot.lifecycleGeneration
            && current.status === snapshot.status;
    };
    const retiredReadMessage = "Runtime session changed while reading; the old result was discarded.";

    return {
        readHelpTopic: async function(request) {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                return createHelpTopicResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    topic: request.topic,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("help.topics")) {
                return createHelpTopicResult(createUnsupportedOperationResult({
                    providerId: snapshot.providerId,
                    topic: request.topic,
                    message: "Selected provider does not advertise help topics."
                }));
            }

            if (!request.topic) {
                return createHelpTopicResult({
                    status: "invalid",
                    providerId: snapshot.providerId,
                    topic: request.topic,
                    message: "Help topic is required."
                });
            }

            const result = await options.toolExecutionController.readHelpTopic(request);
            if (!isCurrentRead(snapshot)) {
                return createHelpTopicResult({
                    status: "unavailable", providerId: snapshot.providerId,
                    topic: request.topic, message: retiredReadMessage
                });
            }

            return result;
        },
        readCompletions: async function(request) {
            const snapshot = options.getSnapshot();
            const workspaceEpoch = options.getWorkspaceReadEpoch?.();
            const isCurrentCompletionRead = function(): boolean {
                return isCurrentRead(snapshot)
                    && workspaceEpoch === options.getWorkspaceReadEpoch?.()
                    && options.isWorkspaceReadAvailable?.() !== false;
            };
            const discardedCompletion = function(): CompletionResult {
                return createCompletionResult({
                    status: "unavailable", providerId: snapshot.providerId,
                    prefix: request.prefix, message: retiredReadMessage
                });
            };

            if (snapshot.status !== "ready" || options.isWorkspaceReadAvailable?.() === false) {
                return createCompletionResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    prefix: request.prefix,
                    message: "Runtime session or workspace is not ready for completions."
                });
            }

            if (!options.hasRuntimeCapability("completions.symbols")) {
                return createCompletionResult(createUnsupportedOperationResult({
                    providerId: snapshot.providerId,
                    prefix: request.prefix,
                    message: "Selected provider does not advertise symbol completions."
                }));
            }

            let result: CompletionResult;
            try {
                result = await options.toolExecutionController.readCompletions(request);
            }
            catch (error) {
                if (isCurrentCompletionRead()) {
                    throw error;
                }

                return discardedCompletion();
            }
            if (!isCurrentCompletionRead()) {
                return discardedCompletion();
            }

            return result;
        },
        checkDependencies: async function(request) {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                return createDependencyCheckResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    kind: request.kind,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("dependencies.packages")) {
                return createDependencyCheckResult(createUnsupportedOperationResult({
                    providerId: snapshot.providerId,
                    kind: request.kind,
                    message: "Selected provider does not advertise dependency checks."
                }));
            }

            if (request.names.length === 0) {
                return createDependencyCheckResult({
                    status: "invalid",
                    providerId: snapshot.providerId,
                    kind: request.kind,
                    message: "At least one dependency name is required."
                });
            }

            const result = await options.toolExecutionController.checkDependencies(request);
            if (!isCurrentRead(snapshot)) {
                return createDependencyCheckResult({
                    status: "unavailable", providerId: snapshot.providerId,
                    kind: request.kind, message: retiredReadMessage
                });
            }

            return result;
        },
        executeInvisibleQuery: async function(request) {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                return createInvisibleQueryResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    query: request.query,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("commands.invisible")) {
                return createInvisibleQueryResult(createUnsupportedOperationResult({
                    providerId: snapshot.providerId,
                    query: request.query,
                    message: "Selected provider does not advertise invisible queries."
                }));
            }

            if (!request.query) {
                return createInvisibleQueryResult({
                    status: "invalid",
                    providerId: snapshot.providerId,
                    query: request.query,
                    message: "Invisible query text is required."
                });
            }

            const result = await options.queryExecutionController.executeInvisibleQuery(request);
            if (!isCurrentRead(snapshot)) {
                return createInvisibleQueryResult({
                    status: "unavailable", providerId: snapshot.providerId,
                    query: request.query, message: retiredReadMessage
                });
            }

            return result;
        },
        executeInvisibleMutation: async function(request) {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                return createInvisibleMutationResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    mutation: request.mutation,
                    value: request.value,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("commands.invisible")) {
                return createInvisibleMutationResult(createUnsupportedOperationResult({
                    providerId: snapshot.providerId,
                    mutation: request.mutation,
                    value: request.value,
                    message: "Selected provider does not advertise invisible mutations."
                }));
            }

            if (!request.mutation) {
                return createInvisibleMutationResult({
                    status: "invalid",
                    providerId: snapshot.providerId,
                    mutation: request.mutation,
                    value: request.value,
                    message: "Invisible mutation name is required."
                });
            }

            return options.queryExecutionController.executeInvisibleMutation(request);
        }
    };
};
