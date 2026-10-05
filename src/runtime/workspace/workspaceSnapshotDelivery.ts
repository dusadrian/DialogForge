import type {
    ActiveDatasetSnapshot,
    RuntimeSessionManager,
    WorkspaceSnapshot
} from "../provider-contract/runtimeProvider";
import { isWorkspaceDatasetCandidate } from "./workspaceDatasetSelection";
import { captureRuntimeSessionScope } from "../session/runtimeSessionScope";


type WorkspaceDeliveryRuntime = Pick<
    RuntimeSessionManager, "getSnapshot" | "getWorkspaceSnapshot"
>;

export interface WorkspaceSnapshotDeliveryBindings {
    getRuntime(): WorkspaceDeliveryRuntime | null | undefined;
    publishWorkspace(snapshot: WorkspaceSnapshot): void;
    publishDatasetNames(datasetNames: string[]): void;
    getActiveDataset?(): ActiveDatasetSnapshot | undefined;
    warmDatasetFirstScreens?(objectName: string): void;
}


export interface WorkspaceSnapshotDeliveryOptions {
    warmActiveDataset?: boolean;
    metadataRefreshes?: Promise<PromiseSettledResult<unknown>[]>;
    reportMetadataError?(error: unknown): void;
    refreshDialogs?(
        snapshot: WorkspaceSnapshot,
        isCurrent: () => boolean
    ): Promise<void>;
}


export const captureWorkspaceRuntimeScope = function(
    getRuntime: WorkspaceSnapshotDeliveryBindings["getRuntime"]
): (snapshot?: WorkspaceSnapshot) => boolean {
    const runtime = getRuntime();
    const sessionIsCurrent = captureRuntimeSessionScope(() => runtime?.getSnapshot());

    return function(snapshot?: WorkspaceSnapshot): boolean {
        const current = getRuntime();
        if (!runtime || current !== runtime || !sessionIsCurrent()) {
            return false;
        }
        if (!snapshot) {
            return true;
        }
        const workspace = runtime.getWorkspaceSnapshot();
        const revision = snapshot.workspaceRevision;
        const currentRevision = workspace.workspaceRevision;

        return snapshot.providerId === workspace.providerId && (
            !revision || (
                revision.session === currentRevision?.session
                && revision.sequence === currentRevision.sequence
            )
        );
    };
};


export const readWorkspaceSnapshotDatasetNames = function(snapshot: WorkspaceSnapshot): string[] {
    return snapshot.objects.filter(isWorkspaceDatasetCandidate).map((object) => {
        return object.name;
    });
};


export const createWorkspaceSnapshotDelivery = function(
    bindings: WorkspaceSnapshotDeliveryBindings
) {
    let requestSequence = 0;

    return {
        async deliver(
            snapshot: WorkspaceSnapshot,
            options: WorkspaceSnapshotDeliveryOptions = {}
        ): Promise<boolean> {
            const sequence = ++requestSequence;
            const scopeIsCurrent = captureWorkspaceRuntimeScope(bindings.getRuntime);
            const isCurrent = function(): boolean {
                return sequence === requestSequence && scopeIsCurrent(snapshot);
            };

            if (!isCurrent()) {
                return false;
            }
            const datasetNames = readWorkspaceSnapshotDatasetNames(snapshot);
            const activeDataset = bindings.getActiveDataset?.();

            if (
                options.warmActiveDataset !== false
                && activeDataset?.status === "selected"
                && datasetNames.includes(activeDataset.objectName)
            ) {
                bindings.warmDatasetFirstScreens?.(activeDataset.objectName);
            }
            if (!isCurrent()) {
                return false;
            }
            bindings.publishWorkspace(snapshot);
            if (!isCurrent()) {
                return false;
            }
            bindings.publishDatasetNames(datasetNames);
            if (!isCurrent()) {
                return false;
            }
            try {
                if (options.metadataRefreshes) {
                    const results = await options.metadataRefreshes;

                    for (const result of results) {
                        if (!isCurrent()) {
                            return false;
                        }
                        if (result.status === "rejected") {
                            options.reportMetadataError?.(result.reason);
                        }
                    }
                    if (!isCurrent()) {
                        return false;
                    }
                }
                await options.refreshDialogs?.(snapshot, isCurrent);
            }
            catch (error) {
                if (!isCurrent()) {
                    return false;
                }
                throw error;
            }
            return isCurrent();
        }
    };
};
