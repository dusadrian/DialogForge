export interface WebRAssetBaseInput {
    explicitBaseUrl?: string;
    requireResolve?: (id: string) => string;
}


export interface WebRAssetBaseResolution {
    baseUrl: string;
    source: "explicit" | "node-package" | "unresolved";
    message: string;
}


const ensureTrailingSlash = function(value: string): string {
    return value.endsWith("/") ? value : `${value}/`;
};


const stripFileName = function(value: string): string {
    const normalized = value.replace(/\\/g, "/");
    const index = normalized.lastIndexOf("/");

    return index >= 0 ? normalized.slice(0, index + 1) : "";
};


const readRequireResolve = function(
    input: WebRAssetBaseInput
): ((id: string) => string) | null {
    if (input.requireResolve) {
        return input.requireResolve;
    }

    if (typeof require === "function" && typeof require.resolve === "function") {
        return require.resolve.bind(require);
    }

    return null;
};


const resolvePackageBaseUrl = function(
    resolveId: (id: string) => string
): string {
    const entry = resolveId("webr");
    const base = stripFileName(entry);

    return ensureTrailingSlash(base);
};


export const resolveWebRAssetBase = function(
    input: WebRAssetBaseInput = {}
): WebRAssetBaseResolution {
    const explicitBaseUrl = String(input.explicitBaseUrl || "").trim();

    if (explicitBaseUrl) {
        return {
            baseUrl: ensureTrailingSlash(explicitBaseUrl),
            source: "explicit",
            message: "Using host-provided WebR asset base URL."
        };
    }

    const resolveId = readRequireResolve(input);

    if (resolveId) {
        try {
            return {
                baseUrl: resolvePackageBaseUrl(resolveId),
                source: "node-package",
                message: "Using WebR assets from the installed package."
            };
        }
        catch {
            return {
                baseUrl: "",
                source: "unresolved",
                message: "WebR package assets could not be resolved."
            };
        }
    }

    return {
        baseUrl: "",
        source: "unresolved",
        message: "WebR asset base URL must be supplied by the browser host."
    };
};
