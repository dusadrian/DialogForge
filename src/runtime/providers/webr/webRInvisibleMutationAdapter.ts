interface WebRInvisibleMutationRuntime {
    evalRVoid(command: string): Promise<void>;
}


export interface WebRInvisibleMutationResult {
    ok: boolean;
    message: string;
}


const mutationText = function(input: unknown): string {
    if (!input || typeof input !== "object") {
        return "";
    }

    return String((input as { text?: unknown }).text || "").trim();
};


export const executeWebRInvisibleMutation = async function(
    runtime: WebRInvisibleMutationRuntime,
    input: unknown
): Promise<WebRInvisibleMutationResult> {
    const text = mutationText(input);

    if (!text) {
        return {
            ok: false,
            message: "No plot mutation command was provided."
        };
    }

    await runtime.evalRVoid(text);

    return {
        ok: true,
        message: "Plot mutation executed."
    };
};
