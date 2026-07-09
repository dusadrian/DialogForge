export const encodeHelpDocumentHtml = function(html: unknown): string {
    return btoa(unescape(encodeURIComponent(String(html || ""))));
};
