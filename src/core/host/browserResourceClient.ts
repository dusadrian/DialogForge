import type {
    ResourceBufferResult,
    ResourceClient,
    ResourceRequestOptions,
    ResourceTextResult
} from "../contracts/hostAdapter";
import { createResourceBodyCollector } from "./resourceBodyCollector";


const normalizeContentType = function(response: Response): string {
    return String(response.headers.get("content-type") || "").trim();
};


const readResponseHeaders = function(response: Response): string[] {
    const headers: string[] = [];
    response.headers.forEach((value, name) => {
        headers.push(`${name}: ${value}`);
    });
    return headers;
};


const readResponseBody = async function(
    response: Response,
    collector: ReturnType<typeof createResourceBodyCollector>,
    bounded: boolean
): Promise<Uint8Array> {
    if (!bounded) {
        return new Uint8Array(await response.arrayBuffer());
    }
    if (!response.body) {
        return collector.finish();
    }
    const reader = response.body.getReader();
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) {
                return collector.finish();
            }
            collector.append(chunk.value);
        }
    } catch (error) {
        try {
            await reader.cancel(error);
        } catch {
            // Retain the original read/limit failure if cancellation also fails.
        }
        throw error;
    } finally {
        reader.releaseLock();
    }
};


const createTextResult = async function(
    response: Response,
    collector: ReturnType<typeof createResourceBodyCollector>,
    bounded: boolean
): Promise<ResourceTextResult> {
    return {
        ok: response.ok,
        status: response.status,
        url: response.url,
        contentType: normalizeContentType(response),
        text: new TextDecoder().decode(await readResponseBody(response, collector, bounded)),
        headers: readResponseHeaders(response)
    };
};


const createBufferResult = async function(
    response: Response,
    collector: ReturnType<typeof createResourceBodyCollector>,
    bounded: boolean
): Promise<ResourceBufferResult> {
    return {
        ok: response.ok,
        status: response.status,
        url: response.url,
        contentType: normalizeContentType(response),
        body: await readResponseBody(response, collector, bounded),
        headers: readResponseHeaders(response)
    };
};


const fetchResource = function(
    url: string,
    options: ResourceRequestOptions = {}
): Promise<Response> {
    return fetch(url, {
        method: "GET",
        redirect: options.redirect || "follow"
    });
};


export const createBrowserResourceClient = function(): ResourceClient {
    return {
        loadText: async function(
            url: string,
            options?: ResourceRequestOptions
        ): Promise<ResourceTextResult> {
            const collector = createResourceBodyCollector(options?.maxBodyBytes);
            return createTextResult(await fetchResource(url, options), collector,
                options?.maxBodyBytes !== undefined);
        },
        loadBuffer: async function(
            url: string,
            options?: ResourceRequestOptions
        ): Promise<ResourceBufferResult> {
            const collector = createResourceBodyCollector(options?.maxBodyBytes);
            return createBufferResult(await fetchResource(url, options), collector,
                options?.maxBodyBytes !== undefined);
        }
    };
};
