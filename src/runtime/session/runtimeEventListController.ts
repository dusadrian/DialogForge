import {
    createRuntimeEventSnapshot
} from "../events/runtimeEventProtocol";
import type {
    RuntimeEventController,
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

            if (snapshot.status !== "ready") {
                return createRuntimeEventSnapshot({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    message: "Runtime session is not ready."
                });
            }

            const providerEvents = options.providerEventController
                ? await options.providerEventController.listRuntimeEvents(snapshot)
                : [];

            return options.runtimeEventState.createSnapshot(
                snapshot.providerId,
                providerEvents
            );
        }
    };
};
