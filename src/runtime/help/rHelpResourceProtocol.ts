import type { ResourceBufferResult, ResourceTextResult } from "../../core/contracts/hostAdapter";


export const rHelpResourceMaxBytes = 4 * 1024 * 1024;


export type RHelpTransportResponse = ResourceBufferResult | ResourceTextResult;


export const validateRHelpResponseMetadata = function(response: RHelpTransportResponse): void {
    if (
        !Number.isInteger(response.status) || response.status < 200 || response.status > 599 ||
        typeof response.url !== "string" || typeof response.contentType !== "string" ||
        /[\r\n]/.test(response.contentType) ||
        typeof response.ok !== "boolean" ||
        response.ok !== (response.status >= 200 && response.status < 300) ||
        (response.headers !== undefined && (!Array.isArray(response.headers) ||
            !response.headers.every((header) => typeof header === "string" && !/[\r\n]/.test(header))))
    ) {
        throw new Error("invalid-help-resource-response");
    }
};


export const readRHelpRedirectUrl = function(
    response: RHelpTransportResponse
): string | null {
    if (![301, 302, 303, 307, 308].includes(response.status)) {
        return null;
    }
    const locations = (response.headers || []).filter((header) => /^location\s*:/i.test(header));
    if (locations.length !== 1) {
        throw new Error("invalid-help-resource-redirect");
    }
    const location = locations[0].slice(locations[0].indexOf(":") + 1).trim();
    if (!location || /[\r\n]/.test(location)) {
        throw new Error("invalid-help-resource-redirect");
    }
    return new URL(location, response.url).href;
};


export const validateRHelpResource = function(
    response: ResourceBufferResult
): ResourceBufferResult {
    validateRHelpResponseMetadata(response);
    if (!(response.body instanceof Uint8Array)) {
        throw new Error("invalid-help-resource-response");
    }
    if (response.body.byteLength > rHelpResourceMaxBytes) {
        throw new Error("help-resource-too-large");
    }
    if (
        response.ok
        && /^image\//i.test(response.contentType.trim())
        && response.body.byteLength === 0
    ) {
        throw new Error("help-resource-empty-image");
    }

    return response;
};


// The worker has no HTTP connection from which to read response bytes. Its
// physical adapter carries the R HTTP handler's raw body as hexadecimal text.
export const decodeRHelpResourcePacket = function(
    text: string,
    url: string
): ResourceBufferResult & { headers: string[] } {
    if (text.length > rHelpResourceMaxBytes * 2 + 65536) {
        throw new Error("help-resource-too-large");
    }
    let packet;
    try {
        packet = JSON.parse(text);
    } catch {
        throw new Error("invalid-help-resource-response");
    }
    if (
        !packet || typeof packet !== "object" || Array.isArray(packet) ||
        typeof packet.body !== "string" || packet.body.length % 2 !== 0 ||
        !/^[0-9a-f]*$/i.test(packet.body) ||
        !Array.isArray(packet.headers) ||
        !packet.headers.every((header: unknown) => typeof header === "string" && !/[\r\n]/.test(header))
    ) {
        throw new Error("invalid-help-resource-response");
    }
    if (packet.body.length > rHelpResourceMaxBytes * 2) {
        throw new Error("help-resource-too-large");
    }

    const body = new Uint8Array(packet.body.length / 2);
    for (let index = 0; index < body.length; index += 1) {
        body[index] = Number.parseInt(packet.body.slice(index * 2, index * 2 + 2), 16);
    }

    return {
        ...validateRHelpResource({
            ok: packet.status >= 200 && packet.status < 300,
            status: packet.status, url, contentType: packet.contentType, body
        }),
        headers: packet.headers
    };
};


export const isRHelpPagePath = function(value: unknown): value is string {
    return typeof value === "string" && /^\/(?:library\/[^/]+\/(?:html\/[^/]+[.]html|help\/[^/]+)|doc\/html\/[^/]+[.]html)(?:[?#].*)?$/.test(value);
};
