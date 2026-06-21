import type {
    OpenFileResult,
    PathInfoResult
} from "../../../shell-electron/filesystem/openFileResult";
import {
    bindMainFileDropHandling
} from "./mainFileDropBindings";


export interface MainFileDropControllerBindings {
    renderRuntimeResult(result: { status: string; message?: string }): void;
    refreshWorkingDirectory(): Promise<void>;
    refreshWorkspace(): Promise<void>;
    openScriptFile(filePath: string): Promise<unknown>;
    applyImportFile(result: OpenFileResult): void;
}


export interface MainFileDropController {
    bind(): void;
}


export const createDroppedOpenFileResult = function(
    filePath: string
): OpenFileResult {
    return {
        status: "selected",
        canceled: false,
        filePath,
        filePaths: [filePath],
        message: "File selected from drop."
    };
};


export const createMainFileDropController = function(
    bindings: MainFileDropControllerBindings
): MainFileDropController {
    const executePathMethod = async function(
        method: string,
        pathInfo: PathInfoResult
    ): Promise<{ status: string }> {
        return window.dialogForge.executeRuntimeMethod({
            method,
            params: {
                path: pathInfo.path
            },
            source: "base-app.file-drop"
        });
    };

    const bind = function(): void {
        bindMainFileDropHandling({
            inspectPath: window.dialogForge.inspectPath,
            getFilePath: window.dialogForge.readDroppedFilePath,
            setWorkingDirectory: async function(pathInfo): Promise<void> {
                const result = await executePathMethod(
                    "runtime.set_working_directory",
                    pathInfo
                );

                bindings.renderRuntimeResult(result);
                await bindings.refreshWorkingDirectory();
            },
            openScript: async function(pathInfo): Promise<void> {
                await bindings.openScriptFile(pathInfo.path);
            },
            loadWorkspace: async function(pathInfo): Promise<void> {
                const result = await executePathMethod(
                    "runtime.load_workspace_file",
                    pathInfo
                );

                bindings.renderRuntimeResult(result);
                await bindings.refreshWorkspace();
            },
            importFile: function(pathInfo): void {
                bindings.applyImportFile(
                    createDroppedOpenFileResult(pathInfo.path)
                );
            },
            reportDropResult: function(result): void {
                if (result.status === "handled") {
                    return;
                }

                bindings.renderRuntimeResult({
                    status: result.status,
                    message: result.message
                });
            }
        });
    };

    return {
        bind
    };
};
