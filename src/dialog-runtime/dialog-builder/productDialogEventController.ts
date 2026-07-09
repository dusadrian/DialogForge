export interface ProductDialogEventWindowRegistry {
    dialogIdForSender(senderId: number): string;
    close(dialogId: string): boolean;
    remove(dialogId: string): void;
    count(): number;
}


export interface ProductDialogEventSessionStore {
    updateCommand(dialogId: string, command: unknown): void;
    updateState(dialogId: string, state: unknown): void;
    closeWindow(dialogId: string): void;
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
    sessions: ProductDialogEventSessionStore;
    publishCommand(command: string): void;
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

        const text = String(command || "");
        options.sessions.updateCommand(dialogId, text);
        options.publishCommand(text);
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
        options.sessions.closeWindow(dialogId);

        if (options.windows.count() === 0) {
            options.publishCommand("");
        }
    };

    return {
        updateCommand,
        updateState,
        close,
        windowClosed
    };
};
