import type {
    IpcMain,
    IpcMainInvokeEvent
} from "electron";

import type { DialogExternalCallHost } from "../../core/contracts/dialogExternalCall";
import {
    dialogRuntimeIpcChannels
} from "../dialogRuntimeIpc";


export interface DialogExternalCallIpcControllerOptions {
    ipcMain: IpcMain;
    host: Pick<DialogExternalCallHost, "call">;
    publishFilterState(dataset: string): void;
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

        return result;
    });
};
