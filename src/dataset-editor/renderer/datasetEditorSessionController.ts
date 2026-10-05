import type { RuntimeSessionSnapshot } from "../../runtime/provider-contract/runtimeProvider";


export const createDatasetEditorSessionController = function(bindings: {
    invalidatePending(): void;
    getDatasetName(): string;
    refreshDataset(datasetName: string): Promise<void>;
}) {
    let identity: Pick<RuntimeSessionSnapshot,
        "providerId" | "lifecycleGeneration" | "status"> | null = null;
    let eventSequence = 0;

    const remember = function(snapshot: RuntimeSessionSnapshot): void {
        identity = {
            providerId: snapshot.providerId,
            lifecycleGeneration: snapshot.lifecycleGeneration,
            status: snapshot.status
        };
    };

    return {
        async initialize(readSnapshot: () => Promise<RuntimeSessionSnapshot>): Promise<void> {
            if (identity) {
                return;
            }
            const sequence = eventSequence;
            const snapshot = await readSnapshot();

            if (sequence === eventSequence) {
                remember(snapshot);
            }
        },
        async update(snapshot: RuntimeSessionSnapshot): Promise<void> {
            const sequence = ++eventSequence;
            const previous = identity;
            const identityChanged = !previous
                || previous.providerId !== snapshot.providerId
                || previous.lifecycleGeneration !== snapshot.lifecycleGeneration;
            const leftReady = previous?.status === "ready" && snapshot.status !== "ready";
            const becameReady = snapshot.status === "ready"
                && (identityChanged || previous?.status !== "ready");
            remember(snapshot);

            if (identityChanged || leftReady) {
                bindings.invalidatePending();
            }
            if (becameReady && sequence === eventSequence) {
                const datasetName = bindings.getDatasetName();

                if (datasetName) {
                    await bindings.refreshDataset(datasetName);
                }
            }
        }
    };
};
