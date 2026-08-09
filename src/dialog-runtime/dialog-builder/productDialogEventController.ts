import type {
    ProductDialogSessionController
} from "./productDialogSessionController";


export interface ProductDialogEventWindowRegistry {
    dialogIdForSender(senderId: number): string;
    close(dialogId: string): boolean;
    remove(dialogId: string): void;
    count(): number;
}


export interface ProductDialogStateUpdate {
    name?: string;
    changes?: unknown;
}


export interface ProductDialogCloseRequest {
    dialogID?: string;
}


export interface ProductDialogEventControllerOptions {
    windows: ProductDialogEventWindowRegistry;
    sessions: ProductDialogSessionController;
}


export interface ProductDialogEventController {
    updateCommand(senderId: number, command: unknown): void;
    updateState(payload: ProductDialogStateUpdate): void;
    close(payload: ProductDialogCloseRequest): void;
    windowClosed(dialogId: string): void;
}


export const createProductDialogEventController = function(
    options: ProductDialogEventControllerOptions
): ProductDialogEventController {
    const updateCommand = function(
        senderId: number,
        command: unknown
    ): void {
        const dialogId = options.windows.dialogIdForSender(senderId);

        if (!dialogId) {
            return;
        }

        options.sessions.updateCommand(dialogId, command);
    };
    const updateState = function(
        payload: ProductDialogStateUpdate
    ): void {
        const dialogId = String(payload?.name || "").trim();

        if (dialogId) {
            options.sessions.updateState(dialogId, payload?.changes);
        }
    };
    const close = function(
        payload: ProductDialogCloseRequest
    ): void {
        const dialogId = String(payload?.dialogID || "").trim();

        if (dialogId) {
            options.windows.close(dialogId);
        }
    };
    const windowClosed = function(dialogId: string): void {
        options.windows.remove(dialogId);
        options.sessions.closeWindow(dialogId, options.windows.count());
    };

    return {
        updateCommand,
        updateState,
        close,
        windowClosed
    };
};
