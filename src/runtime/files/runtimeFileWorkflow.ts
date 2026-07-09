export interface RuntimeFileSelection {
    canceled: boolean;
    filePath?: string;
}


export interface RuntimeFileExecutionResult {
    status: string;
}


export interface RuntimeFileWorkflowBindings<
    Selection extends RuntimeFileSelection,
    Result extends RuntimeFileExecutionResult
> {
    selectWorkingDirectory(): Promise<Selection>;
    selectScriptFile(): Promise<Selection>;
    selectWorkspaceOpenFile(): Promise<Selection>;
    selectWorkspaceSaveFile(): Promise<Selection>;
    execute(input: {
        method: string;
        params: {
            path: string;
        };
        source: string;
    }): Promise<Result>;
    selectionCanceled(selection: Selection): void;
    executionFinished(result: Result): void;
    refreshWorkingDirectory(): Promise<void>;
    refreshWorkspace(): Promise<void> | void;
}


export interface RuntimeFileWorkflow {
    setWorkingDirectory(): Promise<void>;
    runScriptFile(): Promise<void>;
    openWorkspaceFile(): Promise<void>;
    saveWorkspaceFile(): Promise<void>;
}


export const createRuntimeFileWorkflow = function<
    Selection extends RuntimeFileSelection,
    Result extends RuntimeFileExecutionResult
>(
    bindings: RuntimeFileWorkflowBindings<Selection, Result>
): RuntimeFileWorkflow {
    const selectedPath = function(selection: Selection): string {
        return selection.canceled
            ? ""
            : String(selection.filePath || "");
    };

    const setWorkingDirectory = async function(): Promise<void> {
        const selection = await bindings.selectWorkingDirectory();
        const filePath = selectedPath(selection);

        if (!filePath) {
            bindings.selectionCanceled(selection);
            return;
        }

        const result = await bindings.execute({
            method: "runtime.set_working_directory",
            params: {
                path: filePath
            },
            source: "base-app.working-directory"
        });

        bindings.executionFinished(result);
        await bindings.refreshWorkingDirectory();
    };

    const runScriptFile = async function(): Promise<void> {
        const selection = await bindings.selectScriptFile();
        const filePath = selectedPath(selection);

        if (!filePath) {
            bindings.selectionCanceled(selection);
            return;
        }

        const result = await bindings.execute({
            method: "runtime.run_script_file",
            params: {
                path: filePath
            },
            source: "base-app.script-file"
        });

        bindings.executionFinished(result);

        if (result.status === "ready") {
            await bindings.refreshWorkspace();
        }
    };

    const openWorkspaceFile = async function(): Promise<void> {
        const selection = await bindings.selectWorkspaceOpenFile();
        const filePath = selectedPath(selection);

        if (!filePath) {
            bindings.selectionCanceled(selection);
            return;
        }

        const result = await bindings.execute({
            method: "runtime.load_workspace_file",
            params: {
                path: filePath
            },
            source: "base-app.workspace-open"
        });

        bindings.executionFinished(result);

        if (result.status === "ready") {
            await bindings.refreshWorkspace();
        }
    };

    const saveWorkspaceFile = async function(): Promise<void> {
        const selection = await bindings.selectWorkspaceSaveFile();
        const filePath = selectedPath(selection);

        if (!filePath) {
            bindings.selectionCanceled(selection);
            return;
        }

        const result = await bindings.execute({
            method: "runtime.save_workspace_file",
            params: {
                path: filePath
            },
            source: "base-app.workspace-save"
        });

        bindings.executionFinished(result);

        if (result.status === "ready") {
            await bindings.refreshWorkspace();
        }
    };

    return {
        setWorkingDirectory,
        runScriptFile,
        openWorkspaceFile,
        saveWorkspaceFile
    };
};
