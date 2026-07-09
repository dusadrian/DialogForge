import type { DependencyCheckRequest, DependencyCheckResult } from "../provider-contract/runtimeProvider";


type DependencyCheckItem = DependencyCheckResult["items"][number];


const normalizeNames = function(names: string[] | undefined): string[] {
    return (names || []).map((name) => {
        return String(name || "").trim();
    }).filter((name) => {
        return name.length > 0;
    });
};


export const createDependencyCheckRequest = function(input: Partial<DependencyCheckRequest>): DependencyCheckRequest {
    return {
        kind: String(input && input.kind ? input.kind : "package"),
        names: normalizeNames(input && input.names),
        source: String(input && input.source ? input.source : "base-app.dependencies")
    };
};


export const createDependencyCheckItem = function(input: Partial<DependencyCheckItem>): DependencyCheckItem {
    return {
        name: input.name || "",
        status: input.status || "unknown",
        version: input.version || "",
        message: input.message || ""
    };
};


export const createDependencyCheckResult = function(input: Partial<DependencyCheckResult>): DependencyCheckResult {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        kind: input.kind || "package",
        items: input.items || [],
        message: input.message || "",
        checkedAt: new Date().toISOString()
    };
};
