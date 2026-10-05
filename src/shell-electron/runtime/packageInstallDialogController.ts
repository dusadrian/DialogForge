import type {
    BrowserWindow,
    Dialog,
    MessageBoxOptions
} from "electron";

import type {
    PackageLibraryChoice,
    PackageRestartChoice
} from "../../runtime/providers/r/dependencies/packageInstallWorkflow";
import { createRPackageInstallPrompts } from "../../runtime/providers/r/dependencies/packageInstallPrompts";


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
    const prompts = function(parent: BrowserWindow | undefined) {
        return createRPackageInstallPrompts({
            translate: options.translate,
            showMessageBox: (message) => showMessageBox(parent, message)
        });
    };

    return {
        confirmRestartForLoadedPackages: async function(
            parent,
            input
        ): Promise<PackageRestartChoice> {
            return prompts(parent).confirmRestart(input);
        },
        chooseInstallLibrary: async function(
            parent,
            input
        ): Promise<PackageLibraryChoice> {
            return prompts(parent).chooseLibrary(input);
        }
    };
};
