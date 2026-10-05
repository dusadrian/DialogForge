import type {
    RuntimeSessionSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import { normalizeConsoleCommandText } from "../commandText";


export interface ConsoleVisibleCommandControllerOptions {
    getSession(): RuntimeSessionSnapshot | null;
    startSession(): Promise<RuntimeSessionSnapshot>;
    renderStatus(snapshot: RuntimeSessionSnapshot): void;
    recordHistory(text: string): void;
    registerCompletionInput(text: string): void;
    setRuntimeBusy(busy: boolean): void;
    readOutputWidth?(): number | null;
    executeCommand(request: {
        text: string;
        source: string;
        outputWidth?: number;
    }): Promise<unknown>;
}


export interface ConsoleVisibleCommandController {
    retire(): void;
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
            const request: {
                text: string;
                source: string;
                outputWidth?: number;
            } = {
                text,
                source
            };

            if (outputWidth !== undefined) {
                request.outputWidth = outputWidth;
            }

            const result = await options.executeCommand(request);

            if (generation === executionGeneration) {
                return { accepted: true, result };
            }
            return { accepted: false };
        } finally {
            if (generation === executionGeneration) {
                options.setRuntimeBusy(false);
            }
        }
    };

    return {
        retire: function(): void {
            executionGeneration += 1;
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
