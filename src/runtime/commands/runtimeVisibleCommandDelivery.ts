import type {
    RuntimeCommandExecutionResult,
    RuntimeSessionManager,
    TranscriptEvent,
    VisibleCommandRequest,
    WorkspaceSnapshot,
    WorkspaceUpdate
} from "../provider-contract/runtimeProvider";
import { captureWorkspaceRuntimeScope } from "../workspace/workspaceSnapshotDelivery";
import { workspaceUpdateHasChanges } from "../workspace/workspaceUpdate";


interface RuntimeVisibleCommandDeliveryBindings {
    runtime: RuntimeSessionManager;
    isCurrentRuntime?(): boolean;
    publishTranscript(events: TranscriptEvent[]): void;
    publishWorkspace(
        update: WorkspaceUpdate,
        snapshot: WorkspaceSnapshot
    ): Promise<boolean | void>;
    refreshWorkspaceAfterCommand?(): Promise<void>;
    refreshRuntimeEvents?(): Promise<void>;
    reportRuntimeEventError?(error: unknown): void;
}


export const createRuntimeVisibleCommandDelivery = function(
    bindings: RuntimeVisibleCommandDeliveryBindings
) {
    return async function(request: VisibleCommandRequest): Promise<{
        accepted: boolean;
        result: RuntimeCommandExecutionResult;
    }> {
        const isCurrent = captureWorkspaceRuntimeScope(() => {
            return bindings.isCurrentRuntime?.() === false ? null : bindings.runtime;
        });
        const result = await bindings.runtime.executeVisibleCommandWithEffects(request);

        if (!isCurrent() || result.executionDisposition === "session_lost") {
            return { accepted: false, result };
        }
        bindings.publishTranscript(result.transcriptEvents);
        if (!isCurrent()) {
            return { accepted: false, result };
        }

        if (result.executionDisposition === "not_started") {
            return { accepted: true, result };
        }

        if (result.workspaceUpdate && workspaceUpdateHasChanges(result.workspaceUpdate)) {
            const delivered = await bindings.publishWorkspace(
                result.workspaceUpdate,
                bindings.runtime.getWorkspaceSnapshot()
            );
            if (delivered === false) {
                return { accepted: false, result };
            }
        }
        if (!isCurrent()) {
            return { accepted: false, result };
        }

        if (bindings.refreshWorkspaceAfterCommand) {
            await bindings.refreshWorkspaceAfterCommand();
            if (!isCurrent()) {
                return { accepted: false, result };
            }
        }

        if (bindings.refreshRuntimeEvents) {
            try {
                await bindings.refreshRuntimeEvents();
            }
            catch (error) {
                if (!isCurrent()) {
                    return { accepted: false, result };
                }
                if (!bindings.reportRuntimeEventError) {
                    throw error;
                }
                bindings.reportRuntimeEventError(error);
            }
        }
        return { accepted: isCurrent(), result };
    };
};
