import {
    createRuntimeExtensionMethodResult
} from "../../extensions/runtimeExtensionProtocol";
import type {
    RuntimeExtensionController,
    RuntimeSessionSnapshot
} from "../../provider-contract/runtimeProvider";
import {
    createBrowserWebRSessionSnapshot
} from "./webRBrowserStartup";
import {
    type WebRPromptCoordinator,
    sendWebRPromptReply,
    type WebRPromptRuntime
} from "./webRPromptBridge";


export interface WebRRuntimeMethodRouterBindings {
    checkCodeFragmentComplete(code: string): Promise<string>;
    isRuntimeBusy?(): boolean;
    setRuntimeStatus(message: string): void;
    setRuntimeBusy(busy: boolean): void;
    renderToolbar(): void;
    getRuntime(): WebRPromptRuntime | null | undefined;
    getPromptCoordinator?(): WebRPromptCoordinator | null | undefined;
}

const isRuntimeBusyMethodAllowed = function(method: string): boolean {
    return method === "runtime.interrupt"
        || method === "check_completeness"
        || method === "reply_prompt";
};

const executeWebRRuntimeMethodDirect = async function(
    method: string,
    params: Record<string, unknown>,
    bindings: WebRRuntimeMethodRouterBindings
): Promise<unknown> {
    if (method === "runtime.interrupt") {
        bindings.setRuntimeStatus("WebR interrupt is not available in this browser runtime.");
        bindings.setRuntimeBusy(false);
        bindings.renderToolbar();

        return {
            ok: false,
            message: "WebR interrupt is not available in this browser shell yet."
        };
    }

    if (method === "check_completeness") {
        return {
            state: await bindings.checkCodeFragmentComplete(String(params.code || ""))
        };
    }

    if (method === "reply_prompt") {
        const promptInput = {
            method,
            params
        };
        const result = bindings.getPromptCoordinator
            ? await bindings.getPromptCoordinator()?.answerPrompt(promptInput)
            : sendWebRPromptReply(bindings.getRuntime(), promptInput);

        return {
            ok: result?.ok === true,
            promptId: result?.promptId || "",
            reply: result?.reply,
            message: result?.message || "Prompt reply was not handled."
        };
    }

    return {};
};


export const createBrowserWebRRuntimeExtensionController = function(
    bindings: WebRRuntimeMethodRouterBindings
): RuntimeExtensionController {
    const snapshot: RuntimeSessionSnapshot = createBrowserWebRSessionSnapshot(
        "ready",
        "Browser WebR runtime is ready for extension methods.",
        "connected"
    );

    return {
        executeRuntimeMethod: async function(request) {
            if (
                bindings.isRuntimeBusy?.() === true
                && !isRuntimeBusyMethodAllowed(request.method)
            ) {
                return createRuntimeExtensionMethodResult({
                    status: "busy",
                    providerId: snapshot.providerId,
                    method: request.method,
                    value: null,
                    message: "WebR is busy running a visible command."
                });
            }

            return createRuntimeExtensionMethodResult({
                status: "ready",
                providerId: snapshot.providerId,
                method: request.method,
                value: await executeWebRRuntimeMethodDirect(
                    request.method,
                    request.params,
                    bindings
                ),
                message: "WebR runtime method handled through the shared session manager."
            });
        }
    };
};
