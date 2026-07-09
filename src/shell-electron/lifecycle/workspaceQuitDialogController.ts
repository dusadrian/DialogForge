import type {
    BrowserWindow,
    Dialog,
    MessageBoxOptions
} from "electron";


export interface WorkspaceQuitDialogControllerOptions {
    dialog: Dialog;
    translate(text: string): string;
}


export type WorkspaceQuitChoice = "save" | "discard" | "cancel";


export interface WorkspaceQuitDialogController {
    chooseWorkspaceQuitAction(
        parent?: BrowserWindow
    ): Promise<WorkspaceQuitChoice>;
    showWorkspaceSaveFailure(
        parent: BrowserWindow | undefined,
        title: string,
        detail: string
    ): Promise<void>;
}


export const createWorkspaceQuitDialogController = function(
    options: WorkspaceQuitDialogControllerOptions
): WorkspaceQuitDialogController {
    const t = options.translate;
    const showMessageBox = function(
        parent: BrowserWindow | undefined,
        messageOptions: MessageBoxOptions
    ) {
        return parent
            ? options.dialog.showMessageBox(parent, messageOptions)
            : options.dialog.showMessageBox(messageOptions);
    };

    return {
        chooseWorkspaceQuitAction: async function(
            parent
        ): Promise<WorkspaceQuitChoice> {
            const prompt = await showMessageBox(parent, {
                type: "question",
                buttons: [
                    t("Save"),
                    t("Don't Save"),
                    t("Cancel")
                ],
                defaultId: 0,
                cancelId: 2,
                title: t("Closing R session"),
                message: t("Closing R session"),
                detail: t("Save workspace image?"),
                noLink: true
            });

            if (prompt.response === 0) {
                return "save";
            }

            if (prompt.response === 1) {
                return "discard";
            }

            return "cancel";
        },
        showWorkspaceSaveFailure: async function(
            parent,
            title,
            detail
        ): Promise<void> {
            await showMessageBox(parent, {
                type: "error",
                buttons: [
                    t("OK")
                ],
                title: t("Workspace Save Failed") || title,
                message: t("Could not save the workspace image."),
                detail
            });
        }
    };
};
