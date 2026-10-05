import {
    normalizeConsoleCommandText
} from "../../console/commandText";
import {
    createVisibleCommandRequest
} from "../../runtime/commands/commandProtocol";
import type {
    TranscriptEvent,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
import type { RuntimeCommandResult } from "../../runtime/commands/runtimeCommandReceipt";
import type {
    ScriptCodeBatchResult
} from "../scriptEditorIpc";


export interface ScriptCodeBatchInput {
    chunks?: unknown[];
}

export interface ScriptCodeBatchRunnerOptions {
    source?: string;
    ensureRuntimeReady(): Promise<boolean>;
    executeVisibleCommand(request: VisibleCommandRequest): Promise<RuntimeCommandResult>;
    publishCommandBoundary?(code: string): void;
}

export const readScriptCodeBatchInput = function(value: unknown): ScriptCodeBatchInput {
    return value && typeof value === "object"
        ? value as ScriptCodeBatchInput
        : {};
};

export const normalizeScriptCodeBatchChunks = function(
    input: ScriptCodeBatchInput
): string[] {
    return Array.isArray(input.chunks)
        ? input.chunks.map((chunk) => {
            return normalizeConsoleCommandText(chunk).trim();
        }).filter((chunk) => {
            return chunk.length > 0;
        })
        : [];
};

export const runScriptCodeBatch = async function(
    input: ScriptCodeBatchInput,
    options: ScriptCodeBatchRunnerOptions
): Promise<ScriptCodeBatchResult> {
    const chunks = normalizeScriptCodeBatchChunks(input);

    if (chunks.length === 0) {
        return {
            status: "empty",
            events: []
        };
    }

    const ready = await options.ensureRuntimeReady();

    if (!ready) {
        return {
            status: "unavailable",
            events: []
        };
    }

    const events: TranscriptEvent[] = [];
    const source = options.source || "base-app.script-editor";

    for (const chunk of chunks) {
        const result = await options.executeVisibleCommand(
            createVisibleCommandRequest({
                text: chunk,
                source
            })
        );

        const nextEvents = Array.isArray(result) ? result : result?.transcriptEvents || [];
        events.push(...nextEvents);

        if (!Array.isArray(result) && (
            !result
            || result.executionDisposition === "session_lost"
            || result.executionDisposition === "not_started"
            || (result.ok === false && !result.executionDisposition && !result.evaluationOutcome)
        )) {
            return { status: "unavailable", events };
        }
        options.publishCommandBoundary?.(chunk);
        if (!Array.isArray(result) && result.evaluationOutcome === "interrupted") {
            return { status: "interrupted", events };
        }
    }

    return {
        status: "submitted",
        events
    };
};
