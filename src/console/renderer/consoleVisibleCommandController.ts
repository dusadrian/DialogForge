import type {
    RuntimeSessionSnapshot,
    TranscriptEvent
} from "../../runtime/provider-contract/runtimeProvider";
import { normalizeConsoleCommandText } from "../commandText";
import {
    planConsoleInputExecution,
    readRuntimeConsoleInputPlan,
    type ConsoleFragmentState
} from "../terminal/consoleInputExecution";
import {
    readAcceptedRuntimeCommandResult,
    runtimeCommandResultSucceeded
} from "../../runtime/commands/runtimeCommandReceipt";


export interface ConsoleVisibleCommandControllerOptions {
    getSession(): RuntimeSessionSnapshot | null;
    isStartupPending?(): boolean;
    startSession(): Promise<RuntimeSessionSnapshot>;
    renderStatus(snapshot: RuntimeSessionSnapshot): void;
    recordHistory(text: string): void;
    registerCompletionInput(text: string): void;
    setRuntimeBusy(busy: boolean): void;
    readOutputWidth?(): number | null;
    planDuringExecution?(): boolean;
    checkFragment?(code: string): Promise<ConsoleFragmentState>;
    executeCommand(request: {
        text: string;
        source: string;
        outputWidth?: number;
        planInput?: "console";
    }): Promise<unknown>;
}


export interface ConsoleVisibleCommandController {
    retire(): void;
    recordActiveSubmission(text: string, source: string): boolean;
    recordSubmittedCommand(text: string, source: string): void;
    executeWithReceipt(rawText: string, source: string, editorSubmission?: boolean): Promise<{
        accepted: boolean;
        incomplete?: boolean;
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
    let activeCommand: {
        text: string;
        source: string;
        planInput?: "console";
        recordAcceptedLine?(): void;
    } | null = null;

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
        source: string,
        editorSubmission = false
    ): Promise<{ accepted: boolean; incomplete?: boolean; result?: unknown }> {
        const text = normalizeConsoleCommandText(rawText).trim();

        if (!text) {
            return { accepted: false };
        }

        const current = options.getSession();
        const generation = executionGeneration;
        const snapshot = current?.status === "ready" && !options.isStartupPending?.()
            ? current
            : await options.startSession();

        if (generation !== executionGeneration) {
            return { accepted: false };
        }

        if (snapshot.status !== "ready") {
            options.renderStatus(snapshot);
            return { accepted: false };
        }

        const planDuringExecution = options.planDuringExecution?.() && (editorSubmission || text.includes("\n"));
        let recorded = false;
        const recordInput = function(): void {
            if (recorded) {
                return;
            }
            recorded = true;
            options.recordHistory(text);
            options.registerCompletionInput(text);
        };
        if (!planDuringExecution) {
            recordInput();
        }
        options.setRuntimeBusy(true);

        try {
            const outputWidth = readOutputWidth();
            const execute = function(chunk: string, planInput?: "console"): Promise<unknown> {
                const request = {
                    text: chunk, source,
                    ...(outputWidth === undefined ? {} : { outputWidth }),
                    ...(planInput ? { planInput } : {})
                };
                // A live R input echo establishes acceptance even if the session
                // exits before the completion receipt reaches the editor.
                activeCommand = planInput && !text.includes("\n")
                    ? { ...request, recordAcceptedLine: recordInput }
                    : request;
                return options.executeCommand(request);
            };
            let chunks = [text];
            let result: unknown;
            if (planDuringExecution) {
                result = await execute(text, "console");
                if (generation !== executionGeneration) {
                    return { accepted: false };
                }
                const first = readAcceptedRuntimeCommandResult(result, true);
                if (!first || Array.isArray(first) || !first.inputPlan) {
                    return { accepted: false, result };
                }
                const parsed = readRuntimeConsoleInputPlan(text, first.inputPlan);
                if (parsed.state === "incomplete") {
                    return { accepted: false, incomplete: true };
                }
                chunks = parsed.plan.chunks;
                recordInput();
            }
            else if (options.checkFragment) {
                const plan = await planConsoleInputExecution(text, options.checkFragment);
                chunks = plan.incomplete ? [text] : plan.chunks;
            }

            const transcriptEvents: TranscriptEvent[] = [];
            for (const [index, chunk] of chunks.entries()) {
                if (generation !== executionGeneration) {
                    return { accepted: false };
                }
                if (index > 0) {
                    options.setRuntimeBusy(true);
                }
                if (index > 0 || !planDuringExecution) {
                    result = await execute(chunk);
                }
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

    const recordActiveSubmission = function(text: string, source: string): boolean {
        if (activeCommand?.source !== source || (activeCommand.text !== text && !activeCommand.planInput)) {
            return false;
        }
        if (activeCommand.text === text) {
            activeCommand.recordAcceptedLine?.();
        }
        return true;
    };

    return {
        retire: function(): void {
            executionGeneration += 1;
            activeCommand = null;
        },
        recordActiveSubmission,
        recordSubmittedCommand: function(text: string, source: string): void {
            if (!recordActiveSubmission(text, source)) {
                options.recordHistory(text);
            }
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
