import type {
    BrowserWindow,
    Dialog,
    MessageBoxOptions
} from "electron";

import type {
    PackageLibraryChoice,
    PackageRestartChoice
} from "./packageInstallWorkflow";


export interface PackageInstallDialogControllerOptions {
    dialog: Dialog;
    translate(text: string): string;
}


export interface PackageInstallDialogController {
    chooseInstallLibrary(
        parent: BrowserWindow | undefined,
        input: { userLibrary?: unknown; defaultLibrary?: unknown }
    ): Promise<PackageLibraryChoice>;
    confirmRestartForLoadedPackages(
        parent: BrowserWindow | undefined,
        input: { packages?: unknown }
    ): Promise<PackageRestartChoice>;
}


export const createPackageInstallDialogController = function(
    options: PackageInstallDialogControllerOptions
): PackageInstallDialogController {
    const showMessageBox = function(
        parent: BrowserWindow | undefined,
        messageOptions: MessageBoxOptions
    ) {
        return parent
            ? options.dialog.showMessageBox(parent, messageOptions)
            : options.dialog.showMessageBox(messageOptions);
    };
    const t = options.translate;

    return {
        confirmRestartForLoadedPackages: async function(
            parent,
            input
        ): Promise<PackageRestartChoice> {
            const packageNames = Array.isArray(input?.packages)
                ? input.packages.map((name) => {
                    return String(name || "").trim();
                }).filter(Boolean)
                : [];
            const result = await showMessageBox(parent, {
                type: "warning",
                buttons: [
                    t("Cancel"),
                    t("Clean"),
                    t("Restore")
                ],
                cancelId: 0,
                defaultId: 0,
                noLink: true,
                title: t("Restart R before installing packages"),
                message: t("Some R packages are already loaded."),
                detail: [
                    t("Restart R before installing or updating these packages. Choose Clean to restart with an empty workspace, or Restore to restart and restore the current workspace."),
                    packageNames.join(", ")
                ].filter(Boolean).join("\n\n")
            });

            if (result.response === 1) {
                return { action: "clean" };
            }

            if (result.response === 2) {
                return { action: "restore" };
            }

            return { action: "cancel" };
        },
        chooseInstallLibrary: async function(
            parent,
            input
        ): Promise<PackageLibraryChoice> {
            const userLibrary = String(input?.userLibrary || "").trim();
            const defaultLibrary = String(input?.defaultLibrary || "").trim();
            const result = await showMessageBox(parent, {
                type: "question",
                buttons: [
                    t("Cancel"),
                    t("At user level"),
                    t("At system level")
                ],
                cancelId: 0,
                defaultId: 1,
                noLink: true,
                title: t("Choose R package library"),
                message: t("Choose where to install R packages."),
                detail: [
                    t("The user-level library is usually in your home directory. The default library is managed by the R installation."),
                    userLibrary ? `${t("At user level")}: ${userLibrary}` : "",
                    defaultLibrary ? `${t("At system level")}: ${defaultLibrary}` : ""
                ].filter(Boolean).join("\n")
            });

            if (result.response === 1) {
                return { action: "user" };
            }

            if (result.response === 2) {
                return { action: "default" };
            }

            return { action: "cancel" };
        }
    };
};
