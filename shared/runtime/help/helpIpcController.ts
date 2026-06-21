import type {
    IpcMain,
    IpcMainEvent,
    IpcMainInvokeEvent
} from "electron";

import {
    createVisibleCommandRequest
} from "../commands/commandProtocol";
import type {
    HelpTopicRequest,
    HelpTopicResult,
    RuntimeSessionManager,
    TranscriptEvent,
    VisibleCommandRequest
} from "../provider-contract/runtimeProvider";
import {
    buildHelpExampleCommand,
    parseHelpCommandUrl
} from "./helpCommandUrl";
import {
    createHelpTopicRequest
} from "./helpProtocol";
import {
    helpIpcChannels,
    type HelpDocumentSnapshot
} from "./helpIpc";


export interface HelpIpcControllerOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: Pick<RuntimeSessionManager, "readHelpTopic">;
    getHelpDocument(): HelpDocumentSnapshot;
    openHelpTopic(input: Partial<HelpTopicRequest>): Promise<HelpTopicResult>;
    executeVisibleCommand(request: VisibleCommandRequest): Promise<TranscriptEvent[]>;
    fetchRHelpPage(value: unknown): Promise<unknown>;
}


const createInvalidHelpCommandResult = function() {
    return {
        status: "invalid",
        message: "Invalid help command URL."
    };
};


export const createHelpIpcController = function(
    options: HelpIpcControllerOptions
): void {
    const openHelpCommandUrl = async function(value: unknown) {
        const command = parseHelpCommandUrl(value);

        if (!command) {
            return createInvalidHelpCommandResult();
        }

        if (command.kind === "help") {
            return options.openHelpTopic({
                topic: command.value,
                allowSearch: true,
                source: "base-app.help-link"
            });
        }

        if (command.kind === "vignette") {
            return options.openHelpTopic({
                topic: command.value,
                allowSearch: true,
                source: "base-app.help-link"
            });
        }

        const events = await options.executeVisibleCommand(createVisibleCommandRequest({
            text: command.value,
            source: "base-app.help-link"
        }));

        return {
            status: "ready",
            events
        };
    };

    options.ipcMain.handle(
        helpIpcChannels.readTopic,
        async (_event: IpcMainInvokeEvent, input: Partial<HelpTopicRequest>) => {
            const request = createHelpTopicRequest(input || {});

            return options.runtimeSessionManager.readHelpTopic(request);
        }
    );

    options.ipcMain.handle(helpIpcChannels.getDocument, async () => {
        return options.getHelpDocument();
    });

    options.ipcMain.handle(
        helpIpcChannels.openTopic,
        async (_event: IpcMainInvokeEvent, input: Partial<HelpTopicRequest>) => {
            return options.openHelpTopic(input || {});
        }
    );

    options.ipcMain.handle(
        helpIpcChannels.openCommandUrl,
        async (_event: IpcMainInvokeEvent, value: unknown) => {
            return openHelpCommandUrl(value);
        }
    );

    options.ipcMain.on(helpIpcChannels.openRCommandUrl, (_event: IpcMainEvent, value: unknown) => {
        void openHelpCommandUrl(value);
    });

    options.ipcMain.handle(
        helpIpcChannels.fetchRPage,
        async (_event: IpcMainInvokeEvent, value: unknown) => {
            return options.fetchRHelpPage(value);
        }
    );

    options.ipcMain.handle(
        helpIpcChannels.runExample,
        async (_event: IpcMainInvokeEvent, input: Record<string, unknown>) => {
            const command = buildHelpExampleCommand(
                String(input && input.topic ? input.topic : ""),
                String(input && input.package ? input.package : "")
            );

            if (!command) {
                return {
                    status: "invalid",
                    message: "Invalid help example request."
                };
            }

            const events = await options.executeVisibleCommand(createVisibleCommandRequest({
                text: command,
                source: "base-app.help-example"
            }));

            return {
                status: "ready",
                events
            };
        }
    );
};
