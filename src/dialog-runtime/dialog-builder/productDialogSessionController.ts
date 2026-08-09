import {
    ProductDialogSessionStore
} from "./productDialogSessionStore";


export interface ProductDialogSessionControllerOptions {
    sessions?: ProductDialogSessionStore;
    publishCommand(command: string, dialogId: string): void;
}


export interface ProductDialogSessionController {
    getState(dialogId: string): unknown;
    updateCommand(dialogId: string, command: unknown): void;
    updateState(dialogId: string, state: unknown): void;
    closeWindow(dialogId: string, openWindowCount: number): void;
}


export const createProductDialogSessionController = function(
    options: ProductDialogSessionControllerOptions
): ProductDialogSessionController {
    const sessions = options.sessions || new ProductDialogSessionStore();

    return {
        getState(dialogId: string): unknown {
            return sessions.getState(String(dialogId || "").trim());
        },

        updateCommand(dialogId: string, command: unknown): void {
            const cleanId = String(dialogId || "").trim();

            if (!cleanId) {
                return;
            }

            const text = String(command || "");
            sessions.updateCommand(cleanId, text);
            options.publishCommand(text, cleanId);
        },

        updateState(dialogId: string, state: unknown): void {
            const cleanId = String(dialogId || "").trim();

            if (cleanId) {
                sessions.updateState(cleanId, state);
            }
        },

        closeWindow(dialogId: string, openWindowCount: number): void {
            const cleanId = String(dialogId || "").trim();

            if (cleanId) {
                sessions.closeWindow(cleanId);
            }

            if (Math.max(0, Number(openWindowCount) || 0) === 0) {
                options.publishCommand("", "");
            }
        }
    };
};
