import type {
    RuntimeSessionManager,
    RuntimeSessionSnapshot,
    RuntimeEventSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createRuntimeDatasetChangeProjector
} from "./runtimeDatasetChanges";

type RuntimeEventDeliveryRuntime = Pick<RuntimeSessionManager, "getSnapshot" | "listRuntimeEvents">;

interface RuntimeSessionPublicationBindings {
    publishSession(snapshot: RuntimeSessionSnapshot): void;
    publishScriptPhase?(phase: { phase: string }): void;
}


export const publishRuntimeSessionSnapshot = function(
    snapshot: RuntimeSessionSnapshot,
    bindings: RuntimeSessionPublicationBindings
): void {
    bindings.publishSession(snapshot);
    bindings.publishScriptPhase?.({ phase: snapshot.status });
};


export const createRuntimeSessionPublication = function(
    bindings: RuntimeSessionPublicationBindings
) {
    let readyHolds = 0;

    return {
        publish(snapshot: RuntimeSessionSnapshot): boolean {
            if (readyHolds > 0 && snapshot.status === "ready") {
                return false;
            }

            publishRuntimeSessionSnapshot(snapshot, bindings);
            return true;
        },
        deferReady(): () => void {
            readyHolds += 1;
            let released = false;

            return function(): void {
                if (released) {
                    return;
                }

                released = true;
                readyHolds -= 1;
                // Do not replay held snapshots: restart publishes its current result.
            };
        }
    };
};


export const createRuntimeEventDelivery = function(bindings: {
    getRuntime(): RuntimeEventDeliveryRuntime | null | undefined;
    publish(snapshot: RuntimeEventSnapshot, changes: Array<Record<string, unknown>>): void;
    publishEffects?(snapshot: RuntimeEventSnapshot): void;
}) {
    let requestSequence = 0;
    let projectionRuntime: ReturnType<typeof bindings.getRuntime>;
    let projectionGeneration: number | undefined;
    let projector = createRuntimeDatasetChangeProjector();

    const publishSnapshot = function(
        snapshot: RuntimeEventSnapshot,
        options?: { sendDatasetChanges?: boolean }
    ): void {
        requestSequence += 1;
        const runtime = bindings.getRuntime();
        const generation = runtime?.getSnapshot().lifecycleGeneration;
        if (runtime !== projectionRuntime || generation !== projectionGeneration) {
            projector = createRuntimeDatasetChangeProjector();
            projectionRuntime = runtime;
            projectionGeneration = generation;
        }

        const currentEvents = (snapshot.events || []).filter((event) => {
            return event.lifecycleGeneration === undefined
                || event.lifecycleGeneration === generation;
        });
        const changes = options?.sendDatasetChanges === false
            ? []
            : projector.project(currentEvents);
        bindings.publish(snapshot, changes);
        bindings.publishEffects?.({ ...snapshot, lifecycleGeneration: generation, events: currentEvents });
    };

    return {
        publishSnapshot,
        async refresh(options?: {
            sendDatasetChanges?: boolean;
            expectedRuntime?: RuntimeEventDeliveryRuntime;
        }): Promise<void> {
            const sequence = ++requestSequence;
            const runtime = bindings.getRuntime();
            if (!runtime || (options?.expectedRuntime && runtime !== options.expectedRuntime)) {
                return;
            }
            const initial = runtime.getSnapshot();
            const generation = initial.lifecycleGeneration;
            const status = initial.status;
            const isCurrent = function(): boolean {
                const current = bindings.getRuntime();
                const snapshot = current?.getSnapshot();
                return sequence === requestSequence && current === runtime
                    && snapshot?.lifecycleGeneration === generation
                    && snapshot?.status === status;
            };
            let snapshot: RuntimeEventSnapshot;

            try {
                snapshot = await runtime.listRuntimeEvents();
            }
            catch (error) {
                if (!isCurrent()) {
                    return;
                }
                throw error;
            }
            if (!isCurrent()) {
                return;
            }
            publishSnapshot(snapshot, options);
        }
    };
};
