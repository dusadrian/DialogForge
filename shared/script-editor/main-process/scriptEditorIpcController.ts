import {
    BrowserWindow,
    dialog
} from "electron";
import type {
    IpcMain,
    IpcMainEvent,
    IpcMainInvokeEvent,
    OpenDialogOptions
} from "electron";

import {
    createScriptFileResult,
    type ScriptFileResult
} from "../../shell-electron/filesystem/scriptFileResult";
import { createVisibleCommandRequest } from "../../runtime/commands/commandProtocol";
import {
    createRuntimeExtensionMethodRequest
} from "../../runtime/extensions/runtimeExtensionProtocol";
import type {
    RuntimeSessionManager,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    ScriptEditorCloseSaveCoordinator
} from "./scriptEditorCloseSaveCoordinator";
import type {
    ScriptFileSystemController
} from "./scriptFileSystemController";
import type {
    ScriptEditorWindowController
} from "./scriptEditorWindowController";
import {
    scriptEditorEventChannels,
    scriptEditorIpcChannels,
    type ScriptEditorDocumentState
} from "../scriptEditorIpc";


export interface ScriptEditorDirtyState {
    dirty: boolean;
    filePath: string;
    content: string;
}


export interface ScriptEditorIpcControllerOptions {
    ipcMain: IpcMain;
    windowController: ScriptEditorWindowController;
    fileSystemController: ScriptFileSystemController;
    closeSaveCoordinator: ScriptEditorCloseSaveCoordinator;
    getDocumentState(): ScriptEditorDocumentState;
    setDocumentState(state: ScriptEditorDocumentState): void;
    setDirtyState(state: ScriptEditorDirtyState): void;
    openScriptEditorWindow(): Promise<void>;
    insertCodeInScriptEditor(codeInput: unknown): Promise<{
        status: string;
        message: string;
    }>;
    openScriptFilePathInScriptEditor(filePath: string): Promise<ScriptFileResult>;
    runtimeSessionManager: Pick<RuntimeSessionManager, "executeRuntimeMethod">;
    ensureRuntimeReady(): Promise<boolean>;
    executeVisibleCommand(request: VisibleCommandRequest): Promise<TranscriptEvent[]>;
}


const createScriptOpenDialogOptions = function(): OpenDialogOptions {
    return {
        properties: ["openFile"],
        filters: [
            { name: "Scripts", extensions: ["R", "r", "Rmd", "qmd", "txt"] },
            { name: "All files", extensions: ["*"] }
        ]
    };
};


const createScriptSaveDialogOptions = function(
    suggested: string
) {
    return {
        defaultPath: suggested || undefined,
        filters: [
            { name: "R Script", extensions: ["R", "r"] },
            { name: "All files", extensions: ["*"] }
        ]
    };
};


const findScriptEditorParentWindow = function(
    event: IpcMainInvokeEvent | null,
    windowController: ScriptEditorWindowController
): BrowserWindow | null {
    if (event) {
        const eventWindow = BrowserWindow.fromWebContents(event.sender);

        if (eventWindow && !eventWindow.isDestroyed()) {
            return eventWindow;
        }
    }

    return windowController.getWindow() || BrowserWindow.getFocusedWindow();
};


const selectScriptFile = async function(
    parentWindow: BrowserWindow | null
): Promise<string> {
    const openOptions = createScriptOpenDialogOptions();
    const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, openOptions)
        : await dialog.showOpenDialog(openOptions);

    return result.canceled
        ? ""
        : String(result.filePaths && result.filePaths[0] ? result.filePaths[0] : "");
};


const createScriptSelectionCanceledResult = function(): ScriptFileResult {
    return createScriptFileResult({
        status: "canceled",
        canceled: true,
        message: "Script selection was canceled."
    });
};


const updateCleanScriptState = function(
    options: ScriptEditorIpcControllerOptions,
    result: ScriptFileResult
): void {
    options.setDocumentState({
        filePath: result.filePath,
        content: result.content,
        message: result.message
    });
    options.setDirtyState({
        dirty: false,
        filePath: result.filePath,
        content: result.content
    });
};


const normalizeScriptFragmentState = function(value: unknown): string {
    const objectValue = value && typeof value === "object"
        ? value as { state?: unknown }
        : {};
    const state = String(objectValue.state || value || "").toLowerCase();

    if (
        state === "complete" ||
        state === "incomplete" ||
        state === "invalid"
    ) {
        return state;
    }

    return "unknown";
};


export const createScriptEditorIpcController = function(
    options: ScriptEditorIpcControllerOptions
): void {
    options.ipcMain.handle(scriptEditorIpcChannels.checkFragment, async (
        _event: IpcMainInvokeEvent,
        input: { code?: string }
    ) => {
        const code = String(input?.code || "");

        if (!code.trim()) {
            return {
                ok: true,
                state: "complete"
            };
        }

        const result = await options.runtimeSessionManager.executeRuntimeMethod(
            createRuntimeExtensionMethodRequest({
                method: "check_completeness",
                params: {
                    code
                },
                source: "base-app.script-editor"
            })
        );

        return {
            ok: result.status === "ready",
            state: normalizeScriptFragmentState(result.value),
            message: result.message
        };
    });

    options.ipcMain.handle(scriptEditorIpcChannels.runCodeBatch, async (
        _event: IpcMainInvokeEvent,
        input: { chunks?: unknown[] }
    ) => {
        const chunks = Array.isArray(input?.chunks)
            ? input.chunks.map((chunk) => {
                return String(chunk || "").trim();
            }).filter((chunk) => {
                return chunk.length > 0;
            })
            : [];

        if (chunks.length === 0) {
            return {
                status: "empty",
                events: []
            };
        }

        const ready = await options.ensureRuntimeReady();

        if (!ready) {
            return {
                status: "unavailable",
                events: []
            };
        }

        const events: TranscriptEvent[] = [];

        for (const chunk of chunks) {
            const nextEvents = await options.executeVisibleCommand(
                createVisibleCommandRequest({
                    text: chunk,
                    source: "base-app.script-editor"
                })
            );

            events.push(...nextEvents);

            if (options.windowController.getWindow()) {
                options.windowController.send(
                    scriptEditorEventChannels.runtimeExecuted,
                    {
                        code: chunk,
                        origin: "runScriptCodeBatch"
                    }
                );
                options.windowController.send(
                    scriptEditorEventChannels.commandBoundary,
                    {
                        code: chunk
                    }
                );
            }
        }

        return {
            status: "submitted",
            events
        };
    });

    options.ipcMain.on(scriptEditorEventChannels.insertCode, (_event: IpcMainEvent, payload: {
        code?: string;
    }) => {
        const code = String(payload?.code || "");

        if (!code.trim()) {
            return;
        }

        void options.insertCodeInScriptEditor(code);
    });

    options.ipcMain.handle(scriptEditorIpcChannels.getDocument, async () => {
        return options.getDocumentState();
    });

    options.ipcMain.handle(scriptEditorIpcChannels.openEditor, async () => {
        await options.openScriptEditorWindow();

        const state = options.getDocumentState();

        return createScriptFileResult({
            status: "ready",
            filePath: state.filePath,
            content: state.content,
            message: state.message
        });
    });

    options.ipcMain.handle(scriptEditorIpcChannels.insertCode, async (
        _event: IpcMainInvokeEvent,
        input: { code?: string }
    ) => {
        return options.insertCodeInScriptEditor(input?.code || "");
    });

    options.ipcMain.handle(scriptEditorIpcChannels.openFile, async () => {
        const filePath = await selectScriptFile(null);

        if (!filePath) {
            return createScriptSelectionCanceledResult();
        }

        return options.fileSystemController.read(filePath);
    });

    options.ipcMain.on(scriptEditorEventChannels.updateDirtyState, (
        _event: IpcMainEvent,
        input: { dirty?: boolean; filePath?: string; content?: string }
    ) => {
        options.setDirtyState({
            dirty: input?.dirty === true,
            filePath: String(input?.filePath || ""),
            content: String(input?.content || "")
        });
    });

    options.ipcMain.on(scriptEditorEventChannels.rendererReady, (event: IpcMainEvent) => {
        options.windowController.markRendererReady(event.sender);
    });

    options.ipcMain.handle(scriptEditorIpcChannels.confirmSave, async (
        event: IpcMainInvokeEvent,
        input: { filePath?: string }
    ) => {
        const win = findScriptEditorParentWindow(event, options.windowController);
        const filePath = String(input?.filePath || "").trim();
        const detail = filePath
            ? `Save changes to ${filePath}?`
            : "Save changes to this untitled script?";
        const result = win
            ? await dialog.showMessageBox(win, {
                type: "warning",
                buttons: ["Save", "Don't Save", "Cancel"],
                defaultId: 0,
                cancelId: 2,
                message: "Save changes before closing the script editor?",
                detail
            })
            : await dialog.showMessageBox({
                type: "warning",
                buttons: ["Save", "Don't Save", "Cancel"],
                defaultId: 0,
                cancelId: 2,
                message: "Save changes before closing the script editor?",
                detail
            });

        if (result.response === 0) {
            return { action: "save" };
        }
        if (result.response === 1) {
            return { action: "dont-save" };
        }

        return { action: "cancel" };
    });

    options.ipcMain.on(scriptEditorEventChannels.closeSaveResult, (
        _event: IpcMainEvent,
        input: { requestId?: string; ok?: boolean }
    ) => {
        options.closeSaveCoordinator.resolve(
            input?.requestId,
            input?.ok === true
        );
    });

    options.ipcMain.handle(scriptEditorIpcChannels.openFilePath, async (
        _event: IpcMainInvokeEvent,
        filePathInput: unknown
    ) => {
        return options.fileSystemController.read(filePathInput);
    });

    options.ipcMain.handle(scriptEditorIpcChannels.listDirectory, async (
        _event: IpcMainInvokeEvent,
        input: { dirPath?: string }
    ) => {
        return options.fileSystemController.listDirectory(input?.dirPath);
    });

    options.ipcMain.handle(scriptEditorIpcChannels.openFileInEditor, async (
        event: IpcMainInvokeEvent
    ) => {
        const parentWindow = findScriptEditorParentWindow(event, options.windowController);
        const filePath = await selectScriptFile(parentWindow);

        if (!filePath) {
            return createScriptSelectionCanceledResult();
        }

        try {
            return await options.openScriptFilePathInScriptEditor(filePath);
        } catch (error) {
            return createScriptFileResult({
                status: "failed",
                filePath,
                message: error instanceof Error ? error.message : String(error)
            });
        }
    });

    options.ipcMain.handle(scriptEditorIpcChannels.openFilePathInEditor, async (
        _event: IpcMainInvokeEvent,
        filePathInput: unknown
    ) => {
        const filePath = String(filePathInput || "");

        if (!filePath) {
            return createScriptFileResult({
                status: "failed",
                message: "Script file path is required."
            });
        }

        try {
            return await options.openScriptFilePathInScriptEditor(filePath);
        } catch (error) {
            return createScriptFileResult({
                status: "failed",
                filePath,
                message: error instanceof Error ? error.message : String(error)
            });
        }
    });

    options.ipcMain.handle(scriptEditorIpcChannels.saveFile, async (
        _event: IpcMainInvokeEvent,
        input: { filePath?: string; content?: string }
    ) => {
        const result = options.fileSystemController.write(
            input?.filePath,
            input?.content
        );

        if (result.status === "saved") {
            updateCleanScriptState(options, result);
        }

        return result;
    });

    options.ipcMain.handle(scriptEditorIpcChannels.saveFileAs, async (
        _event: IpcMainInvokeEvent,
        input: { filePath?: string; content?: string }
    ) => {
        const content = String(input?.content || "");
        const suggested = String(input?.filePath || "");
        const result = await dialog.showSaveDialog(
            createScriptSaveDialogOptions(suggested)
        );
        const filePath = String(result.filePath || "");

        if (result.canceled || !filePath) {
            return createScriptFileResult({
                status: "canceled",
                canceled: true,
                filePath: suggested,
                content,
                message: "Script save was canceled."
            });
        }

        const saveResult = options.fileSystemController.write(filePath, content);

        if (saveResult.status === "saved") {
            updateCleanScriptState(options, saveResult);
        }

        return saveResult;
    });
};
