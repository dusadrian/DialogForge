import type {
    TranscriptEvent
} from "../runtime/provider-contract/runtimeProvider";
import type {
    ProductDialogCommandResult
} from "./dialogRuntimeIpc";


export const readProductDialogCommandText = function(value: unknown): string {
    const input = value && typeof value === "object"
        ? value as { command?: unknown; text?: unknown }
        : {};

    return String(input.command || input.text || "").trim();
};

export const createEmptyProductDialogCommandResult = function(
    command = ""
): ProductDialogCommandResult {
    return {
        ok: false,
        status: "error",
        printed: "",
        error: "Command is empty.",
        command
    };
};

export const createProductDialogCommandResultFromEvents = function(
    command: string,
    events: TranscriptEvent[]
): ProductDialogCommandResult {
    const errorEvent = events.find((event) => {
        return event.type === "error" || event.type === "rejected";
    });
    const printed = events.filter((event) => {
        return event.type === "output" && Boolean(event.message);
    }).map((event) => {
        return String(event.message);
    }).join("\n");

    return errorEvent
        ? {
            ok: false,
            status: "error",
            printed,
            error: String(errorEvent.message || "Dialog command failed."),
            command,
            events
        }
        : {
            ok: true,
            status: "ok",
            printed,
            error: "",
            command,
            events
        };
};

export const createProductDialogCommandResultFromStatus = function(
    command: string,
    result: { ok?: boolean } | null | undefined
): ProductDialogCommandResult {
    const ok = result?.ok !== false;

    return {
        ok,
        status: ok ? "executed" : "error",
        printed: "",
        error: "",
        command
    };
};
