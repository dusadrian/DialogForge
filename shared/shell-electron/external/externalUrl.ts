export type ExternalUrlOpenStatus = "ready" | "invalid";


export interface ExternalUrlOpenRequest {
    status: ExternalUrlOpenStatus;
    url: string;
    message: string;
}


const allowedProtocols = new Set(["http:", "https:"]);


export const createExternalUrlOpenRequest = function(input: unknown): ExternalUrlOpenRequest {
    const rawUrl = String(input || "").trim();

    if (!rawUrl) {
        return {
            status: "invalid",
            url: "",
            message: "No viewer URL was provided."
        };
    }

    let parsed: URL;

    try {
        parsed = new URL(rawUrl);
    }
    catch {
        return {
            status: "invalid",
            url: rawUrl,
            message: "The viewer URL is not valid."
        };
    }

    if (!allowedProtocols.has(parsed.protocol)) {
        return {
            status: "invalid",
            url: rawUrl,
            message: "Only http and https viewer URLs can be opened."
        };
    }

    return {
        status: "ready",
        url: parsed.toString(),
        message: "Viewer URL is ready."
    };
};


export const externalUrlApi = {
    createExternalUrlOpenRequest
};
