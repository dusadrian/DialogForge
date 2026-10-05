import type {
    ResourceTextResult,
    ResourceBufferResult
} from "../../core/contracts/hostAdapter";
import {
    validateRHelpResource, validateRHelpResponseMetadata,
    readRHelpRedirectUrl, rHelpResourceMaxBytes, type RHelpTransportResponse
} from "./rHelpResourceProtocol";


export interface RHelpPageResult {
    ok: boolean;
    status?: number;
    url?: string;
    text?: string;
    contentType?: string;
    resourceBaseUrl?: string;
    error?: string;
}


export interface RHelpResourceResult extends Omit<RHelpPageResult, "text"> {
    body?: Uint8Array;
}


const createRHelpReadFailure = function(error: unknown): RHelpPageResult {
    const message = error instanceof Error ? error.message : String(error);
    return {
        ok: false,
        status: message === "help-resource-retired" ? 410 : 500,
        error: message === "resource-body-too-large" ? "help-resource-too-large" : message
    };
};


export const assertRHelpReadOwner = function(isCurrent?: () => boolean): void {
    if (isCurrent && !isCurrent()) {
        throw new Error("help-resource-retired");
    }
};


export const createRHelpPageReader = function(bindings: {
    resolveUrl(value: string): string | Promise<string>;
    loadText(url: string): Promise<ResourceTextResult & { headers?: string[] }>;
    loadBuffer?(url: string): Promise<ResourceBufferResult & { headers?: string[] }>;
    invalidUrlError?: string;
    invalidUrlStatus?: number;
    isCurrent?(): boolean;
    captureOwner?(): () => boolean;
}) {
    const assertCurrent = function(): void {
        assertRHelpReadOwner(bindings.isCurrent);
    };
    const loadResponse = async function(
        url: string,
        load: (url: string) => Promise<RHelpTransportResponse>
    ): Promise<RHelpTransportResponse> {
        const ownsResponse = bindings.captureOwner?.() || (() => true);
        const assertResponseOwner = function(): void {
            assertCurrent();
            if (!ownsResponse()) {
                throw new Error("help-resource-retired");
            }
        };
        const visited = new Set<string>();
        for (let redirects = 0; redirects <= 8; redirects += 1) {
            assertResponseOwner();
            if (visited.has(url)) {
                throw new Error("help-resource-redirect-loop");
            }
            visited.add(url);
            let response: RHelpTransportResponse;
            try {
                response = await load(url);
            }
            catch (error) {
                assertResponseOwner();
                throw error;
            }
            assertResponseOwner();
            validateRHelpResponseMetadata(response);
            if ("body" in response) {
                validateRHelpResource(response);
            } else if (typeof response.text !== "string") {
                throw new Error("invalid-help-resource-response");
            } else if (new TextEncoder().encode(response.text).byteLength > rHelpResourceMaxBytes) {
                throw new Error("help-resource-too-large");
            }
            const redirectUrl = readRHelpRedirectUrl(response);
            if (!redirectUrl) {
                return response;
            }
            try {
                url = await bindings.resolveUrl(redirectUrl);
            }
            catch (error) {
                assertResponseOwner();
                throw error;
            }
            assertResponseOwner();
            if (!url) {
                throw new Error("unsupported-help-resource-redirect");
            }
        }
        throw new Error("help-resource-redirect-limit");
    };

    return {
        async fetchResource(value: unknown): Promise<RHelpResourceResult> {
            const raw = String(value || "").trim();
            try {
                assertCurrent();
                const url = raw ? await bindings.resolveUrl(raw) : "";
                assertCurrent();
                if (!url) {
                    return {
                        ok: false, status: bindings.invalidUrlStatus || 400,
                        error: bindings.invalidUrlError || "invalid-help-url"
                    };
                }
                if (!bindings.loadBuffer) {
                    return { ok: false, status: 501, error: "help-resource-transport-unavailable" };
                }
                const loaded = await loadResponse(url, bindings.loadBuffer);
                if (!("body" in loaded)) {
                    throw new Error("invalid-help-resource-response");
                }
                const response = validateRHelpResource(loaded);
                return {
                    ok: response.ok, status: response.status,
                    url: response.url || url, contentType: response.contentType,
                    body: response.body
                };
            } catch (error) {
                return createRHelpReadFailure(error);
            }
        },
        async fetchPage(value: unknown): Promise<RHelpPageResult> {
            const raw = String(value || "").trim();
            const invalidResult = function(): RHelpPageResult {
                return {
                    ok: false,
                    status: bindings.invalidUrlStatus || 400,
                    error: bindings.invalidUrlError || "invalid-help-url"
                };
            };

            if (!raw) {
                return invalidResult();
            }

            try {
                assertCurrent();
                const url = await bindings.resolveUrl(raw);
                assertCurrent();
                if (!url) {
                    return invalidResult();
                }
                const response = await loadResponse(url, bindings.loadText);
                if (!("text" in response)) {
                    throw new Error("invalid-help-resource-response");
                }
                return {
                    ok: response.ok,
                    status: response.status,
                    url: response.url || url,
                    text: response.text,
                    contentType: response.contentType
                };
            }
            catch (error) {
                return createRHelpReadFailure(error);
            }
        }
    };
};
