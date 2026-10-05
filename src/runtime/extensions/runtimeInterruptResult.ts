import type {
    RuntimeExtensionMethodResult,
    RuntimeSessionSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createRuntimeExtensionMethodResult
} from "./runtimeExtensionProtocol";


export const createRuntimeInterruptResult = function(
    snapshot: RuntimeSessionSnapshot,
    accepted: boolean | null,
    message?: string
): RuntimeExtensionMethodResult {
    return createRuntimeExtensionMethodResult({
        status: accepted === null ? "unavailable" : (accepted ? "ready" : "failed"),
        providerId: snapshot.providerId,
        method: "runtime.interrupt",
        value: accepted,
        message: message || (accepted === null
            ? "Runtime interrupt is not available."
            : (accepted
                ? "Runtime accepted the interrupt request."
                : "Runtime did not accept the interrupt request."))
    });
};
