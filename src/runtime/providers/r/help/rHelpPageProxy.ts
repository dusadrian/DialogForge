import type {
    ResourceClient
} from "../../../../core/contracts/hostAdapter";


export interface RHelpPageProxyOptions {
    rewriteUrl(value: unknown): Promise<string>;
    resourceClient: ResourceClient;
}


export interface RHelpPageResult {
    ok: boolean;
    status?: number;
    url?: string;
    text?: string;
    contentType?: string;
    error?: string;
}


const isLocalHelpUrl = function(value: string): boolean {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();

    return (
        (parsed.protocol === "http:" || parsed.protocol === "https:")
        && (hostname === "127.0.0.1" || hostname === "localhost")
    );
};


export const createRHelpPageProxy = function(
    options: RHelpPageProxyOptions
) {
    return {
        fetchPage: async function(value: unknown): Promise<RHelpPageResult> {
            const raw = String(value || "").trim();

            if (!raw) {
                return {
                    ok: false,
                    error: "invalid-help-url"
                };
            }

            try {
                const rewritten = await options.rewriteUrl(raw);

                if (!isLocalHelpUrl(rewritten)) {
                    return {
                        ok: false,
                        error: "invalid-help-url"
                    };
                }

                const response = await options.resourceClient.loadText(rewritten, {
                    redirect: "follow"
                });

                return {
                    ok: response.ok,
                    status: response.status,
                    url: response.url || rewritten,
                    text: response.text,
                    contentType: response.contentType
                };
            } catch (error) {
                return {
                    ok: false,
                    error: error instanceof Error
                        ? error.message
                        : String(error)
                };
            }
        }
    };
};
