import {
    createRConsoleCompletionReader,
    type RConsoleCompletionEntry
} from "../r/completions/rConsoleRuntimeCompletion";
import type {
    RuntimeSessionManager
} from "../../provider-contract/runtimeProvider";
import {
    type WebRCompletionRequest,
    type WebRCompletionResult
} from "./webRCompletionAdapter";


export type WebRConsoleCompletionEntry = RConsoleCompletionEntry;

export interface WebRConsoleCompletionBindings {
    runtimeSessionManager: RuntimeSessionManager | null | undefined;
    getRuntimeSessionManager?(): RuntimeSessionManager | null | undefined;
    isRuntimeBusy(): boolean;
    workspaceEntries(): WebRConsoleCompletionEntry[];
}


export const readWebRConsoleCompletionResult = function(
    params: WebRCompletionRequest & { code?: unknown },
    bindings: WebRConsoleCompletionBindings,
    timeoutMs?: number
): Promise<WebRCompletionResult> {
    const getRuntime = function() {
        return bindings.getRuntimeSessionManager
            ? bindings.getRuntimeSessionManager()
            : bindings.runtimeSessionManager;
    };

    return createRConsoleCompletionReader({
        source: "browser.webr.console",
        readSession: function() {
            const runtime = getRuntime();
            return runtime ? {
                owner: runtime,
                snapshot: runtime.getSnapshot()
            } : null;
        },
        isRuntimeBusy: () => bindings.isRuntimeBusy(),
        readCompletions: (request) => getRuntime()!.readCompletions(request),
        workspaceEntries: bindings.workspaceEntries
    })(params, timeoutMs);
};
