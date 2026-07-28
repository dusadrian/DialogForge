export interface RuntimeFileSelection {
    canceled: boolean;
    filePath?: string;
}


export interface RuntimeFileExecutionResult {
    status: string;
}

export type RuntimeFileOperation =
    | "set-working-directory"
    | "run-script"
    | "open-workspace"
    | "save-workspace";


export interface RuntimeFileExecutionContext<
    Selection extends RuntimeFileSelection
> {
    operation: RuntimeFileOperation;
    selection: Selection;
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
    executionFinished(
        result: Result,
        context: RuntimeFileExecutionContext<Selection>
    ): Promise<void> | void;
    refreshWorkingDirectory?(): Promise<void>;
    refreshWorkspace?(): Promise<void> | void;
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

        await bindings.executionFinished(result, {
            operation: "set-working-directory",
            selection
        });
        await bindings.refreshWorkingDirectory?.();
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

        await bindings.executionFinished(result, {
            operation: "run-script",
            selection
        });

        if (result.status === "ready") {
            await bindings.refreshWorkspace?.();
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

        await bindings.executionFinished(result, {
            operation: "open-workspace",
            selection
        });

        if (result.status === "ready") {
            await bindings.refreshWorkspace?.();
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

        await bindings.executionFinished(result, {
            operation: "save-workspace",
            selection
        });

        if (result.status === "ready") {
            await bindings.refreshWorkspace?.();
        }
    };

    return {
        setWorkingDirectory,
        runScriptFile,
        openWorkspaceFile,
        saveWorkspaceFile
    };
};
