import type {
    RuntimeExtensionMethodRequest,
    RuntimeExtensionMethodResult
} from "../provider-contract/runtimeProvider";


export const createRuntimeExtensionMethodRequest = function(
    input: Partial<RuntimeExtensionMethodRequest>
): RuntimeExtensionMethodRequest {
    return {
        method: String(input && input.method ? input.method : ""),
        params: input && input.params && typeof input.params === "object" && !Array.isArray(input.params)
            ? input.params
            : {},
        source: String(input && input.source ? input.source : "base-app.extension")
    };
};


export const createRuntimeExtensionMethodResult = function(
    input: Partial<RuntimeExtensionMethodResult>
): RuntimeExtensionMethodResult {
    return {
        status: input.status || "unknown",
        providerId: input.providerId || "",
        method: input.method || "",
        value: input.value === undefined ? null : input.value,
        message: input.message || "",
        executedAt: new Date().toISOString()
    };
};


export const createWorkspaceFileLoadRequest = function(
    filePath: string,
    source = "base-app.workspace-file"
): RuntimeExtensionMethodRequest {
    return createRuntimeExtensionMethodRequest({
        method: "runtime.load_workspace_file",
        params: {
            path: String(filePath || "")
        },
        source
    });
};


export const createWorkspaceFileSaveRequest = function(
    filePath: string,
    source = "base-app.workspace-file"
): RuntimeExtensionMethodRequest {
    return createRuntimeExtensionMethodRequest({
        method: "runtime.save_workspace_file",
        params: {
            path: String(filePath || "")
        },
        source
    });
};


export const createWorkspaceFingerprintRequest = function(
    source = "base-app.workspace"
): RuntimeExtensionMethodRequest {
    return createRuntimeExtensionMethodRequest({
        method: "runtime.workspace_fingerprint",
        source
    });
};
