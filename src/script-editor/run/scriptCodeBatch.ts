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
import type {
    ScriptCodeBatchResult
} from "../scriptEditorIpc";


export interface ScriptCodeBatchInput {
    chunks?: unknown[];
}

export interface ScriptCodeBatchRunnerOptions {
    source?: string;
    ensureRuntimeReady(): Promise<boolean>;
    executeVisibleCommand(request: VisibleCommandRequest): Promise<TranscriptEvent[]>;
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
        const nextEvents = await options.executeVisibleCommand(
            createVisibleCommandRequest({
                text: chunk,
                source
            })
        );

        events.push(...nextEvents);
        options.publishCommandBoundary?.(chunk);
    }

    return {
        status: "submitted",
        events
    };
};
