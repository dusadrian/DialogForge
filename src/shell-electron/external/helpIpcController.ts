import type {
    IpcMain,
    IpcMainEvent,
    IpcMainInvokeEvent
} from "electron";

import type {
    HelpTopicRequest,
    HelpTopicResult,
    RuntimeSessionManager,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
import type { RuntimeCommandResult } from "../../runtime/commands/runtimeCommandReceipt";
import { createHelpCommandActions } from "../../runtime/help/helpCommandActions";
import {
    createHelpTopicRequest
} from "../../runtime/help/helpProtocol";
import {
    helpIpcChannels,
    type HelpDocumentSnapshot
} from "../../runtime/help/helpIpc";


export interface HelpIpcControllerOptions {
    ipcMain: IpcMain;
    runtimeSessionManager: Pick<RuntimeSessionManager, "readHelpTopic">;
    getHelpDocument(): HelpDocumentSnapshot;
    openHelpTopic(input: Partial<HelpTopicRequest>): Promise<HelpTopicResult>;
    retireHelpRequest?(): void;
    executeVisibleCommand(request: VisibleCommandRequest): Promise<RuntimeCommandResult>;
    fetchRHelpPage(value: unknown): Promise<unknown>;
}


export const createHelpIpcController = function(
    options: HelpIpcControllerOptions
): void {
    const helpCommands = createHelpCommandActions({
        openHelpTopic: options.openHelpTopic,
        executeVisibleCommand: options.executeVisibleCommand
    });

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

    options.ipcMain.handle(helpIpcChannels.retireRequest, () => {
        options.retireHelpRequest?.();
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
            return helpCommands.openCommandUrl(value);
        }
    );

    options.ipcMain.on(helpIpcChannels.openRCommandUrl, (_event: IpcMainEvent, value: unknown) => {
        void helpCommands.openCommandUrl(value);
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
            return helpCommands.runExample(input);
        }
    );
};
