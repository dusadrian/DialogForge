import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type { DialogExternalCallHost } from "../../core/contracts/dialogExternalCall";
import type {
    ProductConsoleStateChip
} from "../../core/contracts/productContribution";
import {
    dialogRuntimeIpcChannels
} from "../../dialog-runtime/dialogRuntimeIpc";
import {
    isDialogStateExternalCall
} from "../../dialog-runtime/custom-js/dialogStateExternalCalls";


export interface DialogExternalCallIpcControllerOptions {
    ipcMain: IpcMain;
    host: Pick<DialogExternalCallHost, "call">;
    shouldPublishConsoleStateChips(name: string): boolean;
    readConsoleStateChips(dataset: string): Promise<ProductConsoleStateChip[]>;
    refreshConsoleStateChips(dataset: string): Promise<void>;
}


export const createDialogExternalCallIpcController = function(
    options: DialogExternalCallIpcControllerOptions
): void {
    options.ipcMain.handle(dialogRuntimeIpcChannels.callExternal, async (
        _event: IpcMainInvokeEvent,
        name: string,
        parameters: Record<string, unknown> = {}
    ) => {
        const externalName = String(name || "");
        const callParameters = parameters || {};
        const result = await options.host.call(externalName, callParameters);

        if (
            !isDialogStateExternalCall(externalName)
            && options.shouldPublishConsoleStateChips(externalName)
        ) {
            const dataset = externalName === "inheritSubsetDatasetState"
                ? callParameters.target
                : callParameters.dataset;

            const datasetName = String(dataset || "").trim();

            await options.refreshConsoleStateChips(datasetName);
        }

        return result;
    });
    options.ipcMain.handle(
        dialogRuntimeIpcChannels.readConsoleStateChips,
        async (_event: IpcMainInvokeEvent, dataset: string) => {
            return options.readConsoleStateChips(String(dataset || "").trim());
        }
    );
};
