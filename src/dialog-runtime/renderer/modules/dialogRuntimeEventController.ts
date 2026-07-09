import type { EventEmitter } from "events";

import { asText } from "../library/utils";


export interface DialogRuntimeEventControllerOptions {
    events: EventEmitter;
    hasCommandSyntax(): boolean;
    makeCommand(): void;
    isRestoringDialogState(): boolean;
    saveCurrentState(data: { name?: string; status?: string }): void;
    publishCurrentState(): void;
    runCurrentCommand(): void;
    resetDialogState(): void;
}


export const createDialogRuntimeEventController = function(
    options: DialogRuntimeEventControllerOptions
) {
    const register = function(): void {
        options.events.on(
            "iSpeak",
            (data: { name?: string; status?: string }) => {
                if (options.hasCommandSyntax()) {
                    options.makeCommand();
                }

                if (options.isRestoringDialogState()) {
                    return;
                }

                options.saveCurrentState(data);
                options.publishCurrentState();
            }
        );

        options.events.on(
            "iSpeakButton",
            (data: { type?: string; name?: string }) => {
                if (data?.name) {
                    options.events.emit("iSpeak", {
                        name: data.name,
                        status: "click"
                    });
                }

                const type = asText(data?.type, "run").toLowerCase();

                if (type === "run") {
                    options.runCurrentCommand();
                    return;
                }

                if (type === "reset") {
                    options.resetDialogState();
                }
            }
        );
    };

    return {
        register
    };
};
