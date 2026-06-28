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
import { serverRTransportMethods } from "./serverRTransportMethods";
import {
    readResponseObject,
    sendServerRRequest
} from "./serverRTransportResponse";


export const createServerRQueryController = function(
    transport: RuntimeTransportController
): RuntimeQueryController {
    return {
        executeInvisibleQuery: async function(
            request: InvisibleQueryRequest,
            snapshot: RuntimeSessionSnapshot
        ): Promise<InvisibleQueryResult> {
            const response = await sendServerRRequest(
                transport,
                serverRTransportMethods.invisibleQuery,
                { request }
            );

            if (response.status === "error") {
                return createInvisibleQueryResult({
                    status: "failed",
                    providerId: snapshot.providerId,
                    query: request.query,
                    value: null,
                    message: response.message || "Server R invisible query failed."
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
