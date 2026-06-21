import type {
    RuntimeExtensionController,
    RuntimeExtensionMethodRequest,
    RuntimeExtensionMethodResult,
    RuntimeSessionSnapshot
} from "../provider-contract/runtimeProvider";
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
            return providerController.executeRuntimeMethod(request, snapshot);
        }

        return createRuntimeExtensionMethodResult({
            status: "unsupported",
            providerId: snapshot.providerId,
            method: request.method,
            message: "Selected provider does not expose runtime extension methods."
        });
    };

    return {
        execute
    };
};
