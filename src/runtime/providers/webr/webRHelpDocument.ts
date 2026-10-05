import {
    parseRHelpHttpdPath,
    parseRHelpTopicFromUrl
} from "../../help/rHelpDocument";
import {
    createRHelpPageReader,
    type RHelpPageResult
} from "../../help/rHelpPageReader";
import { fetchWebRHelpResource } from "./webRHelpResourceTransport";
import { fetchRHelpHomeDocument } from "../r/help/rHelpPresentation";


export interface WebRHelpDocument {
    html: string;
    topic: string;
    packageName: string;
    baseUrl: string;
}

export type WebRHelpPageFetchResult = RHelpPageResult;

export type CaptureWebRHiddenText = (command: string) => Promise<string>;


export const fetchWebRHelpHttpdPath = async function(
    pathname: unknown,
    captureHiddenText: CaptureWebRHiddenText
): Promise<string> {
    const path = String(pathname || "");
    const response = await fetchWebRHelpResource(path, path, captureHiddenText);
    if (!response.ok) {
        throw new Error(`help-resource-http-${response.status}`);
    }
    return new TextDecoder().decode(response.body);
};


export const fetchWebRHelpHomeDocument = async function(
    origin: string,
    captureHiddenText: CaptureWebRHiddenText,
    isCurrent?: () => boolean
): Promise<WebRHelpDocument> {
    return fetchRHelpHomeDocument(
        origin,
        createWebRHelpPageReader(origin, captureHiddenText, isCurrent)
    );
};


export const createWebRHelpPageReader = function(
    origin: string,
    captureHiddenText: CaptureWebRHiddenText,
    isCurrent?: () => boolean
) {
    const loadBuffer = function(url: string) {
        return fetchWebRHelpResource(parseRHelpHttpdPath(url, origin), url, captureHiddenText);
    };
    return createRHelpPageReader({
        isCurrent,
        invalidUrlError: "unsupported-help-url",
        invalidUrlStatus: 404,
        resolveUrl: function(raw): string {
            const requested = new URL(raw, origin);
            if (requested.origin !== new URL(origin).origin) {
                return "";
            }
            const target = parseRHelpTopicFromUrl(raw, origin);
            const pathname = target?.path || parseRHelpHttpdPath(raw, origin);
            return pathname ? `${origin}${pathname}${requested.search}` : "";
        },
        loadText: async function(url) {
            const response = await loadBuffer(url);
            const text = new TextDecoder().decode(response.body);
            return {
                ok: response.ok,
                status: response.status,
                url: response.url,
                text,
                contentType: response.contentType,
                headers: response.headers
            };
        },
        loadBuffer
    });
};


export const fetchWebRHelpPageByUrl = function(
    value: unknown,
    origin: string,
    captureHiddenText: CaptureWebRHiddenText,
    isCurrent?: () => boolean
): Promise<WebRHelpPageFetchResult> {
    return createWebRHelpPageReader(origin, captureHiddenText, isCurrent).fetchPage(value);
};
