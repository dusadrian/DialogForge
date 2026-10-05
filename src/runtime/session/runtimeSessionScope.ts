import type { RuntimeSessionSnapshot } from "../provider-contract/runtimeProvider";


type RuntimeSessionIdentity = Pick<
    RuntimeSessionSnapshot, "providerId" | "lifecycleGeneration" | "status"
>;


export const captureRuntimeSessionScope = function(
    readSnapshot: () => RuntimeSessionIdentity | null | undefined
): () => boolean {
    const initial = readSnapshot();
    const providerId = initial?.providerId;
    const generation = initial?.lifecycleGeneration;
    const status = initial?.status;

    return function(): boolean {
        const current = readSnapshot();

        return Boolean(initial && current
            && current.providerId === providerId
            && current.lifecycleGeneration === generation
            && current.status === status);
    };
};
