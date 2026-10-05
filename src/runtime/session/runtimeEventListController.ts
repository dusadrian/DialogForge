import {
    createRuntimeEventSnapshot
} from "../events/runtimeEventProtocol";
import type {
    RuntimeEventController,
    RuntimeEventRecord,
    RuntimeEventSnapshot,
    RuntimeSessionSnapshot
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeEventState
} from "./runtimeEventState";


export interface RuntimeEventListControllerOptions {
    providerEventController?: RuntimeEventController;
    runtimeEventState: RuntimeEventState;
    getSnapshot(): RuntimeSessionSnapshot;
}


export interface RuntimeEventListController {
    listRuntimeEvents(): Promise<RuntimeEventSnapshot>;
}


export const createRuntimeEventListController = function(
    options: RuntimeEventListControllerOptions
): RuntimeEventListController {
    return {
        listRuntimeEvents: async function() {
            const snapshot = options.getSnapshot();
            const generation = snapshot.lifecycleGeneration;
            const providerId = snapshot.providerId;
            const isCurrent = function(): boolean {
                const current = options.getSnapshot();
                return current.status === "ready"
                    && current.providerId === providerId
                    && current.lifecycleGeneration === generation;
            };
            const retiredSnapshot = function(): RuntimeEventSnapshot {
                return createRuntimeEventSnapshot({
                    status: "unavailable",
                    providerId,
                    message: "Runtime session changed while reading events."
                });
            };

            if (snapshot.status !== "ready") {
                return createRuntimeEventSnapshot({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    message: "Runtime session is not ready."
                });
            }

            let providerEvents: RuntimeEventRecord[];
            try {
                providerEvents = options.providerEventController
                    ? await options.providerEventController.listRuntimeEvents(snapshot)
                    : [];
            }
            catch (error) {
                if (!isCurrent()) {
                    return retiredSnapshot();
                }
                throw error;
            }

            if (!isCurrent()) {
                return retiredSnapshot();
            }

            return options.runtimeEventState.createSnapshot(
                providerId,
                providerEvents.map((event) => ({
                    ...event,
                    lifecycleGeneration: event.lifecycleGeneration ?? generation
                }))
            );
        }
    };
};
