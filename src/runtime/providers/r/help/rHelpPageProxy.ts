import type {
    ResourceClient
} from "../../../../core/contracts/hostAdapter";
import {
    createRHelpPageReader
} from "../../../help/rHelpPageReader";
import { rHelpResourceMaxBytes } from "../../../help/rHelpResourceProtocol";
export type { RHelpPageResult } from "../../../help/rHelpPageReader";


export interface RHelpPageProxyOptions {
    rewriteUrl(value: unknown): Promise<string>;
    resourceClient: ResourceClient;
    isCurrent?(): boolean;
    captureOwner?(): () => boolean;
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
    return createRHelpPageReader({
        isCurrent: options.isCurrent,
        captureOwner: options.captureOwner,
        resolveUrl: async function(raw): Promise<string> {
            const rewritten = await options.rewriteUrl(raw);
            return isLocalHelpUrl(rewritten) ? rewritten : "";
        },
        loadText: function(url) {
            return options.resourceClient.loadText(url, {
                redirect: "manual", maxBodyBytes: rHelpResourceMaxBytes
            });
        },
        loadBuffer: function(url) {
            return options.resourceClient.loadBuffer(url, {
                redirect: "manual", maxBodyBytes: rHelpResourceMaxBytes
            });
        }
    });
};
