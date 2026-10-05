import { isRHelpPagePath } from "./rHelpResourceProtocol";
import type { HelpRequestOwner } from "./helpRequestOwner";
import type { RuntimeEventSnapshot, RuntimeSessionManager } from "../provider-contract/runtimeProvider";


export const createRuntimeHelpEventDelivery = function(bindings: {
    getRuntime(): RuntimeSessionManager | null | undefined;
    requests: HelpRequestOwner;
    openPage(path: string, isCurrent: () => boolean): Promise<void>;
    reportError(error: unknown): void;
}) {
    let owner: ReturnType<typeof bindings.getRuntime>;
    let generation: number | undefined;
    let seen = new Set<string>();

    return {
        present(snapshot: RuntimeEventSnapshot): void {
            const runtime = bindings.getRuntime();
            const currentGeneration = runtime?.getSnapshot().lifecycleGeneration;
            if (runtime !== owner || currentGeneration !== generation) {
                owner = runtime;
                generation = currentGeneration;
                seen = new Set();
            }
            if (!runtime) {
                return;
            }
            // The common R event controller retains newest events first.
            for (const event of [...(snapshot.events || [])].reverse()) {
                if (event.type !== "help.page" || event.lifecycleGeneration !== generation) {
                    continue;
                }
                const id = String(event.payload.eventId || "");
                const path = String(event.payload.path || "");
                if (!id || seen.has(id) || !isRHelpPagePath(path)) {
                    continue;
                }
                seen.add(id);
                const requestIsCurrent = bindings.requests.begin();
                const isCurrent = function(): boolean {
                    return requestIsCurrent() && bindings.getRuntime() === runtime
                        && runtime.getSnapshot().lifecycleGeneration === currentGeneration;
                };
                void bindings.openPage(path, isCurrent).catch((error) => {
                    if (isCurrent()) {
                        bindings.reportError(error);
                    }
                });
            }
        }
    };
};
