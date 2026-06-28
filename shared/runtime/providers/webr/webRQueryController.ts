import {
    createInvisibleQueryResult
} from "../../queries/invisibleQueryProtocol";
import type {
    InvisibleQueryRequest,
    InvisibleQueryResult,
    RuntimeQueryController,
    RuntimeSessionSnapshot
} from "../../provider-contract/runtimeProvider";
import type { RuntimeTransportController } from "../../transport/runtimeTransport";
import { webRTransportMethods } from "./webRTransportMethods";
import {
    readResponseObject,
    sendWebRRequest
} from "./webRTransportResponse";


export const createWebRQueryController = function(
    transport: RuntimeTransportController
): RuntimeQueryController {
    return {
        executeInvisibleQuery: async function(
            request: InvisibleQueryRequest,
            snapshot: RuntimeSessionSnapshot
        ): Promise<InvisibleQueryResult> {
            const response = await sendWebRRequest(
                transport,
                webRTransportMethods.invisibleQuery,
                { request }
            );

            if (response.status === "error") {
                return createInvisibleQueryResult({
                    status: "failed",
                    providerId: snapshot.providerId,
                    query: request.query,
                    value: null,
                    message: response.message || "WebR invisible query failed."
                });
            }

            const payload = readResponseObject(response);

            return createInvisibleQueryResult({
                status: String(payload.status || "ready"),
                providerId: snapshot.providerId,
                query: request.query,
                value: payload.value,
                message: String(payload.message || response.message || "")
            });
        }
    };
};
