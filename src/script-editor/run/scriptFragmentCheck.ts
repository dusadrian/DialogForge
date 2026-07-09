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
