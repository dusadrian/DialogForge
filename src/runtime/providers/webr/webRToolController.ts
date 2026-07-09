import {
    createCompletionItem,
    createCompletionResult
} from "../../completions/completionProtocol";
import {
    createDependencyCheckItem,
    createDependencyCheckResult
} from "../../dependencies/dependencyProtocol";
import { createHelpTopicResult } from "../../help/helpProtocol";
import type {
    CompletionRequest,
    CompletionResult,
    DependencyCheckRequest,
    DependencyCheckResult,
    HelpTopicRequest,
    HelpTopicResult,
    RuntimeSessionSnapshot,
    RuntimeToolController
} from "../../provider-contract/runtimeProvider";
import type { RuntimeTransportController } from "../../transport/runtimeTransport";
import { webRTransportMethods } from "./webRTransportMethods";
import {
    readResponseArray,
    readResponseObject,
    sendWebRRequest
} from "./webRTransportResponse";


export const createWebRToolController = function(
    transport: RuntimeTransportController
): RuntimeToolController {
    return {
        readHelpTopic: async function(
            request: HelpTopicRequest,
            snapshot: RuntimeSessionSnapshot
        ): Promise<HelpTopicResult> {
            const response = await sendWebRRequest(
                transport,
                webRTransportMethods.helpTopic,
                { request }
            );

            if (response.status === "error") {
                return createHelpTopicResult({
                    status: "failed",
                    providerId: snapshot.providerId,
                    topic: request.topic,
                    message: response.message || "WebR help lookup failed."
                });
            }

            const payload = readResponseObject(response);

            return createHelpTopicResult({
                status: String(payload.status || "ready"),
                providerId: snapshot.providerId,
                topic: request.topic,
                kind: String(payload.kind || "single"),
                title: String(payload.title || ""),
                path: String(payload.path || ""),
                matches: Array.isArray(payload.matches) ? payload.matches : [],
                body: String(payload.body || ""),
                message: String(payload.message || response.message || "")
            });
        },
        readCompletions: async function(
            request: CompletionRequest,
            snapshot: RuntimeSessionSnapshot
        ): Promise<CompletionResult> {
            const response = await sendWebRRequest(
                transport,
                webRTransportMethods.completions,
                { request }
            );

            if (response.status === "error") {
                return createCompletionResult({
                    status: "failed",
                    providerId: snapshot.providerId,
                    prefix: request.prefix,
                    message: response.message || "WebR completions failed."
                });
            }

            const payload = readResponseObject(response);
            const items = readResponseArray(response, "items").map((item) => {
                return createCompletionItem(
                    item && typeof item === "object" && !Array.isArray(item)
                        ? item as Parameters<typeof createCompletionItem>[0]
                        : {}
                );
            });

            return createCompletionResult({
                status: String(payload.status || "ready"),
                providerId: snapshot.providerId,
                prefix: request.prefix,
                items,
                exports: Array.isArray(payload.exports)
                    ? payload.exports.map((value) => String(value || ""))
                    : [],
                internals: Array.isArray(payload.internals)
                    ? payload.internals.map((value) => String(value || ""))
                    : [],
                symbols: Array.isArray(payload.symbols)
                    ? payload.symbols.map((value) => String(value || ""))
                    : [],
                message: String(payload.message || response.message || "")
            });
        },
        checkDependencies: async function(
            request: DependencyCheckRequest,
            snapshot: RuntimeSessionSnapshot
        ): Promise<DependencyCheckResult> {
            const response = await sendWebRRequest(
                transport,
                webRTransportMethods.dependencies,
                { request }
            );

            if (response.status === "error") {
                return createDependencyCheckResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    kind: request.kind,
                    message: response.message || "WebR package availability check failed."
                });
            }

            const payload = readResponseObject(response);
            const items = readResponseArray(response, "items").map((item) => {
                return createDependencyCheckItem(
                    item && typeof item === "object" && !Array.isArray(item)
                        ? item as Parameters<typeof createDependencyCheckItem>[0]
                        : {}
                );
            });

            return createDependencyCheckResult({
                status: String(payload.status || "ready"),
                providerId: snapshot.providerId,
                kind: request.kind,
                items,
                message: String(
                    payload.message ||
                    response.message ||
                    "WebR checked package availability in the worker."
                )
            });
        }
    };
};
