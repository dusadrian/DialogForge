import type {
    RuntimeExtensionController,
    RuntimeExtensionMethodRequest,
    RuntimeExtensionMethodResult,
    RuntimeSessionSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createUnsupportedOperationResult
} from "../../core/contracts/operationResult";
import {
    createRuntimeExtensionMethodResult
} from "./runtimeExtensionProtocol";


export interface RuntimeExtensionExecutionController {
    execute(
        request: RuntimeExtensionMethodRequest,
        snapshot: RuntimeSessionSnapshot
    ): Promise<RuntimeExtensionMethodResult>;
}


export const createRuntimeExtensionExecutionController = function(
    providerController?: RuntimeExtensionController
): RuntimeExtensionExecutionController {
    const execute = async function(
        request: RuntimeExtensionMethodRequest,
        snapshot: RuntimeSessionSnapshot
    ): Promise<RuntimeExtensionMethodResult> {
        if (snapshot.status !== "ready") {
            return createRuntimeExtensionMethodResult({
                status: "unavailable",
                providerId: snapshot.providerId,
                method: request.method,
                message: "Runtime session is not ready."
            });
        }

        if (!request.method) {
            return createRuntimeExtensionMethodResult({
                status: "invalid",
                providerId: snapshot.providerId,
                method: request.method,
                message: "Runtime method name is required."
            });
        }

        if (providerController?.executeRuntimeMethod) {
            const result = await providerController.executeRuntimeMethod(request, snapshot);
            if (
                request.method === "reply_prompt"
                && result.status === "ready"
                && result.value
                && typeof result.value === "object"
                && (result.value as { ok?: unknown }).ok === false
            ) {
                return {
                    ...result,
                    status: "failed"
                };
            }
            return result;
        }

        return createRuntimeExtensionMethodResult(createUnsupportedOperationResult({
            providerId: snapshot.providerId,
            method: request.method,
            message: "Selected provider does not expose runtime extension methods."
        }));
    };

    return {
        execute
    };
};
