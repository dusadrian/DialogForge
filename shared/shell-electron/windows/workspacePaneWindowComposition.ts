import type {
    IpcMain,
    Screen
} from "electron";
import {
    createWorkspacePaneWindowController,
    normalizeWorkspacePaneWindowExpansion
} from "./workspacePaneWindowController";
import {
    createWorkspacePaneWindowIpcController
} from "./workspacePaneWindowIpcController";


const visibilitySettingsKey = "app.main.workspacePaneVisible";
const expansionSettingsKey = "app.main.workspacePaneExpansion";


export interface WorkspacePaneWindowCompositionOptions {
    ipcMain: IpcMain;
    screen: Screen;
    minimumWidth: number;
    readSettings(): Record<string, unknown>;
    writeSettings(settings: Record<string, unknown>): void;
}


export const createWorkspacePaneWindowComposition = function(
    options: WorkspacePaneWindowCompositionOptions
) {
    const controller = createWorkspacePaneWindowController({
        minimumWidth: options.minimumWidth,
        getWorkArea: function(bounds) {
            return options.screen.getDisplayMatching(bounds).workArea;
        },
        readStoredExpansion: function() {
            return normalizeWorkspacePaneWindowExpansion(
                options.readSettings()[expansionSettingsKey]
            );
        },
        writeStoredExpansion: function(expansion): void {
            options.writeSettings({
                [expansionSettingsKey]: expansion
            });
        },
        writeVisibility: function(visible): void {
            options.writeSettings({
                [visibilitySettingsKey]: visible
            });
        }
    });

    createWorkspacePaneWindowIpcController({
        ipcMain: options.ipcMain,
        windowController: controller
    });

    return controller;
};
