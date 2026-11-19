import type {
    ScriptFragmentCheckResult
} from "../scriptEditorIpc";
import type {
    ScriptFragmentState
} from "./scriptStatement";


export const normalizeScriptFragmentState = function(value: unknown): ScriptFragmentState {
    const objectValue = value && typeof value === "object"
        ? value as { state?: unknown }
        : {};
    const state = String(objectValue.state || value || "").toLowerCase();

    if (
        state === "complete" ||
        state === "incomplete" ||
        state === "invalid"
    ) {
        return state;
    }

    return "unknown";
};

export const createScriptFragmentCheckResult = function(
    input: {
        ok?: boolean;
        state?: unknown;
        message?: string;
    }
): ScriptFragmentCheckResult {
    return {
        ok: input.ok !== false,
        state: normalizeScriptFragmentState(input.state),
        message: input.message
    };
};


export const planScriptSelection = async function(
    code: string,
    ensureRuntimeReady: () => Promise<boolean>,
    execute: (request: { method: string; params: { code: string }; source: string }) =>
        Promise<{ status?: string; value?: unknown; message?: string }>
): Promise<ScriptFragmentCheckResult> {
    if (!await ensureRuntimeReady()) {
        throw new Error("Runtime session is not ready.");
    }
    const response = await execute({
        method: "plan_console_input",
        params: { code },
        source: "base-app.script-editor"
    });
    if (response.status !== "ready") {
        throw new Error(response.message || "Runtime could not plan script selection.");
    }
    const value = response.value as Partial<ScriptFragmentCheckResult> | null;
    if (!Array.isArray(value?.ends)) {
        throw new Error("Runtime returned an invalid script selection plan.");
    }
    return { ok: true, ends: value.ends, state: normalizeScriptFragmentState(value) };
};
