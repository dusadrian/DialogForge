import type {
    RuntimeSessionManager
} from "../../../provider-contract/runtimeProvider";


export const retiredRPackageRuntimeMessage =
    "Runtime session changed while preparing required R packages. Retry in the current session.";

export interface RPackageRuntimeSnapshot {
    status: string;
    providerId?: string;
    lifecycleGeneration?: number;
}


export const captureRPackageRuntimeSnapshot = function(
    readSnapshot: () => RPackageRuntimeSnapshot | null | undefined,
    expectedSnapshot = readSnapshot()
): () => boolean {
    const status = expectedSnapshot?.status;
    const providerId = expectedSnapshot?.providerId;
    const generation = expectedSnapshot?.lifecycleGeneration;

    return function(): boolean {
        const current = readSnapshot();
        return status === "ready" && current?.status === "ready"
            && current.providerId === providerId
            && current.lifecycleGeneration === generation;
    };
};

export const captureRPackageRuntime = function(
    getRuntime: () => Pick<RuntimeSessionManager, "getSnapshot"> | null | undefined
): () => boolean {
    const runtime = getRuntime();
    const isCurrentSnapshot = captureRPackageRuntimeSnapshot(
        () => getRuntime()?.getSnapshot()
    );

    return function(): boolean {
        const current = getRuntime();
        return Boolean(runtime && current === runtime && isCurrentSnapshot());
    };
};

export const requireCurrentRPackageRuntime = function(isCurrent?: () => boolean): void {
    if (isCurrent && !isCurrent()) {
        throw new Error(retiredRPackageRuntimeMessage);
    }
};
