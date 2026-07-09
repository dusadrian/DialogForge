export interface RHelpTopicUrl {
    packageName: string;
    topic: string;
    isIndex: boolean;
    isExample: boolean;
    path: string;
}


const escapeHelpHtml = function(value: unknown): string {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
};


const parseUrl = function(value: unknown, origin: string): URL | null {
    try {
        return new URL(String(value || ""), origin);
    }
    catch {
        return null;
    }
};


export const createRHelpFallbackHtml = function(
    topic: unknown,
    message: unknown
): string {
    return [
        "<main class=\"container\">",
        `<h1>${escapeHelpHtml(topic || "R Help")}</h1>`,
        `<p>${escapeHelpHtml(message || "No help page was found for this topic.")}</p>`,
        "</main>"
    ].join("");
};


export const parseRHelpTopicFromUrl = function(
    value: unknown,
    origin: string
): RHelpTopicUrl | null {
    const parsed = parseUrl(value, origin);

    if (!parsed) {
        return null;
    }

    const match = parsed.pathname.match(
        /\/library\/([^/]+)\/(?:html\/([^/?#]+)|Example\/([^/?#]+))$/
    );

    if (!match) {
        return null;
    }

    const packageName = decodeURIComponent(String(match[1] || ""));
    const topic = decodeURIComponent(String(match[2] || match[3] || ""))
        .replace(/\.html$/i, "");
    const isExample = Boolean(match[3]);

    if (!packageName || !topic) {
        return null;
    }

    return {
        packageName,
        topic,
        isIndex: !isExample && /^00Index$/i.test(topic),
        isExample,
        path: parsed.pathname
    };
};


export const parseRHelpHttpdPath = function(
    value: unknown,
    origin: string
): string {
    const parsed = parseUrl(value, origin);
    const pathname = parsed?.pathname || "";

    if (
        pathname.startsWith("/library/")
        || pathname.startsWith("/doc/html/")
    ) {
        return pathname;
    }

    return "";
};


export const readRHelpHttpdContentType = function(pathname: unknown): string {
    const path = String(pathname || "").toLowerCase();

    if (path.endsWith(".css")) {
        return "text/css; charset=utf-8";
    }

    if (path.endsWith(".js")) {
        return "text/javascript; charset=utf-8";
    }

    return "text/html; charset=utf-8";
};
