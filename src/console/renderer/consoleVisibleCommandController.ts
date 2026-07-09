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
    executeText(
        rawText: string,
        source: string
    ): Promise<"ok" | void>;
}


export const createConsoleVisibleCommandController = function(
    options: ConsoleVisibleCommandControllerOptions
): ConsoleVisibleCommandController {
    const executeText = async function(
        rawText: string,
        source: string
    ): Promise<"ok" | void> {
        const text = normalizeConsoleCommandText(rawText).trim();

        if (!text) {
            return;
        }

        const current = options.getSession();
        const snapshot = current?.status === "ready"
            ? current
            : await options.startSession();

        if (snapshot.status !== "ready") {
            options.renderStatus(snapshot);
            return;
        }

        options.recordHistory(text);
        options.registerCompletionInput(text);
        options.setRuntimeBusy(true);

        try {
            const outputWidth = Number(options.readOutputWidth?.() || 0);
            const request: {
                text: string;
                source: string;
                outputWidth?: number;
            } = {
                text,
                source
            };

            if (Number.isFinite(outputWidth) && outputWidth > 0) {
                request.outputWidth = Math.round(outputWidth);
            }

            await options.executeCommand(request);

            return "ok";
        } finally {
            options.setRuntimeBusy(false);
        }
    };

    return {
        executeText
    };
};
