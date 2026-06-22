import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type { DialogExternalCallHost } from "../../core/contracts/dialogExternalCall";
import type {
    ProductConsoleStateChip,
    ProductConsoleStateChipSnapshot
} from "../../core/contracts/productContribution";
import {
    dialogRuntimeIpcChannels
} from "../dialogRuntimeIpc";


export interface DialogExternalCallIpcControllerOptions {
    ipcMain: IpcMain;
    host: Pick<DialogExternalCallHost, "call">;
    publishFilterState(dataset: string): void;
    shouldPublishConsoleStateChips(name: string): boolean;
    readConsoleStateChips(dataset: string): Promise<ProductConsoleStateChip[]>;
    publishConsoleStateChips(snapshot: ProductConsoleStateChipSnapshot): void;
}


const filterMutationCalls = new Set([
    "setFilterState",
    "clearFilterState"
]);


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

        if (filterMutationCalls.has(externalName)) {
            options.publishFilterState(
                String(callParameters.dataset || "").trim()
            );
        }

        if (options.shouldPublishConsoleStateChips(externalName)) {
            const dataset = externalName === "inheritSubsetDatasetState"
                ? callParameters.target
                : callParameters.dataset;

            const datasetName = String(dataset || "").trim();

            options.publishConsoleStateChips({
                dataset: datasetName,
                chips: await options.readConsoleStateChips(datasetName)
            });
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
