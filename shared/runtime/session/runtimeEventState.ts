import {
    createRuntimeEvent,
    createRuntimeEventSnapshot
} from "../events/runtimeEventProtocol";
import type {
    RuntimeEventRecord,
    RuntimeEventSnapshot
} from "../provider-contract/runtimeProvider";


export interface RuntimeEventState {
    record(
        providerId: string,
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
    createSnapshot(
        providerId: string,
        providerEvents: RuntimeEventRecord[]
    ): RuntimeEventSnapshot;
}


export const createRuntimeEventState = function(
    maximumEvents = 40
): RuntimeEventState {
    const events: RuntimeEventRecord[] = [];

    return {
        record: function(
            providerId,
            type,
            objectName,
            detail,
            payload
        ): void {
            events.unshift(createRuntimeEvent({
                type,
                providerId,
                objectName,
                detail,
                payload
            }));

            if (events.length > maximumEvents) {
                events.length = maximumEvents;
            }
        },
        createSnapshot: function(providerId, providerEvents) {
            return createRuntimeEventSnapshot({
                status: "ready",
                providerId,
                events: providerEvents.concat(events).slice(0, maximumEvents),
                message: "Runtime event log read from session memory."
            });
        }
    };
};
