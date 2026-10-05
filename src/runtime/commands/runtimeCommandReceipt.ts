import type {
    RuntimeCommandExecutionResult,
    TranscriptEvent
} from "../provider-contract/runtimeProvider";
import { commandExecutionDidNotSucceed, isTranscriptFailureEvent } from "./commandProtocol";


export interface RuntimeCommandReceipt {
    ok?: boolean;
    transcriptEvents?: TranscriptEvent[];
    executionDisposition?: RuntimeCommandExecutionResult["executionDisposition"];
    evaluationOutcome?: RuntimeCommandExecutionResult["evaluationOutcome"];
}

export type RuntimeCommandResult = TranscriptEvent[] | RuntimeCommandReceipt | null | undefined;


export const createRuntimeCommandReceipt = function(
    result: RuntimeCommandExecutionResult,
    accepted = true
): RuntimeCommandReceipt {
    return {
        ok: accepted && !commandExecutionDidNotSucceed(result),
        transcriptEvents: accepted ? result.transcriptEvents : [],
        executionDisposition: result.executionDisposition,
        evaluationOutcome: result.evaluationOutcome
    };
};


export const readAcceptedRuntimeCommandResult = function(
    result: unknown,
    accepted: boolean
): RuntimeCommandResult {
    if (!accepted) {
        return { ok: false };
    }
    if (Array.isArray(result)) {
        return result;
    }
    if (
        result && typeof result === "object"
        && typeof (result as RuntimeCommandReceipt).ok === "boolean"
    ) {
        return result as RuntimeCommandReceipt;
    }
    return { ok: false };
};


export const runtimeCommandResultSucceeded = function(result: RuntimeCommandResult): boolean {
    const events = Array.isArray(result) ? result : result?.transcriptEvents || [];

    if (!Array.isArray(result) && result?.ok !== true) {
        return false;
    }
    return !commandExecutionDidNotSucceed({
        executionDisposition: Array.isArray(result) ? undefined : result?.executionDisposition,
        evaluationOutcome: Array.isArray(result) ? undefined : result?.evaluationOutcome,
        transcriptEvents: events
    });
};


export const requireSuccessfulRuntimeCommand = function(
    result: RuntimeCommandResult,
    failureMessage: string
): void {
    const events = Array.isArray(result) ? result : result?.transcriptEvents || [];
    const failure = events.find(isTranscriptFailureEvent);

    if (!runtimeCommandResultSucceeded(result)) {
        throw new Error(String(failure?.message || failureMessage));
    }
};
