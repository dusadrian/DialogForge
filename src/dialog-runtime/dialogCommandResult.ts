import {
    isTranscriptFailureEvent
} from "../runtime/commands/commandProtocol";
import type { RuntimeCommandResult } from "../runtime/commands/runtimeCommandReceipt";
import { runtimeCommandResultSucceeded } from "../runtime/commands/runtimeCommandReceipt";
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

export const createProductDialogCommandResultFromRuntime = function(
    command: string,
    result: RuntimeCommandResult
): ProductDialogCommandResult {
    const receipt = Array.isArray(result)
        ? { ok: true, transcriptEvents: result }
        : result;
    const events = receipt?.transcriptEvents || [];
    const errorEvent = events.find(isTranscriptFailureEvent);
    const printed = events.filter((event) => {
        return event.type === "output" && Boolean(event.message);
    }).map((event) => {
        return String(event.message);
    }).join("\n");

    const ok = runtimeCommandResultSucceeded(result);

    return {
        ok,
        status: ok ? "ok" : "error",
        printed,
        error: ok ? "" : String(errorEvent?.message || "Dialog command failed."),
        command,
        events
    };
};
