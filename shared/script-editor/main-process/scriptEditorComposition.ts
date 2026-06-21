import * as path from "path";
import {
    dialog
} from "electron";
import type {
    BrowserWindow,
    IpcMain
} from "electron";

import type {
    RuntimeSessionManager,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../runtime/provider-contract/runtimeProvider";
import {
    createScriptFileResult,
    type ScriptFileResult
} from "../../shell-electron/filesystem/scriptFileResult";
import {
    createScriptEditorPendingWorkQueue
} from "./scriptEditorPendingWorkQueue";
import {
    createScriptFileSystemController
} from "./scriptFileSystemController";
import {
    createScriptEditorCloseSaveCoordinator
} from "./scriptEditorCloseSaveCoordinator";
import {
    createScriptEditorWindowController,
    type ScriptEditorWindowController
} from "./scriptEditorWindowController";
import {
    createScriptEditorWindowFactory
} from "./scriptEditorWindowFactory";
import {
    createScriptEditorIpcController
} from "./scriptEditorIpcController";
import {
    scriptEditorEventChannels
} from "../scriptEditorIpc";


export interface ScriptEditorCompositionOptions {
    ipcMain: IpcMain;
    rootDir: string;
    productId: string;
    settingsPath: string;
    title: string;
    nativeWindowIconPath?: string;
    pagePath: string;
    showOnOpen: boolean;
    getZoomFactor(): number;
    readTerminalSettings(): Record<string, unknown>;
    locale: string;
    runtimeSessionManager: Pick<
        RuntimeSessionManager,
        "executeRuntimeMethod"
    >;
    ensureRuntimeReady(): Promise<boolean>;
    executeVisibleCommand(
        request: VisibleCommandRequest
    ): Promise<TranscriptEvent[]>;
}


export interface ScriptEditorComposition {
    windowController: ScriptEditorWindowController;
    openWindow(): Promise<void>;
    insertCode(codeInput: unknown): Promise<{
        status: string;
        message: string;
    }>;
    openFilePath(filePath: string): Promise<ScriptFileResult>;
    isDirty(): boolean;
    isRendererReady(): boolean;
    requestSaveForClose(win: BrowserWindow): Promise<boolean>;
    saveDirtyContent(win: BrowserWindow): Promise<boolean>;
    allowClose(): void;
}


export const createScriptEditorComposition = function(
    options: ScriptEditorCompositionOptions
): ScriptEditorComposition {
    let documentState = {
        filePath: "",
        content: "",
        message: "No script loaded."
    };
    let dirtyState = {
        dirty: false,
        filePath: "",
        content: ""
    };
    let closeBypass = false;
    let closeConfirming = false;
    const pendingWork = createScriptEditorPendingWorkQueue();
    const closeSaveCoordinator = createScriptEditorCloseSaveCoordinator();
    const fileSystemController = createScriptFileSystemController();
    const createWindow = createScriptEditorWindowFactory({
        rootDir: options.rootDir,
        productId: options.productId,
        settingsPath: options.settingsPath,
        title: options.title,
        nativeWindowIconPath: options.nativeWindowIconPath
    });

    let windowController: ScriptEditorWindowController;

    const saveDirtyContent = async function(
        win: BrowserWindow
    ): Promise<boolean> {
        const content = String(dirtyState.content || "");
        let filePath = String(dirtyState.filePath || "").trim();

        if (!filePath) {
            const result = await dialog.showSaveDialog(win, {
                filters: [
                    { name: "R Script", extensions: ["R", "r"] },
                    { name: "All files", extensions: ["*"] }
                ]
            });

            if (result.canceled || !result.filePath) {
                return false;
            }

            filePath = result.filePath;
        }

        const result = fileSystemController.write(filePath, content);

        if (result.status === "saved") {
            documentState = {
                filePath: result.filePath,
                content: result.content,
                message: result.message
            };
            dirtyState = {
                dirty: false,
                filePath: result.filePath,
                content: result.content
            };

            return true;
        }

        await dialog.showMessageBox(win, {
            type: "error",
            buttons: ["OK"],
            defaultId: 0,
            message: "Script file could not be saved.",
            detail: result.message
        });

        return false;
    };

    const requestSaveForClose = async function(
        win: BrowserWindow
    ): Promise<boolean> {
        return closeSaveCoordinator.request((requestId) => {
            win.webContents.send(scriptEditorEventChannels.requestSaveForClose, {
                requestId
            });
        });
    };

    const confirmClose = async function(
        win: BrowserWindow | null
    ): Promise<void> {
        if (!win || win.isDestroyed() || closeConfirming) {
            return;
        }

        closeConfirming = true;
        try {
            const saved = pendingWork.isRendererReady()
                ? await requestSaveForClose(win)
                : await saveDirtyContent(win);

            if (!saved) {
                return;
            }

            closeBypass = true;
            win.close();
        }
        finally {
            closeConfirming = false;
        }
    };

    windowController = createScriptEditorWindowController({
        createWindow,
        pagePath: options.pagePath,
        pendingWork,
        showOnOpen: options.showOnOpen,
        getZoomFactor: options.getZoomFactor,
        createInitPayload: function(): Record<string, unknown> {
            return {
                terminalSettings: {
                    ...options.readTerminalSettings()
                },
                appPath: options.rootDir,
                languageNS: options.locale
            };
        },
        shouldPreventClose: function(): boolean {
            return !closeBypass && dirtyState.dirty;
        },
        confirmClose: function(win): void {
            void confirmClose(win);
        },
        onClosed: function(): void {
            dirtyState = {
                dirty: false,
                filePath: "",
                content: ""
            };
            closeBypass = false;
            closeConfirming = false;
        }
    });

    const openWindow = async function(): Promise<void> {
        await windowController.open();
    };

    const insertCode = async function(codeInput: unknown): Promise<{
        status: string;
        message: string;
    }> {
        const code = String(codeInput || "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");

        if (!code.trim()) {
            return {
                status: "empty",
                message: "No script code was provided."
            };
        }

        windowController.enqueueInsertion(code);
        await openWindow();

        return {
            status: "submitted",
            message: "Code was sent to the script editor."
        };
    };

    const openFilePath = async function(
        filePath: string
    ): Promise<ScriptFileResult> {
        const result = fileSystemController.read(filePath);

        if (result.status !== "ready") {
            return result;
        }

        documentState = {
            filePath: result.filePath,
            content: result.content,
            message: result.message
        };

        if (!dirtyState.dirty) {
            dirtyState = {
                dirty: false,
                filePath: documentState.filePath,
                content: documentState.content
            };
        }

        windowController.enqueueOpenFile(documentState);
        await openWindow();

        return createScriptFileResult({
            status: "ready",
            filePath: documentState.filePath,
            content: documentState.content,
            message: documentState.message
        });
    };

    createScriptEditorIpcController({
        ipcMain: options.ipcMain,
        windowController,
        fileSystemController,
        closeSaveCoordinator,
        getDocumentState: function() {
            return documentState;
        },
        setDocumentState: function(state): void {
            documentState = {
                filePath: state.filePath,
                content: state.content,
                message: state.message
            };
        },
        setDirtyState: function(state): void {
            dirtyState = {
                dirty: state.dirty,
                filePath: state.filePath,
                content: state.content
            };
        },
        openScriptEditorWindow: openWindow,
        insertCodeInScriptEditor: insertCode,
        openScriptFilePathInScriptEditor: openFilePath,
        runtimeSessionManager: options.runtimeSessionManager,
        ensureRuntimeReady: options.ensureRuntimeReady,
        executeVisibleCommand: options.executeVisibleCommand
    });

    return {
        windowController,
        openWindow,
        insertCode,
        openFilePath,
        isDirty: function(): boolean {
            return dirtyState.dirty;
        },
        isRendererReady: pendingWork.isRendererReady,
        requestSaveForClose,
        saveDirtyContent,
        allowClose: function(): void {
            closeBypass = true;
        }
    };
};
