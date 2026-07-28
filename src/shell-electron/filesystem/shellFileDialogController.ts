import * as fs from "fs";
import * as path from "path";
import type { Dialog } from "electron";

import {
    createOpenDirectoryResult,
    createOpenFileResult,
    createPathInfoResult,
    type OpenFileResult,
    type PathInfoResult
} from "../../base-app/features/files/openFileResult";
import {
    dataFileExtensions
} from "../../runtime/tabular-data/importFilePolicy";
import {
    rScriptFilePolicy
} from "../../runtime/providers/r/script/rScriptFilePolicy";
import {
    rWorkspaceFilePolicy
} from "../../runtime/providers/r/workspace/rWorkspaceFilePolicy";


export interface ShellFileDialogControllerOptions {
    dialog: Dialog;
    translate(text: string): string;
}


export interface ShellFileDialogController {
    inspectPath(filePath: unknown): PathInfoResult;
    openImportFile(): Promise<OpenFileResult>;
    selectWorkingDirectory(): Promise<OpenFileResult>;
    selectWorkspaceOpenFile(): Promise<OpenFileResult>;
    selectWorkspaceSaveFile(): Promise<OpenFileResult>;
    selectScriptFile(): Promise<OpenFileResult>;
}


const WORKSPACE_FILE_FILTERS = [
    {
        name: rWorkspaceFilePolicy.openDialogLabel,
        extensions: rWorkspaceFilePolicy.fileExtensions
    },
    { name: "All files", extensions: ["*"] }
];

const SCRIPT_FILE_FILTERS = [
    {
        name: rScriptFilePolicy.openDialogLabel,
        extensions: rScriptFilePolicy.openFileExtensions
    },
    { name: "All files", extensions: ["*"] }
];


export const createShellFileDialogController = function(
    options: ShellFileDialogControllerOptions
): ShellFileDialogController {
    const importFileFilters = [
        {
            name: "Data files",
            extensions: dataFileExtensions
        },
        { name: "All files", extensions: ["*"] }
    ];

    return {
        inspectPath: function(filePathInput: unknown): PathInfoResult {
            const filePath = String(filePathInput || "");

            if (!filePath) {
                return createPathInfoResult({
                    status: "invalid",
                    kind: "unknown",
                    message: "Path is required."
                });
            }

            try {
                const stat = fs.statSync(filePath);
                const kind = stat.isDirectory()
                    ? "directory"
                    : (stat.isFile() ? "file" : "unknown");

                return createPathInfoResult({
                    status: "ready",
                    path: filePath,
                    kind,
                    extension: path.extname(filePath).toLowerCase(),
                    basename: path.basename(filePath),
                    message: "Path inspected."
                });
            }
            catch (error) {
                return createPathInfoResult({
                    status: "missing",
                    path: filePath,
                    kind: "missing",
                    extension: path.extname(filePath).toLowerCase(),
                    basename: path.basename(filePath),
                    message: error instanceof Error
                        ? error.message
                        : String(error)
                });
            }
        },
        openImportFile: async function(): Promise<OpenFileResult> {
            return createOpenFileResult(await options.dialog.showOpenDialog({
                properties: ["openFile"],
                filters: importFileFilters
            }));
        },
        selectWorkingDirectory: async function(): Promise<OpenFileResult> {
            return createOpenDirectoryResult(await options.dialog.showOpenDialog({
                properties: ["openDirectory", "createDirectory"]
            }));
        },
        selectWorkspaceOpenFile: async function(): Promise<OpenFileResult> {
            return createOpenFileResult(await options.dialog.showOpenDialog({
                properties: ["openFile"],
                filters: WORKSPACE_FILE_FILTERS
            }));
        },
        selectWorkspaceSaveFile: async function(): Promise<OpenFileResult> {
            const result = await options.dialog.showSaveDialog({
                defaultPath: rWorkspaceFilePolicy.defaultFileName,
                filters: WORKSPACE_FILE_FILTERS
            });

            return createOpenFileResult({
                canceled: result.canceled,
                filePaths: result.filePath ? [result.filePath] : []
            });
        },
        selectScriptFile: async function(): Promise<OpenFileResult> {
            return createOpenFileResult(await options.dialog.showOpenDialog({
                properties: ["openFile"],
                filters: SCRIPT_FILE_FILTERS
            }));
        }
    };
};
