import * as http from "http";
import * as https from "https";

import type {
    ResourceBufferResult,
    ResourceClient,
    ResourceRequestOptions,
    ResourceTextResult
} from "../contracts/hostAdapter";


const maxRedirects = 5;


const normalizeContentType = function(value: unknown): string {
    if (Array.isArray(value)) {
        return String(value[0] || "").trim();
    }

    return String(value || "").trim();
};


const normalizeHeaders = function(
    headers: http.IncomingHttpHeaders
): Record<string, string> {
    const out: Record<string, string> = {};

    Object.keys(headers).forEach((key) => {
        out[key.toLowerCase()] = normalizeContentType(headers[key]);
    });

    return out;
};


const readResponseBody = function(
    response: http.IncomingMessage
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: unknown) => {
            if (Buffer.isBuffer(chunk)) {
                chunks.push(chunk);
                return;
            }

            if (typeof chunk === "string") {
                chunks.push(Buffer.from(chunk, "utf8"));
                return;
            }

            chunks.push(Buffer.from(chunk as Uint8Array));
        });
        response.on("end", () => {
            resolve(Buffer.concat(chunks));
        });
        response.on("error", reject);
    });
};


const requestUrl = function(
    rawUrl: string,
    options: ResourceRequestOptions = {},
    redirectCount = 0
): Promise<{
    ok: boolean;
    status: number;
    url: string;
    headers: Record<string, string>;
    body: Buffer;
}> {
    return new Promise((resolve, reject) => {
        let parsed: URL;

        try {
            parsed = new URL(rawUrl);
        }
        catch (error) {
            reject(error);
            return;
        }

        const transport = parsed.protocol === "https:"
            ? https
            : http;

        const request = transport.request(
            parsed,
            {
                method: "GET"
            },
            (response) => {
                const status = Number(response.statusCode || 0);
                const location = normalizeContentType(response.headers.location);
                const shouldFollowRedirect = options.redirect !== "manual"
                    && status >= 300
                    && status < 400
                    && Boolean(location);

                if (shouldFollowRedirect) {
                    if (redirectCount >= maxRedirects) {
                        response.resume();
                        reject(new Error("resource-too-many-redirects"));
                        return;
                    }

                    response.resume();
                    resolve(
                        requestUrl(
                            new URL(location, parsed).toString(),
                            options,
                            redirectCount + 1
                        )
                    );
                    return;
                }

                void readResponseBody(response).then((body) => {
                    resolve({
                        ok: status >= 200 && status < 300,
                        status,
                        url: parsed.toString(),
                        headers: normalizeHeaders(response.headers),
                        body
                    });
                }).catch(reject);
            }
        );

        request.on("error", reject);
        request.end();
    });
};


const createTextResult = function(
    response: Awaited<ReturnType<typeof requestUrl>>,
): ResourceTextResult {
    const contentType = String(response.headers["content-type"] || "").trim();

    return {
        ok: response.ok,
        status: response.status,
        url: response.url,
        contentType,
        text: response.body.toString("utf8")
    };
};


const createBufferResult = function(
    response: Awaited<ReturnType<typeof requestUrl>>,
): ResourceBufferResult {
    const contentType = String(response.headers["content-type"] || "").trim();

    return {
        ok: response.ok,
        status: response.status,
        url: response.url,
        contentType,
        body: new Uint8Array(response.body)
    };
};


export const createNodeResourceClient = function(): ResourceClient {
    return {
        loadText: async function(
            url: string,
            options?: ResourceRequestOptions
        ): Promise<ResourceTextResult> {
            return createTextResult(
                await requestUrl(url, options)
            );
        },
        loadBuffer: async function(
            url: string,
            options?: ResourceRequestOptions
        ): Promise<ResourceBufferResult> {
            return createBufferResult(
                await requestUrl(url, options)
            );
        }
    };
};
