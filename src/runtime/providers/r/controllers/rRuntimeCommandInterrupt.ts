import { createTranscriptEvent } from "../../../commands/commandProtocol";
import type { TranscriptEvent } from "../../../provider-contract/runtimeProvider";


export interface RRuntimeCommandInterruptOptions {
    signalInterrupt(): boolean | null;
    canInterrupt?(): boolean;
    isCurrent?(): boolean;
    onTranscriptEvents?(events: TranscriptEvent[]): void;
}


export const createRRuntimeCommandInterrupt = function(
    options: RRuntimeCommandInterruptOptions
) {
    let active: {
        parentId: string;
        phase: "dispatched" | "running" | "evaluated";
        requested: boolean;
    } | null = null;

    const isCurrent = function(): boolean {
        if (options.isCurrent?.() === false) {
            active = null;
            return false;
        }

        return active !== null;
    };

    const signalRequestedInterrupt = function(): boolean | null {
        if (
            !isCurrent() || !active || active.phase !== "running"
            || options.canInterrupt?.() === false
        ) {
            return null;
        }

        const command = active;
        command.requested = false;
        let signalled: boolean | null;

        try {
            signalled = options.signalInterrupt();
        }
        catch {
            signalled = false;
        }

        return signalled;
    };

    return {
        begin: function(parentId: string): void {
            active = parentId ? {
                parentId,
                phase: "dispatched",
                requested: false
            } : null;
        },
        finish: function(parentId: string): void {
            if (active?.parentId === parentId) {
                active = null;
            }
        },
        retire: function(): void {
            active = null;
        },
        requestInterrupt: function(): boolean | null {
            if (
                !isCurrent() || !active || active.phase === "evaluated"
                || options.canInterrupt?.() === false
            ) {
                return null;
            }

            active.requested = true;

            if (active.phase === "dispatched") {
                return true;
            }

            return signalRequestedInterrupt();
        },
        observeEvent: function(event: unknown): void {
            if (!isCurrent() || !active || !event || typeof event !== "object") {
                return;
            }

            const record = event as Record<string, unknown>;

            if (record.parent_id !== active.parentId) {
                return;
            }

            if (
                record.type === "completion"
                || (record.type === "execution_phase" && record.phase === "evaluated")
            ) {
                active.phase = "evaluated";
                active.requested = false;
                return;
            }

            if (
                record.type === "execution_phase"
                && record.phase === "running"
                && active.phase === "dispatched"
            ) {
                active.phase = "running";

                if (active.requested) {
                    const command = active;
                    const signalled = signalRequestedInterrupt();

                    if (signalled !== true && active === command && isCurrent()) {
                        options.onTranscriptEvents?.([
                            createTranscriptEvent("output", {
                                kind: "runtime.interrupt",
                                source: "runtime.interrupt",
                                text: ""
                            }, {
                                parentId: command.parentId,
                                streamName: "stderr",
                                message: signalled === null
                                    ? "Runtime interrupt is not available.\n"
                                    : "Runtime did not accept the interrupt request.\n"
                            })
                        ]);
                    }
                }
            }
        }
    };
};
