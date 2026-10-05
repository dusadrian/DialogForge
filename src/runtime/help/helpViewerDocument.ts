import { encodeHelpDocumentHtml } from "./helpDocumentEncoding";


export interface HelpViewerDocument {
    title: string;
    topic?: string;
    packageName?: string;
    html?: string;
    sourceUrl?: string;
    baseUrl?: string;
    resourceBaseUrl?: string;
}


export const createHelpViewerParameters = function(
    document: HelpViewerDocument
): URLSearchParams {
    const params = new URLSearchParams();

    params.set("title", document.title);
    if (document.topic) {
        params.set("topic", document.topic);
    }
    if (document.packageName) {
        params.set("package", document.packageName);
    }
    if (document.resourceBaseUrl) {
        params.set("resourceBase", document.resourceBaseUrl);
    }
    if (document.baseUrl) {
        params.set("base", document.baseUrl);
    }
    if (document.sourceUrl) {
        params.set("src", document.sourceUrl);
    }
    else {
        params.set("doc", encodeHelpDocumentHtml(document.html));
    }

    return params;
};


export const createHelpViewerOpenEntry = function(
    document: HelpViewerDocument
): Record<string, string> {
    return {
        id: "app-help-open",
        title: document.title,
        url: document.sourceUrl || "",
        html: document.html || "",
        baseUrl: document.baseUrl || "",
        base: document.baseUrl || "",
        topic: document.topic || "",
        packageName: document.packageName || "",
        resourceBaseUrl: document.resourceBaseUrl || ""
    };
};
