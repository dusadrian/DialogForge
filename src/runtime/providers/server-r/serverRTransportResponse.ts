import type {
    RuntimeTransportController,
    RuntimeTransportResponse
} from "../../transport/runtimeTransport";


let requestSequence = 0;


export const createServerRRequestId = function(prefix: string): string {
    requestSequence += 1;

    return `server-r.${prefix}.${requestSequence}`;
};


export const sendServerRRequest = async function(
    transport: RuntimeTransportController,
    method: string,
    params: Record<string, unknown>
): Promise<RuntimeTransportResponse> {
    return transport.sendRequest({
        id: createServerRRequestId(method),
        method,
        params,
        createdAt: new Date().toISOString()
    });
};


export const readResponseObject = function(
    response: RuntimeTransportResponse
): Record<string, unknown> {
    return response.value
        && typeof response.value === "object"
        && !Array.isArray(response.value)
        ? response.value as Record<string, unknown>
        : {};
};


export const readResponseArray = function(
    response: RuntimeTransportResponse,
    key: string
): unknown[] {
    const object = readResponseObject(response);
    const value = object[key];

    return Array.isArray(value) ? value : [];
};
