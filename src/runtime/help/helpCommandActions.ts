import {
    createVisibleCommandRequest
} from "../commands/commandProtocol";
import type {
    HelpTopicRequest,
    VisibleCommandRequest
} from "../provider-contract/runtimeProvider";
import {
    runtimeCommandResultSucceeded,
    type RuntimeCommandResult
} from "../commands/runtimeCommandReceipt";
import { buildHelpExampleCommand, parseHelpCommandUrl } from "./helpCommandUrl";
import type { HelpCommandResult } from "./helpIpc";


interface HelpCommandActionBindings {
    openHelpTopic(request: Partial<HelpTopicRequest>): Promise<HelpCommandResult | void>;
    executeVisibleCommand(request: VisibleCommandRequest): Promise<RuntimeCommandResult>;
}


export const createHelpCommandActions = function(bindings: HelpCommandActionBindings) {
    const execute = async function(
        text: string,
        source: string,
        example: boolean
    ): Promise<HelpCommandResult> {
        const result = await bindings.executeVisibleCommand(createVisibleCommandRequest({
            text,
            source
        }));
        const events = Array.isArray(result) ? result : result?.transcriptEvents;
        const failed = !runtimeCommandResultSucceeded(result);

        return {
            status: failed ? "error" : "ready",
            ...(events ? { events } : {}),
            ...(example ? {
                message: failed ? "R help example failed." : "R help example completed."
            } : {})
        };
    };

    return {
        async openCommandUrl(value: unknown): Promise<HelpCommandResult> {
            const command = parseHelpCommandUrl(value);
            if (!command) {
                return { status: "invalid", message: "Invalid help command URL." };
            }

            try {
                if (command.kind === "run") {
                    return await execute(command.value, "base-app.help-link", false);
                }
                const result = await bindings.openHelpTopic({
                    topic: command.value,
                    allowSearch: true,
                    source: "base-app.help-link"
                });
                return result ?? { status: "ready" };
            }
            catch (error) {
                return {
                    status: "error",
                    message: error instanceof Error ? error.message : String(error)
                };
            }
        },
        async runExample(input: { topic?: unknown; package?: unknown } = {}): Promise<HelpCommandResult> {
            const command = buildHelpExampleCommand(
                String(input?.topic || ""),
                String(input?.package || "")
            );
            if (!command) {
                return { status: "invalid", message: "Invalid help example request." };
            }
            return execute(command, "base-app.help-example", true);
        }
    };
};
