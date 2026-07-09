import type {
    HelpTopicMatch,
    HelpTopicRequest,
    HelpTopicResult
} from "../provider-contract/runtimeProvider";


export const createHelpTopicRequest = function(input: Partial<HelpTopicRequest>): HelpTopicRequest {
    return {
        topic: String(input && input.topic ? input.topic : "").trim(),
        package: String(input && input.package ? input.package : "").trim(),
        allowSearch: input.allowSearch === true,
        source: String(input && input.source ? input.source : "base-app.help").trim()
    };
};


export const createHelpTopicResult = function(input: Partial<HelpTopicResult>): HelpTopicResult {
    const matches = Array.isArray(input.matches)
        ? input.matches.map((match: Partial<HelpTopicMatch>) => {
            return {
                topic: String(match && match.topic ? match.topic : ""),
                title: String(match && match.title ? match.title : ""),
                package: String(match && match.package ? match.package : ""),
                packagePath: String(match && match.packagePath ? match.packagePath : ""),
                library: String(match && match.library ? match.library : ""),
                path: String(match && match.path ? match.path : "")
            };
        })
        : [];

    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        topic: input.topic || "",
        kind: input.kind || "single",
        title: input.title || "",
        path: input.path || "",
        matches,
        body: input.body || "",
        message: input.message || "",
        resolvedAt: new Date().toISOString()
    };
};
