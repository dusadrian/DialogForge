import type {
    RuntimeSessionSnapshot,
    TranscriptEvent
} from "../../runtime/provider-contract/runtimeProvider";
import { normalizeConsoleCommandText } from "../commandText";
import {
    planConsoleInputExecution,
    type ConsoleFragmentState
} from "../terminal/consoleInputExecution";
import {
    readAcceptedRuntimeCommandResult,
    runtimeCommandResultSucceeded
} from "../../runtime/commands/runtimeCommandReceipt";


export interface ConsoleVisibleCommandControllerOptions {
    getSession(): RuntimeSessionSnapshot | null;
    startSession(): Promise<RuntimeSessionSnapshot>;
    renderStatus(snapshot: RuntimeSessionSnapshot): void;
    recordHistory(text: string): void;
    registerCompletionInput(text: string): void;
    setRuntimeBusy(busy: boolean): void;
    readOutputWidth?(): number | null;
    checkFragment?(code: string): Promise<ConsoleFragmentState>;
    executeCommand(request: {
        text: string;
        source: string;
        outputWidth?: number;
    }): Promise<unknown>;
}


export interface ConsoleVisibleCommandController {
    retire(): void;
    recordSubmittedCommand(text: string, source: string): void;
    executeWithReceipt(rawText: string, source: string): Promise<{
        accepted: boolean;
        result?: unknown;
    }>;
    executeText(
        rawText: string,
        source: string
    ): Promise<"ok" | void>;
}


export const createConsoleVisibleCommandController = function(
    options: ConsoleVisibleCommandControllerOptions
): ConsoleVisibleCommandController {
    let executionGeneration = 0;
    let activeCommand: { text: string; source: string } | null = null;

    const readOutputWidth = function(): number | undefined {
        try {
            const width = Number(options.readOutputWidth?.() || 0);

            if (Number.isFinite(width) && width > 0) {
                return Math.round(width);
            }
        }
        catch {
            // Width is a presentation hint, not a prerequisite for evaluation.
        }

        return undefined;
    };

    const executeWithReceipt = async function(
        rawText: string,
        source: string
    ): Promise<{ accepted: boolean; result?: unknown }> {
        const text = normalizeConsoleCommandText(rawText).trim();

        if (!text) {
            return { accepted: false };
        }

        const current = options.getSession();
        const generation = executionGeneration;
        const snapshot = current?.status === "ready"
            ? current
            : await options.startSession();

        if (generation !== executionGeneration) {
            return { accepted: false };
        }

        if (snapshot.status !== "ready") {
            options.renderStatus(snapshot);
            return { accepted: false };
        }

        options.recordHistory(text);
        options.registerCompletionInput(text);
        options.setRuntimeBusy(true);

        try {
            const outputWidth = readOutputWidth();
            const plan = options.checkFragment
                ? await planConsoleInputExecution(text, options.checkFragment)
                : null;
            const chunks = plan && !plan.incomplete ? plan.chunks : [text];
            const transcriptEvents: TranscriptEvent[] = [];
            let result: unknown;

            for (const chunk of chunks) {
                if (generation !== executionGeneration) {
                    return { accepted: false };
                }

                const request: {
                    text: string;
                    source: string;
                    outputWidth?: number;
                } = {
                    text: chunk,
                    source
                };

                if (outputWidth !== undefined) {
                    request.outputWidth = outputWidth;
                }

                options.setRuntimeBusy(true);
                activeCommand = request;
                result = await options.executeCommand(request);

                const receipt = readAcceptedRuntimeCommandResult(result, true);
                transcriptEvents.push(...(
                    Array.isArray(receipt) ? receipt : receipt?.transcriptEvents || []
                ));

                if (!runtimeCommandResultSucceeded(receipt)) {
                    break;
                }
            }

            if (chunks.length > 1) {
                const receipt = readAcceptedRuntimeCommandResult(result, true);
                result = Array.isArray(receipt)
                    ? transcriptEvents
                    : { ...receipt, transcriptEvents };
            }

            if (generation === executionGeneration) {
                return { accepted: true, result };
            }
            return { accepted: false };
        } finally {
            if (generation === executionGeneration) {
                activeCommand = null;
                options.setRuntimeBusy(false);
            }
        }
    };

    return {
        retire: function(): void {
            executionGeneration += 1;
            activeCommand = null;
        },
        recordSubmittedCommand: function(text, source): void {
            if (activeCommand?.text === text && activeCommand.source === source) {
                return;
            }

            options.recordHistory(text);
        },
        executeWithReceipt,
        executeText: async function(rawText, source): Promise<"ok" | void> {
            const receipt = await executeWithReceipt(rawText, source);
            if (receipt.accepted) {
                return "ok";
            }
        }
    };
};
