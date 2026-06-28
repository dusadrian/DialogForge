import {
    createCompletionItem,
    createCompletionResult
} from "../../completions/completionProtocol";
import { createHelpTopicResult } from "../../help/helpProtocol";
import type {
    CompletionRequest,
    CompletionResult,
    HelpTopicRequest,
    HelpTopicResult,
    RuntimeSessionSnapshot,
    RuntimeToolController
} from "../../provider-contract/runtimeProvider";
import type { RuntimeTransportController } from "../../transport/runtimeTransport";
import { serverRTransportMethods } from "./serverRTransportMethods";
import {
    readResponseArray,
    readResponseObject,
    sendServerRRequest
} from "./serverRTransportResponse";


export const createServerRToolController = function(
    transport: RuntimeTransportController
): RuntimeToolController {
    return {
        readHelpTopic: async function(
            request: HelpTopicRequest,
            snapshot: RuntimeSessionSnapshot
        ): Promise<HelpTopicResult> {
            const response = await sendServerRRequest(
                transport,
                serverRTransportMethods.helpTopic,
                { request }
            );

            if (response.status === "error") {
                return createHelpTopicResult({
                    status: "failed",
                    providerId: snapshot.providerId,
                    topic: request.topic,
                    message: response.message || "Server R help lookup failed."
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
            const response = await sendServerRRequest(
                transport,
                serverRTransportMethods.completions,
                { request }
            );

            if (response.status === "error") {
                return createCompletionResult({
                    status: "failed",
                    providerId: snapshot.providerId,
                    prefix: request.prefix,
                    message: response.message || "Server R completions failed."
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
        }
    };
};
