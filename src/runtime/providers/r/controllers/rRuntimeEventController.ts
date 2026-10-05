import type {
    RuntimeEventController,
    RuntimeEventRecord,
    RuntimeSessionSnapshot
} from "../../../provider-contract/runtimeProvider";
import {
    asRuntimeControlArray,
    createProviderRuntimeEvent
} from "../protocol/runtimeControlEvents";


export interface RRuntimeEventController extends RuntimeEventController {
    recordRuntimeControlEvents(
        events: unknown[] | undefined,
        snapshot: RuntimeSessionSnapshot
    ): void;
}


export const createRRuntimeEventController = function(): RRuntimeEventController {
    const events: RuntimeEventRecord[] = [];

    return {
        recordRuntimeControlEvents: function(controlEvents, snapshot): void {
            for (const controlEvent of asRuntimeControlArray(controlEvents)) {
                const event = createProviderRuntimeEvent(controlEvent, snapshot);

                if (event && event.type !== "workspace.update") {
                    events.unshift(event);
                }
            }

            if (events.length > 40) {
                events.length = 40;
            }
        },
        listRuntimeEvents: async function(snapshot): Promise<RuntimeEventRecord[]> {
            return events.filter((event) => {
                return event.providerId === snapshot.providerId
                    && event.lifecycleGeneration === snapshot.lifecycleGeneration;
            });
        }
    };
};
