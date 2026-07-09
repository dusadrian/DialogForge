import type {
    ResourceBufferResult,
    ResourceClient,
    ResourceRequestOptions,
    ResourceTextResult
} from "../contracts/hostAdapter";


const normalizeContentType = function(response: Response): string {
    return String(response.headers.get("content-type") || "").trim();
};


const createTextResult = async function(response: Response): Promise<ResourceTextResult> {
    return {
        ok: response.ok,
        status: response.status,
        url: response.url,
        contentType: normalizeContentType(response),
        text: await response.text()
    };
};


const createBufferResult = async function(response: Response): Promise<ResourceBufferResult> {
    return {
        ok: response.ok,
        status: response.status,
        url: response.url,
        contentType: normalizeContentType(response),
        body: new Uint8Array(await response.arrayBuffer())
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
            return createTextResult(await fetchResource(url, options));
        },
        loadBuffer: async function(
            url: string,
            options?: ResourceRequestOptions
        ): Promise<ResourceBufferResult> {
            return createBufferResult(await fetchResource(url, options));
        }
    };
};
