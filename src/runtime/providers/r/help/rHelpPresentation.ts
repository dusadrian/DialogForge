import type {
    HelpTopicRequest,
    HelpTopicResult
} from "../../../provider-contract/runtimeProvider";
import { buildHelpChooserDocument } from "../../../help/helpChooserDocument";
import { createHelpTopicResult } from "../../../help/helpProtocol";
import { createRHelpFallbackHtml } from "../../../help/rHelpDocument";
import type { RHelpPageResult } from "../../../help/rHelpPageReader";


export const rHelpTitle = "R Help";


export const createRHelpHomeTopicResult = function(): HelpTopicResult {
    return createHelpTopicResult({
        status: "ready",
        kind: "home",
        title: rHelpTitle,
        topic: rHelpTitle,
        path: "/doc/html/index.html"
    });
};


export const fetchRHelpHomeDocument = async function(
    origin: string,
    reader: { fetchPage(path: string): Promise<RHelpPageResult> }
) {
    const home = createRHelpHomeTopicResult();
    const response = await reader.fetchPage(home.path);
    if (!response.ok) {
        throw new Error(response.error || `help-resource-http-${response.status}`);
    }

    return {
        html: String(response.text || "")
            || createRHelpFallbackHtml(rHelpTitle, "The R help home page is unavailable."),
        topic: home.topic,
        packageName: "",
        baseUrl: response.url || `${origin}${home.path}`
    };
};


export const createRHelpTopicTitle = function(
    topic: unknown,
    separator = ": "
): string {
    const cleanTopic = String(topic || "").trim();

    return cleanTopic && cleanTopic !== rHelpTitle
        ? `${rHelpTitle}${separator}${cleanTopic}`
        : rHelpTitle;
};


export const createRHelpTopicPresentation = function(
    result: HelpTopicResult,
    request: Partial<HelpTopicRequest>,
    toHelpUrl: (path: string) => string = (path) => path
) {
    const ready = result.status === "ready";
    const path = ready ? String(result.path || "") : "";
    const body = ready ? String(result.body || "") : "";
    const matches = ready && Array.isArray(result.matches) ? result.matches : [];
    const pathMatch = path.match(/\/library\/([^/]+)\/html\/([^/]+)\.html$/);
    const topic = String(result.topic || request.topic || "").trim();
    const title = String(result.title || topic || rHelpTitle);
    const packageName = String(
        request.package || pathMatch?.[1] || matches[0]?.package || ""
    ).trim();

    return {
        available: Boolean(ready && (body || path || matches.length)),
        needsResources: Boolean(path || matches.length),
        title,
        topic,
        packageName,
        path,
        sourceUrl: path ? toHelpUrl(path) : "",
        html: body || (matches.length ? buildHelpChooserDocument(result, toHelpUrl) : "")
    };
};
