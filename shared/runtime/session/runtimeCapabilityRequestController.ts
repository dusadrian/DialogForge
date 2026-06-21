import {
    createCompletionResult
} from "../completions/completionProtocol";
import {
    createDependencyCheckResult
} from "../dependencies/dependencyProtocol";
import { createHelpTopicResult } from "../help/helpProtocol";
import { createInvisibleMutationResult } from "../queries/invisibleMutationProtocol";
import { createInvisibleQueryResult } from "../queries/invisibleQueryProtocol";
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
                return createHelpTopicResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    topic: request.topic,
                    message: "Selected provider does not advertise help topics."
                });
            }

            if (!request.topic) {
                return createHelpTopicResult({
                    status: "invalid",
                    providerId: snapshot.providerId,
                    topic: request.topic,
                    message: "Help topic is required."
                });
            }

            return options.toolExecutionController.readHelpTopic(request);
        },
        readCompletions: async function(request) {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                return createCompletionResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    prefix: request.prefix,
                    message: "Runtime session is not ready."
                });
            }

            if (!options.hasRuntimeCapability("completions.symbols")) {
                return createCompletionResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    prefix: request.prefix,
                    message: "Selected provider does not advertise symbol completions."
                });
            }

            return options.toolExecutionController.readCompletions(request);
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
                return createDependencyCheckResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    kind: request.kind,
                    message: "Selected provider does not advertise dependency checks."
                });
            }

            if (request.names.length === 0) {
                return createDependencyCheckResult({
                    status: "invalid",
                    providerId: snapshot.providerId,
                    kind: request.kind,
                    message: "At least one dependency name is required."
                });
            }

            return options.toolExecutionController.checkDependencies(request);
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
                return createInvisibleQueryResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    query: request.query,
                    message: "Selected provider does not advertise invisible queries."
                });
            }

            if (!request.query) {
                return createInvisibleQueryResult({
                    status: "invalid",
                    providerId: snapshot.providerId,
                    query: request.query,
                    message: "Invisible query text is required."
                });
            }

            return options.queryExecutionController.executeInvisibleQuery(request);
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
                return createInvisibleMutationResult({
                    status: "unsupported",
                    providerId: snapshot.providerId,
                    mutation: request.mutation,
                    value: request.value,
                    message: "Selected provider does not advertise invisible mutations."
                });
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
